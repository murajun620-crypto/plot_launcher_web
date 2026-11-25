import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createProjectWorkFolders,isProjectFolder} from '../work-folder.mjs';
import {createSourcePrefetch} from '../source-prefetch.mjs';

const directory=name=>({kind:'directory',name,getFileHandle(){assert.fail('UI must only select the folder');}});
const deferred=()=>{let resolve;return {promise:new Promise(ok=>resolve=ok),resolve};};
const picked=handle=>({handle,followProject:false});
const parent=handle=>({handle,followProject:true});

test('multiple folders are cached and stored per book with legacy single-folder support',async()=>{
 const first=directory('sample A'),second=directory('sample B'),storage=new Map(),loads=[];
 storage.set('b',second);
 const adapter={load:async id=>{loads.push(id);return storage.get(id);},store:async(id,handle)=>{if(handle)storage.set(id,handle);else storage.delete(id);}};
 const settings=createProjectWorkFolders(adapter);
 assert.deepEqual(await settings.getSelections('a'),[]);
 assert.deepEqual(await settings.getSelections('a'),[]);
 assert.deepEqual(loads,['a']);
 assert.equal(await settings.setSelections('a',[picked(first),picked(second)]),true);
 const reopened=createProjectWorkFolders(adapter);
 assert.deepEqual(await reopened.getSelections('a'),[picked(first),picked(second)]);
 assert.deepEqual(await reopened.getSelections('b'),[picked(second)]);
 assert.equal(await reopened.setSelections('a',null),true);
 assert.deepEqual(await reopened.getSelections('a'),[]);
 assert.equal(storage.has('a'),false);
 assert.equal(storage.get('b'),second);
});

test('local state follows the latest user change while persistent writes finish in order',async()=>{
 const oldRead=deferred(),firstWrite=deferred(),first=directory('sample A'),calls=[];
 const settings=createProjectWorkFolders({load:()=>oldRead.promise,store:(id,handle)=>{
  calls.push([id,handle]);
  if(handle)return firstWrite.promise;
 }});
 const loading=settings.getSelections('book');
 const choose=settings.setSelections('book',[picked(first)]),clear=settings.setSelections('book',null);
 assert.deepEqual(await settings.getSelections('book'),[]);
 assert.deepEqual(calls,[['book',[picked(first)]]]);
 oldRead.resolve(directory('earlier'));await loading;
 firstWrite.resolve();assert.deepEqual(await Promise.all([choose,clear]),[true,true]);
 assert.deepEqual(calls,[['book',[picked(first)]],['book',null]]);
 assert.deepEqual(await settings.getSelections('book'),[]);
});

test('local storage errors leave the current tab usable',async()=>{
 const handle=directory('sample A'),fail=()=>{throw Error('unavailable');};
 const settings=createProjectWorkFolders({load:fail,store:fail});
 assert.deepEqual(await settings.getSelections('book'),[]);
 assert.equal(await settings.setSelections('book',[picked(handle)]),false);
 assert.deepEqual(await settings.getSelections('book'),[picked(handle)]);
});

test('default uses the exact project parent inside a previously granted directory',async()=>{
 const layout={kind:'file',name:'figure.figurestudio'},folder=directory('current experiment'),calls=[];
 const granted={...directory('research'),async resolve(file){assert.equal(file,layout);return ['current experiment',layout.name];},
  async getDirectoryHandle(name){calls.push(name);return folder;}};
 const settings=createProjectWorkFolders({load:async()=>null,loadKnown:async()=>[granted]});
 assert.deepEqual(await settings.getSelections('book',layout),[parent(folder)]);
 assert.deepEqual(await settings.getSelections('book',layout),[parent(folder)]);
 assert.deepEqual(calls,['current experiment']);
});

test('changing the Studio file invalidates a derived default and leaves a chosen override active until reset',async()=>{
 const one={kind:'file',name:'one.figurestudio'},two={kind:'file',name:'two.figurestudio'};
 const first={...directory('old parent'),async resolve(file){return file===one?[file.name]:null;}};
 const second={...directory('new parent'),async resolve(file){return file===two?[file.name]:null;}};
 const alternate=directory('explicit folder');
 const settings=createProjectWorkFolders({load:async()=>({handle:first,followProject:true}),loadKnown:async()=>[first,second],store:async()=>{}});
 assert.deepEqual(await settings.getSelections('book',one),[parent(first)]);
 assert.deepEqual(await settings.getSelections('book',two),[parent(second)]);
 await settings.setSelections('book',[parent(first),picked(alternate)]);
 assert.deepEqual(await settings.getSelections('book',one),[parent(first),picked(alternate)]);
 assert.deepEqual(await settings.getSelections('book',two),[parent(second),picked(alternate)]);
 await settings.setSelections('book',[picked(alternate)]);
 assert.deepEqual(await settings.getSelections('book',two),[picked(alternate)]);
 await settings.setSelections('book',[]);
 assert.deepEqual(await settings.getSelections('book',two),[]);
 await settings.setSelections('book',null);
 assert.deepEqual(await settings.getSelections('book',two),[parent(second)]);
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
 const previous=settings.getSelections('book',old);
 await began.promise;
 assert.deepEqual(await settings.getSelections('book',next),[parent(newFolder)]);
 blocked.resolve([old.name]);
 assert.deepEqual(await previous,[]);
 assert.deepEqual(await settings.getSelections('book',next),[parent(newFolder)]);
});

