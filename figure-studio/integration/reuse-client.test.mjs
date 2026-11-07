import test from 'node:test';
import assert from 'node:assert/strict';
import {BRIDGE_PROTOCOL,openSource,closeSourceSessions} from './bridge-client.mjs';

function environment(){
 const listeners=new Set(),opened=[],sent=[];
 const windowRef={location:{origin:'http://localhost:8080',href:'http://localhost:8080/'},
  open(url,name){const popup={closed:false,focusCount:0,focus(){this.focusCount++;},postMessage(data,origin){sent.push({popup:this,data,origin});}};opened.push({url:new URL(url),name,popup});return popup;},
  addEventListener(type,fn){if(type==='message')listeners.add(fn);},removeEventListener(type,fn){if(type==='message')listeners.delete(fn);}};
 const envelope=(type,extra={},index=opened.length-1)=>{const item=opened[index];return {origin:item.url.origin,source:item.popup,data:{protocol:BRIDGE_PROTOCOL,nonce:new URLSearchParams(item.url.hash.slice(1)).get('figureBridge'),app:'plot',hostId:'host-1',type,...extra}};};
 const emit=(type,extra={},index)=>Promise.all([...listeners].map(fn=>fn(envelope(type,extra,index))));
 const load=()=>sent.filter(m=>m.data.type==='load').at(-1)?.data;
 const ready=()=>emit('ready',{capabilities:['reuse-v1']});
 const loaded=()=>{const r=load();return emit('loaded',{requestId:r.requestId,panelId:r.panelId});};
 const open=(panelId='a',options={})=>openSource({app:'plot',panelId,editKey:`book/${panelId}/v1`,project:new Blob([panelId]),sourceName:panelId+'.plotproject',windowRef,...options});
 return{windowRef,listeners,opened,sent,emit,load,ready,loaded,open};
}
const result=(r,extra={})=>({requestId:r.requestId,panelId:r.panelId,revision:1,project:new Blob(['edited']),preview:new Blob(['<svg/>'],{type:'image/svg+xml'}),...extra});

test('same panel reuses one live tab and waits for fresh target acknowledgement',async()=>{
 const env=environment();const first=env.open();
 try{await env.ready();await env.loaded();const before=env.sent.length,second=env.open();
  assert.equal(env.opened.length,1);assert.equal(second.window,first.window);assert.equal(first.window.focusCount,1);assert.equal(env.sent.length,before+1);let resolved=false;second.ready.then(()=>resolved=true);await Promise.resolve();assert.equal(resolved,false);await env.loaded();assert.deepEqual(await second.ready,{connected:true});
 }finally{first.close();}assert.equal(env.listeners.size,0);
});

test('different panel uses load messages on the retained tab and routes only its result',async()=>{
 const env=environment(),a=[],b=[];const first=env.open('a',{onResult:r=>a.push(r)});
 try{await env.ready();await env.loaded();const old=env.load(),second=env.open('b',{onResult:r=>b.push(r)}),next=env.load();
  assert.equal(env.opened.length,1);assert.notEqual(next.requestId,old.requestId);assert.equal(next.panelId,'b');assert.equal(await next.project.text(),'b');await env.loaded();assert.deepEqual(await second.ready,{connected:true});
  await env.emit('result',result(old));await env.emit('result',result(next));assert.equal(a.length,0);assert.equal(b.length,1);assert.equal(env.sent.at(-1).data.requestId,next.requestId);
 }finally{first.close();}
});

test('blocked target preserves original callback and allows retry after applying',async()=>{
 const env=environment(),a=[],b=[],states=[];const first=env.open('a',{onResult:r=>{a.push(r);return{editKey:'book/a/v2'};}});
 try{await env.ready();await env.loaded();const old=env.load(),second=env.open('b',{onResult:r=>b.push(r),onStatus:s=>states.push(s.state)}),next=env.load();
  await env.emit('switch-blocked',{requestId:next.requestId,panelId:'b',message:'Apply first'});assert.deepEqual(await second.ready,{connected:false,reason:'switch-blocked'});assert.ok(states.includes('blocked'));
  await env.emit('result',result(old));assert.equal(a.length,1);assert.equal(b.length,0);assert.equal(env.sent.at(-1).data.editKey,'book/a/v2');
  const count=env.sent.length;env.open('a',{editKey:'book/a/v2'});assert.equal(env.sent.length,count+1);await env.loaded();
  const retry=env.open('b');await env.loaded();assert.deepEqual(await retry.ready,{connected:true});assert.equal(env.opened.length,1);
 }finally{first.close();}
});

test('reopening the same panel retires old results and refreshes callbacks after target confirmation',async()=>{
 const env=environment(),old=[],fresh=[];const first=env.open('a',{onResult:r=>old.push(r)});
 try{await env.ready();await env.loaded();const active=env.load();env.open('a',{onResult:r=>fresh.push(r)});await env.loaded();await env.emit('result',result(active));assert.equal(fresh.length,0);await env.emit('result',result(env.load()));assert.equal(old.length,0);assert.equal(fresh.length,1);assert.equal(env.sent.filter(x=>x.data.type==='load').length,2);
 }finally{first.close();}
});

