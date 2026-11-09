// Check the deployed release before importing an editor or restoring a project.
const OPEN_TOKEN='_projectOpen',BUILD_PATTERN=/^[a-zA-Z0-9._-]{1,100}$/;
const UUID_PATTERN=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const names={plot:'PlotLauncher',mifito:'MiFiTo',studio:'Figure Studio',shell:'Figure Studio'};
function release(value){
 if(!value||!/^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(value.version)||!BUILD_PATTERN.test(value.build))throw Error('配信情報を確認できませんでした。');
 return {version:value.version,build:value.build};
}
function compare(a,b){const left=a.split('.').map(Number),right=b.split('.').map(Number);for(let i=0;i<3;i++)if(left[i]!==right[i])return left[i]>right[i]?1:-1;return 0;}
function equal(a,b){return a.version===b.version&&a.build===b.build;}
async function pendingStore(operation,key,value){
 return new Promise((resolve,reject)=>{
  const opening=indexedDB.open('figure-app-launches',1);
  opening.onupgradeneeded=()=>opening.result.createObjectStore('pending');
  opening.onerror=()=>reject(opening.error);opening.onblocked=()=>reject(Error('プロジェクトの一時保存を開けませんでした。'));
  opening.onsuccess=()=>{const db=opening.result;try{
   const tx=db.transaction('pending',operation==='get'?'readonly':'readwrite'),store=tx.objectStore('pending');
   const request=operation==='get'?store.get(key):operation==='put'?store.put(value,key):store.delete(key);
   tx.oncomplete=()=>{db.close();resolve(request.result);};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error||request.error);};
  }catch(error){db.close();reject(error);}};
 });
}
export function installReleaseGuard({app,current,entry,windowRef=window,documentRef=document}){
 current=release(current);let hooks={},checking=null,resuming=null;
 const parentWorkspace=()=>{try{return windowRef.parent!==windowRef?windowRef.parent.FigureStudioWorkspace:null;}catch{return null;}};
 async function latest(){
  if(checking)return checking;
  checking=(async()=>{
   const controller=new windowRef.AbortController(),timeout=windowRef.setTimeout(()=>controller.abort(),10000);
   try{
    const url=new URL('./version.json',documentRef.baseURI);url.searchParams.set('check',windowRef.crypto.randomUUID());
    const response=await windowRef.fetch(url.href,{cache:'no-store',credentials:'same-origin',signal:controller.signal});
    if(!response.ok)throw Error('配信情報を取得できませんでした。');
    const remote=release(await response.json());
    if(compare(remote.version,current.version)<0)throw Error('配信情報の反映中です。少し待って再試行してください。');
    return remote;
   }catch(error){if(error.name==='AbortError')throw Error('最新版の確認がタイムアウトしました。接続を確認して再試行してください。');throw error;}
   finally{windowRef.clearTimeout(timeout);}
  })();
  try{return await checking;}finally{checking=null;}
 }
 function navigationURL(value,target,pendingToken){
  const url=new URL(value,windowRef.location.href);url.searchParams.set('_appBuild',release(target).build);url.searchParams.set('_appReload',windowRef.crypto.randomUUID());
  if(pendingToken)url.searchParams.set(OPEN_TOKEN,pendingToken);return url;
 }
 async function startup(){
  const remote=await latest();if(equal(current,remote))return true;
  const attempts=Number(new URL(windowRef.location.href).searchParams.get('_appAttempts')||0);
  if(!Number.isInteger(attempts)||attempts>=3)throw Error('最新版の配信ファイルをまだ取得できません。少し待って再試行してください。');
  const url=navigationURL(windowRef.location.href,remote);url.searchParams.set('_appAttempts',String(attempts+1));windowRef.location.replace(url.href);return false;
 }
 async function stage(pending){
  if(!pending)return null;
  if(!(pending.file instanceof File))throw Error('開くプロジェクトを確認してください。');
  if(resuming?.file===pending.file)return resuming.token;
  const token=windowRef.crypto.randomUUID();await pendingStore('put',token,{format:'figure-app-open',version:1,app:app==='shell'?'studio':app,file:pending.file,handle:pending.handle??null,options:pending.options??{},createdAt:Date.now()});return token;
 }
 async function ensureCurrent(pending=null){
  const workspace=parentWorkspace();
  if(workspace?.workspaceUpdater?.ensureLatest)return workspace.workspaceUpdater.ensureLatest(pending?()=>stage(pending):null);
  const target=await latest();if(equal(current,target))return true;
  if(typeof hooks.update!=='function')throw Error('最新版を確認しています。準備が完了してから開いてください。');
  const token=await stage(pending);
  if(!await hooks.update(target,token)){if(token)await pendingStore('delete',token);throw Error('最新版への更新が完了してからプロジェクトを開いてください。');}
  return false;
 }
 async function resumeToken(token){
  if(!UUID_PATTERN.test(token||'')||resuming)return false;
  const record=await pendingStore('get',token);
  if(!record||record.format!=='figure-app-open'||record.version!==1||record.app!==app||!(record.file instanceof File)||typeof hooks.open!=='function')throw Error('更新後に開くプロジェクトを復元できませんでした。');
  resuming={token,file:record.file};
  try{
   if(await hooks.open(record)===false)return false;
   await pendingStore('delete',token);const url=new URL(windowRef.location.href);if(url.searchParams.get(OPEN_TOKEN)===token){url.searchParams.delete(OPEN_TOKEN);windowRef.history.replaceState(null,'',url.href);}return true;
  }finally{resuming=null;}
 }
 async function resumePending(){if(parentWorkspace())return false;return resumeToken(new URL(windowRef.location.href).searchParams.get(OPEN_TOKEN));}
 async function resumeWorkspace(workspace){
  const token=new URL(windowRef.location.href).searchParams.get(OPEN_TOKEN);if(!UUID_PATTERN.test(token||''))return false;
  const record=await pendingStore('get',token);if(!record||!['studio','plot','mifito'].includes(record.app))throw Error('更新後に開くプロジェクトが見つかりません。');
  const child=record.app==='studio'?workspace.studioWindow:workspace.openEditor(record.app),deadline=Date.now()+90000;
  while(Date.now()<deadline){
   const guard=child?.FigureAppRelease;
   if(guard?.canOpen){const opened=await guard.resumeToken(token);if(opened){const url=new URL(windowRef.location.href);url.searchParams.delete(OPEN_TOKEN);windowRef.history.replaceState(null,'',url.href);}return opened;}
   await new Promise(resolve=>windowRef.setTimeout(resolve,80));
  }
  throw Error('最新版の編集画面の準備が完了しませんでした。');
 }
 const api={current,app,latest,startup,navigationURL,ensureCurrent,resumePending,resumeToken,resumeWorkspace,
  configure(value){hooks={...hooks,...value};},get canOpen(){return typeof hooks.open==='function'&&(!hooks.ready||hooks.ready());},
  assertRunning(value){if(!equal(current,release(value)))throw Error('アプリの配信ファイルが一致しません。更新してから開いてください。');}
 };
 windowRef.FigureAppRelease=api;
 windowRef.addEventListener('pageshow',event=>{if(event.persisted&&hooks.update)void ensureCurrent().catch(error=>hooks.error?.(error));});
 return api;
}

