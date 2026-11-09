import {bounds} from './model.mjs?v=text-fit-v0710-1';
const ns='http://www.w3.org/2000/svg';

export function selectionRasterSize(box,objects,assets,{dpi=600,maxSide=16384,maxPixels=64000000}={}){
 let pixelsPerPoint=dpi/72;
 for(const object of objects){const asset=assets.get(object.assetId);if(object.type==='image'&&asset?.mime!=='image/svg+xml'&&asset?.width>0&&asset?.height>0&&object.w>0&&object.h>0)pixelsPerPoint=Math.max(pixelsPerPoint,asset.width/object.w,asset.height/object.h);}
 pixelsPerPoint=Math.min(pixelsPerPoint,maxSide/box.w,maxSide/box.h,Math.sqrt(maxPixels/(box.w*box.h)));
 return {width:Math.max(1,Math.round(box.w*pixelsPerPoint)),height:Math.max(1,Math.round(box.h*pixelsPerPoint)),dpi:pixelsPerPoint*72};
}

/** Render the captured selection, using original assets and a transparent background. */
export async function selectionPNG({objects,assets,draw,prepare=async()=>{},documentRef=document,ImageRef=Image,URLRef=URL,SerializerRef=XMLSerializer}){
 await prepare(objects);await documentRef.fonts?.ready;
 const root=documentRef.createElementNS(ns,'svg'),group=documentRef.createElementNS(ns,'g');root.append(group);
 Object.assign(root.style,{position:'fixed',left:'-100000px',top:'0',opacity:'0',pointerEvents:'none',overflow:'visible'});
 let canvas,url;
 try{
  for(const object of objects){const node=documentRef.createElementNS(ns,'g');draw(object,node,assets);node.removeAttribute('data-id');node.removeAttribute('style');group.append(node);}
  documentRef.body.append(root);
  const logical=bounds(objects),ink=group.getBBox();if(!logical)throw Error('コピーする画像を選択してください。');
  const pad=Math.max(0,...objects.filter(o=>o.type!=='image'&&o.stroke&&o.stroke!=='none').map(o=>(o.strokeWidth||0)*(o.type==='text'&&o.strokeAlignment==='outside'?1:.5)));
  const x=Math.min(logical.x,ink.x)-pad,y=Math.min(logical.y,ink.y)-pad;
  const box={x,y,w:Math.max(1,Math.max(logical.x+logical.w,ink.x+ink.width)+pad-x),h:Math.max(1,Math.max(logical.y+logical.h,ink.y+ink.height)+pad-y)};
  const size=selectionRasterSize(box,objects,assets);
  root.removeAttribute('style');root.setAttribute('xmlns',ns);root.setAttribute('width',size.width);root.setAttribute('height',size.height);root.setAttribute('viewBox',`${box.x} ${box.y} ${box.w} ${box.h}`);
  const markup=new SerializerRef().serializeToString(root);root.remove();
  url=URLRef.createObjectURL(new Blob([markup],{type:'image/svg+xml'}));const image=new ImageRef();image.src=url;await image.decode();
  canvas=documentRef.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
  const context=canvas.getContext('2d');if(!context)throw Error('コピー用の画像を作成できません。');context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(image,0,0,size.width,size.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('コピー用のPNGを作成できません。');return {blob,...size};
 }finally{root.remove();if(url)URLRef.revokeObjectURL(url);if(canvas)canvas.width=canvas.height=1;}
}

/** Call write synchronously inside the copy gesture; PNG preparation may be async. */
export function writeSelectionImage({renderPNG,clipboardRef=globalThis.navigator?.clipboard,ClipboardItemRef=globalThis.ClipboardItem}){
 if(!clipboardRef?.write||typeof ClipboardItemRef!=='function')return null;
 const ready=Promise.resolve().then(renderPNG),png=ready.then(result=>result.blob);png.catch(()=>{});
 try{
  const item=new ClipboardItemRef({'image/png':png});
  const written=clipboardRef.write([item]);return Promise.resolve(written).then(()=>ready);
 }catch(error){return Promise.reject(error);}
}

const pngHashes=new WeakMap(),pixelHashes=new WeakMap();
function pngHash(blob){if(!pngHashes.has(blob))pngHashes.set(blob,blob.arrayBuffer().then(data=>crypto.subtle.digest('SHA-256',data)).then(data=>Array.from(new Uint8Array(data),b=>b.toString(16).padStart(2,'0')).join('')));return pngHashes.get(blob);}
async function pngSize(blob){const bytes=new Uint8Array(await blob.slice(0,24).arrayBuffer());if(bytes.length<24||![137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))return null;const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);return {width:view.getUint32(16),height:view.getUint32(20)};}
async function pixelHash(blob){
 if(pixelHashes.has(blob))return pixelHashes.get(blob);
 const work=(async()=>{let bitmap,image,url,canvas;try{if(typeof createImageBitmap==='function')bitmap=await createImageBitmap(blob);else{image=new Image();url=URL.createObjectURL(blob);image.src=url;await image.decode();}canvas=document.createElement('canvas');canvas.width=bitmap?.width||image.naturalWidth;canvas.height=bitmap?.height||image.naturalHeight;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap||image,0,0);const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;const digest=await crypto.subtle.digest('SHA-256',pixels);return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}finally{bitmap?.close();if(url)URL.revokeObjectURL(url);if(canvas)canvas.width=canvas.height=1;}})();pixelHashes.set(blob,work);return work;
}
/** Recognize our PNG without putting an internal identifier in other apps. */
export async function matchesSelectionPNG(file,reference,{fingerprint=pixelHash}={}){
 if(file?.type!=='image/png'||reference?.type!=='image/png')return false;
 try{
  const [a,b]=await Promise.all([pngSize(file),pngSize(reference)]);if(!a||!b||a.width!==b.width||a.height!==b.height||a.width*a.height>64016384)return false;
  if(file.size===reference.size&&await pngHash(file)===await pngHash(reference))return true;
  // Browsers can re-encode PNG bytes or strip metadata on the OS clipboard.
  const [x,y]=await Promise.all([fingerprint(file),fingerprint(reference)]);return x===y;
 }catch{return false;}
}

export function studioPasteObjects(data,internal,marker){
 try{const raw=data.getData('application/x-figure-studio');if(raw)return JSON.parse(raw);}catch{}
 return data.getData('text/plain')===marker?internal:null;
}
