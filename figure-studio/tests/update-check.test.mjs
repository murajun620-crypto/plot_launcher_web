import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRelease, hasNewRelease, setupUpdateCheck} from '../update-check.mjs';

const current = {version:'0.2.0',build:'direct-send-v020'};

function setup(t, {remote = current, beforeReload, fetcher} = {}) {
  const originals = Object.fromEntries(['document','location','fetch'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const label={textContent:''},attrs={},classes=new Set(),listeners=new Map(),events=[],requests=[];
  const state={saved:0,reloaded:0};
  const button={dataset:{},disabled:false,title:'',querySelector:()=>label,
    setAttribute:(key,value)=>attrs[key]=value,
    classList:{toggle:(key,enabled)=>enabled?classes.add(key):classes.delete(key)},
    addEventListener:(key,value)=>listeners.set(key,value),removeEventListener:key=>listeners.delete(key)};
  globalThis.document={baseURI:'https://example.test/figure_studio/',getElementById:()=>button,
    querySelector:selector=>({content:selector.includes('version')?current.version:current.build})};
  globalThis.location={reload(){state.reloaded++;events.push('reload');}};
  globalThis.fetch=async(url,options)=>{requests.push({url:String(url),options});return fetcher?fetcher(url,options):{ok:true,json:async()=>remote};};
  t.after(()=>{for(const [key,descriptor]of Object.entries(originals)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
  const api=setupUpdateCheck({beforeReload:beforeReload||(async()=>{state.saved++;events.push('saved');}),onStatus:(message,detail)=>events.push({message,detail})});
  t.after(()=>api.dispose());
  return {api,button,label,attrs,classes,listeners,events,requests,state};
}

test('release comparison recognizes a new build and ignores an older published version',()=>{
  assert.deepEqual(parseRelease(current),current);
  assert.equal(hasNewRelease(current,current),false);
  assert.equal(hasNewRelease(current,{version:'0.2.0',build:'direct-send-v020-fix'}),true);
  assert.equal(hasNewRelease(current,{version:'0.3.0',build:'next'}),true);
  assert.equal(hasNewRelease(current,{version:'0.1.0',build:'older'}),false);
  assert.throws(()=>parseRelease({version:'latest',build:'x'}));
  assert.throws(()=>parseRelease({version:'0.2.0',build:'https://example.test/code.js'}));
});

test('checking the current release uses no-store and never saves or reloads',async t=>{
  const s=setup(t);assert.equal((await s.api.check()).status,'current');
  assert.equal(s.state.saved,0);assert.equal(s.state.reloaded,0);
  assert.equal(s.button.disabled,false);assert.equal(s.label.textContent,'更新確認');
  const request=s.requests[0],url=new URL(request.url);
  assert.equal(url.pathname,'/figure_studio/version.json');assert.match(url.searchParams.get('check'),/^\d+$/);
  assert.equal(request.options.cache,'no-store');assert.equal(request.options.credentials,'same-origin');
});

test('an available update waits for persistence before reloading',async t=>{
  let resolveSave;
  const s=setup(t,{remote:{version:'0.2.1',build:'next'},beforeReload:()=>new Promise(resolve=>resolveSave=resolve)});
  assert.equal((await s.api.check()).status,'available');assert.equal(s.label.textContent,'更新する');
  const pending=s.api.update();assert.equal(s.button.disabled,true);assert.equal(s.state.reloaded,0);
  assert.equal((await s.api.update()).status,'busy');
  resolveSave();assert.equal((await pending).status,'reloading');assert.equal(s.state.reloaded,1);
});

test('a persistence failure keeps the current page and allows retry',async t=>{
  const s=setup(t,{remote:{version:'0.2.1',build:'next'},beforeReload:async()=>{throw Error('quota');}});
  await s.api.check();assert.equal((await s.api.update()).status,'save-error');
  assert.equal(s.state.reloaded,0);assert.equal(s.button.disabled,false);
  assert.equal(s.label.textContent,'更新する');assert.equal(s.api.getState().available.version,'0.2.1');
});

test('explicit cancellation from the persistence callback never reloads',async t=>{
  const s=setup(t,{remote:{version:'0.2.1',build:'next'},beforeReload:async()=>false});
  await s.api.check();assert.equal((await s.api.update()).status,'cancelled');assert.equal(s.state.reloaded,0);
});

test('network failure restores the check button without mutating the project',async t=>{
  const s=setup(t,{fetcher:async()=>{throw Error('offline');}});
  assert.equal((await s.api.check()).status,'error');assert.equal(s.button.disabled,false);
  assert.equal(s.state.saved,0);assert.equal(s.state.reloaded,0);assert.equal(s.api.getState().available,null);
});

test('invalid remote metadata is rejected rather than offered as an update',async t=>{
  const s=setup(t,{remote:{version:'<script>',build:'x'}});
  assert.equal((await s.api.check()).status,'error');assert.equal(s.label.textContent,'更新確認');
  assert.equal(s.state.reloaded,0);assert.equal(s.api.getState().available,null);
});

test('parallel checks share the busy state and disposal aborts the fetch',async t=>{
  const s=setup(t,{fetcher:(_,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))))});
  const pending=s.api.check();assert.equal(s.button.disabled,true);
  assert.equal((await s.api.check()).status,'busy');assert.equal(s.requests.length,1);
  s.api.dispose();assert.equal((await pending).status,'disposed');assert.equal(s.listeners.has('click'),false);
  assert.equal(s.state.reloaded,0);
});
