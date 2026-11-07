import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {History,makeObject,mm,toMM} from '../model.mjs';
import {ARROW_PROPERTIES,arrowEndpoint,arrowPropertyValue,setArrowProperty} from '../arrowheads.mjs';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
function section(start,end){const first=source.indexOf(start),last=source.indexOf(end,first+start.length);assert.ok(first>=0&&last>first,`${start} exists`);return source.slice(first,last);}
const functions=[
 section('function selected(){','function setSelection('),
 section('function change(fn){','function scheduleSave('),
 section('function updateToolbar(){','function renderFast('),
 section('const textProperties=','function isRibbonTextControl('),
 section('function renderInspector(){','function renderLayers('),
 section('function positionEditor(){',"editor.addEventListener('input'"),
 section('function restoreTextCaret(){',"editor.addEventListener('blur'"),
 section('function applyTextStyle(', 'const sizes='),
 section('function commitPropertyInput(',"for(const input of $$('[data-prop]')){"),
].join('\n');

function node(dataset={}){
 const classes=new Set(),attributes=new Map();
 return {dataset,disabled:false,hidden:false,value:'',textContent:'',style:{},tagName:'BUTTON',
  classList:{toggle(name,enabled){enabled?classes.add(name):classes.delete(name);},contains:name=>classes.has(name)},
  setAttribute:(name,value)=>attributes.set(name,String(value)),getAttribute:name=>attributes.get(name),hasAttribute:name=>attributes.has(name),closest:()=>null,
 };
}
function input(prop,value,{type='text',tagName='INPUT',textOnly=false,badInput=false}={}){
 const field=node({prop});Object.assign(field,{value:String(value),type,tagName,validity:{badInput},matches:selector=>selector==='[data-prop]'});
 if(textOnly)field.setAttribute('data-text-only','');return field;
}
function fixture(objects,{fields=[],buttons=[],tools=[]}={}){
 const events=[],document={activeElement:null},elements=new Map(['selectionInfo','arrowProperties','sourceSummary','sourceApp'].map(id=>[`#${id}`,node()]));
 const queryAll=selector=>selector==='[data-prop]'?fields:selector==='#arrowProperties [data-prop]'?fields.filter(field=>Object.hasOwn(ARROW_PROPERTIES,field.dataset.prop)):selector==='[data-action]'?buttons:selector==='[data-tool]'?tools:buttons.filter(button=>selector===`[data-action="${button.dataset.action}"]`);
 const editor={value:'',hidden:true,style:{},selectionStart:0,selectionEnd:0,selectionDirection:'none',focus(){document.activeElement=editor;events.push('focus-editor');},setSelectionRange(start,end,direction){Object.assign(editor,{selectionStart:start,selectionEnd:end,selectionDirection:direction});}};
 const env={document,editor,nodes:new Map(),drawContent(){},mm,toMM,History,ARROW_PROPERTIES,arrowEndpoint,arrowPropertyValue,setArrowProperty,
  $:selector=>elements.get(selector)??queryAll(selector)[0]??null,$$:queryAll,arrowPicker:{update(){}},colorPickers:{update(){}},ribbon:{updateSelection(){}},toast:message=>events.push(message),updateProjectFileUI:()=>events.push('file-ui'),events};
 const keys=Object.keys(env),api=new Function(...keys,`let doc={objects:arguments[arguments.length-1]},selection=doc.objects.map(o=>o.id),editingId=null,textBefore=null,textCaret=null,lastPendingPropertyInput=null,scale=1,tool='select';const history=new History(),pendingPropertyInputs=new WeakSet();
 function snapshot(){return structuredClone(doc);}function restoreBook(state){doc=structuredClone(state);}function record(before){history.push(before,snapshot());renderInspector();}function render(){renderInspector();}function textLines(object){return object.text.split('\\n');}
 ${functions}
 return {commit:commitPropertyInput,commitFocused:commitFocusedProperty,inspect:renderInspector,toolbar:updateToolbar,textOnly:isTextPropertyInput,style:applyTextStyle,finish:finishText,
  start(id){editingId=id;textBefore=snapshot();editor.value=doc.objects.find(o=>o.id===id).text;editor.hidden=false;textCaret={start:2,end:4,direction:'forward'};document.activeElement=editor;},
  markPending(field){pendingPropertyInputs.add(field);lastPendingPropertyInput=field;},isPending:field=>pendingPropertyInputs.has(field),
  select(ids){selection=ids;},undo(){doc=history.undo(snapshot());},redo(){doc=history.redo(snapshot());},
  state:()=>({doc,editingId,history,editor}),document,events};`)(...keys.map(key=>env[key]),objects);
 return api;
}

