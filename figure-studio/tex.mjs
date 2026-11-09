// MathJax is loaded only when a text object actually contains TeX. The pinned
// SVG bundle includes its font paths, so rendering and export also work offline.
import {installNativeMathFont} from './native-math-font.mjs?v=live-v062-1';
const engineLoads=new WeakMap();
const MAX_SOURCE=50000,MAX_NODES=30000;
const numericList=value=>String(value??'').trim().split(/[\s,]+/).filter(Boolean).map(Number);

/** Delimiter recognition only; all mathematical syntax is parsed by MathJax. */
export function splitTex(text,mode='auto'){
 text=String(text??'');
 if(mode==='plain')return [{type:'text',text}];
 if(mode==='tex')return [{type:'math',text,display:true}];
 const result=[];let start=0,index=0,pending=null;
 while(index<text.length){
  let token=null;
  if(text[index]==='$')token=text[index+1]==='$'?'$$':'$';
  else if(text[index]==='\\'){
   if(['(',')','[',']'].includes(text[index+1]))token=text.slice(index,index+2);
   // Skip escaped characters once, without repeatedly walking back through a
   // run of backslashes. Unmatched delimiters also require no repeated scans.
   else {index+=2;continue;}
  }
  if(!token){index++;continue;}
  if(pending){
   if(token===pending.close){
    if(pending.index>start)result.push({type:'text',text:text.slice(start,pending.index)});
    result.push({type:'math',text:text.slice(pending.index+pending.open.length,index),display:pending.display});
    start=index+token.length;pending=null;
   }
  }else if(['$','$$','\\(','\\['].includes(token)){
   pending={index,open:token,close:token==='\\('? '\\)':token==='\\['?'\\]':token,display:token==='$$'||token==='\\['};
  }
  index+=token.length;
 }
 if(start<text.length||!result.length)result.push({type:'text',text:text.slice(start)});
 return result;
}

function loadEngine(documentRef){
 if(!documentRef?.defaultView) return Promise.reject(new Error('数式の描画にはブラウザが必要です。'));
 if(engineLoads.has(documentRef))return engineLoads.get(documentRef);
 const promise=new Promise((resolve,reject)=>{
  const view=documentRef.defaultView;
  view.MathJax={
   loader:{load:[]},
   tex:{packages:['base','ams','newcommand'],maxBuffer:MAX_SOURCE,maxMacros:10000,formatError(_jax,error){throw error;}},
   svg:{fontCache:'none'},
   options:{enableMenu:false},
   startup:{typeset:false}
  };
  const script=documentRef.createElement('script');script.src=new URL('./vendor/mathjax/tex-svg.js',import.meta.url).href;script.async=true;
  script.onerror=()=>reject(new Error('数式エンジンを読み込めませんでした。更新または再読み込みしてください。'));
  script.onload=()=>{
   const math=view.MathJax;
   if(!math?.startup?.promise){reject(new Error('数式エンジンを起動できませんでした。'));return;}
   math.startup.promise.then(()=>resolve(math),reject);
  };
  documentRef.head.append(script);
 });
 engineLoads.set(documentRef,promise);return promise;
}

// Uniform glyph scaling must not change a user-selected outline width. MathJax
// uses translate/scale (including a y reflection), occasionally matrix/rotate.
function transformScale(transform){
 let scale=1,rest=String(transform??'');
 const expression=/([a-zA-Z]+)\s*\(([^)]*)\)/g;let match;
 while((match=expression.exec(rest))){
  const values=numericList(match[2]);if(values.some(value=>!Number.isFinite(value)))throw new Error('数式の座標が不正です。');
  if(match[1]==='scale')scale*=Math.sqrt(Math.abs(values[0]*(values[1]??values[0])));
  else if(match[1]==='matrix')scale*=Math.sqrt(Math.abs(values[0]*values[3]-values[1]*values[2]));
  else if(!['translate','rotate','skewX','skewY'].includes(match[1]))throw new Error('数式の座標変換が不正です。');
 }
 if(rest.replace(expression,'').trim()||!Number.isFinite(scale)||scale<=0)throw new Error('数式の座標変換が不正です。');
 return scale;
}

const allowedTags=new Set(['g','path','rect','line','polyline','polygon','circle','ellipse','text','tspan']);
const allowedAttributes=new Set(['d','transform','x','y','dx','dy','width','height','rx','ry','r','cx','cy','x1','y1','x2','y2','points','fill-rule','clip-rule','font-family','font-size','font-weight','font-style','text-anchor','dominant-baseline','lengthAdjust','textLength']);

