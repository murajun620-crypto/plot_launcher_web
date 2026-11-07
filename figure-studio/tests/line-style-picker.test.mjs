import test from 'node:test';
import assert from 'node:assert/strict';
import {createLineStylePicker} from '../line-style-picker.mjs';
function fixture(){
 let focused=null;const changes=[];
 function node(tag){const attrs=new Map(),handlers=new Map();return {tag,children:[],dataset:{},disabled:false,setAttribute:(k,v)=>attrs.set(k,String(v)),getAttribute:k=>attrs.get(k)??null,append(...els){this.children.push(...els);},addEventListener:(k,fn)=>handlers.set(k,fn),fire(type,key){const event={key,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};handlers.get(type)?.(event);return event;},focus(){focused=this;}};}
 const summary=node('summary'),panel=node('div'),root={open:false,dataset:{},querySelector:s=>s==='summary'?summary:panel};
 const picker=createLineStylePicker({root,onChange:value=>changes.push(value),documentRef:{createElement:node,createElementNS:(_,tag)=>node(tag)}});
 return {picker,root,summary,buttons:panel.children,changes,get focused(){return focused;}};
}
test('picker creates nine SVG samples, reflects legacy selection, and disables ineligible or locked targets',()=>{
 const f=fixture();assert.equal(f.buttons.length,9);assert.equal(f.buttons[1].children[0].children[0].getAttribute('stroke-dasharray'),'0 6');
 f.picker.update([{id:'line',type:'line',dashed:true}]);assert.equal(f.buttons[3].getAttribute('aria-checked'),'true');assert.equal(f.summary.getAttribute('aria-disabled'),'false');
 f.picker.update([{id:'locked',type:'rect',locked:true}]);assert.equal(f.summary.getAttribute('aria-disabled'),'true');assert.ok(f.summary.fire('click').prevented);assert.equal(f.root.open,false);
 f.picker.update([{id:'image',type:'image'}]);assert.ok(f.buttons.every(b=>b.disabled));
});
test('mixed selection has no checked style and keyboard navigation commits once, closes and restores focus',()=>{
 const f=fixture();f.picker.update([{id:'a',type:'line'},{id:'b',type:'ellipse',dashStyle:'dash-dot'}],{editableIds:['a','b']});
 assert.equal(f.root.dataset.mixed,'true');assert.ok(f.buttons.every(b=>b.getAttribute('aria-checked')==='false'));
 f.summary.fire('keydown','ArrowDown');assert.equal(f.root.open,true);assert.equal(f.focused,f.buttons[0]);
 f.buttons[0].fire('keydown','End');assert.equal(f.focused,f.buttons[8]);
 f.buttons[8].fire('click');assert.deepEqual(f.changes,['long-dash-dot-dot']);assert.equal(f.root.open,false);assert.equal(f.focused,f.summary);
 f.summary.fire('keydown','ArrowDown');f.buttons[0].fire('keydown','Escape');assert.equal(f.root.open,false);assert.equal(f.focused,f.summary);assert.equal(f.changes.length,1);
});
