import test from 'node:test';
import assert from 'node:assert/strict';
import {transferResult,transferReceipt,setupTransferReceiver,createDirectSender,TRANSFER_PROTOCOL} from './direct-transfer.mjs';
import {setupFigureBridge} from './bridge-host.mjs';
import {openSource,BRIDGE_PROTOCOL} from './bridge-client.mjs';

const pause=()=>new Promise(resolve=>setImmediate(resolve));
const png=()=>new Blob(['png'],{type:'image/png'});
const info=(id='image-a')=>({imageId:id,name:id+'.png',fingerprint:'a'.repeat(64)});
const batch=()=>({project:new Blob(['mifito-project']),sourceName:'project.mifito',batch:{projectId:'project-a',images:[{...info(),preview:png()},{...info('image-b'),preview:png()}]},bridgeState:{private:true}});
const single=()=>({project:new Blob(['single-project']),sourceName:'project.mifito',preview:png(),image:{projectId:'project-a',...info()}});
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}

test('wire payload preserves batch metadata and strips private state at every nesting level',()=>{
 const value=batch();value.batch.private='secret';value.batch.images[0].private='secret';value.batch.images[0].unchanged=true;
 const result=transferResult('mifito',value);
 assert.equal(result.bridgeState,undefined);assert.equal(result.batch.private,undefined);assert.equal(result.batch.images[0].private,undefined);
 assert.equal(result.batch.images[0].preview,value.batch.images[0].preview);assert.equal(result.preview,undefined);
 assert.equal(result.batch.images[0].unchanged,true);assert.equal(result.batch.images[1].unchanged,undefined);
 const s=single();s.image.private='secret';assert.deepEqual(transferResult('mifito',s).image,{projectId:'project-a',...info()});
});

test('batch validation rejects duplicate IDs, unsafe metadata, unknown apps and total preview overflow',()=>{
 assert.equal(transferResult('plot',batch()).batch.images.length,2);assert.throws(()=>transferResult('unknown',batch()));
 for(const change of [v=>v.batch.images.push(v.batch.images[0]),v=>v.batch.projectId='../bad',v=>v.batch.images[0].fingerprint='bad',v=>v.batch.images[0].name='bad\u0000name',v=>v.batch.images[0].preview=new Blob(['x'],{type:'text/html'}),v=>v.batch.images=Array(101).fill(v.batch.images[0]),v=>v.image=single().image,v=>v.batch.images[0].unchanged='true']){
  const v=batch();change(v);assert.throws(()=>transferResult('mifito',v));
 }
 class LargeBlob extends Blob{get size(){return 50*1024*1024;}}
 const v=batch();for(const item of v.batch.images)item.preview=new LargeBlob(['x'],{type:'image/png'});
 assert.throws(()=>transferResult('mifito',v),/96 MB/);
 assert.deepEqual(transferReceipt({summary:{updated:1,added:0,unchanged:2,private:true},message:'1枚更新',private:true}),{summary:{updated:1,added:0,unchanged:2},message:'1枚更新'});
 assert.deepEqual(transferReceipt({summary:{updated:-1,added:0,unchanged:0},message:'bad\u0000'}),{});
});

function fakeWindow(path='/plot_launcher_web/figure-studio/'){
 const listeners=new Map(),url=new URL(path,'http://localhost:43421'),store=new Map();
 const w={location:{href:url.href,origin:url.origin,hash:url.hash},opener:null,navigator:{},closed:false,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
 history:{replaceState(a,b,href){const u=new URL(href);Object.assign(w.location,{href:u.href,origin:u.origin,hash:u.hash});}},
 addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},removeEventListener(type,fn){listeners.get(type)?.delete(fn);},
 emit(type,event={}){return Promise.all([...(listeners.get(type)||[])].map(fn=>fn(event)));},open(){throw Error('Unexpected popup');}};return w;
}
function hub(){const channels=new Set(),messages=[];return {messages,factory(){const listeners=new Set(),channel={listeners,addEventListener(t,fn){listeners.add(fn);},removeEventListener(t,fn){listeners.delete(fn);},close(){channels.delete(channel);},postMessage(data){messages.push(data);for(const other of channels)if(other!==channel)queueMicrotask(()=>{for(const fn of other.listeners)fn({data});});}};channels.add(channel);return channel;}};}

