import test from 'node:test';
import assert from 'node:assert/strict';
import {STROKE_ALIGNMENTS,makeObject,newDocument,validateDocument,History,clone} from '../model.mjs';

const documentWith=objects=>({...newDocument(),objects});

test('new text has centered stroke geometry but retains no-outline defaults',()=>{
 const text=makeObject('text');assert.equal(text.strokeAlignment,'center');assert.equal(text.stroke,'none');assert.equal(text.strokeWidth,1);assert.equal(text.fill,'#172f36');
 assert.equal(text.fillTransparency,0);assert.equal(text.strokeTransparency,0);assert.equal(text.opacity,1);
 assert.deepEqual(STROKE_ALIGNMENTS,['outside','inside','center']);assert.equal(Object.isFrozen(STROKE_ALIGNMENTS),true);
});

test('all text stroke alignments preserve color, width, transparency and typography through file and clipboard validation',()=>{
 const objects=STROKE_ALIGNMENTS.map((strokeAlignment,index)=>makeObject('text',{strokeAlignment,stroke:'#123456',strokeWidth:2.5+index,strokeTransparency:12.5,fill:'none',fontSize:36,bold:true,text:'Aβ\n日本語',rotation:27,opacity:.7}));
 const file=validateDocument(JSON.parse(JSON.stringify(documentWith(objects))));assert.deepEqual(file.objects,objects);
 const pasted=validateDocument({...newDocument(),objects:clone(file.objects)});assert.deepEqual(pasted.objects,objects);
 pasted.objects[0].strokeAlignment='inside';assert.equal(objects[0].strokeAlignment,'outside');
});

test('missing legacy text alignment becomes center without changing old paint or the input',()=>{
 const text=makeObject('text',{stroke:'#aabbcc',strokeWidth:3,opacity:.45,fillTransparency:20,strokeTransparency:65});delete text.strokeAlignment;
 const input=documentWith([text]),before=clone(input),restored=validateDocument(input).objects[0];assert.deepEqual(input,before);
 assert.equal(restored.strokeAlignment,'center');assert.equal(restored.stroke,'#aabbcc');assert.equal(restored.strokeWidth,3);assert.equal(restored.opacity,.45);assert.equal(restored.fillTransparency,20);assert.equal(restored.strokeTransparency,65);
 const line=makeObject('line',{w:-20,h:0});delete line.strokeAlignment;assert.equal(validateDocument(documentWith([line])).objects[0].strokeAlignment,undefined);
});

test('unsupported stroke alignment values cannot enter text or copied shape records',()=>{
 for(const strokeAlignment of ['outer','inner','middle','CENTER','','url(#clip)',null,0,false,[],{}])for(const type of ['text','rect','arrow'])assert.throws(()=>validateDocument(documentWith([makeObject(type,{strokeAlignment})])));
 for(const strokeWidth of [-1,NaN,Infinity,1001])assert.throws(()=>validateDocument(documentWith([makeObject('text',{strokeWidth,strokeAlignment:'outside'})])));
 for(const stroke of ['red;fill:url(x)','url(https://example.test/)'])assert.throws(()=>validateDocument(documentWith([makeObject('text',{stroke})])));
});

test('Undo and Redo retain text stroke alignment separately from width and colors',()=>{
 const before=documentWith([makeObject('text',{stroke:'#123456',strokeWidth:2})]),after=clone(before),history=new History();
 Object.assign(after.objects[0],{strokeAlignment:'inside',strokeWidth:5,strokeTransparency:40,fill:'#abcdef'});assert.equal(history.push(before,after),true);
 const undone=history.undo(after);assert.deepEqual(undone,before);after.objects[0].strokeAlignment='outside';
 const redone=history.redo(undone);assert.equal(redone.objects[0].strokeAlignment,'inside');assert.equal(redone.objects[0].strokeWidth,5);assert.equal(redone.objects[0].strokeTransparency,40);assert.equal(redone.objects[0].stroke,'#123456');assert.equal(redone.objects[0].fill,'#abcdef');
 assert.doesNotThrow(()=>validateDocument(redone));
});
