import test from 'node:test';
import assert from 'node:assert/strict';
import {LINE_STYLES,lineStyleValue,lineStrokeAttributes,setLineStyle,supportsLineStyle} from '../line-styles.mjs';
import {makeObject,newDocument,validateDocument,History} from '../model.mjs';
import {readFile} from 'node:fs/promises';

test('nine distinct line patterns scale with width and distinguish round and square dots',()=>{
 assert.equal(LINE_STYLES.length,9);assert.equal(new Set(LINE_STYLES.map(s=>JSON.stringify(s.pattern)+s.cap)).size,9);
 assert.deepEqual(lineStrokeAttributes({dashStyle:'round-dot',strokeWidth:2}),{'stroke-dasharray':'0 6','stroke-linecap':'round'});
 assert.deepEqual(lineStrokeAttributes({dashStyle:'square-dot',strokeWidth:2}),{'stroke-dasharray':'2 4','stroke-linecap':'butt'});
 assert.equal(lineStrokeAttributes({dashStyle:'long-dash-dot-dot',strokeWidth:2})['stroke-dasharray'],'16 4 2 4 2 4');
 assert.equal(lineStrokeAttributes({dashStyle:'solid',strokeWidth:2})['stroke-dasharray'],undefined);
 for(const style of LINE_STYLES)for(const width of [0,.1,1,30]){
  const attrs=lineStrokeAttributes({dashStyle:style.value,strokeWidth:width});assert.doesNotMatch(JSON.stringify(attrs),/NaN|Infinity/);
  if(!width)assert.equal(attrs['stroke-dasharray'],undefined);
 }
});

test('legacy dashed files retain their pattern and new solid overrides the legacy flag',()=>{
 assert.equal(lineStyleValue({dashed:true}),'dash');assert.equal(lineStyleValue({}),'solid');
 assert.deepEqual(lineStrokeAttributes({dashed:true,strokeWidth:2}),{'stroke-dasharray':'8 6','stroke-linecap':'round'});
 const legacy=makeObject('line',{dashed:true});setLineStyle(legacy,'solid');assert.equal(legacy.dashed,false);assert.equal(lineStyleValue(legacy),'solid');
 const raw={...newDocument(),objects:[makeObject('line',{dashed:true})]},restored=validateDocument(JSON.parse(JSON.stringify(raw)));
 assert.equal(lineStyleValue(restored.objects[0]),'dash');
});

test('line style persists for every supported shape and invalid saved values are rejected',()=>{
 for(const type of ['line','arrow','rect','ellipse','curve','freeform','arc'])for(const style of LINE_STYLES){
  const shape=makeObject(type);assert.ok(supportsLineStyle(shape));assert.equal(setLineStyle(shape,style.value),true);
  const restored=validateDocument(JSON.parse(JSON.stringify({...newDocument(),objects:[shape]})));
  assert.equal(lineStyleValue(restored.objects[0]),style.value);
 }
 for(const extra of [{dashStyle:'unknown'},{dashStyle:{}},{dashStyle:1},{dashed:'true'}])assert.throws(()=>validateDocument({...newDocument(),objects:[makeObject('line',extra)]}),/線種/);
 for(const type of ['image','text']){const shape=makeObject(type);assert.equal(setLineStyle(shape,'dash'),false);assert.equal(shape.dashStyle,undefined);}
});

test('one history edit can change multiple eligible objects and restore their different original styles',()=>{
 const shapes=[makeObject('rect'),makeObject('arrow',{dashStyle:'dash-dot'}),makeObject('image')],before={...newDocument(),objects:structuredClone(shapes)},history=new History();
 for(const shape of shapes)setLineStyle(shape,'round-dot');const after={...before,objects:shapes};assert.ok(history.push(before,after));
 const undo=history.undo(after);assert.deepEqual(undo.objects.map(lineStyleValue),['solid','dash-dot','solid']);
 assert.deepEqual(history.redo(undo).objects.map(lineStyleValue),['round-dot','round-dot','solid']);
});

test('actual format-copy commands carry legacy dash styles and explicitly reset a dashed target to solid',async()=>{
 const source=await readFile(new URL('../app.js',import.meta.url),'utf8'),start=source.indexOf(" if(action==='copy-format')"),end=source.indexOf(" if(action==='auto-grid'",start);
 assert.ok(start>=0&&end>start);let selected=makeObject('line',{dashed:true}),targets=[makeObject('ellipse'),makeObject('rect',{locked:true})],edits=0;
 const run=Function('selected','editable','change','toast','lineStyleValue','supportsLineStyle',`let formatClipboard=null;return function(action){${source.slice(start,end)}};`)(()=>[selected],()=>targets.filter(o=>!o.locked),fn=>{fn();edits++;},()=>{},lineStyleValue,supportsLineStyle);
 run('copy-format');run('paste-format');assert.equal(lineStyleValue(targets[0]),'dash');assert.equal(targets[1].dashStyle,undefined);assert.equal(edits,1);
 selected=makeObject('line');run('copy-format');run('paste-format');assert.equal(targets[0].dashStyle,'solid');assert.equal(targets[0].dashed,false);assert.equal(edits,2);
});
