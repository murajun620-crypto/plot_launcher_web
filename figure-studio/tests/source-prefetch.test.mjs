import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourcePrefetch} from '../source-prefetch.mjs';

const deferred=()=>{let resolve;return {promise:new Promise(finish=>resolve=finish),resolve};};
const linked=(id,app='mifito',name='rows.mifito',projectId='mifito-source',assetId=id)=>({id,source:{app,name,projectId,assetId}});
const state=(directories,objects,bookId='book')=>({bookId,directories,figures:[{id:'figure',objects}]});
const query=(panel,bookId='book',projectId=panel.source.projectId)=>({
 sourceKey:[bookId,'figure',panel.id,panel.source.assetId].join('/'),app:panel.source.app,name:panel.source.name,projectId
});
const fixture=scan=>createSourcePrefetch({scan,identify:{plot(){},mifito(){}},resolveProjectId:()=>assert.fail('embedded modern identity must be reused'),defer:()=>Promise.resolve()});

test('registering a folder does not read any original until a panel is opened and requests its file',async()=>{
 const directory={},first=linked('one'),copy=linked('copy'),other=linked('graph','plot','graph.plotproject','plot-source');
 const work=deferred(),complete=deferred(),found={kind:'file'},scans=[];
 const pending=fixture(details=>{scans.push(details);work.resolve(details);return complete.promise;});
 pending.start(state([directory],[first,copy,other]));
 assert.deepEqual(await Promise.all([pending.findSource(query(first)),pending.findSource(query(other))]),[null,null]);
 assert.equal(scans.length,0);

 pending.openSource(query(first).sourceKey,first.source);
 const firstResult=pending.findSource(query(first));
 const {requests}=await work.promise;
 assert.deepEqual(requests.map(request=>request.name),['rows.mifito']);
 assert.equal(await pending.findSource(query(other)),null);
 assert.equal(await pending.findSource(query(copy)),null);
 pending.openSource(query(copy).sourceKey,copy.source);
 const copyResult=pending.findSource(query(copy));
 complete.resolve(new Map([[requests[0].key,found]]));
 assert.equal(await firstResult,found);assert.equal(await copyResult,found);
 assert.equal(scans.length,1);
});

test('an editor cancelling its wait leaves the Studio background search running',async()=>{
 const directory={},panel=linked('one'),complete=deferred(),work=deferred(),local={kind:'file'};
 const background=fixture(details=>{work.resolve(details);return complete.promise;});
 background.start(state([directory],[panel]));
 background.openSource(query(panel).sourceKey,panel.source);
 const editor=new AbortController(),waiting=background.findSource(query(panel),{signal:editor.signal});
 const {requests,signal}=await work.promise;
 editor.abort();assert.equal(await waiting,null);assert.equal(signal.aborted,false);
 const later=background.findSource(query(panel));
 complete.resolve(new Map([[requests[0].key,local]]));
 assert.equal(await later,local);
});

test('view edits preserve the active scan and a new folder discards its stale results',async()=>{
 const firstDirectories=[{}],nextDirectories=[{}],panel=linked('one'),firstScan=deferred(),nextScan=deferred(),firstFinished=deferred(),nextFinished=deferred();
 let calls=0;
 const background=fixture(details=>{if(++calls===1){firstScan.resolve(details);return firstFinished.promise;}nextScan.resolve(details);return nextFinished.promise;});
 background.start(state(firstDirectories,[panel]));
 background.openSource(query(panel).sourceKey,panel.source);
 const previous=background.findSource(query(panel));
 const first=await firstScan.promise;
 background.start(state(firstDirectories,[{...panel,x:20}]));
 assert.equal(calls,1);
 background.start(state(nextDirectories,[panel]));
 assert.equal(first.signal.aborted,true);assert.equal(await previous,null);
 assert.equal(await background.findSource(query(panel)),null);
 assert.equal(calls,1);
 background.openSource(query(panel).sourceKey,panel.source);
 const latest=background.findSource(query(panel)),next=await nextScan.promise,newFile={name:'correct'};
 firstFinished.resolve(new Map());
 nextFinished.resolve(new Map([[next.requests[0].key,newFile]]));
 assert.equal(await latest,newFile);
 assert.equal(await background.findSource({...query(panel),app:'plot'}),null);
 assert.equal(await background.findSource({...query(panel),projectId:'wrong'}),null);
 assert.equal(await background.findSource(query(panel,'different-book')),null);
});

test('legacy attachments recover identity after the foreground task has finished',async()=>{
 const idle=deferred(),scanned=deferred(),panel=linked('legacy','mifito','old.mifito',''),found={kind:'file'};
 let reads=0;
 const background=createSourcePrefetch({
  scan:({requests})=>{scanned.resolve(requests);return new Map([[requests[0].key,found]]);},
  identify:{mifito(){}},async resolveProjectId(source){assert.equal(source.assetId,'legacy');reads++;return 'legacy-original';},defer:()=>idle.promise
 });
 background.start(state([{}],[panel]));
 assert.equal(reads,0);
 background.openSource(query(panel).sourceKey,panel.source);
 const result=background.findSource(query(panel,'book','legacy-original'));
 idle.resolve();
 assert.equal((await scanned.promise)[0].projectId,'legacy-original');
 assert.equal(await result,found);
});

test('opening the panel again retries a completed search that found no file',async()=>{
 const directory={},panel=linked('one'),found={kind:'file'};
 let calls=0;
 const background=fixture(({requests})=>++calls===1?new Map():new Map([[requests[0].key,found]]));
 background.start(state([directory],[panel]));
 background.openSource(query(panel).sourceKey,panel.source);
 assert.equal(await background.findSource(query(panel)),null);
 assert.equal(await background.findSource(query(panel)),null);
 assert.equal(calls,1);
 background.openSource(query(panel).sourceKey,panel.source);
 assert.equal(await background.findSource(query(panel)),found);
 assert.equal(calls,2);
});

test('details mode reports same-name candidates without advertising them as verified handles',async()=>{
 const panel=linked('one'),handle={kind:'file',name:panel.source.name};
 const result={handle,name:handle.name,verified:false,sameName:true,multiple:false};
 const background=fixture(({requests})=>new Map([[requests[0].key,result]]));
 background.start(state([{}],[panel]));
 assert.equal(await background.findSource(query(panel),{details:true}),null);
 background.openSource(query(panel).sourceKey,panel.source);
 assert.equal(await background.findSource(query(panel)),null);
 assert.equal(await background.findSource(query(panel),{details:true}),result);
});
