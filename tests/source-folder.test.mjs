import test from 'node:test';
import assert from 'node:assert/strict';
import {findProjectInWorkFolder} from '../source-folder.mjs';

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

test('does not trust an apparent match if a candidate is unreadable or a search budget is exhausted',async()=>{
  const candidate=file('source.plotproject');
  const unreadable={...file('source.plotproject'),async getFile(){throw Error('OneDrive file is not available');}};
  assert.equal(await find(folder(folder(candidate,folder(unreadable)))),null);
  assert.equal(await find(folder(candidate,folder()),{maxEntries:1}),null);
});
test('includes deeply nested folders within the time and entry limits',async()=>{
  const candidate=file('source.plotproject');
  let tree=folder(candidate);
  for(let depth=0;depth<10;depth++)tree=folder(tree);
  assert.deepEqual(await find(tree),{handle:candidate});
});

test('bounds an unresponsive file read and does not inspect its late result',async()=>{
  let release,inspections=0;
  const handle={...file('source.plotproject'),getFile:()=>new Promise(resolve=>{release=resolve;})};
  const search=find(folder(handle),{timeoutMs:30,identify(){inspections++;}});
  assert.equal(await search,null);
  release?.(await file('source.plotproject').getFile());
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(inspections,0);
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