test('direct batch is one atomic delivery and returns changed/new/unchanged counts after import',async()=>{
 const bus=hub(),studio=fakeWindow(),source=fakeWindow('/Microscopy_figure_tools_web/'),gate=deferred();let captured=0,received;
 const summary={updated:1,added:0,unchanged:1};
 const receiver=setupTransferReceiver({windowRef:studio,channelFactory:()=>bus.factory(),onImport:async value=>{received=value;await gate.promise;return {summary,message:'1枚更新・1枚変更なし',private:true};}});
 const sender=createDirectSender({app:'mifito',windowRef:source,channelFactory:()=>bus.factory(),captureResult:()=>{throw Error('Wrong capture');},captureBatchResult:()=>{captured++;return batch();}});
 try{await pause();const sending=sender.send({batch:true});await pause();assert.equal(sender.busy,true);assert.equal(captured,1);assert.equal(received.batch.images.length,2);assert.equal(received.bridgeState,undefined);assert.equal(bus.messages.some(m=>m.type==='ack'),false);gate.resolve();assert.deepEqual(await sending,{ok:true,duplicate:false,summary,message:'1枚更新・1枚変更なし'});assert.equal(sender.busy,false);assert.equal(bus.messages.filter(m=>m.type==='deliver').length,1);}
 finally{gate.resolve();sender.close();receiver.close();}
});

test('failed batch retries the same captured snapshot and mode instead of partial recapture',async()=>{
 const bus=hub();let captures=0,imports=0,singleCalls=0;
 const receiver=setupTransferReceiver({windowRef:fakeWindow(),channelFactory:()=>bus.factory(),onImport:()=>{if(++imports===1)throw Error('Retry this snapshot');return {summary:{updated:2,added:0,unchanged:0}};}});
 const sender=createDirectSender({app:'mifito',windowRef:fakeWindow('/Microscopy_figure_tools_web/'),channelFactory:()=>bus.factory(),captureResult:()=>{singleCalls++;return single();},captureBatchResult:()=>{captures++;return batch();}});
 try{await pause();await assert.rejects(sender.send({batch:true}),/Retry/);await sender.send();const deliveries=bus.messages.filter(m=>m.type==='deliver');assert.equal(captures,1);assert.equal(singleCalls,0);assert.equal(deliveries[0].payload.transferId,deliveries[1].payload.transferId);assert.ok(deliveries[1].payload.batch);}
 finally{sender.close();receiver.close();}
});

test('direct acceptance marks only the exact ACKed capture once and remains busy through its callback',async()=>{
 const bus=hub(),gate=deferred(),captured=batch();let imports=0,callbacks=0,captures=0,accepted;
 const receiver=setupTransferReceiver({windowRef:fakeWindow(),channelFactory:()=>bus.factory(),onImport:()=>{if(++imports===1)throw Error('Try again');return {summary:{updated:1,added:1,unchanged:0}};}});
 const sender=createDirectSender({app:'mifito',windowRef:fakeWindow('/Microscopy_figure_tools_web/'),channelFactory:()=>bus.factory(),captureResult:single,captureBatchResult:()=>{captures++;return captured;},onAccepted:async(result,receipt)=>{callbacks++;accepted={result,receipt};await gate.promise;}});
 const duplicate=bus.factory();
 try{await pause();await assert.rejects(sender.send({batch:true}),/Try again/);assert.equal(callbacks,0);const retry=sender.send({batch:true});await pause();assert.equal(callbacks,1);assert.equal(sender.busy,true);assert.equal(accepted.result,captured);assert.deepEqual(accepted.result.bridgeState,{private:true});assert.deepEqual(accepted.receipt.summary,{updated:1,added:1,unchanged:0});duplicate.postMessage(bus.messages.findLast(m=>m.type==='ack'&&m.ok));await pause();assert.equal(callbacks,1);gate.resolve();await retry;assert.equal(sender.busy,false);assert.equal(captures,1);assert.equal(bus.messages.find(m=>m.type==='deliver').payload.bridgeState,undefined);}
 finally{gate.resolve();duplicate.close();sender.close();receiver.close();}
});

