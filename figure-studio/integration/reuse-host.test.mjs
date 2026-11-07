import test from 'node:test';
import assert from 'node:assert/strict';
import {setupFigureBridge} from './bridge-host.mjs';

const PROTOCOL='figure-studio-bridge-v1',nonce='12345678-1234-1234-1234-123456789012',origin='https://example.test';
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
function environment(options={},embedded=false){
 const sent=[],listeners=new Set(),loads=[],accepted=[],elements=[],shown=[];
 const parent={closed:false,location:{origin},postMessage(data,target){sent.push({data,target});}};
 const documentRef={body:{append(el){this.child=el;}},createElement(tag){const handlers=new Map();const el={tag,style:{},children:[],attributes:{},disabled:false,textContent:'',append(...children){this.children.push(...children);},setAttribute(k,v){this.attributes[k]=v;},addEventListener(type,fn){handlers.set(type,fn);},remove(){this.removed=true;},fire(type){return handlers.get(type)?.();}};elements.push(el);return el;}};
 const windowRef={opener:embedded?null:parent,document:documentRef,location:{origin,search:embedded?'?figureWorkspace=1':'',hash:`#figureBridge=${nonce}&figureOrigin=${encodeURIComponent(origin)}`},addEventListener(type,fn){if(type==='message')listeners.add(fn);},removeEventListener(type,fn){listeners.delete(fn);}};
 windowRef.parent=embedded?{location:{origin},FigureStudioWorkspace:{studioWindow:parent,show:tab=>shown.push(tab)}}:windowRef;
 const host=setupFigureBridge({app:'plot',windowRef,loadProject:async(file,meta)=>loads.push({text:await file.text(),meta}),captureResult:async()=>({project:new Blob(['updated']),preview:new Blob(['<svg/>'],{type:'image/svg+xml'}),bridgeState:{revision:3}}),onAccepted:async(result,meta)=>accepted.push({result,meta}),...options});
 const emit=(type,extra={},event={})=>Promise.all([...listeners].map(fn=>fn({source:parent,origin,data:{protocol:PROTOCOL,nonce,app:'plot',type,...extra},...event})));
 const load=(id='a',extra={})=>emit('load',{requestId:'request-'+id,panelId:id,editKey:'book:'+id+':source-1',sourceName:id+'.plotproject',project:new Blob([id]),...extra});
 return {host,sent,listeners,loads,accepted,parent,documentRef,windowRef,shown,emit,load,button:elements.find(e=>e.tag==='button'),discard:elements.find(e=>e.tag==='button'&&e.textContent==='未反映の編集を取り消す'),message:elements.find(e=>e.tag==='span')};
}

test('workspace iframe uses the shell Studio window without an opener and returns only after accepted edits',async()=>{
 const e=environment({},true);try{
  assert.equal(e.windowRef.opener,null);assert.equal(e.host.isConnected,true);assert.equal(e.sent[0].data.type,'ready');assert.deepEqual(e.shown,[]);
  await e.load('a');await e.button.fire('click');assert.equal(e.sent.at(-1).data.type,'result');assert.deepEqual(e.shown,[]);
  await e.emit('rejected',{panelId:'a',requestId:'request-a',revision:1,message:'Try again'});assert.deepEqual(e.shown,[]);
  await e.button.fire('click');await e.emit('accepted',{panelId:'a',requestId:'request-a',revision:2});assert.deepEqual(e.shown,['studio']);assert.equal(e.accepted.length,1);
 }finally{e.host.close();}
});

test('workspace navigation failure cannot turn a committed bridge edit into a rejection',async()=>{
 const e=environment({},true);e.windowRef.parent.FigureStudioWorkspace.show=()=>{throw Error('UI unavailable');};
 try{await e.load('a');await e.button.fire('click');await e.emit('accepted',{panelId:'a',requestId:'request-a',revision:1});assert.equal(e.accepted.length,1);assert.equal(e.button.disabled,false);assert.equal(e.sent.some(m=>m.data.type==='error'),false);}
 finally{e.host.close();}
});

