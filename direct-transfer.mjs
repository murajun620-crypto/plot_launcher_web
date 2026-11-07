/** Direct editor → Figure Studio transfer. Everything stays in the browser. */
export const TRANSFER_PROTOCOL = 'figure-studio-direct-v1';
export const TRANSFER_CHANNEL = 'figure-studio-direct-v1';
export const DEFAULT_STUDIO_URL = 'https://murajun620-crypto.github.io/plot_launcher_web/figure-studio/';
const RECEIPT_PREFIX = 'figure-studio:received:';
const PROJECT_LIMIT = 320 * 1024 * 1024, PREVIEW_LIMIT = 96 * 1024 * 1024;
const APPS = new Set(['plot','mifito']);
const PREVIEW_TYPES = new Set(['image/svg+xml','image/png','image/jpeg','image/webp']);
export const isTransferImageId = value => typeof value==='string' && /^[a-zA-Z0-9-]{1,200}$/.test(value);
const cleanName = value => typeof value==='string' && value.length<=255 && !/[\u0000-\u001f]/.test(value);
const previewValid = value => value instanceof Blob && value.size>0 && value.size<=PREVIEW_LIMIT && PREVIEW_TYPES.has(value.type);
const hasBatch = value => Array.isArray(value?.capabilities)&&value.capabilities.includes('batch-v1');

/** Validate and copy only public wire fields. Private capture state stays local. */
export function transferResult(app,value,sourceName=value?.sourceName){
  if(!APPS.has(app)||!(value?.project instanceof Blob)||!value.project.size||value.project.size>PROJECT_LIMIT)throw Error('元プロジェクトは320 MB以内にしてください。');
  if(!cleanName(sourceName))throw Error('元プロジェクト名が正しくありません。');
  const result={project:value.project,sourceName};
  const imageInfo=(image,projectId)=>{
    if(!isTransferImageId(projectId)||!isTransferImageId(image?.imageId)||!cleanName(image.name)||!/^[a-f0-9]{64}$/.test(image.fingerprint))throw Error('画像の識別情報が正しくありません。');
    return {imageId:image.imageId,name:image.name,fingerprint:image.fingerprint};
  };
  if(value.batch!==undefined){
    if(app!=='mifito'||value.image!==undefined||!isTransferImageId(value.batch?.projectId)||!Array.isArray(value.batch.images)||!value.batch.images.length||value.batch.images.length>100)throw Error('一括反映の画像情報が正しくありません（最大100枚）。');
    let bytes=0;const ids=new Set();
    const images=value.batch.images.map(image=>{
      const info=imageInfo(image,value.batch.projectId);
      if(image.unchanged!==undefined&&typeof image.unchanged!=='boolean')throw Error('画像の変更情報が正しくありません。');
      if(ids.has(info.imageId)||!previewValid(image.preview)||(bytes+=image.preview.size)>PREVIEW_LIMIT)throw Error('一括反映の画像が重複しているか、形式・合計サイズが対応範囲外です（96 MB以内）。');
      ids.add(info.imageId);return {...info,preview:image.preview,...(image.unchanged!==undefined?{unchanged:image.unchanged}:{})};
    });
    result.batch={projectId:value.batch.projectId,images};
  }else{
    if(!previewValid(value.preview))throw Error('表示用画像の形式・サイズが対応範囲外です（96 MB以内）。');
    result.preview=value.preview;
    if(value.image!==undefined){
      if(app!=='mifito')throw Error('画像の識別情報が正しくありません。');
      result.image={projectId:value.image.projectId,...imageInfo(value.image,value.image.projectId)};
    }
  }
  return result;
}

