import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {encodeWorkspaceState,decodeWorkspaceState} from '../workspace-state.mjs';

const workspace=state=>({version:1,active:'plot',editors:{plot:{version:1,app:'plot',state},mifito:null}});
const roundTrip=async value=>decodeWorkspaceState(JSON.parse(JSON.stringify(await encodeWorkspaceState(value))));

test('workspace codec retains source/baseline aliases, cycles, sparse arrays, and pending input values',async()=>{
 const source={filename:'実験.csv',bytes:new Uint8Array([1,2,255]).buffer},font={bytes:new Uint8Array([10,20])};
 const sparse=new Array(4);sparse[3]=undefined;
 const state={source,fonts:[font],baseline:{source,fonts:[font]},inputs:{axisMin:'-',label:'未確定 <text>'},sparse};state.self=state;
 const result=(await roundTrip(workspace(state))).editors.plot.state;
 assert.equal(result,result.self);assert.equal(result.source,result.baseline.source);assert.equal(result.fonts[0],result.baseline.fonts[0]);
 assert.deepEqual([...new Uint8Array(result.source.bytes)],[1,2,255]);assert.equal(result.inputs.axisMin,'-');assert.equal(result.inputs.label,'未確定 <text>');
 assert.equal(result.sparse.length,4);assert.equal(0 in result.sparse,false);assert.equal(3 in result.sparse,true);assert.equal(result.sparse[3],undefined);
});

test('Files and Blobs preserve exact binary bytes and shared identity through JSON',async()=>{
 const original=new File([Uint8Array.from({length:70001},(_,i)=>i%256)],'image 日本語.tif',{type:'image/tiff',lastModified:1234}),blob=new Blob(['project'],{type:'application/octet-stream'});
 const state={items:[{file:original}],baseline:{files:[original]},project:blob};
 const input={version:1,active:'mifito',editors:{plot:null,mifito:{version:1,app:'mifito',state}}};
 const restored=await roundTrip(input),result=restored.editors.mifito.state;
 assert.equal(restored.active,'mifito');assert.equal(result.items[0].file,result.baseline.files[0]);assert.ok(result.items[0].file instanceof File);
 assert.equal(result.items[0].file.name,original.name);assert.equal(result.items[0].file.type,'image/tiff');assert.equal(result.items[0].file.lastModified,1234);
 assert.deepEqual(new Uint8Array(await result.items[0].file.arrayBuffer()),new Uint8Array(await original.arrayBuffer()));assert.equal(await result.project.text(),'project');
});

test('typed views share one restored backing buffer, including offsets and BigInt views',async()=>{
 const buffer=new ArrayBuffer(32),bytes=new Uint8Array(buffer),floats=new Float32Array(buffer,8,2),view=new DataView(buffer,4,16),big=new BigInt64Array(buffer,16,1);
 floats[0]=1.25;floats[1]=-2.5;big[0]=1234567890123n;
 const result=(await roundTrip(workspace({buffer,bytes,floats,view,big}))).editors.plot.state;
 for(const value of [result.bytes,result.floats,result.view,result.big])assert.equal(value.buffer,result.buffer);
 assert.equal(result.floats.byteOffset,8);assert.deepEqual([...result.floats],[1.25,-2.5]);assert.equal(result.view.byteLength,16);assert.equal(result.big[0],1234567890123n);
 result.bytes[0]=42;assert.equal(new Uint8Array(result.buffer)[0],42);
});

test('objects returned by a different editor realm preserve typed buffers, Maps, dates and aliases',async()=>{
 const state=runInNewContext(`(()=>{const buffer=new ArrayBuffer(8),view=new Uint16Array(buffer,2,2),source={buffer};view[0]=1234;return {source,baseline:{source},view,map:new Map([[source,view]]),date:new Date('2026-11-07T00:00:00Z')};})()`);
 assert.equal(state.map instanceof Map,false);assert.equal(state.source.buffer instanceof ArrayBuffer,false);
 const result=(await roundTrip(workspace(state))).editors.plot.state;
 assert.equal(result.source,result.baseline.source);assert.equal(result.view.buffer,result.source.buffer);assert.equal(result.view[0],1234);assert.equal(result.map.get(result.source),result.view);assert.equal(result.date.toISOString(),'2026-11-07T00:00:00.000Z');
});

