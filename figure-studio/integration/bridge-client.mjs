/** Browser-only editing bridge. No project data is sent to a server. */
import {transferResult,transferReceipt,isTransferImageId,getFigureWorkspace} from './direct-transfer.mjs?v=source-batch-v070-1';
import {createEditorDirectory,studioOwnerId} from './editor-discovery.mjs?v=editor-reuse-v036-1';
export const BRIDGE_PROTOCOL = 'figure-studio-bridge-v1';
export const SOURCE_APPS = Object.freeze({
  plot: {name:'PlotLauncher Web', url:'https://murajun620-crypto.github.io/plot_launcher_web/', extension:'.plotproject'},
  mifito: {name:'MiFiTo Web', url:'https://murajun620-crypto.github.io/Microscopy_figure_tools_web/', extension:'.mifito'}
});
const MAX_PROJECT = 320 * 1024 * 1024;
// Each Figure Studio window keeps one live editor per source application/URL.
const editorPools = new WeakMap();
const directories=new WeakMap(),openingPools=new WeakMap();
export function setupSourceDiscovery({windowRef=window}={}){
 if(!directories.has(windowRef))directories.set(windowRef,createEditorDirectory({windowRef}));
 return directories.get(windowRef);
}

// Discover already-open normal editors before creating a fallback tab. The
// facade remains synchronous so callers can retain/cancel the pending session.
export function openSource(options){
 options={...options,onResult:options.onResult??(()=>{}),onStatus:options.onStatus??(()=>{})};
 const windowRef=options.windowRef||window,spec=SOURCE_APPS[options.app];
 if(!spec)return openSourceSession(options);
 const target=new URL(options.url||spec.url,windowRef.location.href);target.hash='';
 const key=`${options.app}:${target.href}`,existing=editorPools.get(windowRef)?.get(key);
 if(existing&&!existing.window.closed&&!options.forceNew)return existing.open({...options,editKey:String(options.editKey??options.panelId)});
 const directory=setupSourceDiscovery({windowRef});
 if(!directory||target.origin!==windowRef.location.origin||options.forceNew)return openSourceSession(options);
 let openings=openingPools.get(windowRef);if(!openings){openings=new Map();openingPools.set(windowRef,openings);}
 const current=openings.get(key);
 if(current){
  if(current.options.panelId===options.panelId&&current.options.editKey===options.editKey){Object.assign(current.options,options);return current.facade;}
  options.onStatus?.({state:'busy',message:'編集画面への接続が終わってから、もう一度対象の図を開いてください。'});
  return {window:null,close(){},ready:Promise.resolve({connected:false,reason:'busy'})};
 }
 let real=null,cancelled=false,settle;
 const record={options:{...options},facade:null};
 const ready=new Promise(resolve=>{settle=resolve;});
 const facade={get window(){return real?.window||null;},ready,downloadProject:()=>downloadBlob(record.options.project,record.options.sourceName||`source${spec.extension}`,windowRef.document),close(){cancelled=true;real?.close();settle({connected:false,reason:'closed'});if(openings.get(key)===record)openings.delete(key);}};
 record.facade=facade;openings.set(key,record);
 options.onStatus?.({state:'opening',message:`開いている${spec.name}を探しています…`});
 const workspace=getFigureWorkspace(windowRef);
 const ownerId=workspace?.ownerId||studioOwnerId(windowRef);
 if(workspace?.openEditor)workspace.openEditor(options.app,{url:target.href,ownerId});
 Promise.resolve().then(async()=>{
  let projectHash;
  try{projectHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await options.project.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');}catch{}
  const query={app:options.app,url:target.href,ownerId,editKey:options.editKey,projectHash,...(workspace?{workspace:true}:{})};
  const deadline=Date.now()+timeoutForWorkspace(options);
  let peer=await directory.find(query);
  while(workspace&&!peer&&!cancelled&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,250));peer=await directory.find(query);}
  if(workspace&&!peer)throw Error('編集画面の準備を確認できませんでした。対象の図をもう一度開くと、同じタブ内で再接続します。');
  return peer;
 }).then(peer=>{
  if(cancelled)return;
  real=openSourceSession({...record.options,windowRef,directoryPeer:peer,directory});
  if(openings.get(key)===record)openings.delete(key);
  return real.ready.then(settle);
 }).catch(error=>{if(!cancelled){options.onStatus?.({state:'error',message:error.message});settle({connected:false,reason:'connection-failed'});}if(openings.get(key)===record)openings.delete(key);});
 return facade;
}
function timeoutForWorkspace(options){return options.timeoutMs??30000;}

