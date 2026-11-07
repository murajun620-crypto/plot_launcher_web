import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {ProjectFileSession,projectFilePickerOptions} from '../project-file.mjs';

const blob=new Blob(['figure project']);
function handle(name,{permission='granted',request='granted',failWrite=false,failClose=false,barrier}={}){
  const calls=[];
  return {name,calls,async queryPermission(options){calls.push(['query',options]);return permission;},async requestPermission(options){calls.push(['permission',options]);return request;},async createWritable(){calls.push(['open']);return {async write(value){calls.push(['write',value]);if(barrier)await barrier;if(failWrite)throw Error('write failed');},async close(){calls.push(['close']);if(failClose)throw Error('close failed');},async abort(){calls.push(['abort']);}};}};
}
test('first save chooses a file, subsequent saves overwrite it, Save As chooses another',async()=>{
  const first=handle('first.figurestudio'),second=handle('second.figurestudio'),pickers=[];
  const files=new ProjectFileSession({host:{async showSaveFilePicker(options){pickers.push(options);return pickers.length===1?first:second;}}});
  assert.deepEqual(await files.save({bookId:'book',revision:2,blob,name:'Figure 1.figurestudio'}),{bookId:'book',revision:2,handle:first,name:first.name});
  await files.save({bookId:'book',revision:3,blob,name:'renamed.figurestudio'});
  assert.equal(pickers.length,1);assert.equal(first.calls.filter(([kind])=>kind==='write').length,2);
  await files.save({bookId:'book',revision:4,blob,name:'ignored.figurestudio',saveAs:true});
  assert.equal(pickers.length,2);assert.equal(pickers[1].startIn,first);assert.equal(files.target('book').handle,second);
});
test('native-open handle overwrites; a new book has no inherited target and old book can return',async()=>{
  const original=handle('opened.figurestudio'),fresh=handle('new.figurestudio');let picks=0;
  const files=new ProjectFileSession({host:{async showSaveFilePicker(){picks++;return fresh;}}});
  files.opened('original',{handle:original,name:original.name});
  await files.save({bookId:'original',revision:1,blob,name:'fallback.figurestudio'});assert.equal(picks,0);
  await files.save({bookId:'new',revision:2,blob,name:'new.figurestudio'});assert.equal(picks,1);
  assert.equal(files.target('original').handle,original);assert.equal(files.target('new').handle,fresh);
  files.opened('original',{name:'downloaded.figurestudio'});assert.equal(files.target('original').handle,null);
});
test('cancelled or failed Save As keeps the original target, aborts a failed write',async()=>{
  const original=handle('original.figurestudio'),failed=handle('failed.figurestudio',{failClose:true});let cancel=true;
  const files=new ProjectFileSession({host:{async showSaveFilePicker(){if(cancel)throw new DOMException('cancelled','AbortError');return failed;}}});
  files.opened('book',{handle:original,name:original.name});
  await assert.rejects(files.save({bookId:'book',revision:2,blob,saveAs:true}),{name:'AbortError'});assert.equal(files.target('book').handle,original);
  cancel=false;await assert.rejects(files.save({bookId:'book',revision:2,blob,saveAs:true}),/close failed/);
  assert.equal(files.target('book').handle,original);assert.equal(failed.calls.at(-1)[0],'abort');
});
test('permission refusal leaves the original file untouched',async()=>{
  const original=handle('protected.figurestudio',{permission:'prompt',request:'denied'}),files=new ProjectFileSession();
  files.opened('book',{handle:original,name:original.name});
  await assert.rejects(files.save({bookId:'book',revision:1,blob}),/名前を付けて保存/);
  assert.deepEqual(original.calls.map(([kind])=>kind),['query','permission']);assert.equal(files.target('book').handle,original);
});
test('completion describes the captured book and revision after an asynchronous write',async()=>{
  let release;const barrier=new Promise(resolve=>release=resolve),target=handle('book.figurestudio',{barrier});
  const files=new ProjectFileSession({host:{async showSaveFilePicker(){return target;}}});
  const saving=files.save({bookId:'captured-book',revision:7,blob,name:target.name});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(files.target('captured-book'),null);
  release();const saved=await saving;assert.equal(saved.bookId,'captured-book');assert.equal(saved.revision,7);
});
test('unsupported browsers download and retain a name without a writable handle',async()=>{
  const downloads=[],files=new ProjectFileSession({host:{},fallback:(value,name)=>downloads.push({value,name})});
  await files.save({bookId:'book',revision:1,blob,name:'Figure.figurestudio'});
  assert.deepEqual(downloads,[{value:blob,name:'Figure.figurestudio'}]);assert.equal(files.target('book').handle,null);
  assert.deepEqual(projectFilePickerOptions({open:true}).types[0].accept['application/json'],['.figurestudio','.json']);
});

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
function saveUI(files){
  const state={projectFiles:files,projectSaving:false,projectOpening:false,updateReloading:false,gesture:null,editingId:null,bookId:'book',revision:5,dirty:true,manualSavedRevision:-1,figures:[{name:'Figure 1'}],Blob,
    finishText(){},updateProjectFileUI(){},async saveProjectFileTarget(){},safeName:name=>name,packageProject:()=>({id:state.bookId,revision:state.revision}),toast(){},document:{activeElement:null},svg:{focus(){}}};
  vm.createContext(state);vm.runInContext(app.slice(app.indexOf('async function saveProject('),app.indexOf('async function openProject(')),state);return state;
}
test('save UI clears dirty only after successful completion of the same revision',async()=>{
  let release;const target=handle('saved.figurestudio',{barrier:new Promise(resolve=>release=resolve)});
  const state=saveUI(new ProjectFileSession({host:{async showSaveFilePicker(){return target;}}}));
  const saving=state.saveProject();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(state.dirty,true);assert.equal(state.projectSaving,true);release();await saving;
  assert.equal(state.dirty,false);assert.equal(state.manualSavedRevision,5);assert.equal(state.projectSaving,false);
});
test('edits and pending text entered during a file write remain unsaved',async()=>{
  for(const change of [state=>{state.revision++;},state=>{state.editingId='new-text';}]){
    let release;const target=handle('saved.figurestudio',{barrier:new Promise(resolve=>release=resolve)});
    const state=saveUI(new ProjectFileSession({host:{async showSaveFilePicker(){return target;}}}));
    const saving=state.saveProject();await new Promise(resolve=>setImmediate(resolve));change(state);release();await saving;
    assert.equal(state.dirty,true);assert.equal(state.manualSavedRevision,-1);
  }
});
test('finishing an old book save never changes the active book clean state or target',async()=>{
  let release;const target=handle('saved.figurestudio',{barrier:new Promise(resolve=>release=resolve)}),files=new ProjectFileSession({host:{async showSaveFilePicker(){return target;}}}),state=saveUI(files);
  const saving=state.saveProject();await new Promise(resolve=>setImmediate(resolve));state.bookId='new-book';state.dirty=false;release();await saving;
  assert.equal(state.dirty,false);assert.equal(state.manualSavedRevision,-1);assert.equal(files.target('new-book'),null);assert.equal(files.target('book').handle,target);
});
test('unavailable handle persistence does not turn a successful file write into a failure',async()=>{
  const target=handle('saved.figurestudio'),files=new ProjectFileSession({host:{async showSaveFilePicker(){return target;}}}),state=saveUI(files);
  state.saveProjectFileTarget=async()=>{throw new DOMException('cannot clone handle','DataCloneError');};
  await state.saveProject();assert.equal(state.dirty,false);assert.equal(state.manualSavedRevision,5);assert.equal(files.target('book').handle,target);
});
