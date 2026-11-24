import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createProjectFileLinks} from '../../project-file-links.mjs';

const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const pickCode=app.slice(app.indexOf('async function pickSourceProject('),app.indexOf("$('#sourceInput').addEventListener('change'"));
const keyCode=app.slice(app.indexOf('function sourceEditKey('),app.indexOf('const mifitoIdentities='));

test('choosing a native file for a Studio image remembers that exact file for the editor',async()=>{
 const file=new File(['the attached project'],'shared.plotproject');
 const handle={kind:'file',name:file.name,async getFile(){return file;}};
 const records=new Map(),store={async get(key){return records.get(key);},async list(key){return [...records.values()].filter(value=>value.project===key);},async put(value){records.set(value.token,value);}};
 const projectId='plot-source-id',createLinks=options=>createProjectFileLinks({...options,store});
 const panel={id:'panel',type:'image'},assets=new Map(),messages=[],studioHandle={kind:'file',name:'layout.figurestudio'};
 const env={bookId:'book',doc:{id:'figure',objects:[panel]},assets,change:fn=>fn(),toast:message=>messages.push(message),uid:()=> 'asset',projectFiles:{target:()=>({handle:studioHandle})},window:{
  async showOpenFilePicker({startIn}){assert.equal(startIn,studioHandle);return [handle];}
 },createProjectFileLinks:createLinks,readPlotIdentity:async()=>({projectId}),openedPlotIdentity:identity=>identity,blobToDataURL:async()=> 'data:application/octet-stream;base64,dGVzdA=='};
 const pick=Function(...Object.keys(env),pickCode+keyCode+'return pickSourceProject;')(...Object.values(env));
 await pick(panel);
 assert.deepEqual(panel.source,{app:'plot',name:file.name,assetId:'asset'});
 assert.equal(assets.get('asset').name,file.name);
 assert.match(messages[0],/保存先を記憶/);
 const editor=createLinks({app:'plot'});
 const reopened=await editor.opened({file,projectId,sourceKey:'book/figure/panel/asset',embedded:true});
 assert.equal(reopened.handle,handle);
});
