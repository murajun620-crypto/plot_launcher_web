import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
function section(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,start);return source.slice(a,b);}
const helpers=section('async function checkFigureStudioProjectReplacement(','async function readProject('),reader=section('async function readProject(','async function openGalleryProject('),acceptance=section('function figureStudioResultMatchesCurrentProject(','figureStudioBridge=setupFigureBridge(');
const dirtySource=section('async function figureBridgeIsDirty(){','const figureBridgeWait');
function fixture({parseError,workerError,bridgeBusy=false,directBusy=false,uninitialized=false,remember=async()=>{}}={}){
 const events=[],oldSource={filename:'same.csv',bytes:new Uint8Array([1]).buffer},oldMetadata={filename:'same.csv',sheetIndex:0,headerRow:1},baseline={source:oldSource,content:'old baseline'};
 const project={data:{filename:'same.csv',bytes:new Uint8Array([2]).buffer,sheetIndex:0,headerRow:1,sample:false},fonts:[],settings:{},workspace:{view:{zoom:1,x:0,y:0},saveName:'new',pngDpi:600,sections:[]}},nodes=new Map();
 const env={identifyPlotProject:async()=>({projectId:"project-new"}),plotAcknowledgements:{accept(){}},samePlotCheckpoint:(a,b)=>!!a&&a.source===b.source&&a.content===b.content,hasUnsavedChanges:()=>true,engineReady:true,loading:false,exporting:false,PROJECT_MAX_SIZE:1e7,updateButtons(){},status:message=>events.push(message),parseProject(){events.push('parse');if(parseError)throw parseError;return project;},
  async request(){events.push('worker');if(workerError)throw workerError;return {metadata:{...oldMetadata},config:{axes:{xLabel:'new'},series:[{}]},families:[]};},
  figureStudioBridge:uninitialized?undefined:{async captureWorkspaceBinding(){events.push('check-binding');if(bridgeBusy)throw Error('bridge busy');return {};},resetWorkspaceBinding(){events.push('detach');},rememberAccepted:remember},figureStudioDirectSender:uninitialized?undefined:{sender:{busy:directBusy,resetPending(){events.push('reset-pending');}}},
  figureBridgeBaseline:baseline,figureBridgePreservedOnReconnect:true,figureWorkspaceSavedSignature:'saved',sourceData:oldSource,metadata:oldMetadata,config:{axes:{xLabel:'old'},series:[{}]},sample:false,dataFileHandles:[],sheetSettings:new Map(),sheetMode:'shared',sharedSettings:null,sourceHandles:new WeakMap(),sourceHandle:{},sourceDirectory:{},projectHandle:{},projectFilename:'same.plotproject',folderSupported:false,
  $:selector=>{if(!nodes.has(selector))nodes.set(selector,{value:'',disabled:false,close(){}});return nodes.get(selector);},$$:()=>[],refreshSaveDestination(){},loadedHeader:1,importedFonts:new Map(),loadedFonts:new Set(),failedLocalFonts:new Set(),localFontAliases:new Map(),renderTimer:0,revision:0,selected:new Set(),history:[],future:[],lastState:{},view:{},savedProjectState:baseline,renderWanted:false,
  resetPreview(){},drawMetadata(){events.push('commit-ui');},drawControls(){},renderPreview(){events.push('render');},renderRunning:false,renderedRevision:0,dragging:null,colormapApplying:false,pendingDataFiles:null,figureBridgePendingInput:()=>false,
 };
 const keys=Object.keys(env),api=Function(...keys,`${helpers}\n${reader}\n${dirtySource}\n${acceptance}\nasync function collectPlotGraphs(){return {checkpoint:projectEditState()};} function projectEditState(){return {source:sourceData,content:config.axes.xLabel,fonts:[]};}\nreturn {read:readProject,prepare:prepareFigureStudioProjectReplacement,check:checkFigureStudioProjectReplacement,accept:acceptFigureStudioResult,acceptDirect:acceptDirectFigureStudioResult,projectLoaded:figureStudioProjectLoaded,occupied:figureStudioHasUnreflectedContent,markRendered:()=>{renderedRevision=revision;},editLabel:value=>{config.axes.xLabel=value;},state:()=>({sourceData,metadata,projectFilename,baseline:figureBridgeBaseline,preserved:figureBridgePreservedOnReconnect,saved:figureWorkspaceSavedSignature,loading}),replaceSource:next=>{sourceData=next;}};`)(...keys.map(k=>env[k]));
 return {api,events,oldSource,oldMetadata,baseline,file:new File(['{}'],'same.plotproject')};
}
test('manual project replacement detaches after successful read, even for identical filenames, before committing new work',async()=>{
 const f=fixture();assert.equal(await f.api.read(f.file),true);
 assert.ok(f.events.indexOf('worker')>f.events.indexOf('check-binding'));assert.ok(f.events.indexOf('detach')>f.events.indexOf('worker'));assert.ok(f.events.indexOf('detach')<f.events.indexOf('commit-ui'));
 assert.equal(f.events.filter(e=>e==='detach').length,1);assert.ok(f.events.includes('reset-pending'));assert.notEqual(f.api.state().sourceData,f.oldSource);assert.equal(f.api.state().baseline,null);assert.equal(f.api.state().preserved,false);assert.equal(f.api.state().saved,null);
});
test('Studio-requested project loads retain their binding and do not reset direct send state',async()=>{
 const f=fixture();assert.equal(await f.api.read(f.file,undefined,{fromBridge:true}),true);assert.equal(f.events.includes('detach'),false);assert.equal(f.events.includes('check-binding'),false);assert.equal(f.events.includes('reset-pending'),false);assert.equal(f.api.state().baseline,f.baseline);
});
test('failed parsing, worker import, busy bridge and active direct sending retain old project and binding',async()=>{
 for(const options of [{parseError:Error('invalid')},{workerError:Error('decode failed')},{bridgeBusy:true},{directBusy:true}]){
  const f=fixture(options);assert.equal(await f.api.read(f.file),false);assert.equal(f.api.state().sourceData,f.oldSource);assert.equal(f.api.state().metadata,f.oldMetadata);assert.equal(f.api.state().baseline,f.baseline);assert.equal(f.api.state().loading,false);assert.equal(f.events.includes('detach'),false);assert.equal(f.events.includes('reset-pending'),false);
  if(options.bridgeBusy||options.directBusy)assert.equal(f.events.includes('worker'),false);
 }
});
test('early gallery loading before bridge initialization still opens normally',async()=>{const f=fixture({uninitialized:true});assert.equal(await f.api.read(f.file),true);assert.notEqual(f.api.state().sourceData,f.oldSource);});
test('stale acknowledgements cannot establish a baseline for another graph with the same filename',async()=>{
 let remembered=0;const f=fixture({remember:async()=>remembered++});const stale={bridgeState:{source:f.oldSource,content:'stale'}};await f.api.read(f.file);
 assert.equal(f.api.accept(stale),false);await f.api.acceptDirect(stale);assert.equal(remembered,0);assert.equal(f.api.state().baseline,null);
});
test('project replacement while an ACK is hashing prevents late baseline adoption',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r),f=fixture({remember:()=>pending});const ack=f.api.acceptDirect({bridgeState:{source:f.oldSource,content:'old'}});await f.api.read(f.file);resolve();await ack;assert.equal(f.api.state().baseline,null);
});
test('current graph acknowledgement keeps the exact captured baseline',async()=>{const f=fixture(),state={source:f.oldSource,content:'accepted'};await f.api.acceptDirect({bridgeState:state});assert.equal(f.api.state().baseline,state);});