const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
const uiCode=source.slice(source.indexOf('const workFolders=createProjectWorkFolders()'),source.indexOf('function updateProjectFileUI()'));
const editCode=source.slice(source.indexOf('function editSource(o,'),source.indexOf('function buildExport('));
const element=()=>({children:[],append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},setAttribute(name,value){this[name]=value;}});
function workspaceUI({saved=null,known=[],figures=[],scan=async()=>new Map(),committed=true}={}){
 const bookFolder=directory('measurements'),studioFile={kind:'file',name:'layout.figurestudio'},nodes=new Map(),calls=[],messages=[];
 const nextFolders=[],window={parent:{async showDirectoryPicker(options){calls.push(options);return nextFolders.shift()??bookFolder;}}};
 const env={window,document:{createElement:element},$:selector=>{if(!nodes.has(selector))nodes.set(selector,element());return nodes.get(selector);},bookId:'book',projectSaving:false,projectOpening:false,startupRestoring:false,updateReloading:false,
  createProjectWorkFolders:()=>createProjectWorkFolders({load:async()=>saved,loadKnown:async()=>known,store:async(id,folders)=>calls.push({id,folders})}),
  createSourcePrefetch,findProjectsInWorkFolder:scan,readMifitoIdentity(){},figures,revision:0,
  getFigureWorkspace:()=>({}),isProjectFolder,projectFiles:{target:()=>committed?{handle:studioFile}:null},toast:message=>messages.push(message),
  doc:figures[0],assets:new Map(figures.flatMap(f=>f.objects.map(({source})=>[source.assetId,{dataUrl:'embedded'}]))),
  location:{hostname:'example.com'},sourceEditKey:(...parts)=>parts.join('/'),dataURLToBlob:()=>new Blob(['embedded']),
  bridge:null,openSource:()=>({ready:Promise.resolve({connected:true})})};
 const ui=Function(...Object.keys(env),uiCode+editCode+`return {
  chooseProjectWorkFolder,setupProjectWorkFolder,clearProjectWorkFolder,allowProjectWorkFolder,updateProjectWorkFolderUI,editSource,
  switchBook(id){bookId=id;updateProjectWorkFolderUI();},
  stageProject(handle){pendingWorkFolderFile={bookId,handle};projectOpening=true;updateProjectWorkFolderUI();}
 };`)(...Object.values(env));
 return {ui,provider:window.FigureStudioWorkFolder,bookFolder,studioFile,nodes,calls,messages,nextFolders};
}

test('Studio opens a read/write folder picker on demand and publishes selections to the attached editor',async()=>{
 const {ui,provider,bookFolder,studioFile,nodes,calls}=workspaceUI();
 const notices=[],unsubscribe=provider.subscribe(()=>notices.push('changed'));
 ui.updateProjectWorkFolderUI();
 assert.equal(await provider.getDirectory('book'),null);
 assert.equal(nodes.get('#workFolderStatusName').textContent,'未設定');
 assert.equal(nodes.get('#workFolderStatusSetup').hidden,false);
 await ui.setupProjectWorkFolder();
 assert.deepEqual(calls,[{id:'figure-studio-work-folder',mode:'readwrite',startIn:studioFile},{id:'book',folders:[picked(bookFolder)]}]);
 assert.equal(await provider.getDirectory('book'),bookFolder);
 assert.match(nodes.get('#projectWorkFolder').textContent,/measurements/);
 assert.equal(nodes.get('#workFolderStatusName').textContent,'measurements');
 assert.equal(nodes.get('#workFolderStatusSetup').textContent,'追加…');
 assert.match(nodes.get('#workFolderStatus').title,/作業フォルダ.*measurements/);
 await ui.clearProjectWorkFolder();
 assert.equal(await provider.getDirectory('book'),null);
 assert.equal(nodes.get('#workFolderStatusName').textContent,'未設定');
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
 assert.equal(await provider.getDirectory('book'),null);
 const buttons=()=>nodes.get('#projectWorkFolderList').children[0].children.slice(1).map(button=>button.textContent);
 assert.deepEqual(buttons(),['許可…','外す']);
 assert.equal(nodes.get('#workFolderStatusSetup').textContent,'許可…');
 assert.match(nodes.get('#workFolderStatusName').textContent,/アクセス許可が必要/);
 assert.deepEqual(permissions,[['query',{mode:'readwrite'}],['query',{mode:'read'}]]);
 await ui.setupProjectWorkFolder();
 assert.deepEqual(permissions,[['query',{mode:'readwrite'}],['query',{mode:'read'}],['request',{mode:'readwrite'}]]);
 assert.deepEqual(calls,[]);
 assert.deepEqual(buttons(),['外す']);
 assert.equal(await provider.getDirectory('book'),saved);
 assert.deepEqual(notices,['changed','changed']);
 assert.match(messages[0],/許可されました/);
});

