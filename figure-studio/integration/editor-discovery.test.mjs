import test from 'node:test';
import assert from 'node:assert/strict';
import {createEditorDirectory,registerEditor,studioOwnerId} from './editor-discovery.mjs';

const ORIGIN='https://example.test',EDITOR=ORIGIN+'/mifito/';
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
function environment(){
 const channels=new Set(),history=[],timers=new Map();let time=1000,sequence=0;
 function windowAt(url=ORIGIN+'/figure-studio/',storage=new Map()){
  const events=new Map(),ownedTimers=new Set();return {location:{href:url},Date:{now:()=>time},crypto:{randomUUID:()=>`id-${++sequence}`},sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},setInterval(fn){const key=++sequence;timers.set(key,fn);ownedTimers.add(key);return key;},clearInterval:key=>timers.delete(key),tick(){for(const key of ownedTimers)timers.get(key)?.();},setTimeout,clearTimeout,addEventListener(type,fn){events.set(type,fn);},removeEventListener(type,fn){if(events.get(type)===fn)events.delete(type);},focusCount:0,focus(){this.focusCount++;},emit:type=>events.get(type)?.()};
 }
 function factory(){const listeners=new Set(),channel={closed:false,addEventListener(type,fn){if(type==='message')listeners.add(fn);},removeEventListener(type,fn){listeners.delete(fn);},postMessage(packet){if(channel.closed)throw Error('closed');history.push(structuredClone(packet));for(const other of channels)if(other!==channel&&!other.closed)queueMicrotask(()=>other.dispatch(structuredClone(packet)));},dispatch(packet){if(!channel.closed)for(const fn of listeners)fn({data:packet});},close(){channel.closed=true;channels.delete(channel);}};channels.add(channel);return channel;}
 return {windowAt,factory,history,advance(ms){time+=ms;},tick(){for(const fn of [...timers.values()])fn();},get channelCount(){return channels.size;},inject(packet){for(const channel of channels)queueMicrotask(()=>channel.dispatch(structuredClone(packet)));}};
}
const query=(ownerId='owner-a',editKey='image-a')=>({app:'mifito',url:EDITOR+'?mode=edit#ignored',ownerId,editKey});

test('unavailable BroadcastChannel safely falls back and owner IDs survive only the same tab storage',()=>{
 const env=environment(),storage=new Map(),win=env.windowAt(undefined,storage);
 assert.equal(createEditorDirectory({windowRef:win}),null);
 assert.equal(registerEditor({app:'mifito',windowRef:win,onConnect(){}}),null);
 assert.equal(createEditorDirectory({windowRef:{},channelFactory:env.factory}),null);
 assert.equal(studioOwnerId(win),studioOwnerId(env.windowAt(undefined,storage)));
 assert.notEqual(studioOwnerId(win),studioOwnerId(env.windowAt()));
 const denied={sessionStorage:{getItem(){throw Error('denied');}}};assert.equal(studioOwnerId(denied),studioOwnerId(denied));
});

