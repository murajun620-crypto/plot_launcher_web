import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnnotationTextEditor} from '../annotation-editor.mjs';

function fixture() {
  const documentRef = new EventTarget();
  documentRef.defaultView = Object.assign(new EventTarget(), {innerWidth: 800, innerHeight: 600});
  class Element extends EventTarget {
    children = [];
    style = {};
    dataset = {};
    setAttribute() {}
    append(child) { this.children.push(child); }
    replaceChildren() { this.children = []; }
    contains(target) { return this === target || this.children.some(child => child.contains(target)); }
    getBoundingClientRect() { return {width: 360, height: 320}; }
    focus() { documentRef.activeElement = this; }
    select() {}
  }
  const root = new Element();
  const controls = new Map(['textarea', '[data-field=fontFamily]', '[data-field=fontSize]', '.shared-text-formats', '[data-command=details]'].map(selector => [selector, new Element()]));
  for (const control of controls.values()) root.append(control);
  root.querySelector = selector => controls.get(selector);
  documentRef.createElement = tag => tag === 'section' ? root : new Element();
  documentRef.body = new Element();
  documentRef.head = new Element();
  const results = [];
  const editor = createAnnotationTextEditor({documentRef});
  editor.open({value: {text: '注釈'}, onFinish: value => results.push(value)});
  const fire = (node, type, properties) => node.dispatchEvent(Object.assign(new Event(type), properties));
  const moveFocus = next => {
    documentRef.activeElement = next || documentRef.body;
    fire(root, 'focusout', {relatedTarget: next});
  };
  return {editor, root, results, documentRef, moveFocus, fire, font: controls.get('[data-field=fontFamily]'), outside: new Element()};
}

test('annotation stays open through clicks on its background and native font picker focus changes', async () => {
  const {editor, root, results, documentRef, moveFocus, fire, font} = fixture();
  assert.equal(root.tabIndex, -1);
  for (const next of [root, documentRef.body, null, font]) {
    moveFocus(next);
    await Promise.resolve();
    assert.equal(editor.active, true);
  }
  fire(documentRef.defaultView, 'blur');
  assert.equal(editor.active, true);
  assert.deepEqual(results, []);
});

test('annotation commits on focus moving to an outside control or a click outside', async () => {
  const {editor, root, results, documentRef, moveFocus, outside} = fixture();
  moveFocus(outside);
  await Promise.resolve();
  assert.equal(editor.active, false);
  assert.equal(results.length, 1);
  assert.equal(results[0].cancel, false);

  editor.open({value: {text: '変更後'}, onFinish: value => results.push(value)});
  const pointerDown = target => {
    const event = new Event('pointerdown');
    Object.defineProperty(event, 'target', {value: target});
    documentRef.dispatchEvent(event);
  };
  pointerDown(root);
  assert.equal(editor.active, true);
  pointerDown(outside);
  assert.equal(editor.active, false);
  assert.equal(results.length, 2);
  assert.equal(results[1].value.text, '変更後');
});
