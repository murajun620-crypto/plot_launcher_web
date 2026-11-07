import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newDocument, makeObject, mm, toMM, bounds, objectBounds,
  selectionUnits, expandSelection, align, distribute, reorder,
  autoLayout, History, validateDocument, clone,
} from '../model.mjs';

const near = (actual, expected, message='') => assert.ok(Math.abs(actual-expected)<1e-7, `${message} ${actual} != ${expected}`);
const rect = (id,x,y,w=20,h=10,extra={}) => makeObject('rect',{id,x,y,w,h,...extra});
function docWith(...objects){return {...newDocument(),width:500,height:400,objects};}
const ids = doc => doc.objects.map(o=>o.id);

test('physical units round-trip and new documents are independent',()=>{
  near(toMM(mm(180)),180);
  const a=newDocument(),b=newDocument();
  assert.notEqual(a.id,b.id);
  a.objects.push(rect('a',0,0));
  assert.equal(b.objects.length,0);
});

test('bounds account for rotated rectangles and reversed line endpoints',()=>{
  const b=objectBounds(rect('r',10,20,40,20,{rotation:90}));
  near(b.x,20);near(b.y,10);near(b.w,20);near(b.h,40);
  const l=objectBounds(makeObject('line',{x:70,y:50,w:-30,h:-20}));
  assert.deepEqual(l,{x:40,y:30,w:30,h:20});
  assert.equal(bounds([]),null);
});

test('selecting one group member expands to a complete transform unit',()=>{
  const d=docWith(rect('a',20,30,20,10,{groupId:'g'}),rect('b',50,30,10,10,{groupId:'g'}),rect('c',0,60));
  assert.deepEqual(expandSelection(d,['a']),['a','b']);
  assert.deepEqual(selectionUnits(d,['a','c']).map(u=>u.map(o=>o.id)),[['a','b'],['c']]);
  align(d,['a','c'],'left');
  assert.equal(d.objects[0].x,0);assert.equal(d.objects[1].x,30);
  assert.equal(d.objects[1].x-d.objects[0].x,30);
});

test('a locked group member prevents partial group distortion',()=>{
  const d=docWith(rect('a',20,20,20,10,{groupId:'g'}),rect('b',50,20,10,10,{groupId:'g',locked:true}),rect('c',100,80));
  const before=clone(d.objects.slice(0,2));
  align(d,['a','b','c'],'left','page');
  assert.deepEqual(d.objects.slice(0,2),before);
  assert.equal(d.objects[2].x,0);
});

test('page alignment uses rotated visual bounds while retaining rotation',()=>{
  const o=rect('a',90,90,100,20,{rotation:90}),d=docWith(o);
  align(d,['a'],'right','page');align(d,['a'],'middle','page');
  const b=objectBounds(o);
  near(b.x+b.w,d.width);near(b.y+b.h/2,d.height/2);
  assert.equal(o.rotation,90);
});

test('selection alignment aligns unit outer edges rather than each group member',()=>{
  const d=docWith(rect('a',0,10,20,10,{groupId:'g'}),rect('b',30,20,20,10,{groupId:'g'}),rect('c',120,80,15,30));
  align(d,ids(d),'bottom');
  const units=selectionUnits(d,ids(d)),bs=units.map(bounds);
  near(bs[0].y+bs[0].h,bs[1].y+bs[1].h);
  near(d.objects[1].y-d.objects[0].y,10);
});

test('distribution preserves end units and equalizes gaps for unequal widths',()=>{
  const d=docWith(rect('a',0,0,20),rect('b',65,5,35),rect('c',200,10,10));
  distribute(d,ids(d),'h');
  near(d.objects[0].x,0);near(d.objects[2].x,200);
  const [a,b,c]=d.objects;
  near(b.x-a.x-a.w,c.x-b.x-b.w);
  assert.equal(b.y,5);
});

