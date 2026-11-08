import test from 'node:test';
import assert from 'node:assert/strict';
import {makeObject,newDocument,clone,objectBounds,bounds,History} from '../model.mjs';
import {inferImageArray,arrangeImageArray,imageArrayUnits} from '../image-array.mjs';

const image=(id,x,y,w=30,h=20,extra={})=>makeObject('image',{id,x,y,w,h,assetId:'asset-'+id,...extra});
const documentWith=(...objects)=>({...newDocument(),objects});
const ids=doc=>doc.objects.map(object=>object.id);
const near=(value,expected)=>assert.ok(Math.abs(value-expected)<1e-7,`${value} != ${expected}`);
const arrange=(doc,h=4,v=6,selected=ids(doc))=>arrangeImageArray(doc,selected,{horizontalGap:h,verticalGap:v});

test('preserves a roughly arranged 2 x 3 grid, sizes, z order and top-left anchor',()=>{
 const doc=documentWith(image('f',95,60),image('a',10,11),image('d',12,61),image('c',96,10),image('b',52,12),image('e',53,59));
 const before=clone(doc),layout=inferImageArray(doc,ids(doc));
 assert.equal(layout.error,null);assert.equal(layout.rows.length,2);assert.equal(layout.columns.length,3);
 assert.deepEqual(arrange(doc),{rows:2,columns:3,count:6});
 const byId=Object.fromEntries(doc.objects.map(o=>[o.id,o]));
 for(const [id,x,y]of [['a',10,10],['b',44,10],['c',78,10],['d',10,36],['e',44,36],['f',78,36]])assert.deepEqual([byId[id].x,byId[id].y],[x,y]);
 assert.deepEqual(doc.objects.map(o=>({...o,x:0,y:0})),before.objects.map(o=>({...o,x:0,y:0})));
 const once=clone(doc);arrange(doc);assert.deepEqual(doc,once);
});

test('uses maximum width per column and height per row for unequal images',()=>{
 const doc=documentWith(image('a',10,10,20,15),image('b',55,12,35,25),image('c',12,60,30,30),image('d',57,61,20,10));
 arrange(doc,3,8);
 assert.deepEqual(doc.objects.map(o=>[o.x,o.y,o.w,o.h]),[[10,10,20,15],[43,10,35,25],[10,43,30,30],[43,43,20,10]]);
});

test('detects center and bottom aligned images of different heights as one row',()=>{
 const doc=documentWith(image('a',0,0,20,40),image('b',40,10,20,20),image('c',80,20,20,20));
 assert.equal(inferImageArray(doc,ids(doc)).rows.length,1);arrange(doc,0,0);
 assert.deepEqual(doc.objects.map(o=>[o.x,o.y]),[[0,0],[20,0],[40,0]]);
});

test('single columns, zero gaps, decimal gaps and negative starting positions work',()=>{
 const doc=documentWith(image('a',-10,-20),image('b',-9,15),image('c',-11,60));
 assert.deepEqual(arrange(doc,.25,0),{rows:3,columns:1,count:3});
 assert.deepEqual(doc.objects.map(o=>[o.x,o.y]),[[-11,-20],[-11,0],[-11,20]]);
 const row=documentWith(image('a',0,0),image('b',50,0));arrange(row,2.75,0);near(row.objects[1].x,32.75);
});

test('vacant cells retain their column rather than flowing left',()=>{
 const doc=documentWith(image('a',0,0),image('c',100,0),image('d',0,50),image('e',50,50),image('f',100,50));
 arrange(doc);
 assert.deepEqual(doc.objects.map(o=>[o.x,o.y]),[[0,0],[68,0],[0,26],[34,26],[68,26]]);
});

test('whole group bounds anchor spacing and grouped labels travel by the same delta',()=>{
 const a=image('a',10,20,30,20,{groupId:'g'}),label=makeObject('text',{id:'label',x:6,y:10,w:8,h:7,groupId:'g'});
 const b=image('b',70,22),other=makeObject('rect',{id:'other',x:5,y:5});
 const doc=documentWith(a,label,b,other),before=clone(doc);arrange(doc,5,8,['a','b','other']);
 assert.deepEqual([a.x,a.y,b.x,b.y],[10,20,45,10]);
 assert.deepEqual(label,before.objects[1]);assert.deepEqual(other,before.objects[3]);
 // Move the entire selected group when it occupies a later column.
 const reverse=documentWith(image('first',0,20),a,label);a.x=70;label.x=66;arrange(reverse,5,8,['first','a']);
 assert.deepEqual([a.x,label.x,a.y-label.y],[39,35,10]);
});

