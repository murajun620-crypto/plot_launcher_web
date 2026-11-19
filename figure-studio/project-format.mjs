// Framed projects keep metadata and assets in separate records. Format 3
// stores canonical base64 payloads as binary, with shared references for copies.
const MAGIC=new TextEncoder().encode('FigureStudio/');
const VERSION_OFFSET=MAGIC.length;
const INDEX_OFFSET=VERSION_OFFSET+2;
const HEADER_BYTES=INDEX_OFFSET+4;
const LEGACY_LIMIT=400*1024*1024;
const STRING_CHUNK=1024*1024;
const BINARY_CHUNK=3*STRING_CHUNK/4;
const MIN_BASE64_SIZE=1024;
const JSON_TYPE='application/json';
const BASE64='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BINARY_NODE_TYPES=new Set(['blob','file','buffer']);
const isBase64Prefix=value=>typeof value==='string'&&/^data:[^,]*;base64,$/.test(value);
const invalid=()=>Error('Figure Studioのプロジェクトデータが不正か、途中で切れています。');
const jsonBlob=value=>new Blob([JSON.stringify(value)]);
const readJSON=async blob=>JSON.parse(await blob.text());

function binaryBlob(data){
 if(data.length<MIN_BASE64_SIZE||data.length>LEGACY_LIMIT||data.length%4)return null;
 const padding=data.endsWith('==')?2:data.endsWith('=')?1:0;
 if(padding&&(BASE64.indexOf(data.at(-padding-1))&(padding===2?15:3)))return null;
 const parts=[];
 for(let start=0;start<data.length;start+=STRING_CHUNK){
  const part=data.slice(start,start+STRING_CHUNK);
  const content=start+STRING_CHUNK>=data.length&&padding?part.slice(0,-padding):part;
  if(/[^A-Za-z0-9+/]/.test(content))return null;
  if(Uint8Array.fromBase64)parts.push(Uint8Array.fromBase64(part));
  else{
   const raw=atob(part),bytes=new Uint8Array(raw.length);
   for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
   parts.push(bytes);
  }
 }
 return new Blob(parts);
}

async function encodeBase64(blob){
 const parts=[];
 for(let start=0;start<blob.size;start+=BINARY_CHUNK){
  const bytes=new Uint8Array(await blob.slice(start,start+BINARY_CHUNK).arrayBuffer());
  if(bytes.toBase64)parts.push(bytes.toBase64());
  else for(let index=0;index<bytes.length;index+=24576)parts.push(btoa(String.fromCharCode(...bytes.subarray(index,index+24576))));
 }
 return parts.join('');
}

function* editorGraphs(workspace){
 if(workspace?.format!=='figure-studio-workspace')return;
 for(const app of ['plot','mifito']){
  const graph=workspace.editors?.[app];
  if(Array.isArray(graph?.nodes))yield [app,graph];
 }
}

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
 const payloads=[],references=new Map();
 function store(data){
  if(references.has(data))return references.get(data);
  const binary=binaryBlob(data);
  if(!binary)return null;
  const ref=payloads.length;references.set(data,ref);payloads.push(binary);return ref;
 }
 const records=Object.entries(assets).map(([id,asset])=>{
  if(typeof asset.dataUrl!=='string')throw invalid();
  const dataUrl=asset.dataUrl,prefix=dataUrl.slice(0,dataUrl.indexOf(',')+1);
  const ref=isBase64Prefix(prefix)?store(dataUrl.slice(prefix.length)):null;
  return [id,ref===null?assetRecord(asset):jsonBlob({...asset,dataUrl:{prefix,ref}})];
 });
 let savedWorkspace=workspace;
 for(const [app,graph] of editorGraphs(workspace)){
  if(savedWorkspace===workspace)savedWorkspace={...workspace,editors:{...workspace.editors}};
  const nodes=graph.nodes.map(node=>{
   if(!BINARY_NODE_TYPES.has(node?.type)||typeof node.data!=='string')return node;
   const ref=store(node.data);
   return ref===null?node:{...node,data:ref};
  });
  savedWorkspace.editors[app]={...graph,nodes};
 }
 const editorState=savedWorkspace===undefined?null:jsonBlob(savedWorkspace);
 if(!payloads.length){
  // Projects with no sizable binary payload can still use the old JSON format.
  const bookJSON=JSON.stringify(book);
  const parts=[bookJSON.slice(0,-1),bookJSON.length>2?',"assets":{':'"assets":{'];
  for(const [index,[id,record]] of records.entries())parts.push(index?',':'',JSON.stringify(id),':',record);
  parts.push('}');
  if(editorState)parts.push(',"workspace":',editorState);
  parts.push('}');
  const legacy=new Blob(parts,{type:JSON_TYPE});
  if(legacy.size<=LEGACY_LIMIT)return legacy;
 }

 const index=jsonBlob({book,workspaceBytes:editorState?.size??0,assets:records.map(([id,record])=>[id,record.size]),...(payloads.length?{payloads:payloads.map(blob=>blob.size)}:{})});
 if([index,editorState,...records.map(([,record])=>record)].some(part=>part?.size>LEGACY_LIMIT)){
  throw Error('個別の素材または編集データが大きすぎるため保存できません。');
 }
 const version=payloads.length?3:2,header=new Uint8Array(HEADER_BYTES);
 header.set(new TextEncoder().encode(`FigureStudio/${version}\n`));
 new DataView(header.buffer).setUint32(INDEX_OFFSET,index.size,true);
 return new Blob([header,index,...(editorState?[editorState]:[]),...records.map(([,record])=>record),...payloads],{type:'application/octet-stream'});
}

