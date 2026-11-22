import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSourceProjectSaves,sourceSaveMessage} from '../source-project-save.mjs';
import {createWorkspaceSession} from '../workspace-session.mjs';

function fixture({failReady,failPrepare,failWrite,empty=[]}={}){
 const events=[],host={},choose=()=>{},editors=['plot','mifito'].map(app=>{
  let held=false,prepared=false,changed=false;
  return {app,api:{hasWork:()=>!empty.includes(app),sourceSaveReady({editedOnly}){assert.equal(editedOnly,true);events.push(app+':ready');if(failReady===app)throw Error('unfinished input');return !empty.includes(app);},async prepareSourceSave(options){
   assert.equal(options.host,host);assert.equal(typeof options.choose,"function");assert.equal(options.requireFile,true);events.push(app+':prepare');if(failPrepare===app)throw new DOMException('cancelled','AbortError');held=true;prepared=true;
   return {name:app+'.project',validate(){assert.equal(held,true);if(changed)throw Error('changed after preparation');events.push(app+':validate');},cancel(){held=false;events.push(app+':release');},async write({hold}){assert.equal(hold,true);assert.equal(held,true);assert.equal(prepared,true);events.push(app+':write');if(failWrite===app)throw Error('disk full');return {name:app+'.project'};}};
  },invalidate(){changed=true;},get held(){return held;}}};
 });
 const options={editors,host,choose,status:message=>events.push(message),release:()=>events.push('unlock')};return {editors,events,options};
}
test('all open source projects validate and prepare before any native file is written',async()=>{
 const f=fixture(),plan=await prepareSourceProjectSaves(f.options);assert.equal(plan.count,2);assert.equal(f.events.some(e=>e.endsWith(':write')),false);assert.ok(f.events.indexOf('mifito:ready')<f.events.indexOf('plot:prepare'));assert.equal(f.editors.every(e=>e.api.held),true);
 const receipts=await plan.write();assert.deepEqual(receipts,[{app:'plot',name:'plot.project'},{app:'mifito',name:'mifito.project'}]);assert.ok(f.events.indexOf('mifito:prepare')<f.events.indexOf('plot:write'));assert.equal(f.editors.some(e=>e.api.held),false);assert.equal(f.events.at(-1),'unlock');assert.equal(plan.count,2);assert.deepEqual(plan.saved,receipts);await assert.rejects(plan.write(),/終了/);
});
test('an unfinished field in either editor rejects the entire batch before any target picker',async()=>{
 const f=fixture({failReady:'mifito'});await assert.rejects(prepareSourceProjectSaves(f.options),/unfinished input/);assert.equal(f.events.some(e=>e.endsWith(':prepare')||e.endsWith(':write')),false);assert.equal(f.events.at(-1),'unlock');
});
test('cancelling the second target preserves both files and releases the first editor reservation',async()=>{
 const f=fixture({failPrepare:'mifito'});await assert.rejects(prepareSourceProjectSaves(f.options),{name:'AbortError'});assert.equal(f.events.some(e=>e.endsWith(':write')),false);assert.equal(f.editors.some(e=>e.api.held),false);assert.equal(f.events.at(-1),'unlock');
});
test('cancelling the prepared batch never writes either original project',async()=>{
 const f=fixture(),plan=await prepareSourceProjectSaves(f.options);plan.cancel();plan.cancel();assert.equal(f.events.some(e=>e.endsWith(':write')),false);assert.equal(f.events.filter(e=>e==='unlock').length,1);await assert.rejects(plan.write(),/終了/);
});
test('partial native write failure reports exactly the files already saved and unlocks all editors',async()=>{
 const f=fixture({failWrite:'mifito'}),plan=await prepareSourceProjectSaves(f.options);
 await assert.rejects(plan.write(),error=>{assert.deepEqual(error.savedSourceProjects,[{app:'plot',name:'plot.project'}]);const message=sourceSaveMessage(error);assert.match(message,/plot.project/);assert.match(message,/Studioのプロジェクトは保存されていません/);assert.doesNotMatch(message,/「mifito.project」/);return true;});assert.equal(f.editors.some(e=>e.api.held),false);assert.equal(f.events.at(-1),'unlock');
});
test('empty editors remain empty and duplicate API references are written only once',async()=>{
 const f=fixture({empty:['mifito']});f.options.editors.push(f.editors[0]);const plan=await prepareSourceProjectSaves(f.options);assert.equal(plan.count,1);await plan.write();assert.equal(f.events.filter(e=>e==='plot:write').length,1);assert.equal(f.events.includes('mifito:prepare'),false);
});
test('old editor APIs fail before any target is prepared instead of silently omitting a project',async()=>{
 const f=fixture();delete f.editors[1].api.prepareSourceSave;await assert.rejects(prepareSourceProjectSaves(f.options),/更新確認/);assert.equal(f.events.some(e=>e.endsWith(':prepare')),false);
});
test('source changes discovered after preparation abort before either original file is written',async()=>{
 const f=fixture(),plan=await prepareSourceProjectSaves(f.options);f.editors[0].api.invalidate();
 await assert.rejects(plan.write(),/changed after preparation/);assert.equal(f.events.some(e=>e.endsWith(':write')),false);assert.deepEqual(plan.saved,[]);assert.equal(f.editors.some(e=>e.api.held),false);
});
test('an editor that changes from ready to empty never disappears silently from the batch',async()=>{
 const f=fixture();f.editors[1].api.prepareSourceSave=async()=>null;
 await assert.rejects(prepareSourceProjectSaves(f.options),/内容が変わりました/);assert.equal(f.events.some(e=>e.endsWith(':write')),false);assert.equal(f.editors.some(e=>e.api.held),false);
});
test('cancelling an in-flight batch waits for the active writer and prevents the next writer',async()=>{
 const f=fixture(),original=f.editors[0].api.prepareSourceSave;let finish,started;
 const active=new Promise(resolve=>started=resolve),wait=new Promise(resolve=>finish=resolve);
 f.editors[0].api.prepareSourceSave=async options=>{const p=await original(options),write=p.write;p.write=async options=>{started();await wait;return write(options);};return p;};
 const plan=await prepareSourceProjectSaves(f.options),writing=plan.write();await active;plan.cancel();assert.equal(f.editors.every(e=>e.api.held),true);finish();
 await assert.rejects(writing,error=>{assert.equal(error.name,'AbortError');assert.deepEqual(error.savedSourceProjects,[{app:'plot',name:'plot.project'}]);return true;});assert.equal(f.events.includes('mifito:write'),false);assert.equal(f.editors.some(e=>e.api.held),false);
});
test('workspace persistence stays locked through the whole source batch and captures updated editor state afterward',async()=>{
 const f=fixture(),locks=[],calls=[];
 const session=createWorkspaceSession({editor:async(app,create)=>{assert.equal(create,false);calls.push(app);return f.editors.find(e=>e.app===app).api;},lock:value=>locks.push(value)});
 const plan=await session.prepareSourceSaves({host:f.options.host,choose:f.options.choose});assert.equal(session.busy,true);await assert.rejects(session.capture(),/完了/);await plan.write();assert.equal(session.busy,false);assert.deepEqual(locks,[true,false]);assert.deepEqual(calls,['plot','mifito']);
});
test('workspace API never creates unloaded editors just to bulk save',async()=>{
 const created=[];const session=createWorkspaceSession({editor:async(app,create)=>{created.push(create);return null;}}),plan=await session.prepareSourceSaves();assert.equal(plan.count,0);assert.deepEqual(await plan.write(),[]);assert.deepEqual(created,[false,false]);assert.equal(session.busy,false);
});
test('a stalled source can continue with Studio after releasing every prepared native target',async()=>{
 const f=fixture(),calls=[];
 f.editors[1].api.prepareSourceSave=async()=>{throw new DOMException('元ファイルの確認がタイムアウトしました。','TimeoutError');};
 f.options.choose=async info=>{calls.push(info);assert.equal(f.editors.some(e=>e.api.held),false);return 'studio-only';};
 const plan=await prepareSourceProjectSaves(f.options);
 assert.equal(plan,null);
 assert.match(calls[0].message,/MiFiTo/);
 assert.equal(calls[0].kind,'timeout');
 assert.equal(f.events.some(e=>e.endsWith(':write')),false);
 assert.equal(f.events.filter(e=>e==='unlock').length,1);
});
test('the normal source confirmation also offers Studio-only saving',async()=>{
 const f=fixture();
 f.editors[0].api.prepareSourceSave=async({choose})=>choose({kind:'missing',name:'graph.plotproject'});
 f.options.choose=async info=>{assert.equal(info.allowStudioOnly,true);return 'studio-only';};
 assert.equal(await prepareSourceProjectSaves(f.options),null);
 assert.equal(f.events.includes('mifito:prepare'),false);
 assert.equal(f.events.at(-1),'unlock');
});
test('cancellation and ordinary Studio write failures retain accurate source receipts',()=>{
 const completed=[{app:'mifito',name:'images.mifito'}];assert.match(sourceSaveMessage(Error('Studio disk full'),completed),/images.mifito/);assert.match(sourceSaveMessage(new DOMException('cancel','AbortError'),completed),/キャンセル/);assert.doesNotMatch(sourceSaveMessage(Error('failure')),/保存済み/);
});