test('a local acceptance callback failure does not reject or retry an already committed import',async()=>{
 const bus=hub(),statuses=[];let imports=0,callbacks=0;
 const receiver=setupTransferReceiver({windowRef:fakeWindow(),channelFactory:()=>bus.factory(),onImport:()=>{imports++;}});
 const sender=createDirectSender({app:'mifito',windowRef:fakeWindow('/Microscopy_figure_tools_web/'),channelFactory:()=>bus.factory(),captureResult:single,captureBatchResult:batch,onAccepted:()=>{callbacks++;throw Error('Local checkpoint failed');},onStatus:s=>statuses.push(s)});
 try{await pause();assert.equal((await sender.send({batch:true})).ok,true);assert.equal(imports,1);assert.equal(callbacks,1);assert.equal(sender.busy,false);assert.equal(statuses.at(-1).state,'sent');assert.match(statuses.at(-1).message,/反映は完了/);}
 finally{sender.close();receiver.close();}
});

test('an old direct receiver cannot silently accept an unsupported batch',async()=>{
 const bus=hub(),old=bus.factory(),source=fakeWindow('/Microscopy_figure_tools_web/');let captures=0;
 const sender=createDirectSender({app:'mifito',windowRef:source,channelFactory:()=>bus.factory(),captureResult:single,captureBatchResult:()=>{captures++;return batch();}});
 try{old.postMessage({protocol:TRANSFER_PROTOCOL,type:'presence',receiverId:crypto.randomUUID(),lastActive:Date.now()});await pause();await assert.rejects(sender.send({batch:true}),/最新版/);assert.equal(captures,0);assert.equal(bus.messages.some(m=>m.type==='deliver'),false);}
 finally{sender.close();old.close();}
});

test('popup batch fallback requires explicit batch capability after identity validation',async()=>{
 const source=fakeWindow('/Microscopy_figure_tools_web/'),sent=[];let url,popup;
 source.open=value=>{url=new URL(value);popup={closed:false,postMessage:data=>sent.push(data)};return popup;};
 const sender=createDirectSender({app:'mifito',windowRef:source,channelFactory:()=>null,captureResult:single,captureBatchResult:batch});
 try{const sending=sender.send({batch:true});const rejected=assert.rejects(sending,/最新版/);await pause();const q=new URLSearchParams(url.hash.slice(1));const data={protocol:TRANSFER_PROTOCOL,type:'receiver-ready',app:'mifito',nonce:q.get('sourceNonce'),transferId:q.get('figureTransfer')};await source.emit('message',{data,source:popup,origin:source.location.origin});await rejected;assert.equal(sent.length,0);}
 finally{sender.close();}
});

const nonce='12345678-1234-1234-1234-123456789012',origin='https://example.test';
function hostEnvironment(options={},hasHeader=true){
 const sent=[],listeners=new Set(),loads=[],accepted=[],selected=[],elements=[],app=options.app||'mifito';
 const parent={closed:false,postMessage(data){sent.push(data);}};
 const header={append(el){this.child=el;}};
 const documentRef={body:{append(el){this.child=el;}},querySelector:selector=>hasHeader&&selector==='.header-actions'?header:null,createElement(tag){const handlers=new Map(),el={tag,style:{},children:[],attributes:{},disabled:false,textContent:'',append(...children){this.children.push(...children);},setAttribute(k,v){this.attributes[k]=v;},addEventListener(type,fn){handlers.set(type,fn);},remove(){this.removed=true;},fire(type){return handlers.get(type)?.();}};elements.push(el);return el;}};
 const windowRef={opener:parent,document:documentRef,location:{hash:`#figureBridge=${nonce}&figureOrigin=${encodeURIComponent(origin)}`},addEventListener(t,fn){listeners.add(fn);},removeEventListener(t,fn){listeners.delete(fn);}};
 const host=setupFigureBridge({app:'mifito',windowRef,loadProject:async(file,meta)=>loads.push({text:await file.text(),meta}),captureResult:single,captureBatchResult:batch,selectImage:id=>selected.push(id),onAccepted:(result,meta)=>accepted.push({result,meta}),...options});
 const emit=(type,extra={})=>Promise.all([...listeners].map(fn=>fn({source:parent,origin,data:{protocol:BRIDGE_PROTOCOL,nonce,app,type,...extra}})));
 const load=(extra={})=>emit('load',{panelId:'panel-a',requestId:'request-a',editKey:'old-key',imageId:'image-a',sourceName:'project.mifito',project:new Blob(['original-project']),capabilities:['batch-v1'],...extra});
 const find=text=>elements.find(e=>e.tag==='button'&&e.textContent===text);
 return {host,sent,loads,accepted,selected,parent,emit,load,header,documentRef,listeners,elements,panel:elements.find(e=>e.id==='figure-studio-bridge'),button:find('Figure Studioへ送る'),batchButton:find('まとめてStudioへ送る'),discard:find('未反映の編集を取り消す'),message:elements.find(e=>e.tag==='span')};
}

