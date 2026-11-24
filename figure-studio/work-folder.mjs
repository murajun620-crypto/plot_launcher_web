import {database} from './storage.mjs?v=0.3.6-1';

const folderPrefix='project-work-folder:',parentPrefix='project-work-parent:';
const folderKey=bookId=>folderPrefix+bookId;
const isDirectory=handle=>handle?.kind==='directory'&&typeof handle.getFileHandle==='function';
const selection=value=>isDirectory(value)?{handle:value,followProject:false}:isDirectory(value?.handle)?{handle:value.handle,followProject:value.followProject===true}:null;

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

async function storeProjectWorkFolder(bookId,handle,{followProject}){
 const db=await database();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('documents','readwrite'),store=tx.objectStore('documents'),key=folderKey(bookId);
  if(handle)store.put(followProject?{handle,followProject}:handle,key);else store.delete(key);
  if(handle&&followProject)store.put(handle,parentPrefix+bookId);
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
  if(!cache.has(bookId))cache.set(bookId,Promise.resolve().then(()=>load(bookId)).then(selection,()=>null));
  return cache.get(bookId);
 }
 async function findDefaultFolder(file,preferred){
  if(await isProjectFolder(preferred,file))return preferred;
  let persisted=[];
  try{persisted=await loadKnown();}catch{}
  const candidates=new Set([preferred,...knownInTab,...persisted.map(value=>selection(value)?.handle)]);
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
 async function getSelection(bookId,file=null){
  const selected=await readSelection(bookId);
  if(selected&&!selected.followProject)return selected;
  if(file?.kind!=='file')return null;
  let currentDefault=defaults.get(bookId);
  if(currentDefault?.file!==file){
   currentDefault={file,folder:findDefaultFolder(file,selected?.handle)};
   defaults.set(bookId,currentDefault);
  }
  const folder=await currentDefault.folder;
  const latest=await readSelection(bookId);
  if(latest&&!latest.followProject)return latest;
  if(defaults.get(bookId)!==currentDefault)return null;
  return folder?{handle:folder,followProject:true}:null;
 }
 async function getDirectory(bookId,file){
  return (await getSelection(bookId,file))?.handle??null;
 }
 async function setDirectory(bookId,handle,{followProject=false}={}){
  if(handle!==null&&!isDirectory(handle))throw TypeError('作業フォルダを選択してください。');
  const write=(writes.get(bookId)??Promise.resolve()).then(()=>store(bookId,handle,{followProject}));
  const pending=write.catch(()=>{});
  writes.set(bookId,pending);
  if(handle)knownInTab.add(handle);
  defaults.clear();
  cache.set(bookId,Promise.resolve(handle?{handle,followProject}:null));
  try{await write;return true;}
  catch{return false;}
  finally{if(writes.get(bookId)===pending)writes.delete(bookId);}
 }
 return {getDirectory,getSelection,setDirectory};
}
