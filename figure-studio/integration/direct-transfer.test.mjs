import test from 'node:test';
import assert from 'node:assert/strict';
import {TRANSFER_PROTOCOL,validateTransferPayload,directTransferContext,setupTransferReceiver,createDirectSender} from './direct-transfer.mjs';

const pause=()=>new Promise(resolve=>setImmediate(resolve));
const payload=()=>({app:'plot',transferId:crypto.randomUUID(),sourceName:'figure.plotproject',project:new Blob(['project']),preview:new Blob(['<svg/>'],{type:'image/svg+xml'})});
function storage(){const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};}
function locks(){const pending=new Map();return {request(name,fn){const p=(pending.get(name)||Promise.resolve()).catch(()=>{}).then(fn);pending.set(name,p);return p;}};}
function fakeWindow(path='/plot_launcher_web/figure-studio/'){
  const listeners=new Map(),url=new URL(path,'http://localhost:43421');
  const w={location:{href:url.href,origin:url.origin,hash:url.hash,search:url.search},opener:null,navigator:{},localStorage:storage(),closed:false,
    history:{replaceState(a,b,href){const u=new URL(href);Object.assign(w.location,{href:u.href,origin:u.origin,hash:u.hash});}},
    addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
    removeEventListener(type,fn){listeners.get(type)?.delete(fn);},
    emit(type,event={}){return Promise.all([...(listeners.get(type)||[])].map(fn=>fn(event)));},
    open(){throw new Error('Unexpected popup');}
  };return w;
}
function hub(){
  const channels=new Set(),messages=[];
  return {messages,factory(){const listeners=new Set();const c={
    addEventListener(type,fn){listeners.add(fn);},removeEventListener(type,fn){listeners.delete(fn);},close(){channels.delete(c);},
    postMessage(data){messages.push(data);for(const other of channels)if(other!==c)queueMicrotask(()=>{for(const fn of other.listeners)fn({data});});},listeners
  };channels.add(c);return c;}};
}
function workspaceSource(studio){
  const source=fakeWindow('/plot_launcher_web/?figureWorkspace=1'),workspace={studioWindow:studio,show(){}};let opens=0;
  studio.postMessage=()=>{};source.parent={location:{origin:source.location.origin},FigureStudioWorkspace:workspace};source.open=()=>{opens++;return null;};
  return {source,workspace,get opens(){return opens;}};
}

test('workspace sends only to its own Studio frame even when another Studio is more recently active',async()=>{
  const bus=hub(),own=fakeWindow(),other=fakeWindow(),env=workspaceSource(own);let ownImports=0,otherImports=0;
  const receiver=setupTransferReceiver({windowRef:own,channelFactory:()=>bus.factory(),onImport:()=>{ownImports++;}}),foreign=setupTransferReceiver({windowRef:other,channelFactory:()=>bus.factory(),onImport:()=>{otherImports++;}});
  env.workspace.studioReceiverId=receiver.receiverId;
  const sender=createDirectSender({app:'plot',windowRef:env.source,channelFactory:()=>bus.factory(),captureResult:payload});
  try{await pause();await new Promise(r=>setTimeout(r,3));await other.emit('focus');await pause();await sender.send();assert.equal(ownImports,1);assert.equal(otherImports,0);assert.equal(env.opens,0);}
  finally{sender.close();receiver.close();foreign.close();}
});

test('workspace capture waits for its own receiver to appear and never falls back to another tab',async()=>{
  const bus=hub(),own=fakeWindow(),env=workspaceSource(own);let foreignImports=0,ownImports=0,captures=0,receiver;
  const foreign=setupTransferReceiver({windowRef:fakeWindow(),channelFactory:()=>bus.factory(),onImport:()=>{foreignImports++;}});
  const sender=createDirectSender({app:'plot',windowRef:env.source,channelFactory:()=>bus.factory(),captureResult:()=>{captures++;return payload();}});
  try{
    await pause();const sending=sender.send();await pause();assert.equal(sender.busy,true);assert.equal(captures,1);assert.equal(env.opens,0);assert.equal(foreignImports,0);assert.equal(bus.messages.some(m=>m.type==='deliver'),false);
    receiver=setupTransferReceiver({windowRef:own,channelFactory:()=>bus.factory(),onImport:()=>{ownImports++;}});env.workspace.studioReceiverId=receiver.receiverId;
    await sending;assert.equal(ownImports,1);assert.equal(foreignImports,0);assert.equal(captures,1);assert.equal(env.opens,0);
  }finally{sender.close();receiver?.close();foreign.close();}
});

