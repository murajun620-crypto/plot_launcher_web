import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateWorkspaceBinding} from '../integration/bridge-host.mjs';
import {readMifitoIdentity} from '../integration/mifito-sync.mjs';
import {readPlotIdentity} from '../integration/plot-sync.mjs';
import {dataURLToBlob} from '../assets.mjs';

// Run the actual app helpers without initializing Studio's canvas or browser storage.
const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
function section(start,end){const at=source.indexOf(start);assert.ok(at>=0,start);const until=source.indexOf(end,at);assert.ok(until>at,end);return source.slice(at,until);}
const keySource=section('function sourceEditKey(','const mifitoIdentities=');
const savedEditorBindings=Function('validateWorkspaceBinding','dataURLToBlob','readMifitoIdentity','readPlotIdentity',keySource+section('async function savedEditorBindings(','async function connectSavedEditors(')+'return savedEditorBindings;')(validateWorkspaceBinding,dataURLToBlob,readMifitoIdentity,readPlotIdentity);
function connectHelper(book,editSource){return Function('figures','bookId','editSource',keySource+section('async function connectSavedEditors(','async function readProject(')+'return connectSavedEditors;')(book.figures,book.id,editSource);}
const dataURL=bytes=>`data:application/octet-stream;base64,${Buffer.from(bytes).toString('base64')}`;
function mifitoBytes(projectId='project-mifito-a1'){
 const bytes=Buffer.from([1,2,3]),manifest={application:'MiFiTo',version:1,activeIndex:0,ui:projectId?{figureStudioProjectId:projectId}:{},images:[{name:'source.png',figureStudioImageId:'image-mifito-a001',sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,width:100,height:80,settings:{panelLabel:{text:'last reflected'}}}]};
 const json=Buffer.from(JSON.stringify(manifest)),header=Buffer.alloc(12);header.write('MiFiTo\r\n');header.writeUInt32LE(json.length,8);return Buffer.concat([header,json,bytes]);
}

function fixture(){
 const book={id:'book-a',figures:[{id:'figure-plot',objects:[{id:'panel-plot',source:{app:'plot',assetId:'project-plot',name:'renamed.plotproject'}}]},{id:'figure-mifito',objects:[{id:'panel-mifito',source:{app:'mifito',assetId:'project-mifito',name:'renamed.mifito'}}]}]};
 const loaded=new Map(),editors={};
 for(const app of ['plot','mifito']){
  const bytes=app==='plot'?'plot-baseline':mifitoBytes();
  loaded.set(`project-${app}`,{name:'same-name',dataUrl:dataURL(bytes)});
  editors[app]={state:app==='mifito'?{ui:{figureStudioProjectId:'project-mifito-a1'},items:[{settings:{panelLabel:{text:'unreflected edit'}}}]}:{},binding:{version:1,app,panelId:`panel-${app}`,editKey:`book-a/figure-${app}/panel-${app}/project-${app}`,baselineProject:new Blob([bytes]),sourceName:'old-name',...(app==='mifito'?{imageId:'image-a'}:{})}};
 }
 return {book,loaded,decoded:{editors}};
}

test('saved multi-sheet PlotLauncher binding verifies the live project identity while preserving unsent edits',async()=>{
 const p={format:'plotlauncher-project',version:1,data:{filename:'two.xlsx',base64:'AA==',sheetIndex:0},fonts:[],settings:{format:'plotlauncher-web',version:1,data:{sheet:'A'},axes:{},series:[{}]},workspace:{figureStudioProjectId:'plot-project-000001'}};const f=fixture(),bytes=JSON.stringify(p),editor=f.decoded.editors.plot;
 f.book.figures[0].objects[0].source.projectId=p.workspace.figureStudioProjectId;f.loaded.get('project-plot').dataUrl=dataURL(bytes);editor.binding.baselineProject=new Blob([bytes]);editor.state={sourceData:{figureStudioProjectId:p.workspace.figureStudioProjectId},config:{unsent:'retained'}};
 assert.ok((await savedEditorBindings(f.decoded,f.book,f.loaded)).plot);editor.state.sourceData.figureStudioProjectId='plot-project-000002';assert.equal((await savedEditorBindings(f.decoded,f.book,f.loaded)).plot,null);assert.equal(editor.state.config.unsent,'retained');
});

test('saved bindings require exact reflected bytes and use the actual attached project and current name',async()=>{
 const {book,loaded,decoded}=fixture(),bindings=await savedEditorBindings(decoded,book,loaded);
 for(const app of ['plot','mifito']){
  assert.equal(bindings[app].editKey,decoded.editors[app].binding.editKey);
  assert.deepEqual(await bindings[app].baselineProject.arrayBuffer(),await decoded.editors[app].binding.baselineProject.arrayBuffer());
  assert.notEqual(bindings[app].baselineProject,decoded.editors[app].binding.baselineProject);
  assert.equal(bindings[app].sourceName,book.figures.find(f=>f.id===`figure-${app}`).objects[0].source.name);
 }
 assert.equal(bindings.mifito.imageId,'image-a');
 assert.equal(decoded.editors.plot.binding.sourceName,'old-name');
});

test('same-length changed bytes detach rather than accepting a matching filename or byte count',async()=>{
 const {book,loaded,decoded}=fixture();
 decoded.editors.plot.binding.baselineProject=new Blob(['plot-baselinX']);
 assert.equal(decoded.editors.plot.binding.baselineProject.size,dataURLToBlob(loaded.get('project-plot').dataUrl).size);
 const bindings=await savedEditorBindings(decoded,book,loaded);
 assert.equal(bindings.plot,null);assert.ok(bindings.mifito);
 decoded.editors.mifito.binding.baselineProject=new Blob(['longer mifito baseline']);
 assert.deepEqual(await savedEditorBindings(decoded,book,loaded),{plot:null,mifito:null});
});

