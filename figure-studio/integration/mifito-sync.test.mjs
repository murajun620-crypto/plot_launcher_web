import test from 'node:test';
import assert from 'node:assert/strict';
import {identifyManifest,readMifitoIdentity,mergeMifitoBaseline,createMifitoAcknowledgements} from './mifito-sync.mjs';
const image=(name,sha='a')=>({name,sha256:sha.repeat(64),bytes:3,width:100,height:80,enabled:true,settings:{crop:{x:0,y:0,width:100,height:80},cropOptions:{pending:null},panelLabel:{text:'a'},output:{scale:1,sizeCm:4,sizeAxis:'width',dpi:600,pptEditable:false,pptIncludeLabel:true}}});
const manifest=()=>({application:'MiFiTo',version:1,activeIndex:0,ui:{dpi:600},images:[image('a.png'),image('b.png','b')]});
function blob(data){const json=new TextEncoder().encode(JSON.stringify(data)),header=new Uint8Array(12);header.set(new TextEncoder().encode('MiFiTo\r\n'));new DataView(header.buffer).setUint32(8,json.length,true);return new Blob([header,json,...data.images.map(image=>new Uint8Array(image.bytes))]);}

test('legacy identities stay stable across settings, active selection and image order',async()=>{
 const first=manifest(),a=await identifyManifest(first),other=structuredClone(first);other.activeIndex=1;other.ui.dpi=1200;other.images.reverse();other.images[1].settings.panelLabel.text='changed';
 const b=await identifyManifest(other);assert.equal(a.projectId,b.projectId);assert.equal(a.images[0].imageId,b.images[1].imageId);assert.equal(a.activeImageId,b.activeImageId);assert.equal(a.legacy,true);
 assert.notEqual(a.images[0].fingerprint,b.images[1].fingerprint);
});
test('explicit identities survive rename, reorder and project serialization',async()=>{
 const data=manifest();data.ui.figureStudioProjectId='project-1234567890';data.images.forEach((im,i)=>im.figureStudioImageId=`image-1234567890-${i}`);
 const a=await identifyManifest(data);data.images[0].name='renamed.png';data.images.reverse();
 const b=await readMifitoIdentity(blob(data));assert.equal(b.projectId,a.projectId);assert.equal(b.images[1].imageId,a.images[0].imageId);assert.equal(b.images[1].fingerprint,a.images[0].fingerprint);assert.equal(b.legacy,false);
});
test('UI, export checkbox, pending crop and raster/PPT choices do not change fingerprints',async()=>{
 const data=manifest(),a=await identifyManifest(data);data.activeIndex=1;data.images[0].enabled=false;data.ui.formats=['pdf'];data.images[0].settings.cropOptions={pending:{x:1},aspect:'4:3'};Object.assign(data.images[0].settings.output,{dpi:1200,pptEditable:true,pptIncludeLabel:false});
 const b=await identifyManifest(data);assert.deepEqual(a.images.map(i=>i.fingerprint),b.images.map(i=>i.fingerprint));
});
test('render changes and original bytes change the image fingerprint',async()=>{
 const data=manifest(),a=await identifyManifest(data);data.images[0].settings.output.sizeCm=5;data.images[1].sha256='c'.repeat(64);
 const b=await identifyManifest(data);assert.notEqual(a.images[0].fingerprint,b.images[0].fingerprint);assert.notEqual(a.images[1].fingerprint,b.images[1].fingerprint);
});
test('indistinguishable legacy duplicate originals are flagged, explicit IDs resolve them',async()=>{
 const data=manifest();data.images=[image('same.png'),image('same.png')];const a=await identifyManifest(data);
 assert.notEqual(a.images[0].imageId,a.images[1].imageId);assert.ok(a.images.every(i=>i.ambiguous));
 data.images.forEach((im,i)=>im.figureStudioImageId=`image-1234567890-${i}`);const b=await identifyManifest(data);assert.ok(b.images.every(i=>!i.ambiguous));
});
test('malformed IDs, duplicates, header, truncation and appended bytes are rejected',async()=>{
 const data=manifest();data.ui.figureStudioProjectId='bad/id';await assert.rejects(identifyManifest(data));delete data.ui.figureStudioProjectId;
 data.images.forEach(im=>im.figureStudioImageId='duplicate-1234567890');await assert.rejects(identifyManifest(data));
 const good=blob(manifest());await assert.rejects(readMifitoIdentity(good.slice(0,-1)));await assert.rejects(readMifitoIdentity(new Blob([good,'x'])));await assert.rejects(readMifitoIdentity(new Blob(['Not a MiFiTo'])));
});
test('mixed legacy and explicit identities cannot resolve to the same image ID',async()=>{
 const data=manifest(),identity=await identifyManifest(data);data.images[1].figureStudioImageId=identity.images[0].imageId;
 await assert.rejects(identifyManifest(data));
});
test('single ACK keeps other image changes dirty and batch ACK accepts only its captured snapshot',()=>{
 const firstFile={},secondFile={},changedFile={};
 const baseline={activeId:'a',content:JSON.stringify({images:[{id:'a',settings:1},{id:'b',settings:1}],ui:{x:1}}),files:[firstFile,secondFile]};
 const captured={activeId:'a',content:JSON.stringify({images:[{id:'a',settings:2},{id:'b',settings:2}],ui:{x:2}}),files:[changedFile,secondFile]};
 const single=mergeMifitoBaseline(baseline,captured);assert.deepEqual(JSON.parse(single.content),{images:[{id:'a',settings:2},{id:'b',settings:1}],ui:{x:1}});assert.equal(single.files[0],changedFile);assert.equal(single.files[1],secondFile);assert.notEqual(single.content,captured.content);
 assert.equal(mergeMifitoBaseline(baseline,captured,true),captured);assert.equal(mergeMifitoBaseline(null,captured),null);assert.equal(JSON.parse(baseline.content).images[0].settings,1);
});
test('unchanged flags start only at successful receipts and are scoped to project plus image',()=>{
 const receipts=createMifitoAcknowledgements(),projectId='project-1234567890',a={imageId:'image-1234567890-a',fingerprint:'a'.repeat(64)},b={imageId:'image-1234567890-b',fingerprint:'b'.repeat(64)};
 assert.equal(receipts.isUnchanged(projectId,a),false);
 receipts.accept({image:{projectId,...a}});
 assert.equal(receipts.isUnchanged(projectId,a),true);assert.equal(receipts.isUnchanged(projectId,b),false);assert.equal(receipts.isUnchanged('project-0987654321',a),false);
 receipts.accept({batch:{projectId,images:[a,b]}});
 assert.equal(receipts.isUnchanged(projectId,b),true);
 assert.equal(receipts.isUnchanged(projectId,{...a,fingerprint:'c'.repeat(64)}),false);
 // Opening/working in another project must not clear an earlier tab receipt.
 receipts.accept({image:{projectId:'project-0987654321',...a}});
 assert.equal(receipts.isUnchanged(projectId,a),true);
});
test('receipt tracking uses exact accepted fingerprints, not later live descriptor edits',()=>{
 const receipts=createMifitoAcknowledgements(),image={projectId:'project-1234567890',imageId:'image-1234567890-a',fingerprint:'a'.repeat(64)};
 receipts.accept({image});image.fingerprint='b'.repeat(64);
 assert.equal(receipts.isUnchanged(image.projectId,image),false);assert.equal(receipts.isUnchanged(image.projectId,{...image,fingerprint:'a'.repeat(64)}),true);
});
