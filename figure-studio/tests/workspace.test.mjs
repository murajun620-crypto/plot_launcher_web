import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspace} from '../workspace.mjs';

function environment(){
 const elements=new Map(),observers=[],frames=[],tabs=[];
 function element(tag='div'){
  const attributes=new Map(),listeners=new Map(),classes=new Set();let navigations=0,src='';
  const node={tagName:tag,dataset:{},disabled:false,hidden:false,textContent:'',title:'',tabIndex:0,children:[],
   set src(value){src=value;navigations++;},get src(){return src;},get navigations(){return navigations;},
   setAttribute:(key,value)=>attributes.set(key,value),getAttribute:key=>attributes.get(key)||null,
   addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},emit(type,event={}){for(const fn of listeners.get(type)||[])fn(event);},click(){if(!node.disabled)node.emit('click');},focus(){},append(child){node.children.push(child);frames.push(child);},
   classList:{contains:key=>classes.has(key),toggle(key,value){if(value)classes.add(key);else classes.delete(key);}},querySelector:()=>node.label};
  if(tag==='iframe')node.contentWindow={Event:class{constructor(type){this.type=type;}},dispatchEvent(){}};
  return node;
 }
 const outer=element('button'),inner=element('button');outer.label=element();inner.label=element();inner.label.textContent='更新確認';inner.title='更新を確認';elements.set('checkUpdateButton',outer);elements.set('workspace-status',element());
 const studio=element('iframe');studio.contentWindow.document={getElementById:()=>inner};elements.set('studio-frame',studio);
 for(const app of ['studio','plot','mifito']){elements.set(`workspace-panel-${app}`,element());const tab=element('button');tab.dataset.app=app;tabs.push(tab);}
 const documentRef={getElementById:key=>elements.get(key),querySelectorAll:()=>tabs,createElement:element};
 const windowRef={document:documentRef,location:{href:'http://localhost:8080/plot_launcher_web/figure-studio/',origin:'http://localhost:8080'},requestAnimationFrame:fn=>fn(),clearTimeout,setTimeout,MutationObserver:class{constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}}};
 return {windowRef,documentRef,elements,frames,tabs,outer,inner,studio,observers};
}

test('workspace creates each source once and preserves its live document on every later open',()=>{
 const env=environment(),workspace=createWorkspace(env);assert.equal(env.frames.length,0);assert.equal(workspace.studioWindow,env.studio.contentWindow);
 const first=workspace.openEditor('plot',{url:'http://localhost:8080/plot_launcher_web/#figureBridge=first',nonce:'first',origin:'http://localhost:8080',ownerId:'owner'});
 const frame=env.frames[0],url=new URL(frame.src);assert.equal(url.searchParams.get('figureWorkspace'),'1');assert.equal(new URLSearchParams(url.hash.slice(1)).get('figureOwner'),'owner');
 workspace.show('studio');const second=workspace.openEditor('plot',{url:'http://localhost:8080/plot_launcher_web/#figureBridge=next',nonce:'next'});
 assert.equal(first,second);assert.equal(frame.navigations,1);assert.equal(env.frames.length,1);assert.equal(env.elements.get('workspace-panel-studio').inert,true);
 workspace.show('mifito');assert.equal(new URL(env.frames[1].src).pathname,'/Microscopy_figure_tools_web/');assert.equal(env.frames.length,2);
});

test('a manually opened source remains mounted when Studio later connects, and tabs support arrow keys',()=>{
 const env=environment(),workspace=createWorkspace(env);env.tabs[1].click();const frame=env.frames[0];assert.equal(new URL(frame.src).hash,'');
 workspace.openEditor('plot',{nonce:'later',ownerId:'owner'});assert.equal(frame.navigations,1);assert.equal(new URL(frame.src).hash,'');
 let prevented=false;env.tabs[1].emit('keydown',{key:'ArrowRight',preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(env.tabs[2].getAttribute('aria-selected'),'true');assert.equal(env.tabs[1].tabIndex,-1);
});

test('workspace update proxies only the Studio button and rebinds after its document reloads',()=>{
 const env=environment(),workspace=createWorkspace(env);workspace.show('mifito');let clicks=0;env.inner.addEventListener('click',()=>{clicks++;env.inner.label.textContent='更新する';env.inner.classList.toggle('has-update',true);});
 env.outer.click();assert.equal(clicks,1);assert.equal(env.outer.label.textContent,'更新する');assert.equal(env.outer.classList.contains('has-update'),true);assert.equal(env.frames[0].navigations,1);
 env.inner.disabled=true;env.observers.at(-1).fn();assert.equal(env.outer.disabled,true);
 const firstObserver=env.observers.at(-1);env.studio.emit('load');assert.equal(firstObserver.disconnected,true);assert.equal(env.frames[0].navigations,1);
});

test('workspace exposes the current Studio receiver after readiness and opens an editor without a bridge nonce',()=>{
 const env=environment(),workspace=createWorkspace(env);assert.equal(workspace.studioReceiverId,null);
 env.studio.contentWindow.FigureStudioWorkspaceReceiverId='receiver-one';assert.equal(workspace.studioReceiverId,'receiver-one');
 env.studio.contentWindow.FigureStudioWorkspaceReceiverId='receiver-two';assert.equal(workspace.studioReceiverId,'receiver-two');
 workspace.openEditor('mifito',{url:'http://localhost:8080/Microscopy_figure_tools_web/',ownerId:'owner'});
 const url=new URL(env.frames[0].src);assert.equal(url.searchParams.get('figureWorkspace'),'1');assert.equal(url.hash,'');
});

test('duplicated workspaces get independent editor ownership even when session storage is copied',()=>{
 const first=environment(),second=environment(),storage={getItem:()=> 'copied-owner',setItem(){}};
 first.windowRef.sessionStorage=second.windowRef.sessionStorage=storage;
 const a=createWorkspace(first),b=createWorkspace(second);
 assert.notEqual(a.ownerId,b.ownerId);
 a.show('mifito');b.show('mifito');
 assert.equal(new URL(first.frames[0].src).searchParams.get('figureWorkspaceOwner'),a.ownerId);
 assert.equal(new URL(second.frames[0].src).searchParams.get('figureWorkspaceOwner'),b.ownerId);
});