test('multiple image groups move as complete units with their internal spacing intact',()=>{
 const doc=documentWith(image('a',10,10,30,20,{groupId:'g1'}),image('b',50,11,30,20,{groupId:'g1'}),makeObject('text',{id:'label',x:8,y:5,w:8,h:6,groupId:'g1'}),image('c',120,12,30,20,{groupId:'g2'}),image('d',160,13,30,20,{groupId:'g2'}));
 const before=clone(doc),layout=inferImageArray(doc,['a','c']);
 assert.equal(layout.withinGroup,false);assert.equal(layout.items.length,2);assert.equal(layout.columns.length,2);assert.equal(layout.rows.length,1);
 arrange(doc,5,5,['a','c']);
 const units=imageArrayUnits(doc,['a','c']),[a,b]=units.map(bounds);near(b.x-a.x-a.w,5);near(a.y,b.y);
 for(const unit of units){const origin=before.objects.find(o=>o.id===unit[0].id),dx=unit[0].x-origin.x,dy=unit[0].y-origin.y;for(const o of unit){const old=before.objects.find(v=>v.id===o.id);near(o.x-old.x,dx);near(o.y-old.y,dy);assert.equal(o.groupId,old.groupId);}}
});

test('a single selected image group arranges its individual images without ungrouping',()=>{
 const doc=documentWith(image('a',0,0,30,20,{groupId:'g'}),image('b',60,2,30,20,{groupId:'g'}),image('c',1,60,30,20,{groupId:'g'}),image('d',59,61,30,20,{groupId:'g'}),makeObject('text',{id:'label',x:-5,y:-8,w:10,h:6,groupId:'g'}),image('unselected',200,200));
 const label=clone(doc.objects[4]),outside=clone(doc.objects[5]),layout=inferImageArray(doc,['a']);
 assert.equal(layout.withinGroup,true);assert.equal(layout.items.length,4);assert.equal(imageArrayUnits(doc,['a']).length,4);
 arrange(doc,5,5,['a']);assert.deepEqual(doc.objects.slice(0,4).map(o=>[o.x,o.y,o.groupId]),[[0,0,'g'],[35,0,'g'],[0,25,'g'],[35,25,'g']]);
 assert.deepEqual(doc.objects[4],label);assert.deepEqual(doc.objects[5],outside);
});

test('one image group plus a standalone image arranges two units and keeps the group intact',()=>{
 const doc=documentWith(image('a',0,0,30,20,{groupId:'g'}),image('b',60,0,30,20,{groupId:'g'}),image('c',120,0));
 const layout=inferImageArray(doc,ids(doc));assert.equal(layout.withinGroup,false);assert.equal(layout.mixed,true);assert.equal(layout.imageUnitCount,1);assert.equal(layout.groupUnitCount,1);assert.equal(layout.items.length,2);
 arrange(doc,1,1);assert.deepEqual(doc.objects.map(o=>o.x),[0,60,91]);assert.equal(doc.objects[1].x-doc.objects[0].x,60);
});

test('mixed groups and standalone images retain a two-row arrangement and grouped labels',()=>{
 const doc=documentWith(image('a',0,5,20,20,{groupId:'g1'}),image('b',25,5,20,20,{groupId:'g1'}),makeObject('text',{id:'caption',x:0,y:0,w:10,h:5,groupId:'g1'}),image('c',80,1,45,25),image('d',2,80,45,25),image('e',81,81,20,20,{groupId:'g2'}),image('f',106,81,20,20,{groupId:'g2'}));
 const layout=inferImageArray(doc,ids(doc));assert.equal(layout.mixed,true);assert.equal(layout.imageUnitCount,2);assert.equal(layout.groupUnitCount,2);assert.equal(layout.items.length,4);assert.equal(layout.rows.length,2);assert.equal(layout.columns.length,2);
 arrange(doc,1,1);const [g1,c,d,g2]=imageArrayUnits(doc,ids(doc)).map(bounds);near(c.x-g1.x-g1.w,1);near(d.y-g1.y-g1.h,1);near(g2.x-d.x-d.w,1);near(g2.y-c.y-c.h,1);
 near(doc.objects[1].x-doc.objects[0].x,25);near(doc.objects[0].y-doc.objects[2].y,5);near(doc.objects[6].x-doc.objects[5].x,25);
});

