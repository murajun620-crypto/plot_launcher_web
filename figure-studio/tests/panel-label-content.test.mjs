import test from 'node:test';
import assert from 'node:assert/strict';
import {makeObject,newDocument,validateDocument,clone,History} from '../model.mjs';
import {applyPanelLabels} from '../panel-labels.mjs';
import {panelLabelDisplay,readPanelLabelContent,writePanelLabelContent} from '../panel-label-content.mjs';
import {createPanelLabelEditor} from '../panel-label-editor.mjs';
import {fitTextBox} from '../text-fit.mjs';
import {createTexRenderer} from '../tex.mjs';

const image=(id,x=10,extra={})=>makeObject('image',{id,x,y:80,w:60,h:40,assetId:'asset',...extra});
const scene=(...objects)=>({...newDocument(),objects});
const fit=object=>fitTextBox(object,{measure:text=>({width:text.length*5,actualBoundingBoxAscent:7,actualBoundingBoxDescent:2})});

test('label and supplementary text follow MiFiTo parentheses and whitespace rules',()=>{
 assert.equal(panelLabelDisplay({text:' ((a-1)) ',subtext:' Step 1 ',parentheses:true}),'(a-1) Step 1');
 assert.equal(panelLabelDisplay({text:'a-1',subtext:'Step 1\n10 min',parentheses:false}),'a-1 Step 1\n10 min');
 assert.equal(panelLabelDisplay({text:'',subtext:'Only supplementary',parentheses:true}),'Only supplementary');
 assert.equal(panelLabelDisplay({text:'$a_1$',subtext:'$\\micro$m',parentheses:true}),'($a_1$) $\\micro$m');
});

test('existing labels open without changing their text or stale ordinary-text edits',()=>{
 for(const text of ['(a-1)','a','(a) Previous caption','']){
  const object=makeObject('text',{panelLabel:true,text}),before=clone(object);
  assert.equal(panelLabelDisplay(readPanelLabelContent(object)),text);assert.deepEqual(object,before);
 }
 const object=makeObject('text',{panelLabel:true});writePanelLabelContent(object,{text:'a',subtext:'Caption',parentheses:true});
 object.text='Manually changed';assert.deepEqual(readPanelLabelContent(object),{text:'Manually changed',subtext:'',parentheses:false});
});

test('grouped panels have one label, and renumbering retains individually edited supplements',()=>{
 const doc=scene(image('a'),image('b',80,{groupId:'pair'}),image('c',150,{groupId:'pair'}));
 const options={scope:'all',style:'branch-number',numbering:{parent:'c'},subtext:'Step 1'};
 applyPanelLabels(doc,[],options,fit);
 let labels=doc.objects.filter(object=>object.panelLabel);
 assert.deepEqual(labels.map(object=>object.text),['(c-1) Step 1','(c-2) Step 1']);
 assert.equal(doc.objects.find(object=>object.id==='b').groupId,labels[1].groupId);
 writePanelLabelContent(labels[1],{text:'c-2',subtext:'Step 2',parentheses:true});
 const labelIds=labels.map(object=>object.id);
 applyPanelLabels(doc,[],{...options,numbering:{parent:'d'},subtext:undefined},fit);
 labels=doc.objects.filter(object=>object.panelLabel);
 assert.deepEqual(labels.map(object=>object.text),['(d-1) Step 1','(d-2) Step 2']);
 assert.deepEqual(labels.map(object=>object.id),labelIds);
 assert.equal(validateDocument(JSON.parse(JSON.stringify(doc))).objects.at(-1).panelLabelContent.subtext,'Step 2');
});

test('multiline supplemental text is fitted above the image and invalid input is atomic',()=>{
 const doc=scene(image('a'));
 applyPanelLabels(doc,[],{scope:'all',subtext:'Step 1\n10 min'},fit);
 const label=doc.objects.find(object=>object.panelLabel);
 assert.equal(label.text,'(a) Step 1\n10 min');
 const lastGlyphBottom=label.y+label.fontSize*.95+label.fontSize*1.25+2;
 assert.ok(lastGlyphBottom<doc.objects[0].y);
 const before=clone(doc);
 assert.throws(()=>applyPanelLabels(doc,[],{scope:'all',subtext:7},fit),/補足/);assert.deepEqual(doc,before);
 assert.throws(()=>writePanelLabelContent(label,{text:'a',subtext:{},parentheses:true}));assert.deepEqual(doc,before);
 assert.throws(()=>validateDocument({...doc,objects:[{...label,panelLabelContent:{text:'a',subtext:'x',parentheses:'yes'}}]}),/ラベル/);
});

test('generated panels use textbox TeX detection in both the label and its supplement',async()=>{
 const panel=image('a'),doc=scene(panel),calls=[];
 const renderer=createTexRenderer({convert:async(source,display)=>{
  calls.push([source,display]);return {viewBox:[0,-1600,1000,2200],nodes:[]};
 }});
 applyPanelLabels(doc,[],{scope:'all',subtext:'$$\\frac{a}{b}$$'},fit);
 const label=doc.objects.find(object=>object.panelLabel);
 assert.equal(label.textMode,'auto');
 assert.ok(label.y+label.h<panel.y);
 assert.equal(label.text,'(a) $$\\frac{a}{b}$$');
 const ordinary=makeObject('text',{...label,panelLabel:false});
 await renderer.prepare([label,ordinary]);
 assert.deepEqual(calls,[['\\frac{a}{b}',true]]);
 assert.equal(renderer.getLayout(label),renderer.getLayout(ordinary));

 writePanelLabelContent(label,{text:'$a_1$',subtext:'$$x^2$$',parentheses:false});
 const restored=validateDocument(JSON.parse(JSON.stringify(doc))).objects.at(-1);
 await renderer.prepare([restored]);
 assert.deepEqual(calls.slice(1),[['a_1',false],['x^2',true]]);
 applyPanelLabels(doc,[],{scope:'all',textMode:'plain'},fit);
 assert.equal(renderer.hasMath(doc.objects.at(-1)),false);
 assert.match(doc.objects.at(-1).text,/\$\$x\^2\$\$/);
});