test('workspace readiness timeout retains its capture for explicit retry without opening a popup',async()=>{
  const bus=hub(),own=fakeWindow(),env=workspaceSource(own),statuses=[];let captures=0,imports=0,receiver;
  const sender=createDirectSender({app:'plot',windowRef:env.source,channelFactory:()=>bus.factory(),captureResult:()=>{captures++;return payload();},ackTimeoutMs:10,onStatus:status=>statuses.push(status.state)});
  try{
    await assert.rejects(sender.send(),/準備が完了/);assert.equal(sender.busy,false);assert.equal(statuses.at(-1),'retry');assert.equal(env.opens,0);
    receiver=setupTransferReceiver({windowRef:own,channelFactory:()=>bus.factory(),onImport:()=>{imports++;}});env.workspace.studioReceiverId=receiver.receiverId;
    await pause();assert.equal(imports,0);await sender.send();assert.equal(imports,1);assert.equal(captures,1);assert.equal(env.opens,0);
  }finally{sender.close();receiver?.close();}
});

test('a workspace without BroadcastChannel reports retry instead of creating a separate Studio',async()=>{
  const env=workspaceSource(fakeWindow()),sender=createDirectSender({app:'plot',windowRef:env.source,channelFactory:()=>null,captureResult:payload,ackTimeoutMs:5});
  try{await assert.rejects(sender.send(),/準備が完了/);assert.equal(env.opens,0);}finally{sender.close();}
});

test('payload checks identifiers, source names, MIME type and binary size caps',()=>{
  const p=payload();assert.equal(validateTransferPayload(p),p);
  assert.throws(()=>validateTransferPayload({...p,app:'other'}));
  assert.throws(()=>validateTransferPayload({...p,transferId:'short'}));
  assert.throws(()=>validateTransferPayload({...p,sourceName:'bad\u0000name'}));
  assert.throws(()=>validateTransferPayload({...p,preview:new Blob(['html'],{type:'text/html'})}));
  class HugeBlob extends Blob{get size(){return 321*1024*1024;}}
  assert.throws(()=>validateTransferPayload({...p,project:new HugeBlob(['x'])}));
});

test('popup context only accepts valid nonce and HTTPS or local origin',()=>{
  const transferId=crypto.randomUUID(),nonce=crypto.randomUUID();
  const make=origin=>({hash:'#'+new URLSearchParams({figureTransfer:transferId,sourceNonce:nonce,sourceOrigin:origin,sourceApp:'plot'})});
  assert.equal(directTransferContext(make('https://example.test')).origin,'https://example.test');
  assert.equal(directTransferContext(make('http://localhost:43421')).nonce,nonce);
  assert.equal(directTransferContext(make('null')),null);
  assert.equal(directTransferContext(make('http://remote.test')),null);
});

test('existing most recently active Studio receives without navigation or popup',async()=>{
  const bus=hub(),a=fakeWindow(),b=fakeWindow(),source=fakeWindow('/plot_launcher_web/');
  let first=0,second=0,opens=0;
  source.open=()=>{opens++;return null;};
  const ra=setupTransferReceiver({windowRef:a,channelFactory:()=>bus.factory(),onImport:()=>{first++;}});
  const rb=setupTransferReceiver({windowRef:b,channelFactory:()=>bus.factory(),onImport:()=>{second++;}});
  const sender=createDirectSender({app:'plot',windowRef:source,channelFactory:()=>bus.factory(),captureResult:payload});
  try {
    await pause();await new Promise(r=>setTimeout(r,3));await b.emit('focus');await pause();
    assert.deepEqual(await sender.send(),{ok:true,duplicate:false});
    assert.equal(opens,0);assert.equal(first,0);assert.equal(second,1);
    assert.equal(b.location.href,'http://localhost:43421/plot_launcher_web/figure-studio/');
  } finally{sender.close();ra.close();rb.close();}
});

test('ack waits for import completion and repeated delivery imports once',async()=>{
  const bus=hub(),studio=fakeWindow(),source=fakeWindow('/plot_launcher_web/');
  let release,calls=0;
  const barrier=new Promise(r=>{release=r;});
  const receiver=setupTransferReceiver({windowRef:studio,channelFactory:()=>bus.factory(),onImport:async()=>{calls++;await barrier;}});
  const sender=createDirectSender({app:'plot',windowRef:source,channelFactory:()=>bus.factory(),captureResult:payload});
  try {
    await pause();const sending=sender.send();await pause();
    const delivery=bus.messages.find(m=>m.type==='deliver');
    assert.ok(delivery);assert.equal(calls,1);assert.equal(bus.messages.some(m=>m.type==='ack'),false);
    const extra=bus.factory();extra.postMessage(delivery);await pause();assert.equal(calls,1);
    release();await sending;await pause();assert.ok(bus.messages.some(m=>m.type==='ack'&&m.ok));extra.close();
  }finally{release?.();sender.close();receiver.close();}
});

