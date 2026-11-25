const targetKey=({app,name,projectId})=>JSON.stringify([app,name,projectId]);
const later=()=>new Promise(resolve=>setTimeout(resolve,0));
const panelKey=sourceKey=>sourceKey.slice(0,sourceKey.lastIndexOf('/'));

function linkedSources(bookId,figures){
 const routes=new Map(),sources=new Map();
 for(const figure of figures){
  for(const panel of figure.objects){
   const source=panel.source;
   if(!source?.assetId||typeof source.name!=='string'||!['plot','mifito'].includes(source.app))continue;
   const name=source.name.normalize('NFC');
   const key=targetKey({...source,name,projectId:source.projectId||['asset',source.assetId]});
   const route=[bookId,figure.id,panel.id,source.assetId].join('/');
   routes.set(route,key);
   if(!sources.has(key))sources.set(key,{...source,name});
  }
 }
 return {routes,sources};
}

function deferred(){
 let resolve;
 const ready=new Promise(finish=>{resolve=finish;});
 return {ready,resolve};
}
const sourceRecord=source=>({source,...deferred(),started:false,missing:false});

function waitFor(result,signal){
 if(!signal)return result;
 if(signal.aborted)return Promise.resolve(null);
 return new Promise(resolve=>{
  const abort=()=>resolve(null);
  signal.addEventListener('abort',abort,{once:true});
  void result.then(match=>{signal.removeEventListener('abort',abort);resolve(match);});
 });
}

/** Resolve a source after its panel is explicitly opened for editing. */
export function createSourcePrefetch({scan,resolveProjectId,identify,defer=later}){
 const opened=new Map();
 let active=null;
 function stop(){
  const previous=active;active=null;
  if(!previous)return;
  previous.controller.abort();
  for(const record of previous.records.values())record.resolve(null);
 }
 function reset(){opened.clear();stop();}
 function start({bookId,directories,figures}){
  if(!directories.length){stop();return;}
  const {routes,sources}=linkedSources(bookId,figures);
  if(active&&(active.bookId!==bookId||active.directories!==directories))reset();
  active??={bookId,directories,routes,records:new Map(),controller:new AbortController()};
  const previous=active.records;
  active.records=new Map([...sources].map(([key,source])=>[key,previous.get(key)??sourceRecord(source)]));
  for(const [key,record] of previous)if(!sources.has(key))record.resolve(null);
  active.routes=routes;
 }
 function openSource(sourceKey,{app,name,projectId}){
  if(typeof name!=='string')return;
  opened.set(panelKey(sourceKey),{app,name:name.normalize('NFC'),projectId});
  const key=active?.routes.get(sourceKey),record=active?.records.get(key);
  if(record?.missing)active.records.set(key,sourceRecord(record.source));
 }
 const isOpened=({sourceKey,app,projectId},name)=>{
  const entry=opened.get(panelKey(sourceKey));
  return entry?.app===app&&entry.name===name&&(!entry.projectId||entry.projectId===projectId);
 };
 async function run(state,key,source){
  await defer();
  const {controller,directories}=state,{signal}=controller;
  if(signal.aborted)return null;
  const projectId=source.projectId||await resolveProjectId(source);
  if(signal.aborted||!projectId)return null;
  const request={key,app:source.app,name:source.name,projectId,identify:identify[source.app]};
  const matches=await scan({directories,requests:[request],signal});
  const handle=matches.get(key);
  return handle?{handle,projectId}:null;
 }
 async function findSource(request,{signal}={}){
  const {sourceKey,app,projectId,name}=request;
  if(signal?.aborted||typeof name!=='string'||typeof sourceKey!=='string')return null;
  const normalized=name.normalize('NFC');
  if(!isOpened(request,normalized))return null;
  const state=active,key=state?.routes.get(sourceKey),record=state?.records.get(key);
  if(!record||record.source.app!==app||record.source.name!==normalized||
     (record.source.projectId&&record.source.projectId!==projectId))return null;
  if(!record.started){
   record.started=true;
   const finish=match=>{record.missing=!match;record.resolve(match);};
   void run(state,key,record.source).then(finish,()=>finish(null));
  }
  const match=await waitFor(record.ready,signal);
  return !signal?.aborted&&active===state&&state.routes.get(sourceKey)===key&&
   isOpened(request,normalized)&&match?.projectId===projectId?match.handle:null;
 }
 return {start,openSource,findSource,reset};
}
