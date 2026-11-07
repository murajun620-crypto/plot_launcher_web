import {lineStrokeAttributes} from '../line-styles.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeObject,newDocument,toMM,validateDocument} from '../model.mjs';
import {createTexRenderer,makeTexLayout} from '../tex.mjs';
import {renderTextPaint} from '../text-paint.mjs';

const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
function section(start,end){const at=source.indexOf(start),until=source.indexOf(end,at);assert.ok(at>=0&&until>at,start);return source.slice(at,until);}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const measure=(text,object)=>[...text].length*object.fontSize*.5;
const geometry={viewBox:[0,-800,1000,1000],nodes:[{tag:'g',attrs:{transform:'scale(1,-1)'},children:[{tag:'path',attrs:{d:'M0 0L1000 0L500 800Z'},children:[]}]}]};
const text=props=>makeObject('text',{text:'速度 $v_0$ = 3',fontSize:20,w:160,h:30,...props});
class Node{
 constructor(tag){this.tag=tag;this.attributes=new Map();this.children=[];this.style={};this.textContent='';}
 setAttribute(name,value){this.attributes.set(name,String(value));}getAttribute(name){return this.attributes.get(name)??null;}
 removeAttribute(name){this.attributes.delete(name);}
 append(...nodes){this.children.push(...nodes);}prepend(...nodes){this.children.unshift(...nodes);}
 replaceChildren(...nodes){this.children=[...nodes];}
}
function el(tag,attributes={},content=''){const node=new Node(tag);node.textContent=content;for(const[name,value]of Object.entries(attributes))if(value!==undefined)node.setAttribute(name,value);return node;}
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
const serialize=node=>`<${node.tag}${[...node.attributes].map(([name,value])=>` ${name}="${escape(value)}"`).join('')}>${escape(node.textContent)}${node.children.map(serialize).join('')}</${node.tag}>`;
const flatten=nodes=>nodes.flatMap(node=>[node,...flatten(node.children)]);

// Exercise the app's real preparation, drawing and download boundary with a
// deferred converter, without loading a browser or replacing its export logic.
function harness(objects,texRenderer,{onFinishText=()=>{}}={}){
 const initialDoc={...newDocument(),name:'TeX Figure',objects},downloads=[],messages=[];let exported;
 class Serializer{serializeToString(node){exported=node;return serialize(node);}}
 const api=Function('initialDoc','texRenderer','el','toMM','XMLSerializer','renderTextPaint','download','toast','onFinishText','lineStrokeAttributes',
  `let doc=initialDoc,finished=0,editingId=null,scale=1;const ns='http://www.w3.org/2000/svg',measure={measureText:text=>({width:text.length*10})};
   const uid=()=> 'export-tex',safeName=name=>name;
   function finishText(){finished++;onFinishText(doc);}`+
  section('function transform(','function drawContent(')+section('function drawContent(','function render(){')+
  section('function buildExport(){','function validateBook(')+
  section('async function prepareFigureExport(){','function withPNGResolution(')+
  'return {prepareFigureExport,exportSVG,buildExport,setDocument(value){doc=value;},get doc(){return doc;},get finished(){return finished;}};'
 )(initialDoc,texRenderer,el,toMM,Serializer,renderTextPaint,(blob,name)=>downloads.push({blob,name}),message=>messages.push(message),onFinishText,lineStrokeAttributes);
 return {api,downloads,messages,get exported(){return exported;}};
}

test('SVG export waits for pending math and emits vectors after finishing text input',async()=>{
 const pending=deferred(),calls=[],object=text({text:'未確定'}),renderer=createTexRenderer({measure,convert:async expression=>{calls.push(expression);return pending.promise;}});
 const app=harness([object],renderer,{onFinishText:()=>{object.text='速度 $v_0$ = 3';}});
 const saving=app.api.exportSVG();await tick();
 assert.deepEqual(calls,['v_0']);assert.equal(app.api.finished,1);assert.equal(app.downloads.length,0);assert.equal(app.exported,undefined);
 pending.resolve(geometry);await saving;
 assert.equal(app.downloads.length,1);assert.equal(app.downloads[0].name,'TeX Figure.svg');assert.equal(app.downloads[0].blob.type,'image/svg+xml');
 const svg=await app.downloads[0].blob.text();assert.match(svg,/<path\b/);assert.doesNotMatch(svg,/<(?:image|foreignObject)\b|data-hit=|NaN|Infinity/);
 const visibleText=flatten([app.exported]).filter(node=>['text','tspan'].includes(node.tag)).map(node=>node.textContent).join('');
 assert.equal(visibleText,'速度  = 3');assert.ok(renderer.getLayout(object));assert.equal(app.api.finished,2);
});

test('invalid TeX rejects preparation and prevents a misleading SVG download',async()=>{
 let calls=0;const object=text({text:'$\\unknowncommand$'}),renderer=createTexRenderer({measure,convert:async()=>{calls++;throw Error('Undefined control sequence');}}),app=harness([object],renderer);
 await assert.rejects(app.api.prepareFigureExport(),/数式を描画できません.*Undefined control sequence/);
 await app.api.exportSVG();assert.equal(app.downloads.length,0);assert.equal(app.exported,undefined);assert.equal(calls,1);
 assert.match(app.messages.at(-1),/数式を描画できません/);assert.equal(object.text,'$\\unknowncommand$');
});

test('switching Figure during conversion aborts export instead of downloading the new Figure',async()=>{
 const pending=deferred(),renderer=createTexRenderer({measure,convert:()=>pending.promise}),app=harness([text()],renderer),saving=app.api.exportSVG();
 await tick();app.api.setDocument({...newDocument(),name:'Other Figure',objects:[text({text:'Other'})]});pending.resolve(geometry);await saving;
 assert.equal(app.downloads.length,0);assert.equal(app.exported,undefined);assert.match(app.messages.at(-1),/Figureが切り替わりました/);
});

