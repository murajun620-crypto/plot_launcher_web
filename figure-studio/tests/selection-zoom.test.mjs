import test from 'node:test';
import assert from 'node:assert/strict';
import {makeObject,bounds} from '../model.mjs';
import {centerSelectionInViewport,createSelectionWheelZoom,resetSelectionZoom} from '../selection-zoom.mjs';

function fixture(objects=[]){
 let scale=1,left=0,top=0,prevented=0,after=0,changes=0;
 const style={removeProperty(name){delete this[name.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())];}},pad=side=>parseFloat(style['padding'+side]||'20');
 const viewport={style,clientWidth:900,clientHeight:500,clientLeft:1,clientTop:1,getBoundingClientRect:()=>({left:100,top:200}),
  get scrollLeft(){return left},set scrollLeft(v){left=Math.max(0,Math.min(v,Math.max(0,pad('Left')+1000*scale+pad('Right')-900)));},
  get scrollTop(){return top},set scrollTop(v){top=Math.max(0,Math.min(v,Math.max(0,pad('Top')+800*scale+pad('Bottom')-500)));},
 };
 const paper={getBoundingClientRect:()=>({left:101+pad('Left')+Math.max(0,(900-pad('Left')-pad('Right')-1000*scale)/2)-left,top:201+pad('Top')-top,width:1000*scale,height:800*scale})};
 const handler=createSelectionWheelZoom({viewport,paper,getSelection:()=>objects,getScale:()=>scale,setScale:s=>{scale=Math.min(5,Math.max(.25,s));changes++;},afterCenter:()=>after++});
 return {viewport,paper,handler,event:(deltaY=-120,mods={ctrlKey:true})=>({deltaY,...mods,preventDefault(){prevented++;}}),get scale(){return scale},get changes(){return changes},get prevented(){return prevented},get after(){return after}};
}
function centered(f,point){const sheet=f.paper.getBoundingClientRect(),view=f.viewport.getBoundingClientRect();assert.ok(Math.abs(sheet.left+point.x*f.scale-(view.left+f.viewport.clientLeft+f.viewport.clientWidth/2))<1e-7);assert.ok(Math.abs(sheet.top+point.y*f.scale-(view.top+f.viewport.clientTop+f.viewport.clientHeight/2))<1e-7);}
test('Ctrl wheel centers a selected panel at every zoom level including both limits',()=>{
 const image=makeObject('image',{x:900,y:700,w:100,h:100}),before=structuredClone(image),f=fixture([image]);
 for(const delta of [-120,-120,-120,-9000,120,120,9000,120]){f.handler(f.event(delta));centered(f,{x:950,y:750});}
 assert.equal(f.scale,.25);assert.equal(f.after,8);assert.deepEqual(image,before);
});
test('centering works for page-edge panels and panels outside the page',()=>{
 for(const point of [{x:0,y:0},{x:1000,y:800},{x:-300,y:-150},{x:1200,y:950}]){const f=fixture();centerSelectionInViewport(f.viewport,f.paper,point,1);centered(f,point);}
});
test('a rotated, locked multi-selection uses the center of the complete selection bounds',()=>{
 const images=[makeObject('image',{x:20,y:40,w:90,h:80,rotation:45,locked:true}),makeObject('image',{x:700,y:500,w:200,h:100,rotation:25})],box=bounds(images),f=fixture(images);
 f.handler(f.event(-120,{metaKey:true}));centered(f,{x:box.x+box.w/2,y:box.y+box.h/2});assert.equal(f.prevented,1);
});
test('ordinary scrolling and an empty selection retain existing wheel behavior',()=>{
 const f=fixture();f.handler(f.event(-120,{}));assert.equal(f.changes,0);assert.equal(f.prevented,0);assert.equal(f.scale,1);
 f.handler(f.event(-120));assert.equal(f.changes,1);assert.equal(f.prevented,1);assert.ok(f.scale>1);assert.equal(f.after,0);assert.deepEqual(Object.keys(f.viewport.style),['removeProperty']);
});
test('zero or invalid wheel motion never changes scale or moves the selection',()=>{
 const f=fixture([makeObject('image')]);for(const value of [0,NaN,Infinity])f.handler(f.event(value));assert.equal(f.changes,0);assert.equal(f.after,0);
});
test('fit removes temporary centering margins and lets responsive CSS take over again',()=>{
 const f=fixture([makeObject('image')]);f.handler(f.event());assert.ok(f.viewport.style.paddingLeft);resetSelectionZoom(f.viewport);assert.deepEqual(Object.keys(f.viewport.style),['removeProperty']);
});
