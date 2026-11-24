import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeProject as encodePlotProject,parseProject,safeStem,PROJECT_MAX_SIZE} from '../state.js';
import {identifyPlotProject,openedPlotIdentity,savedPlotProjectId} from '../plot-sync.mjs';
import {createProjectFileLinks,portableFileLink} from '../project-file-links.mjs';

const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
const section=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const saver=section('function sourceProjectSaveReady(','$("#save-project").addEventListener');
const workFolder=section('function clearStudioWorkFolderWatch()','figureStudioBridge=setupFigureBridge({');
const nativeChanges=section('function hasUnsavedChanges()', "window.addEventListener('beforeunload'");
const maker=section('function makeProject(','function positionDialog(');
const original=JSON.parse(await readFile(new URL('../samples/general.plotproject',import.meta.url),'utf8'));
original.workspace.figureStudioProjectId='test-source-project-000001';original.workspace.projectFileName='source.plotproject';
function handle(name,blob){let bytes=blob;return {name,kind:'file',fail:false,async getFile(){return new File([bytes],name);},async queryPermission(){return 'granted';},async isSameEntry(other){return this===other;},async createWritable(){let pending;const h=this;return {async write(blob){if(h.fail)throw Error('disk full');pending=blob;},async close(){bytes=pending;},async abort(){}};}};}
async function fixture({saveAs=false,fail=false,cancel=false,unbound=false,sourceKey,folderSearch,chooseAction,keepRegistry=false}={}){
  const project=parseProject(original),native=handle('source.plotproject',new Blob([JSON.stringify(original)])),copy=handle('copy.plotproject',new Blob());copy.fail=fail;native.fail=fail;
  const records=new Map(),store={async get(key){return records.get(key);},async list(key){return [...records.values()].filter(r=>r.project===key);},async put(record){records.set(record.token,record);}};
  const pickerHost={async showSaveFilePicker(){if(cancel)throw new DOMException('cancelled','AbortError');return copy;}};
  const projectFiles=createProjectFileLinks({app:'plot',store,host:pickerHost,choose:()=>assert.fail('Unexpected confirmation'),identify:async file=>openedPlotIdentity(await identifyPlotProject(JSON.parse(await file.text())),file.name)});
  const opened=await projectFiles.opened({file:await native.getFile(),projectId:original.workspace.figureStudioProjectId,handle:native});
  const data={...project.data,figureStudioProjectId:original.workspace.figureStudioProjectId,figureStudioProjectFileName:'source.plotproject'};
  const events=[],prepared=[];
  const originalPrepare=projectFiles.prepare;
  projectFiles.prepare=options=>{prepared.push(options);return originalPrepare(options);};
  const nodes=new Map([['#save-name',{value:'figure'}],['#png-dpi',{value:'600'}]]);
  const env={studioWorkFolderWatch:null,projectVersionChecking:false,window:pickerHost,chooseProjectFileAction:chooseAction??(()=>assert.fail('Unexpected confirmation')),figureWorkspaceBusy:()=>false,figureBridgePendingInput:()=>false,pendingDataFiles:null,dataEditor:null,figureWorkspaceUI(){},engineReady:true,loading:false,exporting:false,sourceData:data,metadata:{sheetIndex:project.data.sheetIndex},config:{series:[{}]},updateButtons(){},safeStem,projectFilename:'source.plotproject',projectFileLink:opened.link,projectHandle:native,projectFiles,saveDirectory:null,sourceDirectory:null,sourceHandle:null,download(){assert.fail('Unexpected download');},figureStudioBridge:{sourceKey,async captureWorkspaceBinding(){},resetWorkspaceBinding(){events.push('detach');}},projectEditState:()=>({source:data,fonts:[],content:JSON.stringify(project.settings)}),savedPlotProjectId,makeSettings:()=>project.settings,loadedHeader:1,sample:false,importedFonts:new Map(),$:id=>nodes.get(id),$$:()=>[],view:project.workspace.view,projectSheetSettings:()=>[],sheetMode:'individual',sharedSettings:null,currentSharedSettings:()=>null,PROJECT_MAX_SIZE,figureBridgeBaseline:{source:data},figureBridgePreservedOnReconnect:true,plotCollectionCache:{},savedProjectState:null,status:(message,kind)=>events.push({message,kind}),renderWanted:false,renderPreview(){},encodePlotProject,portableFileLink};
  if(folderSearch){env.projectHandle=null;projectFiles.findInWorkFolder=folderSearch;if(!keepRegistry)records.clear();}
  if(unbound){env.projectHandle=null;env.projectFilename='';env.projectFileLink=null;records.clear();}
  const keys=Object.keys(env),api=Function(...keys,maker+nativeChanges+workFolder+saver+'return {watch:watchStudioWorkFolder,route:key=>{figureStudioBridge.sourceKey=key;},prepare:prepareSourceProjectSave,ready:sourceProjectSaveReady,save:saveProject,make:makeProject,state:()=>({projectHandle,projectFilename,projectFileLink,sourceData,savedProjectState,exporting,plotCollectionCache})};')(...keys.map(key=>env[key]));
  return {api,native,copy,opened,events,records,prepared,saveAs,project,pickerHost,projectFiles};
}
test('actual Plot save writes a reopenable project, keeps original identity and refreshes its portable version',async()=>{
  const f=await fixture();await f.api.save();const state=f.api.state(),raw=JSON.parse(await (await f.native.getFile()).text());
  assert.equal(raw.workspace.figureStudioProjectId,original.workspace.figureStudioProjectId);assert.equal(raw.workspace.sourceFileLink,undefined);assert.ok(parseProject(raw));assert.equal(state.projectHandle,f.native);assert.equal(state.exporting,false);assert.equal(state.savedProjectState.source,state.sourceData);assert.equal(state.plotCollectionCache,null);assert.notEqual(state.projectFileLink.fingerprint,f.opened.link.fingerprint);assert.equal(state.projectFileLink.token,f.opened.link.token);
  const snapshot=f.api.make(raw.settings,{...state.sourceData},[],raw.workspace);assert.deepEqual(snapshot.workspace.sourceFileLink,state.projectFileLink);assert.equal(snapshot.workspace.projectFileName,'source.plotproject');assert.equal(f.events.includes('detach'),false);
});
test('Plot saving from a Studio route supplies the exact attachment key to the native file registry',async()=>{
  const sourceKey='book/figure/panel/asset',f=await fixture({sourceKey});
  await f.api.save();
  assert.equal(f.prepared[0].sourceKey,sourceKey);
  assert.equal(f.prepared[0].projectId,original.workspace.figureStudioProjectId);
  assert.equal(f.api.state().projectHandle,f.native);
  assert.equal(JSON.parse(await (await f.native.getFile()).text()).workspace.sourceKey,undefined);
});
test('a Studio attachment reopens the local file saved under another name, before it receives a new embedded token',async()=>{
  const sourceKey='book/figure/panel/asset',f=await fixture({unbound:true,sourceKey});
  await f.api.save();
  const projectId=original.workspace.figureStudioProjectId;
  const embedded=new File([JSON.stringify(original)],'source.plotproject');
  const target=await f.projectFiles.opened({file:embedded,projectId,embedded:true,sourceKey});
  assert.equal(target.handle,f.copy);
  assert.equal(target.name,f.copy.name);
  assert.equal(f.api.state().sourceData.figureStudioProjectId,projectId);
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

test('Plot resolves a Studio work folder on connect and saves directly to the discovered file',async()=>{
  const editKey='book/figure/panel/asset',directory={kind:'directory',name:'work'};
  let result,lookup;
  const f=await fixture({sourceKey:editKey,folderSearch:async options=>{lookup=options;return result;}});
  result={handle:f.native,link:f.opened.link};
  f.api.watch({editKey,getWorkFolder:async()=>directory});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(lookup.directory,directory);assert.equal(lookup.sourceKey,editKey);assert.equal(lookup.name,f.native.name);
  assert.equal(f.api.state().projectHandle,f.native);
  await f.api.save();
  assert.equal(f.api.state().projectHandle,f.native);
  assert.equal((await f.copy.getFile()).size,0);
});

test('Plot saving leaves an unfinished work folder lookup running without waiting or replacing the saved file',async()=>{
  const editKey='book/figure/panel/asset',directory={kind:'directory',name:'work'};
  let resolveLookup,notifyStarted;
  const pending=new Promise(resolve=>resolveLookup=resolve),started=new Promise(resolve=>notifyStarted=resolve);
  const f=await fixture({sourceKey:editKey,keepRegistry:true,folderSearch:async options=>{notifyStarted(options.signal);return pending;}});
  f.api.watch({editKey,getWorkFolder:()=>directory});
  const signal=await started;
  await f.api.save();
  assert.equal(signal.aborted,false);
  assert.equal(f.api.state().projectHandle,f.native);
  resolveLookup({handle:f.copy,link:null});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.api.state().projectHandle,f.native);
});

test('Plot shares the ongoing Studio lookup and adopts its answer after a cancelled save',async()=>{
  const editKey='book/figure/panel/asset';
  let finishSearch,finishChoice,notifyChoice,lookupCalls=0;
  const pendingSearch=new Promise(resolve=>finishSearch=resolve);
  const pendingChoice=new Promise(resolve=>finishChoice=resolve);
  const choosing=new Promise(resolve=>notifyChoice=resolve);
  let signal;
  const f=await fixture({
    sourceKey:editKey,
    folderSearch:()=>assert.fail('A Studio lookup must not start a second editor scan'),
    chooseAction({kind}){assert.equal(kind,'missing');notifyChoice();return pendingChoice;}
  });
  f.api.watch({
    editKey,getWorkFolder:()=>new Promise(()=>{}),
    findWorkFolderSource(details,searchSignal){
      lookupCalls++;
      assert.deepEqual(details,{projectId:original.workspace.figureStudioProjectId,name:f.native.name});
      signal=searchSignal;
      return pendingSearch;
    }
  });
  const saving=f.api.save();
  await choosing;
  assert.equal(lookupCalls,1);assert.equal(signal.aborted,false);
  finishSearch(f.native);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.api.state().projectHandle,null);
  finishChoice('cancel');
  await saving;
  assert.equal(f.api.state().projectHandle,f.native);
  assert.deepEqual(f.api.state().projectFileLink,f.opened.link);
  await f.api.save();
  assert.equal(f.api.state().projectHandle,f.native);
  assert.equal(lookupCalls,1);
});

