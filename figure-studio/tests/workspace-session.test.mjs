import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceSession} from '../workspace-session.mjs';
import {encodeWorkspaceState,decodeWorkspaceState} from '../workspace-state.mjs';

function environment(){
 const editors=new Map(),events=[],locks=[];let active='mifito';
 function add(app,text){let state=text,binding=null,failRestore=null,captureHook=null;const marks=[];
  const api={version:1,app,signature:()=>state??'',hasWork:()=>state!=null,
   async capture(){if(captureHook)await captureHook();return state==null?null:{version:1,app,state:{text:state,file:new File(['data'],app+'.dat')},binding};},
   async validate(value){if(value?.state?.text==='invalid')throw Error('invalid snapshot');},
   async restore(value){events.push(app+':restore');if(failRestore&&value?.state?.text===failRestore){state='partial';throw Error('decode failure');}state=value?.state?.text??null;},
   async restoreBinding(value){binding=value;events.push(app+':bind');},markSaved(value){marks.push(value);},
   set(value){state=value;},get value(){return state;},setCapture(fn){captureHook=fn;},failOn(value){failRestore=value;},marks};
  editors.set(app,api);return api;
 }
 const session=createWorkspaceSession({editor:async(app,create)=>editors.get(app)||(create?add(app,null):null),active:()=>active,show:value=>{active=value;},lock:value=>locks.push(value)});
 return {session,add,editors,events,locks,get active(){return active;}};
}

test('capture includes both unreflected sessions and binary originals without applying Studio previews',async()=>{
 const env=environment();env.add('plot','unreflected axes');env.add('mifito','unreflected label');
 const captured=await env.session.capture(),decoded=await decodeWorkspaceState(captured.data);
 assert.equal(decoded.active,'mifito');assert.equal(decoded.editors.plot.state.text,'unreflected axes');assert.equal(decoded.editors.mifito.state.text,'unreflected label');
 assert.equal(await decoded.editors.mifito.state.file.text(),'data');assert.deepEqual(env.events,[]);assert.deepEqual(env.locks,[true,false]);
});

test('absent editors remain absent and are not initialized just to save',async()=>{
 const env=environment(),captured=await env.session.capture();assert.equal(env.editors.size,0);assert.equal(captured.data.editors.plot,null);assert.equal(captured.data.editors.mifito,null);
});

test('edits during capture reject the snapshot and always release the workspace lock',async()=>{
 const env=environment(),plot=env.add('plot','old');plot.setCapture(()=>plot.set('new'));
 await assert.rejects(env.session.capture(),/変わりました/);assert.equal(env.session.busy,false);assert.equal(env.locks.at(-1),false);
});

test('saved checkpoints never mark a more recent editor change as saved',async()=>{
 const env=environment(),plot=env.add('plot','old'),captured=await env.session.capture();plot.set('new');
 assert.equal(await env.session.markSaved(captured),false);assert.deepEqual(plot.marks,[]);assert.equal(await env.session.hasChanges(),true);
});

test('all sessions validate before any editor is replaced',async()=>{
 const env=environment(),plot=env.add('plot','before'),mifito=env.add('mifito','before');
 const data=await encodeWorkspaceState({version:1,active:'studio',editors:{plot:{version:1,app:'plot',state:{text:'after'}},mifito:{version:1,app:'mifito',state:{text:'invalid'}}}});
 await assert.rejects(env.session.prepareRestore(data),/invalid snapshot/);assert.equal(plot.value,'before');assert.equal(mifito.value,'before');assert.deepEqual(env.events,[]);assert.equal(env.session.busy,false);
});

test('a restore failure rolls all editors back instead of leaving half a workspace',async()=>{
 const env=environment(),plot=env.add('plot','plot before'),mifito=env.add('mifito','mifito before');mifito.failOn('broken');
 const data=await encodeWorkspaceState({version:1,active:'studio',editors:{plot:{version:1,app:'plot',state:{text:'plot after'}},mifito:{version:1,app:'mifito',state:{text:'broken'}}}});
 const plan=await env.session.prepareRestore(data);
 assert.equal(plan.previousEditors.plot.state.text,'plot before');assert.equal(plan.previousEditors.mifito.state.text,'mifito before');
 assert.equal(await plan.previousEditors.plot.state.file.text(),'data');
 await assert.rejects(plan.apply(),/decode failure/);
 assert.equal(plot.value,'plot before');assert.equal(mifito.value,'mifito before');assert.equal(env.session.busy,false);assert.equal(env.active,'mifito');
});

test('restored sessions keep their unreflected state and bind only to Studio-validated targets',async()=>{
 const env=environment();env.add('plot','old');
 const data=await encodeWorkspaceState({version:1,active:'plot',editors:{plot:{version:1,app:'plot',state:{text:'latest unreflected'}},mifito:null}});
 const plan=await env.session.prepareRestore(data);await plan.apply();await plan.bind({plot:{panelId:'verified-panel'}});await plan.complete();
 assert.equal(env.editors.get('plot').value,'latest unreflected');assert.equal(env.active,'plot');assert.equal(await env.session.hasChanges(),false);assert.equal(env.session.busy,false);
});

test('legacy projects clear previous editor sessions rather than carrying unrelated edits into the next save',async()=>{
 const env=environment(),plot=env.add('plot','previous'),mifito=env.add('mifito','previous');
 const plan=await env.session.prepareRestore(null);await plan.apply();await plan.bind();await plan.complete();
 assert.equal(plot.value,null);assert.equal(mifito.value,null);assert.equal(env.active,'studio');
});

test('a visible editor finalization failure stays cancellable and restores both prior sessions',async()=>{
 const env=environment(),plot=env.add('plot','plot before'),mifito=env.add('mifito','mifito before');
 const previous=await env.session.capture();await env.session.markSaved(previous);
 mifito.finishRestore=async()=>{assert.equal(env.active,'plot');assert.equal(env.locks.at(-1),false);throw Error('input restoration failed');};
 const data=await encodeWorkspaceState({version:1,active:'plot',editors:{plot:{version:1,app:'plot',state:{text:'plot after'}},mifito:{version:1,app:'mifito',state:{text:'mifito after'}}}});
 const plan=await env.session.prepareRestore(data);await plan.apply();await plan.bind({plot:{panelId:'new-panel'}});
 await assert.rejects(plan.complete(),/input restoration failed/);
 assert.equal(env.session.busy,true);assert.deepEqual(plot.marks,['plot before']);assert.deepEqual(mifito.marks,['mifito before']);
 await plan.cancel();
 assert.equal(plot.value,'plot before');assert.equal(mifito.value,'mifito before');assert.equal(env.active,'mifito');assert.equal(env.session.busy,false);assert.equal(await env.session.hasChanges(),false);
});
