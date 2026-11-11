/** Source-editor bridge. The engine and tab stay alive when a different panel opens. */
import {createStudioSendActions,transferResult,transferReceipt,isTransferImageId,figureWorkspaceAPI,showFigureWorkspaceStudio} from './direct-transfer.mjs?v=workspace-update-v0715-2';
import {registerEditor} from './editor-discovery.mjs?v=editor-reuse-v036-1';
const PROTOCOL = 'figure-studio-bridge-v1';
const MAX_PROJECT = 320 * 1024 * 1024;

/** Portable binding data is validated again against the Studio book by its caller. */
export function validateWorkspaceBinding(value){
  if(value===null)return null;
  const text=(s,max)=>typeof s==='string'&&s.length>0&&s.length<=max&&!/[\x00-\x1f]/.test(s);
  const project=value?.baselineProject,blob=project&&['[object Blob]','[object File]'].includes(Object.prototype.toString.call(project))&&typeof project.arrayBuffer==='function';
  if(value?.version!==1||!['plot','mifito'].includes(value.app)||!text(value.panelId,200)||!text(value.editKey,2048)||!text(value.sourceName,255)||!blob||!Number.isSafeInteger(project.size)||project.size<=0||project.size>MAX_PROJECT||(value.imageId!==undefined&&!isTransferImageId(value.imageId)))throw Error('編集画面とFigureの関連付けが不正です。');
  return {version:1,app:value.app,panelId:value.panelId,editKey:value.editKey,...(value.imageId?{imageId:value.imageId}:{}),baselineProject:project,sourceName:value.sourceName};
}

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
export function setupFigureBridge({app,loadProject,buildProject,renderPreview,captureResult,captureBatchResult,selectImage,isDirty=()=>false,hasContent,canReuseProject,canAdoptAccepted=()=>false,confirmDiscard,onProjectLoaded,onAccepted,onConnectionChange=()=>{},startDetached=false,
  windowRef=window,documentRef=windowRef.document,locationRef=windowRef.location,registerEditorRef=registerEditor,channelFactory}) {
  if(!['plot','mifito'].includes(app))return null;
  // An updater may restore local work that no longer belongs to the URL's old
  // bridge. Keep that work unbound until a fresh discovery claim proves identity.
  const initialContext=startDetached?null:getFigureBridgeContext(locationRef),workspace=new URLSearchParams(locationRef.search||'').get('figureWorkspace')==='1'?figureWorkspaceAPI(windowRef):null;
  const initialParent=workspace?.studioWindow||windowRef.opener;
  let context=initialContext&&initialParent?initialContext:null,parent=context?initialParent:null,connection=null,removeConnectionListener=null,registry=null,mounted=false;
  const nativeOwner=context?(context.ownerId||crypto.randomUUID()):null;
  let normalVisit=!context;
  const hostId=crypto.randomUUID();
  let dismissConfirmation=null,restoredBinding=null;
  let active={panelId:'',requestId:'',editKey:'',sourceName:''},revision=0,initialized=false,loaded=false,busy=false,awaiting=0,awaitTimer=0,captured=null,baseline=null,disposed=false,clientBatch=false,clientAdd=false,acceptedCheckpoint=null,loadingRequest=null;
  const send=(type,extra={})=>{if(!disposed&&context&&parent&&!parent.closed)parent.postMessage({protocol:PROTOCOL,nonce:context.nonce,hostId,app,type,panelId:active.panelId,requestId:active.requestId,editKey:active.editKey,...extra},context.origin);};
  const ready=()=>send('ready',{capabilities:['reuse-v1',...(captureBatchResult?['batch-v1']:[])],loaded,busy:busy||!!awaiting});
  const panel=documentRef.createElement('div');panel.id='figure-studio-bridge';
  panel.style.cssText='display:inline-flex;flex-wrap:wrap;gap:6px;align-items:center;max-width:100%;min-width:0;color:#173c38;font:12px/1.5 system-ui,sans-serif;';
  const message=documentRef.createElement('span');message.hidden=true;message.setAttribute('role','status');message.setAttribute('aria-live','polite');
  message.style.cssText='flex-basis:100%;max-width:420px;white-space:normal;overflow-wrap:anywhere;';
  function setMessage(text){message.textContent=text;message.hidden=!text;}
  const actions=createStudioSendActions({documentRef,batch:typeof captureBatchResult==='function'}),{button,addButton}=actions;
  // The detached sender remains mounted (hidden) while this bridge is active.
  // Keep both sets addressable for workspace capture and deferred restoration.
  actions.select.id='figure-studio-bridge-send-scope';
  button.id='figure-studio-bridge-send';addButton.id='figure-studio-bridge-add';
  const setDisabled=value=>actions.setDisabled(value);setDisabled(true);
  const discard=documentRef.createElement('button');discard.type='button';discard.textContent='未反映の編集を取り消す';discard.hidden=true;
  discard.style.cssText='white-space:nowrap;border:1px solid #c6d3cf;border-radius:7px;padding:8px 12px;background:#fff;color:#526661;font:12px system-ui;cursor:pointer;';
  // Bridge actions update the original Studio panel and stay in normal layout.
  // Editors without the shared header still get an in-flow fallback.
  panel.append(actions.scope,button,addButton,discard,message);
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
  async function reuseLoaded(data,{preserveSelection=false}={}){
    busy=true;setDisabled(true);discard.disabled=true;
    try{
      // The user may have selected another image inside the warm editor.
      // Reusing a project must still resolve the image requested by Studio.
      if(!preserveSelection&&data.imageId&&typeof selectImage==='function')await selectImage(data.imageId);
      if(disposed)return;
      active.requestId=data.requestId||'';
      if(data.imageId)active.imageId=data.imageId;
      clientBatch=Array.isArray(data.capabilities)&&data.capabilities.includes('batch-v1');clientAdd=Array.isArray(data.capabilities)&&data.capabilities.includes('add-v1');
      setMessage('');send('loaded',{reused:true});
    }catch(error){
      if(disposed)return;
      loaded=false;setMessage(error.message||'対象の画像を表示できませんでした。');
      send('error',{panelId:data.panelId,requestId:data.requestId||'',code:'load-failed',loaded:false,message:message.textContent});
    }finally{busy=false;if(!disposed){setDisabled(!loaded||!!awaiting);discard.disabled=!loaded||!!awaiting;registry?.update();}}
  }
  function block(data,reason,text,{cancelled=false}={}){
    setMessage(text);
    if(cancelled)discard.hidden=true;
    else if((reason==='dirty'||reason==='dirty-check-failed')&&loaded&&baseline){discard.hidden=false;discard.disabled=false;}
    const external=normalVisit&&!initialized&&!loaded;
    send('switch-blocked',{requestId:data.requestId||'',panelId:data.panelId,editKey:data.editKey||'',activePanelId:active.panelId,activeRequestId:active.requestId,reason:external?'dirty-external':reason,message:text,...(cancelled?{cancelled:true}:{})});
    if(external&&connection){const previous=connection;removeConnectionListener?.();removeConnectionListener=null;connection=null;parent=null;context=null;unmount();previous.close();}
  }
  async function confirmReplacement(data,blockedText){
    if(workspace?.persistenceBusy){
      block(data,'workspace-restore','保存した編集状態との関連付けを復元できませんでした。現在の編集内容は保持しています。');
      return false;
    }
    const owner=context,requestParent=parent;
    let prompt;
    try{prompt=documentRef.createElement('dialog');}catch{}
    const ask=confirmDiscard||(typeof prompt?.showModal==='function'?text=>new Promise(resolve=>{
      let done=false;const finish=value=>{if(done)return;done=true;dismissConfirmation=null;try{prompt.close();}catch{}prompt.remove();resolve(value);};dismissConfirmation=()=>finish(false);
      prompt.id='figure-studio-switch-confirm';prompt.setAttribute('aria-labelledby','figure-studio-switch-title');
      prompt.style.cssText='box-sizing:border-box;width:460px;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);padding:22px;border:1px solid #adcac3;border-radius:12px;background:#fff;color:#203c39;box-shadow:0 12px 40px #173c3840;font:14px/1.7 Arial,sans-serif;';
      const title=documentRef.createElement('h2');title.id='figure-studio-switch-title';title.textContent='未反映の編集があります';title.style.cssText='margin:0 0 12px;font-size:18px;';
      const body=documentRef.createElement('p');body.textContent=text;body.style.cssText='margin:0 0 20px;white-space:pre-line;overflow-wrap:anywhere;';
      const actions=documentRef.createElement('div');actions.style.cssText='display:flex;justify-content:flex-end;gap:10px;';
      for(const [label,value]of [['キャンセル',false],['OK',true]]){const button=documentRef.createElement('button');button.type='button';button.className=value?'button primary':'button quiet';button.textContent=label;button.addEventListener('click',()=>finish(value));actions.append(button);}
      prompt.append(title,body,actions);prompt.addEventListener('cancel',event=>{event.preventDefault();finish(false);});prompt.addEventListener('close',()=>finish(false));documentRef.body.append(prompt);
      try{prompt.showModal();actions.children[0].focus();}catch{finish(false);}
    }):typeof windowRef.confirm==='function'?text=>windowRef.confirm(text):null);
    if(!ask){block(data,'dirty',blockedText);return false;}
    const name=String(data.sourceName||(app==='plot'?'figure.plotproject':'figure.mifito')).replace(/[\x00-\x1f\x7f]/g,' ').slice(0,255);
    const warning=`${app==='plot'?'PlotLauncher':'MiFiTo'}に未反映の編集があります。\n\n現在開いているプロジェクトの編集（ほかの画像・シートの編集を含む）を破棄して、Studio側の「${name}」を開きますか？\n\nOK：編集を破棄して開く\nキャンセル：現在の編集を続ける`;
    send('switch-confirmation',{requestId:data.requestId||'',panelId:data.panelId});
    let accepted=false;try{accepted=await ask(warning,{app,panelId:data.panelId,sourceName:name})===true;}catch{}
    if(disposed||context!==owner||parent!==requestParent)return false;
    if(!accepted){block(data,'dirty','切り替えをキャンセルしました。現在の編集内容はそのままです。',{cancelled:true});return false;}
    return true;
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
        if(loaded&&!busy&&!awaiting)await reuseLoaded(data);return;
      }
      if(loadingRequest&&data.panelId===loadingRequest.panelId&&(data.requestId||'')===loadingRequest.requestId&&data.editKey===loadingRequest.editKey)return;
      if(busy||awaiting){block(data,'busy','読み込み・反映処理中です。完了してから次のグラフを開いてください。');return;}
      loadingRequest={panelId:data.panelId,requestId:data.requestId||'',editKey:data.editKey};
      let releaseInteraction=null;
      busy=true;setDisabled(true);discard.disabled=true;
      try{
        // Studio already validated this binding against the saved book. Reattach
        // the exact baseline without changing the restored selection or drafts.
        // A pending input is part of that saved workspace, not another project.
        const restored=restoredBinding;
        if(loaded&&restored&&data.panelId===active.panelId&&data.editKey===active.editKey&&(!data.imageId||data.imageId===active.imageId)&&data.project.size===restored.project.size){
          const [incoming,saved]=await Promise.all([digest(data.project),digest(restored.project)]);
          if(disposed)return;
          if(restoredBinding===restored&&incoming===saved){restoredBinding=null;await reuseLoaded(data,{preserveSelection:true});return;}
        }
        let adoptedCheckpoint=null,reuseProject=false,forceProject=false;
        if(typeof canReuseProject==='function')try{reuseProject=await canReuseProject(data)===true;}catch{}
        if(disposed)return;
        // Reopening this snapshot keeps all in-progress work in the warm tab.
        if(loaded&&data.panelId===active.panelId&&data.editKey&&data.editKey===active.editKey&&(!canReuseProject||reuseProject)){
          await reuseLoaded(data);return;
        }
        if(normalVisit&&!initialized){
          let occupied;
          try{occupied=hasContent?await hasContent():await isDirty();adoptedCheckpoint=occupied?await adoptionProof(data.project):null;}
          catch{block(data,'dirty-check-failed','開いている編集内容を確認できません。元アプリの編集内容を保存してから、もう一度お試しください。');return;}
          if(disposed)return;
          if(occupied&&!adoptedCheckpoint&&!reuseProject){
            if(!await confirmReplacement(data,'この編集画面には別の内容が開いています。現在の内容を保存してから、対象のプロジェクトを開き直してください。'))return;
            forceProject=true;
          }
        }
        if(loaded&&!reuseProject&&!forceProject){
          let dirty;
          try{dirty=await isDirty();}
          catch{block(data,'dirty-check-failed','編集中の内容を確認できません。Figureへ反映するか、未反映の編集を取り消してから、次のグラフをもう一度開いてください。');return;}
          if(disposed)return;
          if(dirty){
            if(!await confirmReplacement(data,'未反映の編集があります。Figureへ反映するか、未反映の編集を取り消してから、次のグラフをもう一度開いてください。'))return;
            forceProject=true;
          }
        }
        restoredBinding=null;
        active={panelId:data.panelId,requestId:data.requestId||'',editKey:data.editKey||'',sourceName:String(data.sourceName||(app==='plot'?'figure.plotproject':'figure.mifito')).replace(/[\\/]/g,'_'),...(data.imageId?{imageId:data.imageId}:{})};
        clientBatch=Array.isArray(data.capabilities)&&data.capabilities.includes('batch-v1');clientAdd=Array.isArray(data.capabilities)&&data.capabilities.includes('add-v1');
        // Transport reconnection does not prove that this editor contains the
        // requested project. Exact bound snapshots were handled above; only a
        // byte-checked adoption may preserve content in a newly bound route.
        const reconnect=!forceProject&&(!!adoptedCheckpoint||reuseProject);
        // An adopted normal workspace is not bound until its asynchronous
        // preparation has revalidated the exact same source identity.
        initialized=!adoptedCheckpoint;loaded=false;captured=null;baseline=null;revision=0;discard.hidden=true;
        setMessage('開いている編集画面へ元プロジェクトを読み込んでいます…');
        if(forceProject)send('switch-confirmed');
        // Keep the loaded baseline exact while decoding/rendering and preparing
        // its checkpoint. Edits entered during that wait must not be marked clean.
        const body=documentRef.body;
        if(body&&typeof body.inert==='boolean'){
          const previous=body.inert,blockInput=event=>{event.preventDefault();event.stopImmediatePropagation();};body.inert=true;
          windowRef.addEventListener('keydown',blockInput,true);
          releaseInteraction=()=>{body.inert=previous;windowRef.removeEventListener('keydown',blockInput,true);};
        }
        await loadProject(new File([data.project],active.sourceName,{type:data.project.type||'application/octet-stream'}),{reconnect,...(forceProject?{force:true}:{}),...(active.imageId?{imageId:active.imageId}:{})});
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
      }finally{releaseInteraction?.();loadingRequest=null;busy=false;if(!disposed){setDisabled(!loaded||!!awaiting);discard.disabled=!loaded||!!awaiting;registry?.update();}}
      return;
    }
    if(!loaded||!matchesActive(data)||!awaiting||data.revision!==awaiting)return;
    if(data.type==='accepted'){
      clearTimeout(awaitTimer);awaitTimer=0;awaiting=0;
      if(typeof data.editKey==='string'&&data.editKey.length<=2048)active.editKey=data.editKey;
      if(isTransferImageId(data.imageId))active.imageId=data.imageId;
      if(captured&&captured.intent!=='add'){baseline={project:captured.project,sourceName:captured.sourceName||active.sourceName};active.sourceName=baseline.sourceName;}
      discard.hidden=true;
      busy=true;
      try{
        if(captured?.intent!=='add')await onAccepted?.(captured,{...active,revision:data.revision,...transferReceipt(data)});
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
      dismissConfirmation?.();
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
  async function apply(batch=false,intent='sync'){
    if(disposed||!loaded||busy||awaiting)return;
    if(intent==='add'&&!clientAdd){setMessage('Figure Studioを最新版へ更新してから、新規追加をお試しください。');return;}
    if(batch&&!clientBatch){setMessage('Figure Studioを最新版へ更新してから、一括反映をお試しください。');return;}
    if(!parent||parent.closed){setMessage('Figure Studioが閉じています。編集内容をプロジェクトとして保存してください。');return;}
    busy=true;setDisabled(true);discard.disabled=true;send('applying');setMessage('編集結果を作成しています…');
    try{
      const result=batch?await captureBatchResult():captureResult?await captureResult():{project:await buildProject(),preview:await renderPreview()};
      if(disposed)return;
      const wire=transferResult(app,{...result,intent},result.sourceName||active.sourceName);
      if(!!wire.batch!==batch)throw Error('編集結果の一括反映形式を確認してください。');
      captured={...result,intent};awaiting=++revision;const sentRevision=revision,sentRequest=active.requestId;
      send('result',{revision,...wire});
      setMessage('Figureへの反映を確認しています…');
      awaitTimer=setTimeout(()=>{if(!disposed&&awaiting===sentRevision&&active.requestId===sentRequest){awaiting=0;captured=null;setDisabled(false);discard.disabled=false;setMessage('Figureからの確認が届きません。Figure Studioの画面を確認してください。');}},30000);
    }catch(error){
      if(disposed)return;captured=null;setMessage(error.message||'編集結果の作成に失敗しました。');send('error',{code:'capture-failed',message:message.textContent});setDisabled(false);
    }finally{busy=false;if(!disposed)discard.disabled=!loaded||!!awaiting;}
  }
  button.addEventListener('click',()=>apply(actions.batch));
  addButton.addEventListener('click',()=>apply(actions.batch,'add'));
  function resetWorkspaceBinding(){
    if(disposed)throw Error('編集画面との接続は終了しています。');
    if(busy||awaiting||loadingRequest)throw Error('読み込み・反映処理が終わってから、作業内容を復元してください。');
    if(loaded&&active.panelId&&active.requestId)send('detached',{message:'編集画面の元プロジェクトが切り替わりました。対象の図を開くと再接続します。'});
    const previous=connection;removeConnectionListener?.();removeConnectionListener=null;connection=null;parent=null;context=null;previous?.close();unmount();
    clearTimeout(awaitTimer);awaitTimer=0;active={panelId:'',requestId:'',editKey:'',sourceName:''};revision=0;initialized=false;loaded=false;captured=null;baseline=null;restoredBinding=null;clientBatch=false;clientAdd=false;acceptedCheckpoint=null;
    // Detaching can follow a manual project replacement even in a tab originally
    // opened by Studio. Its new local content now needs the normal adoption guard.
    normalVisit=true;
    discard.hidden=true;setDisabled(true);setMessage('');registry?.update();
  }
  return {
    get isConnected(){return mounted&&!!parent&&!parent.closed;},
    async captureWorkspaceBinding(){
      if(disposed||busy||awaiting||loadingRequest)throw Error('読み込み・反映処理が終わってから、作業内容を保存してください。');
      if(!loaded||!baseline)return null;
      return validateWorkspaceBinding({version:1,app,panelId:active.panelId,editKey:active.editKey,...(active.imageId?{imageId:active.imageId}:{}),baselineProject:baseline.project,sourceName:baseline.sourceName});
    },
    restoreWorkspaceBinding(value){
      const binding=validateWorkspaceBinding(value);if(binding&&binding.app!==app)throw Error('編集アプリの関連付けが一致しません。');
      resetWorkspaceBinding();if(!binding)return;
      active={panelId:binding.panelId,requestId:'',editKey:binding.editKey,sourceName:binding.sourceName,...(binding.imageId?{imageId:binding.imageId}:{})};
      baseline={project:new Blob([binding.baselineProject],{type:binding.baselineProject.type||'application/octet-stream'}),sourceName:binding.sourceName};
      restoredBinding={project:baseline.project};
      initialized=true;loaded=true;registry?.update();
      // A fresh Studio request may attach to this exact identity, but neither
      // the current editor nor its unreflected preview is loaded or applied.
    },
    resetWorkspaceBinding,
    async rememberAccepted(result){
      if(disposed||!(result?.project instanceof Blob)||!result.project.size||result.project.size>MAX_PROJECT)return false;
      const checkpoint={result,hash:null,ready:digest(result.project)};acceptedCheckpoint=checkpoint;
      try{checkpoint.hash=await checkpoint.ready;}catch(error){if(acceptedCheckpoint===checkpoint)acceptedCheckpoint=null;throw error;}
      if(disposed||acceptedCheckpoint!==checkpoint)return false;
      registry?.update();return true;
    },
    close(){if(disposed)return;disposed=true;dismissConfirmation?.();clearInterval(readyTimer);clearTimeout(awaitTimer);windowRef.removeEventListener('message',receive);removeConnectionListener?.();connection?.close();registry?.close();unmount();acceptedCheckpoint=null;}
  };
}