export async function readProjectFile(file){
 const header=new Uint8Array(await file.slice(0,HEADER_BYTES).arrayBuffer());
 if(!MAGIC.every((byte,offset)=>header[offset]===byte)){
  if(file.size>LEGACY_LIMIT)throw Error('従来のJSON形式のプロジェクトは400 MB以内で開いてください。');
  const {assets={},...project}=await readJSON(file);
  return {project,assets:Object.entries(assets||{})};
 }
 if(header.length!==HEADER_BYTES||header[VERSION_OFFSET+1]!==10)throw invalid();
 const version=String.fromCharCode(header[VERSION_OFFSET]),binary=version==='3';
 if(version!=='2'&&!binary)throw Error('このプロジェクトを開くには新しいFigure Studioが必要です。');
 const indexBytes=new DataView(header.buffer).getUint32(INDEX_OFFSET,true);
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
 if(binary&&(!Array.isArray(index.payloads)||!index.payloads.length))throw invalid();
 const payloads=binary?index.payloads.map(bytes=>{
  if(!(bytes>0&&bytes<=LEGACY_LIMIT*3/4))throw invalid();
  return bounds(bytes);
 }):[];
 if(offset!==file.size)throw invalid();
 let cachedRef=-1,cachedData;
 function binaryData(ref,expectedBytes){
  if(!Number.isInteger(ref)||ref<0||ref>=payloads.length)throw invalid();
  const [start,end]=payloads[ref];
  if(expectedBytes!==undefined&&expectedBytes!==end-start)throw invalid();
  if(ref!==cachedRef){cachedRef=ref;cachedData=encodeBase64(file.slice(start,end));}
  return cachedData;
 }
 const project=index.book;
 if(index.workspaceBytes)project.workspace=await readJSON(file.slice(...editorBounds));
 let workspaceBytes=index.workspaceBytes;
 if(binary)for(const [,graph] of editorGraphs(project.workspace)){
  for(const node of graph.nodes){
   if(!BINARY_NODE_TYPES.has(node?.type)||typeof node.data!=='number')continue;
   if(!Number.isInteger(node.bytes)||node.bytes<1)throw invalid();
   workspaceBytes+=4*Math.ceil(node.bytes/3)+2-String(node.data).length;
   if(workspaceBytes>LEGACY_LIMIT)throw invalid();
   node.data=await binaryData(node.data,node.bytes);
  }
 }
 async function* readAssets(){
  try{
   for(const [id,range] of records){
    const asset=await readJSON(file.slice(...range));
    if(binary&&asset?.dataUrl&&typeof asset.dataUrl==='object'){
     const {prefix,ref}=asset.dataUrl;
     if(!isBase64Prefix(prefix))throw invalid();
     asset.dataUrl=prefix+await binaryData(ref);
    }
    yield [id,asset];
   }
  }finally{cachedData=null;}
 }
 return {project,assets:readAssets()};
}