test('reloaded host receives latest accepted project and rejects retired host messages',async()=>{
 const env=environment(),results=[];const first=env.open('a',{onResult:r=>results.push(r)});
 try{await env.ready();await env.loaded();const active=env.load();await env.emit('result',result(active));await env.emit('ready',{hostId:'host-2',capabilities:['reuse-v1']});const reload=env.load();
  assert.equal(reload.reconnect,true);assert.equal(reload.hostId,'host-2');assert.equal(await reload.project.text(),'edited');const count=env.sent.length;
  await env.emit('ready',{hostId:'host-1',capabilities:['reuse-v1']});assert.equal(env.sent.length,count);
  await env.emit('result',result(active,{revision:2}));assert.equal(results.length,1);
  await env.emit('loaded',{hostId:'host-2',requestId:reload.requestId,panelId:'a'});await env.emit('result',result(reload,{hostId:'host-2'}));assert.equal(results.length,2);assert.equal(env.sent.at(-1).data.hostId,'host-2');
 }finally{first.close();}
});

test('a failed replacement cannot focus the previous panel as if still loaded',async()=>{
 const env=environment();const first=env.open('a');
 try{await env.ready();await env.loaded();env.open('b');const failed=env.load();await env.emit('error',{requestId:failed.requestId,panelId:'b',code:'load-failed',loaded:false,message:'Invalid project'});
  env.open('a');assert.equal(env.sent.filter(x=>x.data.type==='load').length,3);assert.equal(env.load().panelId,'a');
 }finally{first.close();}
});

test('an ongoing target load is not overwritten by another double-click',async()=>{
 const env=environment();const first=env.open('a');
 try{await env.ready();await env.loaded();env.open('b');const count=env.sent.length,blocked=env.open('c');assert.deepEqual(await blocked.ready,{connected:false,reason:'busy'});assert.equal(env.sent.length,count);assert.equal(env.load().panelId,'b');
 }finally{first.close();}
});

test('failed current baseline restore retries loading, while a stale failure cannot invalidate its replacement',async()=>{
 const env=environment(),first=env.open('a');
 try{
  await env.ready();await env.loaded();const original=env.load();
  await env.emit('error',{requestId:original.requestId,panelId:'a',code:'load-failed',loaded:false,message:'Baseline restore failed'});
  const retry=env.open('a');assert.equal(env.sent.filter(x=>x.data.type==='load').length,2);assert.notEqual(env.load().requestId,original.requestId);
  await env.loaded();assert.deepEqual(await retry.ready,{connected:true});
  const current=env.load(),count=env.sent.length;
  await env.emit('error',{requestId:original.requestId,panelId:'a',code:'load-failed',loaded:false,message:'Late failure'});
  const reopened=env.open('a');assert.equal(env.sent.length,count+1);assert.notEqual(env.load().requestId,current.requestId);await env.loaded();assert.deepEqual(await reopened.ready,{connected:true});
 }finally{first.close();}
});

test('closed editor opens a new tab and tears down its old listeners',async()=>{
 const env=environment(),first=env.open();await env.ready();await env.loaded();first.window.closed=true;
 const second=env.open();try{assert.equal(env.opened.length,2);assert.notEqual(second.window,first.window);assert.equal(env.listeners.size,1);await env.ready();await env.loaded();assert.deepEqual(await second.ready,{connected:true});}finally{second.close();}
});

test('bulk teardown removes all retained listeners without closing source tabs',async()=>{
 const env=environment(),a=env.open();const b=env.open('b',{url:'https://murajun620-crypto.github.io/other/'});
 closeSourceSessions({windowRef:env.windowRef});assert.equal(env.listeners.size,0);assert.equal(a.window.closed,false);assert.equal(b.window.closed,false);assert.deepEqual(await a.ready,{connected:false,reason:'closed'});assert.deepEqual(await b.ready,{connected:false,reason:'closed'});
});

test('exact native detach evicts its pooled bridge without closing the source and rejects forged or stale identities',async()=>{
 const env=environment(),states=[],first=env.open('a',{onStatus:value=>states.push(value.state)});let fresh;
 try{
  await env.ready();await env.loaded();const original=env.load(),identity={requestId:original.requestId,panelId:'a',editKey:'book/a/v1'};
  for(const patch of [{nonce:'foreign'},{hostId:'foreign'},{app:'mifito'},{requestId:'old-request'},{panelId:'other'},{editKey:'book/a/old'}])await env.emit('detached',{...identity,...patch});
  assert.equal(env.listeners.size,1);assert.equal(states.includes('detached'),false);
  const before=env.sent.length;env.open('a');assert.equal(env.sent.length,before+1);assert.equal(env.opened.length,1);await env.loaded();const next=env.load();
  await env.emit('detached',{requestId:next.requestId,panelId:'a',editKey:'book/a/v1'});assert.equal(env.listeners.size,0);assert.equal(first.window.closed,false);
  fresh=env.open('a');assert.equal(env.listeners.size,1);assert.equal(env.opened.length,2);
  await env.ready();assert.notEqual(env.load().requestId,original.requestId);await env.loaded();assert.deepEqual(await fresh.ready,{connected:true});
  await env.emit('detached',identity,0);assert.equal(env.listeners.size,1);assert.equal(fresh.window.closed,false);
 }finally{first.close();fresh?.close();}
});

test('legacy adapter stays usable and refuses destructive replacement',async()=>{
 const env=environment(),first=env.open();try{await env.emit('ready');await env.emit('loaded');const next=env.open('b');assert.deepEqual(await next.ready,{connected:false,reason:'adapter-outdated'});assert.equal(env.opened.length,1);assert.equal(env.sent.filter(m=>m.data.type==='load').length,1);}finally{first.close();}
});
