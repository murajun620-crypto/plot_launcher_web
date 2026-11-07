import {encodeWorkspaceState,decodeWorkspaceState} from './workspace-state.mjs?v=workspace-save-v050-1';

const APPS=['plot','mifito'];
const empty=()=>({format:'figure-studio-workspace',version:1,active:'studio',editors:{plot:null,mifito:null}});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

/** Coordinates editor snapshots without applying their edits to Studio images. */
export function createWorkspaceSession({editor,active=()=> 'studio',show=()=>{},lock=()=>{}}){
 let busy=false,savedSignatures=new Map();
 const signature=api=>String(api.signature());
 async function capture(){
  if(busy)throw Error('作業内容の保存・復元が完了してから、もう一度お試しください。');
  busy=true;lock(true);
  try{
   const selected=active(),apis=new Map(),before=new Map();
   for(const app of APPS){const api=await editor(app,false);if(api){apis.set(app,api);before.set(app,signature(api));}}
   const editors={plot:null,mifito:null};
   for(const[app,api]of apis)editors[app]=await api.capture();
   for(const[app,api]of apis)if(signature(api)!==before.get(app))throw Error('保存する内容が変わりました。もう一度保存してください。');
   const data=await encodeWorkspaceState({version:1,active:selected,editors});
   for(const[app,api]of apis)if(signature(api)!==before.get(app))throw Error('保存中に編集内容が変わりました。もう一度保存してください。');
   return {data,signatures:before};
  }finally{busy=false;lock(false);}
 }
 async function markSaved(captured){
  if(!captured)return false;let unchanged=true;
  for(const app of APPS){const api=await editor(app,false),expected=captured.signatures.get(app);if(api&&signature(api)!==expected){unchanged=false;continue;}if(api){savedSignatures.set(app,expected);api.markSaved?.(expected);}}
  return unchanged;
 }
 async function hasChanges(){
  for(const app of APPS){const api=await editor(app,false);if(api&&api.hasWork()&&signature(api)!==savedSignatures.get(app))return true;}
  return false;
 }
 async function prepareRestore(value){
  if(busy)throw Error('作業内容の保存・復元が完了してから開いてください。');
  const decoded=await decodeWorkspaceState(value??empty());
  busy=true;lock(true);const apis=new Map(),rollback=new Map(),previousActive=active();let completed=false,applied=false;
  const release=()=>{if(completed)return;completed=true;busy=false;lock(false);};
  try{
   for(const app of APPS){const api=await editor(app,decoded.editors[app]!=null);if(api)apis.set(app,api);}
   for(const[app,api]of apis)await api.validate(decoded.editors[app]);
   for(const[app,api]of apis)rollback.set(app,await api.capture());
  }catch(error){release();throw error;}
  async function rollbackAll(){
   const errors=[];
   for(const[app,api]of apis)try{await api.restore(rollback.get(app));await api.restoreBinding?.(rollback.get(app)?.binding??null);}catch(error){errors.push(error);}
   release();show(previousActive);
   if(errors.length)throw Error('編集画面を元へ戻せませんでした。開いている内容を保存してください。');
  }
  return {decoded,previousEditors:Object.fromEntries(rollback),
   async apply(){
    if(completed)throw Error('復元処理は終了しています。');applied=true;
    try{for(const[app,api]of apis)await api.restore(decoded.editors[app]);}
    catch(error){await rollbackAll();throw error;}
   },
   async bind(bindings={}){for(const[app,api]of apis)await api.restoreBinding?.(bindings[app]??null);},
   async complete(){
    if(completed)throw Error('復元処理は終了しています。');
    // Visibility-dependent input restoration needs the selected editor exposed,
    // but the transaction must remain cancellable until every hook succeeds.
    lock(false);show(decoded.active);
    for(const api of apis.values())await Promise.resolve(api.finishRestore?.());
    const stamps=new Map();
    for(const[app,api]of apis){const stamp=signature(api);api.markSaved?.(stamp);stamps.set(app,stamp);}
    for(const[app,stamp]of stamps)savedSignatures.set(app,stamp);
    release();
   },
   async cancel(){if(completed)return;if(applied)await rollbackAll();else{release();show(previousActive);}}
  };
 }
 return {capture,markSaved,hasChanges,prepareRestore,get busy(){return busy;}};
}

/** Also upgrades a still-open v0.4 shell after its Studio document is updated. */
export function installWorkspacePersistence(api,{windowRef=window,documentRef=windowRef.document}={}){
 if(api.captureWorkspace&&api.prepareWorkspaceRestore)return api;
 const active=()=>documentRef.querySelector('[role="tab"][aria-selected="true"]')?.dataset.app||'studio';
 const editor=async(app,create)=>{
  let frame=documentRef.getElementById(`${app}-frame`);
  if(!frame&&create){const selected=active();api.openEditor(app);api.show(selected);frame=documentRef.getElementById(`${app}-frame`);}
  if(!frame)return null;
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){
   try{const state=frame.contentWindow.FigureStudioWorkspaceState;if(state&&state.version===1&&state.app===app&&['capture','validate','restore','signature','hasWork'].every(key=>typeof state[key]==='function'))return state;
    if(frame.contentDocument?.readyState==='complete'&&frame.contentDocument?.querySelector(app==='plot'?'#app-version':'#appVersion')?.textContent)throw Error(`${app==='plot'?'PlotLauncher':'MiFiTo'}の「更新確認」から最新版へ更新して、もう一度保存してください。`);
   }catch(error){if(error.message?.includes('更新確認'))throw error;}
   await pause(80);
  }
  throw Error(`${app==='plot'?'PlotLauncher':'MiFiTo'}の準備が完了してから、もう一度お試しください。`);
 };
 const lock=value=>{
  api.persistenceBusy=value;documentRef.documentElement.dataset.workspaceBusy=String(value);
  for(const tab of documentRef.querySelectorAll('[role="tab"][data-app]'))tab.disabled=value;
  for(const panel of documentRef.querySelectorAll('.workspace-panel'))panel.inert=value||panel.getAttribute('aria-hidden')==='true';
 };
 const session=createWorkspaceSession({editor,active,show:app=>api.show(app),lock});
 const originalShow=api.show.bind(api);
 api.show=app=>{const child=originalShow(app);windowRef.requestAnimationFrame?.(()=>{try{child?.FigureStudioWorkspaceState?.finishRestore?.();}catch{}});return child;};
 api.captureWorkspace=()=>session.capture();api.markWorkspaceSaved=captured=>session.markSaved(captured);api.hasWorkspaceChanges=()=>session.hasChanges();api.prepareWorkspaceRestore=value=>session.prepareRestore(value);
 return api;
}