async function boot(script){
 const app=script.dataset.releaseApp,current={version:script.dataset.releaseVersion,build:script.dataset.releaseBuild},entry=new URL(script.dataset.releaseEntry,document.baseURI);
 if(entry.origin!==location.origin)throw Error('アプリの配信元を確認してください。');
 const guard=installReleaseGuard({app,current,entry});
 const cover=document.createElement('section');cover.id='app-release-status';cover.setAttribute('role','status');cover.style.cssText='position:fixed;inset:0;z-index:2147483647;display:grid;place-content:center;gap:16px;padding:32px;background:#fff;color:#172638;font:16px/1.6 Arial,sans-serif;text-align:center';
 const title=document.createElement('strong'),message=document.createElement('p'),retry=document.createElement('button');title.textContent=`${names[app]}の最新版を確認しています…`;message.textContent='プロジェクトは最新版のアプリで開きます。';retry.textContent='再試行';retry.hidden=true;retry.style.cssText='padding:10px 20px;justify-self:center;cursor:pointer';cover.append(title,message,retry);document.body.append(cover);
 let running=false;
 async function run(){
  if(running)return;running=true;retry.hidden=true;
  try{
   if(!await guard.startup())return;
   const url=new URL(location.href);url.searchParams.delete('_appAttempts');history.replaceState(null,'',url.href);
   entry.searchParams.set('_appLoad',crypto.randomUUID());
   await import(entry.href);cover.remove();
  }catch(error){title.textContent='最新版の確認を完了できませんでした';message.textContent=error.message;retry.hidden=false;}
  finally{running=false;}
 }
 retry.onclick=()=>{const url=new URL(location.href);url.searchParams.delete('_appAttempts');url.searchParams.set('_appReload',crypto.randomUUID());location.replace(url.href);};
 await run();
}
if(typeof document!=='undefined'){
 const script=document.querySelector('script[data-release-entry]');if(script)void boot(script);
}