/** Convert MathJax's SVG to a paint-neutral, ID-free description of its glyphs. */
export function geometryFromMathSvg(svg){
 if(!svg||String(svg.localName??svg.tagName).toLowerCase()!=='svg')throw new Error('数式のSVGがありません。');
 if(svg.querySelector?.('[data-mml-node="merror"], [data-mjx-error]'))throw new Error('数式の構文を確認してください。');
 const box=numericList(svg.getAttribute('viewBox'));
 if(box.length!==4||box.some(value=>!Number.isFinite(value)||Math.abs(value)>1e9)||box[2]<0||box[3]<0)throw new Error('数式の大きさが不正です。');
 const definitions=new Map();for(const node of svg.querySelectorAll?.('[id]')??[])definitions.set(node.getAttribute('id'),node);
 let count=0;
 function read(node,stack=new Set()){
  if(++count>MAX_NODES)throw new Error('数式が複雑すぎます。式を分けてください。');
  const tag=String(node.localName??node.tagName).toLowerCase();
  if(['defs','title','desc'].includes(tag))return null;
  if(tag==='use'){
   const href=node.getAttribute('href')||node.getAttribute('xlink:href')||'';
   const target=href.startsWith('#')&&definitions.get(href.slice(1));
   if(!target||stack.has(target))throw new Error('数式に解決できない参照があります。');
   const next=new Set(stack);next.add(target);
   const transform=[node.getAttribute('transform')||'',`translate(${Number(node.getAttribute('x')||0)} ${Number(node.getAttribute('y')||0)})`].join(' ').trim();
   transformScale(transform);return {tag:'g',attrs:{transform},children:[read(target,next)].filter(Boolean)};
  }
  if(!allowedTags.has(tag))throw new Error('数式に対応していないSVG要素があります。');
  const attrs={};for(const attr of node.attributes??[]){if(allowedAttributes.has(attr.name))attrs[attr.name]=attr.value;}
  if(attrs.transform)transformScale(attrs.transform);
  if(Object.values(attrs).some(value=>/url\s*\(|javascript:|[<>]/i.test(value)))throw new Error('数式に不正な参照があります。');
  const text=tag==='text'||tag==='tspan'?[...(node.childNodes??[])].filter(child=>child.nodeType===3).map(child=>child.nodeValue).join(''):undefined;
  return {tag,attrs,...(text!==undefined?{text}:{}),children:[...(node.children??[])].map(child=>read(child,stack)).filter(Boolean)};
 }
 return {viewBox:box,nodes:[...(svg.children??[])].map(node=>read(node)).filter(Boolean)};
}

function instantiate(el,descriptor,paint,scale){
 const localScale=scale*transformScale(descriptor.attrs?.transform);
 const attrs={...descriptor.attrs};
 if(descriptor.tag!=='g'&&Number.isFinite(Number(paint['stroke-width'])))attrs['stroke-width']=Number(paint['stroke-width'])/localScale;
 const node=el(descriptor.tag,attrs,descriptor.text);
 node.append(...(descriptor.children??[]).map(child=>instantiate(el,child,paint,localScale)));return node;
}

const normalStyle=o=>({'font-family':o.fontFamily||'Arial','font-size':o.fontSize,'font-weight':o.bold?'700':'400','font-style':o.italic?'italic':'normal','text-decoration':o.underline?'underline':'none','text-anchor':'start','xml:space':'preserve'});

/** Build wrapped text/math rows without raster images or foreignObject. */
export async function makeTexLayout(object,{measure,convert}){
 const o={...object},fontSize=Number(o.fontSize),width=o.textAutoSize?Infinity:Math.max(1,Number(o.w)-2);
 if(!Number.isFinite(fontSize)||fontSize<=0||!o.textAutoSize&&!Number.isFinite(width))throw new Error('数式の文字サイズが不正です。');
 const source=String(o.text??'');if(source.length>MAX_SOURCE)throw new Error('数式のテキストが長すぎます。');
 const pieces=splitTex(source,o.textMode),segments=await Promise.all(pieces.map(async piece=>piece.type==='math'?{...piece,geometry:await convert(piece.text,piece.display,o)}:piece));
 const rows=[];let row={runs:[],width:0,ascent:fontSize*.95,descent:fontSize*.3};
 const nextRow=()=>{rows.push(row);row={runs:[],width:0,ascent:fontSize*.95,descent:fontSize*.3};};
 const measured=text=>{const value=Number(measure(text,o));if(!Number.isFinite(value)||value<0)throw new Error('文字の幅を計算できませんでした。');return value;};
 function addText(character){
  if(character==='\n'){nextRow();return;}
  let last=row.runs.at(-1),candidate=last?.type==='text'?last.text+character:character;
  let runWidth=measured(candidate),delta=runWidth-(last?.type==='text'?last.width:0);
  if(row.runs.length&&row.width+delta>width){nextRow();last=null;candidate=character;runWidth=measured(character);delta=runWidth;}
  if(last?.type==='text'){last.text=candidate;last.width=runWidth;}else row.runs.push({type:'text',text:character,width:runWidth,x:row.width});
  row.width+=delta;
 }
 for(const segment of segments){
  if(segment.type==='text'){for(const character of segment.text.replace(/\r\n?/g,'\n'))addText(character);continue;}
  const geometry=segment.geometry,box=geometry.viewBox,scale=fontSize/1000,mathWidth=box[2]*scale;
  if(segment.display&&row.runs.length)nextRow();
  if(!segment.display&&row.runs.length&&row.width+mathWidth>width)nextRow();
  row.runs.push({type:'math',geometry,scale,width:mathWidth,x:row.width,label:segment.text});
  row.width+=mathWidth;row.ascent=Math.max(row.ascent,-box[1]*scale);row.descent=Math.max(row.descent,(box[1]+box[3])*scale);
  if(segment.display)nextRow();
 }
 // A block's trailing line break is not an additional empty line.
 if(row.runs.length||!rows.length||segments.at(-1)?.type==='text')rows.push(row);
 const contentWidth=o.textAutoSize?Math.max(0,...rows.map(row=>row.width))+2:Number(o.w);
 let height=0,maxWidth=0;
 for(const [index,row] of rows.entries()){
  row.y=height+row.ascent;height+=Math.max(fontSize*1.25,row.ascent+row.descent);maxWidth=Math.max(maxWidth,row.width);row.x=o.textAlign==='center'?(contentWidth-row.width)/2:o.textAlign==='right'?contentWidth-row.width:0;
  const units=row.runs.reduce((sum,run)=>sum+(run.type==='text'?[...run.text].length:1),0);
  row.spacing=o.textAlign==='justify'&&index<rows.length-1&&units>1?Math.max(0,(contentWidth-row.width)/(units-1)):0;
 }
 return {width:o.textAutoSize?maxWidth:Math.max(Number(o.w),maxWidth),height,rows,
  createNodes(el,paint={}){
   return rows.flatMap(row=>{let precedingUnits=0;return row.runs.map(run=>{
    const x=row.x+run.x+precedingUnits*row.spacing,units=run.type==='text'?[...run.text].length:1;precedingUnits+=units;
    if(run.type==='text')return el('text',{...normalStyle(o),x,y:row.y,...(row.spacing&&units>1?{textLength:run.width+row.spacing*(units-1),lengthAdjust:'spacing'}:{})},run.text||' ');
    const box=run.geometry.viewBox;
    const group=el('g',{transform:`translate(${x-box[0]*run.scale} ${row.y}) scale(${run.scale})`,'aria-label':run.label,role:'img'});
    group.append(...run.geometry.nodes.map(node=>instantiate(el,node,paint,run.scale)));return group;
   });});
  }
 };
}

export function createTexRenderer({measure=(text,o)=>[...text].length*o.fontSize*.6,onReady=()=>{},onError=()=>{},documentRef=globalThis.document,convert}={}){
 const cache=new Map(),mathCache=new Map();let queue=Promise.resolve();
 const key=o=>JSON.stringify([o.textMode||'auto',String(o.text??''),o.fontSize,o.fontFamily||'Arial',!!o.bold,!!o.italic,!!o.underline,o.textAutoSize?'natural':o.w,o.textAlign||'left']);
 const hasMath=o=>o?.type==='text'&&o.textMode!=='plain'&&(o.textMode==='tex'||splitTex(o.text,o.textMode).some(piece=>piece.type==='math'));
 async function convertMath(source,display,object){
  const mathKey=JSON.stringify([source,display,object.fontFamily||'Arial',!!object.bold,!!object.italic]);if(mathCache.has(mathKey))return mathCache.get(mathKey);
  const work=queue.then(async()=>{
   if(convert)return convert(source,display,object);
   const engine=await loadEngine(documentRef);
   // TeX definitions are local to an object. Reusing an input Jax would let a
   // previous object's \newcommand change a later object's meaning and invalidate its
   // cache key. Fonts/output remain shared; no script or font is reloaded.
   engine.startup.input=engine.startup.getInputJax();
   engine.startup.document=engine.startup.getDocument();
   const restore=installNativeMathFont(Array.isArray(engine.startup.output)?engine.startup.output[0]:engine.startup.output,object,{documentRef});
   try{const output=await engine.tex2svgPromise(source,{display});return geometryFromMathSvg(output.querySelector('svg'));}finally{restore();}
  });
  queue=work.catch(()=>{});mathCache.set(mathKey,work);
  if(mathCache.size>512)mathCache.delete(mathCache.keys().next().value);
  return work;
 }
 function entry(object){
  const id=key(object);if(cache.has(id))return cache.get(id);
  const record={layout:null,error:null,promise:null};cache.set(id,record);
  record.promise=makeTexLayout({...object},{measure,convert:convertMath}).then(layout=>{record.layout=layout;onReady(id);return layout;},cause=>{
   record.error=new Error(`数式を描画できません。TeXの入力を確認してください。${cause?.message?' '+cause.message:''}`,{cause});onError(record.error,id);throw record.error;
  });
  // Drawing is synchronous. The rejection is retained for prepare(), never an
  // unhandled rejection or an endless retry on every canvas repaint.
  record.promise.catch(()=>{});
  if(cache.size>256)cache.delete(cache.keys().next().value);return record;
 }
 return {key,hasMath,getLayout(object){return hasMath(object)?entry(object).layout:null;},async prepare(objects){await Promise.all([...objects].filter(hasMath).map(object=>entry(object).promise));},getError(object){return cache.get(key(object))?.error??null;}};
}
