import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {identifyPlotProject,readPlotIdentity,plotSheetId,plotSheetIndex,mergePlotCheckpoint,samePlotCheckpoint,createPlotAcknowledgements} from '../plot-sync.mjs';
function fixture(){const p=JSON.parse(fs.readFileSync(new URL('../samples/general.plotproject',import.meta.url)));p.workspace.figureStudioProjectId='test-project-00000001';p.workspace.sheetSettings=[0,1].map(sheetIndex=>({sheetIndex,settings:{...structuredClone(p.settings),data:{...p.settings.data,sheet:'Sheet '+(sheetIndex+1)}}}));p.settings=p.workspace.sheetSettings[0].settings;return p;}
test('sheet identity persists across view, export DPI and active-sheet changes',async()=>{
 const p=fixture(),before=await identifyPlotProject(p);p.workspace.pngDpi=1200;p.workspace.view.zoom=2;p.data.sheetIndex=1;p.settings=p.workspace.sheetSettings[1].settings;
 const after=await readPlotIdentity(new Blob([JSON.stringify(p)]));assert.equal(before.projectId,after.projectId);assert.deepEqual(before.images,after.images);assert.equal(after.activeImageId,plotSheetId(1));assert.equal(plotSheetIndex(after.activeImageId),1);assert.equal(plotSheetIndex('plot-sheet-999999'),null);
});
test('one sheet edit changes only its fingerprint; data or fonts invalidate all graphs',async()=>{
 const p=fixture(),before=await identifyPlotProject(p);p.workspace.sheetSettings[1].settings.axes.xLabel='edited';const after=await identifyPlotProject(p);assert.equal(before.images[0].fingerprint,after.images[0].fingerprint);assert.notEqual(before.images[1].fingerprint,after.images[1].fingerprint);
 for(const mutate of [p=>p.data.base64+='AAAA',p=>p.fonts.push({name:'custom',base64:'AA=='})]){const p=fixture();mutate(p);const next=await identifyPlotProject(p);assert.ok(next.images.every((image,index)=>image.fingerprint!==before.images[index].fingerprint));}
});
test('single acceptance leaves other unsent graph changes dirty; batch acceptance clears them',async()=>{
 const p=fixture(),source={},before={source,identity:await identifyPlotProject(p)};p.workspace.sheetSettings[1].settings.axes.xLabel='unsent';p.settings.axes.yLabel='accepted';const captured={source,identity:await identifyPlotProject(p)};
 const partial=mergePlotCheckpoint(before,captured);assert.equal(samePlotCheckpoint(partial,captured),false);assert.equal(partial.identity.images[0].fingerprint,captured.identity.images[0].fingerprint);assert.equal(partial.identity.images[1].fingerprint,before.identity.images[1].fingerprint);assert.equal(samePlotCheckpoint(mergePlotCheckpoint(before,captured,true),captured),true);
 assert.equal(mergePlotCheckpoint(null,captured),null);assert.equal(mergePlotCheckpoint({...before,source:{}},captured),null);
 const ack=createPlotAcknowledgements();ack.accept({image:{projectId:captured.identity.projectId,...captured.identity.images[0]}});assert.equal(ack.isUnchanged(captured.identity.projectId,captured.identity.images[0]),true);assert.equal(ack.isUnchanged(captured.identity.projectId,captured.identity.images[1]),false);ack.accept({batch:captured.identity});assert.equal(ack.isUnchanged(captured.identity.projectId,captured.identity.images[1]),true);
});
test('legacy projects derive a reproducible identity and malformed metadata cannot attach',async()=>{
 const p=fixture();delete p.workspace.figureStudioProjectId;assert.equal((await identifyPlotProject(p)).projectId,(await identifyPlotProject(structuredClone(p))).projectId);
 for(const mutate of [p=>p.workspace.figureStudioProjectId='../bad',p=>p.workspace.sheetSettings.push(p.workspace.sheetSettings[0]),p=>p.data.sheetIndex=-1,p=>p.settings.series=[]]){const p=fixture();mutate(p);await assert.rejects(identifyPlotProject(p));}
});
