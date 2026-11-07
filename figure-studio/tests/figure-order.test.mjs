import test from 'node:test';
import assert from 'node:assert/strict';
import {orderedFigureIds,selectFigureIds,reorderFigures} from '../figure-order.mjs';
const order=['a','b','c','d','e'];
const figures=order.map(id=>({id,objects:[{id:`${id}-image`}]}));
const ids=items=>items.map(f=>f.id);

test('selection toggles only the clicked Figure and remains in document order',()=>{
  assert.deepEqual(selectFigureIds(order,['d','b'],'c',{toggle:true}),['b','c','d']);
  assert.deepEqual(selectFigureIds(order,['b','c'],'b',{toggle:true}),['c']);
  assert.deepEqual(selectFigureIds(order,['b'],'b',{toggle:true}),[]);
});
test('Shift selection extends either direction from a stable anchor',()=>{
  assert.deepEqual(selectFigureIds(order,['d'],'b',{range:true,anchor:'d'}),['b','c','d']);
  assert.deepEqual(selectFigureIds(order,['b'],'e',{range:true,anchor:'b'}),['b','c','d','e']);
  assert.deepEqual(selectFigureIds(order,['a','e'],'c',{toggle:true,range:true,anchor:'b'}),['a','b','c','e']);
});
test('deleted or foreign IDs cannot enter a sidebar selection',()=>{
  assert.deepEqual(orderedFigureIds(order,['e','missing','e','a']),['a','e']);
  assert.deepEqual(selectFigureIds(order,['b','missing'],'missing'),['b']);
  assert.deepEqual(selectFigureIds(order,['b'],'e',{range:true,anchor:'missing'}),['e']);
});
test('dragging nonadjacent Figures preserves their original order and source objects',()=>{
  const next=reorderFigures(figures,['d','b'],'a');
  assert.deepEqual(ids(next),['b','d','a','c','e']);
  assert.equal(next[0],figures[1]);assert.equal(next[1].objects,figures[3].objects);
  assert.deepEqual(ids(figures),order);
});
test('drop before a remaining card, to end, and to own boundary behave consistently',()=>{
  assert.deepEqual(ids(reorderFigures(figures,['b','c'],'e')),['a','d','b','c','e']);
  assert.deepEqual(ids(reorderFigures(figures,['b','c'],null)),['a','d','e','b','c']);
  assert.deepEqual(ids(reorderFigures(figures,['b','c'],'d')),order);
  assert.deepEqual(ids(reorderFigures(figures,order,null)),order);
});
test('invalid drop targets and empty selections leave ordering unchanged',()=>{
  assert.deepEqual(ids(reorderFigures(figures,['b'],'b')),order);
  assert.deepEqual(ids(reorderFigures(figures,['b'],'missing')),order);
  assert.deepEqual(ids(reorderFigures(figures,[],'a')),order);
  assert.deepEqual(ids(reorderFigures(figures,['missing'],'a')),order);
});