/** Ignore arbitrary callback/remote fields; summary is informative, not authority. */
export function transferReceipt(value){
  const result={};
  if(typeof value?.message==='string'&&value.message.length<=1000&&!/[\u0000-\u001f]/.test(value.message))result.message=value.message;
  if(value?.summary&&['updated','added','unchanged'].every(key=>Number.isSafeInteger(value.summary[key])&&value.summary[key]>=0&&value.summary[key]<=300000))result.summary={updated:value.summary.updated,added:value.summary.added,unchanged:value.summary.unchanged};
  return result;
}
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9-]{16,100}$/.test(value);
const isOrigin = value => {
  try {const u = new URL(value);return u.origin === value && (u.protocol === 'https:' || u.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname));} catch {return false;}
};
export function validateTransferPayload(value) {
  if (!value || !APPS.has(value.app) || !identifier(value.transferId)) throw new Error('受信した図の識別情報が正しくありません。');
  transferResult(value.app,value);
  return value;
}
export function directTransferContext(locationRef) {
  const q = new URLSearchParams(locationRef.hash.slice(1));
  const transferId=q.get('figureTransfer'),nonce=q.get('sourceNonce'),origin=q.get('sourceOrigin'),app=q.get('sourceApp');
  return identifier(transferId) && identifier(nonce) && isOrigin(origin) && APPS.has(app) ? {transferId,nonce,origin,app} : null;
}
function makeChannel(windowRef,channelFactory) {
  try {return channelFactory ? channelFactory(TRANSFER_CHANNEL) : windowRef.BroadcastChannel ? new windowRef.BroadcastChannel(TRANSFER_CHANNEL) : null;} catch {return null;}
}
function safeStorage(windowRef) {try{return windowRef.localStorage;}catch{return null;}}
function subscribe(channel,fn) {if(channel)channel.addEventListener('message',fn);}
function unsubscribe(channel,fn) {if(channel)channel.removeEventListener('message',fn);}

/** Install after the Studio document has finished restoring its current draft. */
export function setupTransferReceiver({onImport,onStatus=()=>{},windowRef=window,channelFactory,storage,lockManager}={}) {
  if(typeof onImport!=='function')throw new Error('onImport callback is required.');
  const receiverId=crypto.randomUUID(),channel=makeChannel(windowRef,channelFactory),context=directTransferContext(windowRef.location),opener=windowRef.opener;
  const store=storage === undefined ? safeStorage(windowRef) : storage;
  const locks=lockManager === undefined ? windowRef.navigator?.locks : lockManager;
  const inFlight=new Map(),accepted=new Set();let closed=false,lastActive=Date.now();
  const sendChannel=(type,extra={})=>channel?.postMessage({protocol:TRANSFER_PROTOCOL,type,receiverId,...extra});
  const presence=()=>{if(!closed)sendChannel('presence',{lastActive,at:Date.now(),capabilities:['batch-v1']});};
  const activate=()=>{lastActive=Date.now();presence();};
  const known=id=>{if(accepted.has(id))return true;try{return !!store?.getItem(RECEIPT_PREFIX+id);}catch{return false;}};
  const remember=id=>{accepted.add(id);try{store?.setItem(RECEIPT_PREFIX+id,String(Date.now()));}catch{/* Current-session idempotence remains available. */}};
  async function importOnce(payload) {
    validateTransferPayload(payload);
    if(known(payload.transferId))return {duplicate:true};
    if(inFlight.has(payload.transferId))return inFlight.get(payload.transferId);
    const run=async()=>{
      if(known(payload.transferId))return {duplicate:true};
      onStatus({state:'receiving',message:`${payload.app==='plot'?'PlotLauncher':'MiFiTo'}から図を受け取っています…`});
      const applied=transferReceipt(await onImport(payload));
      remember(payload.transferId);
      onStatus({state:'received',message:applied.message||'元プロジェクト付きの図を追加しました。'});
      return {duplicate:false,...applied};
    };
    const promise=Promise.resolve().then(()=>locks?.request ? locks.request(`figure-studio-import-${payload.transferId}`,run) : run());
    inFlight.set(payload.transferId,promise);
    try{return await promise;}finally{inFlight.delete(payload.transferId);}
  }
  async function handleChannel(event) {
    const m=event.data;if(closed||m?.protocol!==TRANSFER_PROTOCOL)return;
    if(m.type==='discover'){presence();return;}
    if(m.type!=='deliver'||m.to!==receiverId||!identifier(m.senderId)||!identifier(m.nonce))return;
    try{
      const result=await importOnce(m.payload);
      sendChannel('ack',{to:m.senderId,transferId:m.payload.transferId,nonce:m.nonce,ok:true,...result});
    }catch(error){sendChannel('ack',{to:m.senderId,transferId:m.payload?.transferId,nonce:m.nonce,ok:false,message:error.message});onStatus({state:'error',message:error.message});}
  }
  const popupSend=(type,extra={})=>{
    if(context&&opener&&!opener.closed)opener.postMessage({protocol:TRANSFER_PROTOCOL,type,receiverId,transferId:context.transferId,nonce:context.nonce,app:context.app,...extra},context.origin);
  };
  let popupDelivered=false;
  async function handlePopup(event) {
    const m=event.data;
    if(closed||!context||event.source!==opener||event.origin!==context.origin||m?.protocol!==TRANSFER_PROTOCOL||m.type!=='deliver'||m.nonce!==context.nonce||m.transferId!==context.transferId||m.app!==context.app)return;
    if(m.payload?.transferId!==context.transferId||m.payload?.app!==context.app)return;
    try{
      const result=await importOnce(m.payload);popupDelivered=true;
      popupSend('ack',{ok:true,...result});
      // Remove only transfer parameters; retain unrelated application URL state.
      const url=new URL(windowRef.location.href),hash=new URLSearchParams(url.hash.slice(1));
      for(const key of ['figureTransfer','sourceNonce','sourceOrigin','sourceApp'])hash.delete(key);
      url.hash=hash.toString();windowRef.history?.replaceState(null,'',url.href);
    }catch(error){popupSend('ack',{ok:false,message:error.message});onStatus({state:'error',message:error.message});}
  }
  subscribe(channel,handleChannel);windowRef.addEventListener('message',handlePopup);
  windowRef.addEventListener('focus',activate);windowRef.addEventListener('pointerdown',activate);windowRef.addEventListener('keydown',activate);
  const heartbeat=setInterval(presence,3000),readyTimer=context&&opener?setInterval(()=>{if(!popupDelivered)popupSend('receiver-ready',{capabilities:['batch-v1']});},650):null;
  presence();if(context&&opener)popupSend('receiver-ready',{capabilities:['batch-v1']});
  return {receiverId,close(){
    if(closed)return;sendChannel('gone');closed=true;clearInterval(heartbeat);clearInterval(readyTimer);
    unsubscribe(channel,handleChannel);channel?.close();windowRef.removeEventListener('message',handlePopup);
    windowRef.removeEventListener('focus',activate);windowRef.removeEventListener('pointerdown',activate);windowRef.removeEventListener('keydown',activate);
  }};
}