test('font color applies only to editable text in a mixed selection while shape fill remains general',()=>{
 const image=makeObject('image'),shape=makeObject('rect',{fill:'#111111'}),text=makeObject('text',{fill:'#222222'}),locked=makeObject('text',{fill:'#333333',locked:true});
 const fontColor=input('fill','#aabbcc',{type:'color',textOnly:true}),shapeFill=input('fill','#ddeeff',{type:'color'}),api=fixture([image,shape,text,locked],{fields:[fontColor,shapeFill]});
 assert.equal(api.textOnly(fontColor),true);assert.equal(api.textOnly(shapeFill),false);
 assert.equal(api.commit(fontColor),true);assert.equal(text.fill,'#aabbcc');assert.equal(shape.fill,'#111111');assert.equal(locked.fill,'#333333');assert.equal(image.fill,'none');
 shapeFill.value='#ddeeff';assert.equal(api.commit(shapeFill),true);assert.equal(shape.fill,'#ddeeff');assert.equal(locked.fill,'#333333');assert.equal(api.state().history.past.length,2);
 api.undo();assert.equal(api.state().doc.objects.find(o=>o.id===shape.id).fill,'#111111');assert.equal(api.state().doc.objects.find(o=>o.id===text.id).fill,'#aabbcc');
});

test('inline font family, size and color remain in one edit until finish, preserving text and caret',()=>{
 const text=makeObject('text',{text:'abcdef',fontSize:12,fontFamily:'Arial',fill:'#172f36'}),family=input('fontFamily','Georgia',{tagName:'SELECT'}),size=input('fontSize',24,{type:'number'}),color=input('fill','#bb2244',{type:'color',textOnly:true});
 const api=fixture([text],{fields:[family,size,color]});api.start(text.id);api.document.activeElement=family;
 assert.equal(api.commit(family),true);assert.equal(api.state().editingId,text.id);assert.equal(api.document.activeElement,api.state().editor);assert.equal(api.state().editor.selectionStart,2);assert.equal(api.state().editor.selectionEnd,4);
 size.value='24';api.document.activeElement=size;api.commit(size);color.value='#bb2244';api.document.activeElement=color;api.commit(color);
 assert.equal(text.fontFamily,'Georgia');assert.equal(text.fontSize,24);assert.equal(text.fill,'#bb2244');assert.equal(api.state().editor.style.fontSize,'24px');assert.equal(api.state().editor.style.color,'#bb2244');assert.equal(api.state().history.past.length,0);
 api.state().editor.value='abcdef continued';api.finish();assert.equal(api.state().editingId,null);assert.equal(text.text,'abcdef continued');assert.equal(api.state().history.past.length,1);
 api.undo();assert.equal(api.state().doc.objects[0].fontFamily,'Arial');assert.equal(api.state().doc.objects[0].fontSize,12);assert.equal(api.state().doc.objects[0].text,'abcdef');
 api.redo();assert.equal(api.state().doc.objects[0].text,'abcdef continued');assert.equal(api.state().doc.objects[0].fill,'#bb2244');
});

test('image width and height property edits preserve each original aspect ratio',()=>{
 const image=makeObject('image',{w:mm(80),h:mm(40)}),width=input('w',40,{type:'number'}),height=input('h',30,{type:'number'}),api=fixture([image],{fields:[width,height]});
 api.commit(width);assert.equal(image.w,mm(40));assert.equal(image.h,mm(20));
 height.value='30';api.commit(height);assert.equal(image.h,mm(30));assert.equal(image.w,mm(60));assert.equal(api.state().history.past.length,2);
});

