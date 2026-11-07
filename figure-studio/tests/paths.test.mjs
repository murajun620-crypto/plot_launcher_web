import test from 'node:test';
import assert from 'node:assert/strict';
import {makeObject,newDocument,validateDocument,History,clone,objectBounds,autoLayout,align} from '../model.mjs';
import {pathData,isPathObject,objectFromPoints,PATH_POINT_LIMITS} from '../paths.mjs';

const docWith=(...objects)=>({...newDocument(),objects});
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<.000003,`${actual} != ${expected}`);
const cubics=data=>[...data.matchAll(/C ([^CMALZ]+)/g)].map(match=>match[1].trim().split(/\s+/).map(Number));
const assertSafe=data=>{assert.match(data,/^[MLCAZ0-9 .-]+$/);assert.doesNotMatch(data,/NaN|Infinity|undefined/);for(const token of data.split(/\s+/))if(!/^[MLCAZ]$/.test(token))assert.ok(Number.isFinite(Number(token)),token);};

test('new path shapes have independent editable geometry and conservative line styling',()=>{
 for(const type of ['curve','freeform','arc']){
  const a=makeObject(type),b=makeObject(type);assert.equal(isPathObject(a),true);assert.equal(a.fill,'none');assert.equal(a.strokeWidth,1);assert.equal(a.closed,false);assert.notEqual(a.id,b.id);
  assert.doesNotThrow(()=>validateDocument(docWith(a)));assertSafe(pathData(a));
  if(a.points){a.points[0].x=.2;assert.notEqual(b.points[0].x,.2);}else{assert.equal(a.startAngle,0);assert.equal(a.endAngle,180);}
 }
 assert.equal(isPathObject(makeObject('line')),false);assert.equal(pathData(makeObject('rect')),'');
});

test('world capture normalizes points without changing their positions or the caller data',()=>{
 const world=[{x:-10,y:50},{x:30,y:90},{x:15,y:60}],before=structuredClone(world),props=objectFromPoints('curve',world,{closed:true});
 assert.deepEqual({x:props.x,y:props.y,w:props.w,h:props.h},{x:-10,y:50,w:40,h:40});assert.equal(props.closed,true);assert.equal(props.id,undefined);
 props.points.forEach((point,index)=>{near(props.x+point.x*props.w,world[index].x);near(props.y+point.y*props.h,world[index].y);});assert.deepEqual(world,before);
 props.points[0].x=.1;assert.deepEqual(world,before);
 for(const points of [[{x:8,y:20},{x:50,y:20}],[{x:8,y:20},{x:8,y:70}],[{x:8,y:20},{x:8,y:20}]]){
  const o=makeObject('freeform',objectFromPoints('freeform',points));assert.ok(o.w>0&&o.h>0);assert.doesNotThrow(()=>validateDocument(docWith(o)));assertSafe(pathData(o));
  o.points.forEach((point,index)=>{near(o.x+point.x*o.w,points[index].x);near(o.y+point.y*o.h,points[index].y);});
 }
});

test('curves interpolate every vertex with continuous Catmull–Rom cubic tangents',()=>{
 const points=[{x:0,y:0},{x:.4,y:1},{x:.7,y:.2},{x:1,y:.8}],o=makeObject('curve',{w:100,h:40,points}),segments=cubics(pathData(o));
 assert.equal(segments.length,3);
 segments.forEach((segment,index)=>{near(segment[4],points[index+1].x*100);near(segment[5],points[index+1].y*40);});
 for(let index=0;index<segments.length-1;index++){
  const a=segments[index],b=segments[index+1];near(a[4]-a[2],b[0]-a[4]);near(a[5]-a[3],b[1]-a[5]);
 }
 const baseline=pathData(o);o.x=999;o.y=-500;o.rotation=95;assert.equal(pathData(o),baseline);assertSafe(baseline);
 const two=makeObject('curve',{w:60,h:30,points:[{x:0,y:0},{x:1,y:1}]});assert.equal(cubics(pathData(two)).length,1);assertSafe(pathData(two));
});

test('closed curves wrap smooth tangents and freeform closes with a straight final segment',()=>{
 const points=[{x:0,y:0},{x:1,y:.2},{x:.4,y:1}],curve=makeObject('curve',{w:100,h:60,points,closed:true}),data=pathData(curve),segments=cubics(data),first=segments[0],last=segments.at(-1);
 assert.equal(segments.length,3);assert.match(data,/ Z$/);near(last[4],0);near(last[5],0);near(-last[2],first[0]);near(-last[3],first[1]);
 assert.equal(pathData(makeObject('freeform',{w:100,h:60,points,closed:true})),'M 0 0 L 100 12 L 40 60 Z');
 assert.equal(pathData({...curve,points:[...points,points[0]]}),data);
});