test('host advertises reuse and loads another project without replacing the tab or UI',async()=>{
 const e=environment();try{
  assert.deepEqual(e.sent[0].data.capabilities,['reuse-v1']);
  await e.load('a');const panel=e.documentRef.body.child;
  assert.equal(e.sent.at(-1).data.type,'loaded');assert.equal(e.sent.at(-1).data.requestId,'request-a');
  await e.load('b');assert.deepEqual(e.loads.map(l=>l.text),['a','b']);assert.equal(e.documentRef.body.child,panel);assert.equal(e.button.disabled,false);assert.equal(e.sent.at(-1).data.panelId,'b');
 }finally{e.host.close();}assert.equal(e.listeners.size,0);
});

test('reopening a panel preserves its current edits and does not deserialize again',async()=>{
 const e=environment({isDirty:()=>true});try{
  await e.load('a');await e.load('a');await e.load('a',{requestId:'new-request'});
  assert.equal(e.loads.length,1);assert.equal(e.sent.at(-1).data.type,'loaded');assert.equal(e.sent.at(-1).data.reused,true);assert.equal(e.sent.at(-1).data.requestId,'new-request');
  await e.emit('ping');assert.equal(e.sent.at(-1).data.type,'ready');assert.equal(e.sent.at(-1).data.loaded,true);
 }finally{e.host.close();}
});

test('a reconnect flag cannot preserve a different panel or a replaced source snapshot',async()=>{
 let content='';const metadata=[];
 const e=environment({async loadProject(file,meta){metadata.push(meta);if(!meta.reconnect)content=await file.text();}});
 try{
  await e.load('later');assert.equal(content,'later');
  await e.load('earlier',{reconnect:true});assert.equal(content,'earlier');
  await e.load('earlier',{requestId:'replacement',editKey:'book:earlier:source-2',project:new Blob(['earlier-replaced']),reconnect:true});
  assert.equal(content,'earlier-replaced');assert.deepEqual(metadata.map(m=>m.reconnect),[false,false,false]);
  await e.button.fire('click');assert.equal(e.sent.at(-1).data.panelId,'earlier');assert.equal(e.sent.at(-1).data.requestId,'replacement');
 }finally{e.host.close();}
});

test('reopening the same linked panel selects its image again before acknowledging reuse',async()=>{
 let visible='first';const selections=[];const e=environment({selectImage:async id=>{selections.push(id);visible=id;}});
 try{
  await e.load('a',{imageId:'image-first'});visible='image-later';
  await e.load('a',{imageId:'image-first',requestId:'new-request'});
  assert.equal(visible,'image-first');assert.deepEqual(selections,['image-first']);assert.equal(e.loads.length,1);
  assert.equal((await e.host.captureWorkspaceBinding()).imageId,'image-first');
  visible='image-later';await e.load('a',{imageId:'image-first',requestId:'new-request'});
  assert.equal(visible,'image-first');assert.equal(selections.length,2);assert.equal(e.loads.length,1);
 }finally{e.host.close();}
});

test('asynchronous image reselection cannot acknowledge or accept an edit before the requested image is ready',async()=>{
 const selection=deferred();const e=environment({selectImage:()=>selection.promise});
 try{
  await e.load('a',{imageId:'image-first'});const n=e.sent.length;
  const selecting=e.load('a',{imageId:'image-first',requestId:'new-request'});
  assert.equal(e.button.disabled,true);assert.equal(e.sent.slice(n).some(m=>m.data.type==='loaded'),false);
  await e.button.fire('click');assert.equal(e.sent.slice(n).some(m=>m.data.type==='result'),false);
  selection.resolve();await selecting;assert.equal(e.sent.at(-1).data.type,'loaded');assert.equal(e.sent.at(-1).data.requestId,'new-request');assert.equal(e.button.disabled,false);
 }finally{selection.resolve();e.host.close();}
});

