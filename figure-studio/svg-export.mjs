import {sanitizeSVG} from './assets.mjs?v=nested-groups-v0712-1';

const SVG='http://www.w3.org/2000/svg',XLINK='http://www.w3.org/1999/xlink';
const href=node=>node.getAttribute('href')||node.getAttributeNS(XLINK,'href')||'';
const elements=root=>[root,...root.querySelectorAll('*')];

function parseSVG(text){
 const xml=new DOMParser().parseFromString(text,'image/svg+xml');
 if(xml.querySelector('parsererror')||xml.documentElement.localName!=='svg'||xml.documentElement.namespaceURI!==SVG)throw Error('SVG画像の書き出しに失敗しました。');
 return xml.documentElement;
}
function svgDataText(url){
 const match=/^data:image\/svg\+xml(?:;charset=[^;,]+)?(;base64)?,([\s\S]*)$/i.exec(url);
 if(!match)return null;
 if(!match[1])return decodeURIComponent(match[2]);
 return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0)));
}

// Resolve each embedded document's CSS in isolation, before combining its IDs
// and contents with other plots. Office need not interpret its style sheet.
function inlineStyleSheets(root){
 if(!root.querySelector('style'))return;
 const host=document.createElement('div');host.style.cssText='all:initial;position:fixed;left:-100000px;top:0;opacity:0;pointer-events:none';
 const shadow=host.attachShadow({mode:'closed'});shadow.append(root);document.body.append(host);
 try{
  const nodes=elements(root).filter(node=>!['style','metadata','title','desc'].includes(node.localName));
  const rules=[...root.querySelectorAll('style')].flatMap(style=>[...style.sheet.cssRules]).filter(rule=>rule.selectorText&&rule.style);
  // Read before writing: inherited styles must not change during collection.
  // Materialize only declarations actually matched by a stylesheet. Freezing
  // every inherited value would break glyphs whose fill comes from <use>.
  const paints=nodes.map(node=>{const keys=new Set(rules.filter(rule=>node.matches(rule.selectorText)).flatMap(rule=>[...rule.style]));const computed=getComputedStyle(node);return [...keys].map(key=>[key,computed.getPropertyValue(key)]);});
  nodes.forEach((node,index)=>{for(const[key,value]of paints[index])if(value)node.style.setProperty(key,value);});
  for(const style of root.querySelectorAll('style'))style.remove();
 }finally{root.remove();host.remove();}
}

function uniqueReferences(root,prefix){
 const ids=new Map();
 for(const node of elements(root)){const id=node.getAttribute('id');if(id){const next=`${prefix}${ids.size}`;ids.set(id,next);node.setAttribute('id',next);}}
 for(const node of elements(root))for(const attr of [...node.attributes]){
  if(attr.localName==='id')continue;
  let value=attr.value;
  if(attr.localName==='href'&&value.startsWith('#')&&ids.has(value.slice(1)))value='#'+ids.get(value.slice(1));
  value=value.replace(/url\(\s*(['"]?)([^)]*?)\1\s*\)/gi,(match,quote,target)=>{
   // Computed CSS can expand a local URL to the current document's URL.
   const id=target.slice(target.lastIndexOf('#')+1);return target.includes('#')&&ids.has(id)?`url(#${ids.get(id)})`:match;
  });
  if(value!==attr.value)attr.value=value;
 }
}

function inlineImages(root,state,depth=0){
 if(depth>16)throw Error('SVG画像の入れ子が深すぎます。');
 for(const image of [...root.querySelectorAll('image')]){
  const text=svgDataText(href(image));if(text===null)continue;
  const index=++state.count;if(index>1000)throw Error('SVG画像が多すぎます。');
  let nested=parseSVG(text);
  inlineImages(nested,state,depth+1);
  // Never attach untrusted SVG to the live document while resolving its CSS.
  nested=parseSVG(sanitizeSVG(new XMLSerializer().serializeToString(nested)));
  inlineStyleSheets(nested);
  uniqueReferences(nested,`${state.prefix}${index}-`);
  if(!nested.hasAttribute('viewBox')){
   const units={px:1,pt:96/72,pc:16,mm:96/25.4,cm:96/2.54,in:96};
   const length=value=>{const m=/^\s*([\d.+e-]+)\s*(px|pt|pc|mm|cm|in)?\s*$/i.exec(value||'');return m?Number(m[1])*(units[(m[2]||'px').toLowerCase()]):NaN;};
   const w=length(nested.getAttribute('width')),h=length(nested.getAttribute('height'));
   if(w>0&&h>0)nested.setAttribute('viewBox',`0 0 ${w} ${h}`);
  }
  // A nested viewport retains viewBox scaling and image-edge clipping, without
  // using an SVG document as an <image> source (unsupported by Office).
  for(const key of ['x','y','width','height']){nested.style.removeProperty(key);nested.setAttribute(key,image.getAttribute(key)||(['x','y'].includes(key)?'0':'100%'));}
  nested.setAttribute('preserveAspectRatio',image.getAttribute('preserveAspectRatio')||'xMidYMid meet');
  nested.setAttribute('overflow','hidden');
  const wrapper=root.ownerDocument.createElementNS(SVG,'g');
  for(const attr of image.attributes)if(!['href','x','y','width','height','preserveAspectRatio'].includes(attr.localName))wrapper.setAttributeNS(attr.namespaceURI,attr.name,attr.value);
  wrapper.append(root.ownerDocument.importNode(nested,true));image.replaceWith(wrapper);
 }
}

/** Standalone SVG 1.1 output, with vector plots and embedded raster pixels. */
export function serializeOfficeSVG(source){
 const root=source.cloneNode(true),existingIds=new Set(elements(root).map(node=>node.id).filter(Boolean));
 let prefix='studio-export-';while([...existingIds].some(id=>id.startsWith(prefix)))prefix+='x';
 inlineImages(root,{count:0,prefix});
 for(const node of elements(root)){
  const link=href(node);if(!link)continue;
  // SVG 1.1 readers use xlink:href. Keep one copy of large PNG data URLs.
  node.removeAttribute('href');node.setAttributeNS(XLINK,'xlink:href',link);
 }
 root.setAttribute('version','1.1');root.setAttributeNS('http://www.w3.org/2000/xmlns/','xmlns:xlink',XLINK);
 return new XMLSerializer().serializeToString(root);
}