test('panel content survives save, undo and redo with ordinary text attributes',()=>{
 const doc=scene(makeObject('text',{panelLabel:true,text:'(a)',groupId:'panel',fontFamily:'Arial'})),before=clone(doc),history=new History();
 writePanelLabelContent(doc.objects[0],{text:'b-2',subtext:'Revised\ncaption',parentheses:true});fit(doc.objects[0]);
 history.push(before,doc);const saved=validateDocument(JSON.parse(JSON.stringify(doc)));
 assert.equal(saved.objects[0].text,'(b-2) Revised\ncaption');assert.equal(saved.objects[0].groupId,'panel');
 const undone=history.undo(doc);assert.deepEqual(undone,before);assert.deepEqual(history.redo(undone),doc);
});

function editorHarness(doc,mathPreview){
 let current=doc,applied=[];
 const fields=Object.fromEntries(['text','subtext','parentheses','textMode','fontSize'].map(name=>[name,{value:'',checked:false,focus(){this.focused=true;},select(){}}]));
 const form=new EventTarget();form.elements={namedItem:name=>fields[name]};form.reportValidity=()=>true;
 form.requestSubmit=()=>form.dispatchEvent(new Event('submit',{cancelable:true}));
 const preview={},error={},cancel=new EventTarget(),root=new EventTarget();
 root.querySelector=selector=>selector==='form'?form:selector==='[data-panel-preview]'?preview:error;
 root.querySelectorAll=()=>[cancel];root.showModal=()=>{root.open=true;};root.close=()=>{root.open=false;root.dispatchEvent(new Event('close'));};
 const editor=createPanelLabelEditor({root,getDocument:()=>current,mathPreview,onApply:(id,options)=>applied.push({id,options})});
 return {editor,root,form,fields,preview,error,cancel,applied,setDocument:next=>{current=next;}};
}

test('double-click editor previews the same composed TeX source and mode it applies',()=>{
 const label=makeObject('text',{panelLabel:true,text:'(a)',textMode:'plain'}),doc=scene(label),previews=[];
 const h=editorHarness(doc,{show(style){previews.push(style);return style?.textMode==='auto';},hide(){previews.push(null);}});
 h.editor.show(label);
 assert.equal(h.fields.textMode.value,'plain');
 h.fields.textMode.value='auto';h.fields.text.value='$a_2$';h.fields.subtext.value='$$x^2$$';
 h.form.dispatchEvent(new Event('input'));
 assert.equal(h.preview.hidden,true);
 assert.equal(previews.at(-1).text,'($a_2$) $$x^2$$');
 h.form.requestSubmit();
 assert.equal(h.applied[0].options.textMode,'auto');
 assert.equal(panelLabelDisplay(h.applied[0].options.content),'($a_2$) $$x^2$$');
 assert.equal(previews.at(-1),null);
});

test('the label editor submits only the chosen label, and cancel does not mutate it',()=>{
 const first=makeObject('text',{id:'first',panelLabel:true,text:'(a)'}),second=makeObject('text',{id:'second',panelLabel:true,text:'(b)'});
 const doc=scene(first,second),before=clone(doc),h=editorHarness(doc);
 h.editor.show(second);assert.equal(h.fields.text.value,'b');assert.equal(h.fields.parentheses.checked,true);
 h.fields.subtext.value='Step 2';h.form.dispatchEvent(new Event('input'));
 assert.equal(h.preview.textContent,'(b) Step 2');assert.deepEqual(doc,before);
 h.cancel.dispatchEvent(new Event('click'));assert.equal(h.root.open,false);assert.equal(h.applied.length,0);assert.deepEqual(doc,before);
 h.editor.show(second);h.fields.text.value='b-2';h.fields.subtext.value='Changed';h.form.requestSubmit();
 assert.equal(h.applied.length,1);assert.equal(h.applied[0].id,'second');assert.equal(h.applied[0].options.content.subtext,'Changed');
 assert.equal(h.root.open,false);assert.deepEqual(doc,before);
});

test('the label editor rejects changed documents and locked panels',()=>{
 const label=makeObject('text',{panelLabel:true,text:'(a)',groupId:'panel'}),doc=scene(label),h=editorHarness(doc);
 h.editor.show(label);h.setDocument(scene({...label}));h.form.requestSubmit();
 assert.equal(h.applied.length,0);assert.equal(h.error.hidden,false);assert.equal(h.root.open,true);
 const locked=editorHarness(scene(label,image('a',10,{groupId:'panel',locked:true})));
 locked.editor.show(label);assert.notEqual(locked.root.open,true);
});

test('Ctrl/Cmd+Enter applies but Enter and IME composition do not submit',()=>{
 const h=editorHarness(scene()),label=makeObject('text',{panelLabel:true,text:'(a)'});
 h.setDocument(scene(label));h.editor.show(label);
 const key=props=>{const event=new Event('keydown',{cancelable:true});Object.assign(event,{key:'Enter',...props});h.root.dispatchEvent(event);return event;};
 key({});key({ctrlKey:true,isComposing:true});assert.equal(h.applied.length,0);
 assert.equal(key({metaKey:true}).defaultPrevented,true);assert.equal(h.applied.length,1);
});
