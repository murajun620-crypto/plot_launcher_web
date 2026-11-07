import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
const click=source.split('\n').find(line=>line.startsWith("document.addEventListener('click',e=>"));
const pointer=source.split('\n').find(line=>line.startsWith("document.addEventListener('pointerdown',e=>"));
function fixture(){
 const menu={open:true,contains:()=>false},sidebar={open:true,contains:()=>false},context={hidden:false},handlers=new Map(),actions=[];let focus=0;
 Function('document','$','$$','execute','svg','focusFigure',`let editingId=null;${click}\n${pointer}`)({addEventListener:(name,fn)=>handlers.set(name,fn)},()=>context,selector=>selector.includes('sidebar-text-panel')?[menu]:[menu,sidebar],action=>actions.push(action),{focus(){focus++}},()=>{});
 return {menu,sidebar,context,handlers,actions,get focus(){return focus},event:action=>({target:{closest:selector=>selector==='[data-action]'?{dataset:{action},disabled:false}:null}})};
}
test('executing layer commands closes menus without closing the sidebar text section',()=>{
 const f=fixture();f.handlers.get('click')(f.event('front'));assert.deepEqual(f.actions,['front']);assert.equal(f.menu.open,false);assert.equal(f.sidebar.open,true);assert.equal(f.focus,1);
});
test('outside clicks and the text-panel button keep the persistent sidebar usable',()=>{
 const f=fixture();f.handlers.get('pointerdown')(f.event(''));assert.equal(f.menu.open,false);assert.equal(f.sidebar.open,true);assert.equal(f.context.hidden,true);
 f.handlers.get('click')(f.event('show-text-pane'));assert.equal(f.focus,0);assert.equal(f.sidebar.open,true);
});
