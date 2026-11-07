import test from 'node:test';
import assert from 'node:assert/strict';
import {createRibbon} from '../ribbon.mjs';

function environment({stored={},storage:providedStorage,onFocusCanvas=true}={}){
 const frames=new Map(),windowEvents=new Map();let frameId=0,resizes=0,canvasFocus=0;
 const documentRef={activeElement:null,documentElement:{dataset:{},clientWidth:400,clientHeight:250}};
 class Element{
  constructor(tag='div',props={}){this.tagName=tag.toUpperCase();this.id='';this.dataset={};this.children=[];this.parent=null;this.hidden=false;this.inert=false;this.disabled=false;this.tabIndex=0;this.open=false;this.style={};this.attributes=new Map();this.events=new Map();this.isConnected=true;this.box={left:0,top:0,bottom:0,width:100,height:40};Object.assign(this,props);}
  append(...items){for(const item of items){item.parent=this;this.children.push(item);}}
  contains(item){return this===item||this.children.some(child=>child.contains(item));}
  matches(selector){return selector.split(',').some(part=>part==='[data-ribbon-tab]'?this.dataset.ribbonTab!==undefined:part==='[data-ribbon-panel]'?this.dataset.ribbonPanel!==undefined:part==='[data-action="toggle-selection-pane"]'?this.dataset.action==='toggle-selection-pane':part==='details[open]'?this.tagName==='DETAILS'&&this.open:part==='summary'?this.tagName==='SUMMARY':part==='.dropdown-panel'?this.className==='dropdown-panel':part==='[hidden]'?this.hidden:part==='[inert]'?this.inert:false);}
  closest(selector){for(let item=this;item;item=item.parent)if(item.matches(selector))return item;return null;}
  querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  setAttribute(key,value){this.attributes.set(key,String(value));}getAttribute(key){return this.attributes.get(key)??null;}
  addEventListener(type,fn){if(!this.events.has(type))this.events.set(type,new Set());this.events.get(type).add(fn);}
  removeEventListener(type,fn){this.events.get(type)?.delete(fn);}
  focus(){documentRef.activeElement=this;}
  getBoundingClientRect(){return this.box;}
  fire(type,fields={}){const event={target:this,key:'',defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},...fields};for(const fn of this.events.get(type)||[])fn(event);return event;}
 }
 const body=new Element('body'),root=new Element('div',{id:'studioRibbon'}),pane=new Element('aside',{id:'ribbonSelectionPane',hidden:true}),outside=new Element('button');body.append(root,pane,outside);
 const tabs={},panels={},inputs={};
 for(const key of ['home','insert','format','view']){tabs[key]=new Element('button',{dataset:{ribbonTab:key}});panels[key]=new Element('section',{dataset:{ribbonPanel:key}});inputs[key]=new Element('input');panels[key].append(inputs[key]);root.append(tabs[key],panels[key]);}
 const paneButton=new Element('button',{dataset:{action:'toggle-selection-pane'}}),paneInput=new Element('input');panels.view.append(paneButton);pane.append(paneInput);
 const view={innerWidth:400,innerHeight:250,requestAnimationFrame(fn){const id=++frameId;frames.set(id,fn);return id;},cancelAnimationFrame(id){frames.delete(id);},addEventListener(type,fn){if(!windowEvents.has(type))windowEvents.set(type,new Set());windowEvents.get(type).add(fn);},removeEventListener(type,fn){windowEvents.get(type)?.delete(fn);}};
 documentRef.defaultView=view;documentRef.querySelectorAll=selector=>body.querySelectorAll(selector);documentRef.getElementById=id=>{const all=[];function walk(node){all.push(node);node.children.forEach(walk);}walk(body);return all.find(item=>item.id===id)||null;};
 const values=new Map(Object.entries(stored)),storage=providedStorage??{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 const api=createRibbon({documentRef,storage,onResize:()=>resizes++,...(onFocusCanvas?{onFocusCanvas:()=>{canvasFocus++;outside.focus();}}:{})});
 return {api,documentRef,root,pane,paneButton,paneInput,outside,tabs,panels,inputs,values,frames,windowEvents,get resizes(){return resizes;},get canvasFocus(){return canvasFocus;},
  key(tab,key,extra={}){return root.fire('keydown',{target:tabs[tab],key,...extra});},click(key){return root.fire('click',{target:tabs[key]});},flush(){const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());},
  menu(panel='home'){const menu=new Element('details'),summary=new Element('summary'),dropdown=new Element('div',{className:'dropdown-panel'});menu.append(summary,dropdown);panels[panel].append(menu);return {menu,summary,dropdown};}
 };
}

test('ribbon starts on Home with linked ARIA panels and a disabled contextual Format tab',()=>{
 const e=environment();try{
  assert.equal(e.api.activeTab,'home');assert.equal(e.tabs.format.disabled,true);assert.equal(e.tabs.format.getAttribute('aria-disabled'),'true');
  for(const key of Object.keys(e.tabs)){
   const active=key==='home';assert.equal(e.tabs[key].getAttribute('aria-selected'),String(active));assert.equal(e.tabs[key].tabIndex,active?0:-1);
   assert.equal(e.panels[key].hidden,!active);assert.equal(e.panels[key].inert,!active);assert.equal(e.tabs[key].getAttribute('aria-controls'),e.panels[key].id);assert.equal(e.panels[key].getAttribute('aria-labelledby'),e.tabs[key].id);
  }
  assert.equal(e.api.show('format'),false);assert.equal(e.api.show('unknown'),false);assert.equal(e.api.selectionPaneOpen,false);assert.equal(e.pane.hidden,true);
 }finally{e.api.destroy();}
});

