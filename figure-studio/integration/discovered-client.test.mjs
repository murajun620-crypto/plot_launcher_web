import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as nextTask,setTimeout as delay} from 'node:timers/promises';
import {BRIDGE_PROTOCOL,openSource,setupSourceDiscovery,closeSourceSessions} from './bridge-client.mjs';
import {registerEditor} from './editor-discovery.mjs';

const ORIGIN='https://example.test',EDITOR=ORIGIN+'/mifito/';
const flush=async()=>{await nextTask();for(let i=0;i<50;i++)await Promise.resolve();};
const waitFor=async(predicate,message)=>{for(let i=0;i<400&&!predicate();i++)await delay(5);assert.ok(predicate(),message);await flush();};
function environment(){
 const channels=new Set(),history=[],opened=[],windows=[],hosts=[],intervals=new Map();let count=0,time=Date.now(),drop=()=>false;
 const originalInterval=globalThis.setInterval,originalClearInterval=globalThis.clearInterval,originalNow=Date.now;
 globalThis.setInterval=(fn,ms)=>{const key=++count;intervals.set(key,{fn,ms});return key;};globalThis.clearInterval=key=>intervals.delete(key);Date.now=()=>time;
 class Channel{
  constructor(name){this.name=name;this.listeners=new Set();channels.add(this);}
  addEventListener(type,fn){if(type==='message')this.listeners.add(fn);}
  removeEventListener(type,fn){if(type==='message')this.listeners.delete(fn);}
  postMessage(data){history.push(structuredClone(data));if(drop(data))return;for(const other of channels)if(other!==this&&other.name===this.name)queueMicrotask(()=>other.dispatch(structuredClone(data)));}
  dispatch(data){if(channels.has(this))for(const fn of [...this.listeners])fn({data});}
  close(){channels.delete(this);}
 }
 function windowAt(url=ORIGIN+'/studio/',storage=new Map()){
  const events=new Map(),location=new URL(url),win={location:{href:location.href,origin:location.origin},BroadcastChannel:Channel,Date:{now:()=>time},sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval,setTimeout,clearTimeout,
   addEventListener(type,fn){if(!events.has(type))events.set(type,new Set());events.get(type).add(fn);},removeEventListener(type,fn){events.get(type)?.delete(fn);},focus(){},open(url,name){opened.push({url,name});return null;},emit(type,event){for(const fn of events.get(type)||[])fn(event);}};windows.push(win);return win;
 }
 function editor(){
  let connection=null,active=null,connectCount=0,cleanups=0,hostRevision=0;const loads=[],receipts=[];
  const reply=(type,extra={})=>connection.parent.postMessage({protocol:BRIDGE_PROTOCOL,nonce:connection.context.nonce,app:'mifito',hostId:'engine-one',type,...extra},ORIGIN);
  const loaded=()=>{if(active)reply('loaded',{requestId:active.requestId,panelId:active.panelId});};
  const host=registerEditor({app:'mifito',windowRef:windowAt(EDITOR+'?ordinary=1'),getState:()=>({editKey:active?.editKey}),onConnect(next){
   connection=next;connectCount++;const stop=next.listen(event=>{
    const message=event.data;if(message?.protocol!==BRIDGE_PROTOCOL||message.app!=='mifito'||message.nonce!==next.context.nonce)return;
    if(message.type==='ping'){reply('ready',{capabilities:['reuse-v1','batch-v1']});loaded();}
    else if(message.type==='load'){if(active?.requestId!==message.requestId){active=message;loads.push(message);hostRevision=0;}loaded();}
    else if(message.type==='accepted'||message.type==='rejected')receipts.push(message);
   });reply('ready',{capabilities:['reuse-v1','batch-v1']});return()=>{cleanups++;stop();};
  }});hosts.push(host);
  return {loads,receipts,get connection(){return connection;},get connectCount(){return connectCount;},get cleanups(){return cleanups;},reply,loaded,
   result(extra={}){reply('result',{requestId:active.requestId,panelId:active.panelId,revision:++hostRevision,project:new Blob(['updated']),sourceName:'images.mifito',preview:new Blob(['<svg/>'],{type:'image/svg+xml'}),...extra});}};
 }
 const open=(windowRef,options={})=>openSource({app:'mifito',url:EDITOR,panelId:'panel-a',editKey:'project/image-a',imageId:'image-a',project:new Blob(['source']),sourceName:'images.mifito',windowRef,...options});
 return {windowAt,editor,history,opened,open,setDrop(fn){drop=fn;},inject(packet){for(const channel of channels)queueMicrotask(()=>channel.dispatch(structuredClone(packet)));},advance(ms){time+=ms;},poll(){for(const {fn,ms}of [...intervals.values()])if(ms===1200)fn();},close(){for(const win of windows){closeSourceSessions({windowRef:win});setupSourceDiscovery({windowRef:win})?.close();}for(const host of hosts)host?.close();globalThis.setInterval=originalInterval;globalThis.clearInterval=originalClearInterval;Date.now=originalNow;}};
}
const image=(imageId='image-a')=>({imageId,name:imageId+'.png',fingerprint:'a'.repeat(64),preview:new Blob(['<svg/>'],{type:'image/svg+xml'})});

