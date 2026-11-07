import test from 'node:test';
import assert from 'node:assert/strict';
import {createPathDrawing} from '../path-drawing.mjs';
import {objectFromPoints,pathData,PATH_POINT_LIMITS} from '../paths.mjs';

class SVG extends EventTarget {
 captures=new Set();
 setPointerCapture(id){this.captures.add(id);}
 hasPointerCapture(id){return this.captures.has(id);}
 releasePointerCapture(id){this.captures.delete(id);const event=new Event('lostpointercapture');event.pointerId=id;this.dispatchEvent(event);}
}
function fixture({tool='curve',zoom=1,selectAfterCommit=false}={}){
 const svg=new SVG(),drafts=[],commits=[],hints=[],cancellations=[];
 const drawing=createPathDrawing({svg,point:event=>({x:event.x,y:event.y}),scale:()=>zoom,onDraft:value=>drafts.push(value),onHint:value=>hints.push(value),onCancel:()=>cancellations.push(true),onCommit:value=>{commits.push(value);if(selectAfterCommit)drawing.setTool('select');}});
 drawing.setTool(tool);
 const event=(x,y,extra={})=>({x,y,pointerId:1,button:0,isPrimary:true,prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...extra});
 const down=(x,y,extra)=>{const e=event(x,y,extra);return {handled:drawing.pointerDown(e),event:e};};
 const move=(x,y,extra)=>drawing.pointerMove(event(x,y,extra));
 const up=(x,y,extra)=>drawing.pointerUp(event(x,y,extra));
 const click=(x,y)=>{down(x,y);up(x,y);};
 const key=(name,options={})=>{const e=new Event('keydown',{cancelable:true});Object.assign(e,{key:name,...options});svg.dispatchEvent(e);return e;};
 return {svg,drawing,drafts,commits,hints,cancellations,event,down,move,up,click,key};
}

test('curve clicks retain world vertices, show a separate hover point and commit once on Enter',()=>{
 const s=fixture({selectAfterCommit:true});s.click(10,20);s.move(25,30);
 assert.deepEqual(s.drafts.at(-1),{type:'curve',points:[{x:10,y:20}],closed:false,previewPoint:{x:25,y:30},freehand:false,canClose:false});
 assert.equal(s.commits.length,0);s.click(40,70);s.move(80,90);
 assert.equal(s.key('Enter').defaultPrevented,true);assert.equal(s.commits.length,1);
 assert.deepEqual(s.commits[0],{type:'curve',points:[{x:10,y:20},{x:40,y:70}],closed:false});
 assert.equal(s.drafts.at(-1),null);assert.equal(s.drawing.drawing,false);assert.equal(s.drawing.active,false);assert.equal(s.svg.captures.size,0);
 assert.match(pathData(objectFromPoints('curve',s.commits[0].points,{closed:false})),/^M/);
 s.key('Enter');assert.equal(s.commits.length,1);
});

test('a jittered second click of double-click adds no duplicate endpoint',()=>{
 const s=fixture();s.click(0,0);s.click(20,30);s.click(50,60);s.click(51,60);
 assert.equal(s.drawing.doubleClick(s.event(51,60)),true);
 assert.deepEqual(s.commits[0].points,[{x:0,y:0},{x:20,y:30},{x:50,y:60}]);assert.equal(s.commits.length,1);
});

test('exact double-click deduplication preserves an intentional short preceding edge',()=>{
 const s=fixture();s.click(0,0);s.click(4,0);s.click(4,0);s.drawing.doubleClick(s.event(4,0));
 assert.deepEqual(s.commits[0].points,[{x:0,y:0},{x:4,y:0}]);
});

test('clicking within six screen pixels of the start closes a path with three vertices',()=>{
 for(const tool of ['curve','freeform']){
  const s=fixture({tool,zoom:2});s.click(10,10);s.click(30,10);s.click(30,40);s.move(12,10);
  assert.equal(s.drafts.at(-1).canClose,true);s.down(12,10);
  assert.equal(s.commits.length,1);assert.equal(s.commits[0].closed,true);assert.equal(s.commits[0].points.length,3);assert.match(pathData(objectFromPoints(tool,s.commits[0].points,{closed:true})),/Z$/);
 }
 const s=fixture();s.click(0,0);s.click(30,0);s.click(0,0);assert.equal(s.commits.length,0);assert.equal(s.drawing.drawing,true);
});

test('freeform samples drags at screen spacing and commits exactly one object on pointer release',()=>{
 const s=fixture({tool:'freeform',zoom:2});s.down(0,0);assert.equal(s.svg.hasPointerCapture(1),true);
 s.move(1,0);s.move(2,0);s.move(2.4,0);s.move(4,2);
 assert.equal(s.commits.length,0);assert.deepEqual(s.drafts.at(-1).points,[{x:0,y:0},{x:2,y:0},{x:4,y:2}]);
 assert.equal(s.drafts.at(-1).freehand,true);s.up(4.5,2.5);
 assert.equal(s.commits.length,1);assert.deepEqual(s.commits[0].points.at(-1),{x:4.5,y:2.5});assert.equal(s.commits[0].closed,false);assert.equal(s.svg.captures.size,0);assert.equal(s.cancellations.length,0);
 s.up(8,8);s.drawing.doubleClick(s.event(8,8));assert.equal(s.commits.length,1);
});

