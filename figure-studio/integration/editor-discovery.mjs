// Same-origin discovery is independent of window.opener and browser window names.
const CHANNEL='figure-studio-editor-directory-v1',PROTOCOL='figure-studio-editor-directory',VERSION=1;
const LEASE_MS=120000,HEARTBEAT_MS=5000,DISCOVERY_MS=180,CONNECT_MS=5000;
const fallbackOwners=new WeakMap();let fallbackOwner=null;
const id=value=>typeof value==='string'&&value.length>0&&value.length<=256;
const projectHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const token=win=>{try{return win?.crypto?.randomUUID?.()||globalThis.crypto?.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;}catch{return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;}};
const now=win=>typeof win?.Date?.now==='function'?win.Date.now():Date.now();
function locationOf(win){try{const url=new URL(win.location.href);return /^(https?:)$/.test(url.protocol)?url:null;}catch{return null;}}
function canonical(value,base){try{const url=new URL(value,base);return /^(https?:)$/.test(url.protocol)?url.origin+url.pathname:null;}catch{return null;}}
function clock(win,name){return typeof win?.[name]==='function'?win[name].bind(win):globalThis[name].bind(globalThis);}
function openChannel(win,factory){try{const channel=factory?factory(CHANNEL):typeof win?.BroadcastChannel==='function'?new win.BroadcastChannel(CHANNEL):null;return channel&&typeof channel.postMessage==='function'?channel:null;}catch{return null;}}
function listenChannel(channel,fn){if(typeof channel.addEventListener==='function'){channel.addEventListener('message',fn);return()=>channel.removeEventListener?.('message',fn);}channel.onmessage=fn;return()=>{if(channel.onmessage===fn)channel.onmessage=null;};}
function listenExit(win,fn){win?.addEventListener?.('pagehide',fn);return()=>win?.removeEventListener?.('pagehide',fn);}
function validPacket(packet,origin){return packet&&packet.protocol===PROTOCOL&&packet.version===VERSION&&packet.origin===origin&&typeof packet.kind==='string';}
function send(channel,origin,packet){try{channel.postMessage({protocol:PROTOCOL,version:VERSION,origin,...packet});return true;}catch{return false;}}
function safeState(getState){try{const value=getState();return value&&typeof value==='object'?value:{};}catch{return {};}}
function cleanResult(value){try{if(typeof value==='function')value();else value?.close?.();}catch{}}

/** Survives a Studio reload; each live directory also has a fresh document clientId. */
export function studioOwnerId(windowRef=globalThis.window){
 const key='figure-studio-editor-owner-v1';
 if(windowRef&&(typeof windowRef==='object'||typeof windowRef==='function')&&fallbackOwners.has(windowRef))return fallbackOwners.get(windowRef);
 const fallback=()=>{if(windowRef&&(typeof windowRef==='object'||typeof windowRef==='function')){if(!fallbackOwners.has(windowRef))fallbackOwners.set(windowRef,token(windowRef));return fallbackOwners.get(windowRef);}return fallbackOwner??=token(windowRef);};
 try{const saved=windowRef?.sessionStorage?.getItem(key);if(id(saved)){fallbackOwners.set(windowRef,saved);return saved;}const fresh=fallback();windowRef?.sessionStorage?.setItem(key,fresh);return fresh;}catch{return fallback();}
}

