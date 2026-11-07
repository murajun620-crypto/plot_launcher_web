import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeObject,newDocument,toMM} from '../model.mjs';
import {isPathObject,pathData} from '../paths.mjs';
import {arrowGeometry} from '../arrowheads.mjs';
import {renderTextPaint} from '../text-paint.mjs';

const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
function section(start,end){const at=source.indexOf(start),until=source.indexOf(end,at);assert.ok(at>=0&&until>at,start);return source.slice(at,until);}
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);
class Node{
 constructor(tag){this.tag=tag;this.attributes=new Map();this.children=[];this.style={};this.textContent='';this.parent=null;}
 setAttribute(name,value){this.attributes.set(name,String(value));}getAttribute(name){return this.attributes.get(name)??null;}
 removeAttribute(name){this.attributes.delete(name);if(name==='style')this.style={};}
 append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}prepend(...nodes){for(const node of nodes)node.parent=this;this.children.unshift(...nodes);}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
}
function el(tag,attributes={},text=''){const node=new Node(tag);node.textContent=text;for(const[name,value]of Object.entries(attributes))if(value!==undefined)node.setAttribute(name,value);return node;}
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
const serialize=node=>`<${node.tag}${[...node.attributes].map(([name,value])=>` ${name}="${escape(value)}"`).join('')}>${escape(node.textContent)}${node.children.map(serialize).join('')}</${node.tag}>`;
function harness(objects=[]){
 let exported;
 class Serializer{serializeToString(node){exported=node;return serialize(node);}}
 const image={dataUrl:'data:image/png;base64,AQID',previewUrl:'data:image/png;base64,BAUG'},assets=new Map([['raster',image]]),doc={...newDocument(),objects};
 const api=Function('el','isPathObject','pathData','arrowGeometry','assets','doc','toMM','XMLSerializer','renderTextPaint','uid','texRenderer',
  `let editingId=null,scale=2;const ns='http://www.w3.org/2000/svg',measure={measureText:text=>({width:text.length*6})},previewQuality={getURL:asset=>asset.previewUrl};function finishText(){}`+
  section('function transform(','function drawContent(')+section('function drawContent(','function render(){')+section('function buildExport(){','function validateBook(')+'return {drawContent,buildExport};'
 )(el,isPathObject,pathData,arrowGeometry,assets,doc,toMM,Serializer,renderTextPaint,()=> 'text-paint-test',{hasMath:()=>false,getLayout:()=>null});
 return {...api,image,get exported(){return exported;},draw(object,full=false){const group=el('g');api.drawContent(object,group,full);return group;}};
}
const inherit=(node,name,fallback)=>{for(let current=node;current;current=current.parent){const value=current.getAttribute(name);if(value!==null)return value;}return fallback;};
// SVG paint opacity inherits/overrides; whole-element opacity composites instead.
function paintOpacity(node,channel){
 if(channel==='fill'&&node.tag==='line')return 0; // SVG lines have no fillable area.
 const color=inherit(node,channel,channel==='fill'?'black':'none');if(color==='none'||color==='transparent')return 0;
 let result=Number(inherit(node,`${channel}-opacity`,'1'));
 for(let current=node;current;current=current.parent)result*=Number(current.getAttribute('opacity')??1);
 return result;
}
const visibleChildren=group=>group.children.filter(node=>node.getAttribute('data-hit')!=='true'&&node.getAttribute('stroke')!=='transparent');

test('all object groups invert independent transparency percentages while preserving whole-object opacity',()=>{
 const app=harness();
 for(const type of ['image','text','line','arrow','rect','ellipse','curve','freeform','arc']){
  const object=makeObject(type,{assetId:'raster',closed:true,opacity:.6,fillTransparency:25,strokeTransparency:70}),group=app.draw(object);
  near(Number(group.getAttribute('opacity')),.6);near(Number(group.getAttribute('fill-opacity')),.75);near(Number(group.getAttribute('stroke-opacity')),.3);
 }
});

test('zero percent is opaque and one hundred percent is transparent independently for fill and outline',()=>{
 const app=harness();
 for(const type of ['rect','ellipse','curve','freeform','arc'])for(const [fill,stroke]of [[0,100],[100,0],[37.5,12.5]]){
  const object=makeObject(type,{closed:true,fill:'#445566',stroke:'#112233',opacity:.4,fillTransparency:fill,strokeTransparency:stroke}),shape=app.draw(object,true).children[0];
  near(paintOpacity(shape,'fill'),.4*(1-fill/100));near(paintOpacity(shape,'stroke'),.4*(1-stroke/100));
 }
});

test('no color stays none for text, shapes, paths and arrow heads without a fallback paint',()=>{
 const app=harness();
 for(const type of ['text','line','arrow','rect','ellipse','curve','freeform','arc']){
  const object=makeObject(type,{closed:true,fill:'none',stroke:'none',fillTransparency:0,strokeTransparency:0}),group=app.draw(object,true);
  for(const node of group.children){near(paintOpacity(node,'fill'),0);near(paintOpacity(node,'stroke'),0);}
  if(type==='text')assert.equal(group.children[0].getAttribute('fill'),'none');
  if(type==='arrow')assert.equal(group.children.at(-1).getAttribute('fill'),'none');
 }
 const text=makeObject('text',{text:'Visible',fill:'#123456',fillTransparency:40,opacity:.5}),textNode=app.draw(text,true).children[0];near(paintOpacity(textNode,'fill'),.3);near(paintOpacity(textNode.children[0],'fill'),.3);
});