test('blank, invalid native numeric and nonfinite input never mutates a selected object',()=>{
 const text=makeObject('text',{fontSize:18}),size=input('fontSize','',{type:'number'}),api=fixture([text],{fields:[size]});
 for(const [value,badInput]of [['',false],['   ',false],['1e',true],['Infinity',false]]){
  size.value=value;size.validity.badInput=badInput;api.markPending(size);api.document.activeElement=size;
  assert.equal(api.commit(size),false);assert.equal(text.fontSize,18);assert.equal(api.isPending(size),true);
 }
 assert.equal(api.state().history.past.length,0);assert.equal(api.events.length,4);
});

test('save commits a focused pending property once and refuses an invalid pending value after focus moves to Save',()=>{
 const text=makeObject('text',{fontSize:12}),size=input('fontSize',27,{type:'number'}),api=fixture([text],{fields:[size]});
 api.document.activeElement=size;api.markPending(size);assert.equal(api.commitFocused(),true);assert.equal(text.fontSize,27);assert.equal(api.state().history.past.length,1);
 assert.equal(api.commitFocused(),true);assert.equal(api.state().history.past.length,1);
 size.value='';api.markPending(size);api.document.activeElement=node({action:'save'});
 assert.equal(api.commitFocused(),false);assert.equal(text.fontSize,27);assert.equal(api.isPending(size),true);
 size.value='31';assert.equal(api.commitFocused(),true);assert.equal(text.fontSize,31);assert.equal(api.state().history.past.length,2);
});

test('mixed selection inspector exposes text controls and synchronizes every repeated formatting button',()=>{
 const shape=makeObject('rect'),a=makeObject('text',{fontSize:12,bold:true}),b=makeObject('text',{fontSize:20,bold:false});
 const size=input('fontSize',99,{type:'number'}),fontColor=input('fill','#000000',{type:'color',textOnly:true}),buttons=['bold','bold','italic','font-grow','text-left'].map(action=>node({action})),api=fixture([shape,a,b],{fields:[size,fontColor],buttons});
 api.inspect();assert.equal(size.disabled,false);assert.equal(size.value,'');assert.equal(size.placeholder,'—');assert.equal(size.dataset.mixed,'true');assert.equal(fontColor.disabled,false);
 for(const button of buttons.filter(button=>button.dataset.action==='bold')){assert.equal(button.disabled,false);assert.equal(button.getAttribute('aria-pressed'),'mixed');}
 api.select([shape.id]);api.inspect();assert.equal(size.disabled,true);assert.equal(fontColor.disabled,true);for(const button of buttons)assert.equal(button.disabled,true);
 api.select([a.id]);api.inspect();for(const button of buttons.filter(button=>button.dataset.action==='bold')){assert.equal(button.getAttribute('aria-pressed'),'true');assert.equal(button.classList.contains('active'),true);}
});

test('all repeated undo, redo and drawing controls track history and selected tool',()=>{
 const text=makeObject('text'),size=input('fontSize',22,{type:'number'}),buttons=['undo','undo','redo','redo'].map(action=>node({action})),tools=['select','select','text'].map(tool=>node({tool})),api=fixture([text],{fields:[size],buttons,tools});
 api.toolbar();assert.ok(buttons.every(button=>button.disabled));assert.equal(tools[0].getAttribute('aria-pressed'),'true');assert.equal(tools[1].getAttribute('aria-pressed'),'true');assert.equal(tools[2].getAttribute('aria-pressed'),'false');
 api.commit(size);api.toolbar();assert.ok(buttons.filter(button=>button.dataset.action==='undo').every(button=>!button.disabled));assert.ok(buttons.filter(button=>button.dataset.action==='redo').every(button=>button.disabled));
 api.undo();api.toolbar();assert.ok(buttons.filter(button=>button.dataset.action==='undo').every(button=>button.disabled));assert.ok(buttons.filter(button=>button.dataset.action==='redo').every(button=>!button.disabled));
});

