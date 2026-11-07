import test from 'node:test';
import assert from 'node:assert/strict';
import {setupFigureBridge,getFigureBridgeContext,validateWorkspaceBinding} from './bridge-host.mjs';
import {createEditorDirectory,registerEditor} from './editor-discovery.mjs';

const PROTOCOL='figure-studio-bridge-v1',origin='https://example.test',ownerId='12345678-1234-1234-1234-123456789012';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function environment(options={}){
 const elements=[],listeners=new Set(),changes=[],loads=[],loaded=[],accepted=[];let registration,registryClosed=false;
 const header={children:[],append(el){el.parent=this;this.children.push(el);}};
 const documentRef={body:header,querySelector:()=>header,createElement(tag){const handlers=new Map();const el={tag,style:{},children:[],disabled:false,textContent:'',append(...children){this.children.push(...children);},setAttribute(){},addEventListener(type,fn){handlers.set(type,fn);},remove(){if(this.parent)this.parent.children=this.parent.children.filter(el=>el!==this);},fire(type){return handlers.get(type)?.();}};elements.push(el);return el;}};
 const windowRef={location:{hash:'',origin,href:origin+'/editor/'},document:documentRef,opener:null,addEventListener(type,fn){if(type==='message')listeners.add(fn);},removeEventListener(type,fn){listeners.delete(fn);}};
 const host=setupFigureBridge({app:'plot',windowRef,hasContent:()=>false,isDirty:()=>true,loadProject:async(file,meta)=>loads.push({text:await file.text(),meta}),captureResult:()=>({project:new Blob(['edited']),preview:new Blob(['svg'],{type:'image/svg+xml'}),sourceName:'edited.plotproject'}),onProjectLoaded:meta=>loaded.push(meta),onAccepted:(result,meta)=>accepted.push({result,meta}),onConnectionChange:value=>changes.push(value),registerEditorRef:args=>{registration=args;return {update(){},close(){registryClosed=true;}};},...options});
 function connect(){
  const sent=[],handlers=new Set(),nonce=crypto.randomUUID();let cleanup;
  const parent={closed:false,postMessage(data,target){assert.equal(target,origin);sent.push(data);}};
  const connection={parent,context:{nonce,origin,ownerId,clientId:crypto.randomUUID()},listen(fn){handlers.add(fn);return()=>handlers.delete(fn);},close(){parent.closed=true;cleanup?.();}};
  cleanup=registration.onConnect(connection);
  const emit=(type,extra={})=>Promise.all([...handlers].map(fn=>fn({source:parent,origin,data:{protocol:PROTOCOL,nonce,app:'plot',type,...extra}})));
  const load=(extra={})=>emit('load',{panelId:'panel-a',requestId:'request-a',editKey:'book/figure/panel-a/source-a',project:new Blob(['saved']),sourceName:'source.plotproject',...extra});
  return {sent,parent,emit,load,close:()=>connection.close(),handlers};
 }
 return {host,connect,changes,loads,loaded,accepted,header,listeners,windowRef,get registration(){return registration;},get registryClosed(){return registryClosed;},button:elements.find(e=>e.id==='send-to-figure-studio'),message:elements.find(e=>e.tag==='span'),discard:elements.find(e=>e.textContent==='未反映の編集を取り消す')};
}

test('normal editors register without bridge UI and load an empty workspace through the claimed connection',async()=>{
 const e=environment();try{
  assert.ok(e.registration);assert.equal(e.host.isConnected,false);assert.equal(e.header.children.length,0);assert.deepEqual(e.changes,[]);
  const c=e.connect();assert.equal(e.host.isConnected,true);assert.equal(e.header.children.length,1);assert.deepEqual(e.changes,[true]);
  await c.load();assert.equal(e.loads.length,1);assert.equal(e.loads[0].meta.reconnect,false);assert.equal(e.button.disabled,false);assert.equal(e.message.hidden,true);assert.equal(e.message.textContent,'');
  await c.load();assert.equal(e.loads.length,1);assert.equal(c.sent.at(-1).type,'loaded');assert.equal(c.sent.at(-1).reused,true);
  await c.emit('ping');assert.equal(c.sent.at(-1).type,'ready');assert.equal(c.sent.at(-1).loaded,true);
 }finally{e.host.close();}
 assert.equal(e.registryClosed,true);assert.equal(e.listeners.size,0);assert.equal(e.header.children.length,0);assert.deepEqual(e.changes,[true,false]);
});

