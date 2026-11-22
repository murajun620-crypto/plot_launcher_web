import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sourceSaveMessage} from '../source-project-save.mjs';

import {encodeProjectFile} from '../project-format.mjs';

const source=await readFile(new URL('../app.js',import.meta.url),'utf8'),a=source.indexOf('async function saveProject(saveAs=false)'),b=source.indexOf('async function openProject()',a),body=source.slice(a,b);
function fixture({enabled=true,workspace=true,sourceError,studioError,afterError,studioOnly=false}={}){
 const events=[],messages=[],receipts=[{app:'plot',name:'graph.plotproject'},{app:'mifito',name:'images.mifito'}];let nativeSaved=false,blob=null;
 const api={async prepareSourceProjectSaves(){events.push('source-prepare');if(studioOnly)return null;return {async write(){events.push('source-write');if(sourceError)throw sourceError;nativeSaved=true;return receipts;},cancel(){events.push('source-release');}};},async captureWorkspace(){events.push('workspace-capture');return {data:{sourceFilesSaved:nativeSaved,unreflected:'latest edits'},signatures:new Map()};},async markWorkspaceSaved(){events.push('workspace-mark');if(afterError)throw afterError;return true;}};
 const env={projectSaving:false,projectOpening:false,updateReloading:false,gesture:null,endGesture(){},finishText(){},bookId:'book-one',updateProjectFileUI(){events.push('ui');},figures:[{name:'Figure 1'}],safeName:value=>value,projectFiles:{async prepare(){events.push('studio-target');return {bookId:'book-one',target:{name:'book.figurestudio'}};},async write(_target,snapshot){events.push('studio-write');if(studioError)throw studioError;blob=snapshot.blob;return {bookId:'book-one',name:'book.figurestudio',handle:{},revision:snapshot.revision};}},transferQueue:Promise.resolve(),revision:3,encodeProjectFile,workspacePersistence:()=>workspace?api:null,saveSourceOption:{checked:enabled},toast:message=>messages.push(message),packageProject:()=>({format:'fixture-project',assets:{}}),saveProjectFileTarget:async()=>events.push('studio-target-remember'),preservedWorkspace:null,dirty:true,manualSavedRevision:null,editingId:null,document:{activeElement:null},svg:{focus(){}},sourceSaveMessage};
 const keys=Object.keys(env),compiled=Function(...keys,body+'return {save:saveProject,state:()=>({projectSaving,dirty,manualSavedRevision,preservedWorkspace})};')(...keys.map(key=>env[key]));
 return {...compiled,events,messages,receipts,get blob(){return blob;}};
}
test('Studio Ctrl+S saves both native sources then embeds their latest state in the Studio project',async()=>{
 const f=fixture();await f.save();assert.ok(f.events.indexOf('studio-target')<f.events.indexOf('source-prepare'));assert.ok(f.events.indexOf('source-prepare')<f.events.indexOf('source-write'));assert.ok(f.events.indexOf('source-write')<f.events.indexOf('workspace-capture'));assert.ok(f.events.indexOf('workspace-capture')<f.events.indexOf('studio-write'));
 const saved=JSON.parse(await f.blob.text());assert.equal(saved.workspace.sourceFilesSaved,true);assert.equal(saved.workspace.unreflected,'latest edits');assert.equal(f.state().dirty,false);assert.equal(f.state().projectSaving,false);assert.match(f.messages.at(-1),/graph.plotproject/);assert.match(f.messages.at(-1),/images.mifito/);
});
test('Studio-only preference and Save As leave the source projects untouched',async()=>{
 for(const options of [{enabled:false},{enabled:true,saveAs:true}]){const f=fixture(options);await f.save(options.saveAs);assert.equal(f.events.includes('source-write'),false);assert.equal(f.events.includes('studio-write'),true);assert.equal(JSON.parse(await f.blob.text()).workspace.sourceFilesSaved,false);}
});
test('choosing Studio only during source preparation retains the unsent editor changes',async()=>{
 const f=fixture({studioOnly:true});await f.save();
 assert.equal(f.events.includes('source-prepare'),true);assert.equal(f.events.includes('source-write'),false);
 const saved=JSON.parse(await f.blob.text());
 assert.equal(saved.workspace.sourceFilesSaved,false);assert.equal(saved.workspace.unreflected,'latest edits');
 assert.equal(f.state().projectSaving,false);assert.match(f.messages.at(-1),/元ファイルの保存は保留/);
});
test('a source error stops Studio saving and reports exactly the already written native files',async()=>{
 const error=Error('MiFiTo disk full');error.savedSourceProjects=[{app:'plot',name:'graph.plotproject'}];const f=fixture({sourceError:error});await f.save();assert.equal(f.events.includes('studio-write'),false);assert.equal(f.events.includes('workspace-mark'),false);assert.equal(f.state().dirty,true);assert.equal(f.state().projectSaving,false);assert.equal(f.events.at(-2),'source-release');assert.match(f.messages.at(-1),/graph.plotproject/);assert.match(f.messages.at(-1),/Studioのプロジェクトは保存されていません/);assert.doesNotMatch(f.messages.at(-1),/images.mifito/);
});
test('cancelling source selection never writes Studio or falsely marks an editor saved',async()=>{
 const f=fixture({sourceError:new DOMException('cancel','AbortError')});await f.save();assert.equal(f.events.includes('studio-write'),false);assert.equal(f.events.includes('workspace-capture'),false);assert.equal(f.events.includes('workspace-mark'),false);assert.match(f.messages.at(-1),/キャンセル/);assert.equal(f.state().projectSaving,false);
});
test('a Studio write failure preserves correct source receipts and keeps the book unsaved',async()=>{
 const f=fixture({studioError:Error('Studio disk full')});await f.save();assert.equal(f.events.includes('source-write'),true);assert.equal(f.events.includes('workspace-mark'),false);assert.equal(f.state().dirty,true);assert.equal(f.state().projectSaving,false);assert.match(f.messages.at(-1),/graph.plotproject/);assert.match(f.messages.at(-1),/images.mifito/);assert.match(f.messages.at(-1),/Studioのプロジェクトは保存されていません/);
});
test('a post-write bookkeeping failure never claims the Studio file was not saved',async()=>{
 const f=fixture({afterError:Error('bookkeeping failed')});await f.save();assert.ok(f.blob);assert.match(f.messages.at(-1),/Studioのファイルは保存しました/);assert.doesNotMatch(f.messages.at(-1),/Studioのプロジェクトは保存されていません/);assert.equal(f.state().projectSaving,false);
});
test('standalone Studio saving still works without creating extra editor windows',async()=>{
 const f=fixture({workspace:false});await f.save();assert.equal(f.events.includes('source-prepare'),false);assert.equal(f.events.includes('workspace-capture'),false);assert.ok(f.blob);assert.equal(f.state().dirty,false);
});
