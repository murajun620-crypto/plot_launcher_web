import test from 'node:test';
import assert from 'node:assert/strict';
import {planMiFiToSync} from '../mifito-batch.mjs';

const fingerprint=character=>character.repeat(64);
const image=(imageId,character='a',name=`${imageId}.png`)=>({imageId,name,fingerprint:fingerprint(character)});
const panel=(id,imageId,character='a',projectId='project-a')=>({id,type:'image',name:`custom ${id}`,x:10,y:20,w:100,h:80,assetId:`preview-${id}`,source:{app:'mifito',assetId:`source-${id}`,projectId,imageId,fingerprint:fingerprint(character)}});
const figure=(id,...objects)=>({id,name:`Figure title ${id}`,objects});
const identity=(activeImageId,...images)=>({projectId:'project-a',activeImageId,images,legacy:true});
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze);}return value;};

test('updates correct images across reordered Figures and leaves unrelated projects untouched',()=>{
 const a=panel('panel-a','image-a'),b=panel('panel-b','image-b'),foreign=panel('foreign','image-a','a','another-project');
 const figures=freeze([figure('second',b),figure('first',foreign,a)]),before=JSON.stringify(figures);
 const incoming=[image('image-a','b','renamed.png'),image('image-b'),image('image-c')];
 const result=planMiFiToSync(figures,{projectId:'project-a',images:incoming});
 assert.deepEqual(result.matches.map(m=>[m.figureId,m.panelId,m.imageId,m.changed]),[['second','panel-b','image-b',false],['first','panel-a','image-a',true]]);
 assert.deepEqual(result.summary,{updated:1,added:1,unchanged:1});
 assert.equal(result.additions[0],incoming[2]);assert.equal(result.matches[1].image,incoming[0]);
 assert.equal(result.matches[1].fingerprint,fingerprint('a'));assert.equal(result.matches[1].sourceAssetId,a.source.assetId);
 assert.equal(JSON.stringify(figures),before);
});

test('duplicate placements all match while summary counts each incoming image once',()=>{
 const a=panel('original','image-a'),copy=panel('copy','image-a','b'),unchanged=panel('unchanged','image-b');
 const result=planMiFiToSync([figure('one',a),figure('two',copy,unchanged)],{projectId:'project-a',images:[image('image-a','b'),image('image-b')]});
 assert.deepEqual(result.matches.map(m=>[m.panelId,m.changed]),[['original',true],['copy',false],['unchanged',false]]);
 assert.deepEqual(result.summary,{updated:1,added:0,unchanged:1});assert.equal(result.linked.length,3);
});

test('single-image sync retains other project links and their old preview fingerprints',()=>{
 const a=panel('a','image-a'),b=panel('b','image-b','b');
 const saved=identity('image-a',image('image-a','e'),image('image-b','f'));
 const identities=new Map([[a.source.assetId,saved],[b.source.assetId,saved]]);
 const result=planMiFiToSync([figure('one',a,b)],{projectId:'project-a',images:[image('image-a','c')]},identities);
 assert.deepEqual(result.summary,{updated:1,added:0,unchanged:0});
 assert.deepEqual(result.matches.map(m=>m.panelId),['a']);
 assert.deepEqual(result.linked.map(m=>[m.imageId,m.fingerprint,m.changed]),[['image-a',fingerprint('a'),true],['image-b',fingerprint('b'),false]]);
 assert.equal(result.linked[1].image,saved.images[1]);
});

test('legacy projects match the saved active image by identity and settings',()=>{
 const old={id:'old-panel',type:'image',assetId:'old-preview',source:{app:'mifito',assetId:'old-project'}};
 const metadata=identity('image-b',image('image-a'),image('image-b','b'));
 const result=planMiFiToSync([figure('old',old)],{projectId:'project-a',images:[image('image-a'),image('image-b','b')]},new Map([['old-project',metadata]]));
 assert.equal(result.matches[0].imageId,'image-b');assert.equal(result.matches[0].fingerprint,fingerprint('b'));
 assert.deepEqual(result.summary,{updated:0,added:1,unchanged:1});
 assert.deepEqual(result.additions.map(m=>m.imageId),['image-a']);
});

