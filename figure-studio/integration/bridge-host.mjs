/** Source-editor bridge. The engine and tab stay alive when a different panel opens. */
import {transferResult,transferReceipt,isTransferImageId,figureWorkspaceAPI,showFigureWorkspaceStudio} from './direct-transfer.mjs?v=workspace-v037-1';
import {registerEditor} from './editor-discovery.mjs?v=editor-reuse-v036-1';
const PROTOCOL = 'figure-studio-bridge-v1';
const MAX_PROJECT = 320 * 1024 * 1024;

export function getFigureBridgeContext(locationRef = location) {
  const params = new URLSearchParams(locationRef.hash.slice(1));
  const nonce = params.get('figureBridge'), rawOrigin = params.get('figureOrigin');
  if (!nonce || !/^[a-zA-Z0-9-]{16,100}$/.test(nonce) || !rawOrigin) return null;
  try {
    const url = new URL(rawOrigin);
    if (url.origin !== rawOrigin || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))) return null;
    const ownerId=params.get('figureOwner');
    if(ownerId!==null&&!/^[a-zA-Z0-9-]{16,100}$/.test(ownerId))return null;
    return {nonce,origin:url.origin,...(ownerId?{ownerId}:{})};
  } catch {return null;}
}

/**
 * isDirty may be async. Include uncommitted form input and compare with the
 * last loaded / accepted snapshot, not the last local save.
 * onAccepted receives the exact captured result, including private extra
 * fields. Those extra fields stay in this editor and are never transmitted.
 */