test('transparency uses PowerPoint percentages and preserves independent fill and line values through Undo',()=>{
 const shape=makeObject('rect',{opacity:.8,fillTransparency:20,strokeTransparency:60}),overall=input('opacity',0,{type:'number'}),fill=input('fillTransparency',0,{type:'number'}),stroke=input('strokeTransparency',0,{type:'number'}),api=fixture([shape],{fields:[overall,fill,stroke]});
 api.inspect();assert.equal(overall.value,20);assert.equal(fill.value,20);assert.equal(stroke.value,60);
 overall.value='0';api.commit(overall);assert.equal(shape.opacity,1);
 overall.value='100';api.commit(overall);assert.equal(shape.opacity,0);
 overall.value='25';api.commit(overall);assert.equal(shape.opacity,.75);
 fill.value='35.5';api.commit(fill);assert.equal(shape.fillTransparency,35.5);assert.equal(shape.strokeTransparency,60);assert.equal(shape.opacity,.75);
 stroke.value='100';api.commit(stroke);assert.equal(shape.strokeTransparency,100);assert.equal(shape.fillTransparency,35.5);
 api.undo();assert.equal(api.state().doc.objects[0].strokeTransparency,60);assert.equal(api.state().doc.objects[0].fillTransparency,35.5);
 api.redo();assert.equal(api.state().doc.objects[0].strokeTransparency,100);
});

test('no color remains a real value in the inspector and inline text edit retains the caret',()=>{
 const text=makeObject('text'),color=input('fill','none',{textOnly:true}),alpha=input('fillTransparency',40,{type:'number',textOnly:true}),api=fixture([text],{fields:[color,alpha]});
 color.setAttribute('data-color-value','');api.start(text.id);api.commit(color);
 assert.equal(text.fill,'none');assert.equal(api.state().editingId,text.id);assert.equal(api.document.activeElement,api.state().editor);assert.equal(api.state().editor.style.color,'transparent');
 alpha.value='40';api.commit(alpha);assert.equal(text.fillTransparency,40);assert.equal(api.state().editor.style.opacity,.6);assert.equal(api.state().history.past.length,0);
 api.finish();api.inspect();assert.equal(color.value,'none');assert.equal(api.state().history.past.length,1);
 api.undo();assert.equal(api.state().doc.objects[0].fill,'#172f36');assert.equal(api.state().doc.objects[0].fillTransparency,0);
});

test('text outline color, width, alignment and transparency stay in one inline edit and exclude other objects',()=>{
 const text=makeObject('text',{text:'Outlined'}),shape=makeObject('rect',{stroke:'#00ff00',strokeWidth:3}),color=input('stroke','#ff0000',{textOnly:true}),width=input('strokeWidth',2.5,{type:'number',textOnly:true}),alignment=input('strokeAlignment','outside',{tagName:'SELECT',textOnly:true}),alpha=input('strokeTransparency',30,{type:'number',textOnly:true}),api=fixture([shape,text],{fields:[color,width,alignment,alpha]});
 color.setAttribute('data-color-value','');api.start(text.id);api.commit(color);assert.equal(api.state().editor.style.color,'transparent');assert.equal(api.document.activeElement,api.state().editor);
 width.value='2.5';api.commit(width);alignment.value='outside';api.document.activeElement=alignment;api.commit(alignment);alpha.value='30';api.commit(alpha);
 assert.deepEqual([text.stroke,text.strokeWidth,text.strokeAlignment,text.strokeTransparency],['#ff0000',2.5,'outside',30]);assert.deepEqual([shape.stroke,shape.strokeWidth],['#00ff00',3]);assert.equal(api.state().history.past.length,0);assert.equal(api.document.activeElement,api.state().editor);
 api.finish();assert.equal(api.state().history.past.length,1);api.undo();assert.equal(api.state().doc.objects.find(o=>o.id===text.id).stroke,'none');api.redo();assert.equal(api.state().doc.objects.find(o=>o.id===text.id).strokeAlignment,'outside');
});