test('discovers canonical editor URL and exchanges addressed envelopes only after a claim',async()=>{
 const env=environment(),studioWindow=env.windowAt(),editorWindow=env.windowAt(EDITOR+'?one=1#two');let hostConnection;const toHost=[],toStudio=[];
 const directory=createEditorDirectory({windowRef:studioWindow,channelFactory:env.factory});
 const host=registerEditor({app:'mifito',windowRef:editorWindow,channelFactory:env.factory,getState:()=>({editKey:'image-a'}),onConnect(connection){hostConnection=connection;connection.listen(event=>toHost.push(event));connection.parent.postMessage({type:'ready'},ORIGIN);}});
 await flush();const peer=directory.findKnown(query());assert.ok(peer);assert.equal(peer.url,EDITOR);assert.equal(peer.ownerId,null);
 const connection=directory.connect(peer,{ownerId:'owner-a',nonce:'nonce-a',onMessage:event=>toStudio.push(event)});
 assert.throws(()=>connection.window.postMessage({project:'too-early'},ORIGIN),/準備/);
 assert.equal(await connection.ready,connection.window);await flush();
 assert.equal(toStudio[0].source,connection.window);assert.equal(toStudio[0].origin,ORIGIN);assert.deepEqual(toStudio[0].data,{type:'ready'});
 connection.window.postMessage({project:'one'},ORIGIN);await flush();assert.equal(toHost[0].source,hostConnection.parent);assert.deepEqual(toHost[0].data,{project:'one'});
 connection.window.postMessage({project:'wrong-origin'},'https://elsewhere.test');await flush();assert.equal(toHost.length,1);
 connection.window.focus();hostConnection.parent.focus();await flush();assert.equal(editorWindow.focusCount,1);assert.equal(studioWindow.focusCount,1);
 assert.equal(hostConnection.ownerId,'owner-a');assert.equal(hostConnection.context.nonce,'nonce-a');assert.ok(hostConnection.clientId);
 directory.close();host.close();assert.equal(env.channelCount,0);
});

test('async find discovers hosts opened before the directory and ranks owner plus edit key',async()=>{
 const env=environment(),hosts=[];
 for(const state of [{},{ownerId:'owner-a',editKey:'image-b'},{ownerId:'owner-a',editKey:'image-a'},{ownerId:'other',editKey:'image-a'}])hosts.push(registerEditor({app:'mifito',url:EDITOR,windowRef:env.windowAt(EDITOR),channelFactory:env.factory,getState:()=>state,onConnect(){}}));
 const directory=createEditorDirectory({windowRef:env.windowAt(),channelFactory:env.factory});
 const found=await directory.find(query());assert.equal(found.ownerId,'owner-a');assert.equal(found.editKey,'image-a');
 assert.equal(directory.findKnown({...query(),url:ORIGIN+'/another/'}),null);
 assert.equal(directory.findKnown({...query(),url:'https://other.test/mifito/'}),null);
 directory.close();for(const host of hosts)host.close();
});

test('foreign owners cannot steal active or native-reserved hosts; release permits a new owner',async()=>{
 const env=environment();let connectCount=0;
 const host=registerEditor({app:'mifito',url:EDITOR,windowRef:env.windowAt(EDITOR),channelFactory:env.factory,getState:()=>({ownerId:'owner-a'}),onConnect(){connectCount++;}});
 const a=createEditorDirectory({windowRef:env.windowAt(),channelFactory:env.factory}),b=createEditorDirectory({windowRef:env.windowAt(),channelFactory:env.factory});await flush();
 const peer=a.findKnown(query());assert.ok(peer);assert.equal(b.findKnown(query('owner-b')),null);
 const blockedNative=b.connect(peer,{ownerId:'owner-b',nonce:'foreign-native'});await assert.rejects(blockedNative.ready,/別の/);assert.equal(connectCount,0);
 const accepted=a.connect(peer,{ownerId:'owner-a',nonce:'a'});await accepted.ready;await flush();
 const blockedActive=b.connect(peer,{ownerId:'owner-b',nonce:'foreign-active'});await assert.rejects(blockedActive.ready,/別の/);assert.equal(connectCount,1);
 accepted.close();await flush();assert.equal(b.findKnown(query('owner-b')).ownerId,null);
 const afterRelease=b.connect(b.findKnown(query('owner-b')),{ownerId:'owner-b',nonce:'b'});await afterRelease.ready;assert.equal(connectCount,2);
 a.close();b.close();host.close();
});