test('failed image reselection never reports a successful open or leaves Apply enabled for the previous image',async()=>{
 const e=environment({selectImage:async()=>{throw Error('image missing');}});
 try{
  await e.load('a',{imageId:'image-first'});const n=e.sent.length;
  await e.load('a',{imageId:'image-first',requestId:'new-request'});
  assert.equal(e.sent.slice(n).some(m=>m.data.type==='loaded'),false);
  const failure=e.sent.at(-1).data;assert.equal(failure.type,'error');assert.equal(failure.code,'load-failed');assert.equal(failure.requestId,'new-request');assert.equal(e.button.disabled,true);
  assert.equal(await e.host.captureWorkspaceBinding(),null);
  await e.button.fire('click');assert.equal(e.sent.at(-1).data.type,'error');
 }finally{e.host.close();}
});

test('unreflected edits block a different panel and preserve result routing',async()=>{
 const e=environment({isDirty:async()=>true});try{
  await e.load('a');await e.load('b');const blocked=e.sent.at(-1).data;
  assert.equal(blocked.type,'switch-blocked');assert.equal(blocked.reason,'dirty');assert.equal(blocked.requestId,'request-b');assert.equal(blocked.activeRequestId,'request-a');assert.equal(e.loads.length,1);assert.equal(e.button.disabled,false);
  await e.button.fire('click');const result=e.sent.at(-1).data;
  assert.equal(result.type,'result');assert.equal(result.panelId,'a');assert.equal(result.requestId,'request-a');assert.equal(result.bridgeState,undefined);
 }finally{e.host.close();}
});

test('async dirty checks serialize target changes and disable Apply until resolved',async()=>{
 const check=deferred(),e=environment({isDirty:()=>check.promise});try{
  await e.load('a');const switching=e.load('b');assert.equal(e.button.disabled,true);
  await e.load('c');assert.equal(e.sent.at(-1).data.type,'switch-blocked');assert.equal(e.sent.at(-1).data.reason,'busy');
  check.resolve(false);await switching;assert.deepEqual(e.loads.map(l=>l.text),['a','b']);assert.equal(e.button.disabled,false);
 }finally{e.host.close();}
});

test('busy import and awaiting acceptance block replacement; ack identity and editKey are enforced',async()=>{
 const loading=deferred(),e=environment({loadProject:()=>loading.promise});try{
  const first=e.load('a');await e.load('b');assert.equal(e.sent.at(-1).data.reason,'busy');loading.resolve();await first;
  await e.button.fire('click');await e.load('b');assert.equal(e.sent.at(-1).data.reason,'busy');
  await e.emit('accepted',{panelId:'b',requestId:'request-a',revision:1});assert.equal(e.accepted.length,0);
  await e.emit('accepted',{panelId:'a',requestId:'other',revision:1});assert.equal(e.accepted.length,0);
  await e.emit('accepted',{panelId:'a',requestId:'request-a',revision:1,hostId:'retired-host'});assert.equal(e.accepted.length,0);
  await e.emit('accepted',{panelId:'a',requestId:'request-a',revision:1,editKey:'book:a:source-2'});
  assert.equal(e.accepted.length,1);assert.deepEqual(e.accepted[0].result.bridgeState,{revision:3});assert.equal(e.accepted[0].meta.editKey,'book:a:source-2');
  await e.emit('ping');assert.equal(e.sent.at(-1).data.editKey,'book:a:source-2');assert.equal(e.button.disabled,false);
 }finally{e.host.close();}
});

test('failed import disables Apply under the old identity and allows a new retry',async()=>{
 let count=0;const e=environment({loadProject:async()=>{if(++count===2)throw Error('invalid import');}});try{
  await e.load('a');await e.load('b');assert.equal(e.sent.at(-1).data.type,'error');assert.equal(e.sent.at(-1).data.code,'load-failed');assert.equal(e.sent.at(-1).data.requestId,'request-b');assert.equal(e.button.disabled,true);
  const n=e.sent.length;await e.button.fire('click');assert.equal(e.sent.length,n);
  await e.load('b');assert.equal(count,3);assert.equal(e.sent.at(-1).data.type,'loaded');assert.equal(e.button.disabled,false);
 }finally{e.host.close();}
});

