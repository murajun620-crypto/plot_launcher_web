import test from 'node:test';
import assert from 'node:assert/strict';
import {newDocument,makeObject,clone,selectionUnits,align,distribute,reorder} from '../model.mjs';
import {resolveObjectSelection,clickObjectSelection,selectionDescription,marqueeSelection} from '../selection.mjs';
import {inferImageArray,arrangeImageArray} from '../image-array.mjs';
import {renderGroupLayers} from '../group-layers.mjs';
import {drawSelectionFrames} from '../selection-overlay.mjs';

function scene(){return {...newDocument(),width:300,height:200,objects:[makeObject('image',{id:'a',name:'Image A',x:10,y:20,w:30,h:20,groupId:'g'}),makeObject('image',{id:'b',name:'Image B',x:70,y:20,w:30,h:20,groupId:'g'}),makeObject('arrow',{id:'arrow',name:'Arrow',x:15,y:50,w:30,h:0,groupId:'g'}),makeObject('rect',{id:'outside',x:160,y:20,w:30,h:20})]};}
const empty={ids:[],groupId:null};

test('normal clicks select a whole group, direct selection selects exactly one member',()=>{
 const doc=scene(),before=clone(doc),whole=clickObjectSelection(doc,empty,'a');assert.deepEqual(whole,{ids:['a','b','arrow'],groupId:null});
 const member=clickObjectSelection(doc,whole,'arrow',{individual:true});assert.deepEqual(member,{ids:['arrow'],groupId:'g'});assert.deepEqual(doc,before);
 assert.match(selectionDescription(doc,whole.ids),/1グループ/);assert.match(selectionDescription(doc,member.ids,member.groupId),/個別選択.*Arrow/);
});

test('clicks and shift clicks within a group preserve the individual selection scope',()=>{
 const doc=scene();let state=clickObjectSelection(doc,empty,'a',{individual:true});
 state=clickObjectSelection(doc,state,'b',{additive:true});assert.deepEqual(state,{ids:['a','b'],groupId:'g'});
 state=clickObjectSelection(doc,state,'a',{additive:true});assert.deepEqual(state,{ids:['b'],groupId:'g'});
 state=clickObjectSelection(doc,state,'arrow');assert.deepEqual(state,{ids:['arrow'],groupId:'g'});
 state=clickObjectSelection(doc,state,'outside');assert.deepEqual(state,{ids:['outside'],groupId:null});
});

test('empty and stale scopes clear safely and do not persist group editing into another figure',()=>{
 const doc=scene();assert.deepEqual(resolveObjectSelection(doc,[],{groupId:'g'}),empty);assert.deepEqual(resolveObjectSelection(doc,['missing'],{groupId:'g'}),empty);
 assert.deepEqual(resolveObjectSelection(doc,['outside'],{groupId:'g'}),{ids:['outside'],groupId:null});
 assert.deepEqual(resolveObjectSelection(doc,['a'],{groupId:'deleted'}),{ids:['a','b','arrow'],groupId:null});
});

test('marquee within a group selects only its enclosed members without expanding siblings',()=>{
 const doc=scene();assert.deepEqual(marqueeSelection(doc,{x:0,y:0},{x:50,y:45},{groupId:'g'}),['a']);
 assert.deepEqual(marqueeSelection(doc,{x:0,y:0},{x:200,y:80},{groupId:'g'}),['a','b','arrow']);
 assert.deepEqual(marqueeSelection(doc,{x:0,y:0},{x:50,y:45}),[]);
});

test('individual selection keeps alignment and front/back commands inside the selected member',()=>{
 const doc=scene(),other=clone(doc.objects.filter(o=>o.id!=='b'));
 assert.deepEqual(selectionUnits(doc,['b'],{individual:true}).map(unit=>unit.map(o=>o.id)),[['b']]);
 align(doc,['b'],'right','page',{individual:true});assert.equal(doc.objects.find(o=>o.id==='b').x,270);
 assert.deepEqual(doc.objects.filter(o=>o.id!=='b'),other);
 reorder(doc,['b'],'front',{individual:true});assert.equal(doc.objects.at(-1).id,'b');assert.deepEqual(doc.objects.map(o=>o.groupId),['g','g',null,'g']);
});