test('the acknowledged project in a normal tab outranks a different same-owner editor',async()=>{
 const env=environment(),hosts=[],hash='a'.repeat(64),directory=createEditorDirectory({windowRef:env.windowAt(),channelFactory:env.factory});
 const add=state=>{const host=registerEditor({app:'mifito',url:EDITOR,windowRef:env.windowAt(EDITOR),channelFactory:env.factory,getState:()=>state,onConnect(){}});hosts.push(host);return host;};
 add({ownerId:'foreign-owner',editKey:'image-a',projectHash:hash,occupied:true});
 const old=add({ownerId:'owner-a',editKey:'old-image',occupied:true});
 const normalState={editKey:'sent-normal-image',projectHash:hash,occupied:true},normal=add(normalState);
 const empty=add({editKey:'empty',occupied:false});add({editKey:'unknown'});add({editKey:'unrelated',occupied:true});
 await flush();const requested={...query(),projectHash:hash};
 assert.equal(directory.findKnown(requested).editKey,'sent-normal-image');
 const exact=add({ownerId:'owner-a',editKey:'image-a',projectHash:'b'.repeat(64),occupied:true});await flush();assert.equal(directory.findKnown(requested).editKey,'image-a');
 exact.close();await flush();assert.equal(directory.findKnown(requested).editKey,'sent-normal-image');
 normalState.projectHash=null;normal.update();await flush();assert.equal(directory.findKnown(requested).editKey,'old-image');
 old.close();await flush();assert.equal(directory.findKnown(requested).editKey,'empty');
 empty.close();await flush();assert.notEqual(directory.findKnown(requested).ownerId,'foreign-owner');assert.notEqual(directory.findKnown(requested).occupied,false);
 directory.close();for(const host of hosts)host.close();
});

test('only SHA-256 project hashes and explicit boolean occupancy enter discovery metadata',async()=>{
 const env=environment(),directory=createEditorDirectory({windowRef:env.windowAt(),channelFactory:env.factory}),state={projectHash:'not-a-digest',occupied:'false'};
 const host=registerEditor({app:'mifito',url:EDITOR,windowRef:env.windowAt(EDITOR),channelFactory:env.factory,getState:()=>state,onConnect(){}});await flush();
 let peer=directory.findKnown(query());assert.equal(peer.projectHash,null);assert.equal(peer.occupied,null);
 state.projectHash='c'.repeat(64);state.occupied=false;host.update();await flush();peer=directory.findKnown(query());assert.equal(peer.projectHash,state.projectHash);assert.equal(peer.occupied,false);
 const packet=env.history.findLast(packet=>packet.kind==='presence');
 for(const patch of [{projectHash:'C'.repeat(64)},{projectHash:'c'.repeat(63)},{projectHash:{}},{occupied:'false'}])env.inject({...packet,...patch,editKey:'tampered'});
 await flush();assert.equal(directory.findKnown(query()).editKey,null);
 directory.close();host.close();
});

test('same owner new document reclaims host while old client and tampered identity packets are ignored',async()=>{
 const env=environment(),received=[],clientReceived=[],hostConnections=[];let cleaned=0,oldLost=0;
 const host=registerEditor({app:'mifito',url:EDITOR,windowRef:env.windowAt(EDITOR),channelFactory:env.factory,onConnect(connection){hostConnections.push(connection);connection.listen(event=>received.push(event.data));return()=>{cleaned++;};}});
 const oldDirectory=createEditorDirectory({windowRef:env.windowAt(),channelFactory:env.factory});await flush();
 const old=oldDirectory.connect(oldDirectory.findKnown(query()),{ownerId:'owner-a',nonce:'old',onLost(){oldLost++;}});await old.ready;
 const directory=createEditorDirectory({windowRef:env.windowAt(),channelFactory:env.factory});await flush();
 const fresh=directory.connect(directory.findKnown(query()),{ownerId:'owner-a',nonce:'fresh',onMessage:event=>clientReceived.push(event.data)});await fresh.ready;await flush();
 assert.equal(old.window.closed,true);assert.equal(oldLost,1);assert.equal(cleaned,1);assert.equal(hostConnections[0].parent.closed,true);
 fresh.window.postMessage({correct:true},ORIGIN);await flush();const valid=env.history.findLast(packet=>packet.kind==='to-editor');assert.deepEqual(received,[{correct:true}]);
 for(const patch of [{ownerId:'wrong'},{clientId:'wrong'},{nonce:'wrong'},{hostId:'wrong'},{origin:'https://wrong.test'},{version:9}])env.inject({...valid,...patch,data:{tampered:true}});
 env.inject({...valid,clientId:hostConnections[0].clientId,nonce:'old',data:{stale:true}});await flush();assert.equal(received.length,1);
 hostConnections[1].parent.postMessage({reply:true},ORIGIN);await flush();assert.deepEqual(clientReceived,[{reply:true}]);
 const reply=env.history.findLast(packet=>packet.kind==='to-studio');
 for(const patch of [{ownerId:'wrong'},{clientId:'wrong'},{nonce:'wrong'},{hostId:'wrong'},{origin:'https://wrong.test'},{version:9}])env.inject({...reply,...patch,data:{tampered:true}});
 env.inject({...valid,kind:'release',nonce:'old'});await flush();assert.equal(clientReceived.length,1);assert.equal(fresh.window.closed,false);
 oldDirectory.close();directory.close();host.close();assert.equal(cleaned,2);
});