test('successful import establishes baseline before loaded and accepts legacy initial messages',async()=>{
 const phases=[],e=environment({loadProject:async()=>phases.push('load'),onProjectLoaded:async info=>{phases.push('baseline');assert.equal(info.panelId,'a');}});try{
  await e.emit('load',{panelId:'a',project:new Blob(['old-project'])});assert.deepEqual(phases,['load','baseline']);assert.equal(e.sent.at(-1).data.type,'loaded');assert.equal(e.sent.at(-1).data.requestId,'');
  await e.button.fire('click');await e.emit('accepted',{panelId:'a',revision:1});assert.equal(e.accepted.length,1);
 }finally{e.host.close();}
});

test('foreign messages, invalid blobs and unexpected acks never replace the current project',async()=>{
 const e=environment();try{
  await e.load('a');const load={panelId:'b',requestId:'request-b',project:new Blob(['b'])};
  for(const event of [{origin:'https://evil.test'},{source:{}},{data:{...load,protocol:PROTOCOL,nonce:'wrong',app:'plot',type:'load'}}])await e.emit('load',load,event);
  assert.equal(e.loads.length,1);
  await e.load('b',{project:new Blob([])});assert.equal(e.sent.at(-1).data.code,'invalid-project');assert.equal(e.loads.length,1);
  await e.emit('accepted',{panelId:'a',requestId:'request-a',revision:0});assert.equal(e.accepted.length,0);
 }finally{e.host.close();}
});

test('dirty-check failure keeps original project and close ignores a pending import completion',async()=>{
 const e=environment({isDirty:async()=>{throw Error('failed signature')}});try{
  await e.load('a');await e.load('b');assert.equal(e.sent.at(-1).data.reason,'dirty-check-failed');assert.equal(e.loads.length,1);assert.equal(e.button.disabled,false);
 }finally{e.host.close();}
 const pending=deferred(),other=environment({loadProject:()=>pending.promise});const load=other.load('a'),n=other.sent.length;other.host.close();pending.resolve();await load;assert.equal(other.sent.length,n);assert.equal(other.documentRef.body.child.removed,true);
});

test('explicit discard restores only the current last accepted snapshot and preserves target identity',async()=>{
 let dirty=false;const phases=[],e=environment({isDirty:()=>dirty,onProjectLoaded:info=>{dirty=false;phases.push(info);}});try{
  await e.load('a');assert.equal(e.discard.hidden,true);dirty=true;
  await e.button.fire('click');await e.emit('accepted',{panelId:'a',requestId:'request-a',revision:1,editKey:'accepted-key'});
  await e.load('b');assert.equal(e.discard.hidden,false);assert.equal(e.loads.length,1);
  await e.emit('ping');assert.equal(e.loads.length,1); // merely focusing/probing never discards
  await e.discard.fire('click');assert.deepEqual(e.loads.map(l=>l.text),['a','updated']);assert.equal(e.loads[1].meta.reconnect,false);assert.equal(phases.at(-1).discard,true);
  assert.equal(e.sent.at(-1).data.type,'loaded');assert.equal(e.sent.at(-1).data.restored,true);assert.equal(e.sent.at(-1).data.panelId,'a');assert.equal(e.sent.at(-1).data.requestId,'request-a');assert.equal(e.sent.at(-1).data.editKey,'accepted-key');assert.equal(e.discard.hidden,true);
  await e.load('b');assert.deepEqual(e.loads.map(l=>l.text),['a','updated','b']);
 }finally{e.host.close();}
});

test('capture failure leaves explicit discard available for a blocked dirty panel',async()=>{
 const e=environment({isDirty:()=>true,captureResult:async()=>{throw Error('bad settings')}});try{
  await e.load('a');await e.load('b');assert.equal(e.discard.hidden,false);
  await e.button.fire('click');assert.equal(e.sent.at(-1).data.code,'capture-failed');assert.equal(e.discard.disabled,false);
  await e.discard.fire('click');assert.equal(e.sent.at(-1).data.restored,true);assert.deepEqual(e.loads.map(l=>l.text),['a','a']);
 }finally{e.host.close();}
});
