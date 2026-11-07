import test from 'node:test';
import assert from 'node:assert/strict';
import {createShortcutHandler} from '../shortcuts.mjs';

function setup({editing = false, active = true} = {}) {
  const calls = [], hints = [];
  const state = {editing, active};
  const handler = createShortcutHandler({
    execute: (action, payload) => calls.push([action, payload]),
    isEditing: () => state.editing,
    isCanvasActive: () => state.active,
    onHint: text => hints.push(text),
  });
  function press(key, options = {}) {
    const event = {
      key, code: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
      isComposing: false, defaultPrevented: false, stopped: false,
      getModifierState: () => false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.stopped = true; },
      ...options,
    };
    event.result = handler(event);
    return event;
  }
  return {calls, hints, state, handler, press};
}

test('sequential Alt, 5, L aligns left and clears Key Tips', () => {
  const s = setup();
  assert.equal(s.press('Alt').defaultPrevented, true);
  s.press('5');
  s.press('l');
  assert.deepEqual(s.calls, [['align-left', undefined]]);
  assert.match(s.hints[0], /最前面/);
  assert.match(s.hints[1], /左右等間隔/);
  assert.equal(s.hints.at(-1), '');
});

test('held Alt+5 then L and direct Alt+3/Alt+4 work', () => {
  const s = setup();
  s.press('5', {altKey: true}); s.press('L', {altKey: true});
  s.press('3', {altKey: true}); s.press('4', {altKey: true});
  assert.deepEqual(s.calls.map(c => c[0]), ['align-left', 'front', 'back']);
});

test('all alignment sequence keys dispatch distinct actions', () => {
  const s = setup();
  for (const key of ['l','c','r','t','m','b','h','v']) {
    s.press('Alt'); s.press('5'); s.press(key);
  }
  assert.deepEqual(s.calls.map(c => c[0]), [
    'align-left','align-center','align-right','align-top','align-middle','align-bottom','distribute-h','distribute-v',
  ]);
});

test('Escape only cancels an Alt sequence; second Escape reaches editor', () => {
  const s = setup();
  s.press('Alt'); s.press('5'); s.press('Escape');
  assert.equal(s.calls.length, 0);
  s.press('Escape');
  assert.deepEqual(s.calls, [['escape', undefined]]);
});

test('unknown Alt sequences do not accidentally switch tools', () => {
  const s = setup();
  s.press('Alt'); s.press('t');
  assert.equal(s.calls.length, 0);
  s.press('t');
  assert.deepEqual(s.calls, [['text', undefined]]);
});

test('ordinary form fields retain text selection, formatting, arrows and delete', () => {
  const s = setup({editing: true});
  for (const [key, opts] of [
    ['a', {ctrlKey: true}], ['b', {ctrlKey: true}], ['ArrowLeft', {}],
    ['Delete', {}], ['Alt', {}], ['l', {ctrlKey: true}], ['Tab', {}],
    ['>', {ctrlKey: true, shiftKey: true, code: 'Period'}],
  ]) assert.equal(s.press(key, opts).defaultPrevented, false);
  assert.equal(s.calls.length, 0);
});

test('font shortcuts recognize semantic keys and physical keys on JIS layouts', () => {
  const s = setup();
  s.press('>', {ctrlKey: true, shiftKey: true});
  s.press('Unidentified', {ctrlKey: true, shiftKey: true, code: 'Comma'});
  s.press(']', {ctrlKey: true});
  s.press('[', {metaKey: true});
  assert.deepEqual(s.calls.map(c => c[0]), ['font-grow','font-shrink','font-up','font-down']);
});

test('IME input and AltGraph are untouched and clear pending sequences', () => {
  const s = setup();
  s.press('Alt');
  assert.equal(s.press('a', {isComposing: true}).defaultPrevented, false);
  assert.equal(s.press('a', {keyCode: 229}).defaultPrevented, false);
  assert.equal(s.press('l', {altKey: true, ctrlKey: true, getModifierState: name => name === 'AltGraph'}).defaultPrevented, false);
  assert.equal(s.calls.length, 0);
  s.press('t'); assert.equal(s.calls.at(-1)[0], 'text');
});