test('vertical distribution treats a selected group as one unit',()=>{
  const d=docWith(rect('a',0,0,10,10,{groupId:'g'}),rect('b',0,15,10,10,{groupId:'g'}),rect('c',10,60,10,15),rect('d',20,150,10,20));
  distribute(d,['a','c','d'],'v');
  const bs=selectionUnits(d,['a','c','d']).map(bounds);
  near(bs[1].y-bs[0].y-bs[0].h,bs[2].y-bs[1].y-bs[1].h);
  near(d.objects[1].y-d.objects[0].y,15);
  assert.equal(d.objects[3].y,150);
});

test('distribution of fewer than three units is unchanged',()=>{
  const d=docWith(rect('a',0,0),rect('b',100,0)),before=clone(d);
  distribute(d,ids(d),'h');
  assert.deepEqual(d,before);
});

test('front and back retain both selected and unselected relative orders',()=>{
  const make=()=>docWith(...['a','b','c','d','e'].map((id,i)=>rect(id,i*10,0)));
  const front=make();reorder(front,['d','b'],'front');
  assert.deepEqual(ids(front),['a','c','e','b','d']);
  const back=make();reorder(back,['d','b'],'back');
  assert.deepEqual(ids(back),['b','d','a','c','e']);
});

test('one-step ordering moves selection blocks without reversing them',()=>{
  const make=()=>docWith(...['a','b','c','d','e'].map((id,i)=>rect(id,i*10,0)));
  const forward=make();reorder(forward,['b','c'],'forward');
  assert.deepEqual(ids(forward),['a','d','b','c','e']);
  const backward=make();reorder(backward,['c','d'],'backward');
  assert.deepEqual(ids(backward),['a','c','d','b','e']);
  const separated=make();reorder(separated,['a','c'],'forward');
  assert.deepEqual(ids(separated),['b','a','d','c','e']);
});

test('ordering expands groups and respects locked selections',()=>{
  const d=docWith(rect('a',0,0,10,10,{groupId:'g'}),rect('b',0,0,10,10,{groupId:'g'}),rect('c',0,0,10,10,{locked:true}),rect('d',0,0));
  reorder(d,['a','c'],'front');
  assert.deepEqual(ids(d),['c','d','a','b']);
});

test('grid layout preserves image aspect ratios, rotation and group geometry',()=>{
  const a=makeObject('image',{id:'a',x:10,y:20,w:200,h:100,rotation:0,groupId:'g'});
  const label=makeObject('text',{id:'label',x:10,y:10,w:20,h:10,fontSize:12,groupId:'g'});
  const b=makeObject('image',{id:'b',x:300,y:20,w:100,h:160,rotation:15});
  const d=docWith(a,label,b),oldOffset=label.y-a.y,oldAWidth=a.w;
  autoLayout(d,['a','b']);
  near(a.w/a.h,2);near(b.w/b.h,100/160);assert.equal(b.rotation,15);
  near(label.y-a.y,oldOffset*(a.w/oldAWidth));
  assert.equal(label.fontSize,12);
  for(const unit of selectionUnits(d,['a','b'])){
    const box=bounds(unit);assert.ok(box.x>=0&&box.y>=0&&box.x+box.w<=d.width+1e-7&&box.y+box.h<=d.height+1e-7);
  }
});

test('hero layout uses a larger first panel with ordered right-hand panels',()=>{
  const d=docWith(...['a','b','c'].map(id=>rect(id,0,0,100,100)));
  autoLayout(d,ids(d),'hero');
  const [a,b,c]=d.objects;
  assert.ok(a.w>b.w);assert.ok(a.x<b.x);near(b.x,c.x);assert.ok(b.y<c.y);
  for(const o of d.objects){assert.ok(o.w>0&&o.h>0);near(o.w/o.h,1);}
});

test('layout remains positive for minimum paper sizes and dense documents',()=>{
  for(const kind of ['grid','hero']){
    const d={...newDocument(),width:mm(10),height:mm(10),objects:Array.from({length:120},(_,i)=>rect(String(i),0,0,30,20))};
    autoLayout(d,ids(d),kind);
    for(const o of d.objects){assert.ok(o.w>0&&o.h>0);near(o.w/o.h,1.5);assert.ok(o.x>=0&&o.y>=0&&o.x+o.w<=d.width+1e-7&&o.y+o.h<=d.height+1e-7);}
  }
});