export function downloadBlob(blob, name, documentRef = document) {
  const url = URL.createObjectURL(blob);
  const a = documentRef.createElement('a');
  a.href = url; a.download = name; a.hidden = true;
  documentRef.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function isBridgeMessage(event, context) {
  const message = event?.data;
  return event?.origin === context.origin && event?.source === context.popup &&
    message?.protocol === BRIDGE_PROTOCOL && message?.nonce === context.nonce &&
    message?.app === context.app && typeof message.type === 'string';
}

/**
 * Must be called directly from a click/key handler so browsers allow the popup.
 * onStatus receives {state,message,downloadProject}; ready always resolves.
 * url is an optional adapter-enabled copy of the source app (for development).
 */
function openSourceSession({app, project, sourceName, panelId, editKey, imageId, onResult = () => {}, onStatus = () => {},
  url, timeoutMs = 20000, loadTimeoutMs=210000, windowRef = window,directoryPeer,directory,forceNew=false}) {
  const spec = SOURCE_APPS[app];
  if (!spec) throw new Error('連携先が不明です。');
  if (!(project instanceof Blob) || !project.size || project.size > MAX_PROJECT) throw new Error('有効な元プロジェクトを添付してください（320 MB以内）。');
  if (!panelId || typeof panelId !== 'string') throw new Error('図の識別子が必要です。');
  if(imageId!==undefined&&!isTransferImageId(imageId))throw Error('画像の識別子が正しくありません。');
  const origin = windowRef.location.origin;
  if (!/^https?:\/\//.test(origin)) throw new Error('Web連携はHTTPまたはHTTPSで開いて利用してください。');
  const target = new URL(url || spec.url, windowRef.location.href);
  if (target.protocol !== 'https:' && !(target.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(target.hostname))) throw new Error('連携先はHTTPSで指定してください。');
  target.hash='';
  const poolKey=`${app}:${target.href}`;
  let pool=editorPools.get(windowRef);if(!pool){pool=new Map();editorPools.set(windowRef,pool);}
  const args={project,panelId,editKey:String(editKey??panelId),imageId,sourceName,onResult,onStatus};
  const existing=pool.get(poolKey);
  if(existing&&!existing.window.closed&&!forceNew)return existing.open(args);
  existing?.close();
  const nonce = crypto.randomUUID();
  const workspace=getFigureWorkspace(windowRef);
  const ownerId=workspace?.ownerId||studioOwnerId(windowRef);
  target.hash = new URLSearchParams({figureBridge:nonce, figureOrigin:origin,figureOwner:ownerId}).toString();
  let connection=null;
  if(directoryPeer)connection=directory.connect(directoryPeer,{ownerId,nonce,onMessage:event=>receive(event),onLost:()=>{status(pending||current,'error','編集画面への接続が切れました。対象の図をもう一度開いて再接続してください。');close();}});
  const popup = connection?.window||(workspace?.openEditor?workspace.openEditor(app,{url:target.href,nonce,origin,ownerId}):windowRef.open(target.href, `figure-editor-${nonce}`));
  const safeName=value=>String(value||`source${spec.extension}`).replace(/[\\/]/g,'_');
  if (!popup) {
    const downloadProject=()=>downloadBlob(project,safeName(sourceName),windowRef.document);
    onStatus({state:'error',message:'編集画面を開けませんでした。ポップアップを許可して、もう一度お試しください。',downloadProject});
    return {window:null, close(){}, downloadProject, ready:Promise.resolve({connected:false,reason:'popup-blocked'})};
  }
  const context = {origin:target.origin,popup,nonce,app};
  let disposed=false,initialized=false,activeHost='',reuse=false,current=null,pending=null;
  const retiredHosts=new Set();
  function request(options){
    let settle;const ready=new Promise(resolve=>{settle=resolve;});
    return {...options,sourceName:safeName(options.sourceName),requestId:crypto.randomUUID(),ready,settle,loaded:false,latestRevision:0,applyingRevision:0,lastLoadAt:0,deadline:0,timedOut:false,confirming:false};
  }
  function downloadFor(r){return()=>downloadBlob(r.project,r.sourceName,windowRef.document);}
  function status(r,state,message){r?.onStatus({state,message,downloadProject:downloadFor(r),openInNewTab:workspace?undefined:()=>openSource({app,project:r.project,sourceName:r.sourceName,panelId:r.panelId,editKey:r.editKey,imageId:r.imageId,onResult:r.onResult,onStatus:r.onStatus,url,windowRef,forceNew:true})});}
  const send=(type,r,extra={})=>{if(!disposed&&!popup.closed)try{popup.postMessage({protocol:BRIDGE_PROTOCOL,nonce,app,hostId:activeHost,type,panelId:r?.panelId,requestId:r?.requestId,...extra},target.origin);}catch{/* Discovery claims and reattachment can briefly be in flight. */}};
  function load(r,reconnect=false){
    r.loaded=false;r.latestRevision=0;r.applyingRevision=0;pending=r;r.reconnect=reconnect;r.deadline=Date.now()+loadTimeoutMs;r.timedOut=false;r.confirming=false;
    sendLoad(r);
    status(r,'loading',reconnect?'編集画面へ再接続しています…':'元プロジェクトを編集画面へ読み込んでいます…');
  }
  function sendLoad(r){
    r.lastLoadAt=Date.now();
    send('load',r,{project:r.project,sourceName:r.sourceName,editKey:r.editKey,reconnect:!!r.reconnect,capabilities:['batch-v1'],...(r.imageId?{imageId:r.imageId}:{})});
  }
  function facade(r){return {window:popup,close,ready:r.ready,downloadProject:downloadFor(r)};}
  function focus(){try{workspace?.show(app);popup.focus?.();}catch{}}
  function open(options){
    focus();
    const same=(pending?[pending]:[current]).find(r=>r&&r.panelId===options.panelId&&r.editKey===options.editKey);
    if(same&&pending===same&&!same.loaded&&!same.timedOut){
      same.onResult=options.onResult;same.onStatus=options.onStatus;return facade(same);
    }
    if(same&&pending===same&&same.timedOut)pending=null;
    // A warm tab may have opened another project since its last acknowledgement.
    // Use a fresh request and await the editor's target-selection acknowledgement.
    // The host reuses the live project when the bound snapshot still matches.
    const r=request(options);
    if(pending){status(r,'busy','編集画面の読み込みが終わってから、もう一度対象の図を開いてください。');r.settle({connected:false,reason:'busy'});return facade(r);}
    if(initialized&&!reuse){status(r,'unavailable','編集画面を最新版へ更新してから、もう一度対象の図を開いてください。現在の編集内容はそのまま残っています。');r.settle({connected:false,reason:'adapter-outdated'});return facade(r);}
    pending=r;if(initialized)load(r);else status(r,'opening',`${spec.name} を開いています…`);
    return facade(r);
  }
  pending=request(args);
  const timeout = setTimeout(() => {
    if (!initialized && !disposed) {
      status(pending,'unavailable', `${spec.name} の連携機能が応答していません。公開版が未対応の場合は、元プロジェクトを保存し、編集画面で開いてください。`);
      pending?.settle({connected:false,reason:'adapter-unavailable'});
    }
  }, timeoutMs);
  const interval = setInterval(() => {
    if (popup.closed) {status(pending||current,'closed','編集画面を閉じました。'); close();}
    else if(pending&&initialized&&!pending.loaded){
      if(pending.confirming)return;
      if(Date.now()>pending.deadline&&!pending.timedOut){pending.timedOut=true;status(pending,'error','元プロジェクトの読み込みを確認できません。対象の図をもう一度開くと、同じタブで再試行します。');pending.settle({connected:false,reason:'load-timeout'});}
      if(!pending.timedOut&&Date.now()-pending.lastLoadAt>2000)send('ping',pending);
      if(!pending.timedOut&&Date.now()-pending.lastLoadAt>5000)sendLoad(pending);
    }else if(!initialized)send('ping',pending);
  }, 1200);

  async function receive(event) {
    if (disposed || !isBridgeMessage(event,context)) return;
    const message = event.data;
    if (message.type !== 'ready' && activeHost && message.hostId !== activeHost) return;
    if (message.type === 'ready' && (!initialized || (message.hostId && message.hostId !== activeHost))) {
      if(message.hostId&&retiredHosts.has(message.hostId))return;
      const reconnect = initialized;
      if(activeHost)retiredHosts.add(activeHost);
      activeHost = message.hostId || '';
      reuse=Array.isArray(message.capabilities)&&message.capabilities.includes('reuse-v1');
      initialized = true; clearTimeout(timeout);
      const r=pending||current;if(r){status(r,'connected', `${spec.name} に接続しました。`);load(r,reconnect);}
      return;
    }
    // Legacy adapters have one request; capable adapters must echo its identity.
    const r=reuse?[pending,current].find(r=>r&&r.requestId===message.requestId):(pending||current);
    if(!r)return;
    if(reuse&&message.panelId!==r.panelId)return;
    if(message.type==='detached'){
      // A manual project replacement invalidates only this exact bridge route.
      // Keep the editor alive; the next open must discover/reconnect it afresh.
      if(!initialized||!activeHost||message.hostId!==activeHost||message.requestId!==r.requestId||message.panelId!==r.panelId||message.editKey!==r.editKey)return;
      try{status(r,'detached',String(message.message||'編集画面との関連付けが解除されました。対象の図をもう一度開いてください。'));}
      finally{close();}
      return;
    } else if (message.type === 'loaded') {
      if(r!==pending&&r!==current)return;
      current=r;if(pending===r)pending=null;r.loaded=true;r.confirming=false;
      status(r,'ready','元プロジェクトを開きました。修正後に「Figureへ反映」を押してください。');
      r.settle({connected:true});
    } else if(message.type==='switch-confirmation'){
      if(r!==pending)return;
      r.confirming=true;r.deadline=Infinity;
      status(r,'confirming','未反映の編集を破棄して開くか、確認しています…');
    } else if(message.type==='switch-confirmed'){
      if(r!==pending||!r.confirming)return;
      r.confirming=false;r.deadline=Date.now()+loadTimeoutMs;r.lastLoadAt=Date.now();
      status(r,'loading','指定した元プロジェクトを開いています…');
    } else if(message.type==='switch-blocked'){
      if(r!==pending)return;
      pending=null;r.confirming=false;status(r,message.cancelled===true?'cancelled':'blocked',String(message.message||'編集画面の内容を「Figureへ反映」してから、もう一度対象の図を開いてください。'));
      r.settle({connected:false,reason:message.cancelled===true?'switch-cancelled':'switch-blocked'});
    } else if (message.type === 'applying') {
      status(r,'applying','編集結果を受け取っています…');
    } else if (message.type === 'error') {
      r.confirming=false;
      status(r,'error',String(message.message || '連携処理に失敗しました。'));
      r.settle({connected:false,reason:'editor-error'});
      if(message.code==='load-failed'){
        r.loaded=false;
        if(r===pending){pending=null;current=null;}
        else if(r===current)current=null;
      }
    } else if (message.type === 'result' && initialized) {
      if (message.panelId !== r.panelId || !Number.isSafeInteger(message.revision) || message.revision <= r.latestRevision || r.applyingRevision) return;
      let result;
      try{result=transferResult(app,message,message.sourceName||r.sourceName);}catch{
        send('rejected',r,{revision:message.revision,message:'編集結果の形式・サイズを確認してください。'});
        status(r,'error','編集結果の形式・サイズが対応範囲外です。'); return;
      }
      r.applyingRevision = message.revision;const host=activeHost;
      try {
        const applied=await r.onResult({...result,panelId:r.panelId,app,revision:message.revision});
        if(disposed||activeHost!==host)return;
        r.latestRevision = message.revision;r.project = message.project;r.sourceName=safeName(message.sourceName||r.sourceName);
        if(typeof applied?.editKey==='string')r.editKey=applied.editKey;
        if(isTransferImageId(applied?.imageId))r.imageId=applied.imageId;
        const receipt=transferReceipt(applied);
        send('accepted',r,{revision:message.revision,editKey:r.editKey,...receipt,...(r.imageId?{imageId:r.imageId}:{})});
        status(r,'updated',receipt.message||'配置を保って編集結果を反映しました。');
      } catch (error) {
        if(disposed||activeHost!==host)return;
        send('rejected',r,{revision:message.revision,message:error.message || 'Figureへの反映に失敗しました。'});
        status(r,'error',error.message || 'Figureへの反映に失敗しました。');
      } finally {if(activeHost===host)r.applyingRevision = 0;}
    }
  }
  function close() {
    if (disposed) return;
    disposed = true; clearTimeout(timeout); clearInterval(interval);
    connection?.close();
    windowRef.removeEventListener('message',receive);
    pending?.settle({connected:false,reason:'closed'});current?.settle({connected:false,reason:'closed'});
    if(pool.get(poolKey)===controller)pool.delete(poolKey);
  }
  const controller={window:popup,open,close};pool.set(poolKey,controller);
  windowRef.addEventListener('message',receive);
  connection?.ready.then(()=>{focus();send('ping',pending);}).catch(error=>{if(!disposed){status(pending||current,'error',error.message||'編集画面に接続できませんでした。対象の図をもう一度開いてください。');close();}});
  status(pending,'opening',`${spec.name} を開いています…`);
  return facade(pending);
}

/** Tear down bridge listeners when abandoning the Studio window, without closing editors. */
export function closeSourceSessions({windowRef=window}={}){
  for(const session of [...(editorPools.get(windowRef)?.values()||[])])session.close();
}