test('individual distribution and image spacing never move unselected group members',()=>{
 const doc=scene();doc.objects.push(makeObject('image',{id:'c',x:160,y:20,w:30,h:20,groupId:'g'}));
 const arrow=clone(doc.objects.find(o=>o.id==='arrow'));
 distribute(doc,['a','b','c'],'h',{individual:true});assert.equal(doc.objects.find(o=>o.id==='b').x,85);assert.deepEqual(doc.objects.find(o=>o.id==='arrow'),arrow);
 const layout=inferImageArray(doc,['a','b'],{individual:true});assert.equal(layout.items.length,2);assert.equal(layout.withinGroup,true);
 arrangeImageArray(doc,['a','b'],{individual:true,horizontalGap:1,verticalGap:1});assert.equal(doc.objects.find(o=>o.id==='b').x,41);assert.equal(doc.objects.find(o=>o.id==='c').x,160);assert.deepEqual(doc.objects.find(o=>o.id==='arrow'),arrow);
});

test('locking any group member keeps the group protected in individual transform mode',()=>{
 const doc=scene();doc.objects.find(o=>o.id==='arrow').locked=true;const before=clone(doc);
 assert.deepEqual(selectionUnits(doc,['a'],{individual:true}),[]);align(doc,['a'],'left','page',{individual:true});reorder(doc,['a'],'front',{individual:true});assert.deepEqual(doc,before);
});

class Node{
 constructor(tag,ownerDocument){this.tag=tag;this.ownerDocument=ownerDocument;this.children=[];this.attributes={};this.dataset={};this.textContent='';this.className='';}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}setAttribute(key,value){this.attributes[key]=String(value);}
}
function dom(){const document={createElement:tag=>new Node(tag,document)};return {document,root:new Node('div',document),el:(tag,attrs={},text='')=>{const node=new Node(tag,document);Object.entries(attrs).forEach(([key,value])=>node.setAttribute(key,value));node.textContent=text;return node;}};}
function flatten(node){return [node,...node.children.flatMap(flatten)];}

test('layer tree makes group membership explicit and child/header selection distinct',()=>{
 const {root}=dom(),doc=scene(),calls=[];
 renderGroupLayers({root,doc,ids:['arrow'],groupId:'g',onSelect:value=>calls.push(value)});
 const nodes=flatten(root),header=nodes.find(node=>node.dataset.groupId==='g'),arrow=nodes.find(node=>node.dataset.id==='arrow');
 assert.match(header.children[0].textContent,/グループ 1/);assert.equal(header.children[1].textContent,'3個');assert.equal(header.attributes['aria-pressed'],'false');assert.equal(arrow.attributes['aria-pressed'],'true');assert.equal(arrow.children[2].textContent,'個別');
 arrow.onclick({shiftKey:false});header.onclick({shiftKey:false});assert.deepEqual(calls,[{id:'arrow',individual:true,additive:false},{groupId:'g',additive:false}]);
 renderGroupLayers({root,doc,ids:['a','b','arrow'],onSelect:()=>{}});assert.ok(flatten(root).some(node=>node.className.includes('group-selected')));
});

test('selection overlays distinguish blue members, purple groups and dashed context at every zoom',()=>{
 for(const scale of [.25,1,5]){
  const {root,el}=dom(),doc=scene();drawSelectionFrames({root,doc,ids:['arrow'],groupId:'g',scale,editableIds:['arrow'],el});
  assert.equal(root.attributes['data-selection-mode'],'member');assert.ok(root.children.some(node=>node.attributes['data-frame-role']==='group-context'&&node.attributes['stroke-dasharray']));
  const active=root.children.find(node=>node.attributes['data-frame-role']==='selection');assert.equal(active.attributes.stroke,'#146bd1');assert.equal(Number(active.attributes['stroke-width'])*scale,2);
  assert.ok(flatten(root).some(node=>node.textContent.includes('個別選択：Arrow')));
  root.replaceChildren();drawSelectionFrames({root,doc,ids:['a','b','arrow'],scale,editableIds:['a','b','arrow'],el});assert.equal(root.attributes['data-selection-mode'],'group');assert.equal(root.children.find(node=>node.attributes['data-frame-role']==='selection').attributes.stroke,'#7a45bf');
 }
});
