// Small projects keep their original JSON format. Large projects use a
// length-prefixed index and independent JSON records so a browser never has
// to hold the whole file in a single JavaScript string.
const MAGIC=new TextEncoder().encode('FigureStudio/2\n');
const HEADER_BYTES=MAGIC.length+4;
const LEGACY_LIMIT=400*1024*1024;
const STRING_CHUNK=1024*1024;
const JSON_TYPE='application/json';
const invalid=()=>Error('Figure Studioのプロジェクトデータが不正か、途中で切れています。');
const readJSON=async blob=>JSON.parse(await blob.text());

function assetRecord(asset){
 const {dataUrl,...metadata}=asset;
 if(typeof dataUrl!=='string')throw invalid();
 const json=JSON.stringify(metadata);
 const parts=[json.slice(0,-1),json.length>2?',"dataUrl":"':'"dataUrl":"'];
 // Encode in smaller pieces, including any quotes or Unicode in legacy URLs.
 for(let start=0;start<dataUrl.length;start+=STRING_CHUNK){
  parts.push(JSON.stringify(dataUrl.slice(start,start+STRING_CHUNK)).slice(1,-1));
 }
 parts.push('"}');
 return new Blob(parts);
}

export function encodeProjectFile({assets={},workspace,...book}){
 const records=Object.entries(assets).map(([id,asset])=>[id,assetRecord(asset)]);
 const editorState=workspace===undefined?null:new Blob([JSON.stringify(workspace)]);
 const bookJSON=JSON.stringify(book);
 const parts=[bookJSON.slice(0,-1),bookJSON.length>2?',"assets":{':'"assets":{'];
 for(const [index,[id,record]] of records.entries())parts.push(index?',':'',JSON.stringify(id),':',record);
 parts.push('}');
 if(editorState)parts.push(',"workspace":',editorState);
 parts.push('}');
 const legacy=new Blob(parts,{type:JSON_TYPE});
 if(legacy.size<=LEGACY_LIMIT)return legacy;

 const index=new Blob([JSON.stringify({book,workspaceBytes:editorState?.size??0,assets:records.map(([id,record])=>[id,record.size])})]);
 if([index,editorState,...records.map(([,record])=>record)].some(part=>part?.size>LEGACY_LIMIT)){
  throw Error('個別の素材または編集データが大きすぎるため保存できません。');
 }
 const header=new Uint8Array(HEADER_BYTES);header.set(MAGIC);
 new DataView(header.buffer).setUint32(MAGIC.length,index.size,true);
 return new Blob([header,index,...(editorState?[editorState]:[]),...records.map(([,record])=>record)],{type:'application/octet-stream'});
}

export async function readProjectFile(file){
 const header=new Uint8Array(await file.slice(0,HEADER_BYTES).arrayBuffer());
 if(!MAGIC.every((byte,offset)=>header[offset]===byte)){
  if(file.size>LEGACY_LIMIT)throw Error('従来のJSON形式のプロジェクトは400 MB以内で開いてください。');
  const {assets={},...project}=await readJSON(file);
  return {project,assets:Object.entries(assets||{})};
 }
 if(header.length!==HEADER_BYTES)throw invalid();
 const indexBytes=new DataView(header.buffer).getUint32(MAGIC.length,true);
 const indexEnd=HEADER_BYTES+indexBytes;
 if(!indexBytes||indexBytes>LEGACY_LIMIT||indexEnd>file.size)throw invalid();
 const index=await readJSON(file.slice(HEADER_BYTES,indexEnd));
 if(!index?.book||typeof index.book!=='object'||Array.isArray(index.book)||!Array.isArray(index.assets))throw invalid();
 let offset=indexEnd;
 function bounds(bytes){
  if(!Number.isInteger(bytes)||bytes<0||bytes>LEGACY_LIMIT||offset+bytes>file.size)throw invalid();
  const start=offset;offset+=bytes;
  return [start,offset];
 }
 const editorBounds=bounds(index.workspaceBytes),ids=new Set();
 const records=index.assets.map(entry=>{
  if(!Array.isArray(entry)||entry.length!==2||typeof entry[0]!=='string'||!entry[0]||ids.has(entry[0])||!entry[1])throw invalid();
  const [id,bytes]=entry;ids.add(id);return [id,bounds(bytes)];
 });
 if(offset!==file.size)throw invalid();
 const project=index.book;
 if(index.workspaceBytes)project.workspace=await readJSON(file.slice(...editorBounds));
 async function* readAssets(){
  for(const [id,range] of records)yield [id,await readJSON(file.slice(...range))];
 }
 return {project,assets:readAssets()};
}
