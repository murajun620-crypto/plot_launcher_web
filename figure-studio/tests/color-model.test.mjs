import test from 'node:test';
import assert from 'node:assert/strict';
import {makeObject,newDocument,validateDocument,clone,History} from '../model.mjs';
import {pathData} from '../paths.mjs';

const types=['image','text','line','arrow','rect','ellipse','curve','freeform','arc'];
const documentWith=objects=>({...newDocument(),objects});

test('new objects default both color channels to zero transparency while retaining overall opacity',()=>{
 for(const type of types){
  const object=makeObject(type);assert.equal(object.fillTransparency,0);assert.equal(object.strokeTransparency,0);assert.equal(object.opacity,1);
  assert.doesNotThrow(()=>validateDocument(documentWith([object])));
 }
 const custom=makeObject('rect',{fillTransparency:27.5,strokeTransparency:80,opacity:.6});
 assert.deepEqual([custom.fillTransparency,custom.strokeTransparency,custom.opacity],[27.5,80,.6]);
});

test('legacy files normalize missing color channels without mutating input or changing existing opacity',()=>{
 const input=documentWith(types.map(type=>makeObject(type,{opacity:.35,fill:'none',stroke:'#12345678'})));
 for(const object of input.objects){delete object.fillTransparency;delete object.strokeTransparency;}
 const before=clone(input),restored=validateDocument(input);assert.deepEqual(input,before);
 for(const object of restored.objects){assert.equal(object.fillTransparency,0);assert.equal(object.strokeTransparency,0);assert.equal(object.opacity,.35);assert.equal(object.fill,'none');assert.equal(object.stroke,'#12345678');}
 assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(restored))),restored);
 restored.objects[0].strokeTransparency=70;assert.equal(input.objects[0].strokeTransparency,undefined);
});

test('independent channel boundaries and fractional percentages survive file and clipboard-style validation',()=>{
 const objects=types.map((type,index)=>makeObject(type,{fillTransparency:[0,37.5,100][index%3],strokeTransparency:[100,0,12.125][index%3],opacity:.75})),doc=documentWith(objects);
 const file=validateDocument(JSON.parse(JSON.stringify(doc)));assert.deepEqual(file,doc);
 const pasted=validateDocument({...newDocument(),objects:JSON.parse(JSON.stringify(objects.slice(1,8)))});
 assert.deepEqual(pasted.objects,objects.slice(1,8));pasted.objects[0].fillTransparency=91;assert.notEqual(objects[1].fillTransparency,91);
});

test('nonfinite, out-of-range, and nonnumeric channel values are rejected rather than silently clamped',()=>{
 for(const property of ['fillTransparency','strokeTransparency'])for(const invalid of [-.01,100.01,NaN,Infinity,-Infinity,'50','',null,false,[],{}]){
  const object=makeObject('rect',{[property]:invalid});assert.throws(()=>validateDocument(documentWith([object])),undefined,`${property}: ${String(invalid)}`);
 }
 const object=makeObject('arrow',{fillTransparency:undefined,strokeTransparency:undefined}),restored=validateDocument(documentWith([object])).objects[0];
 assert.equal(restored.fillTransparency,0);assert.equal(restored.strokeTransparency,0);
});

test('no color is valid for text and every path without losing independent transparency settings',()=>{
 for(const type of types){
  const object=makeObject(type,{fill:'none',stroke:'none',fillTransparency:55,strokeTransparency:100,closed:true}),restored=validateDocument(documentWith([object])).objects[0];
  assert.equal(restored.fill,'none');assert.equal(restored.stroke,'none');assert.equal(restored.fillTransparency,55);assert.equal(restored.strokeTransparency,100);
  if(['curve','freeform','arc'].includes(type))assert.equal(pathData(restored),pathData(object));
 }
 for(const color of ['url(#unsafe)','red;opacity:0','javascript:alert(1)'])assert.throws(()=>validateDocument(documentWith([makeObject('text',{fill:color})])));
});

test('Undo and Redo restore per-fill and per-line transparency independently of color and whole-object opacity',()=>{
 const before=documentWith([makeObject('freeform',{closed:true,fill:'#aabbcc',stroke:'#112233',opacity:.5})]),after=clone(before),history=new History();
 after.objects[0].fillTransparency=65;after.objects[0].strokeTransparency=22.5;after.objects[0].stroke='none';history.push(before,after);
 const saved=validateDocument(JSON.parse(JSON.stringify(after))),undone=history.undo(after);assert.deepEqual(undone,before);
 after.objects[0].fillTransparency=99;const redone=history.redo(undone);assert.deepEqual(redone,saved);assert.equal(redone.objects[0].opacity,.5);assert.equal(redone.objects[0].stroke,'none');assert.equal(redone.objects[0].fill,'#aabbcc');
});