export function setupFigureBridge({app,loadProject,buildProject,renderPreview,captureResult,captureBatchResult,selectImage,isDirty=()=>false,hasContent,canAdoptAccepted=()=>false,onProjectLoaded,onAccepted,onConnectionChange=()=>{},
  windowRef=window,documentRef=windowRef.document,locationRef=windowRef.location,registerEditorRef=registerEditor,channelFactory}) {
  if(!['plot','mifito'].includes(app))return null;
  const initialContext=getFigureBridgeContext(locationRef),workspace=new URLSearchParams(locationRef.search||'').get('figureWorkspace')==='1'?figureWorkspaceAPI(windowRef):null;
  const initialParent=workspace?.studioWindow||windowRef.opener;
  let context=initialContext&&initialParent?initialContext:null,parent=context?initialParent:null,connection=null,removeConnectionListener=null,registry=null,mounted=false;
  const nativeOwner=context?(context.ownerId||crypto.randomUUID()):null,normalVisit=!context;
  const hostId=crypto.randomUUID();
  let active={panelId:'',requestId:'',editKey:'',sourceName:''},revision=0,initialized=false,loaded=false,busy=false,awaiting=0,awaitTimer=0,captured=null,baseline=null,disposed=false,clientBatch=false,acceptedCheckpoint=null,loadingRequest=null;
  const send=(type,extra={})=>{if(!disposed&&context&&parent&&!parent.closed)parent.postMessage({protocol:PROTOCOL,nonce:context.nonce,hostId,app,type,panelId:active.panelId,requestId:active.requestId,editKey:active.editKey,...extra},context.origin);};
  const ready=()=>send('ready',{capabilities:['reuse-v1',...(app==='mifito'&&captureBatchResult?['batch-v1']:[])],loaded,busy:busy||!!awaiting});
  const panel=documentRef.createElement('div');panel.id='figure-studio-bridge';
  panel.style.cssText='display:inline-flex;flex-wrap:wrap;gap:6px;align-items:center;max-width:100%;min-width:0;color:#173c38;font:12px/1.5 system-ui,sans-serif;';
  const message=documentRef.createElement('span');message.hidden=true;message.setAttribute('role','status');message.setAttribute('aria-live','polite');
  message.style.cssText='flex-basis:100%;max-width:420px;white-space:normal;overflow-wrap:anywhere;';
  function setMessage(text){message.textContent=text;message.hidden=!text;}
  const button=documentRef.createElement('button');button.id='send-to-figure-studio';button.type='button';button.className='button primary';button.textContent='Figure Studioへ送る';button.title='編集した図と元プロジェクトを、元のFigure Studioの図へ反映します。';button.disabled=true;
  const batchButton=app==='mifito'&&typeof captureBatchResult==='function'?documentRef.createElement('button'):null;
  if(batchButton){batchButton.id='send-all-to-figure-studio';batchButton.type='button';batchButton.className='button primary';batchButton.textContent='まとめてStudioへ送る';batchButton.title='変更した画像を元のFigure Studioへまとめて反映し、未追加の画像を追加します。変更のない画像はそのまま残します。';batchButton.disabled=true;}
  function setDisabled(value){button.disabled=value;if(batchButton)batchButton.disabled=value;}
  const discard=documentRef.createElement('button');discard.type='button';discard.textContent='未反映の編集を取り消す';discard.hidden=true;
  discard.style.cssText='white-space:nowrap;border:1px solid #c6d3cf;border-radius:7px;padding:8px 12px;background:#fff;color:#526661;font:12px system-ui;cursor:pointer;';
  // Bridge actions update the original Studio panel and stay in normal layout.
  // Editors without the shared header still get an in-flow fallback.
  panel.append(button);if(batchButton)panel.append(batchButton);panel.append(discard,message);
  function mount(){if(mounted)return;mounted=true;onConnectionChange(true);(documentRef.querySelector?.('.header-actions')||documentRef.body).append(panel);}
  function unmount(){if(!mounted)return;mounted=false;panel.remove();onConnectionChange(false);}
  const readyTimer=setInterval(()=>{if(parent?.closed){parent=null;context=null;unmount();}ready();registry?.update();},1500);
  async function digest(blob){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');}
  async function adoptionProof(project){
    const checkpoint=acceptedCheckpoint;
    if(!checkpoint||project.size!==checkpoint.result.project.size)return null;
    const [incoming,previous]=await Promise.all([digest(project),checkpoint.hash||checkpoint.ready]);
    if(incoming!==previous)return null;
    const sameWorkspace=await canAdoptAccepted(checkpoint.result);
    return checkpoint===acceptedCheckpoint&&sameWorkspace===true?checkpoint:null;
  }
  const matchesActive=data=>data.panelId===active.panelId&&(data.requestId||'')===active.requestId;
  function block(data,reason,text){
    setMessage(text);
    if((reason==='dirty'||reason==='dirty-check-failed')&&loaded&&baseline){discard.hidden=false;discard.disabled=false;}
    const external=normalVisit&&!initialized&&!loaded;
    send('switch-blocked',{requestId:data.requestId||'',panelId:data.panelId,editKey:data.editKey||'',activePanelId:active.panelId,activeRequestId:active.requestId,reason:external?'dirty-external':reason,message:text});
    if(external&&connection){const previous=connection;removeConnectionListener?.();removeConnectionListener=null;connection=null;parent=null;context=null;unmount();previous.close();}
  }
  async function receive(event){
    const data=event.data;
    if(disposed||!context||!parent||event.source!==parent||event.origin!==context.origin||data?.protocol!==PROTOCOL||data?.nonce!==context.nonce||data?.app!==app||(data.hostId&&data.hostId!==hostId))return;
    if(data.type==='ping'){ready();return;}
    if(data.type==='select-image'){
      if(!loaded||!matchesActive(data)||!isTransferImageId(data.imageId)||typeof selectImage!=='function')return;
      if(busy||awaiting){send('error',{code:'select-busy',message:'反映・読み込み処理が終わってから、もう一度対象の画像を開いてください。'});return;}
      busy=true;setDisabled(true);discard.disabled=true;
      try{await selectImage(data.imageId);if(!disposed){active.imageId=data.imageId;setMessage('');}}
      catch(error){if(!disposed){setMessage(error.message||'対象の画像を表示できませんでした。');send('error',{code:'select-failed',message:message.textContent});}}
      finally{busy=false;if(!disposed){setDisabled(!loaded||!!awaiting);discard.disabled=!loaded||!!awaiting;}}
      return;
    }
    if(data.type==='load'){
      if(!(data.project instanceof Blob)||!data.project.size||data.project.size>MAX_PROJECT||typeof data.panelId!=='string'||!data.panelId||data.panelId.length>200||
        (data.requestId!==undefined&&(typeof data.requestId!=='string'||!data.requestId||data.requestId.length>200))||
        (data.editKey!==undefined&&(typeof data.editKey!=='string'||data.editKey.length>2048))||
        (data.imageId!==undefined&&!isTransferImageId(data.imageId))){
        send('error',{requestId:typeof data.requestId==='string'?data.requestId:'',panelId:typeof data.panelId==='string'?data.panelId:'',code:'invalid-project',message:'プロジェクトの受け渡し形式が正しくありません。'});return;
      }
      // A retry never interrupts its own load or pending result.
      if(initialized&&(loaded||busy||awaiting)&&matchesActive(data)&&(!data.editKey||data.editKey===active.editKey)){
        if(loaded)send('loaded',{reused:true});return;
      }
      if(loadingRequest&&data.panelId===loadingRequest.panelId&&(data.requestId||'')===loadingRequest.requestId&&data.editKey===loadingRequest.editKey)return;
      if(busy||awaiting){block(data,'busy','読み込み・反映処理中です。完了してから次のグラフを開いてください。');return;}
      loadingRequest={panelId:data.panelId,requestId:data.requestId||'',editKey:data.editKey};
      busy=true;setDisabled(true);discard.disabled=true;
      try{
        // Reopening this snapshot keeps all in-progress work in the warm tab.
        if(loaded&&data.panelId===active.panelId&&data.editKey&&data.editKey===active.editKey){
          active.requestId=data.requestId||'';clientBatch=Array.isArray(data.capabilities)&&data.capabilities.includes('batch-v1');setMessage('');send('loaded',{reused:true});return;
        }
        let adoptedCheckpoint=null;
        if(normalVisit&&!initialized){
          let occupied;
          try{occupied=hasContent?await hasContent():await isDirty();adoptedCheckpoint=occupied?await adoptionProof(data.project):null;}
          catch{block(data,'dirty-check-failed','開いている編集内容を確認できません。元アプリの編集内容を保存してから、もう一度お試しください。');return;}
          if(disposed)return;
          if(occupied&&!adoptedCheckpoint){block(data,'dirty','この編集画面には別の内容が開いています。現在の内容を保存してから、対象のプロジェクトを開き直してください。');return;}
        }
        if(loaded){
          let dirty;
          try{dirty=await isDirty();}
          catch{block(data,'dirty-check-failed','編集中の内容を確認できません。Figureへ反映するか、未反映の編集を取り消してから、次のグラフをもう一度開いてください。');return;}
          if(disposed)return;
          if(dirty){block(data,'dirty','未反映の編集があります。Figureへ反映するか、未反映の編集を取り消してから、次のグラフをもう一度開いてください。');return;}
        }
        active={panelId:data.panelId,requestId:data.requestId||'',editKey:data.editKey||'',sourceName:String(data.sourceName||(app==='plot'?'figure.plotproject':'figure.mifito')).replace(/[\\/]/g,'_'),...(data.imageId?{imageId:data.imageId}:{})};
        clientBatch=Array.isArray(data.capabilities)&&data.capabilities.includes('batch-v1');
        const reconnect=!!adoptedCheckpoint||(!normalVisit&&!!data.reconnect);
        // An adopted normal workspace is not bound until its asynchronous
        // preparation has revalidated the exact same source identity.
        initialized=!adoptedCheckpoint;loaded=false;captured=null;baseline=null;revision=0;discard.hidden=true;
        setMessage('開いている編集画面へ元プロジェクトを読み込んでいます…');
        await loadProject(new File([data.project],active.sourceName,{type:data.project.type||'application/octet-stream'}),{reconnect,...(active.imageId?{imageId:active.imageId}:{})});
        if(disposed)return;
        if(adoptedCheckpoint){
          const sameWorkspace=await canAdoptAccepted(adoptedCheckpoint.result);
          if(disposed)return;
          if(adoptedCheckpoint!==acceptedCheckpoint||sameWorkspace!==true){block(data,'dirty','接続中に別のプロジェクトへ切り替わりました。現在の編集内容は保持しています。対象の図をもう一度開いてください。');return;}
          initialized=true;
        }
        await onProjectLoaded?.({...active,reconnect});
        if(disposed)return;
        baseline={project:data.project,sourceName:active.sourceName};loaded=true;setMessage('');send('loaded');
      }catch(error){
        // A failed import might already have changed the source editor.
        // Disable Apply, instead of attaching that content to the previous panel.
        loaded=false;setMessage(error.message||'元プロジェクトを開けませんでした。');
        send('error',{code:'load-failed',loaded:false,message:message.textContent});
      }finally{loadingRequest=null;busy=false;if(!disposed){setDisabled(!loaded||!!awaiting);discard.disabled=!loaded||!!awaiting;registry?.update();}}
      return;
    }
    if(!loaded||!matchesActive(data)||!awaiting||data.revision!==awaiting)return;
    if(data.type==='accepted'){
      clearTimeout(awaitTimer);awaitTimer=0;awaiting=0;
      if(typeof data.editKey==='string'&&data.editKey.length<=2048)active.editKey=data.editKey;
      if(isTransferImageId(data.imageId))active.imageId=data.imageId;
      if(captured){baseline={project:captured.project,sourceName:captured.sourceName||active.sourceName};active.sourceName=baseline.sourceName;}
      discard.hidden=true;
      busy=true;
      try{
        await onAccepted?.(captured,{...active,revision:data.revision,...transferReceipt(data)});
        if(!disposed)setMessage(transferReceipt(data).message||'Figureに反映しました。');
      }catch{if(!disposed)setMessage('Figureに反映しました。編集状態を確認してから次のグラフを開いてください。');}
      finally{captured=null;busy=false;if(!disposed){setDisabled(false);discard.disabled=false;showFigureWorkspaceStudio(windowRef);}}
    }else if(data.type==='rejected'){
      clearTimeout(awaitTimer);awaitTimer=0;awaiting=0;captured=null;setDisabled(false);discard.disabled=false;setMessage(data.message||'Figureへの反映に失敗しました。');
    }
  }
  windowRef.addEventListener('message',receive);
  function connect(next){
    if(disposed)return;
    removeConnectionListener?.();connection=next;context=next.context;parent=next.parent;
    const remove=next.listen(receive);removeConnectionListener=typeof remove==='function'?remove:()=>remove?.close?.();
    mount();ready();
    return ()=>{
      if(connection!==next)return;
      removeConnectionListener?.();removeConnectionListener=null;connection=null;parent=null;context=null;unmount();
    };
  }
  registry=registerEditorRef({app,windowRef,channelFactory,onConnect:connect,getState:()=>{
    let occupied,projectHash;
    try{const value=hasContent?.();if(typeof value==='boolean')occupied=value;}catch{}
    try{const checkpoint=acceptedCheckpoint;if(/^[a-f0-9]{64}$/.test(checkpoint?.hash)&&canAdoptAccepted(checkpoint.result)===true)projectHash=checkpoint.hash;}catch{}
    return {editKey:active.editKey,busy:busy||!!awaiting,
      ownerId:parent&&!parent.closed?(context?.ownerId||nativeOwner):null,
      binding:loaded?{panelId:active.panelId,editKey:active.editKey}:null,
      ...(occupied!==undefined?{occupied}:{}),...(projectHash?{projectHash}:{})};
  }});
  if(context){mount();setMessage('Figure Studio に接続しています…');ready();}
  discard.addEventListener('click',async()=>{
    if(disposed||discard.hidden||!loaded||!baseline||busy||awaiting)return;
    busy=true;setDisabled(true);discard.disabled=true;setMessage('最後にFigureと同期した状態へ戻しています…');
    try{
      await loadProject(new File([baseline.project],baseline.sourceName,{type:baseline.project.type||'application/octet-stream'}),{reconnect:false,...(active.imageId?{imageId:active.imageId}:{})});
      if(disposed)return;
      await onProjectLoaded?.({...active,reconnect:false,discard:true});
      if(disposed)return;
      discard.hidden=true;setMessage('未反映の編集を取り消しました。');send('loaded',{restored:true});
    }catch(error){loaded=false;setMessage(error.message||'元のプロジェクトへ戻せませんでした。');send('error',{code:'load-failed',loaded:false,message:message.textContent});}
    finally{busy=false;if(!disposed){setDisabled(!loaded);discard.disabled=!loaded;}}
  });
  async function apply(batch=false){
    if(disposed||!loaded||busy||awaiting)return;
    if(batch&&!clientBatch){setMessage('Figure Studioを最新版へ更新してから、一括反映をお試しください。');return;}
    if(!parent||parent.closed){setMessage('Figure Studioが閉じています。編集内容をプロジェクトとして保存してください。');return;}
    busy=true;setDisabled(true);discard.disabled=true;send('applying');setMessage('編集結果を作成しています…');
    try{
      const result=batch?await captureBatchResult():captureResult?await captureResult():{project:await buildProject(),preview:await renderPreview()};
      if(disposed)return;
      const wire=transferResult(app,result,result.sourceName||active.sourceName);
      if(!!wire.batch!==batch)throw Error('編集結果の一括反映形式を確認してください。');
      captured=result;awaiting=++revision;const sentRevision=revision,sentRequest=active.requestId;
      send('result',{revision,...wire});
      setMessage('Figureへの反映を確認しています…');
      awaitTimer=setTimeout(()=>{if(!disposed&&awaiting===sentRevision&&active.requestId===sentRequest){awaiting=0;captured=null;setDisabled(false);discard.disabled=false;setMessage('Figureからの確認が届きません。Figure Studioの画面を確認してください。');}},30000);
    }catch(error){
      if(disposed)return;captured=null;setMessage(error.message||'編集結果の作成に失敗しました。');send('error',{code:'capture-failed',message:message.textContent});setDisabled(false);
    }finally{busy=false;if(!disposed)discard.disabled=!loaded||!!awaiting;}
  }
  button.addEventListener('click',()=>apply(false));
  batchButton?.addEventListener('click',()=>apply(true));
  return {
    get isConnected(){return mounted&&!!parent&&!parent.closed;},
    async rememberAccepted(result){
      if(disposed||!(result?.project instanceof Blob)||!result.project.size||result.project.size>MAX_PROJECT)return false;
      const checkpoint={result,hash:null,ready:digest(result.project)};acceptedCheckpoint=checkpoint;
      try{checkpoint.hash=await checkpoint.ready;}catch(error){if(acceptedCheckpoint===checkpoint)acceptedCheckpoint=null;throw error;}
      if(disposed||acceptedCheckpoint!==checkpoint)return false;
      registry?.update();return true;
    },
    close(){if(disposed)return;disposed=true;clearInterval(readyTimer);clearTimeout(awaitTimer);windowRef.removeEventListener('message',receive);removeConnectionListener?.();connection?.close();registry?.close();unmount();acceptedCheckpoint=null;}
  };
}