export function createEditorDirectory({windowRef=globalThis.window,channelFactory}={}){
 const location=locationOf(windowRef);if(!location)return null;
 const channel=openChannel(windowRef,channelFactory);if(!channel)return null;
 const origin=location.origin,clientId=token(windowRef),peers=new Map(),connections=new Map(),findWaiters=new Set();
 const timeout=clock(windowRef,'setTimeout'),clearTimeout_=clock(windowRef,'clearTimeout'),interval=clock(windowRef,'setInterval'),clearInterval_=clock(windowRef,'clearInterval');
 let closed=false;
 const post=packet=>!closed&&send(channel,origin,{clientId,...packet});
 function expire(){const time=now(windowRef);for(const [hostId,peer]of peers)if(time-peer.lastSeen>LEASE_MS){peers.delete(hostId);const connection=connections.get(hostId);if(connection)finish(connection,new Error('編集タブとの接続が切れました。'));}}
 function matches(peer,query){return peer.app===query.app&&peer.url===canonical(query.url,location.href)&&(!peer.ownerId||peer.ownerId===query.ownerId)&&(query.workspace===undefined||peer.workspace===query.workspace);}
 function findKnown(query={}){
  if(closed||!id(query.ownerId))return null;expire();
  return [...peers.values()].filter(peer=>matches(peer,query)).sort((a,b)=>{
   const rank=peer=>peer.ownerId===query.ownerId&&query.editKey&&peer.editKey===query.editKey?0:projectHash(query.projectHash)&&peer.projectHash===query.projectHash?1:peer.ownerId===query.ownerId?2:peer.occupied===false?3:4;
   return rank(a)-rank(b)||b.lastSeen-a.lastSeen||a.hostId.localeCompare(b.hostId);
  }).map(({lastSeen,...peer})=>peer)[0]||null;
 }
 function find(query={}){
  const known=findKnown(query);if(known||closed)return Promise.resolve(known);
  post({kind:'discover'});
  return new Promise(resolve=>{const waiter={resolve,timer:null};waiter.timer=timeout(()=>{findWaiters.delete(waiter);resolve(findKnown(query));},DISCOVERY_MS);findWaiters.add(waiter);});
 }
 function finish(connection,error,{notify=true}={}){
  if(connection.closed)return;connection.closed=true;clearTimeout_(connection.timer);connections.delete(connection.hostId);
  if(notify)post({kind:'release',hostId:connection.hostId,ownerId:connection.ownerId,nonce:connection.nonce});
  if(!connection.settled){connection.settled=true;connection.reject(error||new Error('編集タブへの接続を閉じました。'));}
  if(error){try{connection.onLost?.(error);}catch{}}
 }
 function connect(peer,{ownerId,nonce=token(windowRef),onMessage,onLost}={}){
  if(closed||!peer||!id(peer.hostId)||!id(ownerId)||!id(nonce)||peer.origin!==origin||!peers.has(peer.hostId))throw new Error('編集タブを確認できませんでした。');
  const prior=connections.get(peer.hostId);if(prior)finish(prior,null);
  const connection={hostId:peer.hostId,ownerId,nonce,onMessage,onLost,closed:false,active:false,settled:false,queue:[]};
  const address=kind=>({kind,hostId:connection.hostId,ownerId,nonce});
  const virtualPopup={
   get closed(){expire();return connection.closed;},
   postMessage(data,targetOrigin){if(connection.closed||!connection.active)throw new Error('編集タブとの接続が準備できていません。');if(targetOrigin!==origin&&targetOrigin!=='*')return;post({...address('to-editor'),data});},
   focus(){if(!connection.closed)post(address('focus-editor'));}
  };
  connection.window=virtualPopup;
  const ready=new Promise((resolve,reject)=>{connection.resolve=resolve;connection.reject=reject;});
  connections.set(peer.hostId,connection);
  connection.timer=timeout(()=>finish(connection,new Error('編集タブへの接続がタイムアウトしました。')),CONNECT_MS);
  post({...address('claim'),app:peer.app,url:peer.url});
  return {window:virtualPopup,ready,close:()=>finish(connection,null)};
 }
 function dispatch(connection,data){try{connection.onMessage?.({source:connection.window,origin,data});}catch{}}
 const unlisten=listenChannel(channel,event=>{
  const packet=event?.data;if(closed||!validPacket(packet,origin))return;
  if(packet.kind==='presence'){
   if(!id(packet.hostId)||!id(packet.app)||canonical(packet.url,location.href)!==packet.url||!packet.url.startsWith(origin+'/')||packet.ownerId!=null&&!id(packet.ownerId)||packet.editKey!=null&&typeof packet.editKey!=='string'||packet.projectHash!=null&&!projectHash(packet.projectHash)||packet.occupied!=null&&typeof packet.occupied!=='boolean')return;
   peers.set(packet.hostId,{hostId:packet.hostId,app:packet.app,url:packet.url,origin,ownerId:packet.ownerId||null,editKey:packet.editKey||null,projectHash:packet.projectHash||null,occupied:typeof packet.occupied==='boolean'?packet.occupied:null,workspace:packet.workspace===true,busy:packet.busy===true,binding:packet.binding??null,lastSeen:now(windowRef)});return;
  }
  if(packet.kind==='gone'){
   if(!id(packet.hostId))return;peers.delete(packet.hostId);const connection=connections.get(packet.hostId);if(connection)finish(connection,new Error('編集タブが閉じられました。'),{notify:false});return;
  }
  const connection=connections.get(packet.hostId);
  if(!connection||packet.clientId!==clientId||packet.ownerId!==connection.ownerId||packet.nonce!==connection.nonce)return;
  const peer=peers.get(packet.hostId);if(peer)peer.lastSeen=now(windowRef);
  if(packet.kind==='connected'){
   if(connection.active)return;connection.active=true;connection.settled=true;clearTimeout_(connection.timer);connection.resolve(connection.window);
   for(const data of connection.queue.splice(0))dispatch(connection,data);
  }else if(packet.kind==='blocked'||packet.kind==='lost')finish(connection,new Error(packet.kind==='blocked'?'この編集タブは別のFigure Studioに接続されています。':'編集タブとの接続が切れました。'),{notify:false});
  else if(packet.kind==='to-studio'){if(connection.active)dispatch(connection,packet.data);else connection.queue.push(packet.data);}
  else if(packet.kind==='focus-studio'){try{windowRef.focus?.();}catch{}}
 });
 const heartbeat=interval(()=>{expire();for(const connection of connections.values())if(connection.active)post({kind:'lease',hostId:connection.hostId,ownerId:connection.ownerId,nonce:connection.nonce});},HEARTBEAT_MS);heartbeat?.unref?.();
 const refresh=()=>{if(windowRef.document?.visibilityState==='hidden')return;post({kind:'discover'});for(const connection of connections.values())if(connection.active)post({kind:'lease',hostId:connection.hostId,ownerId:connection.ownerId,nonce:connection.nonce});};
 windowRef.addEventListener?.('focus',refresh);windowRef.addEventListener?.('pageshow',refresh);windowRef.document?.addEventListener?.('visibilitychange',refresh);
 const unexit=listenExit(windowRef,close);
 function close(){if(closed)return;for(const connection of [...connections.values()])finish(connection,null);closed=true;clearInterval_(heartbeat);for(const waiter of findWaiters){clearTimeout_(waiter.timer);waiter.resolve(null);}findWaiters.clear();windowRef.removeEventListener?.('focus',refresh);windowRef.removeEventListener?.('pageshow',refresh);windowRef.document?.removeEventListener?.('visibilitychange',refresh);unexit();unlisten();channel.close?.();peers.clear();}
 post({kind:'discover'});
 return {findKnown,find,connect,close};
}

