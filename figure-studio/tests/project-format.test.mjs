import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeProjectFile,readProjectFile} from '../project-format.mjs';

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

function framed({sizes,assetBlob=json(asset),stateBlob=json(workspace)}={}){
 const manifest=json({book,workspaceBytes:stateBlob.size,assets:sizes??[['image',assetBlob.size]]});
 const prefix=Buffer.from('FigureStudio/2\n');
 const header=Buffer.alloc(prefix.length+4);prefix.copy(header);header.writeUInt32LE(manifest.size,prefix.length);
 return new Blob([header,manifest,stateBlob,assetBlob]);
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