test('an exact direct ACK snapshot adopts the same workspace while preserving later unsaved edits',async()=>{
 let content='unsaved editing',proof;
 const checkpoint={project:new Blob(['saved']),bridgeState:{privateSource:{}}};
 const e=environment({hasContent:()=>true,canAdoptAccepted:result=>{proof=result;return true;},loadProject:async(file,meta)=>{e.loads.push({meta});if(!meta.reconnect)content=await file.text();}});
 try{
  await e.host.rememberAccepted(checkpoint);const c=e.connect();await c.load({project:new Blob(['saved'])});
  assert.equal(proof,checkpoint);assert.equal(content,'unsaved editing');assert.equal(e.loads.length,1);assert.equal(e.loads[0].meta.reconnect,true);assert.equal(e.loaded[0].reconnect,true);assert.equal(c.sent.at(-1).type,'loaded');
  assert.equal(c.sent.some(m=>m.bridgeState),false);
 }finally{e.host.close();}
});

test('unrelated normal content is never overwritten and rejected claims restore normal send UI',async()=>{
 for(const saved of [false,true]){
  const e=environment({hasContent:()=>true,isDirty:()=>!saved});try{
   const c=e.connect();await c.load();assert.equal(e.loads.length,0);assert.equal(c.sent.at(-1).type,'switch-blocked');assert.equal(c.sent.at(-1).reason,'dirty-external');assert.equal(e.discard.hidden,true);
   assert.equal(c.parent.closed,true);assert.equal(e.host.isConnected,false);assert.equal(e.header.children.length,0);assert.deepEqual(e.changes,[true,false]);assert.equal(e.registryClosed,false);
  }finally{e.host.close();}
 }
});

test('matching byte length is insufficient, and an ACK from a previous workspace cannot authorize adoption',async()=>{
 for(const [incoming,allowed]of [['other',true],['saved',false]]){
  let proofs=0;const e=environment({hasContent:()=>true,canAdoptAccepted:()=>{proofs++;return allowed;}});try{
   await e.host.rememberAccepted({project:new Blob(['saved'])});const c=e.connect();await c.load({project:new Blob([incoming])});
   assert.equal(e.loads.length,0);assert.equal(c.sent.at(-1).reason,'dirty-external');assert.equal(proofs,incoming==='saved'?1:0);assert.equal(e.host.isConnected,false);
  }finally{e.host.close();}
 }
});

test('discovery exposes only the completed ACK hash for the still-current source workspace',async()=>{
 let sameWorkspace=true;const checkpoint={project:new Blob(['saved'])};
 const e=environment({hasContent:()=>true,canAdoptAccepted:result=>result===checkpoint&&sameWorkspace});
 try{
  assert.equal(e.registration.getState().projectHash,undefined);assert.equal(e.registration.getState().occupied,true);
  const pending=e.host.rememberAccepted(checkpoint);assert.equal(e.registration.getState().projectHash,undefined);assert.equal(await pending,true);
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('saved'))),n=>n.toString(16).padStart(2,'0')).join('');
  assert.equal(e.registration.getState().projectHash,hash);sameWorkspace=false;assert.equal(e.registration.getState().projectHash,undefined);
 }finally{e.host.close();}
});

test('switching source workspace during asynchronous adoption prevents binding and restores normal send',async()=>{
 let sameWorkspace=true;
 const e=environment({hasContent:()=>true,canAdoptAccepted:()=>sameWorkspace,loadProject:async(file,meta)=>{e.loads.push({meta});await Promise.resolve();sameWorkspace=false;}});
 try{
  await e.host.rememberAccepted({project:new Blob(['saved'])});const c=e.connect();await c.load();
  assert.equal(e.loads.length,1);assert.equal(e.loads[0].meta.reconnect,true);assert.equal(e.loaded.length,0);assert.equal(c.sent.some(m=>m.type==='loaded'),false);assert.equal(c.sent.at(-1).reason,'dirty-external');assert.equal(e.button.disabled,true);assert.equal(e.host.isConnected,false);
  const retry=e.connect();await retry.load();assert.equal(e.loads.length,1);assert.equal(retry.sent.at(-1).reason,'dirty-external');
 }finally{e.host.close();}
});

