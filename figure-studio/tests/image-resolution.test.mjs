import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {rasterResolution,automaticPreviewQuality} from '../image-resolution.mjs';
import {importedImageSize} from '../image-placement.mjs';
import {makeObject,newDocument,mm,History} from '../model.mjs';
const asset={id:'old',mime:'image/jpeg',width:2400,height:1600,dataUrl:'original-bytes'};

test('effective resolution follows physical placement and handles nonuniform resizing conservatively',()=>{
 const r=rasterResolution(asset,{w:mm(100),h:mm(1600/24),rotation:60});assert.ok(Math.abs(r.dpi-609.6)<1e-7);assert.equal(r.widthAt300,203.2);
 assert.equal(rasterResolution({...asset,mime:'image/svg+xml'},{w:72,h:72}),null);
 assert.equal(rasterResolution(asset,{w:0,h:72}),null);assert.equal(rasterResolution(asset,{w:Infinity,h:72}),null);
 assert.equal(rasterResolution({...asset,width:300,height:200},{w:144,h:48}).dpi,150);
});
test('new small raster placement avoids enlargement while vectors and large photos keep their usual fit',()=>{
 const page=newDocument(),small=importedImageSize({...asset,width:300,height:200},page);assert.equal(small.w,72);assert.equal(small.h,48);
 assert.equal(rasterResolution({...asset,width:300,height:200},small).dpi,300);
 assert.equal(importedImageSize(asset,page).w,mm(70));
 assert.equal(importedImageSize({...asset,width:300,height:200,mime:'image/svg+xml'},page).w,mm(70));
});
test('automatic preview respects device pixels and zoom, without reducing vectors or undersized images',()=>{
 const image={...asset,width:4000,height:2000};assert.equal(automaticPreviewQuality(image,{width:300,height:150}),.25);
 assert.equal(automaticPreviewQuality(image,{width:600,height:300}),.5);assert.equal(automaticPreviewQuality(image,{width:600,height:300,pixelRatio:2}),1);
 assert.equal(automaticPreviewQuality(image,{width:1200,height:600}),1);assert.equal(automaticPreviewQuality({...image,mime:'image/svg+xml'},{width:10,height:10}),1);
 assert.equal(automaticPreviewQuality({...asset,width:300,height:200},{width:500,height:400}),1);assert.equal(automaticPreviewQuality(image),1);
});

const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
const start=source.indexOf('async function replaceImportedImage('),end=source.indexOf("$('#replaceImageInput').addEventListener",start);assert.ok(start>=0&&end>start);
function replacement({decode=async()=>({...asset,id:'new',dataUrl:'high-resolution-original'})}={}){
 const object=makeObject('image',{id:'panel',assetId:'old',x:30,y:40,w:200,h:100,rotation:25,opacity:.7,name:'Keep panel name'}),doc={...newDocument(),objects:[object]},assets=new Map([['old',{...asset}]]),history=new History(),messages=[];
 const snapshot=()=>structuredClone(doc),record=before=>history.push(before,snapshot());
 const replace=Function('imageAsset','doc','assets','snapshot','record','toast','bookId',source.slice(start,end)+'return replaceImportedImage;')(decode,doc,assets,snapshot,record,s=>messages.push(s),'book');
 return {replace,object,doc,assets,history,messages,target:{book:'book',figure:doc.id,panel:'panel',asset:'old'}};
}
test('replacing a low-resolution image keeps geometry and metadata, retains original bytes and is undoable',async()=>{
 const f=replacement(),before=structuredClone(f.object);await f.replace(new File(['bytes'],'high.jpg'),f.target);
 assert.deepEqual(f.object,{...before,assetId:'new'});assert.equal(f.assets.get('old').dataUrl,asset.dataUrl);assert.equal(f.assets.get('new').dataUrl,'high-resolution-original');
 assert.equal(f.history.past.length,1);const undo=f.history.undo(structuredClone(f.doc));assert.equal(undo.objects[0].assetId,'old');assert.equal(f.history.redo(undo).objects[0].assetId,'new');
});
test('changed targets, linked or locked objects and failed reads never replace another image',async()=>{
 for(const change of [f=>f.target.book='other',f=>f.target.figure='other',f=>f.doc.objects=[],f=>f.object.assetId='changed',f=>f.object.source={app:'plot'},f=>f.object.locked=true,f=>{f.object.groupId='g';f.doc.objects.push(makeObject('rect',{groupId:'g',locked:true}));}]){
  const f=replacement();change(f);await assert.rejects(f.replace(new File(['bytes'],'new.jpg'),f.target));assert.equal(f.assets.has('new'),false);assert.equal(f.history.past.length,0);
 }
 const f=replacement({decode:async()=>{throw Error('invalid image');}});await assert.rejects(f.replace(new File(['bad'],'new.jpg'),f.target));assert.equal(f.object.assetId,'old');assert.equal(f.history.past.length,0);
});