/** Standalone send() opens a fallback tab before its first await; workspace sends stay in their own shell. */
export function createDirectSender({app,captureResult,captureBatchResult,onAccepted,studioUrl,onStatus=()=>{},windowRef=window,channelFactory,ackTimeoutMs=30000}={}) {
  if(!APPS.has(app)||typeof captureResult!=='function')throw new Error('送信元アプリの設定が正しくありません。');
  const local=['localhost','127.0.0.1','[::1]'].includes(new URL(windowRef.location.href).hostname);
  const target=new URL(studioUrl || (local ? new URL(DEFAULT_STUDIO_URL).pathname : DEFAULT_STUDIO_URL),windowRef.location.href);
  if(!isOrigin(target.origin))throw new Error('Figure StudioのURLはHTTPSまたはlocalhostを指定してください。');
  const senderId=crypto.randomUUID(),channel=makeChannel(windowRef,channelFactory),peers=new Map();
  let pending=null,busy=false,disposed=false;
  const status=(state,message)=>onStatus({state,message});
  const broadcast=(type,extra={})=>channel?.postMessage({protocol:TRANSFER_PROTOCOL,type,senderId,...extra});
  const findPeer=(workspaceOnly=false)=>{
    let ownId=null;if(workspaceOnly)try{ownId=getFigureWorkspace(windowRef)?.studioReceiverId;}catch{}
    return [...peers.values()].filter(p=>Date.now()-p.seen<12000&&(!workspaceOnly||p.receiverId===ownId)).sort((a,b)=>b.lastActive-a.lastActive)[0];
  };
  const sendPopup=(record,type,extra={})=>record.popup?.postMessage({protocol:TRANSFER_PROTOCOL,type,app,transferId:record.transferId,nonce:record.nonce,...extra},target.origin);
  async function acknowledge(record,m) {
    if(record!==pending||record.acknowledging||m.transferId!==record.transferId||m.nonce!==record.nonce)return;
    clearTimeout(record.timer);record.timer=null;
    if(m.ok){
      record.acknowledging=true;busy=true;const receipt={ok:true,duplicate:!!m.duplicate,...transferReceipt(m)};let callbackFailed=false;
      try{if(onAccepted)await onAccepted(record.captured,receipt);}catch{callbackFailed=true;}
      if(disposed||record!==pending)return;
      busy=false;pending=null;
      status('sent',callbackFailed?'Figure Studioへの反映は完了しました。同期状態を確認してから次の送信を行ってください。':receipt.message||(m.duplicate?'この図はすでにFigure Studioへ追加されています。':'元プロジェクト付きの図をFigure Studioへ追加しました。'));
      record.resolve?.(receipt);record.captured=null;
    }
    else{busy=false;record.reject?.(new Error(m.message||'Figure Studioへの追加に失敗しました。'));status('error',m.message||'Figure Studioへの追加に失敗しました。');}
  }
  function deliver(record) {
    if(record!==pending||!record.payload||record.delivered)return;
    if(record.workspace){record.peer=findPeer(true);if(!record.peer)return;}
    if(record.batch&&(record.popup?record.receiverReady&&!record.receiverBatch:!record.peer?.batch)){rejectUnsupported(record);return;}
    if(record.popup){if(!record.receiverReady)return;sendPopup(record,'deliver',{payload:record.payload});}
    else broadcast('deliver',{to:record.peer.receiverId,nonce:record.nonce,payload:record.payload});
    clearTimeout(record.timer);
    record.delivered=true;status('sending','Figure Studioへ図を追加しています…');
    record.timer=setTimeout(()=>{
      if(record!==pending)return;busy=false;
      record.reject?.(new Error('Figure Studioからの確認が届きません。もう一度押して再試行してください。'));
      status('retry','Figure Studioからの確認が届きません。もう一度押して再試行してください。');
    },ackTimeoutMs);
  }
  function rejectUnsupported(record){
    clearTimeout(record.timer);record.timer=null;busy=false;
    const message='Figure Studioを最新版へ更新してから、一括送信を再試行してください。';
    status('unavailable',message);record.reject?.(new Error(message));
  }
  function channelMessage(event) {
    const m=event.data;if(disposed||m?.protocol!==TRANSFER_PROTOCOL)return;
    if(m.type==='presence'&&identifier(m.receiverId)&&Number.isFinite(m.lastActive)){
      peers.set(m.receiverId,{receiverId:m.receiverId,lastActive:m.lastActive,seen:Date.now(),batch:hasBatch(m)});
      if(busy&&pending?.workspace&&!pending.delivered){pending.peer=findPeer(true);deliver(pending);}
    }
    else if(m.type==='gone')peers.delete(m.receiverId);
    else if(m.type==='ack'&&m.to===senderId&&pending&&!pending.popup&&m.receiverId===pending.peer?.receiverId)acknowledge(pending,m);
  }
  function popupMessage(event) {
    const m=event.data,record=pending;
    if(disposed||!record?.popup||event.source!==record.popup||event.origin!==target.origin||m?.protocol!==TRANSFER_PROTOCOL||m.transferId!==record.transferId||m.nonce!==record.nonce||m.app!==app)return;
    if(m.type==='receiver-ready'){record.receiverReady=true;record.receiverBatch=hasBatch(m);deliver(record);}
    else if(m.type==='ack')acknowledge(record,m);
  }
  subscribe(channel,channelMessage);windowRef.addEventListener('message',popupMessage);broadcast('discover');
  const discovery=setInterval(()=>broadcast('discover'),4000);
  function send({batch=false}={}) {
    if(disposed)return Promise.reject(new Error('送信機能は終了しています。'));
    if(busy)return pending?.promise || Promise.resolve({ok:false});
    if(!pending&&batch&&(app!=='mifito'||typeof captureBatchResult!=='function'))return Promise.reject(new Error('一括送信には対応していません。'));
    const record=pending || {transferId:crypto.randomUUID(),nonce:crypto.randomUUID(),payload:null,batch:!!batch,workspace:!!getFigureWorkspace(windowRef)};
    const previousPopup=record.popup&&!record.popup.closed?record.popup:null,previousReady=record.receiverReady,previousBatch=record.receiverBatch;
    clearTimeout(record.timer);record.timer=null;record.delivered=false;record.receiverReady=false;record.receiverBatch=false;record.peer=target.origin===windowRef.location.origin?findPeer(record.workspace):null;record.popup=null;
    pending=record;busy=true;
    // Do not await data generation or discovery before opening a new tab.
    if(!record.peer&&!record.workspace){
      if(previousPopup){record.popup=previousPopup;record.receiverReady=previousReady;record.receiverBatch=previousBatch;previousPopup.focus?.();}
      else {
        const url=new URL(target.href),hash=new URLSearchParams(url.hash.slice(1));
        for(const [key,value] of Object.entries({figureTransfer:record.transferId,sourceNonce:record.nonce,sourceOrigin:windowRef.location.origin,sourceApp:app}))hash.set(key,value);
        url.hash=hash.toString();record.popup=windowRef.open(url.href,`figure-studio-transfer-${record.transferId}`);
      }
      if(!record.popup){busy=false;status('error','Figure Studioを開けませんでした。ポップアップを許可して再試行してください。');return Promise.reject(new Error('Figure Studioを開けませんでした。'));}
    }
    if(record.workspace&&!record.peer)broadcast('discover');
    record.promise=new Promise((resolve,reject)=>{record.resolve=resolve;record.reject=reject;});
    status('preparing','図と元プロジェクトを準備しています…');
    Promise.resolve().then(async()=>{
      if(record.batch&&record.peer&&!record.peer.batch){rejectUnsupported(record);return;}
      if(!record.payload){const result=await(record.batch?captureBatchResult():captureResult()),wire=transferResult(app,result,result.sourceName || (app==='plot'?'figure.plotproject':'figure.mifito'));if(!!wire.batch!==record.batch)throw Error('編集結果の一括反映形式を確認してください。');record.payload=validateTransferPayload({app,...wire,transferId:record.transferId});record.captured=result;}
      if(record===pending){
        deliver(record);
        if(record.workspace&&!record.delivered||record.popup&&!record.receiverReady){
          status('waiting','Figure Studioの準備を待っています…');
          record.timer=setTimeout(()=>{if(record===pending&&!record.delivered){busy=false;record.reject(new Error('Figure Studioの準備が完了しませんでした。再試行してください。'));status('retry','Figure Studioの準備が完了しませんでした。再試行してください。');}},ackTimeoutMs);
        }
      }
    }).catch(error=>{if(record===pending){busy=false;status('error',error.message);record.reject(error);}});
    return record.promise;
  }
  function resetPending(){
    if(busy)throw Error('送信が完了してから、別のプロジェクトを開いてください。');
    const previous=pending;pending=null;clearTimeout(previous?.timer);
    if(previous){previous.captured=null;previous.payload=null;previous.reject?.(new Error('プロジェクトが切り替わったため、前の送信を終了しました。'));}
    status('idle','');
  }
  return {send,resetPending,get busy(){return busy;},close(){disposed=true;clearInterval(discovery);clearTimeout(pending?.timer);unsubscribe(channel,channelMessage);channel?.close();windowRef.removeEventListener('message',popupMessage);pending?.reject?.(new Error('送信を終了しました。'));pending=null;}};
}

