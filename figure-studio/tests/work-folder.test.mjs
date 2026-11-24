import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createProjectWorkFolders,isProjectFolder} from '../work-folder.mjs';

const directory=name=>({kind:'directory',name,getFileHandle(){assert.fail('UI must only select the folder');}});
const deferred=()=>{let resolve;return {promise:new Promise(ok=>resolve=ok),resolve};};

test('folder selections are cached and stored per book',async()=>{
 const first=directory('sample A'),second=directory('sample B'),storage=new Map(),loads=[];
 const adapter={load:async id=>{loads.push(id);return storage.get(id);},store:async(id,handle)=>{if(handle)storage.set(id,handle);else storage.delete(id);}};
 const settings=createProjectWorkFolders(adapter);
 assert.equal(await settings.getDirectory('a'),null);
 assert.equal(await settings.getDirectory('a'),null);
 assert.deepEqual(loads,['a']);
 assert.equal(await settings.setDirectory('a',first),true);
 assert.equal(await settings.setDirectory('b',second),true);
 const reopened=createProjectWorkFolders(adapter);
 assert.equal(await reopened.getDirectory('a'),first);
 assert.equal(await reopened.getDirectory('b'),second);
 assert.equal(await reopened.setDirectory('a',null),true);
 assert.equal(await reopened.getDirectory('a'),null);
 assert.equal(storage.has('a'),false);
 assert.equal(storage.get('b'),second);
});

test('local state follows the latest user change while persistent writes finish in order',async()=>{
 const oldRead=deferred(),firstWrite=deferred(),first=directory('sample A'),calls=[];
 const settings=createProjectWorkFolders({load:()=>oldRead.promise,store:(id,handle)=>{
  calls.push([id,handle]);
  if(handle)return firstWrite.promise;
 }});
 const loading=settings.getDirectory('book');
 const choose=settings.setDirectory('book',first),clear=settings.setDirectory('book',null);
 assert.equal(await settings.getDirectory('book'),null);
 assert.deepEqual(calls,[['book',first]]);
 oldRead.resolve(directory('earlier'));await loading;
 firstWrite.resolve();assert.deepEqual(await Promise.all([choose,clear]),[true,true]);
 assert.deepEqual(calls,[['book',first],['book',null]]);
 assert.equal(await settings.getDirectory('book'),null);
});

test('local storage errors leave the current tab usable',async()=>{
 const handle=directory('sample A'),fail=()=>{throw Error('unavailable');};
 const settings=createProjectWorkFolders({load:fail,store:fail});
 assert.equal(await settings.getDirectory('book'),null);
 assert.equal(await settings.setDirectory('book',handle),false);
 assert.equal(await settings.getDirectory('book'),handle);
});

test('default uses the exact project parent inside a previously granted directory',async()=>{
 const layout={kind:'file',name:'figure.figurestudio'},parent=directory('current experiment'),calls=[];
 const granted={...directory('research'),async resolve(file){assert.equal(file,layout);return ['current experiment',layout.name];},
  async getDirectoryHandle(name){calls.push(name);return parent;}};
 const settings=createProjectWorkFolders({load:async()=>null,loadKnown:async()=>[granted]});
 assert.deepEqual(await settings.getSelection('book',layout),{handle:parent,followProject:true});
 assert.equal(await settings.getDirectory('book',layout),parent);
 assert.deepEqual(calls,['current experiment']);
});

test('changing the Studio file invalidates a derived default and leaves a chosen override active until reset',async()=>{
 const one={kind:'file',name:'one.figurestudio'},two={kind:'file',name:'two.figurestudio'};
 const first={...directory('old parent'),async resolve(file){return file===one?[file.name]:null;}};
 const second={...directory('new parent'),async resolve(file){return file===two?[file.name]:null;}};
 const alternate=directory('explicit folder');
 const settings=createProjectWorkFolders({load:async()=>({handle:first,followProject:true}),loadKnown:async()=>[first,second],store:async()=>{}});
 assert.equal(await settings.getDirectory('book',one),first);
 assert.equal(await settings.getDirectory('book',two),second);
 await settings.setDirectory('book',alternate);
 assert.equal(await settings.getDirectory('book',one),alternate);
 assert.equal(await settings.getDirectory('book',two),alternate);
 await settings.setDirectory('book',null);
 assert.equal(await settings.getDirectory('book',two),second);
});