test('canvas text retains native editing undo and clipboard but accepts formatting', () => {
  const s = setup({editing: 'canvas-text'});
  for (const key of ['a', 'c', 'x', 'v', 'z']) {
    assert.equal(s.press(key, {ctrlKey: true}).defaultPrevented, false);
  }
  s.press('b', {ctrlKey: true});
  s.press('e', {ctrlKey: true});
  s.press('>', {ctrlKey: true, shiftKey: true});
  s.press('Enter', {ctrlKey: true});
  assert.deepEqual(s.calls.map(c => c[0]), ['bold','text-center','font-grow','commit-text']);
});

test('clipboard keydowns remain native on canvas for image paste events', () => {
  const s = setup();
  for (const key of ['c','x','v']) assert.equal(s.press(key, {ctrlKey: true}).defaultPrevented, false);
  assert.equal(s.calls.length, 0);
  s.press('c', {ctrlKey: true, shiftKey: true});
  s.press('v', {ctrlKey: true, shiftKey: true});
  assert.deepEqual(s.calls.map(c => c[0]), ['copy-format','paste-format']);
});

test('modal/dialog focus disables shortcuts including save and Alt', () => {
  const s = setup({active: false});
  assert.equal(s.press('s', {ctrlKey: true}).defaultPrevented, false);
  assert.equal(s.press('Alt').defaultPrevented, false);
  assert.equal(s.press('Delete').defaultPrevented, false);
  assert.equal(s.calls.length, 0);
});

test('nudge steps and backwards selection are explicit payloads', () => {
  const s = setup();
  s.press('ArrowRight');
  s.press('ArrowDown', {shiftKey: true});
  s.press('ArrowLeft', {ctrlKey: true});
  s.press('Tab', {shiftKey: true});
  assert.deepEqual(s.calls, [
    ['nudge', {dx: 1, dy: 0}], ['nudge', {dx: 0, dy: 10}],
    ['nudge', {dx: -0.1, dy: 0}], ['cycle-selection', {direction: -1}],
  ]);
});

test('undo, redo, grouping and selection shortcuts match editor actions', () => {
  const s = setup();
  s.press('z', {ctrlKey: true});
  s.press('y', {ctrlKey: true});
  s.press('z', {metaKey: true, shiftKey: true});
  s.press('g', {ctrlKey: true});
  s.press('g', {ctrlKey: true, shiftKey: true});
  s.press('a', {ctrlKey: true});
  s.press('d', {ctrlKey: true});
  assert.deepEqual(s.calls.map(c => c[0]), ['undo','redo','redo','group','ungroup','select-all','duplicate']);
});

test('reset safely ends Key Tips when focus changes', () => {
  const s = setup();
  s.press('Alt'); s.press('5'); s.handler.reset(); s.press('l');
  assert.deepEqual(s.calls, [['line', undefined]]);
});

test('default editable detection recognizes the canvas text editor', () => {
  const calls = [];
  const handler = createShortcutHandler({execute: action => calls.push(action)});
  const event = {key: 'b', ctrlKey: true, target: {id: 'textEditor', tagName: 'TEXTAREA'}, preventDefault() {}};
  handler(event);
  assert.deepEqual(calls, ['bold']);
});

test('multiple Figure navigation and new Figure shortcuts reach the editor', () => {
  const s = setup();
  s.press('m', {ctrlKey: true});
  s.press('PageDown', {ctrlKey: true});
  s.press('PageUp', {ctrlKey: true});
  assert.deepEqual(s.calls.map(c => c[0]), ['new-figure','next-figure','previous-figure']);
});

test('Figure commands can commit canvas text but leave ordinary fields untouched', () => {
  const s = setup({editing: 'canvas-text'});
  s.press('m', {ctrlKey: true});
  s.press('PageDown', {ctrlKey: true});
  assert.deepEqual(s.calls.map(c => c[0]), ['new-figure','next-figure']);
  s.state.editing=true;
  assert.equal(s.press('m', {ctrlKey: true}).defaultPrevented,false);
  assert.equal(s.press('PageUp', {ctrlKey: true}).defaultPrevented,false);
  assert.equal(s.calls.length,2);
});

test('F1 and question mark both open shortcut help only in canvas scope', () => {
  const s = setup();
  assert.equal(s.press('F1').defaultPrevented,true);
  assert.equal(s.press('?', {shiftKey:true}).defaultPrevented,true);
  assert.deepEqual(s.calls.map(c=>c[0]),['help','help']);
  s.state.editing=true;
  assert.equal(s.press('?').defaultPrevented,false);
  s.state.editing=false;s.state.active=false;
  assert.equal(s.press('F1').defaultPrevented,false);
  assert.equal(s.calls.length,2);
});
