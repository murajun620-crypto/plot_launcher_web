import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectFileLinks,fileFingerprint,portableFileLink} from '../project-file-links.mjs';
import {chooseProjectFileAction} from '../project-file-dialog.mjs';

const projectId='project-1111111111111111',otherId='project-2222222222222222';
function memoryStore(){const values=new Map();return {values,async get(key){return values.get(key);},async list(key){return [...values.values()].filter(value=>value.project===key);},async put(value){values.set(value.token,{...value});}};}
function fileHandle(name,content='original',id=projectId){
  let bytes=JSON.stringify({id,content}),writes=0,aborts=0,opens=0;
  const handle={kind:'file',name,permission:'granted',fail:false,onOpen:null,onWrite:null,
    async getFile(){if(handle.missing)throw new DOMException('missing','NotFoundError');return new File([bytes],name);},
    async queryPermission(){return handle.permission;},async requestPermission(){return handle.permission;},async isSameEntry(other){return other===handle||other?.original===handle;},
    async createWritable(){opens++;handle.onOpen?.();let pending;return {async write(blob){if(handle.fail)throw Error('disk full');pending=await blob.text();handle.onWrite?.();},async close(){bytes=pending;writes++;},async abort(){aborts++;}};},
    replace(content,newId=id){bytes=JSON.stringify({id:newId,content});},state:()=>({bytes,writes,aborts,opens})};return handle;
}
function setup(app,{store=memoryStore(),answers=[],host:hostOverrides={}}={}){
  const prompts=[],picker={opens:0,saves:0},extension=app==='plot'?'.plotproject':'.mifito',name='figure'+extension;
  let openTarget,saveTarget;
  const host={async showOpenFilePicker(){picker.opens++;return [openTarget];},async showSaveFilePicker(){picker.saves++;return saveTarget;},...hostOverrides};
  const identify=async file=>({projectId:JSON.parse(await file.text()).id});
  const choose=async info=>{prompts.push(info);assert.ok(answers.length,'Unexpected save confirmation');return answers.shift();};
  const api=createProjectFileLinks({app,store,host,identify,choose});
  return {api,store,prompts,picker,host,name,answers,setOpen:handle=>openTarget=handle,setSave:handle=>saveTarget=handle};
}
for(const app of ['plot','mifito']){
  test(`${app}: Studio reopens the exact original handle and overwrites it without a picker`,async()=>{
    const f=setup(app),original=fileHandle(f.name);
    const opened=await f.api.opened({file:await original.getFile(),projectId,handle:original});
    const portable=JSON.parse(JSON.stringify(opened.link));assert.deepEqual(Object.keys(portable).sort(),['fingerprint','token']);
    const studio=await f.api.opened({file:new File(['edited snapshot'],f.name),projectId,embedded:true,link:portable});
    assert.equal(studio.handle,original);
    const target=await f.api.prepare({projectId,name:f.name,link:studio.link,handle:studio.handle,knownSource:true});
    const output=new Blob([JSON.stringify({id:projectId,content:'edited in Studio'})]),hash=await target.write(output),saved=await target.remember(projectId,hash);
    assert.equal(original.state().writes,1);assert.equal(original.state().bytes,await output.text());assert.equal(saved.link.fingerprint,await fileFingerprint(output));assert.equal(saved.link.token,portable.token);assert.equal(f.picker.saves,0);assert.equal(f.prompts.length,0);
  });
  test(`${app}: different PC needs explicit selection, then remembers its own target`,async()=>{
    const first=setup(app),original=fileHandle(first.name),opened=await first.api.opened({file:await original.getFile(),projectId,handle:original});
    const f=setup(app,{answers:['bind']}),local=fileHandle(f.name);f.setOpen(local);
    const studio=await f.api.opened({file:new File(['Studio copy'],f.name),projectId,embedded:true,link:opened.link});
    assert.equal(studio.handle,null);assert.equal(f.store.values.size,0);
    const target=await f.api.prepare({projectId,name:f.name,link:studio.link,knownSource:true});
    assert.equal(f.prompts[0].kind,'missing');assert.equal(f.picker.opens,1);assert.equal(f.picker.saves,0);
    const hash=await target.write(new Blob([JSON.stringify({id:projectId,content:'PC2 edit'})])),saved=await target.remember(projectId,hash);
    assert.equal(await f.api.resolve({projectId,name:f.name,link:saved.link}),local);assert.equal(await f.api.resolve({projectId,name:f.name,link:opened.link}),local);assert.equal(original.state().writes,0);
  });
  test(`${app}: identical names and contents in different folders keep different opaque tokens`,async()=>{
    const f=setup(app),one=fileHandle(f.name),two=fileHandle(f.name);
    const a=await f.api.opened({file:await one.getFile(),projectId,handle:one}),b=await f.api.opened({file:await two.getFile(),projectId,handle:two});
    assert.notEqual(a.link.token,b.link.token);assert.equal(await f.api.resolve({projectId,name:f.name,link:a.link}),one);assert.equal(await f.api.resolve({projectId,name:f.name,link:b.link}),two);
    const legacy=await f.api.opened({file:await one.getFile(),projectId,embedded:true});assert.equal(legacy.handle,null);
  });
  test(`${app}: raw legacy files never guess a target from identical name, ID and bytes`,async()=>{
    const f=setup(app),original=fileHandle(f.name);await f.api.opened({file:await original.getFile(),projectId,handle:original});
    assert.equal((await f.api.opened({file:await original.getFile(),projectId,embedded:true})).handle,null);
    const unknownCopy=fileHandle(f.name);assert.equal((await f.api.opened({file:await unknownCopy.getFile(),projectId})).handle,null);
    assert.equal((await f.api.opened({file:new File(['generated legacy snapshot'],f.name),projectId,embedded:true})).handle,null);
  });
  test(`${app}: old Studio version detects newer native saves even if the registry has the new hash`,async()=>{
    const f=setup(app,{answers:['cancel']}),original=fileHandle(f.name),old=await f.api.opened({file:await original.getFile(),projectId,handle:original});
    original.replace('newer OneDrive version');await f.api.opened({file:await original.getFile(),projectId,handle:original});
    await assert.rejects(f.api.prepare({projectId,name:f.name,link:old.link,handle:original,knownSource:true}),{name:'AbortError'});
    assert.equal(f.prompts[0].kind,'changed');assert.equal(original.state().opens,0);assert.match(original.state().bytes,/newer OneDrive/);
  });
  test(`${app}: externally changed file is overwritten only after explicit approval`,async()=>{
    const f=setup(app,{answers:['overwrite']}),original=fileHandle(f.name),opened=await f.api.opened({file:await original.getFile(),projectId,handle:original});
    original.replace('external edit');const target=await f.api.prepare({projectId,name:f.name,link:opened.link,handle:original,knownSource:true});
    assert.equal(f.prompts[0].kind,'changed');assert.equal(original.state().writes,0);await target.write(new Blob(['approved contents']));assert.equal(original.state().bytes,'approved contents');
  });
  test(`${app}: wrong project or wrong filename cannot be bound, even with the same table/images`,async()=>{
    for(const wrong of [fileHandle('other'+fExtension(app)),fileHandle('figure'+fExtension(app),'original',otherId)]){
      const f=setup(app,{answers:['bind']});f.setOpen(wrong);
      await assert.rejects(f.api.prepare({projectId,name:f.name,knownSource:true}),/一致しません/);assert.equal(wrong.state().opens,0);assert.equal(f.store.values.size,0);
    }
  });
  test(`${app}: a file replaced with another project is never offered overwrite approval`,async()=>{
    const f=setup(app),original=fileHandle(f.name),opened=await f.api.opened({file:await original.getFile(),projectId,handle:original});original.replace('other data',otherId);
    await assert.rejects(f.api.prepare({projectId,name:f.name,link:opened.link,handle:original,knownSource:true}),/一致しません/);assert.equal(f.prompts.length,0);assert.equal(original.state().opens,0);
  });
  test(`${app}: missing local target can save a separate copy without touching the original`,async()=>{
    const f=setup(app,{answers:['saveAs']}),copy=fileHandle('copy'+fExtension(app));f.setSave(copy);
    const target=await f.api.prepare({projectId,name:f.name,knownSource:true});assert.equal(target.saveAs,true);assert.equal(target.handle,copy);assert.equal(f.picker.saves,1);
    const hash=await target.write(new Blob(['new copy']));await target.remember(otherId,hash);
    assert.equal(await f.api.resolve({projectId,name:copy.name,link:[...f.store.values.values()][0]}),null);
  });
  test(`${app}: denied permission offers rebinding instead of writing to an unrelated last-used folder`,async()=>{
    const f=setup(app,{answers:['cancel']}),original=fileHandle(f.name),opened=await f.api.opened({file:await original.getFile(),projectId,handle:original});original.permission='denied';
    await assert.rejects(f.api.prepare({projectId,name:f.name,handle:original,link:opened.link,knownSource:true}),{name:'AbortError'});assert.equal(f.prompts[0].kind,'missing');assert.equal(f.picker.saves,0);assert.equal(original.state().opens,0);
  });
  test(`${app}: concurrent changes during encoding, locking or writing abort before replacing original bytes`,async()=>{
    for(const stage of ['encoding','locking','writing']){
      const f=setup(app),original=fileHandle(f.name),opened=await f.api.opened({file:await original.getFile(),projectId,handle:original}),target=await f.api.prepare({projectId,name:f.name,handle:original,link:opened.link,knownSource:true});
      if(stage==='encoding')original.replace('new concurrent edit');else if(stage==='locking')original.onOpen=()=>original.replace('new concurrent edit');else original.onWrite=()=>original.replace('new concurrent edit');
      await assert.rejects(target.write(new Blob(['unsaved in app'])),/保存処理中/);assert.match(original.state().bytes,/new concurrent edit/);assert.equal(original.state().writes,0);assert.equal(original.state().aborts,stage==='encoding'?0:1);
      assert.equal([...f.store.values.values()][0].fingerprint,opened.link.fingerprint);
    }
  });
  test(`${app}: failed writes leave the original checkpoint and file intact`,async()=>{
    const f=setup(app),original=fileHandle(f.name),opened=await f.api.opened({file:await original.getFile(),projectId,handle:original}),before=original.state().bytes;
    const target=await f.api.prepare({projectId,name:f.name,handle:original,link:opened.link,knownSource:true});original.fail=true;
    await assert.rejects(target.write(new Blob(['edited'])),/disk full/);assert.equal(original.state().bytes,before);assert.equal(original.state().aborts,1);assert.equal([...f.store.values.values()][0].fingerprint,opened.link.fingerprint);
  });
  test(`${app}: old workspace without a version baseline asks before replacing the selected source`,async()=>{
    const f=setup(app,{answers:['bind','cancel']}),original=fileHandle(f.name);f.setOpen(original);
    await assert.rejects(f.api.prepare({projectId,name:f.name,knownSource:true}),{name:'AbortError'});assert.deepEqual(f.prompts.map(p=>p.kind),['missing','unknown']);assert.equal(original.state().opens,0);
  });
}
function fExtension(app){return app==='plot'?'.plotproject':'.mifito';}
test('app identity and filename must match even when an opaque token is copied',async()=>{
  const f=setup('plot'),original=fileHandle(f.name),opened=await f.api.opened({file:await original.getFile(),projectId,handle:original});
  assert.equal(await f.api.resolve({projectId:otherId,name:f.name,link:opened.link}),null);assert.equal(await f.api.resolve({projectId,name:'else.plotproject',link:opened.link}),null);
  const other=setup('mifito',{store:f.store});assert.equal(await other.api.resolve({projectId,name:f.name,link:opened.link}),null);
});
test('browser storage failure preserves editing, saving and a safe portable checkpoint',async()=>{
  const f=setup('plot',{store:{async get(){throw Error();},async list(){throw Error();},async put(){throw Error();}}}),original=fileHandle(f.name),opened=await f.api.opened({file:await original.getFile(),projectId,handle:original});
  const target=await f.api.prepare({projectId,name:f.name,handle:opened.handle,link:opened.link,knownSource:true}),hash=await target.write(new Blob(['new bytes'])),saved=await target.remember(projectId,hash);
  assert.equal(saved.remembered,false);assert.equal(original.state().writes,1);assert.equal(await f.api.resolve({projectId,name:f.name,link:saved.link}),null);
});
test('two browser tabs saving the same project serialize and the stale writer preserves the first save',async()=>{
  let queue=Promise.resolve();const locks={request(_key,task){const result=queue.then(task);queue=result.catch(()=>{});return result;}};
  const f=setup('plot',{host:{navigator:{locks}}}),original=fileHandle(f.name),opened=await f.api.opened({file:await original.getFile(),projectId,handle:original}),options={projectId,name:f.name,handle:original,link:opened.link,knownSource:true};
  const first=await f.api.prepare(options),second=await f.api.prepare(options),results=await Promise.allSettled([first.write(new Blob(['tab one'])),second.write(new Blob(['tab two']))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);assert.equal(original.state().writes,1);assert.ok(['tab one','tab two'].includes(original.state().bytes));
});
test('unsupported browsers download and never claim a writable target',async()=>{
  const f=setup('plot',{host:{showOpenFilePicker:undefined,showSaveFilePicker:undefined}}),downloads=[];
  const target=await f.api.prepare({projectId,name:f.name,knownSource:true,fallback:(blob,name)=>downloads.push([blob,name])});await target.write(new Blob(['backup']));
  assert.equal(target.handle,null);assert.equal((await target.remember(projectId)).link,null);assert.equal(downloads.length,1);assert.equal(f.prompts.length,0);
});
test('bulk source saves never substitute downloads for real original files',async()=>{
  const f=setup('plot',{host:{showOpenFilePicker:undefined,showSaveFilePicker:undefined}});let downloaded=false;
  await assert.rejects(f.api.prepare({projectId,name:f.name,knownSource:true,requireFile:true,fallback:()=>downloaded=true}),/一括保存できません/);assert.equal(downloaded,false);
});
test('hidden editor saves delegate target selection and confirmations to the visible Studio window',async()=>{
  const f=setup('plot'),original=fileHandle(f.name),opened=await f.api.opened({file:await original.getFile(),projectId}),events=[];
  const parentHost={async showOpenFilePicker(){events.push('parent-picker');return [original];},async showSaveFilePicker(){assert.fail('unexpected Save As');}},parentChoose=async info=>{events.push('parent-dialog:'+info.kind);return 'bind';};
  const target=await f.api.prepare({projectId,name:f.name,link:opened.link,knownSource:true,requireFile:true,host:parentHost,choose:parentChoose});await target.write(new Blob(['new source bytes']));
  assert.deepEqual(events,['parent-dialog:missing','parent-picker']);assert.equal(f.picker.opens,0);assert.equal(f.prompts.length,0);assert.equal(original.state().bytes,'new source bytes');
});
test('parent picker files enter project validators as editor-realm Files with unchanged bytes and metadata',async()=>{
  class ParentFile extends File{}
  const name='images.mifito',original=fileHandle(name),file=await original.getFile(),foreign=new ParentFile([file],name,{type:'application/octet-stream',lastModified:123});original.getFile=async()=>foreign;
  let checked=false;const api=createProjectFileLinks({app:'mifito',store:memoryStore(),host:{async showSaveFilePicker(){},async showOpenFilePicker(){return [original];}},choose:async()=> 'bind',identify:async local=>{assert.equal(local.constructor,File);assert.equal(local.name,name);assert.equal(local.lastModified,123);assert.equal(await local.text(),await foreign.text());checked=true;return {projectId};}});
  const opened=await api.opened({file:foreign,projectId}),target=await api.prepare({projectId,name,link:opened.link,knownSource:true,requireFile:true});assert.equal(checked,true);assert.equal(target.handle,original);
});
test('permissions for inactive sibling editors use a fresh gesture in the visible Studio dialog',async()=>{
  const f=setup('plot'),original=fileHandle(f.name),opened=await f.api.opened({file:await original.getFile(),projectId,handle:original}),events=[];original.permission='prompt';let active=false;
  original.requestPermission=async()=>{assert.equal(active,true);original.permission='granted';events.push('native-permission');return 'granted';};
  const target=await f.api.prepare({projectId,name:f.name,handle:original,link:opened.link,requireFile:true,choose:async info=>{assert.equal(info.kind,'permission');events.push('Studio-dialog');active=true;return 'allow';}});
  await target.write(new Blob(['approved bulk contents']));assert.deepEqual(events,['Studio-dialog','native-permission']);assert.equal(original.state().writes,1);
});
test('a long first save cannot exhaust the gesture needed for the next new file picker',async()=>{
  const f=setup('plot'),copy=fileHandle('new.plotproject'),activation={isActive:false},events=[];
  const target=await f.api.prepare({projectId,name:f.name,requireFile:true,host:{navigator:{userActivation:activation},async showSaveFilePicker(){assert.equal(activation.isActive,true);events.push('picker');return copy;}},choose:async info=>{assert.equal(info.kind,'new');events.push('Studio-dialog');activation.isActive=true;return 'saveAs';}});
  assert.equal(target.handle,copy);assert.equal(target.saveAs,false);assert.equal(copy.state().writes,0);assert.deepEqual(events,['Studio-dialog','picker']);
});
test('portable descriptors strip all file access data and reject invalid fingerprints',()=>{
  const descriptor={token:crypto.randomUUID(),fingerprint:'a'.repeat(64),path:'C:\\OneDrive\\private',handle:{kind:'file'}};
  assert.deepEqual(portableFileLink(descriptor),{token:descriptor.token,fingerprint:descriptor.fingerprint});assert.equal(portableFileLink({...descriptor,fingerprint:'invalid'}),null);assert.equal(portableFileLink({...descriptor,token:'../else'}),null);
});

class Element{
  constructor(tag){this.tag=tag;this.style={};this.children=[];this.events={};}
  setAttribute(){}append(...nodes){this.children.push(...nodes);}addEventListener(event,fn){this.events[event]=fn;}showModal(){this.open=true;}close(){this.open=false;this.events.close?.();}remove(){this.removed=true;}focus(){this.focused=true;}
  fire(event){this.events[event]?.({preventDefault(){}});}
}
test('save dialog uses escaped filenames, defaults to cancel, and leaves no modal on cancellation',async()=>{
  const doc={body:new Element('body'),createElement:tag=>new Element(tag)},name='<img onerror=alert(1)>.plotproject';
  const promise=chooseProjectFileAction({kind:'changed',name},doc),dialog=doc.body.children[0],buttons=dialog.children.at(-1).children;
  assert.equal(dialog.children[1].textContent,name);assert.equal(buttons[0].focused,true);assert.ok(buttons.some(b=>b.textContent==='名前を付けて保存'));assert.ok(buttons.some(b=>b.textContent==='画面の内容で上書き'));
  dialog.fire('cancel');assert.equal(await promise,'cancel');assert.equal(dialog.open,false);assert.equal(dialog.removed,true);
});
test('missing-source dialog opens binding only after a deliberate button click',async()=>{
  const doc={body:new Element('body'),createElement:tag=>new Element(tag)},promise=chooseProjectFileAction({kind:'missing',name:'file.mifito'},doc),dialog=doc.body.children[0];
  dialog.children.at(-1).children.find(b=>b.textContent==='元ファイルを選択して上書き').fire('click');assert.equal(await promise,'bind');assert.equal(dialog.removed,true);
});