test('a lookup started for the previous Studio file cannot replace its new default',async()=>{
 const old={kind:'file',name:'old.figurestudio'},next={kind:'file',name:'new.figurestudio'};
 const began=deferred(),blocked=deferred();
 const oldFolder={...directory('old'),async resolve(file){
  if(file!==old)return null;
  began.resolve();return blocked.promise;
 }};
 const newFolder={...directory('new'),async resolve(file){return file===next?[file.name]:null;}};
 const settings=createProjectWorkFolders({load:async()=>null,loadKnown:async()=>[oldFolder,newFolder]});
 const previous=settings.getDirectory('book',old);
 await began.promise;
 assert.equal(await settings.getDirectory('book',next),newFolder);
 blocked.resolve([old.name]);
 assert.equal(await previous,null);
 assert.equal(await settings.getDirectory('book',next),newFolder);
});

const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
const uiCode=source.slice(source.indexOf('const workFolders=createProjectWorkFolders()'),source.indexOf('function updateProjectFileUI()'));
function workspaceUI({saved=null}={}){
 const bookFolder=directory('measurements'),studioFile={kind:'file',name:'layout.figurestudio'},nodes=new Map(),calls=[],messages=[];
 const window={parent:{async showDirectoryPicker(options){calls.push(options);return bookFolder;}}};
 const env={window,$:selector=>{if(!nodes.has(selector))nodes.set(selector,{});return nodes.get(selector);},bookId:'book',projectSaving:false,projectOpening:false,startupRestoring:false,updateReloading:false,
  createProjectWorkFolders:()=>createProjectWorkFolders({load:async()=>saved,loadKnown:async()=>[],store:async(id,handle)=>calls.push({id,handle})}),
  getFigureWorkspace:()=>({}),isProjectFolder,projectFiles:{target:()=>({handle:studioFile})},toast:message=>messages.push(message)};
 const ui=Function(...Object.keys(env),uiCode+'return {chooseProjectWorkFolder,clearProjectWorkFolder,allowProjectWorkFolder,updateProjectWorkFolderUI,switchBook:id=>{bookId=id;updateProjectWorkFolderUI();}};')(...Object.values(env));
 return {ui,provider:window.FigureStudioWorkFolder,bookFolder,studioFile,nodes,calls,messages};
}

test('Studio opens a read/write folder picker on demand and publishes selections to the attached editor',async()=>{
 const {ui,provider,bookFolder,studioFile,nodes,calls}=workspaceUI();
 const notices=[],unsubscribe=provider.subscribe(()=>notices.push('changed'));
 ui.updateProjectWorkFolderUI();
 assert.equal(await provider.getDirectory('book'),null);
 await ui.chooseProjectWorkFolder();
 assert.deepEqual(calls,[{id:'figure-studio-work-folder',mode:'readwrite',startIn:studioFile},{id:'book',handle:bookFolder}]);
 assert.equal(await provider.getDirectory('book'),bookFolder);
 assert.match(nodes.get('#projectWorkFolder').textContent,/measurements/);
 await ui.clearProjectWorkFolder();
 assert.equal(await provider.getDirectory('book'),null);
 ui.switchBook('other');
 assert.equal(await provider.getDirectory('book'),null);
 assert.equal(notices.length,4);
 unsubscribe();
 ui.switchBook('book');
 assert.equal(notices.length,4);
});

test('Studio offers a new permission gesture for a remembered folder and publishes the successful grant',async()=>{
 const permissions=[];
 const saved={...directory('remembered'),async queryPermission(options){permissions.push(['query',options]);return 'prompt';},
  async requestPermission(options){permissions.push(['request',options]);return 'granted';}};
 const {ui,provider,nodes,calls,messages}=workspaceUI({saved});
 const notices=[];provider.subscribe(()=>notices.push('changed'));
 ui.updateProjectWorkFolderUI();
 await provider.getDirectory('book');
 await Promise.resolve();
 const allow=nodes.get('[data-action="allow-work-folder"]');
 assert.equal(allow.hidden,false);
 assert.deepEqual(permissions,[['query',{mode:'readwrite'}]]);
 await ui.allowProjectWorkFolder();
 assert.deepEqual(permissions,[['query',{mode:'readwrite'}],['request',{mode:'readwrite'}]]);
 assert.deepEqual(calls,[]);
 assert.equal(allow.hidden,true);
 assert.equal(await provider.getDirectory('book'),saved);
 assert.deepEqual(notices,['changed','changed']);
 assert.match(messages[0],/許可されました/);
});