test('editing raw TeX while conversion is pending prepares the new source before export',async()=>{
 const first=deferred(),second=deferred(),calls=[],object=text({text:'$x$'}),renderer=createTexRenderer({measure,convert:expression=>{calls.push(expression);return expression==='x'?first.promise:second.promise;}}),app=harness([object],renderer);
 const saving=app.api.exportSVG();await tick();assert.deepEqual(calls,['x']);object.text='改訂 $y^2$';first.resolve(geometry);await tick();
 assert.deepEqual(calls,['x','y^2']);assert.equal(app.downloads.length,0);assert.equal(renderer.getLayout(object),null);
 second.resolve(geometry);await saving;assert.equal(app.downloads.length,1);assert.ok(renderer.getLayout(object));
 const svg=await app.downloads[0].blob.text();assert.match(svg,/aria-label="y\^2"/);assert.doesNotMatch(svg,/aria-label="x"/);assert.equal(object.text,'改訂 $y^2$');
});

test('continuous edits stop after three preparations without producing a stale export',async()=>{
 const object=text({text:'$x_0$'});let preparations=0;
 const renderer={key:o=>o.text,prepare:async()=>{object.text=`$x_${++preparations}$`;}};
 const app=harness([object],renderer);await app.api.exportSVG();
 assert.equal(preparations,3);assert.equal(app.downloads.length,0);assert.match(app.messages.at(-1),/文字の編集中です/);
});

test('plain text export does not wait for unrelated pending math or interpret explicit plain mode',async()=>{
 const pending=deferred(),calls=[],renderer=createTexRenderer({measure,convert:expression=>{calls.push(expression);return pending.promise;}}),unrelated=text({text:'$waiting$'});
 renderer.getLayout(unrelated);await tick();
 const app=harness([text({text:'日本語のみ'}),text({text:'$literal$ \\alpha',textMode:'plain'})],renderer);let settled=false;
 const saving=app.api.exportSVG().then(()=>{settled=true;});await tick();
 try{assert.equal(settled,true);assert.equal(app.downloads.length,1);assert.deepEqual(calls,['waiting']);assert.equal(flatten([app.exported]).filter(node=>node.tag==='path').length,0);}
 finally{pending.resolve(geometry);await renderer.prepare([unrelated]);await saving;}
});

test('preparation and SVG generation retain raw editable TeX in saved project data',async()=>{
 const raw='日本語 $\\frac{1}{2}$\n\\[x_1^2 + \\alpha\\]',object=text({text:raw}),renderer=createTexRenderer({measure,convert:async()=>geometry}),app=harness([object],renderer),before=JSON.stringify(app.api.doc);
 await app.api.exportSVG();assert.equal(app.downloads.length,1);assert.equal(JSON.stringify(app.api.doc),before);
 const restored=validateDocument(JSON.parse(JSON.stringify(app.api.doc)));assert.equal(restored.objects[0].text,raw);assert.equal(restored.objects[0].textMode,'auto');
 assert.equal(Object.hasOwn(restored.objects[0],'layout'),false);assert.equal(Object.hasOwn(restored.objects[0],'geometry'),false);
});

test('mixed TeX layouts use independent vector glyph copies for center, inside and outside outlines',async()=>{
 const subscript={...geometry,nodes:[{tag:'g',attrs:{transform:'translate(800, -150) scale(0.707)'},children:geometry.nodes}]};
 for(const strokeAlignment of ['center','inside','outside']){
  const object=text({text:'日本 $x_i$',strokeAlignment,fill:'#123456',fillTransparency:25,stroke:'#abcdef',strokeTransparency:40,strokeWidth:2,opacity:.3}),layout=await makeTexLayout(object,{measure,convert:async()=>subscript});
  const nodes=renderTextPaint(object,{el,layout,uniqueId:strokeAlignment}),all=flatten(nodes),paint=nodes.filter(node=>node.tag!=='defs'),outline=paint.find(node=>node.getAttribute('stroke')==='#abcdef'),paths=all.filter(node=>node.tag==='path');
  assert.equal(outline.getAttribute('stroke-opacity'),'0.6');assert.equal(outline.getAttribute('opacity'),null);
  const outlinePath=flatten([outline]).find(node=>node.tag==='path'),effectiveWidth=Number(outlinePath.getAttribute('stroke-width'))*.02*.707;
  assert.ok(Math.abs(effectiveWidth-(strokeAlignment==='center'?2:4))<1e-10);
  assert.equal(paths.length,strokeAlignment==='center'?1:3);assert.equal(new Set(paths).size,paths.length);
  const fill=paint.find(node=>node.getAttribute('fill')==='#123456');assert.equal(fill.getAttribute('fill-opacity'),'0.75');
  assert.ok(all.some(node=>node.tag==='text'&&node.textContent==='日本 '));assert.ok(!all.some(node=>['image','foreignObject','use','tspan'].includes(node.tag)));
  if(strokeAlignment!=='center'){
   const mask=nodes[0].children[0];assert.equal(mask.tag,'mask');assert.equal(mask.getAttribute('opacity'),'1');
   assert.equal(outline.getAttribute('mask'),`url(#${mask.getAttribute('id')})`);assert.equal(mask.children.length,strokeAlignment==='inside'?1:2);
   const helper=mask.children.find(node=>node.tag==='g');for(const attr of ['opacity','fill-opacity','stroke-opacity'])assert.equal(helper.getAttribute(attr),'1');
  }
  assert.equal(object.text,'日本 $x_i$');assert.equal(geometry.nodes[0].children[0].attrs['stroke-width'],undefined);
 }
});