test('freeform click vertices wait for completion and a final drag can extend them',()=>{
 const s=fixture({tool:'freeform'});s.click(0,0);s.click(20,0);s.move(30,10);
 assert.equal(s.commits.length,0);assert.deepEqual(s.drafts.at(-1).previewPoint,{x:30,y:10});
 s.down(40,0);s.move(50,20);s.up(60,30);
 assert.deepEqual(s.commits[0].points,[{x:0,y:0},{x:20,y:0},{x:40,y:0},{x:50,y:20},{x:60,y:30}]);
});

test('freeform commits a drag even when its only movement is reported on pointerup',()=>{
 const s=fixture({tool:'freeform'});s.down(5,7);s.up(50,70);
 assert.deepEqual(s.commits,[{type:'freeform',points:[{x:5,y:7},{x:50,y:70}],closed:false}]);
});

test('Escape, pointer cancellation and tool changes discard drafts without a history commit',()=>{
 const s=fixture();s.click(0,0);s.click(20,20);s.drawing.setTool('curve');assert.equal(s.drawing.drawing,true);assert.equal(s.cancellations.length,0);
 assert.equal(s.key('Escape').defaultPrevented,true);assert.equal(s.drawing.drawing,false);assert.equal(s.cancellations.length,1);
 s.down(10,10);const cancel=new Event('pointercancel');cancel.pointerId=1;s.svg.dispatchEvent(cancel);assert.equal(s.drawing.drawing,false);assert.equal(s.svg.captures.size,0);
 s.click(2,3);s.drawing.setTool('freeform');assert.equal(s.cancellations.length,3);assert.equal(s.commits.length,0);assert.equal(s.drawing.active,true);
 s.drawing.setTool('select');assert.equal(s.drawing.active,false);assert.equal(s.down(5,5).handled,false);
});

test('Backspace removes vertices; IME and modified keys retain native ownership',()=>{
 const s=fixture();s.click(0,0);s.click(20,10);s.click(40,30);
 assert.equal(s.key('Backspace').defaultPrevented,true);assert.equal(s.drafts.at(-1).points.length,2);
 for(const options of [{isComposing:true},{keyCode:229},{ctrlKey:true},{metaKey:true},{altKey:true},{getModifierState:key=>key==='AltGraph'}])assert.equal(s.key('Enter',options).defaultPrevented,false);
 assert.equal(s.key('Delete').defaultPrevented,false);assert.equal(s.commits.length,0);
 s.key('Backspace');assert.equal(s.drawing.finish(),false);assert.equal(s.drawing.drawing,true);
 s.key('Backspace');assert.equal(s.drawing.drawing,false);assert.equal(s.cancellations.length,1);assert.equal(s.key('Backspace').defaultPrevented,false);
});

test('point limits bound both paths while keeping a single final commit available',()=>{
 const curve=fixture();for(let index=0;index<PATH_POINT_LIMITS.curve+3;index++)curve.click(index*10,0);
 assert.equal(curve.drafts.at(-1).points.length,PATH_POINT_LIMITS.curve);assert.equal(curve.drafts.at(-1).previewPoint,null);assert.equal(curve.commits.length,0);curve.drawing.finish();assert.equal(curve.commits[0].points.length,PATH_POINT_LIMITS.curve);
 const freeform=fixture({tool:'freeform'});freeform.down(0,0);for(let index=1;index<PATH_POINT_LIMITS.freeform+3;index++)freeform.move(index*4,0);freeform.up(10000,0);
 assert.equal(freeform.commits.length,1);assert.equal(freeform.commits[0].points.length,PATH_POINT_LIMITS.freeform);assert.ok(freeform.hints.some(text=>text.includes('2000')));
});

test('secondary buttons, other captured pointers and invalid coordinates never change the draft',()=>{
 const s=fixture({tool:'freeform'});assert.equal(s.down(0,0,{button:2}).handled,false);assert.equal(s.down(0,0,{isPrimary:false}).handled,false);assert.equal(s.down(NaN,0).handled,false);
 s.down(0,0);assert.equal(s.move(30,0,{pointerId:2}),false);assert.equal(s.up(30,0,{pointerId:2}),false);assert.equal(s.commits.length,0);assert.equal(s.svg.hasPointerCapture(1),true);
 s.up(20,20);assert.equal(s.commits.length,1);
});

test('supplied world points override the event mapping and disposal removes keyboard handlers',()=>{
 const s=fixture();s.drawing.pointerDown(s.event(999,999),{x:1,y:2});s.up(999,999);s.drawing.pointerDown(s.event(999,999),{x:20,y:30});s.up(999,999);
 s.drawing.finish();assert.deepEqual(s.commits[0].points,[{x:1,y:2},{x:20,y:30}]);
 s.click(5,5);s.drawing.close();assert.equal(s.drawing.active,false);assert.equal(s.drawing.drawing,false);assert.equal(s.key('Enter').defaultPrevented,false);assert.equal(s.commits.length,1);
});
