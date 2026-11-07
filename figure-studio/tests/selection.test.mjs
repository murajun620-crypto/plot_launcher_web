import test from 'node:test';
import assert from 'node:assert/strict';
import {makeObject,newDocument,clone} from '../model.mjs';
import {marqueeSelection} from '../selection.mjs';

const shape=(id,x,y,w=20,h=20,props={})=>makeObject('image',{id,x,y,w,h,...props});
const scene=(...objects)=>({...newDocument(),objects});

test('a rectangle started outside the paper encloses several images',()=>{
 const doc=scene(shape('a',10,10),shape('b',50,10),shape('c',90,10));
 assert.deepEqual(marqueeSelection(doc,{x:-40,y:-25},{x:75,y:50}),['a','b']);
});

test('all four drag directions return the same enclosed objects',()=>{
 const doc=scene(shape('a',10,10),shape('b',50,40),shape('outside',100,100));
 for(const [start,end]of [
  [{x:0,y:0},{x:80,y:80}],
  [{x:80,y:80},{x:0,y:0}],
  [{x:0,y:80},{x:80,y:0}],
  [{x:80,y:0},{x:0,y:80}],
 ])assert.deepEqual(marqueeSelection(doc,start,end),['a','b']);
});

test('partial overlap does not select an image, but exact enclosure does',()=>{
 const doc=scene(shape('a',10,10,20,20));
 assert.deepEqual(marqueeSelection(doc,{x:0,y:0},{x:29,y:40}),[]);
 assert.deepEqual(marqueeSelection(doc,{x:10,y:10},{x:30,y:30}),['a']);
});

test('Shift-style additive selection retains previous IDs without duplicates',()=>{
 const doc=scene(shape('a',10,10),shape('b',50,10),shape('c',90,10));
 assert.deepEqual(marqueeSelection(doc,{x:40,y:0},{x:75,y:40},{initialIds:['c','b','c','missing'],additive:true}),['b','c']);
 assert.deepEqual(marqueeSelection(doc,{x:40,y:0},{x:75,y:40},{initialIds:['c'],additive:false}),['b']);
});

test('groups require the entire group bounds to be enclosed',()=>{
 const doc=scene(shape('a',10,10,20,20,{groupId:'g'}),shape('b',60,10,20,20,{groupId:'g'}),shape('c',15,45));
 assert.deepEqual(marqueeSelection(doc,{x:0,y:0},{x:40,y:35}),[]);
 assert.deepEqual(marqueeSelection(doc,{x:0,y:0},{x:85,y:35}),['a','b']);
});

test('rotation uses visual bounds and handles reversed arrow endpoints',()=>{
 const doc=scene(shape('rotated',40,40,40,10,{rotation:90}),makeObject('arrow',{id:'arrow',x:90,y:90,w:-20,h:-20}));
 assert.deepEqual(marqueeSelection(doc,{x:50,y:20},{x:70,y:70}),['rotated']);
 assert.deepEqual(marqueeSelection(doc,{x:40,y:40},{x:80,y:50}),[]);
 assert.deepEqual(marqueeSelection(doc,{x:65,y:65},{x:95,y:95}),['arrow']);
});

test('locked objects can be enclosed without changing their state',()=>{
 const doc=scene(shape('locked',10,10,20,20,{locked:true})),before=clone(doc);
 assert.deepEqual(marqueeSelection(doc,{x:0,y:0},{x:40,y:40}),['locked']);
 assert.deepEqual(doc,before);
});

test('zero-area drags add nothing and preserve additive selection',()=>{
 const doc=scene(shape('a',10,10),shape('b',50,10));
 assert.deepEqual(marqueeSelection(doc,{x:0,y:0},{x:0,y:50}),[]);
 assert.deepEqual(marqueeSelection(doc,{x:0,y:0},{x:50,y:0},{initialIds:['a'],additive:true}),['a']);
});

test('selection is a pure operation and group IDs cannot collide with object IDs',()=>{
 const doc=scene(shape('a',10,10,20,20,{groupId:'same'}),shape('b',40,10,20,20,{groupId:'same'}),shape('same',100,100));
 const before=clone(doc),initial=['same'];
 assert.deepEqual(marqueeSelection(doc,{x:0,y:0},{x:70,y:40},{initialIds:initial,additive:true}),['a','b','same']);
 assert.deepEqual(doc,before);assert.deepEqual(initial,['same']);
});
