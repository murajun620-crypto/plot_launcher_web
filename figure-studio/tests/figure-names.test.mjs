import test from 'node:test';
import assert from 'node:assert/strict';
import {renumberFigureNames} from '../figure-names.mjs';
import {reorderFigures} from '../figure-order.mjs';
import {History} from '../model.mjs';
const make=names=>names.map((name,index)=>({id:`figure-${index}`,name,objects:[{id:`panel-${index}`,source:{app:'plot',assetId:`source-${index}`}}]}));
const names=figures=>figures.map(f=>f.name);

test('reordering renumbers names while preserving Figure identity and linked contents',()=>{
 const figures=make(['Fig. 1','Fig. 2','Fig. 3']),original=figures[2],objects=original.objects;
 const next=renumberFigureNames(reorderFigures(figures,[original.id],figures[0].id));
 assert.deepEqual(names(next),['Fig. 1','Fig. 2','Fig. 3']);
 assert.equal(next[0],original);assert.equal(next[0].objects,objects);
 assert.equal(next[0].id,'figure-2');assert.equal(next[0].objects[0].source.assetId,'source-2');
});

test('multiple moved Figures keep their relative order and receive their new positions',()=>{
 const figures=make(['Fig. 1','Fig. 2','Fig. 3','Fig. 4']);
 const next=renumberFigureNames(reorderFigures(figures,[figures[3].id,figures[1].id],figures[0].id));
 assert.deepEqual(next.map(f=>f.id),['figure-1','figure-3','figure-0','figure-2']);
 assert.deepEqual(names(next),['Fig. 1','Fig. 2','Fig. 3','Fig. 4']);
});

test('numbering preserves prefix style, suffix titles and custom names',()=>{
 const figures=make(['Figure 9 — Demo','FIG. 8: Treatment 2','fig 7 のコピー','AFM — axes 4 × 3 cm','Results for Figure 1','Figure 3D rendering','Figure 2.5 results']);
 renumberFigureNames(figures);
 assert.deepEqual(names(figures),['Figure 1 — Demo','FIG. 2: Treatment 2','fig 3 のコピー','AFM — axes 4 × 3 cm','Results for Figure 1','Figure 3D rendering','Figure 2.5 results']);
});

test('insertion and deletion close gaps and repeated numbering is a no-op',()=>{
 const figures=make(['Fig. 1','Fig. 3','Fig. 8']);
 assert.equal(renumberFigureNames(figures),figures);
 assert.deepEqual(names(figures),['Fig. 1','Fig. 2','Fig. 3']);
 const once=JSON.stringify(figures);renumberFigureNames(figures);assert.equal(JSON.stringify(figures),once);
});

test('one history step restores ordering and matching names together',()=>{
 const figures=make(['Figure 1 — A','Figure 2 — B']),before={figures:structuredClone(figures)},history=new History();
 const after={figures:renumberFigureNames(reorderFigures(figures,[figures[1].id],figures[0].id))};
 history.push(before,after);
 const undone=history.undo(after);assert.deepEqual(undone,before);
 assert.deepEqual(names(history.redo(undone).figures),['Figure 1 — B','Figure 2 — A']);
});
