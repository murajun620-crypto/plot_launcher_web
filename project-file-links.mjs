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
// Local files can wait on an offline sync provider. Bound only passive checks;
// permission prompts and file pickers wait for the user's choice.
async function checkFile(operation,message){
  let timer;
  try{
    return await Promise.race([operation(),new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(new DOMException(message,'TimeoutError')),15000);
    })]);
  }finally{clearTimeout(timer);}
}
const cancel=()=>{throw new DOMException('保存をキャンセルしました。','AbortError');};
const changed=()=>Error('保存先のファイルが保存処理中に更新されました。上書きしていません。もう一度保存して、内容を確認してください。');
async function sameFile(a,b){try{return !!a&&!!b&&await a.isSameEntry(b);}catch{return false;}}

export function createProjectFileLinks({app,identify,choose,host=globalThis,store=localFileLinkStore(),digest=fileFingerprint}){
  const key=(projectId,name)=>JSON.stringify([app,projectId,name.normalize('NFC')]);
  const records=async(projectId,name)=>{try{return await store.list(key(projectId,name));}catch{return [];}};
  const matching=(record,projectId,name)=>record?.project===key(projectId,name)&&record.handle?.kind==='file'&&record.handle.name?.normalize('NFC')===name.normalize('NFC');
  async function resolve({projectId,name,link,strict=false}){
    link=portableFileLink(link);if(!filename(name)||!link?.token)return null;
    try{
      const record=await checkFile(()=>store.get(link.token),'保存先の確認に時間がかかっています。');
      return matching(record,projectId,name)?record.handle:null;
    }catch(error){if(strict&&error.name==='TimeoutError')throw error;return null;}
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
    // Even identical bytes/name/ID cannot identify a folder. Legacy snapshots
    // without an opaque link require explicit selection of the original file.
    return {link:{token:'',fingerprint:hash},handle:null};
  }
  async function prepare({projectId,name,link,handle=null,saveAs=false,knownSource=false,startIn,fallback,host:pickerHost=host,choose:chooseAction=choose,requireFile=false}){
    if(!filename(name))throw Error('プロジェクトのファイル名を確認してください。');
    const extension=app==='plot'?'.plotproject':'.mifito',description=app==='plot'?'PlotLauncherプロジェクト':'MiFiToプロジェクト';
    const options={id:`${app}-source-project`,types:[{description,accept:{'application/octet-stream':[extension]}}]};
    link=portableFileLink(link);
    if(!saveAs&&!handle)handle=await resolve({projectId,name,link,strict:true});
    if(!pickerHost.showSaveFilePicker&&(saveAs||!handle)){
      if(requireFile)throw Error('このブラウザでは元プロジェクトへ一括保存できません。Chrome／Edgeで開くか、保存メニューの「元プロジェクトも保存」をオフにしてください。');
      return {handle:null,name,saveAs,write:blob=>fallback(blob,name),remember:async()=>({link:null,remembered:false})};
    }
    let baseline=link?.fingerprint||'',binding=false,file=null;
    const getFile=target=>checkFile(()=>target.getFile(),'元ファイルを開くまでに時間がかかっています。');
    const readHash=file=>checkFile(()=>digest(file),'元ファイルの読み取りに時間がかかっています。');
    const saveCopy=()=>prepare({projectId,name,link,handle,saveAs:true,knownSource,startIn,fallback,host:pickerHost,choose:chooseAction,requireFile});
    const permit=async target=>{
      const options={mode:'readwrite'};
      const state=target.queryPermission?await checkFile(()=>target.queryPermission(options),'元ファイルのアクセス権の確認に時間がかかっています。'):'granted';
      if(state==='granted')return true;
      if(requireFile&&state==='prompt'){
        // A click inside Studio's iframe does not activate its sibling editors.
        // The visible shell dialog provides the gesture for every same-origin child.
        const answer=await chooseAction({kind:'permission',name:target.name});
        if(answer==='saveAs')return false;if(answer!=='allow')cancel();
      }
      if(!target.requestPermission||await target.requestPermission(options)!=='granted')throw new DOMException('元ファイルへの上書きが許可されていません。','NotAllowedError');
      return true;
    };
    if(!saveAs&&handle){
      try{if(!await permit(handle))return saveCopy();file=await getFile(handle);}
      catch(error){if(!['NotFoundError','NotAllowedError','SecurityError'].includes(error.name))throw error;handle=null;}
    }
    if(!saveAs&&!handle&&knownSource){
      const answer=await chooseAction({kind:'missing',name,canBind:!!pickerHost.showOpenFilePicker});
      if(answer==='saveAs')return saveCopy();if(answer!=='bind')cancel();
      [handle]=await pickerHost.showOpenFilePicker({...options,multiple:false,...(startIn?{startIn}:{})});
      binding=true;
    }
    if(saveAs||!handle){
      if(requireFile&&pickerHost.navigator?.userActivation?.isActive===false){
        if(await chooseAction({kind:'new',name})!=='saveAs')cancel();
      }
      handle=await pickerHost.showSaveFilePicker({...options,suggestedName:name,...(startIn?{startIn}:{})});
      baseline=await readHash(await getFile(handle));
    }else{
      if(!file){
        if(!await permit(handle))return saveCopy();
        file=await getFile(handle);
      }
      const current=await readHash(file);
      if(binding||!baseline||baseline!==current){
        // Picker handles can belong to Studio's parent realm. Give validators
        // a File from the editor realm (notably MiFiTo's Blob brand check).
        const identity=await checkFile(()=>identify(new File([file],file.name,{type:file.type,lastModified:file.lastModified})),'元プロジェクトの内容確認に時間がかかっています。');
        if(identity.projectId!==projectId||file.name.normalize('NFC')!==name.normalize('NFC'))throw Error('選択したファイルは元のプロジェクトと一致しません。元ファイルを選ぶか、「名前を付けて保存」を使ってください。');
        if(!baseline||baseline!==current){
          const answer=await chooseAction({kind:baseline?'changed':'unknown',name:file.name});
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
