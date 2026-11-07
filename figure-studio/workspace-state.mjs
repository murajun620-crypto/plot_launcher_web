/** Portable, versioned editor snapshots. Object identities stay within each editor. */
const LIMIT=400*1024*1024,MAX_NODES=100000,MAX_ENTRIES=1000000,MAX_DEPTH=100;
const APPS=['plot','mifito'],ACTIVE=['studio',...APPS],FORBIDDEN=new Set(['__proto__','prototype','constructor']);
const VIEWS=new Map([['Int8Array',1],['Uint8Array',1],['Uint8ClampedArray',1],['Int16Array',2],['Uint16Array',2],['Int32Array',4],['Uint32Array',4],['Float32Array',4],['Float64Array',8],['BigInt64Array',8],['BigUint64Array',8],['DataView',1]]);
const tag=value=>Object.prototype.toString.call(value).slice(8,-1);
const fail=message=>{throw Error(message||'編集画面の保存データが不正です。');};
const own=(object,key)=>Object.hasOwn(object,key);
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&[null,'Object'].includes(Object.getPrototypeOf(value)?.constructor?.name??null);
function shape(value,keys){if(!plain(value)||Object.keys(value).some(key=>!keys.includes(key)))fail();}
function integer(value,max=LIMIT){return Number.isSafeInteger(value)&&value>=0&&value<=max;}
function safeKey(value){return typeof value==='string'&&!FORBIDDEN.has(value);}
function utf8Length(value){let length=0;for(let i=0;i<value.length;i++){const code=value.charCodeAt(i);length+=code<128?1:code<2048?2:code>=0xd800&&code<=0xdbff&&value.charCodeAt(i+1)>=0xdc00&&value.charCodeAt(i+1)<=0xdfff?(i++,4):3;}return length;}
function jsonBytes(value,ancestors=new Set(),depth=0){
 if(depth>MAX_DEPTH||value===undefined||typeof value==='function'||typeof value==='symbol'||typeof value==='bigint')fail();
 if(value===null)return 4;
 if(typeof value==='string')return utf8Length(JSON.stringify(value));
 if(typeof value==='boolean')return value?4:5;
 if(typeof value==='number'){if(!Number.isFinite(value))fail();return String(value).length;}
 if(ancestors.has(value)||!Array.isArray(value)&&!plain(value))fail();ancestors.add(value);
 let size=2;const entries=Array.isArray(value)?value.map(v=>[null,v]):Object.entries(value);
 if(entries.length>MAX_ENTRIES)fail();
 for(const [key,entry]of entries){if(key!==null){if(!safeKey(key))fail();size+=utf8Length(JSON.stringify(key))+1;}size+=jsonBytes(entry,ancestors,depth+1)+1;if(size>LIMIT)fail('編集画面の保存データは400 MB以内にしてください。');}
 ancestors.delete(value);return size;
}
function base64(bytes){let output=[];for(let i=0;i<bytes.length;i+=24576)output.push(btoa(String.fromCharCode(...bytes.subarray(i,i+24576))));return output.join('');}
function base64Bytes(value,expected){
 if(typeof value!=='string'||value.length>Math.ceil(LIMIT/3)*4||!integer(expected)||value.length%4!==0||! /^[A-Za-z0-9+/]*={0,2}$/.test(value))fail();
 const padding=value.endsWith('==')?2:value.endsWith('=')?1:0,bytes=value.length/4*3-padding;
 if(bytes!==expected)fail();
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
 if(padding===2&&(alphabet.indexOf(value.at(-3))&15)||padding===1&&(alphabet.indexOf(value.at(-2))&3))fail();
 return bytes;
}
function fromBase64(value,size){const result=new Uint8Array(size);let offset=0;for(let i=0;i<value.length;i+=32768){const part=atob(value.slice(i,i+32768));for(let n=0;n<part.length;n++)result[offset++]=part.charCodeAt(n);}return result;}