test('receipt deduplication survives a receiver reload',async()=>{
  const bus=hub(),store=storage(),studio=fakeWindow(),source=fakeWindow('/plot_launcher_web/');let count=0;
  let receiver=setupTransferReceiver({windowRef:studio,storage:store,channelFactory:()=>bus.factory(),onImport:()=>{count++;}});
  const sender=createDirectSender({app:'plot',windowRef:source,channelFactory:()=>bus.factory(),captureResult:payload});
  const extra=bus.factory();
  try{
    await pause();await sender.send();const delivery=bus.messages.find(m=>m.type==='deliver');receiver.close();
    receiver=setupTransferReceiver({windowRef:studio,storage:store,channelFactory:()=>bus.factory(),onImport:()=>{count++;}});
    extra.postMessage({...delivery,to:receiver.receiverId});await pause();
    assert.equal(count,1);assert.ok(bus.messages.some(m=>m.type==='ack'&&m.duplicate));
  }finally{sender.close();receiver.close();extra.close();}
});

test('two Studio tabs serialize the same transfer with a shared lock',async()=>{
  const bus=hub(),store=storage(),manager=locks();let count=0,release;
  const barrier=new Promise(r=>{release=r;});
  const options={storage:store,lockManager:manager,channelFactory:()=>bus.factory(),onImport:async()=>{count++;await barrier;}};
  const a=setupTransferReceiver({...options,windowRef:fakeWindow()}),b=setupTransferReceiver({...options,windowRef:fakeWindow()});
  const sender=bus.factory(),p=payload(),message={protocol:TRANSFER_PROTOCOL,type:'deliver',senderId:crypto.randomUUID(),nonce:crypto.randomUUID(),payload:p};
  try{
    sender.postMessage({...message,to:a.receiverId});sender.postMessage({...message,to:b.receiverId});await pause();assert.equal(count,1);
    release();await pause();assert.equal(count,1);
  }finally{release();a.close();b.close();sender.close();}
});

test('fallback tab opens synchronously before capture, and popup identities are checked',async()=>{
  const source=fakeWindow('/plot_launcher_web/'),order=[],sent=[];
  let openedURL,popup;
  source.open=url=>{order.push('open');openedURL=new URL(url);popup={closed:false,postMessage:(data,origin)=>sent.push({data,origin})};return popup;};
  const sender=createDirectSender({app:'plot',windowRef:source,channelFactory:()=>null,captureResult:()=>{order.push('capture');return payload();}});
  try{
    const sending=sender.send();assert.deepEqual(order,['open']);assert.equal(openedURL.pathname,'/plot_launcher_web/figure-studio/');await pause();
    const q=new URLSearchParams(openedURL.hash.slice(1));
    const message={protocol:TRANSFER_PROTOCOL,type:'receiver-ready',app:'plot',nonce:q.get('sourceNonce'),transferId:q.get('figureTransfer')};
    await source.emit('message',{data:message,source:popup,origin:'https://evil.test'});assert.equal(sent.length,0);
    await source.emit('message',{data:message,source:{},origin:source.location.origin});assert.equal(sent.length,0);
    await source.emit('message',{data:message,source:popup,origin:source.location.origin});assert.equal(sent.length,1);
    await source.emit('message',{data:{...message,type:'ack',ok:true},source:popup,origin:source.location.origin});
    assert.deepEqual(await sending,{ok:true,duplicate:false});assert.deepEqual(order,['open','capture']);
  }finally{sender.close();}
});

test('popup receiver validates window and origin, and clears only its transfer URL fields',async()=>{
  const p=payload(),nonce=crypto.randomUUID(),opener={closed:false,sent:[],postMessage(data,origin){this.sent.push({data,origin});}};
  const hash=new URLSearchParams({figureTransfer:p.transferId,sourceNonce:nonce,sourceOrigin:'http://localhost:43421',sourceApp:'plot',keep:'yes'});
  const studio=fakeWindow(`/plot_launcher_web/figure-studio/#${hash}`);studio.opener=opener;let count=0;
  const receiver=setupTransferReceiver({windowRef:studio,channelFactory:()=>null,onImport:()=>{count++;}});
  const data={protocol:TRANSFER_PROTOCOL,type:'deliver',app:'plot',transferId:p.transferId,nonce,payload:p};
  try{
    await studio.emit('message',{data,source:opener,origin:'https://evil.test'});assert.equal(count,0);
    await studio.emit('message',{data,source:opener,origin:'http://localhost:43421'});assert.equal(count,1);
    await studio.emit('message',{data,source:opener,origin:'http://localhost:43421'});assert.equal(count,1);
    assert.equal(studio.location.hash,'#keep=yes');assert.equal(opener.sent.at(-1).data.type,'ack');assert.equal(opener.sent.at(-1).data.duplicate,true);
  }finally{receiver.close();}
});

