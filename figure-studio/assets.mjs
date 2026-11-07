import {uid} from './model.mjs';
import {svgPhysicalSize,svgMiFiToBodySize,validatedMiFiToBodySize} from './physical-size.mjs?v=0.3.5-1';
export const blobToDataURL=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});
export function dataURLToBlob(url){const match=/^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(url);if(!match)throw Error('ファイルデータが不正です。');const raw=match[2]?atob(match[3]):decodeURIComponent(match[3]);const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new Blob([bytes],{type:match[1]||'application/octet-stream'});}
export function sanitizeSVG(text){
 const xml=new DOMParser().parseFromString(text,'image/svg+xml');if(xml.querySelector('parsererror')||xml.documentElement.localName!=='svg')throw Error('SVGファイルを読み込めません。');
 const allowed=new Set(['svg','g','defs','symbol','use','image','path','rect','circle','ellipse','line','polyline','polygon','text','tspan','textPath','title','desc','metadata','clipPath','mask','linearGradient','radialGradient','stop','pattern','marker','style','filter','feBlend','feColorMatrix','feComponentTransfer','feComposite','feConvolveMatrix','feDiffuseLighting','feDisplacementMap','feDistantLight','feDropShadow','feFlood','feFuncA','feFuncB','feFuncG','feFuncR','feGaussianBlur','feMerge','feMergeNode','feMorphology','feOffset','fePointLight','feSpecularLighting','feSpotLight','feTile','feTurbulence']);
 const safeCSS=v=>!/[\\@]/.test(v)&&!Array.from(v.matchAll(/url\s*\(([^)]*)\)/gi)).some(m=>!/^\s*['"]?#[\w:.-]+['"]?\s*$/.test(m[1]));
 for(const el of [...xml.querySelectorAll('*')]){if(!allowed.has(el.localName)||el.namespaceURI!=='http://www.w3.org/2000/svg'){el.remove();continue;}for(const a of [...el.attributes]){const n=a.localName.toLowerCase(),v=a.value.trim();if(n.startsWith('on')||n==='src'||n==='base'||(n==='href'&&!v.startsWith('#')&&!/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(v))||!safeCSS(v))el.removeAttribute(a.name);}if(el.localName==='style'&&!safeCSS(el.textContent))el.remove();}
 return new XMLSerializer().serializeToString(xml.documentElement);
}
function svgTextSizes(text){
 const xml=new DOMParser().parseFromString(text,'image/svg+xml'),root=xml.documentElement;
 if(xml.querySelector('parsererror')||root.localName!=='svg')return {};
 const physicalSize=svgPhysicalSize({width:root.getAttribute('width'),height:root.getAttribute('height'),viewBox:root.getAttribute('viewBox')});
 const mifitoBodySize=svgMiFiToBodySize({bodyWidthMm:root.getAttribute('data-mifito-body-width-mm'),bodyHeightMm:root.getAttribute('data-mifito-body-height-mm')},physicalSize);
 return {physicalSize,mifitoBodySize};
}
export async function imagePhysicalSize(asset){
 const stored=asset?.physicalSize;
 if(typeof stored?.width==='number'&&typeof stored?.height==='number'){
  const valid=svgPhysicalSize({width:`${stored.width}pt`,height:`${stored.height}pt`});if(valid)return valid;
 }
 // Older saved assets predate the metadata. Read their original SVG lengths
 // directly, without decoding an Image or changing the saved asset.
 if(asset?.mime!=='image/svg+xml'||typeof asset.dataUrl!=='string')return null;
 try{return svgTextSizes(await dataURLToBlob(asset.dataUrl).text()).physicalSize||null;}catch{return null;}
}
export async function imageMiFiToBodySize(asset){
 if(asset?.mime!=='image/svg+xml')return null;
 if(asset.mifitoBodySize){const stored=validatedMiFiToBodySize(asset.mifitoBodySize,await imagePhysicalSize(asset));if(stored)return stored;}
 // Existing project files can retain an explicit MiFiTo SVG without the
 // parsed metadata. Recover it without changing the serialized asset.
 if(typeof asset.dataUrl!=='string')return null;
 try{return svgTextSizes(await dataURLToBlob(asset.dataUrl).text()).mifitoBodySize||null;}catch{return null;}
}
export async function imageAsset(blob,name=blob.name||'Image'){
 if(blob.size>100*1024*1024)throw Error('画像は1枚100 MB以内で読み込んでください。');
 const isSVG=blob.type==='image/svg+xml'||/\.svg$/i.test(name);let physicalSize=null,mifitoBodySize=null;
 if(isSVG){const clean=sanitizeSVG(await blob.text());({physicalSize,mifitoBodySize}=svgTextSizes(clean));blob=new Blob([clean],{type:'image/svg+xml'});}
 const dataUrl=await blobToDataURL(blob);const img=new Image();img.src=dataUrl;await img.decode();
 if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>160000000)throw Error('画像サイズが大きすぎます（最大1.6億画素）。');
 // Keep the original for full-quality canvas rendering and export. Reduced
 // previews are prepared lazily by preview-quality.mjs, outside project data.
 return {id:uid(),name,mime:blob.type,width:img.naturalWidth,height:img.naturalHeight,dataUrl,...(physicalSize?{physicalSize}:{}),...(mifitoBodySize?{mifitoBodySize}:{})};
}
export function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