test('arc sweeps follow signed angles, full ellipses use two arcs, and rotation stays outside path data',()=>{
 const arc=makeObject('arc',{w:100,h:40});assert.equal(pathData(arc),'M 100 20 A 50 20 0 0 1 0 20');
 assert.equal(pathData({...arc,endAngle:-90}),'M 100 20 A 50 20 0 0 0 50 0');
 assert.match(pathData({...arc,endAngle:270}),/ A 50 20 0 1 1 /);
 for(const span of [360,-360,720,-720]){const data=pathData({...arc,endAngle:span});assert.equal((data.match(/ A /g)||[]).length,2);assert.ok(data.endsWith('100 20'));assertSafe(data);}
 assert.equal(pathData({...arc,startAngle:3600,endAngle:3420}),pathData({...arc,startAngle:0,endAngle:-180}));
 assert.equal(pathData({...arc,rotation:45,x:-50,y:200}),pathData(arc));
});

test('all path geometry survives JSON file roundtrip, independent Undo snapshots and Redo',()=>{
 const before=docWith(makeObject('curve'),makeObject('freeform',{closed:true,fill:'#00aa55'}),makeObject('arc',{startAngle:-30,endAngle:270})),after=clone(before),history=new History();
 after.objects[0].points[1].x=.3;after.objects[1].closed=false;after.objects[2].endAngle=360;after.objects[2].rotation=38;
 assert.equal(history.push(before,after),true);const saved=validateDocument(JSON.parse(JSON.stringify(after)));assert.deepEqual(saved,after);
 const restored=history.undo(after);assert.deepEqual(restored,before);after.objects[0].points[1].x=.9;
 const redone=history.redo(restored);assert.deepEqual(redone,saved);for(const object of redone.objects)assertSafe(pathData(object));
 saved.objects[0].points[0].x=.8;assert.equal(redone.objects[0].points[0].x,0);
});

test('path resize, alignment and layout preserve normalized geometry and arc angles',()=>{
 const objects=['curve','freeform','arc'].map((type,index)=>makeObject(type,{x:index*150,y:20,w:100,h:50,rotation:15})),doc=docWith(...objects),geometry=objects.map(o=>JSON.stringify({points:o.points,start:o.startAngle,end:o.endAngle}));
 autoLayout(doc,objects.map(o=>o.id));align(doc,objects.map(o=>o.id),'left');
 objects.forEach((object,index)=>{assert.ok(object.w>0&&object.h>0);assert.equal(object.rotation,15);assert.equal(JSON.stringify({points:object.points,start:object.startAngle,end:object.endAngle}),geometry[index]);assertSafe(pathData(object));});
 const arc=makeObject('arc',{x:10,y:20,w:100,h:40,startAngle:15,endAngle:45});assert.deepEqual(objectBounds(arc),{x:10,y:20,w:100,h:40});
 assert.doesNotThrow(()=>validateDocument(doc));
});

test('malformed points, unsupported closures, unsafe dimensions and invalid arc angles are rejected',()=>{
 const curve=makeObject('curve'),arc=makeObject('arc');
 const invalid=[...['curve','freeform'].flatMap(type=>[{...makeObject(type),points:[]},{...makeObject(type),points:[{x:0,y:0}]},{...makeObject(type),points:[{x:0,y:0},{x:1.01,y:1}]},{...makeObject(type),points:[{x:0,y:0},{x:NaN,y:1}]},{...makeObject(type),points:[{x:0,y:0},null]},{...makeObject(type),closed:'yes'}]),
  {...curve,points:[{x:0,y:0},{x:'0.5',y:1}]},{...curve,w:0},{...curve,h:-1},{...curve,w:Infinity},{...arc,startAngle:0,endAngle:0},{...arc,startAngle:null},{...arc,endAngle:NaN},{...arc,endAngle:3601},{...arc,startAngle:-3601}];
 for(const object of invalid){assert.throws(()=>validateDocument(docWith(object)));assert.throws(()=>pathData(object));}
 for(const points of [[{x:0,y:0},{x:Infinity,y:0}],[{x:0,y:0},{x:1e6+1,y:0}],[{x:-1e6,y:0},{x:1e6,y:0}]])assert.throws(()=>objectFromPoints('curve',points));
 assert.throws(()=>objectFromPoints('arc',[{x:0,y:0},{x:1,y:1}]));
 assert.throws(()=>objectFromPoints('curve',[{x:0,y:0},{x:1,y:1}],{closed:1}));
});

test('point limits bound large saved paths without weakening line and arrow endpoint validation',()=>{
 for(const type of ['curve','freeform']){
  const count=PATH_POINT_LIMITS[type],points=Array.from({length:count},(_,index)=>({x:index/(count-1),y:index%2})),object=makeObject(type,{points});
  assert.doesNotThrow(()=>validateDocument(docWith(object)));assertSafe(pathData(object));
  object.points.push({x:1,y:1});assert.throws(()=>validateDocument(docWith(object)));assert.throws(()=>objectFromPoints(type,object.points));
 }
 for(const type of ['line','arrow'])assert.doesNotThrow(()=>validateDocument(docWith(makeObject(type,{w:-40,h:0}))));
 assert.throws(()=>validateDocument(docWith(makeObject('arrow',{arrowEndStyle:'invalid'}))));
});