test('filled arrow heads follow line transparency and ignore the separate shape fill transparency',()=>{
 const app=harness();
 for(const style of ['triangle','stealth','diamond','oval'])for(const fillTransparency of [0,100]){
  const object=makeObject('arrow',{w:90,h:20,arrowStartStyle:style,arrowEndStyle:style,stroke:'#2468ac',fill:'#ff0000',fillTransparency,strokeTransparency:35,opacity:.5}),group=app.draw(object,true),[shaft,...heads]=group.children;
  assert.equal(heads.length,2);near(paintOpacity(shaft,'stroke'),.325);
  for(const head of heads){assert.equal(head.getAttribute('fill'),'#2468ac');near(Number(head.getAttribute('fill-opacity')),.65);near(paintOpacity(head,'fill'),.325);}
 }
 const invisible=app.draw(makeObject('arrow',{strokeTransparency:100,fillTransparency:0}),true);for(const node of invisible.children)near(paintOpacity(node,node.tag==='line'?'stroke':'fill'),0);
});

test('open arrow heads remain unfilled and use the same outline transparency as their shaft',()=>{
 const app=harness(),object=makeObject('arrow',{w:100,h:0,arrowStartStyle:'open',arrowEndStyle:'open',fill:'#ff0000',fillTransparency:100,stroke:'#334455',strokeTransparency:60,opacity:.25}),group=app.draw(object,true);
 assert.deepEqual(group.children.map(node=>node.tag),['line','polyline','polyline']);
 for(const node of group.children){near(paintOpacity(node,'stroke'),.1);if(node.tag==='polyline'){assert.equal(node.getAttribute('fill'),'none');near(paintOpacity(node,'fill'),0);}}
});

test('legacy objects without per-channel fields retain their original paint and overall opacity',()=>{
 const app=harness(),object=makeObject('rect',{fill:'#abcdef',stroke:'#123456',opacity:.35});delete object.fillTransparency;delete object.strokeTransparency;
 const group=app.draw(object,true);assert.equal(group.getAttribute('fill-opacity'),'1');assert.equal(group.getAttribute('stroke-opacity'),'1');near(paintOpacity(group.children[0],'fill'),.35);near(paintOpacity(group.children[0],'stroke'),.35);
 delete object.opacity;assert.equal(app.draw(object,true).getAttribute('opacity'),'1');
});

test('inside and outside text outlines inherit overall opacity once while mask and clip geometry stays opaque',()=>{
 const app=harness();
 for(const strokeAlignment of ['inside','outside']){
  const object=makeObject('text',{text:'Outlined',strokeAlignment,fill:'none',fillTransparency:100,stroke:'#123456',strokeTransparency:25,strokeWidth:3,opacity:.4}),group=app.draw(object,true),defs=group.children[0],visible=group.children.filter(node=>node.tag==='text');
  assert.equal(defs.tag,'defs');assert.equal(visible.length,2);
  const outline=visible.find(node=>node.getAttribute('stroke')==='#123456'),fill=visible.find(node=>node.getAttribute('stroke')==='none');
  near(paintOpacity(outline,'stroke'),.3);near(paintOpacity(fill,'fill'),0);assert.equal(outline.getAttribute('stroke-width'),'6');assert.equal(outline.getAttribute('opacity'),null);
  const mask=defs.children[0];assert.equal(mask.tag,strokeAlignment==='inside'?'clipPath':'mask');
  const checkOpaque=node=>{for(const attribute of ['opacity','fill-opacity','stroke-opacity'])if(node.getAttribute(attribute)!==null)assert.equal(node.getAttribute(attribute),'1');node.children.forEach(checkOpaque);};checkOpaque(defs);
  assert.equal(outline.getAttribute(strokeAlignment==='inside'?'clip-path':'mask'),`url(#${mask.getAttribute('id')})`);
  if(strokeAlignment==='inside')assert.ok(group.children.indexOf(outline)>group.children.indexOf(fill));
  const exported=harness([object]);exported.buildExport();const saved=exported.exported.children.find(node=>node.tag==='g');
  near(Number(saved.getAttribute('opacity')),.4);const savedOutline=saved.children.find(node=>node.tag==='text'&&node.getAttribute('stroke')==='#123456');near(paintOpacity(savedOutline,'stroke'),.3);
 }
});

test('SVG export and canvas/thumbnail share paint attributes for every type while images retain original raster data',()=>{
 const types=['image','text','line','arrow','rect','ellipse','curve','freeform','arc'],objects=types.map(type=>makeObject(type,{assetId:'raster',closed:true,fill:'#debc9a',stroke:'#123456',strokeAlignment:'center',fillTransparency:80,strokeTransparency:30,opacity:.55,arrowStartStyle:'open',arrowEndStyle:'triangle'})),app=harness(objects),markup=app.buildExport(),groups=app.exported.children.filter(node=>node.tag==='g');
 assert.equal(groups.length,types.length);assert.doesNotMatch(markup,/data-hit=|stroke="transparent"|data-id=|NaN|Infinity/);
 groups.forEach((exported,index)=>{
  const preview=app.draw(objects[index]),thumbnail=app.draw(objects[index],'thumbnail');
  for(const attr of ['opacity','fill-opacity','stroke-opacity']){assert.equal(exported.getAttribute(attr),preview.getAttribute(attr));assert.equal(exported.getAttribute(attr),thumbnail.getAttribute(attr));}
  const full=app.draw(objects[index],true);assert.deepEqual(exported.children.map(node=>[node.tag,[...node.attributes]]),full.children.map(node=>[node.tag,[...node.attributes]]));
  assert.equal(exported.children.length,visibleChildren(preview).length);
 });
 assert.equal(groups[0].children[0].getAttribute('href'),app.image.dataUrl);assert.equal(app.draw(objects[0]).children[0].getAttribute('href'),app.image.previewUrl);
 assert.equal(groups[0].getAttribute('opacity'),'0.55');assert.equal(groups[3].children.at(-1).getAttribute('fill-opacity'),'0.7');
});