/** Only the same-origin workspace shell may route between its embedded apps. */
export function getFigureWorkspace(windowRef=window){
  try{
    if(new URLSearchParams(windowRef.location.search||'').get('figureWorkspace')!=='1')return null;
    const parent=windowRef.parent,origin=windowRef.location.origin;
    if(!parent||parent===windowRef||parent.location.origin!==origin)return null;
    const api=parent.FigureStudioWorkspace,studio=api?.studioWindow;
    return typeof api?.show==='function'&&typeof studio?.postMessage==='function'&&studio.location.origin===origin?api:null;
  }catch{return null;}
}
export const figureWorkspaceAPI=getFigureWorkspace;

export function showFigureWorkspaceStudio(windowRef=window){
  const api=figureWorkspaceAPI(windowRef);if(!api)return;
  try{const shown=api.show('studio');shown?.catch?.(()=>{});}catch{/* The edit has already been accepted; navigation is best effort. */}
}

/** Workspace visits get send actions; standalone editors retain their full editor UI. */
export function setupDirectSendButton({app,captureResult,captureBatchResult,onAccepted,container,studioUrl,isReady=()=>true,documentRef=document,windowRef=window}={}) {
  const params=new URLSearchParams(windowRef.location.hash.slice(1));
  const bridgeVisit=/^[a-zA-Z0-9-]{16,100}$/.test(params.get('figureBridge')||'')&&params.get('figureOrigin')===windowRef.location.origin;
  if(new URLSearchParams(windowRef.location.search||'').get('figureWorkspace')!=='1'&&!figureWorkspaceAPI(windowRef)&&!bridgeVisit)return null;
  const host=typeof container==='string'?documentRef.querySelector(container):container;
  if(!host)return null;
  const group=documentRef.createElement('div');group.style.cssText='display:inline-flex;align-items:center;gap:6px;position:relative';
  const button=documentRef.createElement('button');button.id='send-to-figure-studio';button.type='button';button.className='button primary';button.textContent='Figure Studioへ送る';button.title='表示中の図と元プロジェクトを、開いているFigure Studioへ追加します。';
  const batchButton=app==='mifito'&&typeof captureBatchResult==='function'?documentRef.createElement('button'):null;
  if(batchButton){batchButton.id='send-all-to-figure-studio';batchButton.type='button';batchButton.className='button primary';batchButton.textContent='まとめてStudioへ送る';batchButton.title='変更した画像をまとめて反映し、未追加の画像を追加します。変更のない画像はそのまま残します。';}
  const message=documentRef.createElement('span');message.setAttribute('role','status');message.style.cssText='display:none;position:absolute;right:0;top:calc(100% + 8px);width:280px;z-index:10000;padding:10px 12px;background:#fff;color:#173c38;border:1px solid #b8cfcb;border-radius:8px;box-shadow:0 5px 18px #173c3825;font:12px/1.5 system-ui;';
  group.append(button);if(batchButton)group.append(batchButton);group.append(message);host.append(group);
  let hideTimer,bridgeConnected=false;
  const sender=createDirectSender({app,captureResult,captureBatchResult,onAccepted,studioUrl,windowRef,onStatus:({state,message:text})=>{
    clearTimeout(hideTimer);message.textContent=text;message.style.display=text?'block':'none';
    button.disabled=bridgeConnected||['preparing','waiting','sending'].includes(state)||!isReady();
    if(batchButton)batchButton.disabled=button.disabled;
    button.textContent=state==='retry'?'送信を再試行':state==='preparing'?'図を準備中…':'Figure Studioへ送る';
    if(state==='sent'){hideTimer=setTimeout(()=>{message.style.display='none';},7000);showFigureWorkspaceStudio(windowRef);}
  }});
  const sync=()=>{button.disabled=bridgeConnected||sender.busy||!isReady();if(batchButton)batchButton.disabled=button.disabled;};
  const setBridgeConnected=connected=>{bridgeConnected=!!connected;group.style.display=bridgeConnected?'none':'inline-flex';if(bridgeConnected){clearTimeout(hideTimer);message.style.display='none';}sync();};
  button.addEventListener('click',()=>{if(!bridgeConnected&&isReady())sender.send().catch(()=>{});});sync();
  batchButton?.addEventListener('click',()=>{if(!bridgeConnected&&isReady())sender.send({batch:true}).catch(()=>{});});
  return {button,batchButton,sender,sync,setBridgeConnected,close(){clearTimeout(hideTimer);sender.close();group.remove();}};
}
