import {lineStrokeAttributes} from '../line-styles.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeObject,newDocument,History,clone,mm,toMM,validateDocument} from '../model.mjs';
import {pathData,isPathObject,objectFromPoints} from '../paths.mjs';
import {ARROW_PROPERTIES,setArrowProperty} from '../arrowheads.mjs';

// Exercise the real app integration without starting browser persistence/UI.
const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
function section(start,end){const begin=source.indexOf(start),until=source.indexOf(end,begin);assert.ok(begin>=0&&until>begin,start);return source.slice(begin,until);}
const near=(a,b)=>assert.ok(Math.abs(a-b)<.000001,`${a} != ${b}`);
class SVGNode{
 constructor(tag){this.tag=tag;this.attributes=new Map();this.children=[];this.style={};this.textContent='';}
 setAttribute(key,value){this.attributes.set(key,String(value));}getAttribute(key){return this.attributes.get(key)??null;}
 removeAttribute(key){this.attributes.delete(key);if(key==='style')this.style={};}
 append(...children){this.children.push(...children);}prepend(...children){this.children.unshift(...children);}replaceChildren(...children){this.children=children;}
}
function el(tag,attributes={},text=''){const node=new SVGNode(tag);for(const[key,value]of Object.entries(attributes))if(value!==undefined)node.setAttribute(key,value);node.textContent=text;return node;}
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
class XMLSerializer{
 serializeToString(node){return `<${node.tag}${[...node.attributes].map(([key,value])=>` ${key}="${escape(value)}"`).join('')}>${escape(node.textContent)}${node.children.map(child=>this.serializeToString(child)).join('')}</${node.tag}>`;}
}
function drawing(objects=[]){
 const doc={...newDocument(),objects};
 return Function('el','isPathObject','pathData','doc','toMM','XMLSerializer','lineStrokeAttributes',
  `let editingId=null,scale=2,finished=0;const ns='http://www.w3.org/2000/svg';function finishText(){finished++;}`+
  section('function transform(','function font(')+section('function drawContent(','function render(){')+section('function buildExport(){','function validateBook(')+
  'return {drawContent,buildExport,get finished(){return finished;}};'
 )(el,isPathObject,pathData,doc,toMM,XMLSerializer,lineStrokeAttributes);
}

test('canvas paths use their real geometry and a separate transparent stroke hit target',()=>{
 for(const type of ['curve','freeform','arc']){
  const object=makeObject(type,{x:13,y:29,w:80,h:40,rotation:37,fill:'#ef8899',strokeWidth:2,dashed:true}),group=el('g'),app=drawing();
  app.drawContent(object,group);
  assert.equal(group.getAttribute('transform'),'translate(13 29) rotate(37 40 20)');assert.equal(group.getAttribute('data-id'),object.id);
  assert.deepEqual(group.children.map(child=>child.tag),['path','path']);
  const [hit,visible]=group.children;assert.equal(hit.getAttribute('stroke'),'transparent');assert.equal(hit.getAttribute('pointer-events'),'stroke');assert.equal(hit.getAttribute('stroke-width'),'6');
  assert.equal(visible.getAttribute('d'),pathData(object));assert.equal(hit.getAttribute('d'),visible.getAttribute('d'));assert.equal(visible.getAttribute('fill'),'none');assert.equal(visible.getAttribute('stroke-dasharray'),'8 6');
 }
});

test('closed paths may fill but open paths never acquire an unintended closing fill',()=>{
 const app=drawing();
 for(const type of ['curve','freeform','arc'])for(const closed of [false,true]){
  const object=makeObject(type,{closed,fill:'#00aa55'}),group=el('g');app.drawContent(object,group,true);
  assert.equal(group.children.length,1);assert.equal(group.children[0].tag,'path');assert.equal(group.children[0].getAttribute('fill'),closed?'#00aa55':'none');assert.equal(/ Z$/.test(group.children[0].getAttribute('d')),closed);
 }
});