test('adopting an accepted graph preserves its checkpoint and only unreflected work blocks another target',async()=>{
 const f=fixture();assert.equal(await f.api.occupied(),true);const state={source:f.oldSource,content:'old',fonts:[]};await f.api.acceptDirect({bridgeState:state});await f.api.projectLoaded();
 assert.equal(f.api.state().baseline,state);assert.equal(await f.api.occupied(),false);f.api.editLabel('unsent');assert.equal(await f.api.occupied(),true);await f.api.projectLoaded();assert.equal(f.api.state().baseline,state);assert.equal(await f.api.occupied(),true);
});
test('normal bridge loading establishes a fresh checkpoint after the worker finishes rendering',async()=>{
 const f=fixture();await f.api.read(f.file,undefined,{fromBridge:true});f.api.prepare();await f.api.projectLoaded();f.api.markRendered();assert.equal(await f.api.occupied(),false);assert.equal(f.api.state().baseline.source,f.api.state().sourceData);
});

// Exercise the actual CSV/sample and multi-file loader entry points. A staged
// worker error lets the test stop before unrelated controls are drawn.
test('new data loaders check the connection before the worker, while reload and append retain the current route',async()=>{
 const single=section('async function loadFile(','function validateSampleCatalog('),multi=section('async function loadDataFiles(','async function reloadSourceData(');
 for(const kind of ['new','reload','multi-new','multi-append','multi-selection']){
  const events=[],nodes=new Map(),metadata={filename:'old.csv',sheetIndex:0,headerRow:1},data={filename:'old.csv',bytes:new Uint8Array([1]).buffer};
  const env={loading:false,exporting:false,engineReady:true,metadata,config:{axes:{},series:[{}]},sourceData:kind==='multi-selection'?{filename:'old.csv',files:[{filename:'old.csv',bytes:data.bytes}]}:data,loadedHeader:1,sheetMode:'individual',sharedSettings:null,sheetSettings:new Map(),sourceHandles:new WeakMap(),dataFileHandles:[],renderTimer:0,revision:0,
   $:id=>{if(!nodes.has(id))nodes.set(id,{value:id==='#header-row'?'1':'0'});return nodes.get(id);},status(){},projectSheetSettings:()=>[],currentSharedSettings:()=>null,makeSettings:()=>({}),updateButtons(){},drawSources(){},drawMetadata(){},renderPreview(){},renderWanted:false,safeStem:s=>s,async checkFigureStudioProjectReplacement(){events.push('check');},async request(){events.push('worker');throw Error('stop after staging');},prepareFigureStudioProjectReplacement(){events.push('detach');},
  };
  const keys=Object.keys(env),load=Function(...keys,`${single}\n${multi}\nreturn {single:loadFile,multi:loadDataFiles};`)(...keys.map(k=>env[k])),file=new File(['x,y\n1,2'],'new.csv');
  if(kind.startsWith('multi'))await load.multi([file,file],kind==='multi-append',kind==='multi-selection'?[{index:0,sheetIndex:0,headerRow:1}]:null);else await load.single(file,false,kind==='reload');
  assert.deepEqual(events,kind==='new'||kind==='multi-new'?['check','worker']:['worker'],kind);
 }
});
