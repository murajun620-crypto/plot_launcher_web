import test from 'node:test';
import assert from 'node:assert/strict';
import {createShortcutHandler,isMacPlatform,shortcutLabel,shortcutRows} from '../shortcuts.mjs';

function setup({editing = false, active = true,platform} = {}) {
  const calls = [], hints = [];
  const state = {editing, active};
  const handler = createShortcutHandler({
    execute: (action, payload) => calls.push([action, payload]),
    isEditing: () => state.editing,
    isCanvasActive: () => state.active,
    onHint: text => hints.push(text),
    ...(platform===undefined?{}:{platform}),
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

test('Alt 7 R/L/V/H supports sequential and held keys from canvas and ribbon without changing tool',()=>{
 for(const active of [true,'ribbon'])for(const held of [false,true]){
  const s=setup({active});
  for(const [key,action]of Object.entries({r:'rotate-right',l:'rotate-left',v:'flip-v',h:'flip-h'})){
   s.press('Alt');s.press('7',{altKey:held});const event=s.press(key,{altKey:held});
   assert.equal(event.defaultPrevented,true);assert.equal(event.stopped,true);assert.equal(s.calls.at(-1)[0],action);assert.equal(s.hints.at(-1),'');
  }
  assert.equal(s.calls.length,4);assert.ok(s.hints.some(hint=>hint.includes('7 回転')));assert.ok(s.hints.some(hint=>hint.includes('V 上下反転')));
 }
 const direct=setup();direct.press('7',{altKey:true});direct.press('R',{altKey:true});assert.deepEqual(direct.calls,[['rotate-right',undefined]]);
});

test('Mac Option 7 maps generated characters to physical R/L/V/H and localizes help',()=>{
 const s=setup({platform:'MacIntel'});
 for(const [code,key,action]of [['KeyR','®','rotate-right'],['KeyL','¬','rotate-left'],['KeyV','√','flip-v'],['KeyH','˙','flip-h']]){
  s.press('¶',{altKey:true,code:'Digit7'});s.press(key,{altKey:true,code});assert.equal(s.calls.at(-1)[0],action);
 }
 assert.match(new Map(shortcutRows('MacIntel')).get('上下／左右反転'),/Option → 7/);
});

test('rotation sequences cancel safely and never alter text, native inputs, dialogs, IME or AltGraph',()=>{
 const s=setup();s.press('Alt');s.press('7');s.press('Escape');assert.equal(s.calls.length,0);s.press('r');assert.equal(s.calls.at(-1)[0],'rect');
 s.press('Alt');s.press('7');s.press('x');assert.equal(s.calls.length,1);assert.equal(s.hints.at(-1),'');
 for(const state of [{editing:true},{editing:'canvas-text'},{active:false}]){
  const input=setup(state);for(const key of ['Alt','7','r','l','v','h'])assert.equal(input.press(key,{altKey:true}).defaultPrevented,false);
  assert.equal(input.calls.length,0);
 }
 for(const event of [{isComposing:true},{keyCode:229},{getModifierState:key=>key==='AltGraph'}]){
  const input=setup();input.press('Alt');input.press('7');assert.equal(input.press('r',event).defaultPrevented,false);assert.equal(input.calls.length,0);
 }
});

test('Mac Option sequences accept both released keys and characters generated while held',()=>{
 const s=setup({platform:'MacIntel'});
 s.press('Alt',{altKey:true,code:'AltLeft'});s.press('5',{code:'Digit5'});s.press('g',{code:'KeyG'});
 s.press('∞',{altKey:true,code:'Digit5'});s.press('©',{altKey:true,code:'KeyG'});
 s.press('£',{altKey:true,code:'Digit3'});s.press('¢',{altKey:true,code:'Digit4'});
 assert.deepEqual(s.calls.map(c=>c[0]),['image-array','image-array','front','back']);assert.match(s.hints[0],/Option/);
});

test('Mac held Option aligns with physical keys despite non-ASCII event keys',()=>{
 const s=setup({platform:'macOS',active:'ribbon'});
 for(const [code,char] of [['KeyL','¬'],['KeyC','ç'],['KeyR','®'],['KeyT','†'],['KeyM','µ'],['KeyB','∫'],['KeyH','˙'],['KeyV','√']]){s.press('∞',{altKey:true,code:'Digit5'});s.press(char,{altKey:true,code});}
 assert.deepEqual(s.calls.map(c=>c[0]),['align-left','align-center','align-right','align-top','align-middle','align-bottom','distribute-h','distribute-v']);
});

test('Mac Option text entry, IME, AltGraph and open dialogs remain native',()=>{
 for(const options of [{editing:true},{editing:'canvas-text'},{active:false}]){
  const s=setup({platform:'MacIntel',...options});for(const [key,code] of [['∞','Digit5'],['©','KeyG'],['¬','KeyL']])assert.equal(s.press(key,{altKey:true,code}).defaultPrevented,false);
  assert.equal(s.calls.length,0);
 }
 const s=setup({platform:'MacIntel'});s.press('Alt');s.press('5');
 assert.equal(s.press('©',{altKey:true,code:'KeyG',isComposing:true}).defaultPrevented,false);
 assert.equal(s.press('©',{altKey:true,code:'KeyG',getModifierState:key=>key==='AltGraph'}).defaultPrevented,false);assert.equal(s.calls.length,0);
});

test('Mac Option arrows make fine canvas movements and preserve ribbon navigation',()=>{
 const s=setup({platform:'MacIntel'});s.press('Alt',{altKey:true});s.press('ArrowRight',{altKey:true});s.press('ArrowDown',{altKey:true});
 assert.deepEqual(s.calls,[['nudge',{dx:.1,dy:0}],['nudge',{dx:0,dy:.1}]]);
 const r=setup({platform:'MacIntel',active:'ribbon'});r.press('Alt',{altKey:true});assert.equal(r.press('ArrowLeft',{altKey:true}).defaultPrevented,false);assert.equal(r.calls.length,0);
});

test('Mac Command edit commands work while Command clipboard and text undo remain native',()=>{
 const s=setup({platform:'MacIntel'});
 for(const key of ['c','x','v'])assert.equal(s.press(key,{metaKey:true}).defaultPrevented,false);
 s.press('z',{metaKey:true});s.press('z',{metaKey:true,shiftKey:true});s.press('g',{metaKey:true});s.press('g',{metaKey:true,shiftKey:true});s.press('s',{metaKey:true});s.press('o',{metaKey:true});
 assert.deepEqual(s.calls.map(c=>c[0]),['undo','redo','group','ungroup','save','open']);
 const text=setup({platform:'MacIntel',editing:'canvas-text'});assert.equal(text.press('z',{metaKey:true}).defaultPrevented,false);text.press('b',{metaKey:true});text.press('Enter',{metaKey:true});assert.deepEqual(text.calls.map(c=>c[0]),['bold','commit-text']);
});

test('Windows AltGraph is not remapped to Mac Option commands',()=>{
 const s=setup({platform:'Win32'});s.press('∞',{altKey:true,code:'Digit5'});s.press('©',{altKey:true,code:'KeyG'});assert.equal(s.calls.length,0);
 assert.equal(shortcutLabel('Ctrl+S · Alt → 5 → G','Win32'),'Ctrl+S · Alt → 5 → G');
});

test('Mac shortcut help uses Command, Option, native redo and Control M',()=>{
 assert.equal(isMacPlatform('MacIntel'),true);assert.equal(isMacPlatform('macOS'),true);assert.equal(isMacPlatform('Win32'),false);
 assert.equal(shortcutLabel('保存 (Ctrl+S) · Alt → 5 → G','MacIntel'),'保存 (⌘+S) · Option → 5 → G');
 const rows=new Map(shortcutRows('MacIntel'));assert.equal(rows.get('間隔を指定して配列'),'Option → 5 → G');assert.equal(rows.get('Figureを追加'),'Control + M');assert.equal(rows.get('元に戻す／やり直す'),'⌘ + Z / ⌘ + Shift + Z');assert.match(rows.get('移動／大きく移動／微調整'),/Option/);
 assert.equal(new Map(shortcutRows('Win32')).get('Figureを追加'),'Ctrl + M');
});

test('held Alt+5 then L and direct Alt+3/Alt+4 work', () => {
  const s = setup();
  s.press('5', {altKey: true}); s.press('L', {altKey: true});
  s.press('3', {altKey: true}); s.press('4', {altKey: true});
  assert.deepEqual(s.calls.map(c => c[0]), ['align-left', 'front', 'back']);
});

test('image spacing uses Alt 5 G and leaves an open modal in control',()=>{
 const s=setup();s.press('Alt');s.press('5');s.press('g');
 assert.deepEqual(s.calls.map(c=>c[0]),['image-array']);
 s.press('5',{altKey:true});s.press('G',{altKey:true});
 assert.deepEqual(s.calls.map(c=>c[0]),['image-array','image-array']);
 s.state.active=false;
 for(const key of ['Escape','Enter','Delete','g'])assert.equal(s.press(key).defaultPrevented,false);
 assert.equal(s.calls.length,2);
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

test('ribbon scope accepts Ctrl and Cmd file, edit, Figure and formatting commands', () => {
  const commands=[
    ['s',{},'save'],['o',{},'open'],['m',{},'new-figure'],
    ['PageDown',{},'next-figure'],['PageUp',{},'previous-figure'],
    ['z',{},'undo'],['y',{},'redo'],['z',{shiftKey:true},'redo'],
    ['d',{},'duplicate'],['a',{},'select-all'],['g',{},'group'],['g',{shiftKey:true},'ungroup'],
    ['b',{},'bold'],['i',{},'italic'],['u',{},'underline'],
    ['l',{},'text-left'],['e',{},'text-center'],['r',{},'text-right'],['j',{},'text-justify'],
    ['>',{shiftKey:true},'font-grow'],['<',{shiftKey:true},'font-shrink'],[']',{},'font-up'],['[',{},'font-down'],
    ['c',{shiftKey:true},'copy-format'],['v',{shiftKey:true},'paste-format'],
  ];
  for(const modifier of ['ctrlKey','metaKey']){
    const s=setup({active:'ribbon'});
    for(const [key,options,action]of commands){
      const event=s.press(key,{[modifier]:true,...options});
      assert.equal(event.defaultPrevented,true,`${modifier} ${key}`);assert.equal(event.stopped,true);assert.equal(s.calls.at(-1)[0],action);
    }
    assert.equal(s.calls.length,commands.length);
  }
});

test('ribbon buttons retain native navigation, activation, deletion and ordinary tool letters',()=>{
  const s=setup({active:'ribbon'});
  for(const key of ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Tab','Delete','Backspace','Enter',' ','Home','End','F2','v','t','l','a','r','e','?']){
    for(const options of [{},{shiftKey:true},{ctrlKey:key.startsWith('Arrow')||key==='Enter'}]){
      const event=s.press(key,options);assert.equal(event.defaultPrevented,false,`${key} ${JSON.stringify(options)}`);assert.equal(event.stopped,false);
    }
  }
  for(const key of ['c','x','v'])assert.equal(s.press(key,{ctrlKey:true}).defaultPrevented,false);
  assert.equal(s.calls.length,0);
});

test('ribbon Key Tips keep Alt ordering and Escape returns focus without clearing selection',()=>{
  const s=setup({active:'ribbon'});
  s.press('3',{altKey:true});s.press('4',{altKey:true});
  for(const key of ['l','c','r','t','m','b','h','v']){s.press('Alt');s.press('5');s.press(key);}
  assert.deepEqual(s.calls.map(c=>c[0]),['front','back','align-left','align-center','align-right','align-top','align-middle','align-bottom','distribute-h','distribute-v']);
  s.press('Alt');s.press('5');s.press('Escape');assert.equal(s.calls.length,10);
  s.press('Escape');assert.equal(s.calls.at(-1)[0],'focus-canvas');
  s.press('F1');assert.equal(s.calls.at(-1)[0],'help');
  const count=s.calls.length;assert.equal(s.press('Escape',{defaultPrevented:true}).result,false);assert.equal(s.calls.length,count);
});

test('ordinary inputs and selects in the ribbon retain all native keys except save',()=>{
  const s=setup({active:'ribbon',editing:true});
  for(const [key,options]of [['a',{ctrlKey:true}],['z',{ctrlKey:true}],['b',{ctrlKey:true}],['o',{ctrlKey:true}],['l',{ctrlKey:true}],['>',{ctrlKey:true,shiftKey:true}],['ArrowDown',{}],['Enter',{}],['Escape',{}],['Delete',{}],['Tab',{}],['Alt',{}],['F1',{}]])assert.equal(s.press(key,options).defaultPrevented,false,key);
  assert.equal(s.calls.length,0);
  assert.equal(s.press('s',{ctrlKey:true}).defaultPrevented,true);assert.equal(s.press('s',{metaKey:true}).defaultPrevented,true);
  assert.deepEqual(s.calls.map(c=>c[0]),['save','save']);
});

test('ribbon IME and AltGraph never trigger commands and reset pending Key Tips',()=>{
  const s=setup({active:'ribbon'});s.press('Alt');s.press('5');
  assert.equal(s.press('l',{isComposing:true}).defaultPrevented,false);assert.equal(s.hints.at(-1),'');
  assert.equal(s.press('s',{ctrlKey:true,keyCode:229}).defaultPrevented,false);
  assert.equal(s.press('l',{altKey:true,ctrlKey:true,getModifierState:key=>key==='AltGraph'}).defaultPrevented,false);
  assert.equal(s.press('l').defaultPrevented,false);assert.equal(s.calls.length,0);
});
