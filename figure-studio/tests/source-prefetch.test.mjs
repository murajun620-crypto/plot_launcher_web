import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourcePrefetch} from '../source-prefetch.mjs';

const deferred=()=>{let resolve;return {promise:new Promise(finish=>resolve=finish),resolve};};
const linked=(id,app='mifito',name='rows.mifito',projectId='mifito-source',assetId=id)=>({id,source:{app,name,projectId,assetId}});
const state=(directory,objects,bookId='book')=>({bookId,directory,figures:[{id:'figure',objects}]});
const query=(panel,bookId='book',projectId=panel.source.projectId)=>({
 sourceKey:[bookId,'figure',panel.id,panel.source.assetId].join('/'),app:panel.source.app,name:panel.source.name,projectId
});
const fixture=scan=>createSourcePrefetch({scan,identify:{plot(){},mifito(){}},resolveProjectId:()=>assert.fail('embedded modern identity must be reused'),defer:()=>Promise.resolve()});

test('an opened book prepares a single shared scan before an editor requests the folder',async()=>{
 const directory={},first=linked('one'),copy=linked('copy'),other=linked('graph','plot','graph.plotproject','plot-source');
 const work=deferred(),complete=deferred(),found={kind:'file'},pending=fixture(details=>{work.resolve(details);return complete.promise;});
 pending.start(state(directory,[first,copy,other]));
 const {requests,onResult}=await work.promise;
 assert.deepEqual(requests.map(request=>request.name),['rows.mifito','graph.plotproject']);
 const firstResult=pending.findSource(query(first)),copyResult=pending.findSource(query(copy));
 onResult(requests[0].key,found);
 assert.equal(await firstResult,found);assert.equal(await copyResult,found);
 const otherResult=pending.findSource(query(other));
 onResult(requests[1].key,null);
 assert.equal(await otherResult,null);
 complete.resolve(new Map());
});

test('an editor cancelling its wait leaves the Studio background search running',async()=>{
 const directory={},panel=linked('one'),complete=deferred(),work=deferred(),local={kind:'file'};
 const background=fixture(details=>{work.resolve(details);return complete.promise;});
 background.start(state(directory,[panel]));
 const {requests,signal}=await work.promise;
 const editor=new AbortController(),waiting=background.findSource(query(panel),{signal:editor.signal});
 editor.abort();assert.equal(await waiting,null);assert.equal(signal.aborted,false);
 const later=background.findSource(query(panel));
 complete.resolve(new Map([[requests[0].key,local]]));
 assert.equal(await later,local);
});

test('view edits preserve the active scan and a new folder discards its stale results',async()=>{
 const firstDirectory={},nextDirectory={},panel=linked('one'),firstScan=deferred(),nextScan=deferred(),firstFinished=deferred(),nextFinished=deferred();
 let calls=0;
 const background=fixture(details=>{if(++calls===1){firstScan.resolve(details);return firstFinished.promise;}nextScan.resolve(details);return nextFinished.promise;});
 background.start(state(firstDirectory,[panel]));
 const first=await firstScan.promise;
 background.start(state(firstDirectory,[{...panel,x:20}]));
 assert.equal(calls,1);
 const previous=background.findSource(query(panel));
 background.start(state(nextDirectory,[panel]));
 assert.equal(first.signal.aborted,true);assert.equal(await previous,null);
 const next=await nextScan.promise,latest=background.findSource(query(panel)),newFile={name:'correct'};
 first.onResult(first.requests[0].key,{name:'wrong'});
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
 background.start(state({},[panel]));
 assert.equal(reads,0);
 const result=background.findSource(query(panel,'book','legacy-original'));
 idle.resolve();
 assert.equal((await scanned.promise)[0].projectId,'legacy-original');
 assert.equal(await result,found);
});