test('identical load retries during an async first-load safety check do not cancel or duplicate the load',async()=>{
 const pending=deferred();let checks=0;const e=environment({hasContent:()=>{checks++;return pending.promise;}});
 try{const c=e.connect(),loading=c.load();await c.load();assert.equal(checks,1);assert.equal(c.sent.some(m=>m.type==='switch-blocked'),false);pending.resolve(false);await loading;assert.equal(e.loads.length,1);assert.equal(c.sent.at(-1).type,'loaded');}
 finally{pending.resolve(false);e.host.close();}
});

test('Studio reconnect preserves the loaded engine and dirty edits while results use only the new route',async()=>{
 const e=environment();try{
  const first=e.connect();await first.load();const initialHost=first.sent[0].hostId;first.close();
  const second=e.connect();assert.equal(second.sent[0].hostId,initialHost);assert.equal(second.sent[0].loaded,true);
  await second.load({requestId:'request-reconnected',reconnect:true});assert.equal(e.loads.length,1);assert.equal(e.loaded.length,1);assert.equal(second.sent.at(-1).reused,true);
  const oldCount=first.sent.length;await e.button.fire('click');assert.equal(first.sent.length,oldCount);assert.equal(second.sent.at(-1).type,'result');assert.equal(second.sent.at(-1).requestId,'request-reconnected');
  await second.emit('accepted',{panelId:'panel-a',requestId:'request-reconnected',revision:1});assert.equal(e.accepted.length,1);assert.equal(e.button.disabled,false);
 }finally{e.host.close();}
});

test('hash bridge owner identities are optional for old clients and reject malformed new values',()=>{
 const hash='#'+new URLSearchParams({figureBridge:crypto.randomUUID(),figureOrigin:origin,figureOwner:ownerId});
 assert.equal(getFigureBridgeContext({hash}).ownerId,ownerId);
 assert.equal(getFigureBridgeContext({hash:hash.replace(ownerId,'bad/owner')}),null);
});

test('actual discovery transport reconnects a normal editor after Studio reload without reloading its project',async()=>{
 const channels=new Set();
 const channelFactory=()=>{const handlers=new Set(),channel={postMessage(data){for(const other of channels)if(other!==channel)queueMicrotask(()=>{for(const fn of other.handlers)fn({data});});},handlers,addEventListener(type,fn){handlers.add(fn);},removeEventListener(type,fn){handlers.delete(fn);},close(){channels.delete(channel);}};channels.add(channel);return channel;};
 const studioWindow=()=>({location:{href:origin+'/figure-studio/'},addEventListener(){},removeEventListener(){}});
 const until=async predicate=>{for(let i=0;i<20&&!predicate();i++)await new Promise(resolve=>setImmediate(resolve));assert.ok(predicate());};
 const e=environment({registerEditorRef:registerEditor,channelFactory});let directory=createEditorDirectory({windowRef:studioWindow(),channelFactory});
 const query={app:'plot',url:origin+'/editor/',ownerId,editKey:'book/figure/panel-a/source-a'};
 const request={protocol:PROTOCOL,app:'plot',type:'load',panelId:'panel-a',requestId:'request-original',editKey:query.editKey,project:new Blob(['saved']),sourceName:'source.plotproject'};
 try{
  await until(()=>!!directory.findKnown(query));let messages=[],nonce=crypto.randomUUID();
  let connection=directory.connect(directory.findKnown(query),{ownerId,nonce,onMessage:event=>messages.push(event.data)});await connection.ready;
  connection.window.postMessage({...request,nonce},origin);await until(()=>messages.some(m=>m.type==='loaded'));
  assert.equal(e.loads.length,1);const hostId=messages.find(m=>m.type==='ready').hostId;
  directory.close();await until(()=>!e.host.isConnected);
  directory=createEditorDirectory({windowRef:studioWindow(),channelFactory});await until(()=>!!directory.findKnown(query));messages=[];nonce=crypto.randomUUID();
  connection=directory.connect(directory.findKnown(query),{ownerId,nonce,onMessage:event=>messages.push(event.data)});await connection.ready;
  connection.window.postMessage({...request,nonce,requestId:'request-reloaded',reconnect:true},origin);await until(()=>messages.some(m=>m.type==='loaded'));
  assert.equal(e.loads.length,1);assert.equal(messages.find(m=>m.type==='ready').hostId,hostId);assert.equal(messages.find(m=>m.type==='loaded').reused,true);
  await e.button.fire('click');await until(()=>messages.some(m=>m.type==='result'));
  assert.equal(messages.find(m=>m.type==='result').requestId,'request-reloaded');
 }finally{directory.close();e.host.close();}
 assert.equal(channels.size,0);
});