async function encodeGraph(root,budget){
 const nodes=[],seen=new WeakMap();let entries=0;
 const account=count=>{budget.bytes+=count;if(budget.bytes>LIMIT)fail('編集画面の保存データは400 MB以内にしてください。');};
 async function visit(value,depth=0){
  if(depth>MAX_DEPTH)fail('編集画面の保存データが深すぎます。');
  if(value===null||typeof value==='boolean')return value;
  if(typeof value==='string'){account(utf8Length(value));return value;}
  if(typeof value==='number')return Number.isFinite(value)&&!Object.is(value,-0)?value:{$:'number',value:Object.is(value,-0)?'-0':String(value)};
  if(value===undefined)return {$:'undefined'};
  if(typeof value==='bigint'){const text=String(value);if(text.length>1000)fail();return {$:'bigint',value:text};}
  if(typeof value!=='object')fail('関数などの実行状態はプロジェクトへ保存できません。');
  if(seen.has(value))return {$:'ref',id:seen.get(value)};
  if(nodes.length>=MAX_NODES)fail('編集画面の保存データに項目が多すぎます。');
  const id=nodes.length;seen.set(value,id);nodes.push(null);const type=tag(value);let node;
  const count=n=>{entries+=n;if(entries>MAX_ENTRIES)fail();};
  if(type==='ArrayBuffer'){
   const bytes=new Uint8Array(value);account(Math.ceil(bytes.length/3)*4);node={type:'buffer',bytes:bytes.length,data:base64(bytes)};
  }else if(type==='Blob'||type==='File'){
   if(!integer(value.size)||typeof value.type!=='string'||value.type.length>255)fail();account(Math.ceil(value.size/3)*4);
   node={type:type.toLowerCase(),bytes:value.size,data:base64(new Uint8Array(await value.arrayBuffer())),mime:value.type};
   if(type==='File'){if(typeof value.name!=='string'||value.name.length>1024||!integer(value.lastModified,Number.MAX_SAFE_INTEGER))fail();node.name=value.name;node.lastModified=value.lastModified;}
  }else if(ArrayBuffer.isView(value)&&VIEWS.has(type)){
   node={type:'view',name:type,buffer:await visit(value.buffer,depth+1),offset:value.byteOffset,bytes:value.byteLength};
  }else if(type==='Date'){
   if(!Number.isFinite(value.getTime()))fail();node={type:'date',value:value.toISOString()};
  }else if(type==='Map'){
   count(value.size);node={type:'map',entries:[]};for(const [key,item]of value)node.entries.push([await visit(key,depth+1),await visit(item,depth+1)]);
  }else if(type==='Set'){
   count(value.size);node={type:'set',values:[]};for(const item of value)node.values.push(await visit(item,depth+1));
  }else if(Array.isArray(value)){
   if(!integer(value.length,MAX_ENTRIES))fail();const keys=Object.keys(value);count(keys.length);node={type:'array',length:value.length,entries:[]};
   for(const key of keys){if(!/^(0|[1-9]\d*)$/.test(key)||Number(key)>=value.length)fail();node.entries.push([Number(key),await visit(value[key],depth+1)]);}
  }else{
   if(!plain(value)&&!(type==='Object'&&Object.getPrototypeOf(value)?.constructor?.name==='History'))fail('この編集データには保存できない種類のオブジェクトが含まれています。');
   if(Object.getOwnPropertySymbols(value).length)fail();const keys=Object.keys(value);count(keys.length);node={type:'object',nullPrototype:Object.getPrototypeOf(value)===null,entries:[]};
   for(const key of keys){if(!safeKey(key)||Object.getOwnPropertyDescriptor(value,key)?.get||Object.getOwnPropertyDescriptor(value,key)?.set)fail();account(utf8Length(key));node.entries.push([key,await visit(value[key],depth+1)]);}
  }
  nodes[id]=node;return {$:'ref',id};
 }
 return {version:1,root:await visit(root),nodes};
}

function validateGraph(graph,budget){
 shape(graph,['version','root','nodes']);if(graph.version!==1||!Array.isArray(graph.nodes)||graph.nodes.length>MAX_NODES)fail();
 const nodes=graph.nodes;let entries=0;
 const count=n=>{entries+=n;if(entries>MAX_ENTRIES)fail();};
 function token(value){
  if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return;
  shape(value,['$','id','value']);
  if(value.$==='ref'){if(Object.keys(value).length!==2||!integer(value.id,nodes.length-1))fail();}
  else if(value.$==='undefined'){if(Object.keys(value).length!==1)fail();}
  else if(value.$==='number'){if(Object.keys(value).length!==2||!['NaN','Infinity','-Infinity','-0'].includes(value.value))fail();}
  else if(value.$==='bigint'){if(Object.keys(value).length!==2||typeof value.value!=='string'||value.value.length>1000||! /^-?(0|[1-9]\d*)$/.test(value.value))fail();}
  else fail();
 }
 const pairs=value=>{if(!Array.isArray(value))fail();count(value.length);for(const pair of value)if(!Array.isArray(pair)||pair.length!==2)fail();};
 token(graph.root);
 for(const node of nodes){
  if(!plain(node)||typeof node.type!=='string')fail();
  if(node.type==='buffer'||node.type==='blob'||node.type==='file'){
   shape(node,node.type==='buffer'?['type','bytes','data']:node.type==='blob'?['type','bytes','data','mime']:['type','bytes','data','mime','name','lastModified']);
   budget.bytes+=base64Bytes(node.data,node.bytes);if(budget.bytes>LIMIT)fail();
   if(node.type!=='buffer'&&(typeof node.mime!=='string'||node.mime.length>255||/[\x00-\x1f]/.test(node.mime)))fail();
   if(node.type==='file'&&(typeof node.name!=='string'||node.name.length>1024||!integer(node.lastModified,Number.MAX_SAFE_INTEGER)))fail();
  }else if(node.type==='view'){
   shape(node,['type','name','buffer','offset','bytes']);if(!VIEWS.has(node.name)||!integer(node.offset)||!integer(node.bytes))fail();token(node.buffer);
   if(node.buffer?.$!=='ref'||nodes[node.buffer.id]?.type!=='buffer'||node.offset+node.bytes>nodes[node.buffer.id].bytes||node.offset%VIEWS.get(node.name)||node.bytes%VIEWS.get(node.name))fail();
  }else if(node.type==='date'){
   shape(node,['type','value']);if(typeof node.value!=='string'||!Number.isFinite(Date.parse(node.value))||new Date(node.value).toISOString()!==node.value)fail();
  }else if(node.type==='array'||node.type==='object'){
   shape(node,node.type==='array'?['type','length','entries']:['type','nullPrototype','entries']);pairs(node.entries);const keys=new Set();
   if(node.type==='array'&&!integer(node.length,MAX_ENTRIES)||node.type==='object'&&typeof node.nullPrototype!=='boolean')fail();
   for(const [key,value]of node.entries){if(keys.has(key)||!(node.type==='array'?integer(key,node.length-1):safeKey(key)))fail();keys.add(key);token(value);}
  }else if(node.type==='map'){
   shape(node,['type','entries']);pairs(node.entries);for(const [key,value]of node.entries){token(key);token(value);}
  }else if(node.type==='set'){
   shape(node,['type','values']);if(!Array.isArray(node.values))fail();count(node.values.length);node.values.forEach(token);
  }else fail();
 }
 const visited=new Set();
 function walk(value,depth=0){if(depth>MAX_DEPTH)fail();if(value?.$!=='ref'||visited.has(value.id))return;visited.add(value.id);const node=nodes[value.id];
  if(node.type==='view')walk(node.buffer,depth+1);else if(node.type==='set')node.values.forEach(v=>walk(v,depth+1));else if(node.entries)for(const [key,item]of node.entries){if(node.type==='map')walk(key,depth+1);walk(item,depth+1);}}
 walk(graph.root);
 return graph;
}