test('Map, Set, dates, null prototypes, special numeric values, and History fields are portable',async()=>{
 class History{constructor(){this.entries=[{label:'A'}];this.index=0;}}
 const key={},map=new Map([[key,'entry']]),set=new Set([key,map]),nullObject=Object.assign(Object.create(null),{label:'B'});
 const result=(await roundTrip(workspace({key,map,set,nullObject,date:new Date('2026-11-07T03:00:00.000Z'),history:new History(),missing:undefined,nan:NaN,positive:Infinity,negative:-Infinity,zero:-0,big:9876543210123456789n}))).editors.plot.state;
 assert.equal(result.map.get(result.key),'entry');assert.equal(result.set.has(result.key),true);assert.equal(result.set.has(result.map),true);assert.equal(Object.getPrototypeOf(result.nullObject),null);
 assert.equal(result.date.toISOString(),'2026-11-07T03:00:00.000Z');assert.deepEqual(result.history,{entries:[{label:'A'}],index:0});
 assert.equal(result.missing,undefined);assert.ok(Number.isNaN(result.nan));assert.equal(result.positive,Infinity);assert.equal(result.negative,-Infinity);assert.ok(Object.is(result.zero,-0));assert.equal(result.big,9876543210123456789n);
});

test('unsupported live objects and prototype-affecting fields cannot be serialized',async()=>{
 class FileSystemFileHandle{constructor(){this.kind='file';}}
 for(const value of [()=>{},Symbol('live'),new FileSystemFileHandle(),new WeakMap(),new Date(NaN)])await assert.rejects(encodeWorkspaceState(workspace({value})));
 const polluted=JSON.parse('{"__proto__":{"polluted":true}}');await assert.rejects(encodeWorkspaceState(workspace(polluted)));assert.equal({}.polluted,undefined);
 let deep={};for(let i=0;i<105;i++)deep={next:deep};await assert.rejects(encodeWorkspaceState(workspace(deep)));
});

test('malformed graph references, binary lengths, view bounds, keys and envelope identity are rejected',async()=>{
 const encoded=await encodeWorkspaceState(workspace({bytes:new Uint8Array([0,1,2]),blob:new Blob(['x'])}));
 const mutate=fn=>{const value=JSON.parse(JSON.stringify(encoded));fn(value);return value;};
 const nodes=value=>value.editors.plot.nodes;
 const cases=[
  v=>v.version=2,v=>v.active='unknown',v=>v.editors.plot.root.id=99999,
  v=>nodes(v).find(n=>n.type==='buffer').bytes=400*1024*1024+1,
  v=>nodes(v).find(n=>n.type==='buffer').data='AA?A',
  v=>{const n=nodes(v).find(n=>n.type==='blob');n.data='AB==';n.bytes=1;},
  v=>nodes(v).find(n=>n.type==='view').offset=999,
  v=>nodes(v).find(n=>n.type==='view').name='Function',
  v=>nodes(v).find(n=>n.type==='object').entries.push(['__proto__',null]),
  v=>nodes(v).find(n=>n.type==='object').entries.push(['version',2]),
  v=>nodes(v)[v.editors.plot.root.id].entries.find(([key])=>key==='app')[1]='mifito',
  v=>nodes(v).push({type:'executable',value:'alert(1)'})
 ];
 for(const change of cases)await assert.rejects(decodeWorkspaceState(mutate(change)));
 assert.equal({}.polluted,undefined);
});

test('both editor graphs validate before any binary allocations or restored objects escape',async t=>{
 const value=await encodeWorkspaceState({version:1,active:'studio',editors:{plot:{version:1,app:'plot',state:{blob:new Blob(['valid'])}},mifito:{version:1,app:'mifito',state:{}}}});
 value.editors.mifito.nodes.push({type:'unknown'});
 const OriginalBlob=globalThis.Blob;let allocations=0;
 globalThis.Blob=class extends OriginalBlob{constructor(...args){allocations++;super(...args);}};
 t.after(()=>globalThis.Blob=OriginalBlob);
 await assert.rejects(decodeWorkspaceState(value));assert.equal(allocations,0);
});

test('closed editors remain null and encode does not mutate original live state',async()=>{
 const original={version:1,active:'studio',editors:{plot:null,mifito:null}},before=JSON.stringify(original);
 assert.deepEqual(await roundTrip(original),original);assert.equal(JSON.stringify(original),before);
});
