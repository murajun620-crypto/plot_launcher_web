import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeProject as encodePlotProject,parseProject,safeStem,PROJECT_MAX_SIZE} from '../state.js';
import {identifyPlotProject,openedPlotIdentity,savedPlotProjectId} from '../plot-sync.mjs';
import {createProjectFileLinks,portableFileLink} from '../project-file-links.mjs';

const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
const section=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const saver=section('function sourceProjectSaveReady(','$("#save-project").addEventListener');
const nativeChanges=section('function hasUnsavedChanges()', "window.addEventListener('beforeunload'");
const maker=section('function makeProject(','function positionDialog(');
const original=JSON.parse(await readFile(new URL('../samples/general.plotproject',import.meta.url),'utf8'));
original.workspace.figureStudioProjectId='test-source-project-000001';original.workspace.projectFileName='source.plotproject';
function handle(name,blob){let bytes=blob;return {name,kind:'file',fail:false,async getFile(){return new File([bytes],name);},async queryPermission(){return 'granted';},async isSameEntry(other){return this===other;},async createWritable(){let pending;const h=this;return {async write(blob){if(h.fail)throw Error('disk full');pending=blob;},async close(){bytes=pending;},async abort(){}};}};}
async function fixture({saveAs=false,fail=false,cancel=false,unbound=false}={}){
  const project=parseProject(original),native=handle('source.plotproject',new Blob([JSON.stringify(original)])),copy=handle('copy.plotproject',new Blob());copy.fail=fail;native.fail=fail;
  const records=new Map(),store={async get(key){return records.get(key);},async list(key){return [...records.values()].filter(r=>r.project===key);},async put(record){records.set(record.token,record);}};
  const pickerHost={async showSaveFilePicker(){if(cancel)throw new DOMException('cancelled','AbortError');return copy;}};
  const projectFiles=createProjectFileLinks({app:'plot',store,host:pickerHost,choose:()=>assert.fail('Unexpected confirmation'),identify:async file=>openedPlotIdentity(await identifyPlotProject(JSON.parse(await file.text())),file.name)});
  const opened=await projectFiles.opened({file:await native.getFile(),projectId:original.workspace.figureStudioProjectId,handle:native});
  const data={...project.data,figureStudioProjectId:original.workspace.figureStudioProjectId,figureStudioProjectFileName:'source.plotproject'};
  const events=[],nodes=new Map([['#save-name',{value:'figure'}],['#png-dpi',{value:'600'}]]);
  const env={projectVersionChecking:false,window:pickerHost,chooseProjectFileAction:()=>assert.fail('Unexpected confirmation'),figureWorkspaceBusy:()=>false,figureBridgePendingInput:()=>false,pendingDataFiles:null,dataEditor:null,figureWorkspaceUI(){},engineReady:true,loading:false,exporting:false,sourceData:data,metadata:{sheetIndex:project.data.sheetIndex},config:{series:[{}]},updateButtons(){},safeStem,projectFilename:'source.plotproject',projectFileLink:opened.link,projectHandle:native,projectFiles,saveDirectory:null,sourceDirectory:null,sourceHandle:null,download(){assert.fail('Unexpected download');},figureStudioBridge:{async captureWorkspaceBinding(){},resetWorkspaceBinding(){events.push('detach');}},projectEditState:()=>({source:data,fonts:[],content:JSON.stringify(project.settings)}),savedPlotProjectId,makeSettings:()=>project.settings,loadedHeader:1,sample:false,importedFonts:new Map(),$:id=>nodes.get(id),$$:()=>[],view:project.workspace.view,projectSheetSettings:()=>[],sheetMode:'individual',sharedSettings:null,currentSharedSettings:()=>null,PROJECT_MAX_SIZE,figureBridgeBaseline:{source:data},figureBridgePreservedOnReconnect:true,plotCollectionCache:{},savedProjectState:null,status:(message,kind)=>events.push({message,kind}),renderWanted:false,renderPreview(){},encodePlotProject,portableFileLink};
  if(unbound){env.projectHandle=null;env.projectFilename='';env.projectFileLink=null;records.clear();}
  const keys=Object.keys(env),api=Function(...keys,maker+nativeChanges+saver+'return {prepare:prepareSourceProjectSave,ready:sourceProjectSaveReady,save:saveProject,make:makeProject,state:()=>({projectHandle,projectFilename,projectFileLink,sourceData,savedProjectState,exporting,plotCollectionCache})};')(...keys.map(key=>env[key]));
  return {api,native,copy,opened,events,records,saveAs,project,pickerHost};
}
test('actual Plot save writes a reopenable project, keeps original identity and refreshes its portable version',async()=>{
  const f=await fixture();await f.api.save();const state=f.api.state(),raw=JSON.parse(await (await f.native.getFile()).text());
  assert.equal(raw.workspace.figureStudioProjectId,original.workspace.figureStudioProjectId);assert.equal(raw.workspace.sourceFileLink,undefined);assert.ok(parseProject(raw));assert.equal(state.projectHandle,f.native);assert.equal(state.exporting,false);assert.equal(state.savedProjectState.source,state.sourceData);assert.equal(state.plotCollectionCache,null);assert.notEqual(state.projectFileLink.fingerprint,f.opened.link.fingerprint);assert.equal(state.projectFileLink.token,f.opened.link.token);
  const snapshot=f.api.make(raw.settings,{...state.sourceData},[],raw.workspace);assert.deepEqual(snapshot.workspace.sourceFileLink,state.projectFileLink);assert.equal(snapshot.workspace.projectFileName,'source.plotproject');assert.equal(f.events.includes('detach'),false);
});
test('actual Plot Save As creates an independent identity and retains the original target registration',async()=>{
  const f=await fixture(),before=await (await f.native.getFile()).text();await f.api.save({saveAs:true});const state=f.api.state(),raw=JSON.parse(await (await f.copy.getFile()).text());
  assert.notEqual(raw.workspace.figureStudioProjectId,original.workspace.figureStudioProjectId);assert.equal(state.sourceData.figureStudioProjectId,raw.workspace.figureStudioProjectId);assert.equal(state.projectFilename,'copy.plotproject');assert.equal(state.projectHandle,f.copy);assert.equal(await (await f.native.getFile()).text(),before);assert.equal(f.records.size,2);assert.ok(f.events.includes('detach'));assert.equal(raw.workspace.sourceFileLink,undefined);
});
test('actual Plot failed save leaves handle, identity, saved checkpoint and version unchanged',async()=>{
  for(const saveAs of [false,true]){const f=await fixture({fail:true}),before=await (await f.native.getFile()).text();await f.api.save({saveAs});const state=f.api.state();
    assert.equal(state.projectHandle,f.native);assert.equal(state.sourceData.figureStudioProjectId,original.workspace.figureStudioProjectId);assert.deepEqual(state.projectFileLink,f.opened.link);assert.equal(state.savedProjectState,null);assert.equal(state.exporting,false);assert.equal(await (await f.native.getFile()).text(),before);assert.equal(f.records.size,1);assert.equal(f.events.includes('detach'),false);assert.ok(f.events.some(e=>e.kind==='error'&&e.message.includes('disk full')));
  }
});
test('cancelling Plot Save As preserves the original writable binding',async()=>{
  const f=await fixture({cancel:true}),before=await (await f.native.getFile()).text();await f.api.save({saveAs:true});const state=f.api.state();
  assert.equal(state.projectHandle,f.native);assert.equal(state.sourceData.figureStudioProjectId,original.workspace.figureStudioProjectId);assert.deepEqual(state.projectFileLink,f.opened.link);assert.equal(state.savedProjectState,null);assert.equal(await (await f.native.getFile()).text(),before);assert.equal(f.records.size,1);
});
test('Plot bulk save stages a real native project without writing and stays locked until the batch releases it',async()=>{
  const f=await fixture(),before=await (await f.native.getFile()).text(),plan=await f.api.prepare({requireFile:true});
  assert.equal(f.api.state().exporting,true);assert.equal(await (await f.native.getFile()).text(),before);assert.equal(f.api.state().savedProjectState,null);
  const receipt=await plan.write({hold:true});assert.equal(receipt.name,'source.plotproject');assert.equal(f.api.state().exporting,true);assert.ok(parseProject(JSON.parse(await (await f.native.getFile()).text())));
  await assert.rejects(plan.write({hold:true}),/終了/);plan.cancel();plan.cancel();assert.equal(f.api.state().exporting,false);
});
test('Studio skips an unchanged saved Plot source and includes it after a new edit',async()=>{
 const f=await fixture();
 assert.equal(f.api.ready({editedOnly:true}),true);
 await f.api.save();
 assert.equal(f.api.ready({editedOnly:true}),false);
 assert.equal(f.api.ready(),true);
 f.project.settings.axes.xLabel='edited after reopening';
 assert.equal(f.api.ready({editedOnly:true}),true);
});
test('Plot cancels a prepared bulk save without changing disk or its saved checkpoint',async()=>{
  const f=await fixture(),before=await (await f.native.getFile()).text(),plan=await f.api.prepare({requireFile:true});plan.cancel();
  assert.equal(await (await f.native.getFile()).text(),before);assert.deepEqual(f.api.state().projectFileLink,f.opened.link);assert.equal(f.api.state().savedProjectState,null);assert.equal(f.api.state().exporting,false);await assert.rejects(plan.write(),/終了/);
});
test('Plot rejects content changes between preparation and writing',async()=>{
  const f=await fixture(),before=await (await f.native.getFile()).text(),plan=await f.api.prepare({requireFile:true});f.project.settings.axes.xLabel='changed during preparation';
  await assert.rejects(plan.write(),/内容が変わりました/);plan.cancel();assert.equal(await (await f.native.getFile()).text(),before);assert.equal(f.api.state().savedProjectState,null);assert.equal(f.api.state().exporting,false);
});
test('the first ordinary Plot save retains its existing Studio project identity',async()=>{
  const f=await fixture({unbound:true}),plan=await f.api.prepare({requireFile:true});assert.equal(f.api.state().sourceData.figureStudioProjectId,original.workspace.figureStudioProjectId);
  await plan.write();assert.equal(JSON.parse(await (await f.copy.getFile()).text()).workspace.figureStudioProjectId,original.workspace.figureStudioProjectId);assert.equal(f.events.includes('detach'),false);assert.equal(f.api.state().projectHandle,f.copy);
});
