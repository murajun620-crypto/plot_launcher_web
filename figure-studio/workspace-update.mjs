import {parseRelease,hasNewRelease} from './update-check.mjs?v=latest-open-v0720-1';
import {SOURCE_APPS} from './integration/bridge-client.mjs?v=studio-send-v0714-1';

const TOKEN='_workspaceUpdate',APPS=['studio','plot','mifito'];
const NAMES={studio:'Studio',plot:'PlotLauncher',mifito:'MiFiTo'};
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

/** Local recovery is per navigation, so another Studio window cannot consume it. */
async function sessionStore(windowRef,operation,key,value){
 return new Promise((resolve,reject)=>{
  const request=windowRef.indexedDB.open('figure-studio-updates',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('sessions');
  request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('更新用の一時保存を開けませんでした。'));
  request.onsuccess=()=>{const db=request.result;
   try{const tx=db.transaction('sessions',operation==='get'?'readonly':'readwrite'),store=tx.objectStore('sessions');
    const action=operation==='get'?store.get(key):operation==='put'?store.put(value,key):store.delete(key);
    tx.oncomplete=()=>{db.close();resolve(action.result);};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error||action.error);};
   }catch(error){db.close();reject(error);}
  };
 });
}

/** Update the shell and every loaded editor as one recoverable navigation. */
export function installWorkspaceUpdater(api,{windowRef=window,documentRef=windowRef.document}={}){
 if(api.workspaceUpdater){api.workspaceUpdater.bind();return api.workspaceUpdater;}
 const button=documentRef.getElementById('checkUpdateButton');
 if(!button)return null;
 const shellRelease=readStudioRelease(documentRef);
 let busy=false,available=null,recovery=null,recoveryToken=null,noticeTimer=null,guardTimer=null,guardCleanup=null,innerButton=null;
 const status=documentRef.createElement('div');status.id='workspace-update-status';status.className='workspace-status';status.setAttribute('role','status');status.hidden=true;status.style.pointerEvents='auto';documentRef.body.append(status);
 const frames=()=>APPS.map(app=>documentRef.getElementById(`${app}-frame`)).filter(Boolean);
 const child=app=>documentRef.getElementById(`${app}-frame`)?.contentWindow;
 function notice(text,{persistent=false,backup=false}={}){
  windowRef.clearTimeout(noticeTimer);status.replaceChildren(documentRef.createTextNode(text));status.hidden=!text;
  if(backup&&recovery){const link=documentRef.createElement('button');link.type='button';link.textContent='復元用プロジェクトを保存';link.style.cssText='margin-left:10px;padding:5px 8px;';link.onclick=()=>{
   const blob=new windowRef.Blob([JSON.stringify(recovery.studio.project)],{type:'application/json'}),url=windowRef.URL.createObjectURL(blob),a=documentRef.createElement('a');a.href=url;a.download=recovery.studio.name||'recovered.figurestudio';documentRef.body.append(a);a.click();a.remove();windowRef.setTimeout(()=>windowRef.URL.revokeObjectURL(url),30000);
  };status.append(link);}
  if(!persistent)noticeTimer=windowRef.setTimeout(()=>{status.hidden=true;},15000);
 }
 function lock(value){
  api.workspaceUpdateBusy=value;api.persistenceBusy=value;documentRef.documentElement.dataset.workspaceBusy=String(value);
  for(const tab of documentRef.querySelectorAll('[role="tab"][data-app]'))tab.disabled=value;
  for(const panel of documentRef.querySelectorAll('.workspace-panel'))panel.inert=value||panel.getAttribute('aria-hidden')==='true';
 }
 function paint(){
  const text=busy?'更新準備中…':recoveryToken?'復元を再試行':available?'3アプリを更新':'更新確認';
  for(const target of [button,innerButton].filter(Boolean)){
   const label=target.querySelector('.update-check-label');if(label)label.textContent=text;
   target.disabled=busy;target.dataset.state=busy?'updating':recoveryToken?'recovery':available?'available':'idle';target.classList.toggle('has-update',!!available);
   target.setAttribute('aria-busy',String(busy));target.title=available?'3アプリの作業内容を維持して更新':'Studio・PlotLauncher・MiFiToの更新を確認';target.setAttribute('aria-label',target.title);
  }
 }
 function liveRelease(app){
  try{const win=child(app);if(!win)return null;
   if(app==='studio')return win.FigureStudioWorkspaceUpdate?.release||readStudioRelease(win.document);
   if(win.FigureStudioWorkspaceState?.release)return parseRelease(win.FigureStudioWorkspaceState.release);
   const doc=win.document,version=doc.querySelector(app==='plot'?'#app-version':'#appVersion')?.textContent?.match(/\d+\.\d+\.\d+/)?.[0];
   const script=[...doc.querySelectorAll('script[src]')].find(node=>new URL(node.src).pathname.endsWith('/app.js'));
   const build=script&&new URL(script.src).searchParams.get('v');return version&&build?parseRelease({version,build}):null;
  }catch{return null;}
 }
 function syncVersion(){
  const release=liveRelease('studio');if(!release)return;
  const label=documentRef.querySelector('.workspace-version');if(label)label.textContent=`v${release.version}`;
 }
 const clicked=event=>{event.stopImmediatePropagation();void(recoveryToken?restore():available?update():check());};
 button.addEventListener('click',clicked,true);
 function bind(){
  let next;try{next=child('studio')?.document.getElementById('checkUpdateButton');}catch{}
  if(next!==innerButton){innerButton?.removeEventListener('click',clicked,true);innerButton=next;innerButton?.addEventListener('click',clicked,true);}
  syncVersion();paint();
 }
 documentRef.getElementById('studio-frame')?.addEventListener('load',bind);
 async function studioAPI(){
  const deadline=Date.now()+45000;
  while(Date.now()<deadline){const value=child('studio')?.FigureStudioWorkspaceUpdate;if(value?.capture&&value?.restore)return value;await pause(80);}
  throw Error('Studioの準備が完了してから、もう一度お試しください。');
 }
 async function check({silent=false}={}){
  if(busy)return {busy:true};busy=true;paint();if(!silent)notice('3アプリの更新を確認しています…',{persistent:true});
  const controller=new windowRef.AbortController(),timer=windowRef.setTimeout(()=>controller.abort(),10000);
  try{
   const entries=await Promise.all(APPS.map(async app=>{
    const url=app==='studio'?new URL('./version.json',documentRef.baseURI):new URL(new URL(SOURCE_APPS[app].url).pathname+'version.json',windowRef.location.origin);
    url.searchParams.set('check',String(Date.now()));const response=await windowRef.fetch(url.href,{cache:'no-store',credentials:'same-origin',signal:controller.signal});
    if(!response.ok)throw Error(`${NAMES[app]}の更新情報を取得できませんでした。`);return [app,parseRelease(await response.json())];
   }));
   const releases=Object.fromEntries(entries);
   if(hasNewRelease(releases.studio,shellRelease)&&releases.studio.version!==shellRelease.version||APPS.some(app=>{const current=liveRelease(app);return current&&current.version!==releases[app].version&&hasNewRelease(releases[app],current);}))throw Error('配信情報の反映中です。少し待って再試行してください。');
   const changed=hasNewRelease(shellRelease,releases.studio)||APPS.some(app=>{const current=liveRelease(app);return current&&hasNewRelease(current,releases[app]);});
   available=changed?releases:null;
   const versions=APPS.map(app=>`${NAMES[app]} v${releases[app].version}`).join(' ／ ');
   if(!silent)notice(changed?`${versions}。「3アプリを更新」で、開いているプロジェクトと未反映の編集を維持して更新します。`:`開いている3アプリは最新です。${versions}`);
   return {available:changed,releases};
  }catch(error){if(silent)throw error;notice(error.name==='AbortError'?'更新確認がタイムアウトしました。再度お試しください。':`更新を確認できませんでした。${error.message}`);}
  finally{windowRef.clearTimeout(timer);busy=false;paint();}
 }
 function releaseGuards(){guardCleanup?.();guardCleanup=null;windowRef.clearTimeout(guardTimer);}
 function prepareNavigation(){
  // This runs only after every editor has been durably saved. Older editors
  // cannot suspend their unload guard; detach those frames before navigation.
  const remove=[];
  for(const frame of frames()){
   const win=frame.contentWindow,state=frame.id==='studio-frame'?win.FigureStudioWorkspaceUpdate:win.FigureStudioWorkspaceState;
   if(state?.setUpdateReloading){state.setUpdateReloading(true);remove.push(()=>state.setUpdateReloading(false));}
   else{const parent=frame.parentNode;frame.remove();remove.push(()=>parent.append(frame));}
  }
  guardCleanup=()=>{for(const cleanup of remove)cleanup();};
 }
 async function update({pendingToken=null,verified=false}={}){
  if(busy||!available)return false;
  if(!verified){try{const checked=await check({silent:true});if(!checked?.available)return false;}catch(error){notice(`更新を確認できませんでした。${error.message}`,{persistent:true});return false;}}
  busy=true;lock(true);paint();notice('3アプリの作業内容を一時保存しています…',{persistent:true});let studio,stored=null;
  try{
   studio=await studioAPI();const saved=await studio.capture();lock(true);
   const handles={};for(const app of ['plot','mifito'])handles[app]=await child(app)?.FigureStudioWorkspaceState?.captureReloadHandles?.()??null;
   const token=windowRef.crypto.randomUUID(),url=new URL(windowRef.location.href);url.searchParams.delete(TOKEN);
   const record={format:'figure-studio-update',version:1,url:url.href,createdAt:Date.now(),targets:available,studio:saved,handles};
   await sessionStore(windowRef,'put',token,record);
   stored={token,record};
   prepareNavigation();url.searchParams.set(TOKEN,token);if(pendingToken)url.searchParams.set('_projectOpen',pendingToken);url.searchParams.set('_appBuild',available.studio.build);url.searchParams.set('_appReload',windowRef.crypto.randomUUID());notice('一時保存しました。3アプリを更新して再開します。',{persistent:true});windowRef.location.replace(url.href);
   guardTimer=windowRef.setTimeout(()=>{releaseGuards();studio.cancel?.();recovery=record;recoveryToken=token;busy=false;lock(true);paint();notice('画面の切り替えが完了しませんでした。作業は一時保存しています。「復元を再試行」で再開できます。',{persistent:true,backup:true});},8000);
   return true;
  }catch(error){releaseGuards();studio?.cancel?.();busy=false;if(stored){recovery=stored.record;recoveryToken=stored.token;}lock(!!recoveryToken);paint();notice(`更新を中止しました。${stored?'作業は一時保存しています。「復元を再試行」で再開できます。':'現在の作業はそのままです。'}${error.message}`,{persistent:true,backup:!!stored});return false;}
 }
 async function restore(){
  if(busy)return;const token=recoveryToken||new URL(windowRef.location.href).searchParams.get(TOKEN);if(!uuid(token))return;
  busy=true;lock(true);paint();notice('更新前のプロジェクトと3アプリの編集状態を復元しています…',{persistent:true});let restored=false;
  try{
   const record=await sessionStore(windowRef,'get',token),original=record&&new URL(record.url);
   if(record?.format!=='figure-studio-update'||record.version!==1||!record.studio?.project||original.origin!==windowRef.location.origin||original.pathname!==windowRef.location.pathname)throw Error('更新前の一時保存が見つかりません。');
   recovery=record;recoveryToken=token;const studio=await studioAPI();await studio.restore(record.studio);lock(true);
   for(const app of ['plot','mifito'])if(record.handles?.[app])await child(app)?.FigureStudioWorkspaceState?.restoreReloadHandles?.(record.handles[app]);
   lock(false);api.show(record.studio.project.workspace?.active||'studio');
   original.searchParams.set('_appBuild',shellRelease.build);original.searchParams.set('_appReload',windowRef.crypto.randomUUID());const pendingToken=new URL(windowRef.location.href).searchParams.get('_projectOpen');if(pendingToken)original.searchParams.set('_projectOpen',pendingToken);windowRef.history.replaceState(null,'',original.href);
   // The recovery record remains available until all three restorations succeed.
   try{await sessionStore(windowRef,'delete',token);}catch{}
   recovery=null;recoveryToken=null;available=null;syncVersion();restored=true;notice('3アプリを更新し、開いていたプロジェクトと未反映の編集を復元しました。');
  }catch(error){notice(`作業の復元を完了できませんでした。一時保存は保持しています。「復元を再試行」を押してください。${error.message}`,{persistent:true,backup:true});}
  finally{busy=false;lock(!!recoveryToken);paint();}
  if(restored)try{await windowRef.FigureAppRelease?.resumeWorkspace(api);}catch(error){notice(error.message,{persistent:true});}
 }
 async function ensureLatest(stagePending=null){
  const checked=await check({silent:true});if(checked?.busy)throw Error('更新・復元の完了を待ってからプロジェクトを開いてください。');
  if(!checked.available)return true;
  const pendingToken=stagePending?await stagePending():null;
  if(!await update({pendingToken,verified:true}))throw Error('最新版への更新を完了できませんでした。');return false;
 }
 api.workspaceUpdater={check,update,restore,bind,ensureLatest,get busy(){return busy;}};
 bind();const token=new URL(windowRef.location.href).searchParams.get(TOKEN);if(uuid(token)){recoveryToken=token;void restore();}
 else if(new URL(windowRef.location.href).searchParams.has('_projectOpen'))void studioAPI().then(()=>windowRef.FigureAppRelease?.resumeWorkspace(api)).catch(error=>notice(error.message,{persistent:true}));
 return api.workspaceUpdater;
}

function readStudioRelease(documentRef){
 return parseRelease({version:documentRef.querySelector('meta[name="figure-studio-version"]')?.content,build:documentRef.querySelector('meta[name="figure-studio-build"]')?.content});
}
