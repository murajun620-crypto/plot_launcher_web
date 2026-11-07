import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreviewQuality,normalizePreviewQuality,previewDimensions,renderReducedPreview} from '../preview-quality.mjs';

const source=(id='a')=>({id,mime:'image/png',width:4001,height:2001,dataUrl:`data:image/png;base64,original-${id}`,previewUrl:'data:image/png;base64,legacy-low-quality'});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const gate=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:value=>resolve(value)};};

test('quality accepts only supported source-dimension ratios',()=>{
 assert.equal(normalizePreviewQuality('0.5'),.5);assert.equal(normalizePreviewQuality(.25),.25);
 for(const bad of [0,2,.3,NaN,undefined])assert.equal(normalizePreviewQuality(bad),1);
 assert.deepEqual(previewDimensions(source(),.5),{width:2001,height:1001});
 assert.deepEqual(previewDimensions(source(),.25),{width:1000,height:500});
 assert.deepEqual(previewDimensions({width:1,height:2},.25),{width:1,height:1});
 assert.throws(()=>previewDimensions({width:Infinity,height:20},.5));
});

test('full quality uses original SVG and raster, ignoring legacy low quality data',async()=>{
 let calls=0;const manager=createPreviewQuality({renderPreview:async()=>{calls++;}});
 for(const mime of ['image/png','image/svg+xml']){
  const asset={...source(),mime};assert.equal(manager.getURL(asset),asset.dataUrl);
  assert.equal(await renderReducedPreview(asset,1),asset.dataUrl);
 }
 await manager.whenIdle();assert.equal(calls,0);
});

test('repeated draw requests share a single lazy render and never mutate saved asset',async()=>{
 const asset=source(),before=JSON.stringify(asset),result='data:image/png;base64,half';
 let calls=0;const notices=[];
 const manager=createPreviewQuality({quality:.5,schedule:()=>Promise.resolve(),renderPreview:async(a,q)=>{calls++;assert.equal(a,asset);assert.equal(q,.5);return result;},onReady:(...args)=>notices.push(args)});
 assert.equal(manager.getURL(asset),asset.dataUrl);assert.equal(manager.getURL(asset),asset.dataUrl);
 await manager.whenIdle();assert.equal(calls,1);assert.equal(manager.getURL(asset),result);
 assert.deepEqual(notices,[[asset,result,.5]]);assert.equal(JSON.stringify(asset),before);
});

test('quality switch suppresses stale completion and processes only current queued requests',async()=>{
 const first=gate(),calls=[],ready=[];const asset=source(),other=source('b');
 const manager=createPreviewQuality({quality:.5,schedule:()=>Promise.resolve(),renderPreview:async(a,q)=>{calls.push([a.id,q]);return calls.length===1?first.promise:`data:image/png;base64,${q}`;},onReady:(a,u,q)=>ready.push(q)});
 manager.getURL(asset);await tick();manager.getURL(other);
 manager.setQuality(.25);manager.getURL(asset);first.resolve('data:image/png;base64,half');
 await manager.whenIdle();assert.deepEqual(calls,[['a',.5],['a',.25]]);assert.deepEqual(ready,[.25]);
 assert.equal(manager.getURL(asset),'data:image/png;base64,0.25');
 manager.setQuality(1);assert.equal(manager.getURL(asset),asset.dataUrl);
});

test('failed reduced rendering falls back to original without an infinite retry loop',async()=>{
 let calls=0,errors=0;const asset=source();
 const manager=createPreviewQuality({quality:.25,schedule:()=>Promise.resolve(),renderPreview:async()=>{calls++;throw Error('decode failed');},onError:()=>errors++});
 manager.getURL(asset);await manager.whenIdle();
 assert.equal(manager.getURL(asset),asset.dataUrl);assert.equal(calls,1);assert.equal(errors,1);
});

