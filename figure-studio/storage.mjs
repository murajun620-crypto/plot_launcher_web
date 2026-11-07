let opened;
export function database(){if(opened)return opened;opened=new Promise((resolve,reject)=>{const r=indexedDB.open('figure-studio-v0',1);r.onupgradeneeded=()=>{r.result.createObjectStore('documents');r.result.createObjectStore('assets');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>{opened=null;reject(r.error)};});return opened;}
export async function saveDraft(doc,assets){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(['documents','assets'],'readwrite'),written=[];tx.objectStore('documents').put(doc,'current');for(const [id,a]of assets)if(!a.persisted){tx.objectStore('assets').put({...a,persisted:true},id);written.push(a);}tx.oncomplete=()=>{for(const a of written)a.persisted=true;resolve()};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
export async function loadDraft(){const db=await database();const tx=db.transaction(['documents','assets'],'readonly');const read=r=>new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});const doc=await read(tx.objectStore('documents').get('current'));if(!doc)return null;const ids=new Set((doc.figures?doc.figures.flatMap(f=>f.objects):doc.objects).flatMap(o=>[o.assetId,o.source?.assetId]).filter(Boolean));const assets=new Map();await Promise.all([...ids].map(async id=>{const t=db.transaction('assets','readonly');const a=await read(t.objectStore('assets').get(id));if(a)assets.set(id,a);}));return {doc,assets};}
export async function saveProjectFileTarget(bookId,target){
 const db=await database();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('documents','readwrite'),store=tx.objectStore('documents'),key=`project-file:${bookId}`;
  if(target?.handle)store.put({handle:target.handle,name:target.name||target.handle.name},key);else store.delete(key);
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
}
export async function loadProjectFileTarget(bookId){
 const db=await database();
 return new Promise((resolve,reject)=>{
  const request=db.transaction('documents','readonly').objectStore('documents').get(`project-file:${bookId}`);
  request.onsuccess=()=>{const target=request.result,handle=target?.handle;resolve(handle?.kind==='file'&&typeof handle.createWritable==='function'?{handle,name:typeof target.name==='string'?target.name:handle.name}:null);};
  request.onerror=()=>reject(request.error);
 });
}
