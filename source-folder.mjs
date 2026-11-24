const EXTENSIONS={plot:'.plotproject',mifito:'.mifito'};

/**
 * Search an already-authorized Studio work folder when an editor opens.
 * The editor retains its original overwrite baseline when it uses this handle.
 */
export async function findProjectInWorkFolder({
  directory,app,name,projectId,identify,signal,timeoutMs=2500,maxEntries=2048
}){
  if(directory?.kind!=='directory'||typeof directory.values!=='function'||
     typeof projectId!=='string'||!projectId||typeof name!=='string'||name.length>255||/[\\/\x00-\x1f]/.test(name)||
     !Object.hasOwn(EXTENSIONS,app)||!name.toLowerCase().endsWith(EXTENSIONS[app])||
     typeof identify!=='function'||signal?.aborted)return null;

  const wanted=name.normalize('NFC'),deadline=Date.now()+timeoutMs;
  let stopped=false,stop;
  const cancellation=new Promise(resolve=>{stop=()=>{stopped=true;resolve(null);};});
  const active=()=>!stopped&&!signal?.aborted&&Date.now()<deadline;
  const timer=setTimeout(stop,timeoutMs);
  signal?.addEventListener('abort',stop,{once:true});
  try{return await Promise.race([search(),cancellation]);}
  catch{return null;}
  finally{stopped=true;clearTimeout(timer);signal?.removeEventListener('abort',stop);}

  async function search(){
    if(directory.queryPermission&&await directory.queryPermission({mode:'read'})!=='granted')return null;
    if(!active())return null;

    const pending=[directory];
    let entries=0,match=null;
    for(let index=0;index<pending.length;index++){
      for await(const entry of pending[index].values()){
        if(!active()||++entries>maxEntries)return null;
        if(entry.kind==='directory'){
          pending.push(entry);
          continue;
        }
        if(entry.kind!=='file'||entry.name.normalize('NFC')!==wanted)continue;
        const candidate=await inspect(entry);
        if(!active())return null;
        if(!candidate)continue;
        if(match)return null;
        match=candidate;
      }
      if(!active())return null;
    }
    return match?{handle:match}:null;
  }

  async function inspect(handle){
    const file=await handle.getFile();
    if(!active())return null;
    if(file.name.normalize('NFC')!==wanted)throw Error('The candidate filename changed during the search.');
    // Handles from Studio's window can return a File from a different realm.
    const local=new File([file],file.name,{type:file.type,lastModified:file.lastModified});
    const identity=await identify(local);
    return active()&&identity?.projectId===projectId?handle:null;
  }
}
