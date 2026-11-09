import test from 'node:test';
import assert from 'node:assert/strict';
import {makeObject,validateDocument,newDocument,clone} from '../model.mjs';
import {fitTextBox,naturalTextLines} from '../text-fit.mjs';
import {createTexRenderer} from '../tex.mjs';
const measure=(text,o)=>({width:[...text].length*o.fontSize*(o.bold?.7:.5)});
const fit=o=>fitTextBox(o,{measure});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('text boxes grow and shrink with whole lines, newlines, font size and weight',()=>{
 const o=makeObject('text',{text:'AB',fontSize:10,w:100,h:100,x:10,y:20});fit(o);assert.equal(o.w,12);assert.equal(o.h,14.5);
 o.text='AB日本語 longer';fit(o);assert.equal(o.w,[...o.text].length*5+2);
 o.text='A\nBC\n';fit(o);assert.equal(o.w,12);assert.equal(o.h,39.5);assert.deepEqual(naturalTextLines('A\r\nBC\r'),['A','BC','']);
 o.fontSize=20;fit(o);assert.equal(o.w,22);assert.equal(o.h,77);
 o.bold=true;fit(o);assert.equal(o.w,30);
 o.text='';fit(o);assert.equal(o.w,2);assert.equal(o.h,27);assert.equal(o.x,10);assert.equal(o.y,20);
});

function anchor(o){const x=o.textAlign==='center'?o.w/2:o.textAlign==='right'?o.w:0,dx=(x-o.w/2)*(o.flipX?-1:1),dy=-o.h/2*(o.flipY?-1:1),r=o.rotation*Math.PI/180;return {x:o.x+o.w/2+dx*Math.cos(r)-dy*Math.sin(r),y:o.y+o.h/2+dx*Math.sin(r)+dy*Math.cos(r)};}
test('aligned top anchors stay fixed through all rotations and flips and repeated fitting is stable',()=>{
 for(const textAlign of ['left','center','right','justify'])for(const rotation of [0,35,90,270])for(const flipX of [false,true])for(const flipY of [false,true]){
  const o=makeObject('text',{text:'Resize me',x:20,y:30,w:100,h:80,textAlign,rotation,flipX,flipY,groupId:'group'}),before=anchor(o);
  assert.equal(fit(o),true);near(anchor(o).x,before.x);near(anchor(o).y,before.y);const saved=clone(o);assert.equal(fit(o),false);assert.deepEqual(o,saved);assert.equal(o.groupId,'group');
 }
});

test('locked or non-text objects and invalid measurements remain unchanged',()=>{
 for(const o of [makeObject('text',{locked:true}),makeObject('image'),makeObject('text',{fontSize:NaN})]){const before=structuredClone(o);assert.equal(fit(o),false);assert.deepEqual(o,before);}
 const o=makeObject('text'),before=clone(o);assert.equal(fitTextBox(o,{measure:()=>NaN}),false);assert.deepEqual(o,before);
});

test('autosize is retained by projects and legacy boxes retain their saved dimensions',()=>{
 const o=makeObject('text',{text:'Saved label'});fit(o);const doc={...newDocument(),objects:[o]};assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))),doc);
 for(const value of ['true',1,null])assert.throws(()=>validateDocument({...doc,objects:[{...o,textAutoSize:value}]}),/書式/);
 const legacy=makeObject('text',{w:250,h:150});assert.equal(validateDocument({...doc,objects:[legacy]}).objects[0].w,250);
});

test('natural math layouts fit full text without wrapping and reuse cached math after resizing',async()=>{
 let calls=0;const renderer=createTexRenderer({measure:(text,o)=>measure(text,o).width,convert:async()=>{calls++;return {viewBox:[0,-800,1000,1000],nodes:[]};}});
 const o=makeObject('text',{text:'Long $x$ label\nsecond line',fontSize:20,w:10,h:10,textAutoSize:true,textAlign:'center'});
 await renderer.prepare([o]);const layout=renderer.getLayout(o),key=renderer.key(o);assert.equal(layout.rows.length,2);
 assert.equal(fitTextBox(o,{measure,layout}),true);assert.equal(o.w,layout.width+2);assert.equal(o.h,layout.height+2);assert.equal(renderer.key(o),key);assert.equal(renderer.getLayout(o),layout);assert.equal(calls,1);
 o.text='$x$';await renderer.prepare([o]);const smaller=renderer.getLayout(o);fitTextBox(o,{measure,layout:smaller});assert.equal(o.w,22);assert.equal(calls,1);
});