test('PlotLauncher header send updates the original panel, locks through ACK, and cleans up on close',async()=>{
 const capture=deferred();let captures=0;
 const e=hostEnvironment({app:'plot',captureBatchResult:undefined,captureResult:()=>{captures++;return capture.promise;}});
 try{
  assert.equal(e.header.child,e.panel);assert.equal(e.documentRef.body.child,undefined);assert.equal(e.batchButton,undefined);
  assert.equal(e.button.id,'send-to-figure-studio');assert.equal(e.button.disabled,true);assert.equal(e.elements.filter(el=>el.id==='send-to-figure-studio').length,1);
  assert.doesNotMatch(e.panel.style.cssText,/position\s*:\s*(fixed|absolute)/);assert.doesNotMatch(e.message.style.cssText,/position\s*:/);assert.equal(e.message.attributes['aria-live'],'polite');
  await e.load({sourceName:'project.plotproject'});const sending=e.button.fire('click');assert.equal(captures,1);assert.equal(e.button.disabled,true);assert.equal(e.button.textContent,'Figure Studioへ送る');await e.button.fire('click');assert.equal(captures,1);
  capture.resolve({project:new Blob(['plot-project']),preview:png()});await sending;
  assert.equal(e.sent.at(-1).type,'result');assert.equal(e.sent.at(-1).panelId,'panel-a');assert.equal(e.sent.at(-1).requestId,'request-a');assert.equal(e.button.disabled,true);
  await e.emit('accepted',{panelId:'panel-a',requestId:'request-a',revision:1});assert.equal(e.accepted.length,1);assert.equal(e.button.disabled,false);
 }finally{capture.resolve({project:new Blob(['plot-project']),preview:png()});e.host.close();}
 assert.equal(e.panel.removed,true);assert.equal(e.listeners.size,0);const count=e.sent.length;await e.button.fire('click');assert.equal(e.sent.length,count);
});

test('MiFiTo topbar has one single and one batch action; both share capture and rejection locks',async()=>{
 const capture=deferred();let singles=0,batches=0;
 const e=hostEnvironment({captureResult:()=>{singles++;return single();},captureBatchResult:()=>{batches++;return capture.promise;}});
 try{
  assert.equal(e.header.child,e.panel);assert.equal(e.documentRef.body.child,undefined);assert.equal(e.batchButton.id,'send-all-to-figure-studio');assert.equal(e.elements.filter(el=>el.tag==='button').length,3);assert.equal(e.discard.hidden,true);
  await e.load();const sending=e.batchButton.fire('click');assert.equal(batches,1);assert.equal(singles,0);assert.equal(e.button.disabled,true);assert.equal(e.batchButton.disabled,true);
  await e.button.fire('click');assert.equal(singles,0);capture.resolve(batch());await sending;assert.equal(e.sent.at(-1).batch.images.length,2);assert.equal(e.batchButton.textContent,'まとめてStudioへ送る');
  await e.emit('rejected',{panelId:'panel-a',requestId:'request-a',revision:1,message:'Retry'});assert.equal(e.button.disabled,false);assert.equal(e.batchButton.disabled,false);
  await e.button.fire('click');assert.equal(singles,1);assert.equal(e.sent.at(-1).preview.type,'image/png');assert.equal(e.sent.at(-1).batch,undefined);assert.equal(e.batchButton.disabled,true);
 }finally{capture.resolve(batch());e.host.close();}
 assert.equal(e.panel.removed,true);assert.equal(e.listeners.size,0);
});

test('bridge without a shared header uses an in-flow body fallback',()=>{
 const e=hostEnvironment({},false);try{assert.equal(e.header.child,undefined);assert.equal(e.documentRef.body.child,e.panel);assert.doesNotMatch(e.panel.style.cssText,/position\s*:\s*(fixed|absolute)/);assert.equal(e.button.textContent,'Figure Studioへ送る');}finally{e.host.close();}
});