test('workspace bindings retain only the last reflected project and exclude live transport identities',async()=>{
 const e=environment();try{
  assert.equal(await e.host.captureWorkspaceBinding(),null);const c=e.connect();await c.load();
  const binding=await e.host.captureWorkspaceBinding();assert.equal(await binding.baselineProject.text(),'saved');assert.equal(binding.app,'plot');assert.equal(binding.panelId,'panel-a');
  for(const field of ['nonce','ownerId','hostId','requestId','revision','captured','bridgeState'])assert.equal(binding[field],undefined);
  await e.button.fire('click');await assert.rejects(e.host.captureWorkspaceBinding(),/反映処理/);
  assert.throws(()=>e.host.restoreWorkspaceBinding(binding),/反映処理/);
  await c.emit('accepted',{panelId:'panel-a',requestId:'request-a',revision:1,editKey:'book/figure/panel-a/accepted'});
  const accepted=await e.host.captureWorkspaceBinding();assert.equal(await accepted.baselineProject.text(),'edited');assert.equal(accepted.editKey,'book/figure/panel-a/accepted');
 }finally{e.host.close();}
});

test('restoring a validated binding preserves current editor work and reattaches without loading or applying it',async()=>{
 const original=environment(),restored=environment();try{
  const first=original.connect();await first.load();const binding=await original.host.captureWorkspaceBinding();
  restored.host.restoreWorkspaceBinding(binding);assert.equal(restored.host.isConnected,false);assert.equal(restored.loads.length,0);assert.equal(restored.loaded.length,0);assert.equal(restored.accepted.length,0);
  const c=restored.connect();await c.load({requestId:'restored-request'});assert.equal(c.sent.at(-1).reused,true);assert.equal(restored.loads.length,0);assert.equal(restored.loaded.length,0);
  await restored.button.fire('click');assert.equal(c.sent.at(-1).type,'result');assert.equal(c.sent.at(-1).panelId,'panel-a');assert.equal(c.sent.at(-1).requestId,'restored-request');
  await c.emit('rejected',{panelId:'panel-a',requestId:'restored-request',revision:1,message:'Keep edits'});
  await c.load({panelId:'panel-other',requestId:'other',editKey:'another'});assert.equal(restored.discard.hidden,false);
  await restored.discard.fire('click');assert.equal(restored.loads.at(-1).text,'saved');assert.equal(restored.loaded.at(-1).discard,true);
 }finally{original.host.close();restored.host.close();}
});

test('invalid binding cannot detach a live editor, while reset clears association without loading a project',async()=>{
 const e=environment();try{
  const c=e.connect();await c.load();const binding=await e.host.captureWorkspaceBinding();
  for(const invalid of [{...binding,app:'mifito'},{...binding,baselineProject:new Blob([])},{...binding,editKey:''},{...binding,imageId:'../bad'}])assert.throws(()=>e.host.restoreWorkspaceBinding(invalid));
  assert.equal(e.host.isConnected,true);assert.equal(e.loads.length,1);assert.equal((await e.host.captureWorkspaceBinding()).panelId,'panel-a');
  e.host.resetWorkspaceBinding();assert.equal(e.host.isConnected,false);assert.equal(await e.host.captureWorkspaceBinding(),null);assert.equal(e.loads.length,1);assert.equal(e.registration.getState().binding,null);
  assert.equal(validateWorkspaceBinding(null),null);
 }finally{e.host.close();}
});
