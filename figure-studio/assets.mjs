import {uid} from './model.mjs';
export const blobToDataURL=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});
export function dataURLToBlob(url){const match=/^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(url);if(!match)throw Error('ファイルデータが不正です。');const raw=match[2]?atob(match[3]):decodeURIComponent(match[3]);const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new Blob([bytes],{type:match[1]||'application/octet-stream'});}
export function sanitizeSVG(text){
 const xml=new DOMParser().parseFromString(text,'image/svg+xml');if(xml.querySelector('parsererror')||xml.documentElement.localName!=='svg')throw Error('SVGファイルを読み込めません。');
 const allowed=new Set(['svg','g','defs','symbol','use','image','path','rect','circle','ellipse','line','polyline','polygon','text','tspan','textPath','title','desc','metadata','clipPath','mask','linearGradient','radialGradient','stop','pattern','marker','style','filter','feBlend','feColorMatrix','feComponentTransfer','feComposite','feConvolveMatrix','feDiffuseLighting','feDisplacementMap','feDistantLight','feDropShadow','feFlood','feFuncA','feFuncB','feFuncG','feFuncR','feGaussianBlur','feMerge','feMergeNode','feMorphology','feOffset','fePointLight','feSpecularLighting','feSpotLight','feTile','feTurbulence']);
 const safeCSS=v=>!/[\\@]/.test(v)&&!Array.from(v.matchAll(/url\s*\(([^)]*)\)/gi)).some(m=>!/^\s*['"]?#[\w:.-]+['"]?\s*$/.test(m[1]));
 for(const el of [...xml.querySelectorAll('*')]){if(!allowed.has(el.localName)||el.namespaceURI!=='http://www.w3.org/2000/svg'){el.remove();continue;}for(const a of [...el.attributes]){const n=a.localName.toLowerCase(),v=a.value.trim();if(n.startsWith('on')||n==='src'||n==='base'||(n==='href'&&!v.startsWith('#')&&!/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(v))||!safeCSS(v))el.removeAttribute(a.name);}if(el.localName==='style'&&!safeCSS(el.textContent))el.remove();}
 return new XMLSerializer().serializeToString(xml.documentElement);
}
export async function imageAsset(blob,name=blob.name||'Image'){
 if(blob.size>100*1024*1024)throw Error('画像は1枚100 MB以内で読み込んでください。');
 const isSVG=blob.type==='image/svg+xml'||/\.svg$/i.test(name);if(isSVG)blob=new Blob([sanitizeSVG(await blob.text())],{type:'image/svg+xml'});
 const dataUrl=await blobToDataURL(blob);const img=new Image();img.src=dataUrl;await img.decode();
 if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>160000000)throw Error('画像サイズが大きすぎます（最大1.6億画素）。');
 let previewUrl=dataUrl;const max=1800;
 if(img.naturalWidth>max||img.naturalHeight>max||isSVG){const ratio=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.naturalWidth*ratio));c.height=Math.max(1,Math.round(img.naturalHeight*ratio));c.getContext('2d').drawImage(img,0,0,c.width,c.height);previewUrl=c.toDataURL('image/png');c.width=c.height=1;}
 return {id:uid(),name,mime:blob.type,width:img.naturalWidth,height:img.naturalHeight,dataUrl,previewUrl};
}
export function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
