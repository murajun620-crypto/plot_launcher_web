import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {newDocument,makeObject,bounds,objectBounds,rotateOrFlip,clone,History,validateDocument} from '../model.mjs';

const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
const functions=source.split('\n').filter(line=>['transform','pathWorldPoint','pathLocalPoint'].some(name=>line.startsWith(`function ${name}(`))).join('\n');
const {world,local,transform}=Function(functions+';return {world:pathWorldPoint,local:pathLocalPoint,transform};')();
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const pointNear=(a,b)=>{near(a.x,b.x);near(a.y,b.y);};
const documentOf=objects=>({...newDocument(),objects});
const corners=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];

test('90 degree commands preserve each independent object center, size, assets and source data',()=>{
 const objects=['image','text','rect','ellipse','line','arrow','curve','freeform','arc'].map((type,index)=>makeObject(type,{x:index*70,y:index*20,w:40,h:20,rotation:25,name:'original',assetId:'pixels',source:{project:'original'}}));
 const doc=documentOf(objects),before=clone(doc);rotateOrFlip(doc,objects.map(o=>o.id),'rotate-right');
 for(const [index,o]of objects.entries()){near(o.rotation,115);near(o.x,before.objects[index].x);near(o.y,before.objects[index].y);assert.equal(o.w,40);assert.equal(o.h,20);assert.deepEqual(o.source,before.objects[index].source);assert.equal(o.assetId,'pixels');}
 rotateOrFlip(doc,objects.map(o=>o.id),'rotate-left');for(const [index,o]of objects.entries()){near(o.rotation,25);pointNear(o,before.objects[index]);}
});

test('group rotations and flips are rigid transforms of all visual points around the group center',()=>{
 for(const action of ['rotate-right','rotate-left','flip-h','flip-v']){
  const doc=documentOf([makeObject('image',{id:'a',x:10,y:20,w:50,h:30,rotation:20,groupId:'g'}),makeObject('text',{id:'b',x:90,y:40,w:30,h:15,rotation:-35,flipX:true,groupId:'g'}),makeObject('arrow',{id:'c',x:30,y:65,w:-20,h:35,rotation:80,flipY:true,groupId:'g'}),makeObject('rect',{id:'outside',x:300,y:0})]);
  const before=clone(doc),box=bounds(doc.objects.slice(0,3)),center={x:box.x+box.w/2,y:box.y+box.h/2};rotateOrFlip(doc,['a'],action);
  for(let index=0;index<3;index++)for(const point of corners){
   const old=world(before.objects[index],point),dx=old.x-center.x,dy=old.y-center.y;
   const expected=action==='rotate-right'?{x:center.x-dy,y:center.y+dx}:action==='rotate-left'?{x:center.x+dy,y:center.y-dx}:action==='flip-h'?{x:center.x-dx,y:old.y}:{x:old.x,y:center.y-dy};
   pointNear(world(doc.objects[index],point),expected);assert.equal(doc.objects[index].groupId,'g');
  }
  assert.deepEqual(doc.objects[3],before.objects[3]);
 }
});

test('flipped diagonal lines have correct bounds and path editing converts between local and visual coordinates',()=>{
 for(const flipX of [false,true])for(const flipY of [false,true])for(const rotation of [0,35,90,270]){
  const object=makeObject('arrow',{x:10,y:20,w:-40,h:30,rotation,flipX,flipY}),a=world(object,{x:0,y:0}),b=world(object,{x:1,y:1}),box=objectBounds(object);
  near(box.x,Math.min(a.x,b.x));near(box.y,Math.min(a.y,b.y));near(box.w,Math.abs(a.x-b.x));near(box.h,Math.abs(a.y-b.y));
  for(const point of [...corners,{x:.2,y:.7}]){const back=local(object,world(object,point));near(back.x,point.x*object.w);near(back.y,point.y*object.h);}
 }
});

test('group member selection and locked objects are protected during all four commands',()=>{
 for(const action of ['rotate-right','rotate-left','flip-h','flip-v']){
  const doc=documentOf([makeObject('image',{id:'a',groupId:'g'}),makeObject('text',{id:'b',groupId:'g',x:100}),makeObject('rect',{id:'locked',locked:true}),makeObject('image',{id:'locked-member',groupId:'locked-group',locked:true}),makeObject('text',{id:'protected',groupId:'locked-group'})]);
  const before=clone(doc);rotateOrFlip(doc,['a','locked','protected'],action,{individual:true});
  assert.notDeepEqual(doc.objects[0],before.objects[0]);for(let i=1;i<doc.objects.length;i++)assert.deepEqual(doc.objects[i],before.objects[i]);
  const locked=clone(doc);rotateOrFlip(doc,['locked','protected'],action);assert.deepEqual(doc,locked);
 }
});

test('repeated transforms, project persistence and one-step undo/redo retain editable objects and groups',()=>{
 const doc=documentOf([makeObject('image',{groupId:'g'}),makeObject('text',{x:120,groupId:'g',text:'Editable label'})]),before=clone(doc),ids=[doc.objects[0].id],history=new History();
 rotateOrFlip(doc,ids,'flip-h');const flipped=clone(doc);history.push(before,doc);
 assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))),doc);assert.deepEqual(history.undo(doc),before);assert.deepEqual(history.redo(before),flipped);
 rotateOrFlip(doc,ids,'flip-h');for(const [index,o]of doc.objects.entries()){pointNear(o,before.objects[index]);near(o.rotation,0);assert.equal(o.flipX,false);}
 for(let i=0;i<4;i++)rotateOrFlip(doc,ids,'rotate-right');for(const [index,o]of doc.objects.entries()){pointNear(o,before.objects[index]);near(o.rotation,0);assert.equal(o.groupId,'g');}
 assert.equal(doc.objects[1].text,'Editable label');
 for(const value of ['yes',1,null])assert.throws(()=>validateDocument({...doc,objects:[{...doc.objects[0],flipX:value}]}),/書式/);
 assert.deepEqual(validateDocument(before),before);
});

test('preview, thumbnails, clipboard and export share the same centered reflection transform',()=>{
 const object=makeObject('image',{x:10,y:20,w:40,h:30,rotation:15});assert.equal(transform(object),'translate(10 20) rotate(15 20 15)');
 object.flipX=true;assert.equal(transform(object),'translate(10 20) rotate(15 20 15) translate(20 15) scale(-1 1) translate(-20 -15)');
 object.flipY=true;assert.match(transform(object),/scale\(-1 -1\)/);
 assert.match(source,/g\.setAttribute\('transform',transform\(o\)\)/);assert.match(source,/o\.flipX\|\|o\.flipY\?/);
 const old=clone(object),doc=documentOf([object]);rotateOrFlip(doc,[object.id],'unsupported');assert.deepEqual(object,old);
});
