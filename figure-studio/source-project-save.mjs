const NAMES={plot:'PlotLauncher',mifito:'MiFiTo'};

/** Prepare every target before writing any file. Cross-file writes cannot be
 * rolled back, so preserve an exact receipt of completed saves on any failure. */
export async function prepareSourceProjectSaves({editors,host,choose,status=()=>{},release=()=>{}}){
 const plans=[],saved=[],seen=new Set();let ended=false,writing=false,cancelled=false;
 const finish=()=>{if(ended)return;ended=true;for(const {plan}of plans)try{plan.cancel();}catch{}plans.length=0;release();};
 const failure=(error,app)=>{
  const result=new Error(`${app?NAMES[app]+'：':''}${error.message}`,{cause:error});result.name=error.name;result.savedSourceProjects=[...saved];return result;
 };
 try{
  const targets=[];
  for(const entry of editors){
   if(!entry?.api||seen.has(entry.api))continue;seen.add(entry.api);
   if(typeof entry.api.sourceSaveReady!=='function'||typeof entry.api.prepareSourceSave!=='function'){
    if(!entry.api.hasWork())continue;
    throw Error(`${NAMES[entry.app]}の「更新確認」から最新版へ更新して、もう一度保存してください。`);
   }
   if(entry.api.sourceSaveReady())targets.push(entry);
  }
  for(const {app,api}of targets){
   status(`${NAMES[app]}の保存先と内容を確認しています…`);
   try{const plan=await api.prepareSourceSave({host,choose,requireFile:true});if(!plan)throw Error('保存準備中に内容が変わりました。もう一度保存してください。');plans.push({app,plan});}
   catch(error){throw failure(error,app);}
  }
  for(const {plan}of plans)plan.validate();
 }catch(error){finish();throw failure(error);}
 const count=plans.length;
 return {count,get saved(){return [...saved];},cancel(){if(writing&&!ended)cancelled=true;else finish();},async write(){
  if(ended||writing)throw Error('一括保存の処理は終了しています。');writing=true;
  try{
   for(const {plan}of plans)plan.validate();
   for(const {app,plan}of plans){
    if(cancelled)throw new DOMException('一括保存を中止しました。','AbortError');
    status(`${NAMES[app]}：${plan.name} を保存しています…`);
    try{const receipt=await plan.write({hold:true});saved.push({app,name:receipt.name});}
    catch(error){throw failure(error,app);}
   }
   return [...saved];
  }catch(error){throw failure(error);}finally{finish();}
 }};
}

export function sourceSaveMessage(error,saved=[]){
 const completed=error.savedSourceProjects||saved;
 const prefix=error.name==='AbortError'?'保存をキャンセルしました':`保存できませんでした：${error.message}`;
 return completed.length?`${prefix}。保存済み：${completed.map(item=>`${NAMES[item.app]}「${item.name}」`).join('、')}。Studioのプロジェクトは保存されていません。`:prefix;
}
