import test from 'node:test';
import assert from 'node:assert/strict';
import {ARROW_STYLES,ARROW_PROPERTIES,arrowEndpoint,arrowPropertyValue,setArrowProperty,arrowGeometry} from '../arrowheads.mjs';
import {makeObject,newDocument,validateDocument,History,clone} from '../model.mjs';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} ≠ ${expected}`);
const line=(props={})=>makeObject('line',{w:100,h:0,...props});
const arrow=(props={})=>makeObject('arrow',{w:100,h:0,...props});
function world(head,x,y){const a=head.angle*Math.PI/180;return{x:head.x+x*Math.cos(a)-y*Math.sin(a),y:head.y+x*Math.sin(a)+y*Math.cos(a)};}

test('boolean-only projects keep their old visible endpoints without migration',()=>{
 for(const [object,start,end]of [[arrow(),'none','triangle'],[arrow({arrowStart:true}),'triangle','triangle'],[arrow({arrowStart:true,arrowEnd:false}),'triangle','none'],[line(),'none','none']]){
  const before=clone(object);assert.equal(arrowEndpoint(object,'start').style,start);assert.equal(arrowEndpoint(object,'end').style,end);
  assert.equal(arrowEndpoint(object,'end').width,'medium');assert.equal(arrowEndpoint(object,'end').length,'medium');assert.deepEqual(object,before);
 }
});

test('explicit styles override legacy flags, including an explicitly absent head',()=>{
 const o=arrow({arrowStart:true,arrowStartStyle:'none',arrowEnd:false,arrowEndStyle:'oval'});
 assert.equal(arrowEndpoint(o,'start').style,'none');assert.equal(arrowEndpoint(o,'end').style,'oval');
 assert.deepEqual(arrowGeometry(o).heads.map(h=>h.style),['oval']);
});

test('adding a start head to a plain line preserves its empty end',()=>{
 const o=line();assert.ok(setArrowProperty(o,'arrowStartStyle','diamond'));assert.equal(o.type,'arrow');
 assert.equal(o.arrowStart,true);assert.equal(o.arrowEnd,false);assert.equal(o.arrowEndStyle,'none');
 assert.deepEqual(arrowGeometry(o).heads.map(h=>[h.end,h.style]),[['start','diamond']]);
 setArrowProperty(o,'arrowEndStyle','open');setArrowProperty(o,'arrowStartStyle','none');
 assert.equal(o.arrowStart,false);assert.equal(o.arrowEnd,true);assert.equal(arrowEndpoint(o,'end').style,'open');
});

test('editing width or length does not create a head, and absent heads retain size preferences',()=>{
 const o=line();setArrowProperty(o,'arrowEndWidth','wide');setArrowProperty(o,'arrowEndLength','long');
 assert.equal(o.type,'line');assert.equal(arrowGeometry(o).heads.length,0);
 setArrowProperty(o,'arrowEndStyle','stealth');assert.deepEqual(arrowEndpoint(o,'end'),{style:'stealth',width:'wide',length:'long'});
 setArrowProperty(o,'arrowEndStyle','none');setArrowProperty(o,'arrowEndStyle','oval');
 assert.equal(arrowPropertyValue(o,'arrowEndWidth'),'wide');assert.equal(arrowPropertyValue(o,'arrowEndLength'),'long');
});

test('invalid property edits and edits on other object types are rejected without mutation',()=>{
 for(const [o,p,v]of [[line(),'arrowStartStyle','script'],[line(),'arrowEndWidth','long'],[line(),'toString','wide'],[makeObject('rect'),'arrowEndStyle','oval']]){
  const before=clone(o);assert.equal(setArrowProperty(o,p,v),false);assert.deepEqual(o,before);
 }
});

test('each visible style has the appropriate filled or open SVG geometry',()=>{
 for(const style of ARROW_STYLES){
  const result=arrowGeometry(arrow({arrowEndStyle:style,stroke:'#123456',strokeWidth:2}));
  if(style==='none'){assert.equal(result.heads.length,0);continue;}
  assert.equal(result.heads.length,1);const h=result.heads[0];assert.equal(h.style,style);
  if(style==='open'){assert.equal(h.tag,'polyline');assert.equal(h.attrs.fill,'none');assert.equal(h.attrs.stroke,'#123456');assert.equal(h.attrs['stroke-width'],2);assert.equal(h.attrs['stroke-dasharray'],undefined);}
  else if(style==='oval'){assert.equal(h.tag,'circle');near(h.attrs.cx+h.attrs.r,0);near(h.attrs.r*2,h.width);near(h.length,h.width);}
  else{assert.equal(h.tag,'polygon');const points=h.attrs.points.split(' ');assert.equal(points[0],'0,0');assert.equal(points.length,style==='triangle'?3:4);assert.equal(h.attrs.fill,'#123456');}
 }
});

test('width and length are independent and increase monotonically at each level',()=>{
 const baseline=arrowGeometry(arrow()).heads[0];let previous=0;
 for(const width of ['narrow','medium','wide']){const h=arrowGeometry(arrow({arrowEndWidth:width})).heads[0];assert.ok(h.width>previous);near(h.length,baseline.length);previous=h.width;}
 previous=0;for(const length of ['short','medium','long']){const h=arrowGeometry(arrow({arrowEndLength:length})).heads[0];assert.ok(h.length>previous);near(h.width,baseline.width);previous=h.length;}
 const both=arrowGeometry(arrow({arrowStart:true,arrowStartWidth:'wide',arrowStartLength:'short',arrowEndWidth:'narrow',arrowEndLength:'long'})).heads;
 assert.ok(both[0].width>both[1].width);assert.ok(both[0].length<both[1].length);
});

test('legacy oval styles are true circles for every size and retained length setting',()=>{
 for(const end of ['Start','End'])for(const width of ['narrow','medium','wide']){
  let baseline;
  for(const length of ['short','medium','long']){
   const o=line({[`arrow${end}Style`]:'oval',[`arrow${end}Width`]:width,[`arrow${end}Length`]:length});
   const geometry=arrowGeometry(o),head=geometry.heads[0];
   assert.equal(head.tag,'circle');near(head.attrs.r*2,head.width);near(head.length,head.width);
   near(head.attrs.cx+head.attrs.r,0);assert.equal(head.attrs.rx,undefined);assert.equal(head.attrs.ry,undefined);
   if(baseline)assert.deepEqual(geometry,baseline);else baseline=geometry;
   assert.equal(o[`arrow${end}Length`],length,'a circle must not discard the preference for the next arrow style');
  }
 }
 const diameters=['narrow','medium','wide'].map(width=>arrowGeometry(arrow({arrowEndStyle:'oval',arrowEndWidth:width})).heads[0].width);
 assert.ok(diameters[0]<diameters[1]&&diameters[1]<diameters[2]);
});

test('head tips stay at their endpoints and face outward in every line direction',()=>{
 for(const [w,h]of [[100,0],[-100,0],[0,100],[0,-100],[75,90],[-75,-90],[75,-90],[-75,90]]){
  const o=arrow({w,h,arrowStart:true}),geometry=arrowGeometry(o),distance=Math.hypot(w,h);
  for(const head of geometry.heads){
   const tip=world(head,0,0),rear=world(head,-head.length,0),out=head.end==='start'?-1:1;
   near(tip.x,head.end==='start'?0:w);near(tip.y,head.end==='start'?0:h);
   near((tip.x-rear.x)*w/distance+(tip.y-rear.y)*h/distance,out*head.length);
  }
  const shaft=geometry.shaft;assert.ok((shaft.x2-shaft.x1)*w+(shaft.y2-shaft.y1)*h>=-1e-9);
 }
});

test('object rotation is applied by the shared outer transform, without double-rotating heads',()=>{
 const o=arrow({w:-65,h:40,arrowStartStyle:'diamond',arrowEndStyle:'oval'}),rotated={...o,rotation:137};
 assert.deepEqual(arrowGeometry(rotated),arrowGeometry(o));
});

test('filled heads shorten the shaft under their fill while open arrows retain the endpoint',()=>{
 const triangular=arrowGeometry(arrow({arrowStart:true}));near(triangular.shaft.x1,triangular.heads[0].length);near(triangular.shaft.x2,100-triangular.heads[1].length);
 const open=arrowGeometry(arrow({arrowStartStyle:'open',arrowEndStyle:'open'}));assert.deepEqual(open.shaft,{x1:0,y1:0,x2:100,y2:0});
 for(const style of ['diamond','oval']){const geometry=arrowGeometry(arrow({arrowEndStyle:style}));near(geometry.shaft.x2,100-geometry.heads[0].length/2);}
});

test('very short and zero-length arrows cannot produce an inverted shaft or non-finite SVG',()=>{
 for(const w of [0,1e-12,.01,-.01,1,-1]){
  const g=arrowGeometry(arrow({w,h:0,strokeWidth:100,arrowStart:true,arrowStartLength:'long',arrowEndLength:'long'}));
  assert.ok((g.shaft.x2-g.shaft.x1)*w>=-1e-9);assert.ok(Object.values(g.shaft).every(Number.isFinite));
  assert.doesNotMatch(JSON.stringify(g),/NaN|Infinity/);if(Math.abs(w)<1e-9)assert.equal(g.heads.length,0);
 }
 assert.equal(arrowGeometry(arrow({strokeWidth:0})).heads.length,0);
});

test('all style and size combinations survive project serialization, validation and undo/redo',()=>{
 const doc=newDocument();
 for(const style of ARROW_STYLES)for(const width of ['narrow','medium','wide'])for(const length of ['short','medium','long']){
  const o=arrow({w:-35,h:22,rotation:43});setArrowProperty(o,'arrowStartStyle',style);setArrowProperty(o,'arrowStartWidth',width);setArrowProperty(o,'arrowStartLength',length);setArrowProperty(o,'arrowEndStyle',style);setArrowProperty(o,'arrowEndWidth',width);setArrowProperty(o,'arrowEndLength',length);doc.objects.push(o);
 }
 const restored=validateDocument(JSON.parse(JSON.stringify(doc)));assert.deepEqual(restored,doc);
 for(let i=0;i<doc.objects.length;i++)assert.deepEqual(arrowGeometry(restored.objects[i]),arrowGeometry(doc.objects[i]));
 const history=new History(),before=clone(doc);setArrowProperty(doc.objects[0],'arrowEndStyle','stealth');assert.ok(history.push(before,doc));assert.deepEqual(history.undo(doc),before);assert.deepEqual(history.redo(before),doc);
});

test('project validation accepts old arrows and rejects invalid values in each new enum',()=>{
 const doc=newDocument();doc.objects=[arrow({arrowStart:true,arrowEnd:false})];assert.deepEqual(validateDocument(doc),doc);
 for(const property of Object.keys(ARROW_PROPERTIES))for(const value of ['wrong',true,4,null,{}]){
  const invalid=clone(doc);invalid.objects[0][property]=value;assert.throws(()=>validateDocument(invalid),/矢印/);
 }
});
