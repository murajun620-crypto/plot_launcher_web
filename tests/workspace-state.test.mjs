import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {defaultAxes,createSeries,makeSettings,restoreSettings} from '../state.js';

// Exercise the actual module-scope guards without starting PlotLauncher's worker/UI.
const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
const section=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const attributes=['data-axis','data-option','data-series-field','data-annotation-field','data-legend-field','data-legend-key','data-fill','data-unit-axis','data-axis-auto','data-axis-name','data-series-scope','data-preview-preset'];
const guards=Function('makeSettings','restoreSettings','figureWorkspaceAttributes',section('function validateFigureWorkspaceGraph(','// End pure workspace validation helpers.')+'return {graph:validateFigureWorkspaceGraph,validate:validateFigureWorkspaceState};')(makeSettings,restoreSettings,attributes);
const empty=Function('defaultAxes','$',section('function figureWorkspaceEmpty()','async function captureFigureWorkspace(')+'return figureWorkspaceEmpty;')(defaultAxes,()=>({defaultValue:'graph'}));
function snapshot(){
 const state=empty();state.sourceData={filename:'data.csv',bytes:new TextEncoder().encode('x,y\n1,2\n2,3').buffer};state.metadata={filename:'data.csv',sheetIndex:0,sheets:['Sheet1'],columns:[{index:0,name:'x',numeric:2},{index:1,name:'y',numeric:2}],rows:[[1,2],[2,3]],headerRow:1};state.sourceToken='source-one';state.config={axes:defaultAxes(),series:[createSeries(0,1,'y',0)],plotType:'General',options:{},annotations:[]};state.lastState=structuredClone(state.config);
 return {version:1,app:'plot',state,binding:null};
}

test('empty workspaces and populated snapshots validate without mutating their graph',()=>{
 assert.equal(guards.validate(null),true);assert.equal(guards.validate({version:1,app:'plot',state:null,binding:null}),true);
 const value=snapshot(),before=structuredClone(value);assert.equal(guards.validate(value),true);assert.deepEqual(value,before);
});

test('private reflected and local-save baselines preserve aliases through a portable snapshot clone',()=>{
 const value=snapshot();value.state.bridgeBaseline={source:value.state.sourceData,fonts:value.state.fonts,content:'last reflected graph'};value.state.savedProjectState={source:value.state.sourceData,fonts:value.state.fonts,content:'last local save'};
 const cloned=structuredClone(value);assert.equal(guards.validate(cloned),true);assert.equal(cloned.state.bridgeBaseline.source,cloned.state.sourceData);assert.equal(cloned.state.savedProjectState.source,cloned.state.sourceData);assert.equal(cloned.state.bridgeBaseline.fonts,cloned.state.fonts);assert.notEqual(cloned.state.sourceData,value.state.sourceData);
 const older={filename:'older.csv',bytes:new ArrayBuffer(3)};value.state.bridgeBaseline.source=older;const dirty=structuredClone(value);assert.notEqual(dirty.state.bridgeBaseline.source,dirty.state.sourceData);
});

test('invalid shapes, unbounded data, cyclic configurations and live handles fail preflight',()=>{
 for(const mutate of [value=>value.version=2,value=>value.state.config.axes=null,value=>value.state.sourceData.bytes='not bytes',value=>value.state.sourceData.bytes=new ArrayBuffer(31*1024*1024),value=>value.state.fonts=new Array(33).fill({}),value=>value.state.config.axes.loop=value.state.config,value=>value.state.sourceToken=undefined,value=>value.state.workspace.view.zoom=0,value=>value.state.handles={createWritable(){}}]){const value=snapshot();mutate(value);assert.throws(()=>guards.validate(value));}
 let read=false;const value={};Object.defineProperty(value,'bad',{enumerable:true,get(){read=true;return 1;}});assert.throws(()=>guards.graph(value));assert.equal(read,false);
});

test('valid pending form strings stay unchanged while inaccessible native numeric fragments reject capture',async()=>{
 const input={value:'pending label\nnext line',checked:false,indeterminate:false,validity:{badInput:false},getAttribute:()=>null,closest:()=>({textContent:'軸の最大値'}),dataset:{axis:'xMax'},id:'axis-max'};
 const ui=Function('figureWorkspaceFields','figureWorkspaceBaseLocator','figureWorkspaceLocatorKey','$$','$','document',section('function figureWorkspaceUI(','function figureWorkspaceHasWork(')+'return figureWorkspaceUI;')(()=>[input],()=>({scope:'',id:'axis-max',tag:'INPUT',type:'text',attributes:[],ordinal:0}),JSON.stringify,()=>[],()=>({open:false}),{activeElement:null});
 assert.equal(ui({rejectInvalid:true}).fields[0].value,input.value);assert.equal(input.value,'pending label\nnext line');
 input.validity.badInput=true;input.value='';assert.throws(()=>ui({rejectInvalid:true}),/軸の最大値.*確定/);
 let waited=false;const capture=Function('figureWorkspaceBusy','figureWorkspaceHasWork','figureWorkspaceUI','figureBridgeWait',section('async function captureFigureWorkspace(','async function restoreFigureWorkspace(')+'return captureFigureWorkspace;')(()=>false,()=>true,ui,()=>{waited=true;});
 await assert.rejects(capture(),/軸の最大値.*確定/);assert.equal(waited,false);assert.equal(input.validity.badInput,true);assert.equal(input.value,'');
});