test('folders can be added and removed without reading originals; the editor searches the selected folders on demand',async()=>{
 const plot={app:'plot',projectId:'plot-project',name:'profile.plotproject',assetId:'plot-asset'};
 const mifito={app:'mifito',projectId:'image-project',name:'images.mifito',assetId:'mifito-asset'};
 const figures=[{id:'figure',objects:[{id:'graph',source:plot},{id:'image',source:mifito}]}];
 const scans=[];
 const extra=directory('archives');
 const {ui,provider,bookFolder,studioFile,nodes,calls,nextFolders}=workspaceUI({figures,scan:async details=>{
  scans.push(details);
  return new Map(details.requests.map(({key,name})=>[key,{kind:'file',name}]));
 }});
 const findPlot=()=>provider.findSource({sourceKey:'book/figure/graph/plot-asset',...plot});
 const findMiFiTo=()=>provider.findSource({sourceKey:'book/figure/image/mifito-asset',...mifito});
 assert.deepEqual(await Promise.all([findPlot(),findMiFiTo()]),[null,null]);
 assert.equal(scans.length,0);
 assert.equal(nodes.get('#workFolderStatusName').textContent,'未設定');
 assert.match(nodes.get('#projectWorkFolderHelp').textContent,/このPC/);

 await ui.setupProjectWorkFolder();
 assert.deepEqual(calls[0],{id:'figure-studio-work-folder',mode:'readwrite',startIn:studioFile});
 nextFolders.push(extra);
 await ui.chooseProjectWorkFolder();
 assert.deepEqual(await Promise.all([findPlot(),findMiFiTo()]),[null,null]);
 assert.equal(scans.length,0);
 assert.equal(nodes.get('#workFolderStatusName').textContent,'2件');
 assert.match(nodes.get('#workFolderStatus').title,/archives/);
 ui.editSource(figures[0].objects[0]);
 assert.deepEqual(await findPlot(),{kind:'file',name:plot.name});
 assert.equal(await findMiFiTo(),null);
 assert.equal(scans.length,1);
 assert.deepEqual(scans[0].directories,[bookFolder,extra]);
 assert.deepEqual(scans[0].requests.map(request=>request.name),[plot.name]);
 ui.editSource(figures[0].objects[1]);
 assert.deepEqual(await findMiFiTo(),{kind:'file',name:mifito.name});
 assert.deepEqual(scans[1].requests.map(request=>request.name),[mifito.name]);

 const [row]=nodes.get('#projectWorkFolderList').children;
 await row.children.at(-1).onclick();
 assert.deepEqual(await Promise.all([findPlot(),findMiFiTo()]),[null,null]);
 assert.equal(scans.length,2);
 assert.equal(await provider.getDirectory('book'),extra);
 assert.equal(nodes.get('#workFolderStatusName').textContent,'archives');
});

test('restoring a Studio file and reconnecting a saved editor leaves its original offline until explicitly opened',async()=>{
 const granted={...directory('experiment'),async resolve(file){return [file.name];}};
 const source={app:'mifito',projectId:'image-project',name:'images.mifito',assetId:'attached'};
 const figures=[{id:'figure',objects:[{id:'panel',source}]}];
 const started=deferred(),finish=deferred(),found={kind:'file',name:source.name};
 const {ui,provider,studioFile,nodes}=workspaceUI({committed:false,known:[granted],figures,scan:details=>{
  started.resolve(details);return finish.promise;
 }});
 ui.updateProjectWorkFolderUI();
 await provider.getDirectory('book');
 assert.equal(nodes.get('#workFolderStatusName').textContent,'未設定');
 ui.stageProject(studioFile);
 assert.equal(await provider.getDirectory('book'),granted);
 const request={sourceKey:'book/figure/panel/attached',...source};
 ui.editSource(figures[0].objects[0],{lookupOriginal:false});
 assert.equal(await provider.findSource(request),null);
 assert.equal(nodes.get('#workFolderStatusName').textContent,'experiment');
 assert.equal(nodes.get('#projectWorkFolderList').children[0].children[0].textContent,'experiment（既定）');
 ui.editSource(figures[0].objects[0]);
 const original=provider.findSource(request);
 const {directories:scanned,requests}=await started.promise;
 assert.deepEqual(scanned,[granted]);
 assert.equal(requests[0].projectId,source.projectId);
 finish.resolve(new Map([[requests[0].key,found]]));
 assert.equal(await original,found);
});
