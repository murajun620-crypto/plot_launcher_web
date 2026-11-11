const TOKEN='_studioResume',UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

async function sessionStore(operation,key,value,windowRef){
 return new Promise((resolve,reject)=>{
  const opening=windowRef.indexedDB.open('figure-studio-single-updates',1);
  opening.onupgradeneeded=()=>opening.result.createObjectStore('sessions');opening.onerror=()=>reject(opening.error);opening.onblocked=()=>reject(Error('更新用の一時保存を開けませんでした。'));
  opening.onsuccess=()=>{const db=opening.result;try{
   const transaction=db.transaction('sessions',operation==='get'?'readonly':'readwrite'),store=transaction.objectStore('sessions');
   const request=operation==='get'?store.get(key):operation==='put'?store.put(value,key):store.delete(key);
   transaction.oncomplete=()=>{db.close();resolve(request.result);};transaction.onerror=transaction.onabort=()=>{db.close();reject(transaction.error||request.error);};
  }catch(error){db.close();reject(error);}};
 });
}

/** Only an explicit update navigation owns a resumable project snapshot. */
export async function stageStudioUpdate(snapshot,{windowRef=window}={}){
 const token=windowRef.crypto.randomUUID(),url=new URL(windowRef.location.href);url.searchParams.delete(TOKEN);
 await sessionStore('put',token,{format:'figure-studio-single-update',version:1,url:url.href,snapshot},windowRef);return token;
}
export async function restoreStudioUpdate({restore,windowRef=window}){
 const url=new URL(windowRef.location.href),token=url.searchParams.get(TOKEN);if(!UUID.test(token||''))return false;
 const saved=await sessionStore('get',token,undefined,windowRef),origin=saved&&new URL(saved.url);
 if(saved?.format!=='figure-studio-single-update'||saved.version!==1||!saved.snapshot||origin.origin!==url.origin||origin.pathname!==url.pathname)throw Error('更新前の一時保存が見つかりません。');
 await restore(saved.snapshot);
 url.searchParams.delete(TOKEN);url.searchParams.delete('_studioBuild');windowRef.history.replaceState(null,'',url.href);
 // Retain recovery until restoration succeeds. Cleanup failure cannot undo it.
 try{await sessionStore('delete',token,undefined,windowRef);}catch{}
 return true;
}
/** v0.7.27 and earlier used one global draft for standalone updates. */
export function isLegacyStudioUpdate(build,{windowRef=window}={}){
 const url=new URL(windowRef.location.href);
 const navigation=url.searchParams.get('_appReload');
 return !url.searchParams.has(TOKEN)&&url.searchParams.get('_studioBuild')===build&&(!navigation||UUID.test(navigation));
}
export function finishLegacyStudioUpdate({windowRef=window}={}){
 const url=new URL(windowRef.location.href);url.searchParams.delete('_studioBuild');windowRef.history.replaceState(null,'',url.href);
}