test('tab arrows wrap and skip unavailable Format, while Enter and Space keep native activation',()=>{
 const e=environment();try{
  const arrow=e.key('home','ArrowLeft');assert.equal(arrow.defaultPrevented,true);assert.equal(arrow.stopped,true);assert.equal(e.api.activeTab,'view');assert.equal(e.documentRef.activeElement,e.tabs.view);
  e.key('view','ArrowLeft');assert.equal(e.api.activeTab,'insert');e.key('insert','Home');assert.equal(e.api.activeTab,'home');e.key('home','End');assert.equal(e.api.activeTab,'view');
  for(const key of ['Enter',' ','Tab']){const event=e.key('insert',key);assert.equal(event.defaultPrevented,false);assert.equal(event.stopped,false);assert.equal(e.api.activeTab,'view');}
  e.click('insert');assert.equal(e.api.activeTab,'insert');
  assert.equal(e.key('insert','ArrowRight',{isComposing:true}).defaultPrevented,false);assert.equal(e.key('insert','ArrowRight',{altKey:true}).defaultPrevented,false);assert.equal(e.api.activeTab,'insert');
 }finally{e.api.destroy();}
});

test('selection enables Format without switching tabs and safely returns focus when its panel disappears',()=>{
 const e=environment();try{
  e.api.updateSelection([{type:'image'}]);assert.equal(e.tabs.format.disabled,false);assert.equal(e.api.activeTab,'home');
  assert.equal(e.api.show('format',{focus:true}),true);e.inputs.format.focus();e.api.updateSelection([]);
  assert.equal(e.api.activeTab,'home');assert.equal(e.documentRef.activeElement,e.tabs.home);assert.equal(e.panels.format.hidden,true);assert.equal(e.panels.format.inert,true);
  e.inputs.home.focus();e.api.show('insert');assert.equal(e.documentRef.activeElement,e.tabs.insert);
  e.api.updateSelection([{type:'text'}]);assert.equal(e.api.activeTab,'insert');e.tabs.format.focus();e.api.updateSelection([]);assert.equal(e.documentRef.activeElement,e.tabs.insert);
 }finally{e.api.destroy();}
});

test('selection pane preference and accessible toggle state persist without a duplicate action listener',()=>{
 const e=environment();try{
  e.root.fire('click',{target:e.paneButton});assert.equal(e.api.selectionPaneOpen,false);
  e.api.toggleSelectionPane();assert.equal(e.pane.hidden,false);assert.equal(e.pane.inert,false);assert.equal(e.documentRef.documentElement.dataset.selectionPane,'open');assert.equal(e.paneButton.getAttribute('aria-expanded'),'true');assert.equal(e.values.get('figure-studio-selection-pane'),'open');
  const reopened=environment({stored:Object.fromEntries(e.values)});try{assert.equal(reopened.api.selectionPaneOpen,true);assert.equal(reopened.pane.hidden,false);}finally{reopened.api.destroy();}
  e.paneInput.focus();e.api.toggleSelectionPane(false);assert.equal(e.pane.hidden,true);assert.equal(e.pane.inert,true);assert.equal(e.canvasFocus,1);assert.equal(e.documentRef.activeElement,e.outside);assert.equal(e.paneButton.getAttribute('aria-expanded'),'false');assert.equal(e.values.get('figure-studio-selection-pane'),'closed');
 }finally{e.api.destroy();}
});

test('storage denial is harmless and closing the pane never restores focus into a hidden panel',()=>{
 const e=environment({storage:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}},onFocusCanvas:false});try{
  e.inputs.home.focus();e.api.toggleSelectionPane(true);e.api.show('view');e.paneInput.focus();e.api.toggleSelectionPane(false);assert.equal(e.documentRef.activeElement,e.tabs.view);
  assert.equal(e.api.selectionPaneOpen,false);
 }finally{e.api.destroy();}
});

test('native dropdowns stay in the viewport and Escape closes only the menu with focus returned to its summary',()=>{
 const e=environment();try{
  const a=e.menu(),b=e.menu();a.menu.open=true;b.menu.open=true;b.summary.box={left:350,top:210,bottom:230,width:40,height:20};b.dropdown.box={left:0,top:0,width:200,height:180};
  e.root.fire('toggle',{target:b.menu});e.flush();assert.equal(a.menu.open,false);assert.equal(b.dropdown.style.position,'fixed');assert.equal(b.dropdown.style.left,'192px');assert.equal(b.dropdown.style.top,'25px');assert.equal(b.dropdown.style.maxHeight,'234px');
  const event=e.root.fire('keydown',{target:b.dropdown,key:'Escape'});assert.equal(event.defaultPrevented,true);assert.equal(event.stopped,true);assert.equal(b.menu.open,false);assert.equal(e.documentRef.activeElement,b.summary);
  assert.equal(e.root.fire('keydown',{target:e.tabs.home,key:'Escape'}).defaultPrevented,false);
 }finally{e.api.destroy();}
});

test('layout work coalesces in an animation frame and teardown removes listeners and scheduled callbacks',()=>{
 const e=environment();e.api.show('insert');e.api.show('view');e.api.toggleSelectionPane(true);assert.equal(e.frames.size,1);assert.equal(e.resizes,0);e.flush();assert.equal(e.resizes,1);
 e.api.show('home');assert.equal(e.frames.size,1);e.api.destroy();assert.equal(e.frames.size,0);e.flush();assert.equal(e.resizes,1);
 assert.ok([...e.root.events.values()].every(listeners=>listeners.size===0));assert.equal(e.windowEvents.get('resize').size,0);assert.equal(e.api.show('view'),false);
});
