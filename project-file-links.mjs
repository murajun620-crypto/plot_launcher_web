// Writable handles live only in this browser's IndexedDB. Portable snapshots
// carry an opaque token and a byte fingerprint, never paths or permissions.
const DB='figure-source-project-files-v1',STORE='targets';
const token=value=>typeof value==='string'&&/^[a-f\d-]{36}$/.test(value);
const fingerprint=value=>typeof value==='string'&&/^[a-f\d]{64}$/.test(value);
const filename=value=>typeof value==='string'&&value.length>0&&value.length<=255&&!/[\\/\x00-\x1f]/.test(value);
export function portableFileLink(value){
  return value&&fingerprint(value.fingerprint)&&(!value.token||token(value.token))?{token:value.token||'',fingerprint:value.fingerprint}:null;
}
export async function fileFingerprint(blob){
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export function localFileLinkStore(indexedDB=globalThis.indexedDB){
  const access=(mode,operation)=>new Promise((resolve,reject)=>{
    if(!indexedDB){reject(Error('保存先を記憶できません。'));return;}
    const opening=indexedDB.open(DB,1);
    opening.onupgradeneeded=()=>opening.result.createObjectStore(STORE,{keyPath:'token'}).createIndex('project','project');
    opening.onerror=()=>reject(opening.error);opening.onblocked=()=>reject(Error('保存先の記憶を開けません。'));
    opening.onsuccess=()=>{const db=opening.result;try{
      const transaction=db.transaction(STORE,mode),request=operation(transaction.objectStore(STORE));
      transaction.oncomplete=()=>{db.close();resolve(request.result);};
      transaction.onabort=transaction.onerror=()=>{db.close();reject(transaction.error||request.error);};
    }catch(error){db.close();reject(error);}};
  });
  return {get:key=>access('readonly',store=>store.get(key)),list:project=>access('readonly',store=>store.index('project').getAll(project)),put:value=>access('readwrite',store=>store.put(value))};
}
const cancel=()=>{throw new DOMException('保存をキャンセルしました。','AbortError');};
const changed=()=>Error('保存先のファイルが保存処理中に更新されました。上書きしていません。もう一度保存して、内容を確認してください。');
async function sameFile(a,b){try{return !!a&&!!b&&await a.isSameEntry(b);}catch{return false;}}

export function createProjectFileLinks({app,identify,choose,host=globalThis,store=localFileLinkStore(),digest=fileFingerprint}){
  const key=(projectId,name)=>JSON.stringify([app,projectId,name.normalize('NFC')]);
  const records=async(projectId,name)=>{try{return await store.list(key(projectId,name));}catch{return [];}};
  const matching=(record,projectId,name)=>record?.project===key(projectId,name)&&record.handle?.kind==='file'&&record.handle.name?.normalize('NFC')===name.normalize('NFC');
  async function resolve({projectId,name,link}){
    link=portableFileLink(link);if(!filename(name)||!link?.token)return null;
    try{const record=await store.get(link.token);return matching(record,projectId,name)?record.handle:null;}catch{return null;}
  }
  async function remember({projectId,name,handle,fingerprint:hash,aliasToken}){
    if(!handle||!filename(name)||!fingerprint(hash))return {link:{token:'',fingerprint:hash},remembered:false};
    const candidates=await records(projectId,name);let previous;
    for(const record of candidates)if(matching(record,projectId,name)&&await sameFile(record.handle,handle)){previous=record;break;}
    let preferred;
    if(token(aliasToken))try{const existing=await store.get(aliasToken);if(!existing||matching(existing,projectId,name)&&await sameFile(existing.handle,handle))preferred=aliasToken;}catch{}
    const link={token:preferred||previous?.token||crypto.randomUUID(),fingerprint:hash};
    try{await store.put({token:link.token,project:key(projectId,name),handle,fingerprint:hash});return {link,remembered:true};}
    catch{return {link,remembered:false};}
  }
  async function opened({file,projectId,name=file.name,handle=null,embedded=false,link=null}){
    const portable=portableFileLink(link);
    if(embedded&&portable)return {link:portable,handle:await resolve({projectId,name,link:portable})};
    const hash=await digest(file);
    if(handle){const result=await remember({projectId,name,handle,fingerprint:hash});return {...result,handle};}
    const candidates=[];
    for(const record of await records(projectId,name))if(matching(record,projectId,name)&&record.fingerprint===hash){
      let duplicate=false;for(const other of candidates)if(await sameFile(record.handle,other.handle)){duplicate=true;break;}
      if(!duplicate)candidates.push(record);
    }
    // Two identical files in different folders are still different save targets.
    return candidates.length===1?{link:{token:candidates[0].token,fingerprint:hash},handle:candidates[0].handle}:{link:{token:'',fingerprint:hash},handle:null};
  }
  async function permission(handle){
    const options={mode:'readwrite'};
    if(handle.queryPermission&&await handle.queryPermission(options)!=='granted'&&(!handle.requestPermission||await handle.requestPermission(options)!=='granted'))throw new DOMException('元ファイルへの上書きが許可されていません。','NotAllowedError');
  }
  async function prepare({projectId,name,link,handle=null,saveAs=false,knownSource=false,startIn,fallback}){
    if(!filename(name))throw Error('プロジェクトのファイル名を確認してください。');
    const extension=app==='plot'?'.plotproject':'.mifito',description=app==='plot'?'PlotLauncherプロジェクト':'MiFiToプロジェクト';
    const options={id:`${app}-source-project`,types:[{description,accept:{'application/octet-stream':[extension]}}]};
    link=portableFileLink(link);
    if(!saveAs&&!handle)handle=await resolve({projectId,name,link});
    if(!host.showSaveFilePicker&&!handle)return {handle:null,name,saveAs,write:blob=>fallback(blob,name),remember:async()=>({link:null,remembered:false})};
    let baseline=link?.fingerprint||'',binding=false;
    const saveCopy=()=>prepare({projectId,name,link,handle,saveAs:true,knownSource,startIn,fallback});
    if(!saveAs&&handle){
      try{await permission(handle);await handle.getFile();}
      catch(error){if(!['NotFoundError','NotAllowedError','SecurityError'].includes(error.name))throw error;handle=null;}
    }
    if(!saveAs&&!handle&&knownSource){
      const answer=await choose({kind:'missing',name,canBind:!!host.showOpenFilePicker});
      if(answer==='saveAs')return saveCopy();if(answer!=='bind')cancel();
      [handle]=await host.showOpenFilePicker({...options,multiple:false,...(startIn?{startIn}:{})});
      binding=true;
    }
    if(saveAs||!handle){
      handle=await host.showSaveFilePicker({...options,suggestedName:name,...(startIn?{startIn}:{})});saveAs=true;
      baseline=await digest(await handle.getFile());
    }else{
      await permission(handle);
      const file=await handle.getFile(),current=await digest(file);
      if(binding||!baseline||baseline!==current){
        const identity=await identify(file);
        if(identity.projectId!==projectId||file.name.normalize('NFC')!==name.normalize('NFC'))throw Error('選択したファイルは元のプロジェクトと一致しません。元ファイルを選ぶか、「名前を付けて保存」を使ってください。');
        if(!baseline||baseline!==current){
          const answer=await choose({kind:baseline?'changed':'unknown',name:file.name});
          if(answer==='saveAs')return saveCopy();if(answer!=='overwrite')cancel();
        }
      }
      baseline=current;
    }
    const target=handle;
    return {handle:target,name:target.name,saveAs,async write(blob){
      // Hash before opening a writer: a stale snapshot must never truncate a file.
      const hash=await digest(blob);
      const commit=async()=>{
        if(await digest(await target.getFile())!==baseline)throw changed();
        const writer=await target.createWritable();
        try{
          // Also catch changes while obtaining the writer or copying its bytes.
          if(await digest(await target.getFile())!==baseline)throw changed();
          await writer.write(blob);
          if(await digest(await target.getFile())!==baseline)throw changed();
          await writer.close();
        }catch(error){try{await writer.abort();}catch{}throw error;}
        baseline=hash;return hash;
      };
      // Serialize saves by other tabs on this origin, then check disk again.
      return host.navigator?.locks?.request?host.navigator.locks.request('source-project-write:'+key(projectId,target.name),commit):commit();
    },async remember(savedId,hash){return remember({projectId:savedId,name:target.name,handle:target,fingerprint:hash,...(!saveAs&&savedId===projectId?{aliasToken:link?.token}:{})});}};
  }
  return {opened,resolve,prepare,remember};
}