test('a fixed standalone image does not unexpectedly switch a mixed selection into internal layout',()=>{
 const doc=documentWith(image('a',0,0,30,20,{groupId:'g'}),image('b',60,0,30,20,{groupId:'g'}),image('fixed',120,0,30,20,{locked:true})),before=clone(doc);
 const layout=inferImageArray(doc,ids(doc));assert.equal(layout.withinGroup,false);assert.equal(layout.items.length,1);assert.throws(()=>arrange(doc));assert.deepEqual(doc,before);
});

test('a fixed second selected group cannot unexpectedly cause an internal rearrangement',()=>{
 const doc=documentWith(image('a',0,0,30,20,{groupId:'g'}),image('b',60,0,30,20,{groupId:'g'}),image('c',120,0,30,20,{groupId:'fixed',locked:true})),before=clone(doc);
 const layout=inferImageArray(doc,ids(doc));assert.equal(layout.withinGroup,false);assert.equal(layout.items.length,1);assert.match(layout.error,/2つ以上/);
 assert.throws(()=>arrange(doc));assert.deepEqual(doc,before);
});

test('locked images, locked groups and unselected images are untouched',()=>{
 const fixed=image('locked',120,100,30,20,{locked:true}),a=image('a',0,0),b=image('b',60,1),c=image('c',200,200,30,20,{groupId:'g'});
 const label=makeObject('text',{id:'label',x:200,y:190,groupId:'g',locked:true}),other=image('other',300,300);
 const doc=documentWith(fixed,a,b,c,label,other),unchanged=clone([fixed,c,label,other]);arrange(doc,5,5,['locked','a','b','c']);
 assert.deepEqual([fixed,c,label,other],unchanged);assert.equal(b.x,35);
});

test('rotated images use visible bounds without changing their dimensions or rotation',()=>{
 const doc=documentWith(image('a',10,10,40,20,{rotation:90}),image('b',80,2,30,30,{rotation:45}));
 const before=clone(doc);arrange(doc,4.5,3);const [a,b]=doc.objects.map(objectBounds);
 near(b.x-a.x-a.w,4.5);near(a.y,b.y);
 assert.deepEqual(doc.objects.map(o=>[o.w,o.h,o.rotation]),before.objects.map(o=>[o.w,o.h,o.rotation]));
});

test('overlapping images in the same inferred cell fail without any mutation',()=>{
 const doc=documentWith(image('a',0,0),image('b',2,1)),before=clone(doc);
 assert.match(inferImageArray(doc,ids(doc)).error,/重なって/);assert.throws(()=>arrange(doc),/重なって/);assert.deepEqual(doc,before);
});

test('invalid, overflowing and insufficient selections fail atomically',()=>{
 for(const horizontalGap of [-1,NaN,Infinity,'2',1e8]){
  const doc=documentWith(image('a',0,0),image('b',60,0)),before=clone(doc);
  assert.throws(()=>arrangeImageArray(doc,ids(doc),{horizontalGap,verticalGap:3}));assert.deepEqual(doc,before);
 }
 for(const selected of [[],['a']]){const doc=documentWith(image('a',0,0),image('b',60,0)),before=clone(doc);assert.throws(()=>arrange(doc,3,3,selected),/2枚以上/);assert.deepEqual(doc,before);}
});

test('selection and layer order do not change the detected layout',()=>{
 const a=documentWith(image('a',0,0),image('b',50,2),image('c',2,50),image('d',52,48)),b=clone(a);b.objects.reverse();
 arrange(a);arrange(b,4,6,ids(b).reverse());
 assert.deepEqual([...a.objects].sort((x,y)=>x.id.localeCompare(y.id)),[...b.objects].sort((x,y)=>x.id.localeCompare(y.id)));
});

test('one history entry restores and reapplies the complete arrangement',()=>{
 const doc=documentWith(image('a',0,0),image('b',50,2),image('c',2,50),image('d',52,48)),before=clone(doc),history=new History();
 arrange(doc);const after=clone(doc);assert.equal(history.push(before,doc),true);assert.deepEqual(history.undo(doc),before);assert.deepEqual(history.redo(before),after);
});
