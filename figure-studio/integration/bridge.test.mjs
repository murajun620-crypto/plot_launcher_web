import test from 'node:test';
import assert from 'node:assert/strict';
import {BRIDGE_PROTOCOL,openSource,isBridgeMessage} from './bridge-client.mjs';
import {getFigureBridgeContext} from './bridge-host.mjs';

function environment() {
  const listeners = new Set(), sent = [];
  const popup = {closed:false,postMessage(data,origin){sent.push({data,origin});}};
  const windowRef = {
    location:{origin:'http://localhost:8080',href:'http://localhost:8080/index.html'},
    open(url){this.opened = new URL(url);return popup;},
    addEventListener(type,fn){if(type==='message')listeners.add(fn);},
    removeEventListener(type,fn){listeners.delete(fn);}
  };
  const emit = (type,extra={},eventExtra={}) => Promise.all([...listeners].map(fn => fn({
    origin:'https://murajun620-crypto.github.io',source:popup,
    data:{protocol:BRIDGE_PROTOCOL,app:'plot',nonce:new URLSearchParams(windowRef.opened.hash.slice(1)).get('figureBridge'),type,...extra},
    ...eventExtra
  })));
  return {windowRef,popup,sent,emit,listeners};
}

test('message identity requires exact origin, popup, protocol, nonce and app',()=>{
  const popup = {}, context = {origin:'https://example.test',popup,nonce:'nonce',app:'plot'};
  const valid = {origin:context.origin,source:popup,data:{protocol:BRIDGE_PROTOCOL,nonce:'nonce',app:'plot',type:'ready'}};
  assert.equal(isBridgeMessage(valid,context),true);
  for (const changed of [{origin:'https://evil.test'},{source:{}},{data:{...valid.data,nonce:'other'}},{data:{...valid.data,app:'mifito'}},{data:{...valid.data,protocol:'other'}}]) {
    assert.equal(isBridgeMessage({...valid,...changed},context),false);
  }
});

test('host accepts valid HTTPS / local origin only',()=>{
  const hash = origin => `#figureBridge=12345678-1234-1234-1234-123456789012&figureOrigin=${encodeURIComponent(origin)}`;
  assert.deepEqual(getFigureBridgeContext({hash:hash('http://localhost:8080')}),{nonce:'12345678-1234-1234-1234-123456789012',origin:'http://localhost:8080'});
  assert.equal(getFigureBridgeContext({hash:hash('http://remote.example')}),null);
  assert.equal(getFigureBridgeContext({hash:hash('https://example.test/path')}),null);
  assert.equal(getFigureBridgeContext({hash:hash('null')}),null);
  assert.equal(getFigureBridgeContext({hash:'#figureBridge=short'}),null);
});

test('handshake sends attached project once and accepts a matching result once',async()=>{
  const env = environment(), statuses = [], results = [];
  const session = openSource({app:'plot',project:new Blob(['source']),sourceName:'one.plotproject',panelId:'a',windowRef:env.windowRef,onStatus:s=>statuses.push(s.state),onResult:r=>results.push(r)});
  try {
    await env.emit('ready',{}, {origin:'https://evil.test'});
    assert.equal(env.sent.length,0);
    await env.emit('ready'); await env.emit('ready');
    assert.equal(env.sent.length,1);
    assert.equal(env.sent[0].data.type,'load');
    assert.equal(env.sent[0].data.panelId,'a');
    assert.equal(await env.sent[0].data.project.text(),'source');
    await env.emit('loaded');
    assert.deepEqual(await session.ready,{connected:true});
    const result = {panelId:'a',revision:1,project:new Blob(['updated']),preview:new Blob(['<svg/>'],{type:'image/svg+xml'})};
    await env.emit('result',{...result,panelId:'other'});
    assert.equal(results.length,0);
    await env.emit('result',result); await env.emit('result',result);
    assert.equal(results.length,1);
    assert.equal(env.sent.at(-1).data.type,'accepted');
    assert.ok(statuses.includes('updated'));
  } finally {session.close();}
  assert.equal(env.listeners.size,0);
});

test('failed application rejects result and allows retry',async()=>{
  const env = environment();let calls=0;
  const session = openSource({app:'plot',project:new Blob(['source']),panelId:'a',windowRef:env.windowRef,onResult(){if(!calls++)throw new Error('panel removed');}});
  try {
    await env.emit('ready');
    const result={panelId:'a',revision:1,project:new Blob(['x']),preview:new Blob(['<svg/>'],{type:'image/svg+xml'})};
    await env.emit('result',result);
    assert.equal(env.sent.at(-1).data.type,'rejected');
    await env.emit('result',{...result,revision:2});
    assert.equal(env.sent.at(-1).data.type,'accepted');
    await env.emit('result',{...result,revision:3,preview:new Blob(['html'],{type:'text/html'})});
    assert.equal(env.sent.at(-1).data.type,'rejected');
  } finally {session.close();}
});

test('unmodified source app reports unavailable, then can connect late',async()=>{
  const env=environment(),states=[];
  const session=openSource({app:'plot',project:new Blob(['source']),panelId:'a',windowRef:env.windowRef,timeoutMs:5,onStatus:s=>states.push(s.state)});
  try {
    assert.deepEqual(await session.ready,{connected:false,reason:'adapter-unavailable'});
    assert.ok(states.includes('unavailable'));
    await env.emit('ready');await env.emit('loaded');
    assert.ok(states.includes('ready'));
  } finally {session.close();}
});

test('editor reload reconnects without accepting a previous page result',async()=>{
  const env=environment(),results=[];
  const session=openSource({app:'plot',project:new Blob(['source']),panelId:'a',windowRef:env.windowRef,onResult:r=>results.push(r)});
  try {
    await env.emit('ready',{hostId:'first'});
    assert.equal(env.sent.at(-1).data.reconnect,false);
    const result={hostId:'first',panelId:'a',revision:1,project:new Blob(['latest']),preview:new Blob(['<svg/>'],{type:'image/svg+xml'})};
    await env.emit('result',result);
    await env.emit('ready',{hostId:'second'});
    assert.equal(env.sent.at(-1).data.reconnect,true);
    assert.equal(await env.sent.at(-1).data.project.text(),'latest');
    await env.emit('result',{...result,revision:2});
    assert.equal(results.length,1);
    await env.emit('result',{...result,hostId:'second'});
    assert.equal(results.length,2);
  } finally {session.close();}
});
