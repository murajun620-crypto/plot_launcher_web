import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateWorkspaceBinding} from '../integration/bridge-host.mjs';
import {dataURLToBlob} from '../assets.mjs';

// Run the actual app helpers without initializing Studio's canvas or browser storage.
const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
function section(start,end){const at=source.indexOf(start);assert.ok(at>=0,start);const until=source.indexOf(end,at);assert.ok(until>at,end);return source.slice(at,until);}
const keySource=section('function sourceEditKey(','const mifitoIdentities=');
const savedEditorBindings=Function('validateWorkspaceBinding','dataURLToBlob',keySource+section('async function savedEditorBindings(','async function connectSavedEditors(')+'return savedEditorBindings;')(validateWorkspaceBinding,dataURLToBlob);
function connectHelper(book,editSource){return Function('figures','bookId','editSource',keySource+section('async function connectSavedEditors(','async function readProject(')+'return connectSavedEditors;')(book.figures,book.id,editSource);}
const dataURL=bytes=>`data:application/octet-stream;base64,${Buffer.from(bytes).toString('base64')}`;

function fixture(){
 const book={id:'book-a',figures:[{id:'figure-plot',objects:[{id:'panel-plot',source:{app:'plot',assetId:'project-plot',name:'renamed.plotproject'}}]},{id:'figure-mifito',objects:[{id:'panel-mifito',source:{app:'mifito',assetId:'project-mifito',name:'renamed.mifito'}}]}]};
 const loaded=new Map(),editors={};
 for(const app of ['plot','mifito']){
  const bytes=app==='plot'?'plot-baseline':'mifito-baseline';
  loaded.set(`project-${app}`,{name:'same-name',dataUrl:dataURL(bytes)});
  editors[app]={binding:{version:1,app,panelId:`panel-${app}`,editKey:`book-a/figure-${app}/panel-${app}/project-${app}`,baselineProject:new Blob([bytes]),sourceName:'old-name',...(app==='mifito'?{imageId:'image-a'}:{})}};
 }
 return {book,loaded,decoded:{editors}};
}

test('saved bindings require exact reflected bytes and use the actual attached project and current name',async()=>{
 const {book,loaded,decoded}=fixture(),bindings=await savedEditorBindings(decoded,book,loaded);
 for(const app of ['plot','mifito']){
  assert.equal(bindings[app].editKey,decoded.editors[app].binding.editKey);
  assert.equal(await bindings[app].baselineProject.text(),`${app}-baseline`);
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
