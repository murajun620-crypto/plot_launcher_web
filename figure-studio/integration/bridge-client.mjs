/** Browser-only editing bridge. No project data is sent to a server. */
import {transferResult,transferReceipt,isTransferImageId} from './direct-transfer.mjs?v=batch-v034-1';
export const BRIDGE_PROTOCOL = 'figure-studio-bridge-v1';
export const SOURCE_APPS = Object.freeze({
  plot: {name:'PlotLauncher Web', url:'https://murajun620-crypto.github.io/plot_launcher_web/', extension:'.plotproject'},
  mifito: {name:'MiFiTo Web', url:'https://murajun620-crypto.github.io/Microscopy_figure_tools_web/', extension:'.mifito'}
});
const MAX_PROJECT = 320 * 1024 * 1024;
// Each Figure Studio window keeps one live editor per source application/URL.
const editorPools = new WeakMap();

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
export function openSource({app, project, sourceName, panelId, editKey, imageId, onResult = () => {}, onStatus = () => {},
  url, timeoutMs = 20000, windowRef = window}) {
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
  if(existing&&!existing.window.closed)return existing.open(args);
  existing?.close();
  const nonce = crypto.randomUUID();
  target.hash = new URLSearchParams({figureBridge:nonce, figureOrigin:origin}).toString();
  const popup = windowRef.open(target.href, `figure-editor-${nonce}`);
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
    return {...options,sourceName:safeName(options.sourceName),requestId:crypto.randomUUID(),ready,settle,loaded:false,latestRevision:0,applyingRevision:0};
  }
  function downloadFor(r){return()=>downloadBlob(r.project,r.sourceName,windowRef.document);}
  function status(r,state,message){r?.onStatus({state,message,downloadProject:downloadFor(r)});}
  const send=(type,r,extra={})=>{if(!disposed&&!popup.closed)popup.postMessage({protocol:BRIDGE_PROTOCOL,nonce,app,hostId:activeHost,type,panelId:r?.panelId,requestId:r?.requestId,...extra},target.origin);};
  function load(r,reconnect=false){
    r.loaded=false;r.latestRevision=0;r.applyingRevision=0;pending=r;
    send('load',r,{project:r.project,sourceName:r.sourceName,editKey:r.editKey,reconnect,capabilities:['batch-v1'],...(r.imageId?{imageId:r.imageId}:{})});
    status(r,'loading',reconnect?'編集画面へ再接続しています…':'元プロジェクトを編集画面へ読み込んでいます…');
  }
  function facade(r){return {window:popup,close,ready:r.ready,downloadProject:downloadFor(r)};}
  function focus(){try{popup.focus?.();}catch{}}
  function open(options){
    focus();
    const same=(pending?[pending]:[current]).find(r=>r&&r.panelId===options.panelId&&r.editKey===options.editKey);
    if(same){
      same.onResult=options.onResult;same.onStatus=options.onStatus;
      if(options.imageId)same.imageId=options.imageId;
      if(same.loaded&&!pending&&!same.applyingRevision&&same.imageId)send('select-image',same,{imageId:same.imageId});
      if(same.loaded)status(same,'ready','開いている編集画面に戻りました。続けて編集できます。');
      else status(same,'loading','編集画面で元プロジェクトを読み込んでいます…');
      return facade(same);
    }
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
    if (message.type === 'loaded') {
      if(r!==pending&&r!==current)return;
      current=r;if(pending===r)pending=null;r.loaded=true;
      status(r,'ready','元プロジェクトを開きました。修正後に「Figureへ反映」を押してください。');
      r.settle({connected:true});
    } else if(message.type==='switch-blocked'){
      if(r!==pending)return;
      pending=null;status(r,'blocked',String(message.message||'編集画面の内容を「Figureへ反映」してから、もう一度対象の図を開いてください。'));
      r.settle({connected:false,reason:'switch-blocked'});
    } else if (message.type === 'applying') {
      status(r,'applying','編集結果を受け取っています…');
    } else if (message.type === 'error') {
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
    windowRef.removeEventListener('message',receive);
    pending?.settle({connected:false,reason:'closed'});current?.settle({connected:false,reason:'closed'});
    if(pool.get(poolKey)===controller)pool.delete(poolKey);
  }
  const controller={window:popup,open,close};pool.set(poolKey,controller);
  windowRef.addEventListener('message',receive);
  status(pending,'opening',`${spec.name} を開いています…`);
  return facade(pending);
}

/** Tear down bridge listeners when abandoning the Studio window, without closing editors. */
export function closeSourceSessions({windowRef=window}={}){
  for(const session of [...(editorPools.get(windowRef)?.values()||[])])session.close();
}