test('host batch preserves routing, disables both buttons until exact ACK and keeps private snapshot local',async()=>{
 const e=hostEnvironment();try{await e.load();assert.equal(e.loads[0].meta.imageId,'image-a');await e.batchButton.fire('click');const result=e.sent.at(-1);assert.equal(result.batch.images.length,2);assert.equal(result.bridgeState,undefined);assert.equal(result.panelId,'panel-a');assert.equal(e.button.disabled,true);assert.equal(e.batchButton.disabled,true);
  await e.emit('accepted',{panelId:'wrong',requestId:'request-a',revision:1});assert.equal(e.accepted.length,0);
  await e.emit('accepted',{panelId:'panel-a',requestId:'request-a',revision:1,editKey:'new-key',imageId:'image-a',summary:{updated:1,added:0,unchanged:1},message:'1枚更新・1枚変更なし'});
  assert.equal(e.accepted.length,1);assert.deepEqual(e.accepted[0].result.bridgeState,{private:true});assert.equal(e.message.textContent,'1枚更新・1枚変更なし');assert.equal(e.button.disabled,false);assert.equal(e.batchButton.disabled,false);
 }finally{e.host.close();}
});

test('old bridge clients receive no batch while single apply remains usable',async()=>{
 let captures=0;const e=hostEnvironment({captureBatchResult:()=>{captures++;return batch();}});try{await e.load({capabilities:undefined});await e.batchButton.fire('click');assert.equal(captures,0);assert.match(e.message.textContent,/最新版/);assert.equal(e.sent.some(m=>m.type==='result'),false);await e.button.fire('click');assert.equal(e.sent.at(-1).preview.type,'image/png');}
 finally{e.host.close();}
});

test('same workspace image selection keeps dirty edits, does not reload, and reports removed images',async()=>{
 const e=hostEnvironment({isDirty:()=>true,selectImage:id=>{if(id==='removed')throw Error('画像がありません');e.selected.push(id);}});try{await e.load();await e.emit('select-image',{panelId:'panel-a',requestId:'request-a',imageId:'image-b'});assert.deepEqual(e.selected,['image-b']);assert.equal(e.loads.length,1);assert.equal(e.button.disabled,false);await e.emit('select-image',{panelId:'panel-a',requestId:'request-a',imageId:'removed'});assert.equal(e.sent.at(-1).code,'select-failed');assert.equal(e.loads.length,1);await e.batchButton.fire('click');await e.emit('select-image',{panelId:'panel-a',requestId:'request-a',imageId:'image-a'});assert.equal(e.sent.at(-1).code,'select-busy');assert.deepEqual(e.selected,['image-b']);}
 finally{e.host.close();}
});

test('a new target in the same live project preserves dirty edits and acknowledges only after selection',async()=>{
 const gate=deferred();const e=hostEnvironment({isDirty:()=>true,canReuseProject:async()=>true,loadProject:async(file,meta)=>{e.loads.push(meta);if(meta.imageId==='image-b')await gate.promise;}});
 try{await e.load();const switching=e.load({panelId:'panel-b',requestId:'request-b',imageId:'image-b',editKey:'new-key'});await pause();assert.equal(e.sent.some(m=>m.type==='loaded'&&m.requestId==='request-b'),false);gate.resolve();await switching;assert.equal(e.loads.at(-1).reconnect,true);assert.equal(e.sent.at(-1).type,'loaded');assert.equal(e.sent.at(-1).panelId,'panel-b');}finally{gate.resolve();e.host.close();}
});

test('a stale loaded-panel cache cannot bypass source identity verification',async()=>{
 let matches=true;const e=hostEnvironment({isDirty:()=>false,canReuseProject:async()=>matches});
 try{await e.load();matches=false;await e.load({requestId:'fresh-request'});assert.equal(e.loads.length,2);assert.equal(e.loads[1].meta.reconnect,false);assert.equal(e.sent.at(-1).requestId,'fresh-request');}finally{e.host.close();}
});