test('SVG export includes vector curve, freeform and arc geometry and excludes editor hit targets',()=>{
 const objects=['curve','freeform','arc'].map((type,index)=>makeObject(type,{x:10+index*40,y:20,rotation:index*15,closed:type==='freeform',fill:'#33aa77'})),app=drawing(objects),markup=app.buildExport();
 assert.equal(app.finished,1);assert.equal((markup.match(/<path\b/g)||[]).length,3);assert.equal((markup.match(/<rect\b/g)||[]).length,1);
 for(const object of objects)assert.ok(markup.includes(`d="${pathData(object)}"`));
 assert.match(markup,/<svg[^>]+width="180mm"[^>]+height="135mm"/);assert.match(markup,/translate\(50 20\) rotate\(15 /);
 assert.doesNotMatch(markup,/stroke="transparent"|pointer-events|data-id=|data-handle=|NaN|Infinity/);
 const thumbnail=el('g');app.drawContent(objects[0],thumbnail,'thumbnail');assert.equal(thumbnail.children.length,1);
});

test('point editing converts world positions back to local coordinates at every rotation',()=>{
 const {pathWorldPoint,pathLocalPoint}=Function(section('function pathWorldPoint(','function drawPathDraft(')+'return {pathWorldPoint,pathLocalPoint};')();
 for(const rotation of [-135,0,37,90,180,360,360000]){
  const object=makeObject('curve',{x:-30,y:145,w:120,h:35,rotation});
  for(const point of [{x:0,y:0},{x:.5,y:.5},{x:1,y:1},{x:.23,y:.81}]){
   const world=pathWorldPoint(object,point),local=pathLocalPoint(object,world);near(local.x,point.x*object.w);near(local.y,point.y*object.h);
   const roundtrip=pathWorldPoint(object,{x:local.x/object.w,y:local.y/object.h});near(roundtrip.x,world.x);near(roundtrip.y,world.y);
  }
 }
});

function properties(objects){
 const doc={...newDocument(),objects},history=new History(),pending=new Set(),messages=[];
 const change=fn=>{const before=clone(doc);fn();history.push(before,doc);};
 const commit=Function('propertyKey','pendingPropertyInputs','ARROW_PROPERTIES','setArrowProperty','change','editable','toast','mm','toMM','isTextPropertyInput','applyTextStyle',
  'let editingId=null;'+section('function commitPropertyInput(','function commitFocusedProperty(')+'return commitPropertyInput;'
 )(Function(section('function propertyKey(','function isTextPropertyInput(')+'return propertyKey;')(),pending,ARROW_PROPERTIES,setArrowProperty,change,()=>objects.filter(object=>!object.locked),message=>messages.push(message),mm,toMM,()=>false,()=>{throw Error('Unexpected text branch');});
 return {doc,history,messages,pending,input(prop,value,extra={}){const input={dataset:{prop},value:String(value),disabled:false,type:'number',tagName:'INPUT',validity:{badInput:false},...extra};pending.add(input);return input;},commit};
}

test('arc input aliases edit model angles in one undoable operation, including a valid zero start',()=>{
 const object=makeObject('arc',{startAngle:30,endAngle:180}),p=properties([object]);
 assert.equal(p.commit(p.input('arcStartAngle',0)),true);assert.equal(object.startAngle,0);assert.equal(object.arcStartAngle,undefined);assert.equal(p.history.past.length,1);
 assert.equal(p.commit(p.input('arcEndAngle',270)),true);assert.equal(object.endAngle,270);assert.equal(object.arcEndAngle,undefined);assert.equal(p.history.past.length,2);
 const restored=p.history.undo(p.doc);assert.equal(restored.objects[0].startAngle,0);assert.equal(restored.objects[0].endAngle,180);assert.doesNotThrow(()=>validateDocument(p.doc));
});

test('invalid arc values and a zero sweep cannot partially edit a multiple selection',()=>{
 for(const [prop,value,extra]of [['arcEndAngle','',{}],['arcEndAngle','NaN',{}],['arcStartAngle',3601,{}],['arcEndAngle',-3601,{}],['arcStartAngle',40,{validity:{badInput:true}}],['arcStartAngle',180,{}],['arcEndAngle',0,{}]]){
  const a=makeObject('arc',{startAngle:0,endAngle:180}),b=makeObject('arc',{startAngle:15,endAngle:240}),p=properties([a,b]),before=clone(p.doc),input=p.input(prop,value,extra);
  assert.equal(p.commit(input),false,`${prop}=${value}`);assert.deepEqual(p.doc,before);assert.equal(p.history.past.length,0);assert.equal(p.pending.has(input),true);assert.ok(p.messages.length);
 }
 const p=properties([makeObject('arc')]),disabled=p.input('arcEndAngle','invalid',{disabled:true});assert.equal(p.commit(disabled),true);assert.equal(p.pending.has(disabled),false);assert.equal(p.history.past.length,0);
});

test('committing a drawn path adds exactly one history entry and preserves normalized geometry through Undo/Redo',()=>{
 for(const type of ['curve','freeform']){
  const doc={...newDocument(),objects:[makeObject('rect')]},history=new History(),tools=[];
  const app=Function('doc','history','clone','objectFromPoints','makeObject','tools',
   `let selection=[],pathDraft={type:'draft'};function snapshot(){return clone(doc);}function record(before){history.push(before,snapshot());}function setTool(tool){tools.push(tool);}`+
   section('function commitDrawnPath(','function beginText(')+'return {commit:commitDrawnPath,get selection(){return selection;},get draft(){return pathDraft;}};'
  )(doc,history,clone,objectFromPoints,makeObject,tools);
  const points=[{x:20,y:40},{x:80,y:10},{x:140,y:70}];app.commit({type,points,closed:true});
  assert.equal(history.past.length,1);assert.equal(doc.objects.length,2);assert.equal(app.draft,null);assert.deepEqual(tools,['select']);assert.deepEqual(app.selection,[doc.objects[1].id]);
  const path=doc.objects[1];assert.equal(path.type,type);assert.equal(path.closed,true);path.points.forEach((point,index)=>{near(path.x+point.x*path.w,points[index].x);near(path.y+point.y*path.h,points[index].y);});
  const undone=history.undo(doc);assert.equal(undone.objects.length,1);assert.deepEqual(history.redo(undone),doc);assert.doesNotThrow(()=>validateDocument(doc));
  const before=clone(doc);assert.throws(()=>app.commit({type,points:[{x:0,y:0}],closed:false}));assert.deepEqual(doc,before);assert.equal(history.past.length,1);
 }
});
