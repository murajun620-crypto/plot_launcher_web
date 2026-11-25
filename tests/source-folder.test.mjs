import test from 'node:test';
import assert from 'node:assert/strict';
import {findProjectInWorkFolder,findProjectsInWorkFolder} from '../source-folder.mjs';
import {readMifitoIdentity} from '../figure-studio/integration/mifito-sync.mjs';

const projectId='source-project-123456',otherId='other-project-123456';
function file(name,id=projectId,content='saved'){
  const data=new File([JSON.stringify({projectId:id,content})],name);
  return {kind:'file',name,async getFile(){return data;}};
}
function folder(...children){
  return {kind:'directory',async queryPermission(options){assert.deepEqual(options,{mode:'read'});return 'granted';},async *values(){yield* children;}};
}
function find(directory,options={}){
  return findProjectInWorkFolder({
    directory,app:'plot',name:'source.plotproject',projectId,
    identify:async blob=>JSON.parse(await blob.text()),...options
  });
}

for(const [app,extension] of [['plot','.plotproject'],['mifito','.mifito']]){
  test(`${app}: finds the exact normalized filename and native identity in a subfolder`,async()=>{
    const name='Café'+extension,handle=file(name.normalize('NFD')),differentProject=file(name,otherId);
    const unrelated={...file('other'+extension),async getFile(){assert.fail('Must not read unrelated files');}};
    const found=await find(folder(unrelated,differentProject,folder(handle)),{app,name});
    assert.deepEqual(found,{handle});
  });
}

test('requires matching native identity and consistent application extension',async()=>{
  const directory=folder(file('source.plotproject',otherId),file('source.mifito'));
  assert.equal(await find(directory),null);
  assert.equal(await find(directory,{app:'mifito'}),null);
  assert.equal(await find(directory,{name:'nested/source.plotproject'}),null);
});

test('reads a root candidate once and still checks subfolders for compatibility',async()=>{
  let fileReads=0;
  const candidate=file('source.plotproject');
  const handle={...candidate,async getFile(){fileReads++;return candidate.getFile();}};
  assert.deepEqual(await find(folder(handle,folder(file(handle.name,otherId)))),{handle});
  assert.equal(fileReads,1);
});

test('does not choose between multiple compatible copies in subfolders',async()=>{
  const first=file('source.plotproject'),second=file('source.plotproject',projectId,'changed');
  assert.equal(await find(folder(folder(first),folder(second))),null);
});

test('searches all registered folders but leaves distinct matching copies ambiguous',async()=>{
  const first=folder(file('unrelated.plotproject')),candidate=file('source.plotproject');
  assert.deepEqual(await find(null,{directories:[first,folder(folder(candidate))]}),{handle:candidate});
  assert.equal(await find(null,{directories:[folder(candidate),folder(file(candidate.name))]}),null);
});

test('an overlapping root does not count the same native file twice or open it twice',async()=>{
  const original=file('source.plotproject');
  const entryId=Symbol('native file');
  let reads=0;
  const alias=()=>({...original,entryId,async getFile(){reads++;return original.getFile();},async isSameEntry(other){return other.entryId===entryId;}});
  const entry=alias(),nested=folder(entry);
  assert.deepEqual(await find(null,{directories:[folder(alias()),folder(nested)]}),{handle:entry});
  assert.equal(reads,1);
});

test('does not pick a root file when an identical project also exists in a subfolder',async()=>{
  const root=file('source.plotproject'),copy=file('source.plotproject');
  assert.equal(await find(folder(root,folder(folder(copy)))),null);
});

test('does not prompt for permission during search',async()=>{
  let prompts=0,scans=0;
  const directory={...folder(file('source.plotproject')),async queryPermission(){return 'prompt';},
    async requestPermission(){prompts++;},values(){scans++;}};
  assert.equal(await find(directory),null);
  assert.deepEqual({prompts,scans},{prompts:0,scans:0});
});

test('does not trust an apparent match if another candidate is unreadable',async()=>{
  const candidate=file('source.plotproject');
  const unreadable={...file('source.plotproject'),async getFile(){throw Error('OneDrive file is not available');}};
  assert.equal(await find(folder(folder(candidate,folder(unreadable)))),null);
});
test('includes deeply nested folders after traversing more than 2,048 entries',async()=>{
  const candidate=file('source.plotproject');
  let tree=folder(candidate);
  for(let depth=0;depth<10;depth++)tree=folder(tree);
  const unrelated=Array.from({length:2200},(_,index)=>({kind:'file',name:index+'.png'}));
  assert.deepEqual(await find(folder(...unrelated,tree)),{handle:candidate});
});

test('continues through a OneDrive-style delay to find a valid MiFiTo project two subfolders down',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  let release,started,finished=false;
  const manifest=Buffer.from(JSON.stringify({application:'MiFiTo',version:1,activeIndex:0,ui:{figureStudioProjectId:projectId},
    images:[{name:'image.png',sha256:'1'.repeat(64),bytes:1,width:1,height:1,settings:{}}]}));
  const header=Buffer.alloc(12);header.write('MiFiTo\r\n');header.writeUInt32LE(manifest.length,8);
  const name='measurement.mifito',native=new File([header,manifest,Buffer.from([0])],name);
  const reading=new Promise(resolve=>started=resolve);
  const handle={kind:'file',name,getFile(){started();return new Promise(resolve=>release=resolve);}};
  const lookup=find(folder(folder(folder(handle))),{app:'mifito',name,identify:readMifitoIdentity}).then(match=>{finished=true;return match;});
  await reading;
  t.mock.timers.tick(9000);
  await Promise.resolve();
  assert.equal(finished,false);
  release(native);
  assert.deepEqual(await lookup,{handle});
});

test('scans one tree for multiple sources and publishes a ready result while another file is pending',async()=>{
  let release,reportReady,scans=0;
  const fast=file('fast.plotproject'),slow={...file('slow.plotproject'),getFile:()=>new Promise(resolve=>release=resolve)};
  const directory={...folder(),async *values(){scans++;yield fast;yield slow;}};
  const ready=new Promise(resolve=>reportReady=resolve);
  const identify=async blob=>JSON.parse(await blob.text());
  const requests=[fast,slow].map(({name})=>({key:name,app:'plot',name,identify,projectId}));
  const batch=findProjectsInWorkFolder({directory,requests,onResult(key,handle){if(key===fast.name)reportReady(handle);}});
  assert.equal(await ready,fast);
  release(await file(slow.name).getFile());
  assert.deepEqual(await batch,new Map([[fast.name,fast],[slow.name,slow]]));
  assert.equal(scans,1);
});

test('aborting a background lookup leaves no candidate',async()=>{
  const controller=new AbortController();
  let started,release,inspections=0;
  const ready=new Promise(resolve=>{started=resolve;});
  const handle={...file('source.plotproject'),getFile(){started();return new Promise(resolve=>{release=resolve;});}};
  const search=find(folder(handle),{signal:controller.signal,identify(){inspections++;}});
  await ready;controller.abort();
  assert.equal(await search,null);
  release(await file('source.plotproject').getFile());
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(inspections,0);
});