function decodeGraph(graph){
 const values=graph.nodes.map(node=>{
  if(node.type==='array')return new Array(node.length);
  if(node.type==='object')return node.nullPrototype?Object.create(null):{};
  if(node.type==='map')return new Map();if(node.type==='set')return new Set();if(node.type==='date')return new Date(node.value);
  if(node.type==='buffer')return fromBase64(node.data,node.bytes).buffer;
  if(node.type==='blob')return new Blob([fromBase64(node.data,node.bytes)],{type:node.mime});
  if(node.type==='file')return new File([fromBase64(node.data,node.bytes)],node.name,{type:node.mime,lastModified:node.lastModified});
  return null;
 });
 function token(value){if(value===null||typeof value!=='object')return value;if(value.$==='ref')return values[value.id];if(value.$==='undefined')return undefined;if(value.$==='bigint')return BigInt(value.value);return value.value==='-0'?-0:Number(value.value);}
 graph.nodes.forEach((node,index)=>{if(node.type==='view'){const buffer=values[node.buffer.id],Constructor=globalThis[node.name];values[index]=node.name==='DataView'?new DataView(buffer,node.offset,node.bytes):new Constructor(buffer,node.offset,node.bytes/VIEWS.get(node.name));}});
 graph.nodes.forEach((node,index)=>{const value=values[index];if(node.type==='array'||node.type==='object')for(const [key,item]of node.entries)value[key]=token(item);else if(node.type==='map')for(const [key,item]of node.entries)value.set(token(key),token(item));else if(node.type==='set')for(const item of node.values)value.add(token(item));});
 return token(graph.root);
}

function validateEnvelope(value){
 shape(value,['format','version','active','editors']);if(value.format!=='figure-studio-workspace'||value.version!==1||!ACTIVE.includes(value.active))fail();
 shape(value.editors,APPS);if(APPS.some(app=>!own(value.editors,app)))fail();
 if(jsonBytes(value)>LIMIT)fail('編集画面の保存データは400 MB以内にしてください。');
 const budget={bytes:0};for(const app of APPS)if(value.editors[app]!==null){
  const graph=validateGraph(value.editors[app],budget),root=graph.root?.$==='ref'?graph.nodes[graph.root.id]:null;
  if(root?.type!=='object'||!root.entries.some(([key,value])=>key==='version'&&value===1)||!root.entries.some(([key,value])=>key==='app'&&value===app))fail();
 }
}

export async function encodeWorkspaceState(value){
 shape(value,['version','active','editors']);if(value.version!==1||!ACTIVE.includes(value.active))fail();shape(value.editors,APPS);
 const editors={},budget={bytes:0};for(const app of APPS){const state=value.editors[app]??null;if(state!==null&&(!plain(state)||state.version!==1||state.app!==app))fail();editors[app]=state===null?null:await encodeGraph(state,budget);}
 const encoded={format:'figure-studio-workspace',version:1,active:value.active,editors};validateEnvelope(encoded);return encoded;
}

export async function decodeWorkspaceState(value){
 // Validate BOTH editor graphs, sizes, node types and every reference before
 // allocating binary data or exposing any state to the live editors.
 validateEnvelope(value);
 const editors={};for(const app of APPS){const state=value.editors[app]===null?null:decodeGraph(value.editors[app]);if(state!==null&&(!plain(state)||state.version!==1||state.app!==app))fail();editors[app]=state;}
 return {version:1,active:value.active,editors};
}
