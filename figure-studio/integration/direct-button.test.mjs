import test from 'node:test';
import assert from 'node:assert/strict';
import {setupDirectSendButton,setupTransferReceiver,figureWorkspaceAPI,showFigureWorkspaceStudio} from './direct-transfer.mjs';

function surface(hash='',search='?figureWorkspace=1'){
  const make=()=>({style:{},children:[],listeners:new Map(),setAttribute(){},append(...nodes){this.children.push(...nodes);for(const node of nodes)node.parent=this;},addEventListener(name,fn){this.listeners.set(name,fn);},click(){this.listeners.get('click')?.();},remove(){this.parent.children=this.parent.children.filter(node=>node!==this);}});
  const header=make(),documentRef={querySelector:()=>header,createElement:make};let opens=0;
  const url=new URL(`http://localhost:43421/mifito/${search}${hash}`),windowRef={location:{href:url.href,origin:url.origin,hash:url.hash,search:url.search},addEventListener(){},removeEventListener(){},open(){opens++;return null;}};
  return {header,documentRef,windowRef,get opens(){return opens;}};
}
test('a discovered bridge suspends the direct group and restores the same buttons on disconnect',()=>{
  const ui=surface();let ready=true;
  const direct=setupDirectSendButton({app:'mifito',captureResult:()=>{},captureBatchResult:()=>{},container:'.header-actions',isReady:()=>ready,...ui});
  const group=ui.header.children[0],button=direct.button,batch=direct.batchButton;
  try{
    assert.equal(button.disabled,false);assert.equal(batch.disabled,false);
    direct.setBridgeConnected(true);assert.equal(group.style.display,'none');assert.equal(button.disabled,true);assert.equal(batch.disabled,true);
    button.click();batch.click();assert.equal(ui.opens,0);
    direct.sync();direct.setBridgeConnected(true);assert.equal(ui.header.children.length,1);assert.equal(direct.button,button);
    direct.setBridgeConnected(false);assert.equal(group.style.display,'inline-flex');assert.equal(button.disabled,false);assert.equal(batch.disabled,false);
    ready=false;direct.sync();assert.equal(button.disabled,true);assert.equal(batch.disabled,true);
    direct.setBridgeConnected(true);direct.setBridgeConnected(false);assert.equal(button.disabled,true);assert.equal(ui.header.children.length,1);
  }finally{direct.close();}
  assert.equal(ui.header.children.length,0);
});
test('URL bridge visits retain only the host controls',()=>{
  const ui=surface('#figureBridge=existing-connection');
  assert.equal(setupDirectSendButton({app:'plot',captureResult:()=>{},...ui}),null);assert.equal(ui.header.children.length,0);
});

test('standalone source apps do not mount any send controls',()=>{
  for(const app of ['plot','mifito'])for(const search of ['', '?figureWorkspace=0','?figureWorkspace=true']){
    const ui=surface('',search);
    assert.equal(setupDirectSendButton({app,captureResult:()=>{},captureBatchResult:()=>{},container:'.header-actions',...ui}),null);assert.equal(ui.header.children.length,0);
  }
});

test('only a verified same-origin workspace parent can switch the active app',()=>{
  const ui=surface(),shown=[],api={show:tab=>shown.push(tab),studioWindow:{location:{origin:ui.windowRef.location.origin},postMessage(){}}};
  ui.windowRef.parent={location:{origin:ui.windowRef.location.origin},FigureStudioWorkspace:api};
  assert.equal(figureWorkspaceAPI(ui.windowRef),api);
  const direct=setupDirectSendButton({app:'plot',captureResult:()=>{},container:'.header-actions',...ui});try{assert.ok(direct);showFigureWorkspaceStudio(ui.windowRef);assert.deepEqual(shown,['studio']);}finally{direct.close();}
  ui.windowRef.parent.location.origin='https://other.test';assert.equal(figureWorkspaceAPI(ui.windowRef),null);showFigureWorkspaceStudio(ui.windowRef);assert.equal(shown.length,1);
  ui.windowRef.parent={get location(){throw new Error('Cross-origin access');},FigureStudioWorkspace:api};assert.equal(figureWorkspaceAPI(ui.windowRef),null);
  ui.windowRef.parent={location:{origin:ui.windowRef.location.origin},FigureStudioWorkspace:{show:api.show}};assert.equal(figureWorkspaceAPI(ui.windowRef),null);
  ui.windowRef.parent=ui.windowRef;assert.equal(figureWorkspaceAPI(ui.windowRef),null);
  ui.windowRef.parent={location:{origin:ui.windowRef.location.origin},FigureStudioWorkspace:api};ui.windowRef.location.search='';assert.equal(figureWorkspaceAPI(ui.windowRef),null);showFigureWorkspaceStudio(ui.windowRef);assert.equal(shown.length,1);
});

test('workspace direct send returns to Studio only after successful import and exact-capture acceptance',async()=>{
  const channels=new Set(),factory=()=>{const handlers=new Set(),channel={handlers,addEventListener(t,fn){handlers.add(fn);},removeEventListener(t,fn){handlers.delete(fn);},close(){channels.delete(channel);},postMessage(data){for(const other of channels)if(other!==channel)queueMicrotask(()=>{for(const fn of other.handlers)fn({data});});}};channels.add(channel);return channel;};
  const ui=surface(),shown=[];ui.windowRef.BroadcastChannel=function(){return factory();};
  const studio={location:{href:'http://localhost:43421/figure-studio/',origin:ui.windowRef.location.origin,hash:''},postMessage(){},addEventListener(){},removeEventListener(){},navigator:{}};
  const workspace={studioWindow:studio,show:tab=>shown.push(tab)};ui.windowRef.parent={location:{origin:ui.windowRef.location.origin},FigureStudioWorkspace:workspace};
  let imported=0,accepted=0;const receiver=setupTransferReceiver({windowRef:studio,channelFactory:factory,onImport:()=>{if(++imported===1)throw Error('Try again');}});
  workspace.studioReceiverId=receiver.receiverId;
  const result={project:new Blob(['project']),preview:new Blob(['png'],{type:'image/png'}),sourceName:'source.plotproject'};
  const direct=setupDirectSendButton({app:'plot',captureResult:()=>result,onAccepted:value=>{assert.equal(value,result);accepted++;},studioUrl:studio.location.href,container:'.header-actions',...ui});
  try{
    await new Promise(resolve=>setImmediate(resolve));await assert.rejects(direct.sender.send(),/Try again/);assert.deepEqual(shown,[]);assert.equal(accepted,0);
    await direct.sender.send();assert.equal(accepted,1);assert.deepEqual(shown,['studio']);assert.equal(ui.opens,0);
  }finally{direct.close();receiver.close();}
});
