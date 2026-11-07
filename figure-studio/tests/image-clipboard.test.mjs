import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeObject,newDocument,validateDocument,mm,uid,clone} from '../model.mjs';
import {selectionRasterSize,writeSelectionImage,studioPasteObjects} from '../image-clipboard.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}};

test('clipboard raster preserves native image pixels and gives vector selections 600 dpi',()=>{
 const image=makeObject('image',{assetId:'a',w:72,h:48}),assets=new Map([['a',{mime:'image/jpeg',width:2400,height:1600}]]);
 assert.equal(selectionRasterSize({w:72,h:48},[image],assets).width,2400);
 assets.get('a').mime='image/svg+xml';assert.deepEqual(selectionRasterSize({w:72,h:48},[image],assets),{width:600,height:400,dpi:600});
 const huge=selectionRasterSize({w:200000,h:1000},[image],assets);assert.ok(huge.width<=16384&&huge.width*huge.height<=64000000);
});
test('clipboard write starts in the user gesture before async PNG rendering finishes',async()=>{
 const gate=deferred(),events=[];let data;
 class Item{constructor(value){data=value}}
 const result={blob:new Blob(['png'],{type:'image/png'}),width:20,height:10};
 const done=writeSelectionImage({marker:'marker',ClipboardItemRef:Item,clipboardRef:{write(items){events.push('write');assert.equal(items.length,1);return Promise.resolve(data['image/png']).then(()=>events.push('written'))}},renderPNG:()=>{events.push('render');return gate.promise}});
 assert.deepEqual(events,['write']);await tick();assert.deepEqual(events,['write','render']);assert.equal(await data['text/plain'].text(),'marker');gate.resolve(result);assert.equal(await done,result);assert.deepEqual(events,['write','render','written']);
});
test('unsupported clipboard does not render, and permission or PNG errors reject cleanly',async()=>{
 assert.equal(writeSelectionImage({clipboardRef:{},renderPNG:()=>{throw Error('must not render')}}),null);
 class Item{constructor(data){this.data=data}}
 await assert.rejects(writeSelectionImage({marker:'m',ClipboardItemRef:Item,clipboardRef:{write:()=>Promise.reject(Error('permission denied'))},renderPNG:async()=>({blob:new Blob()})}),/permission/);
 await assert.rejects(writeSelectionImage({marker:'m',ClipboardItemRef:Item,clipboardRef:{write:items=>items[0].data['image/png']},renderPNG:async()=>{throw Error('decode failed')}}),/decode/);
});
test('internal paste requires its exact marker and still accepts the original custom format',()=>{
 const internal=[{id:'a'}],data=values=>({getData:key=>values[key]||''});
 assert.equal(studioPasteObjects(data({'text/plain':'marker-a'}),internal,'marker-a'),internal);
 assert.equal(studioPasteObjects(data({'text/plain':'marker-b'}),internal,'marker-a'),null);
 assert.deepEqual(studioPasteObjects(data({'application/x-figure-studio':'[{"id":"b"}]'}),internal,'marker-a'),[{id:'b'}]);
 assert.equal(studioPasteObjects(data({'application/x-figure-studio':'broken','text/plain':'marker-a'}),internal,'marker-a'),internal);
});

const source=await readFile(new URL('../app.js',import.meta.url),'utf8'),begin=source.indexOf('function clipboardActive('),end=source.indexOf('function assetIds(',begin);
function app({failed=false,gate=null}={}){
 const listeners=new Map(),messages=[],renders=[],imports=[],writes=[],body={tagName:'BODY'},svg={tagName:'svg'},document={body,activeElement:svg,querySelector:()=>null,addEventListener:(type,handler)=>listeners.set(type,handler)},doc={...newDocument(),objects:[makeObject('image',{assetId:'original',groupId:'g',w:80,h:60,rotation:15}),makeObject('text',{text:'editable',groupId:'g'})]},assets=new Map([['original',{dataUrl:'original pixels'}]]);
 const api=Function('document','svg','doc','assets','clone','uid','mm','validateDocument','makeObject','studioPasteObjects','writeSelectionImage','selectionPNG','toast','importImages',`
 let clipboard=null,clipboardMarker='Figure Studio objects',clipboardGeneration=0,editingId=null,selection=doc.objects.map(o=>o.id);
 function selected(){return doc.objects.filter(o=>selection.includes(o.id))}function change(fn){fn()}function execute(action){if(action==='delete')doc.objects=[]}function drawContent(){}const texRenderer={prepare:async()=>{}};
 ${source.slice(begin,end)}return {selection:()=>selection};
 `)(document,svg,doc,assets,clone,uid,mm,validateDocument,makeObject,studioPasteObjects,
 args=>{writes.push(args);const pending=Promise.resolve().then(args.renderPNG);return failed?pending.then(()=>{throw Error('denied')}):pending},
 async options=>{renders.push(options);if(gate)await gate.promise;return {blob:new Blob(['png'],{type:'image/png'}),width:2400,height:1600}},s=>messages.push(s),async files=>imports.push(files));
 const event=(values={},files=[])=>{const map=new Map(Object.entries(values));return{target:svg,clipboardData:{files,getData:key=>map.get(key)||'',setData:(key,value)=>map.set(key,value)},preventDefault(){this.prevented=true}}};
 return {listeners,messages,renders,imports,writes,doc,assets,document,svg,api,event};
}
test('PNG clipboard data pastes internally as separate editable objects with asset and group metadata',async()=>{
 const f=app(),e=f.event();f.listeners.get('copy')(e);await tick();const marker=e.clipboardData.getData('text/plain'),before=clone(f.doc.objects);
 await f.listeners.get('paste')(f.event({'text/plain':marker},[new File(['png'],'copied.png',{type:'image/png'})]));
 assert.equal(f.imports.length,0);assert.equal(f.doc.objects.length,4);const added=f.doc.objects.slice(2);assert.equal(added[0].assetId,'original');assert.equal(added[0].rotation,15);assert.equal(added[1].type,'text');assert.equal(added[1].text,'editable');assert.notEqual(added[0].groupId,'g');assert.equal(added[0].groupId,added[1].groupId);assert.equal(added[0].x,before[0].x+mm(3));
});
test('a clipboard denial retains internal paste, while unrelated image data imports normally',async()=>{
 const f=app({failed:true}),e=f.event();f.listeners.get('copy')(e);await tick();assert.match(f.messages.at(-1),/Studio内にはコピー/);
 await f.listeners.get('paste')(f.event({'text/plain':e.clipboardData.getData('text/plain')}));assert.equal(f.doc.objects.length,4);
 await f.listeners.get('paste')(f.event({},[new File(['png'],'other.png',{type:'image/png'})]));assert.equal(f.imports.length,1);
});
test('in-flight copy captures the original objects and assets and cancels after a later text copy',async()=>{
 const gate=deferred(),f=app({gate});f.listeners.get('copy')(f.event());await tick();f.doc.objects[0].rotation=90;f.assets.clear();assert.equal(f.renders[0].objects[0].rotation,15);assert.equal(f.renders[0].assets.get('original').dataUrl,'original pixels');
 f.document.activeElement={tagName:'INPUT'};f.listeners.get('copy')(f.event());gate.resolve();await tick();assert.equal(f.messages.filter(s=>s.startsWith('画像をコピーしました')).length,0);
});
