/** Persistent project/sheet identity. View selection and export DPI aren't edits. */
const id=value=>typeof value==='string'&&/^[a-zA-Z0-9-]{16,100}$/.test(value);
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(stable(value))))),n=>n.toString(16).padStart(2,'0')).join('');
export const plotSheetId=index=>`plot-sheet-${String(index).padStart(6,'0')}`;
export function plotSheetIndex(imageId){const match=/^plot-sheet-(\d{6})$/.exec(imageId||'');return match&&Number(match[1])<=1000?Number(match[1]):null;}
export async function identifyPlotProject(saved){
 const fail=()=>{throw Error('PlotLauncherのシート情報が正しくありません。');};
 if(saved?.format!=='plotlauncher-project'||saved.version!==1||!saved.data||!Number.isInteger(saved.data.sheetIndex)||saved.data.sheetIndex<0||saved.data.sheetIndex>1000||!saved.settings||!Array.isArray(saved.fonts)||saved.fonts.length>32)fail();
 const workspace=saved.workspace||{};if(workspace.figureStudioProjectId!==undefined&&!id(workspace.figureStudioProjectId))fail();
 const projectId=workspace.figureStudioProjectId||`legacy-plot-${await hash(saved)}`;
 const source=await hash({data:{filename:saved.data.filename,base64:saved.data.base64,files:saved.data.files,...(saved.data.tableEdits?.length?{tableEdits:saved.data.tableEdits}:{})},fonts:saved.fonts});
 const settings=new Map();for(const entry of workspace.sheetSettings||[]){if(!Number.isInteger(entry?.sheetIndex)||entry.sheetIndex<0||entry.sheetIndex>1000||!entry.settings||settings.has(entry.sheetIndex))fail();settings.set(entry.sheetIndex,entry.settings);}
 settings.set(saved.data.sheetIndex,saved.settings);if(settings.size>1001)fail();
 const selected=saved.data.selectedSheets;
 if(selected!==undefined&&(!Array.isArray(selected)||!selected.length||selected.length>1001||new Set(selected).size!==selected.length||selected.some(index=>!Number.isInteger(index)||index<0||index>1000)||!selected.includes(saved.data.sheetIndex)))fail();
 const images=[];for(const [index,setting]of [...settings].sort(([a],[b])=>a-b)){
  if(selected&&!selected.includes(index))continue;
  if(setting.format!=='plotlauncher-web'||setting.version!==1||!setting.axes||!Array.isArray(setting.series)||!setting.series.length||typeof setting.data?.sheet!=='string')fail();
  const {inheritFirstSheet,inheritSharedSettings,...rendering}=setting;
  images.push({imageId:plotSheetId(index),sheetIndex:index,name:(setting.data.sheet||`Sheet ${index+1}`).slice(0,255),fingerprint:await hash({source,settings:rendering})});
 }
 return {projectId,activeImageId:plotSheetId(saved.data.sheetIndex),images};
}
export async function readPlotIdentity(blob){if(!(blob instanceof Blob)||!blob.size||blob.size>130*1024*1024)throw Error('PlotLauncherプロジェクトは130 MB以内にしてください。');return identifyPlotProject(JSON.parse(await blob.text()));}
export function mergePlotCheckpoint(previous,captured,batch=false){
 if(batch)return captured;if(!previous||previous.source!==captured?.source)return null;
 const ids=new Set(captured.identity.images.filter(i=>i.imageId===captured.identity.activeImageId).map(i=>i.imageId));
 return {...previous,identity:{...previous.identity,images:previous.identity.images.map(i=>ids.has(i.imageId)?captured.identity.images.find(n=>n.imageId===i.imageId):i)}};
}
export function samePlotCheckpoint(before,after){return !!before&&before.source===after.source&&before.identity.projectId===after.identity.projectId&&before.identity.images.length===after.identity.images.length&&before.identity.images.every(i=>after.identity.images.some(n=>n.imageId===i.imageId&&n.fingerprint===i.fingerprint));}
export function createPlotAcknowledgements(){const values=new Map();return{isUnchanged(projectId,image){return values.get(projectId+'\0'+image.imageId)===image.fingerprint},accept(result){const projectId=result?.batch?.projectId||result?.image?.projectId;for(const image of result?.batch?.images||(result?.image?[result.image]:[]))values.set(projectId+'\0'+image.imageId,image.fingerprint);}};}
