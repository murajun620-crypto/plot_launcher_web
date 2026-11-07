import {SOURCE_APPS} from './integration/bridge-client.mjs?v=workspace-save-v050-1';
import {installWorkspacePersistence} from './workspace-session.mjs?v=workspace-save-v050-1';

const APPS=['studio','plot','mifito'];

/** One live document per editor: changing the visible workspace never navigates it. */
export function createWorkspace({windowRef=window,documentRef=windowRef.document}={}){
 const workspaceOwner=windowRef.crypto?.randomUUID?.()||crypto.randomUUID();
 const frames=new Map([['studio',documentRef.getElementById('studio-frame')]]);
 const tabs=[...documentRef.querySelectorAll('[role="tab"][data-app]')];
 let active='studio',noticeTimer=null,updateObserver=null;
 function editorUrl(app,options={}){
  const base=new URL(new URL(SOURCE_APPS[app].url).pathname,windowRef.location.origin);
  const target=new URL(options.url||base.href,windowRef.location.href);
  if(target.origin!==windowRef.location.origin||!/^https?:$/.test(target.protocol))throw Error('編集画面はFigure Studioと同じ配信元で開いてください。');
  target.searchParams.set('figureWorkspace','1');
  target.searchParams.set('figureWorkspaceOwner',workspaceOwner);
  if(options.nonce){const hash=new URLSearchParams(target.hash.slice(1));hash.set('figureBridge',options.nonce);hash.set('figureOrigin',options.origin||windowRef.location.origin);if(options.ownerId)hash.set('figureOwner',options.ownerId);target.hash=hash.toString();}
  return target.href;
 }
 function ensureFrame(app,options={}){
  if(!APPS.includes(app))throw Error('編集画面が見つかりません。');
  if(frames.has(app))return frames.get(app);
  const frame=documentRef.createElement('iframe');frame.id=`${app}-frame`;frame.title=app==='plot'?'PlotLauncherでグラフを編集':'MiFiToで画像を編集';frame.src=editorUrl(app,options);
  frame.addEventListener('load',()=>{if(active===app)resize(frame);});
  documentRef.getElementById(`workspace-panel-${app}`).append(frame);frames.set(app,frame);return frame;
 }
 function resize(frame){
  windowRef.requestAnimationFrame(()=>{try{const child=frame.contentWindow;child.dispatchEvent(new child.Event('resize'));}catch{}});
 }
 function show(app){
  const frame=ensureFrame(app);if(api.persistenceBusy)return frame.contentWindow;active=app;
  for(const name of APPS){const shown=name===app,panel=documentRef.getElementById(`workspace-panel-${name}`);panel.setAttribute('aria-hidden',String(!shown));panel.inert=!shown;const child=frames.get(name);if(child)child.tabIndex=shown?0:-1;}
  for(const tab of tabs){const selected=tab.dataset.app===app;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;}
  resize(frame);return frame.contentWindow;
 }
 const api={ownerId:workspaceOwner,openEditor(app,options={}){if(!SOURCE_APPS[app])throw Error('編集アプリが見つかりません。');const frame=ensureFrame(app,options);show(app);return frame.contentWindow;},show,get studioWindow(){return frames.get('studio').contentWindow;},get studioReceiverId(){try{return api.studioWindow.FigureStudioWorkspaceReceiverId||null;}catch{return null;}}};
 windowRef.FigureStudioWorkspace=api;
 installWorkspacePersistence(api,{windowRef,documentRef});
 for(const tab of tabs){
  tab.addEventListener('click',()=>show(tab.dataset.app));
  tab.addEventListener('keydown',event=>{let index=tabs.indexOf(tab);if(event.key==='ArrowRight')index=(index+1)%tabs.length;else if(event.key==='ArrowLeft')index=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')index=0;else if(event.key==='End')index=tabs.length-1;else return;event.preventDefault();show(tabs[index].dataset.app);tabs[index].focus();});
 }
 function notice(message){const box=documentRef.getElementById('workspace-status');box.textContent=message;box.hidden=!message;windowRef.clearTimeout(noticeTimer);noticeTimer=windowRef.setTimeout(()=>{box.hidden=true;},6500);}
 // Only the Studio document updates here. A shell reload must first preserve
 // every live source editor; it must never be substituted for this proxy.
 const updateButton=documentRef.getElementById('checkUpdateButton'),updateLabel=updateButton.querySelector('.update-check-label');
 function innerUpdateButton(){try{return api.studioWindow.document.getElementById('checkUpdateButton');}catch{return null;}}
 function syncUpdate(){const inner=innerUpdateButton();updateButton.disabled=!inner||inner.disabled;if(!inner)return;updateLabel.textContent=inner.querySelector('.update-check-label')?.textContent||'更新確認';updateButton.title=inner.title||'新しいバージョンを確認';updateButton.setAttribute('aria-label',inner.getAttribute('aria-label')||updateButton.title);updateButton.setAttribute('aria-busy',inner.getAttribute('aria-busy')||'false');updateButton.classList.toggle('has-update',inner.classList.contains('has-update'));}
 function bindUpdate(){updateObserver?.disconnect();updateObserver=null;const inner=innerUpdateButton();syncUpdate();if(inner&&typeof windowRef.MutationObserver==='function'){updateObserver=new windowRef.MutationObserver(syncUpdate);updateObserver.observe(inner,{subtree:true,childList:true,characterData:true,attributes:true});}}
 updateButton.addEventListener('click',()=>{const inner=innerUpdateButton();if(!inner){notice('Figureの準備ができてから、もう一度お試しください。');return;}inner.click();syncUpdate();});
 frames.get('studio').addEventListener('load',()=>{bindUpdate();if(active==='studio')resize(frames.get('studio'));});
 bindUpdate();
 show('studio');return api;
}

if(typeof document!=='undefined'&&document.getElementById('studio-frame'))createWorkspace();