test('failed or rejected batch leaves the loaded project available and explicit discard uses accepted project',async()=>{
 let fail=true;const e=hostEnvironment({isDirty:()=>true,captureBatchResult:()=>{if(fail){fail=false;throw Error('Bad image');}return batch();}});try{await e.load();await e.batchButton.fire('click');assert.equal(e.sent.at(-1).code,'capture-failed');assert.equal(e.batchButton.disabled,false);await e.batchButton.fire('click');await e.emit('rejected',{panelId:'panel-a',requestId:'request-a',revision:1,message:'Import failed'});assert.equal(e.accepted.length,0);assert.equal(e.batchButton.disabled,false);await e.batchButton.fire('click');await e.emit('accepted',{panelId:'panel-a',requestId:'request-a',revision:2,imageId:'image-a'});await e.load({panelId:'panel-b',requestId:'request-b',editKey:'other'});assert.equal(e.discard.hidden,false);await e.discard.fire('click');assert.equal(e.loads.at(-1).text,'mifito-project');assert.equal(e.loads.at(-1).meta.imageId,'image-a');}
 finally{e.host.close();}
});

function clientEnvironment(onResult){
 const sent=[],listeners=new Set();let opened;
 const windowRef={location:{origin:'http://localhost:43421',href:'http://localhost:43421/plot_launcher_web/figure-studio/'},open(url){const popup={closed:false,focus(){},postMessage:data=>sent.push(data)};opened={url:new URL(url),popup};return popup;},addEventListener(t,fn){listeners.add(fn);},removeEventListener(t,fn){listeners.delete(fn);}};
 const args={app:'mifito',project:new Blob(['original']),sourceName:'project.mifito',panelId:'panel-a',imageId:'image-a',editKey:'old-key',windowRef,onResult};
 const session=openSource(args);
 const emit=(type,extra={})=>Promise.all([...listeners].map(fn=>fn({source:opened.popup,origin:opened.url.origin,data:{protocol:BRIDGE_PROTOCOL,nonce:new URLSearchParams(opened.url.hash.slice(1)).get('figureBridge'),hostId:'host-a',app:'mifito',type,...extra}})));
 return {session,sent,args,emit};
}

test('client forwards validated batch, relays receipt, and focuses exact image on warm reopen',async()=>{
 let received;const e=clientEnvironment(value=>{received=value;return {editKey:'new-key',imageId:'image-a',summary:{updated:1,added:0,unchanged:1},message:'1枚更新',private:true};});
 try{await e.emit('ready',{capabilities:['reuse-v1','batch-v1']});const load=e.sent.at(-1);assert.equal(load.imageId,'image-a');assert.ok(load.capabilities.includes('batch-v1'));await e.emit('loaded',{requestId:load.requestId,panelId:'panel-a'});await e.emit('result',{...batch(),requestId:load.requestId,panelId:'panel-a',revision:1});assert.equal(received.batch.images.length,2);assert.equal(received.bridgeState,undefined);const ack=e.sent.at(-1);assert.equal(ack.type,'accepted');assert.equal(ack.private,undefined);assert.deepEqual(ack.summary,{updated:1,added:0,unchanged:1});const reopened=openSource({...e.args,editKey:'new-key'});const refreshed=e.sent.at(-1);assert.equal(refreshed.type,'load');assert.equal(refreshed.imageId,'image-a');assert.equal(e.sent.filter(m=>m.type==='load').length,2);await e.emit('loaded',{requestId:refreshed.requestId,panelId:'panel-a'});assert.deepEqual(await reopened.ready,{connected:true});}
 finally{e.session.close();}
});

test('invalid batch is rejected before Studio mutation and a corrected revision can succeed',async()=>{
 let applied=0;const e=clientEnvironment(()=>{applied++;});try{await e.emit('ready',{capabilities:['reuse-v1','batch-v1']});const load=e.sent.at(-1);await e.emit('loaded',{requestId:load.requestId,panelId:'panel-a'});const bad=batch();bad.batch.images.push(bad.batch.images[0]);await e.emit('result',{...bad,requestId:load.requestId,panelId:'panel-a',revision:1});assert.equal(applied,0);assert.equal(e.sent.at(-1).type,'rejected');await e.emit('result',{...batch(),requestId:load.requestId,panelId:'panel-a',revision:2});assert.equal(applied,1);assert.equal(e.sent.at(-1).type,'accepted');}
 finally{e.session.close();}
});