test('expired owner heartbeat permits takeover and heartbeat keeps active owner bound',async()=>{
 const env=environment();let hostConnection;
 const host=registerEditor({app:'mifito',url:EDITOR,windowRef:env.windowAt(EDITOR),channelFactory:env.factory,onConnect(connection){hostConnection=connection;}});
 const directory=createEditorDirectory({windowRef:env.windowAt(),channelFactory:env.factory});await flush();
 const connection=directory.connect(directory.findKnown(query()),{ownerId:'owner-a',nonce:'a'});await connection.ready;
 env.advance(20000);env.tick();await flush();env.advance(20000);host.update();await flush();assert.equal(hostConnection.parent.closed,false);
 env.advance(120001);host.update();await flush();assert.equal(hostConnection.parent.closed,true);assert.equal(connection.window.closed,true);
 assert.ok(directory.findKnown(query('owner-b')));
 const next=directory.connect(directory.findKnown(query('owner-b')),{ownerId:'owner-b',nonce:'b'});await next.ready;
 directory.close();host.close();
});

test('foreground leases refresh presence while background host timers are throttled',async()=>{
 const env=environment(),studioWindow=env.windowAt();let hostConnection;
 const host=registerEditor({app:'mifito',url:EDITOR,windowRef:env.windowAt(EDITOR),channelFactory:env.factory,onConnect(connection){hostConnection=connection;}});
 const directory=createEditorDirectory({windowRef:studioWindow,channelFactory:env.factory});await flush();
 const connection=directory.connect(directory.findKnown(query()),{ownerId:'owner-a',nonce:'a'});await connection.ready;
 for(let i=0;i<2;i++){const before=env.history.filter(packet=>packet.kind==='presence').length;env.advance(90000);studioWindow.tick();await flush();assert.ok(env.history.filter(packet=>packet.kind==='presence').length>before);assert.equal(hostConnection.parent.closed,false);assert.equal(connection.window.closed,false);}
 const before=env.history.filter(packet=>packet.kind==='discover').length;studioWindow.emit('focus');await flush();assert.ok(env.history.filter(packet=>packet.kind==='discover').length>before);
 directory.close();host.close();
});

test('host close and pagehide remove peers, close facades and notify once',async()=>{
 const env=environment(),editorWindow=env.windowAt(EDITOR);let lost=0;
 const directory=createEditorDirectory({windowRef:env.windowAt(),channelFactory:env.factory});
 const host=registerEditor({app:'mifito',windowRef:editorWindow,channelFactory:env.factory,onConnect(){}});await flush();
 const connection=directory.connect(directory.findKnown(query()),{ownerId:'owner-a',nonce:'a',onLost(){lost++;}});await connection.ready;
 editorWindow.emit('pagehide');await flush();assert.equal(connection.window.closed,true);assert.equal(lost,1);assert.equal(directory.findKnown(query()),null);
 host.close();directory.close();assert.equal(env.channelCount,0);
});
