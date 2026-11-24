import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),start=source.indexOf('  async loadProject(file,',source.indexOf('figureStudioBridge=setupFigureBridge(')),end=source.indexOf('  selectImage:',start),load=source.slice(start,end);
function fixture(success=true,matchFile=true){const reads=[],selected=[],env={engineReady:true,loading:false,exporting:false,renderRunning:false,renderedRevision:1,revision:1,metadata:{sheetIndex:0},sourceData:{figureStudioProjectId:'same-project'},figureBridgePreservedOnReconnect:false,parseProject(){},fileProgress:{begin(){return {async read(file){return file.text();},stage(){},async paint(){},release(){},fail(){}};}},figureBridgeWait:async()=>{},openedPlotIdentity:async identity=>identity,currentPlotMatchesIdentity:()=>true,currentPlotMatchesFileLink:async()=>matchFile,identifyPlotProject:async()=>({projectId:'same-project'}),readProject:async(_file,_saved,options)=>{reads.push(options);return success;},chooseFigureStudioSheet:async id=>selected.push(id),$:()=>({classList:{contains:()=>false}})};const keys=Object.keys(env),api=Function(...keys,`const callbacks={${load}};return {load:callbacks.loadProject,preserved:()=>figureBridgePreservedOnReconnect};`)(...keys.map(k=>env[k]));return{api,reads,selected,file:new File(['{}'],'same.plotproject')};}
test('confirmed force reloads even the same project and selects the exact sheet',async()=>{const f=fixture();await f.api.load(f.file,{reconnect:true,force:true,imageId:'plot-sheet-000001'});assert.deepEqual(f.reads,[{fromBridge:true,force:true}]);assert.deepEqual(f.selected,['plot-sheet-000001']);assert.equal(f.api.preserved(),false);});
test('ordinary same-project reconnect preserves live work without deserialization',async()=>{const f=fixture();await f.api.load(f.file,{reconnect:true,imageId:'plot-sheet-000001'});assert.equal(f.reads.length,0);assert.equal(f.api.preserved(),true);});
test('failed forced import never claims that the requested sheet is ready',async()=>{const f=fixture(false);await assert.rejects(f.api.load(f.file,{force:true,imageId:'plot-sheet-000001'}),/復元できません/);assert.equal(f.selected.length,0);});

test('the incoming Studio route reaches the full loader when the native target differs',async()=>{
 const f=fixture(true,false),sourceKey='book/figure/panel/asset';
 await f.api.load(f.file,{reconnect:true,sourceKey,imageId:'plot-sheet-000001'});
 assert.deepEqual(f.reads,[{fromBridge:true,sourceKey}]);
 assert.equal(f.api.preserved(),false);
});
test('a host-verified exact adoption can retain the native target of its acknowledged editor',async()=>{
 const f=fixture(true,false),sourceKey='book/figure/panel/asset';
 await f.api.load(f.file,{reconnect:true,adopted:true,sourceKey,imageId:'plot-sheet-000001'});
 assert.deepEqual(f.reads,[]);
 assert.equal(f.api.preserved(),true);
});