test('normal editor discovery opens no new tab and routes single and batch results with exact callbacks',async()=>{
 const env=environment();try{
  const win=env.windowAt(),editor=env.editor(),old=[],fresh=[];setupSourceDiscovery({windowRef:win});await flush();
  const first=env.open(win,{onResult:r=>old.push(r)});assert.deepEqual(await first.ready,{connected:true});assert.equal(env.opened.length,0);assert.equal(editor.loads.length,1);assert.equal(editor.loads[0].imageId,'image-a');
  const second=env.open(win,{onResult:r=>{fresh.push(r);return {editKey:'project/image-a/v2',imageId:'image-a',message:'Applied',summary:{updated:1,added:1,unchanged:0}};}});assert.equal(second.window,first.window);await second.ready;
  editor.result({image:{projectId:'project-a',imageId:'image-a',name:'a.png',fingerprint:'a'.repeat(64)}});await flush();assert.equal(old.length,0);assert.equal(fresh.length,1);assert.equal(fresh[0].panelId,'panel-a');assert.equal(fresh[0].app,'mifito');assert.equal(await fresh[0].project.text(),'updated');
  editor.result({batch:{projectId:'project-a',images:[image(),{...image('image-b'),unchanged:true}]}});await flush();assert.equal(fresh.length,2);assert.equal(fresh[1].batch.images.length,2);assert.equal(fresh[1].batch.images[1].unchanged,true);assert.equal(fresh[1].preview,undefined);
  assert.equal(editor.receipts.length,2);assert.equal(editor.receipts[1].type,'accepted');assert.deepEqual(editor.receipts[1].summary,{updated:1,added:1,unchanged:0});assert.equal(editor.receipts[1].editKey,'project/image-a/v2');assert.equal(env.opened.length,0);
 }finally{env.close();}
});

test('reloaded Studio document with the same tab storage reclaims the existing normal editor',async()=>{
 const env=environment();try{
  const storage=new Map(),oldWindow=env.windowAt(undefined,storage),editor=env.editor();setupSourceDiscovery({windowRef:oldWindow});await flush();
  const old=env.open(oldWindow);await old.ready;
  const nextWindow=env.windowAt(undefined,storage);setupSourceDiscovery({windowRef:nextWindow});await flush();
  const fresh=env.open(nextWindow);assert.deepEqual(await fresh.ready,{connected:true});assert.equal(editor.connectCount,2);assert.equal(editor.cleanups,1);assert.equal(old.window.closed,true);assert.equal(fresh.window.closed,false);assert.equal(env.opened.length,0);
 }finally{env.close();}
});

for(const lostType of ['load','loaded'])test(`a lost first ${lostType} packet recovers with the same request ID`,async()=>{
 const env=environment();try{
  let dropped=false;env.setDrop(packet=>{if(!dropped&&packet.data?.type===lostType){dropped=true;return true;}return false;});
  const win=env.windowAt(),editor=env.editor();setupSourceDiscovery({windowRef:win});await flush();const session=env.open(win);await waitFor(()=>dropped,`The first ${lostType} must reach the bus before the retry clock advances`);
  env.advance(6001);env.poll();await flush();assert.deepEqual(await session.ready,{connected:true});assert.equal(dropped,true);assert.equal(env.opened.length,0);assert.equal(editor.loads.length,1);
  const sentLoads=env.history.filter(packet=>packet.kind==='to-editor'&&packet.data?.type==='load').map(packet=>packet.data);assert.ok(sentLoads.length>=1);assert.equal(new Set(sentLoads.map(load=>load.requestId)).size,1);assert.equal(new Set(sentLoads.map(load=>load.panelId)).size,1);
 }finally{env.close();}
});

test('foreign registry identities and stale bridge results cannot reach the active callback',async()=>{
 const env=environment();try{
  const win=env.windowAt(),editor=env.editor(),received=[];setupSourceDiscovery({windowRef:win});await flush();const session=env.open(win,{onResult:r=>received.push(r)});await session.ready;
  editor.result();await flush();assert.equal(received.length,1);
  const packet=env.history.findLast(packet=>packet.kind==='to-studio'&&packet.data?.type==='result');
  for(const patch of [{clientId:'foreign'},{ownerId:'foreign'},{nonce:'foreign'},{hostId:'foreign'},{origin:'https://other.test'}])env.inject({...packet,...patch,data:{...packet.data,revision:2}});
  for(const patch of [{nonce:'foreign'},{hostId:'retired-engine'},{requestId:'foreign'},{panelId:'foreign'},{app:'plot'}])env.inject({...packet,data:{...packet.data,revision:2,...patch}});
  await flush();assert.equal(received.length,1);assert.equal(env.opened.length,0);
 }finally{env.close();}
});
