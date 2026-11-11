import {SOURCE_APPS} from './integration/bridge-client.mjs?v=force-switch-v072-1';
import {installWorkspacePersistence} from './workspace-session.mjs?v=panel-labels-v0723-1';
import {installWorkspaceUpdater} from './workspace-update.mjs?v=panel-labels-v0723-1';
import {installBrowserZoomGuard} from './browser-zoom.mjs?v=panel-label-gap-v0730-1';

const APPS=['studio','plot','mifito'];

/** One live document per editor: changing the visible workspace never navigates it. */
export function createWorkspace({windowRef=window,documentRef=windowRef.document}={}){
 installBrowserZoomGuard(documentRef);
 const workspaceOwner=windowRef.crypto?.randomUUID?.()||crypto.randomUUID();
 const frames=new Map([['studio',documentRef.getElementById('studio-frame')]]);
 const reloadToken=new URL(windowRef.location.href).searchParams.get('_workspaceUpdate');
 if(reloadToken&&/^[a-f0-9-]{36}$/i.test(reloadToken)){const url=new URL(frames.get('studio').src,windowRef.location.href);url.searchParams.set('_workspaceReload',reloadToken);frames.get('studio').src=url.href;}
 const tabs=[...documentRef.querySelectorAll('[role="tab"][data-app]')];
 let active='studio';
 function editorUrl(app,options={}){
  const base=new URL(new URL(SOURCE_APPS[app].url).pathname,windowRef.location.origin);
  const target=new URL(options.url||base.href,windowRef.location.href);
  if(target.origin!==windowRef.location.origin||!/^https?:$/.test(target.protocol))throw Error('編集画面はFigure Studioと同じ配信元で開いてください。');
  target.searchParams.set('figureWorkspace','1');
  target.searchParams.set('figureWorkspaceOwner',workspaceOwner);
  if(reloadToken)target.searchParams.set('_workspaceReload',reloadToken);
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
  const frame=ensureFrame(app);if(api.persistenceBusy)return frame.contentWindow;if(api.presentationActive&&app!=='studio')api.studioWindow.FigureStudioPresentation?.exit();active=app;
  for(const name of APPS){const shown=name===app,panel=documentRef.getElementById(`workspace-panel-${name}`);panel.setAttribute('aria-hidden',String(!shown));panel.inert=!shown;const child=frames.get(name);if(child)child.tabIndex=shown?0:-1;}
  for(const tab of tabs){const selected=tab.dataset.app===app;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;}
  resize(frame);return frame.contentWindow;
 }
 const api={ownerId:workspaceOwner,presentationActive:false,setPresentationMode(value){api.presentationActive=!!value;const root=documentRef.documentElement;if(root){if(value)root.dataset.presentationMode='true';else delete root.dataset.presentationMode;}resize(frames.get('studio'));},openEditor(app,options={}){if(!SOURCE_APPS[app])throw Error('編集アプリが見つかりません。');const frame=ensureFrame(app,options);show(app);return frame.contentWindow;},show,get studioWindow(){return frames.get('studio').contentWindow;},get studioReceiverId(){try{return api.studioWindow.FigureStudioWorkspaceReceiverId||null;}catch{return null;}}};
 windowRef.FigureStudioWorkspace=api;
 installWorkspacePersistence(api,{windowRef,documentRef});
 for(const tab of tabs){
  tab.addEventListener('click',()=>show(tab.dataset.app));
  tab.addEventListener('keydown',event=>{let index=tabs.indexOf(tab);if(event.key==='ArrowRight')index=(index+1)%tabs.length;else if(event.key==='ArrowLeft')index=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')index=0;else if(event.key==='End')index=tabs.length-1;else return;event.preventDefault();show(tabs[index].dataset.app);tabs[index].focus();});
 }
 installWorkspaceUpdater(api,{windowRef,documentRef});
 frames.get('studio').addEventListener('load',()=>{api.setPresentationMode(false);if(active==='studio')resize(frames.get('studio'));});
 show('studio');return api;
}

if(typeof document!=='undefined'&&document.getElementById('studio-frame'))createWorkspace();