test('Plot switches pending targets with the Studio work folder and keeps a completed save target',async()=>{
  const editKey='book/figure/panel/asset',first={kind:'directory',name:'first'},second={kind:'directory',name:'second'};
  let directory=first,folderChanged,firstHandle,secondHandle;
  const f=await fixture({sourceKey:editKey,folderSearch:async options=>({handle:options.directory===first?firstHandle:secondHandle,link:f.opened.link})});
  firstHandle=f.native;
  secondHandle=handle(f.native.name,await f.native.getFile());
  f.api.watch({editKey,getWorkFolder:()=>directory,subscribeWorkFolder:fn=>{folderChanged=fn;return ()=>{};}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.api.state().projectHandle,firstHandle);
  directory=null;folderChanged();
  assert.equal(f.api.state().projectHandle,null);
  directory=second;folderChanged();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.api.state().projectHandle,secondHandle);
  await f.api.save();
  directory=first;folderChanged();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.api.state().projectHandle,secondHandle);
});

test('Plot cannot apply a lookup from a previous Studio attachment to a later route',async()=>{
  const firstKey='book/figure/panel/asset',secondKey='book/figure/next/another-asset',directory={kind:'directory',name:'work'};
  let stopCalls=0,resolveLookup,notifyStarted;
  const pending=new Promise(resolve=>resolveLookup=resolve),started=new Promise(resolve=>notifyStarted=resolve);
  const f=await fixture({sourceKey:firstKey,folderSearch:async options=>{
    if(options.sourceKey===firstKey){notifyStarted(options.signal);return pending;}
    assert.equal(options.sourceKey,secondKey);
    return {handle:f.native,link:f.opened.link};
  }});
  f.api.watch({editKey:firstKey,getWorkFolder:()=>directory,subscribeWorkFolder:()=>()=>{stopCalls++;}});
  const previousSignal=await started;
  f.api.route(secondKey);
  f.api.watch({editKey:secondKey,getWorkFolder:()=>directory});
  assert.equal(previousSignal.aborted,true);assert.equal(stopCalls,1);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.api.state().projectHandle,f.native);
  resolveLookup({handle:f.copy,link:null});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.api.state().projectHandle,f.native);
});