test('older workspace with current MiFiTo B and an exact A baseline detaches without altering either project',async()=>{
 for(const currentId of ['project-mifito-b1',undefined,null]){
  const f=fixture(),editor=f.decoded.editors.mifito;editor.state.ui.figureStudioProjectId=currentId;
  const stateBefore=structuredClone(editor.state),bookBefore=structuredClone(f.book),assetBefore=f.loaded.get('project-mifito').dataUrl;
  assert.equal((await readMifitoIdentity(editor.binding.baselineProject)).projectId,'project-mifito-a1');
  const bindings=await savedEditorBindings(f.decoded,f.book,f.loaded);
  assert.equal(bindings.mifito,null);assert.ok(bindings.plot);assert.deepEqual(editor.state,stateBefore);assert.deepEqual(f.book,bookBefore);assert.equal(f.loaded.get('project-mifito').dataUrl,assetBefore);
 }
});

test('matching current project retains legitimate unreflected changes and legacy inferred identities',async()=>{
 const f=fixture(),editor=f.decoded.editors.mifito;
 assert.ok((await savedEditorBindings(f.decoded,f.book,f.loaded)).mifito);
 assert.equal(editor.state.items[0].settings.panelLabel.text,'unreflected edit');
 const bytes=mifitoBytes(null),baseline=new Blob([bytes]),identity=await readMifitoIdentity(baseline);
 assert.equal(identity.legacy,true);editor.binding.baselineProject=baseline;editor.state.ui.figureStudioProjectId=identity.projectId;f.loaded.get('project-mifito').dataUrl=dataURL(bytes);
 assert.ok((await savedEditorBindings(f.decoded,f.book,f.loaded)).mifito);
});

test('every book, figure, panel, and source asset key component must match independently',async()=>{
 for(const index of [0,1,2,3]){
  const {book,loaded,decoded}=fixture(),parts=decoded.editors.plot.binding.editKey.split('/');parts[index]+='-different';decoded.editors.plot.binding.editKey=parts.join('/');
  assert.equal((await savedEditorBindings(decoded,book,loaded)).plot,null,`edit key component ${index}`);
 }
 for(const mutate of [f=>f.book.id='different-book',f=>f.book.figures[0].id='different-figure',f=>f.book.figures[0].objects[0].id='different-panel',f=>{f.book.figures[0].objects[0].source.assetId='different-project';f.loaded.set('different-project',f.loaded.get('project-plot'));}]){
  const f=fixture();mutate(f);assert.equal((await savedEditorBindings(f.decoded,f.book,f.loaded)).plot,null);
 }
});

test('missing targets, changed application, or missing assets detach without filename fallback',async()=>{
 for(const mutate of [f=>f.book.figures[0].objects.splice(0),f=>f.book.figures[0].objects[0].source.app='mifito',f=>f.loaded.delete('project-plot'),f=>f.decoded.editors.plot.binding.panelId='missing-panel']){
  const f=fixture();mutate(f);assert.equal((await savedEditorBindings(f.decoded,f.book,f.loaded)).plot,null);
 }
 const f=fixture();delete f.decoded.editors.plot;f.decoded.editors.mifito.binding=null;
 assert.deepEqual(await savedEditorBindings(f.decoded,f.book,f.loaded),{plot:null,mifito:null});
 assert.deepEqual(await savedEditorBindings(null,f.book,f.loaded),{plot:null,mifito:null});
});

test('malformed or cross-app saved bindings reject before attachment',async()=>{
 const f=fixture();f.decoded.editors.plot.binding=f.decoded.editors.mifito.binding;
 await assert.rejects(savedEditorBindings(f.decoded,f.book,f.loaded),/編集アプリ/);
 f.decoded.editors.plot.binding={};await assert.rejects(savedEditorBindings(f.decoded,f.book,f.loaded),/関連付け/);
});

test('reconnect uses each verified panel and its own figure, waiting for successful readiness',async()=>{
 const f=fixture(),bindings=await savedEditorBindings(f.decoded,f.book,f.loaded),calls=[];
 let resolveFirst;const first=new Promise(resolve=>{resolveFirst=resolve;});
 const connect=connectHelper(f.book,(panel,options)=>{calls.push({panel,options});return {ready:calls.length===1?first:Promise.resolve({connected:true})};});
 const pending=connect(bindings);assert.equal(calls.length,1);assert.equal(calls[0].panel,f.book.figures[0].objects[0]);assert.deepEqual(calls[0].options,{figureId:'figure-plot'});
 resolveFirst({connected:true});await pending;
 assert.equal(calls.length,2);assert.equal(calls[1].panel,f.book.figures[1].objects[0]);assert.deepEqual(calls[1].options,{figureId:'figure-mifito'});
});

test('reconnect skips detached or stale targets and propagates connection failures',async()=>{
 const f=fixture(),bindings=await savedEditorBindings(f.decoded,f.book,f.loaded),calls=[];
 const connect=connectHelper(f.book,panel=>{calls.push(panel);return {ready:Promise.resolve({connected:false})};});
 await assert.rejects(connect(bindings),/接続できません/);assert.equal(calls.length,1);
 calls.length=0;bindings.plot.editKey='another-book/figure-plot/panel-plot/project-plot';bindings.mifito=null;
 await connect(bindings);assert.deepEqual(calls,[]);
 const rejected=connectHelper(f.book,()=>({ready:Promise.reject(Error('transport closed'))}));
 bindings.plot=f.decoded.editors.plot.binding;await assert.rejects(rejected(bindings),/transport closed/);
});