export function registerEditor({app,url,windowRef=globalThis.window,channelFactory,getState=()=>({}),onConnect}={}){
 const location=locationOf(windowRef),editorUrl=location&&canonical(url||location.href,location.href);
 if(!location||!id(app)||!editorUrl||new URL(editorUrl).origin!==location.origin||typeof onConnect!=='function')return null;
 const channel=openChannel(windowRef,channelFactory);if(!channel)return null;
 const origin=location.origin,hostId=token(windowRef),interval=clock(windowRef,'setInterval'),clearInterval_=clock(windowRef,'clearInterval');
 const workspaceOwner=location.searchParams.get('figureWorkspace')==='1'&&id(location.searchParams.get('figureWorkspaceOwner'))?location.searchParams.get('figureWorkspaceOwner'):null;
 let closed=false,session=null,hasClaimed=false;
 const post=packet=>!closed&&send(channel,origin,{hostId,...packet});
 function disconnect(target,{notify=true}={}){
  if(!target||target.closed)return;target.closed=true;if(session===target)session=null;
  if(notify)post({kind:'lost',clientId:target.clientId,ownerId:target.ownerId,nonce:target.nonce});
  target.listeners.clear();cleanResult(target.cleanup);target.cleanup=null;
 }
 function expire(){if(session&&now(windowRef)-session.lastSeen>LEASE_MS)disconnect(session);}
 function update(){if(closed)return;expire();const state=safeState(getState);post({kind:'presence',app,url:editorUrl,workspace:new URL(location.href).searchParams.get('figureWorkspace')==='1',ownerId:session?.ownerId||workspaceOwner||(!hasClaimed&&id(state.ownerId)?state.ownerId:null),editKey:typeof state.editKey==='string'?state.editKey:null,projectHash:projectHash(state.projectHash)?state.projectHash:null,occupied:typeof state.occupied==='boolean'?state.occupied:null,busy:state.busy===true,binding:state.binding??null});}
 function sameSession(packet){return session&&!session.closed&&packet.clientId===session.clientId&&packet.ownerId===session.ownerId&&packet.nonce===session.nonce;}
 async function claim(packet){
  if(packet.hostId!==hostId||packet.app!==app||packet.url!==editorUrl||!id(packet.clientId)||!id(packet.ownerId)||!id(packet.nonce))return;
  expire();const state=safeState(getState),owner=session?.ownerId||workspaceOwner||(!hasClaimed&&id(state.ownerId)?state.ownerId:null);
  if(owner&&owner!==packet.ownerId){post({kind:'blocked',clientId:packet.clientId,ownerId:packet.ownerId,nonce:packet.nonce});return;}
  if(sameSession(packet)){session.lastSeen=now(windowRef);if(session.connected)post({kind:'connected',clientId:packet.clientId,ownerId:packet.ownerId,nonce:packet.nonce});return;}
  disconnect(session);
  const target={clientId:packet.clientId,ownerId:packet.ownerId,nonce:packet.nonce,lastSeen:now(windowRef),listeners:new Set(),closed:false,connected:false,cleanup:null};session=target;hasClaimed=true;
  const address=kind=>({kind,clientId:target.clientId,ownerId:target.ownerId,nonce:target.nonce});
  const parent={
   get closed(){expire();return closed||target.closed;},
   postMessage(data,targetOrigin){if(closed||target.closed)throw new Error('Figure Studioとの接続が閉じられました。');if(targetOrigin!==origin&&targetOrigin!=='*')return;post({...address('to-studio'),data});},
   focus(){if(!closed&&!target.closed)post(address('focus-studio'));}
  };
  target.parent=parent;
  try{
   const cleanup=await onConnect({parent,ownerId:target.ownerId,clientId:target.clientId,context:{nonce:target.nonce,origin,ownerId:target.ownerId,clientId:target.clientId},listen(fn){if(typeof fn!=='function'||target.closed)return()=>{};target.listeners.add(fn);return()=>target.listeners.delete(fn);},close(){disconnect(target);update();}});
   if(target.closed||closed||session!==target){cleanResult(cleanup);return;}target.cleanup=cleanup;target.connected=true;
   post(address('connected'));update();
  }catch{disconnect(target);update();}
 }
 const unlisten=listenChannel(channel,event=>{
  const packet=event?.data;if(closed||!validPacket(packet,origin))return;
  if(packet.kind==='discover'){update();return;}
  if(packet.kind==='claim'){void claim(packet);return;}
  if(packet.hostId!==hostId)return;expire();if(!sameSession(packet))return;
  session.lastSeen=now(windowRef);
  if(packet.kind==='release'){disconnect(session,{notify:false});update();}
  else if(packet.kind==='lease')update();
  else if(packet.kind==='to-editor'){const envelope={source:session.parent,origin,data:packet.data};for(const listener of [...session.listeners])try{listener(envelope);}catch{}}
  else if(packet.kind==='focus-editor'){try{windowRef.focus?.();}catch{}}
 });
 const heartbeat=interval(update,HEARTBEAT_MS);heartbeat?.unref?.();
 const unexit=listenExit(windowRef,close);
 function close(){if(closed)return;disconnect(session);post({kind:'gone'});closed=true;clearInterval_(heartbeat);unexit();unlisten();channel.close?.();}
 update();return {update,close};
}
