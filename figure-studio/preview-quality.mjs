import {blobToDataURL,dataURLToBlob} from './assets.mjs?v=group-selection-v078-1';
import {automaticPreviewQuality} from './image-resolution.mjs?v=image-quality-v066-1';

export const PREVIEW_QUALITIES=Object.freeze([1,.5,.25]);
export function normalizePreviewQuality(value){if(value==='auto')return 'auto';const n=Number(value);return PREVIEW_QUALITIES.includes(n)?n:1;}
export function previewDimensions(asset,quality){
 const normalized=normalizePreviewQuality(quality),q=normalized==='auto'?1:normalized,width=Number(asset.width),height=Number(asset.height);
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1)throw Error('画像の寸法を取得できません。');
 return {width:Math.max(1,Math.round(width*q)),height:Math.max(1,Math.round(height*q))};
}

const idle=()=>new Promise(resolve=>{
 if(typeof requestIdleCallback==='function')requestIdleCallback(resolve,{timeout:500});
 else setTimeout(resolve,0);
});

/** Fractions refer to each source-image dimension. Full SVG stays vector. */
export async function renderReducedPreview(asset,quality){
 const normalized=normalizePreviewQuality(quality),q=normalized==='auto'?1:normalized;
 if(q===1)return asset.dataUrl;
 const {width,height}=previewDimensions(asset,q);
 let bitmap,image,canvas;
 try{
  // Native bitmap resizing avoids allocating a full-resolution canvas for a
  // large microscopy image. SVGs and unsupported codecs use the Image path.
  if(typeof createImageBitmap==='function'&&asset.mime!=='image/svg+xml'){
   try{bitmap=await createImageBitmap(dataURLToBlob(asset.dataUrl),{resizeWidth:width,resizeHeight:height,resizeQuality:'high'});}catch{/* browser Image fallback */}
  }
  if(!bitmap){image=new Image();image.src=asset.dataUrl;await image.decode();}
  canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('プレビュー用の描画領域を作成できません。');
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(bitmap||image,0,0,width,height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob)throw Error('軽量プレビューを作成できません。');
  return await blobToDataURL(blob);
 }finally{
  bitmap?.close();if(image)image.src='';if(canvas)canvas.width=canvas.height=1;
 }
}

/**
 * Small, ephemeral LRU. Assets remain untouched, so caches never enter saves.
 * getURL is synchronous and never resizes on a drag/resize event. onReady only
 * needs to replace current canvas image hrefs; avoid a full editor rerender.
 */
export function createPreviewQuality({quality=1,onReady=()=>{},onError=()=>{},renderPreview=renderReducedPreview,schedule=idle,maxBytes=64*1024*1024,maxEntries=32}={}){
 let current=normalizePreviewQuality(quality),sequence=0,running=false,disposed=false,epoch=0,bytes=0;
 let identities=new WeakMap();
 const entries=new Map(),queue=[],idleWaiters=[];
 const identity=asset=>{
  let item=identities.get(asset);
  if(!item||item.source!==asset.dataUrl){item={id:++sequence,source:asset.dataUrl};identities.set(asset,item);}
  return item.id;
 };
 function key(asset,q){return `${identity(asset)}:${q}`;}
 const wanted=entry=>current==='auto'||entry.quality===current;
 function touch(k,entry){entries.delete(k);entries.set(k,entry);}
 function trim(keep){
  let ready=[...entries.values()].filter(e=>e.state==='ready').length;
  for(const[k,e]of entries){
   if(bytes<=maxBytes&&ready<=maxEntries)break;
   // Keep the just-completed result even when it alone exceeds the soft cap.
   // This avoids repeatedly processing a single very large source image.
   if(k===keep||e.state!=='ready')continue;
   bytes-=e.bytes;ready--;entries.delete(k);
  }
 }
 function settle(){if(!running&&!queue.length)while(idleWaiters.length)idleWaiters.shift()();}
 async function pump(){
  if(running||disposed)return;running=true;
  try{
   while(queue.length&&!disposed){
    const entry=queue.shift(),token=epoch;
    if(entries.get(entry.key)!==entry)continue;
    if(!wanted(entry)){entries.delete(entry.key);continue;}
    await schedule();
    if(disposed||token!==epoch||entries.get(entry.key)!==entry)continue;
    if(!wanted(entry)){entries.delete(entry.key);continue;}
    try{
     const url=await renderPreview(entry.asset,entry.quality);
     if(disposed||token!==epoch||entries.get(entry.key)!==entry)continue;
     if(typeof url!=='string'||!url.startsWith('data:image/'))throw Error('プレビューデータが不正です。');
     entry.url=url;entry.state='ready';entry.bytes=url.length*2;bytes+=entry.bytes;touch(entry.key,entry);trim(entry.key);
     if(wanted(entry))onReady(entry.asset,url,current);
    }catch(error){
     if(disposed||token!==epoch||entries.get(entry.key)!==entry)continue;
     entry.state='error';
     if(wanted(entry))onError(error,entry.asset,current);
    }
   }
  }finally{running=false;settle();if(queue.length&&!disposed)void pump();}
 }
 return {
  get quality(){return current;},
  setQuality(value){
   current=normalizePreviewQuality(value);
   // An explicit user choice may retry a temporary decode/canvas failure.
   // Ordinary rerenders still retain the error to avoid a busy retry loop.
   for(const[k,e]of entries)if(e.state==='error'&&wanted(e))entries.delete(k);
   return current;
  },
  getURL(asset,view){
   if(!asset)return '';
   if(disposed||current===1)return asset.dataUrl;
   const quality=current==='auto'?automaticPreviewQuality(asset,view):current;
   if(quality===1)return asset.dataUrl;
   const k=key(asset,quality),existing=entries.get(k);
   if(existing){if(existing.state==='ready'){touch(k,existing);return existing.url;}return asset.dataUrl;}
   const entry={key:k,asset,quality,state:'queued',bytes:0};entries.set(k,entry);queue.push(entry);void pump();
   return asset.dataUrl;
  },
  // Optional hook after replacing a project; outstanding results are ignored.
  clear(){epoch++;entries.clear();queue.length=0;bytes=0;identities=new WeakMap();settle();},
  dispose(){disposed=true;this.clear();},
  whenIdle(){return running||queue.length?new Promise(resolve=>idleWaiters.push(resolve)):Promise.resolve();}
 };
}