test('failed import retries the same payload and transfer ID, without recapturing',async()=>{
  const bus=hub(),studio=fakeWindow(),source=fakeWindow('/plot_launcher_web/');let imports=0,captures=0;
  const receiver=setupTransferReceiver({windowRef:studio,channelFactory:()=>bus.factory(),onImport(){if(imports++===0)throw new Error('Import temporarily failed');}});
  const sender=createDirectSender({app:'plot',windowRef:source,channelFactory:()=>bus.factory(),captureResult(){captures++;return payload();}});
  try{
    await pause();await assert.rejects(sender.send(),/temporarily failed/);await sender.send();
    const deliveries=bus.messages.filter(m=>m.type==='deliver');
    assert.equal(captures,1);assert.equal(imports,2);assert.equal(deliveries[0].payload.transferId,deliveries[1].payload.transferId);
  }finally{sender.close();receiver.close();}
});

test('project replacement drops a timed-out payload and ignores its late acknowledgement',async()=>{
 const bus=hub(),own=fakeWindow(),env=workspaceSource(own),imports=[],accepted=[];let current='A',release,started;
 const gate=new Promise(resolve=>release=resolve),first=new Promise(resolve=>started=resolve);
 const receiver=setupTransferReceiver({windowRef:own,channelFactory:()=>bus.factory(),onImport:async value=>{const project=await value.project.text();imports.push(project);if(project==='A'){started();await gate;}}});env.workspace.studioReceiverId=receiver.receiverId;
 const sender=createDirectSender({app:'plot',windowRef:env.source,channelFactory:()=>bus.factory(),ackTimeoutMs:15,captureResult:()=>({...payload(),project:new Blob([current])}),onAccepted:async result=>accepted.push(await result.project.text())});
 try{
  await pause();const a=sender.send();const rejected=assert.rejects(a,/確認が届きません/);await first;await rejected;sender.resetPending();current='B';release();await pause();await pause();assert.deepEqual(accepted,[]);
  await sender.send();assert.deepEqual(imports,['A','B']);assert.deepEqual(accepted,['B']);assert.equal(new Set(bus.messages.filter(m=>m.type==='deliver').map(m=>m.payload.transferId)).size,2);
 }finally{release();sender.close();receiver.close();}
});
test('pending reset cannot interrupt capture or its acceptance callback',async()=>{
 const bus=hub(),own=fakeWindow(),env=workspaceSource(own);let release,started,acceptRelease,acceptStarted;
 const captureGate=new Promise(resolve=>release=resolve),capturing=new Promise(resolve=>started=resolve),acceptGate=new Promise(resolve=>acceptRelease=resolve),accepting=new Promise(resolve=>acceptStarted=resolve);
 const receiver=setupTransferReceiver({windowRef:own,channelFactory:()=>bus.factory(),onImport:async()=>{}});env.workspace.studioReceiverId=receiver.receiverId;
 const sender=createDirectSender({app:'plot',windowRef:env.source,channelFactory:()=>bus.factory(),captureResult:async()=>{started();await captureGate;return payload();},onAccepted:async()=>{acceptStarted();await acceptGate;}});
 try{await pause();const sending=sender.send();await capturing;assert.throws(()=>sender.resetPending(),/送信が完了/);release();await accepting;assert.equal(sender.busy,true);assert.throws(()=>sender.resetPending(),/送信が完了/);acceptRelease();await sending;assert.doesNotThrow(()=>sender.resetPending());}
 finally{release();acceptRelease();sender.close();receiver.close();}
});

test('a late successful acknowledgement is busy again until its checkpoint callback finishes',async()=>{
 const bus=hub(),own=fakeWindow(),env=workspaceSource(own);let releaseImport,releaseAccept,started;
 const importGate=new Promise(resolve=>releaseImport=resolve),acceptGate=new Promise(resolve=>releaseAccept=resolve),accepting=new Promise(resolve=>started=resolve);
 const receiver=setupTransferReceiver({windowRef:own,channelFactory:()=>bus.factory(),onImport:()=>importGate});env.workspace.studioReceiverId=receiver.receiverId;
 const sender=createDirectSender({app:'plot',windowRef:env.source,channelFactory:()=>bus.factory(),ackTimeoutMs:10,captureResult:payload,onAccepted:async()=>{started();await acceptGate;}});
 try{await pause();await assert.rejects(sender.send(),/確認が届きません/);assert.equal(sender.busy,false);releaseImport();await accepting;assert.equal(sender.busy,true);assert.throws(()=>sender.resetPending(),/送信が完了/);releaseAccept();await pause();assert.equal(sender.busy,false);}
 finally{releaseImport();releaseAccept();sender.close();receiver.close();}
});
