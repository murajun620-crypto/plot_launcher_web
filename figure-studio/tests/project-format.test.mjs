import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeProjectFile,readProjectFile} from '../project-format.mjs';
import {decodeWorkspaceState,encodeWorkspaceState} from '../workspace-state.mjs';

const book={format:'figure-studio-book',version:1,id:'book',activeId:'figure',figures:[{id:'figure',name:'図 1'}]};
const workspace={format:'figure-studio-workspace',version:1,active:'plot',editors:{plot:null,mifito:null}};
const asset={id:'image',name:'顕微鏡.png',dataUrl:'data:image/png;base64,AA=='};
const json=value=>new Blob([JSON.stringify(value)]);
async function collect(records){
 const values=[];
 for await(const record of records)values.push(record);
 return values;
}

test('small projects retain the existing JSON format and open with their original data',async()=>{
 const dataUrl='data:, '+'A'.repeat(1024*1024-8)+'😀\n"\\';
 const project={...book,assets:{image:{...asset,dataUrl}},workspace};
 const file=encodeProjectFile(project);
 assert.deepEqual(JSON.parse(await file.text()),project);
 const decoded=await readProjectFile(file);
 assert.deepEqual(decoded.project,{...book,workspace});
 assert.deepEqual(await collect(decoded.assets),Object.entries(project.assets));
 const legacy=await readProjectFile(json({format:'figure-studio',version:1,objects:[]}));
 assert.equal(legacy.project.format,'figure-studio');
 assert.deepEqual(await collect(legacy.assets),[]);
});

function framed({sizes,assetBlob=json(asset),stateBlob=json(workspace),payloads}={}){
 const manifest=json({book,workspaceBytes:stateBlob.size,assets:sizes??[['image',assetBlob.size]],...(payloads?{payloads:payloads.map(payload=>payload.size)}:{})});
 const prefix=Buffer.from(`FigureStudio/${payloads?3:2}\n`);
 const header=Buffer.alloc(prefix.length+4);prefix.copy(header);header.writeUInt32LE(manifest.size,prefix.length);
 return new Blob([header,manifest,stateBlob,assetBlob,...(payloads??[])]);
}

test('large-format records restore project state and assets independently',async()=>{
 const decoded=await readProjectFile(framed());
 assert.deepEqual(decoded.project,{...book,workspace});
 assert.deepEqual(await collect(decoded.assets),[['image',asset]]);
});

test('truncated, trailing, duplicate and out-of-bounds records are rejected before reading assets',async()=>{
 const file=framed();
 for(const broken of [
  file.slice(0,file.size-1),
  new Blob([file,'x']),
  framed({sizes:[['image',1],['image',1]]}),
  framed({sizes:[['image',400*1024*1024+1]]}),
  framed({sizes:[['image',-1]]})
 ])await assert.rejects(readProjectFile(broken),/プロジェクトデータ/);
});

test('stores original bytes once across assets and editor snapshots without altering their metadata',async()=>{
 const bytes=Buffer.alloc(1024*1024+2,91),prefix='data:image/png;base64,',dataUrl=prefix+bytes.toString('base64');
 const snapshot=await encodeWorkspaceState({version:1,active:'plot',editors:{
  plot:{version:1,app:'plot',state:{file:new File([bytes],'計測データ.bin',{type:'application/octet-stream',lastModified:123})}},
  mifito:null
 }});
 const assets={image:{...asset,dataUrl},copy:{...asset,id:'copy',name:'コピー',dataUrl}};
 const project={...book,assets,workspace:snapshot};
 const file=encodeProjectFile(project);
 assert.equal(await file.slice(0,15).text(),'FigureStudio/3\n');
 assert.ok(file.size<bytes.length+4096);
 const saved=await readProjectFile(file);
 assert.deepEqual(saved.project,{...book,workspace:snapshot});
 assert.deepEqual(await collect(saved.assets),Object.entries(assets));
 const restored=(await decodeWorkspaceState(saved.project.workspace)).editors.plot.state.file;
 assert.equal(restored.name,'計測データ.bin');assert.equal(restored.type,'application/octet-stream');assert.equal(restored.lastModified,123);
 assert.deepEqual(Buffer.from(await restored.arrayBuffer()),bytes);
});

test('keeps unusual legacy URLs verbatim alongside compact binary assets',async()=>{
 const dataUrl='data:image/png;base64,'+'A'.repeat(1021)+'B==';
 const original={...asset,dataUrl:'data:image/png;base64,'+Buffer.alloc(4096,33).toString('base64')};
 const assets={image:original,legacy:{...asset,id:'legacy',dataUrl}};
 const file=encodeProjectFile({...book,assets});
 assert.ok(file.size<json({...book,assets}).size);
 assert.deepEqual(await collect((await readProjectFile(file)).assets),Object.entries(assets));
});

test('rejects missing compact asset payloads and mismatched workspace sizes',async()=>{
 const payloads=[new Blob(['bytes'])],prefix='data:image/png;base64,';
 const assetBlob=json({...asset,dataUrl:{prefix,ref:1}});
 const decoded=await readProjectFile(framed({assetBlob,payloads}));
 await assert.rejects(collect(decoded.assets),/プロジェクトデータ/);
 const stateBlob=json({...workspace,editors:{plot:{nodes:[{type:'buffer',bytes:4,data:0}]}}});
 await assert.rejects(readProjectFile(framed({stateBlob,payloads})),/プロジェクトデータ/);
});
