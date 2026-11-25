import {database} from './storage.mjs?v=0.3.6-1';

const folderPrefix='project-work-folder:',parentPrefix='project-work-parent:';
const folderKey=bookId=>folderPrefix+bookId;
const isDirectory=handle=>handle?.kind==='directory'&&typeof handle.getFileHandle==='function';
const selection=value=>isDirectory(value)?{handle:value,followProject:false}:isDirectory(value?.handle)?{handle:value.handle,followProject:value.followProject===true}:null;
const selections=value=>value==null?null:(Array.isArray(value)?value:[value]).map(selection).filter(Boolean);

/** A folder selection only belongs to this browser and Studio project. */
export async function loadProjectWorkFolder(bookId){
 const db=await database();
 return new Promise((resolve,reject)=>{
  const request=db.transaction('documents','readonly').objectStore('documents').get(folderKey(bookId));
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
 });
}

async function loadKnownWorkFolders(){
 const db=await database();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('documents','readonly'),store=tx.objectStore('documents');
  const lists=[folderPrefix,parentPrefix].map(prefix=>store.getAll(IDBKeyRange.bound(prefix,prefix+'\uffff')));
  tx.oncomplete=()=>resolve(lists.flatMap(request=>request.result));
  tx.onerror=tx.onabort=()=>reject(tx.error);
 });
}

async function storeProjectWorkFolder(bookId,folders){
 const db=await database();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('documents','readwrite'),store=tx.objectStore('documents'),key=folderKey(bookId);
  if(folders===null)store.delete(key);else store.put(folders,key);
  const parent=folders?.find(folder=>folder.followProject)?.handle;
  if(parent)store.put(parent,parentPrefix+bookId);
  tx.oncomplete=()=>resolve();
  tx.onerror=tx.onabort=()=>reject(tx.error||Error('作業フォルダを記憶できませんでした。'));
 });
}

async function projectPathIn(directory,file){
 if(file?.kind!=='file'||typeof directory?.resolve!=='function')return null;
 try{const path=await directory.resolve(file);return path?.length?path:null;}
 catch{return null;}
}
export async function isProjectFolder(directory,file){
 return (await projectPathIn(directory,file))?.length===1;
}

export function createProjectWorkFolders({load=loadProjectWorkFolder,store=storeProjectWorkFolder,loadKnown=loadKnownWorkFolders}={}){
 const cache=new Map(),writes=new Map(),defaults=new Map(),knownInTab=new Set();
 function readSelection(bookId){
  if(!cache.has(bookId))cache.set(bookId,Promise.resolve().then(()=>load(bookId)).then(selections,()=>null));
  return cache.get(bookId);
 }
 async function findDefaultFolder(file,preferred){
  if(await isProjectFolder(preferred,file))return preferred;
  let persisted=[];
  try{persisted=await loadKnown();}catch{}
  const candidates=new Set([preferred,...knownInTab,...persisted.flatMap(value=>(selections(value)??[]).map(folder=>folder.handle))]);
  for(const candidate of candidates){
   const path=await projectPathIn(candidate,file);
   if(!path)continue;
   try{
    let folder=candidate;
    for(const segment of path.slice(0,-1))folder=await folder.getDirectoryHandle(segment);
    if(isDirectory(folder))return folder;
   }catch{/* Permission or the directory may have changed. */}
  }
  return null;
 }
 async function getSelections(bookId,file=null){
  const selected=await readSelection(bookId);
  const following=selected?.find(folder=>folder.followProject);
  if(selected&&!following)return selected;
  if(file?.kind!=='file')return selected?.filter(folder=>!folder.followProject)??[];
  let currentDefault=defaults.get(bookId);
  if(currentDefault?.file!==file){
   currentDefault={file,folder:findDefaultFolder(file,following?.handle)};
   defaults.set(bookId,currentDefault);
  }
  const folder=await currentDefault.folder;
  const latest=await readSelection(bookId);
  const explicit=latest?.filter(entry=>!entry.followProject)??[];
  if((latest&&explicit.length===latest.length)||defaults.get(bookId)!==currentDefault)return explicit;
  return folder?[{handle:folder,followProject:true},...explicit]:explicit;
 }
 async function setSelections(bookId,folders){
  const selected=selections(folders);
  const write=(writes.get(bookId)??Promise.resolve()).then(()=>store(bookId,selected));
  const pending=write.catch(()=>{});
  writes.set(bookId,pending);
  for(const {handle} of selected??[])knownInTab.add(handle);
  defaults.clear();
  cache.set(bookId,Promise.resolve(selected));
  try{await write;return true;}
  catch{return false;}
  finally{if(writes.get(bookId)===pending)writes.delete(bookId);}
 }
 return {getSelections,setSelections};
}
