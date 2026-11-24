const EXTENSIONS={plot:'.plotproject',mifito:'.mifito'};
const CONCURRENT_NAMES=4;

/**
 * Enumerate the selected folder once, then verify only requested filenames.
 * Wait for traversal to finish before offering matches, since an unopened
 * subfolder could contain an identical project. This runs outside Save.
 */
export async function findProjectsInWorkFolder({directory,requests,signal,onResult}){
  if(directory?.kind!=='directory'||typeof directory.values!=='function'||signal?.aborted)return new Map();
  const groups=new Map();
  for(const request of requests){
    const {app,name,projectId,identify}=request;
    if(typeof projectId!=='string'||!projectId||typeof name!=='string'||name.length>255||
       /[\\/\x00-\x1f]/.test(name)||!Object.hasOwn(EXTENSIONS,app)||!name.toLowerCase().endsWith(EXTENSIONS[app])||
       typeof identify!=='function')continue;
    const wanted=name.normalize('NFC');
    if(!groups.has(wanted))groups.set(wanted,{wanted,identify,requests:[],files:[],ids:new Set()});
    const group=groups.get(wanted);
    group.requests.push(request);group.ids.add(projectId);
  }
  if(!groups.size)return new Map();

  const active=()=>!signal?.aborted;
  let cancel;
  const cancelled=new Promise(resolve=>{cancel=()=>resolve(new Map());});
  signal?.addEventListener('abort',cancel,{once:true});
  try{return await Promise.race([search(),cancelled]);}
  catch{return new Map();}
  finally{signal?.removeEventListener('abort',cancel);}

  async function search(){
    if(directory.queryPermission&&await directory.queryPermission({mode:'read'})!=='granted')return new Map();
    if(!active())return new Map();
    const pending=[directory];
    while(pending.length){
      for await(const entry of pending.pop().values()){
        if(!active())return new Map();
        if(entry.kind==='directory')pending.push(entry);
        else if(entry.kind==='file')groups.get(entry.name.normalize('NFC'))?.files.push(entry);
      }
      if(!active())return new Map();
    }

    const results=new Map(),queue=groups.values();
    await Promise.all(Array.from({length:Math.min(CONCURRENT_NAMES,groups.size)},async()=>{
      for(const group of queue){
        if(!active())break;
        let matches;
        try{matches=await verify(group);}
        catch{matches=new Map();}
        if(!active())break;
        for(const {key,projectId} of group.requests){
          const handle=matches.get(projectId)??null;
          if(handle)results.set(key,handle);
          try{onResult?.(key,handle);}catch{}
        }
      }
    }));
    return results;
  }

  async function verify({wanted,identify,files,ids}){
    const matches=new Map();
    for(const handle of files){
      const file=await handle.getFile();
      if(!active())break;
      if(file.name.normalize('NFC')!==wanted)throw Error('The candidate filename changed during the search.');
      // Handles from Studio's window can return a File from a different realm.
      const local=new File([file],file.name,{type:file.type,lastModified:file.lastModified});
      const identity=await identify(local);
      if(ids.has(identity?.projectId)){
        const {projectId}=identity;
        matches.set(projectId,matches.has(projectId)?null:handle);
      }
    }
    return matches;
  }
}

export async function findProjectInWorkFolder({directory,signal,...request}){
  const key='source';
  const matches=await findProjectsInWorkFolder({directory,signal,requests:[{...request,key}]});
  const handle=matches.get(key);
  return handle?{handle}:null;
}