test('restoring worker data retains unreflected baselines, history, pending values and a stable signature',async()=>{
 const value=snapshot(),state=value.state,locator={scope:'',id:'pending-title',tag:'INPUT',type:'text',attributes:[],ordinal:0};
 state.ui.fields=[{locator,value:'not yet committed\nsecond line',checked:false,indeterminate:false,badInput:false}];state.ui.focus=locator;
 state.bridgeBaseline={source:state.sourceData,fonts:state.fonts,content:'last Studio reflection'};state.savedProjectState={source:state.sourceData,fonts:state.fonts,content:'last local save'};
 state.history=[structuredClone(state.config)];state.history[0].axes.xLabel='older';state.future=[structuredClone(state.config)];state.config.axes.xLabel='committed';
 const sourceBody=section('async function restoreFigureWorkspace(','window.FigureStudioWorkspaceState=');
 const signatureBody=section('function figureWorkspaceSignature()','function figureWorkspaceEmpty()');
 const harness=Function('initial','validateFigureWorkspaceState','figureWorkspaceEmpty',`
  let loading=false,exporting=false,engineReady=true,renderRunning=false,renderWanted=false,figureWorkspaceRestoring=false,figureWorkspaceSavedSignature=null,revision=1,renderTimer;
  let config=initial.config,sourceData=initial.sourceData,metadata=initial.metadata,view=initial.workspace.view,loadedHeader=initial.loadedHeader,sample=initial.sample,sheetSettings=new Map(initial.sheetSettings),sheetMode=initial.sheetMode,sharedSettings=initial.sharedSettings;
  let history=initial.history,future=initial.future,lastState=initial.lastState,selected=new Set(initial.selected),clipboard=initial.clipboard,savedProjectState=initial.savedProjectState,figureBridgeBaseline=initial.bridgeBaseline,figureBridgePreservedOnReconnect=false;
  let sourceHandle={},sourceDirectory={},saveDirectory={},projectHandle={},dataFileHandles=[],projectFilename=initial.projectFilename,pendingDataFiles=null,pastedTable=null,pasteHeaderAutomatic=true;
  const importedFonts=new Map(initial.fonts.map(font=>[font.name,font])),loadedFonts=new Set(),localFontAliases=new Map(),failedLocalFonts=new Set(),recentColors=[],figureWorkspaceTokens=new WeakMap();figureWorkspaceTokens.set(sourceData,initial.sourceToken);
  const fields=new Map(),nodes=new Map();for(const field of initial.ui.fields)fields.set(field.locator.id,{value:field.value,type:'text',focus(){}});
  const $=selector=>{if(!nodes.has(selector))nodes.set(selector,{value:'',hidden:false,checked:false,dataset:{},open:false});return nodes.get(selector);},$$=()=>[];
  const window={scrollTo(){}},document={getElementById(){return null}},figureWorkspaceDialogIds=new Set();
  const figureWorkspaceBusy=()=>false,figureBridgeWait=async predicate=>{if(!predicate())throw Error('unexpected wait');},request=async type=>type==='load'?structuredClone(initial.metadata):null;
  const updateButtons=()=>{},resetPreview=()=>{},drawMetadata=()=>{},drawControls=()=>{fields.get('pending-title').value='committed control value';},refreshSaveDestination=()=>{},toggleSeriesTable=()=>{$('#series-table-content').hidden=!$('#series-table-content').hidden;},renderPreview=async()=>{renderWanted=false;},syncInteractionSelection=()=>{},status=()=>{};
  const figureWorkspaceField=locator=>fields.get(locator.id),figureWorkspaceFields=()=>[...fields.values()],figureWorkspaceBaseLocator=()=>initial.ui.fields[0].locator,figureWorkspaceLocatorKey=locator=>locator.id,figureWorkspaceToken=value=>value?figureWorkspaceTokens.get(value):null,figureWorkspaceHasWork=()=>!!sourceData;
  const figureWorkspaceUI=()=>({...initial.ui,fields:initial.ui.fields.map(field=>({...field,value:fields.get(field.locator.id).value}))});
  ${signatureBody}
  ${sourceBody}
  return {restore:restoreFigureWorkspace,signature:figureWorkspaceSignature,model:()=>({sourceData,config,history,future,figureBridgeBaseline,savedProjectState,projectHandle,pending:fields.get('pending-title').value,restoring:figureWorkspaceRestoring})};
 `)(state,guards.validate,empty);
 const before=harness.signature();await harness.restore(value);const restored=harness.model();
 assert.equal(harness.signature(),before);assert.equal(restored.pending,'not yet committed\nsecond line');assert.equal(restored.config.axes.xLabel,'committed');assert.equal(restored.history[0].axes.xLabel,'older');assert.equal(restored.future.length,1);
 assert.equal(restored.figureBridgeBaseline.source,restored.sourceData);assert.equal(restored.savedProjectState.source,restored.sourceData);assert.equal(restored.figureBridgeBaseline.content,'last Studio reflection');assert.equal(restored.projectHandle,null);assert.equal(restored.restoring,false);
 await harness.restore(null);assert.equal(harness.model().sourceData,null);assert.equal(harness.model().figureBridgeBaseline,null);assert.equal(harness.signature(),'plot-empty');
});
