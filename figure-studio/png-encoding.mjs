const SIGNATURE=[137,80,78,71,13,10,26,10];
const CRC_TABLE=Uint32Array.from({length:256},(_,value)=>{for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);return value>>>0;});

function chunk(type,data){
 const bytes=new Uint8Array(data.length+12),view=new DataView(bytes.buffer);view.setUint32(0,data.length);
 bytes.set([...type].map(c=>c.charCodeAt(0)),4);bytes.set(data,8);
 let crc=0xffffffff;for(let i=4;i<bytes.length-4;i++)crc=(crc>>>8)^CRC_TABLE[(crc^bytes[i])&255];
 view.setUint32(bytes.length-4,(crc^0xffffffff)>>>0);return bytes;
}

/** Recompress existing PNG scanlines. No pixel, filter, colour or alpha changes. */
export async function encodePNG(blob,dpi,{compress=true}={}){
 const bytes=new Uint8Array(await blob.arrayBuffer()),view=new DataView(bytes.buffer);
 if(!SIGNATURE.every((v,i)=>bytes[i]===v))throw Error('PNGデータが不正です。');
 const chunks=[],idat=[];let offset=8,ended=false;
 while(offset+12<=bytes.length){
  const length=view.getUint32(offset),end=offset+length+12;if(end>bytes.length)throw Error('PNGデータが途中で切れています。');
  const type=String.fromCharCode(...bytes.subarray(offset+4,offset+8));chunks.push({type,start:offset,end});
  if(type==='IDAT')idat.push(blob.slice(offset+8,end-4));
  offset=end;if(type==='IEND'){ended=true;break;}
 }
 if(chunks[0]?.type!=='IHDR'||!idat.length||!ended)throw Error('PNGの構成が不正です。');
 const pixelsPerMetre=Math.round(Number(dpi)/.0254);if(!Number.isSafeInteger(pixelsPerMetre)||pixelsPerMetre<=0||pixelsPerMetre>0xffffffff)throw Error('PNGの解像度が不正です。');
 const physical=new Uint8Array(9),physicalView=new DataView(physical.buffer);physicalView.setUint32(0,pixelsPerMetre);physicalView.setUint32(4,pixelsPerMetre);physical[8]=1;
 let compressed=null;
 if(compress&&blob.size>262144&&typeof CompressionStream==='function'&&typeof DecompressionStream==='function'){
  try{
   const scanlines=new Blob(idat).stream().pipeThrough(new DecompressionStream('deflate'));
   const candidate=await new Response(scanlines.pipeThrough(new CompressionStream('deflate'))).blob();
   if(candidate.size<idat.reduce((size,part)=>size+part.size,0))compressed=chunk('IDAT',new Uint8Array(await candidate.arrayBuffer()));
  }catch{/* Keep the browser's valid PNG if recompression is unavailable. */}
 }
 const parts=[bytes.subarray(0,8)];let inserted=false;
 for(const part of chunks){
  if(part.type==='pHYs')continue;
  if(part.type==='IDAT'&&compressed){if(!inserted){parts.push(compressed);inserted=true;}continue;}
  parts.push(blob.slice(part.start,part.end));if(part.type==='IHDR')parts.push(chunk('pHYs',physical));
 }
 return new Blob(parts,{type:'image/png'});
}
