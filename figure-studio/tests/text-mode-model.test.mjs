import test from 'node:test';
import assert from 'node:assert/strict';
import {TEXT_MODES,makeObject,newDocument,validateDocument,History,clone} from '../model.mjs';

const documentWith=objects=>({...newDocument(),objects});
const raw=String.raw`Label $\alpha_{i}^{2}+\frac{1}{\sqrt{x}}$ & <literal>
Second line: \mathrm{mV} and escaped \$`;

test('only new text defaults to automatic TeX detection without changing its raw content',()=>{
 const object=makeObject('text',{text:raw});assert.equal(object.textMode,'auto');assert.equal(object.text,raw);assert.equal(object.strokeAlignment,'outside');
 for(const type of ['image','rect','line','arrow','curve','freeform','arc'])assert.equal(makeObject(type).textMode,undefined);
 assert.deepEqual(TEXT_MODES,['auto','tex','plain']);assert.equal(Object.isFrozen(TEXT_MODES),true);
});

test('legacy missing mode normalizes only text and preserves raw source and old stroke alignment behavior',()=>{
 const text=makeObject('text',{text:raw}),image=makeObject('image');delete text.textMode;delete text.strokeAlignment;
 const input=documentWith([text,image]),before=clone(input),restored=validateDocument(input);assert.deepEqual(input,before);
 assert.equal(restored.objects[0].textMode,'auto');assert.equal(restored.objects[0].strokeAlignment,'center');assert.equal(restored.objects[0].text,raw);assert.equal(restored.objects[1].textMode,undefined);
});

test('each mode survives save, clipboard-style validation and Undo without rewriting TeX delimiters or commands',()=>{
 const objects=TEXT_MODES.map(textMode=>makeObject('text',{textMode,text:raw})),saved=validateDocument(JSON.parse(JSON.stringify(documentWith(objects))));assert.deepEqual(saved.objects,objects);
 const pasted=validateDocument({...newDocument(),objects:clone(objects)});assert.deepEqual(pasted.objects,objects);pasted.objects[0].textMode='plain';assert.equal(objects[0].textMode,'auto');
 const history=new History(),after=clone(saved);after.objects[0].textMode='tex';history.push(saved,after);
 const undone=history.undo(after);assert.deepEqual(undone,saved);assert.deepEqual(history.redo(undone),after);assert.equal(after.objects[0].text,raw);
});

test('unknown modes are rejected and existing text length/type limits remain strict',()=>{
 for(const textMode of ['math','AUTO','',null,false,0,[],{}])for(const type of ['text','image'])assert.throws(()=>validateDocument(documentWith([makeObject(type,{textMode})])));
 assert.doesNotThrow(()=>validateDocument(documentWith([makeObject('image',{textMode:'plain'})])));
 assert.doesNotThrow(()=>validateDocument(documentWith([makeObject('text',{text:'x'.repeat(100000),textMode:'tex'})])));
 assert.throws(()=>validateDocument(documentWith([makeObject('text',{text:'x'.repeat(100001),textMode:'plain'})])));
 assert.throws(()=>validateDocument(documentWith([makeObject('text',{text:{formula:'x'},textMode:'tex'})])));
});