test('clearing or disposing ignores an in-flight result from the previous project',async()=>{
 for(const operation of ['clear','dispose']){
  const completion=gate(),notices=[];const manager=createPreviewQuality({quality:.5,schedule:()=>Promise.resolve(),renderPreview:()=>completion.promise,onReady:(...a)=>notices.push(a)});
  manager.getURL(source());await tick();manager[operation]();completion.resolve('data:image/png;base64,stale');await manager.whenIdle();assert.deepEqual(notices,[]);
 }
});

test('an explicit quality choice retries a temporary failed preview once',async()=>{
 let calls=0,errors=0;const asset=source(),result='data:image/png;base64,recovered';
 const manager=createPreviewQuality({quality:.5,schedule:()=>Promise.resolve(),renderPreview:async()=>{if(++calls===1)throw Error('temporary decode failure');return result;},onError:()=>errors++});
 manager.getURL(asset);await manager.whenIdle();manager.getURL(asset);await manager.whenIdle();
 assert.equal(calls,1);assert.equal(errors,1);
 manager.setQuality(1);assert.equal(manager.getURL(asset),asset.dataUrl);
 manager.setQuality(.5);assert.equal(manager.getURL(asset),asset.dataUrl);await manager.whenIdle();
 assert.equal(calls,2);assert.equal(manager.getURL(asset),result);assert.equal(errors,1);
});

test('cache evicts least-recently used previews and keys source replacement correctly',async()=>{
 let calls=0;const manager=createPreviewQuality({quality:.5,maxEntries:1,schedule:()=>Promise.resolve(),renderPreview:async()=>`data:image/png;base64,render-${++calls}`});
 const a=source(),b=source('b');manager.getURL(a);await manager.whenIdle();manager.getURL(b);await manager.whenIdle();
 assert.equal(manager.getURL(a),a.dataUrl);await manager.whenIdle();assert.equal(calls,3);
 a.dataUrl='data:image/png;base64,replaced';assert.equal(manager.getURL(a),a.dataUrl);await manager.whenIdle();assert.equal(calls,4);
});

test('automatic mode uses original pixels on zoom-in even when an earlier small preview finishes late',async()=>{
 const asset=source(),before=structuredClone(asset),pending=gate(),renders=[];
 const manager=createPreviewQuality({quality:'auto',schedule:()=>Promise.resolve(),renderPreview:async(a,q)=>{renders.push(q);await pending.promise;return 'data:image/png;base64,quarter';}});
 assert.equal(normalizePreviewQuality('auto'),'auto');assert.equal(manager.getURL(asset,{width:300,height:150}),asset.dataUrl);await tick();
 assert.equal(manager.getURL(asset,{width:2200,height:1100}),asset.dataUrl);pending.resolve();await manager.whenIdle();
 assert.deepEqual(renders,[.25]);assert.equal(manager.getURL(asset,{width:2200,height:1100}),asset.dataUrl);assert.equal(manager.getURL(asset,{width:300,height:150}),'data:image/png;base64,quarter');assert.deepEqual(asset,before);
});
test('automatic mode caches different display sizes of the same asset while manual fractions remain explicit',async()=>{
 const asset=source(),renders=[];const manager=createPreviewQuality({quality:'auto',schedule:()=>Promise.resolve(),renderPreview:async(a,q)=>{renders.push(q);return 'data:image/png;base64,'+q;}});
 manager.getURL(asset,{width:300,height:150});manager.getURL(asset,{width:900,height:450});await manager.whenIdle();assert.deepEqual(renders,[.25,.5]);
 assert.equal(manager.getURL(asset,{width:300,height:150}),'data:image/png;base64,0.25');assert.equal(manager.getURL(asset,{width:900,height:450}),'data:image/png;base64,0.5');
 manager.setQuality(.25);assert.equal(manager.getURL(asset,{width:9000,height:4500,pixelRatio:2}),'data:image/png;base64,0.25');
 manager.setQuality('auto');assert.equal(manager.getURL({...asset,mime:'image/svg+xml'},{width:10,height:10}),asset.dataUrl);
});
