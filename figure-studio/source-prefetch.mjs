const targetKey=({app,name,projectId})=>JSON.stringify([app,name,projectId]);
const later=()=>new Promise(resolve=>setTimeout(resolve,0));

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

function waitFor(result,signal){
 if(!signal)return result;
 if(signal.aborted)return Promise.resolve(null);
 return new Promise(resolve=>{
  const abort=()=>resolve(null);
  signal.addEventListener('abort',abort,{once:true});
  void result.then(match=>{signal.removeEventListener('abort',abort);resolve(match);});
 });
}

/** One background folder walk per configured Studio book and set of linked projects. */
export function createSourcePrefetch({scan,resolveProjectId,identify,defer=later}){
 let active=null;
 function reset(){
  const previous=active;active=null;
  if(!previous)return;
  previous.controller.abort();
  for(const record of previous.records.values())record.resolve(null);
 }
 function start({bookId,directory,figures}){
  if(!directory){reset();return;}
  const {routes,sources}=linkedSources(bookId,figures);
  if(active?.bookId===bookId&&active.directory===directory&&active.records.size===sources.size&&[...sources.keys()].every(key=>active.records.has(key))){
   active.routes=routes;return;
  }
  reset();
  if(!sources.size)return;
  const records=new Map([...sources].map(([key,source])=>[key,{source,...deferred()}]));
  const state={bookId,directory,routes,records,controller:new AbortController()};
  active=state;
  void run(state).catch(()=>{for(const record of records.values())record.resolve(null);});
 }
 async function run(state){
  await defer();
  const {controller,records,directory}=state,{signal}=controller;
  const groups=new Map();
  for(const record of records.values()){
   if(signal.aborted)return;
   const {source}=record;
   try{
    const projectId=source.projectId||await resolveProjectId(source);
    if(signal.aborted)return;
    if(!projectId){record.resolve(null);continue;}
    const request={app:source.app,name:source.name,projectId,identify:identify[source.app]};
    const key=targetKey(request),group=groups.get(key);
    if(group)group.records.push(record);
    else groups.set(key,{request:{key,...request},records:[record]});
   }catch{record.resolve(null);}
  }
  if(signal.aborted||!groups.size)return;
  function publish(key,handle){
   if(active!==state)return;
   const group=groups.get(key);
   if(group)for(const record of group.records)record.resolve(handle?{handle,projectId:group.request.projectId}:null);
  }
  const matches=await scan({directory,requests:[...groups.values()].map(group=>group.request),signal,onResult:publish});
  for(const [key,handle] of matches)publish(key,handle);
  for(const record of records.values())record.resolve(null);
 }
 async function findSource({sourceKey,app,projectId,name},{signal}={}){
  if(typeof name!=='string')return null;
  const state=active,key=state?.routes.get(sourceKey),record=state?.records.get(key);
  if(!record||record.source.app!==app||record.source.name!==name.normalize('NFC'))return null;
  const match=await waitFor(record.ready,signal);
  return !signal?.aborted&&active===state&&state.routes.get(sourceKey)===key&&match?.projectId===projectId?match.handle:null;
 }
 return {start,findSource,reset};
}