test('ambiguous legacy duplicates match only the explicitly anchored panel',()=>{
 const old=id=>({id,type:'image',source:{app:'mifito',assetId:'old-project'}});
 const descriptor={...image('ambiguous'),ambiguous:true},metadata=identity('ambiguous',descriptor);
 const figures=[figure('one',old('anchor'),old('other'))],batch={projectId:'project-a',images:[image('ambiguous','b')]},identities=new Map([['old-project',metadata]]);
 assert.equal(planMiFiToSync(figures,batch,identities).matches.length,0);
 const anchored=planMiFiToSync(figures,batch,identities,{anchorPanelId:'anchor'});
 assert.deepEqual(anchored.matches.map(m=>m.panelId),['anchor']);assert.equal(anchored.linked.length,1);
 assert.deepEqual(anchored.summary,{updated:1,added:0,unchanged:0});
});

test('missing and conflicting source identities never fall back to position or name',()=>{
 const stale=panel('stale','removed'),foreign=panel('foreign','image-a');
 const partial=panel('partial','image-a');delete partial.source.imageId;
 const unresolved={id:'unresolved',type:'image',name:'image-a.png',source:{app:'mifito',assetId:'unknown'}};
 const plot={...panel('plot','image-a'),source:{...panel('plot','image-a').source,app:'plot'}};
 const identities=new Map([[stale.source.assetId,identity('image-a',image('image-a'))],[foreign.source.assetId,{...identity('image-a',image('image-a')),projectId:'other'}],[partial.source.assetId,identity('image-a',image('image-a'))]]);
 const result=planMiFiToSync([figure('one',stale,foreign,partial,unresolved,plot)],{projectId:'project-a',images:[image('image-a')]},identities);
 assert.deepEqual(result.matches,[]);assert.deepEqual(result.linked,[]);assert.deepEqual(result.summary,{updated:0,added:1,unchanged:0});
});

test('unknown prior fingerprints require refresh and duplicate incoming IDs are rejected',()=>{
 const p=panel('panel','image-a');delete p.source.fingerprint;
 const result=planMiFiToSync([figure('one',p)],{projectId:'project-a',images:[image('image-a')]});
 assert.equal(result.matches[0].fingerprint,null);assert.equal(result.matches[0].changed,true);
 assert.throws(()=>planMiFiToSync([],{projectId:'project-a',images:[image('image-a'),image('image-a','b')]}),/識別情報/);
 assert.throws(()=>planMiFiToSync([],{projectId:'project-a',images:[{imageId:'a',fingerprint:'invalid'}]}),/識別情報/);
});

test('an acknowledged unchanged source snapshot cannot overwrite newer duplicate placements',()=>{
 const old=panel('old-placement','image-a','a'),newer=panel('newer-placement','image-a','b');
 const unchanged={...image('image-a','a'),unchanged:true};
 const result=planMiFiToSync([figure('one',old),figure('two',newer)],{projectId:'project-a',images:[unchanged]});
 assert.deepEqual(result.matches.map(m=>[m.panelId,m.fingerprint,m.changed]),[['old-placement',fingerprint('a'),false],['newer-placement',fingerprint('b'),false]]);
 assert.deepEqual(result.summary,{updated:0,added:0,unchanged:1});
 assert.deepEqual(result.additions,[]);
 // The skipped newer snapshot remains visible to the caller so its source
 // project reference can also be retained instead of pointing at older data.
 assert.equal(result.matches[1].image,unchanged);
 assert.equal(result.linked[1].fingerprint,fingerprint('b'));
});

test('unchanged descriptors still add missing images and initialize a new receiver',()=>{
 const a={...image('image-a'),unchanged:true},b={...image('image-b','b'),unchanged:true};
 const fresh=planMiFiToSync([],{projectId:'project-a',images:[a,b]});
 assert.deepEqual(fresh.summary,{updated:0,added:2,unchanged:0});assert.deepEqual(fresh.additions,[a,b]);
 const partial=planMiFiToSync([figure('one',panel('a','image-a'))],{projectId:'project-a',images:[a,b]});
 assert.deepEqual(partial.summary,{updated:0,added:1,unchanged:1});assert.deepEqual(partial.additions,[b]);
});

test('only an explicit unchanged true skips a different fingerprint',()=>{
 for(const unchanged of [undefined,false,'true',1]){
  const result=planMiFiToSync([figure('one',panel('a','image-a','b'))],{projectId:'project-a',images:[{...image('image-a'),unchanged}]});
  assert.equal(result.matches[0].changed,true);assert.deepEqual(result.summary,{updated:1,added:0,unchanged:0});
 }
});