test('single object on wide paper uses the available single cell',()=>{
  const d={...newDocument(),width:mm(2000),height:mm(10),objects:[rect('a',0,0,100,1)]};
  autoLayout(d,['a']);
  assert.ok(d.objects[0].w>mm(500));
  near(d.objects[0].x+d.objects[0].w/2,d.width/2);
});

test('history creates independent snapshots, supports redo and clears branching futures',()=>{
  const h=new History(),a=docWith(rect('a',0,0)),b=clone(a);b.objects[0].x=20;
  assert.equal(h.push(a,b),true);a.objects[0].x=999;
  const restored=h.undo(b);assert.equal(restored.objects[0].x,0);
  b.objects[0].x=555;
  const redo=h.redo(restored);assert.equal(redo.objects[0].x,20);
  const previous=h.undo(redo),branch=clone(previous);branch.objects[0].y=20;
  h.push(previous,branch);assert.equal(h.future.length,0);
  assert.equal(h.redo(branch),branch);
});

test('history ignores unchanged operations, caps snapshots and resets both stacks',()=>{
  const h=new History(2);let d=docWith(rect('a',0,0));
  assert.equal(h.push(d,clone(d)),false);
  for(let i=1;i<=4;i++){const next=clone(d);next.objects[0].x=i;h.push(d,next);d=next;}
  assert.equal(h.past.length,2);
  d=h.undo(d);assert.equal(d.objects[0].x,3);
  d=h.undo(d);assert.equal(d.objects[0].x,2);
  assert.equal(h.undo(d),d);
  h.reset();assert.deepEqual(h.past,[]);assert.deepEqual(h.future,[]);
});

test('validation round-trips supported objects without aliasing input',()=>{
  const d=docWith(...['image','text','line','arrow','rect','ellipse'].map((type,i)=>makeObject(type,{id:String(i)})));
  const valid=validateDocument(d);assert.deepEqual(valid,d);
  valid.objects[0].x=999;assert.notEqual(d.objects[0].x,999);
  const reversed=docWith(makeObject('line',{w:-20,h:-30}));
  assert.doesNotThrow(()=>validateDocument(reversed));
});

test('validation rejects malformed schemas, duplicate IDs and non-finite geometry',()=>{
  for(const input of [null,{}, {...newDocument(),version:2}, {...newDocument(),width:Infinity}, {...newDocument(),height:1}])assert.throws(()=>validateDocument(input));
  assert.throws(()=>validateDocument(docWith(rect('a',0,0),rect('a',10,0))));
  assert.throws(()=>validateDocument(docWith(null)));
  for(const p of ['x','y','w','h','rotation']){
    const d=docWith(rect('a',0,0));d.objects[0][p]=NaN;assert.throws(()=>validateDocument(d));
  }
  assert.throws(()=>validateDocument(docWith(rect('',0,0))));
  assert.throws(()=>validateDocument(docWith(rect('a',0,0,-20,10))));
});

test('validation rejects malformed colors and text styles',()=>{
  for(const color of ['#12345','#1234567','url(https://example.com/x)','red;stroke:url(x)']){
    const d=docWith(rect('a',0,0,20,10,{fill:color}));assert.throws(()=>validateDocument(d));
  }
  for(const color of ['#123','#1234','#123456','#12345678','none','transparent']){
    assert.doesNotThrow(()=>validateDocument(docWith(rect('a',0,0,20,10,{fill:color}))));
  }
  for(const props of [{fontSize:0},{text:42},{textAlign:'invalid'},{fontFamily:{}},{bold:'yes'}])assert.throws(()=>validateDocument(docWith(makeObject('text',props))));
  assert.throws(()=>validateDocument(docWith(rect('a',0,0,20,10,{opacity:2}))));
  assert.throws(()=>validateDocument(docWith(rect('a',0,0,20,10,{groupId:{}}))));
});
