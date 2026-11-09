/**
 * Keyboard shortcuts for Figure Studio.
 *
 * Alt 3 / Alt 4 / Alt 5 / Alt 7 are the user's Quick Access Toolbar ordering, not
 * universal PowerPoint defaults. Both held-Alt and sequential Key Tips work.
 *
 * Clipboard shortcuts deliberately remain native. The editor should listen
 * for copy/cut/paste events so that image and text clipboard data stay usable.
 */
export const SHORTCUTS = Object.freeze([
  ['最前面へ', 'Alt → 3'],
  ['最背面へ', 'Alt → 4'],
  ['左／中央／右揃え', 'Alt → 5 → L / C / R'],
  ['上／中央／下揃え', 'Alt → 5 → T / M / B'],
  ['左右／上下に等間隔', 'Alt → 5 → H / V'],
  ['間隔を指定して配列', 'Alt → 5 → G'],
  ['右／左へ90度回転', 'Alt → 7 → R / L'],
  ['上下／左右反転', 'Alt → 7 → V / H'],
  ['保存／開く', 'Ctrl + S / O'],
  ['Figureを追加', 'Ctrl + M'],
  ['次／前のFigure', 'Ctrl + PageDown / PageUp'],
  ['元に戻す／やり直す', 'Ctrl + Z / Y'],
  ['コピー／切り取り／貼り付け', 'Ctrl + C / X / V'],
  ['複製', 'Ctrl + D'],
  ['グループ化／1階層解除', 'Ctrl + G / Ctrl + Shift + G'],
  ['選択したグループの全階層解除', 'Ctrl + Shift + A → G'],
  ['グループ内を個別選択', 'Ctrl + クリック（またはグループ選択後にもう一度クリック）'],
  ['グループ全体へ戻る', 'Esc'],
  ['文字を拡大／縮小', 'Ctrl + Shift + > / <'],
  ['文字を1 pt拡大／縮小', 'Ctrl + ] / ['],
  ['太字／斜体／下線', 'Ctrl + B / I / U'],
  ['文字の左／中央／右／両端揃え', 'Ctrl + L / E / R / J'],
  ['書式コピー／貼り付け', 'Ctrl + Shift + C / V'],
  ['移動／大きく移動／微調整', '矢印 / Shift + 矢印 / Ctrl + 矢印'],
  ['次／前のオブジェクトを選択', 'Tab / Shift + Tab'],
  ['文字を編集／確定', 'F2 / Ctrl + Enter'],
  ['選択／文字／線／矢印／四角／楕円', 'V / T / L / A / R / E'],
  ['ショートカット一覧', 'F1 / ?'],
]);

const ALIGN_KEYS = Object.freeze({
  l: 'align-left', c: 'align-center', r: 'align-right',
  t: 'align-top', m: 'align-middle', b: 'align-bottom',
  h: 'distribute-h', v: 'distribute-v', g: 'image-array',
});

const TOOL_KEYS = Object.freeze({
  v: 'select', t: 'text', l: 'line', a: 'arrow', r: 'rect', e: 'ellipse',
});
const ROTATE_KEYS = Object.freeze({r:'rotate-right',l:'rotate-left',v:'flip-v',h:'flip-h'});

const FORMAT_KEYS = Object.freeze({
  b: 'bold', i: 'italic', u: 'underline',
  l: 'text-left', e: 'text-center', r: 'text-right', j: 'text-justify',
});

const ALT_HINT = 'Alt: 3 最前面 · 4 最背面 · 5 配置 · 7 回転 · Esc 閉じる';
const ALIGN_HINT = '配置: L 左 · C 中央 · R 右 · T 上 · M 上下中央 · B 下 · H 左右等間隔 · V 上下等間隔 · G 間隔を指定して配列';
const ROTATE_HINT = '回転: R 右へ90度 · L 左へ90度 · V 上下反転 · H 左右反転 · Esc 閉じる';

export const keyboardPlatform=()=>globalThis.navigator?.userAgentData?.platform||globalThis.navigator?.platform||'';
export const isMacPlatform=(platform=keyboardPlatform())=>/mac|iphone|ipad|ipod/i.test(platform);
export function shortcutLabel(text,platform=keyboardPlatform()){
 if(!isMacPlatform(platform))return text;
 return text.replace(/Ctrl\s*\+\s*Y\b/gi,'⌘ + Shift + Z').replace(/\bCtrl\b/g,'⌘').replace(/\bAlt\b/g,'Option');
}
export function shortcutRows(platform=keyboardPlatform()){
 const mac=isMacPlatform(platform);
 return SHORTCUTS.map(([name,keys])=>[name,mac&&name==='元に戻す／やり直す'?'⌘ + Z / ⌘ + Shift + Z':mac&&name==='Figureを追加'?'Control + M':mac&&name==='移動／大きく移動／微調整'?'矢印 / Shift + 矢印 / Option + 矢印':shortcutLabel(keys,platform)]);
}

function defaultEditing(event) {
  const target = event?.target;
  if (!target) return false;
  if (target.id === 'textEditor') return 'canvas-text';
  return Boolean(target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName || ''));
}

function physicalKey(event){
 const code=String(event.code||'');
 if(/^Key[A-Z]$/.test(code))return code.slice(3).toLowerCase();
 if(/^Digit[0-9]$/.test(code))return code.slice(5);
 return '';
}
function normalizedKey(event,physicalOption=false) {
 if(physicalOption&&physicalKey(event))return physicalKey(event);
  const key = String(event.key || '').toLowerCase();
  if (key && key !== 'unidentified') return key;
  const code = String(event.code || '');
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return key;
}

/**
 * @param {{execute: Function, isEditing?: Function, isCanvasActive?: Function,
 * onHint?: Function}} options
 * @returns {Function & {reset: Function}}
 *
 * isEditing(event): false, true (ordinary form field), or 'canvas-text'.
 * isCanvasActive(event): true for canvas commands, 'ribbon' for global commands
 * with native control navigation, or false for modal/inactive surfaces.
 * onHint(text): show a Key Tip strip, or hide it when text is empty.
 */
export function createShortcutHandler({
  execute,
  isEditing = defaultEditing,
  isCanvasActive = () => true,
  onHint = () => {},
  supportsAction = () => true,
  platform = keyboardPlatform(),
} = {}) {
  if (typeof execute !== 'function') throw new TypeError('execute must be a function');
  let sequence = '';
  const mac=isMacPlatform(platform);

  const reset = () => {
    if (sequence) onHint('');
    sequence = '';
  };
  const consume = (event, action, payload) => {
    if(action&&!supportsAction(action,payload)){reset();return false;}
    event.preventDefault?.();
    event.stopPropagation?.();
    reset();
    if (action) execute(action, payload);
    return true;
  };

  const handler = (event) => {
    if (!event || event.defaultPrevented) return false;
    if (event.isComposing || event.keyCode === 229 || event.getModifierState?.('AltGraph')) {
      reset();
      return false;
    }
    const editing = isEditing(event);
    const canvasText = editing === 'canvas-text';
    const surface = isCanvasActive(event);
    const active = Boolean(surface), ribbon = surface === 'ribbon';
    const primary = Boolean(event.ctrlKey || event.metaKey);
    // Option produces characters such as ∞, © and ¬ on macOS. Only command
    // scopes use physical keys; text inputs, IME and AltGraph keep native input.
    const key = normalizedKey(event,mac&&event.altKey&&!editing&&!primary);

    // Modal dialogs and native form fields own their focus and navigation.
    if (!active) {
      reset();
      return false;
    }
    if (editing && !canvasText) {
      reset();
      if (primary && !event.altKey && !event.shiftKey && key === 's') return consume(event, 'save');
      return false;
    }

    if (key === 'escape') {
      if (sequence) return consume(event);
      return consume(event, ribbon ? 'focus-canvas' : 'escape');
    }

    if (editing && sequence === 'ungroup-all') reset();
    if (!editing && sequence === 'ungroup-all') {
      if (['control','shift','meta'].includes(key)) return false;
      if (event.repeat && primary && event.shiftKey && key === 'a') {event.preventDefault?.();event.stopPropagation?.();return true;}
      if (key === 'g' && !event.altKey) return consume(event,'ungroup-all');
      return consume(event);
    }
    if (!editing && primary && event.shiftKey && !event.altKey && key === 'a' && supportsAction('ungroup-all')) {
      event.preventDefault?.();event.stopPropagation?.();sequence='ungroup-all';
      onHint('全グループ解除：Gで選択したグループの全階層を解除 · Escで取消');
      return true;
    }

    if(mac&&event.altKey&&!primary&&!editing&&!['align','rotate'].includes(sequence)&&/^arrow(left|right|up|down)$/.test(key)){
      if(ribbon){reset();return false;}
      const steps={arrowleft:[-.1,0],arrowright:[.1,0],arrowup:[0,-.1],arrowdown:[0,.1]};
      const [dx,dy]=steps[key];return consume(event,'nudge',{dx,dy});
    }

    // Key Tips never interfere with text composition/caret navigation.
    if (!editing && !primary) {
      if (key === 'alt') {
        event.preventDefault?.();
        event.stopPropagation?.();
        if (event.repeat) return true;
        if (sequence) reset();
        else { sequence = 'root'; onHint(shortcutLabel(ALT_HINT,platform)); }
        return true;
      }
      if (sequence || event.altKey) {
        // Held Alt also works without a prior Alt keydown.
        const phase = sequence || 'root';
        if (phase === 'root' && key === '3') return consume(event, 'front');
        if (phase === 'root' && key === '4') return consume(event, 'back');
        if (phase === 'root' && ['5','7'].includes(key)) {
          event.preventDefault?.();
          event.stopPropagation?.();
          sequence = key==='5'?'align':'rotate';
          onHint(sequence==='align'?ALIGN_HINT:ROTATE_HINT);
          return true;
        }
        if (phase === 'align' && ALIGN_KEYS[key]) return consume(event, ALIGN_KEYS[key]);
        if (phase === 'rotate' && ROTATE_KEYS[key]) return consume(event, ROTATE_KEYS[key]);
        // An unknown sequence is consumed instead of unexpectedly changing tool.
        return consume(event);
      }
    }

    if (primary && !event.altKey) {
      if (!event.shiftKey && key === 's') return consume(event, 'save');
      if (!event.shiftKey && key === 'm') return consume(event, 'new-figure');
      if (!event.shiftKey && key === 'pagedown') return consume(event, 'next-figure');
      if (!event.shiftKey && key === 'pageup') return consume(event, 'previous-figure');
      if (canvasText && key === 'enter') return consume(event, 'commit-text');
      if (event.shiftKey && (key === '>' || key === '.' || event.code === 'Period')) return consume(event, 'font-grow');
      if (event.shiftKey && (key === '<' || key === ',' || event.code === 'Comma')) return consume(event, 'font-shrink');
      if (!event.shiftKey && (key === ']' || event.code === 'BracketRight')) return consume(event, 'font-up');
      if (!event.shiftKey && (key === '[' || event.code === 'BracketLeft')) return consume(event, 'font-down');
      if (!event.shiftKey && FORMAT_KEYS[key]) return consume(event, FORMAT_KEYS[key]);

      // Native text editing retains selection, clipboard and undo behavior.
      if (editing) return false;

      if (event.shiftKey && key === 'c') return consume(event, 'copy-format');
      if (event.shiftKey && key === 'v') return consume(event, 'paste-format');
      if (key === 'z') return consume(event, event.shiftKey ? 'redo' : 'undo');
      if (!event.shiftKey && key === 'y') return consume(event, 'redo');
      if (key === 'g') return consume(event, event.shiftKey ? 'ungroup' : 'group');
      if (!event.shiftKey && key === 'd') return consume(event, 'duplicate');
      if (!event.shiftKey && key === 'a') return consume(event, 'select-all');
      if (!event.shiftKey && key === 'o') return consume(event, 'open');
      // Ctrl/Cmd+C, X, V reach the browser's ClipboardEvent handlers.
      if (['c', 'x', 'v'].includes(key)) return false;
    }

    // Ribbon tabs/buttons own navigation and activation; only global commands
    // above, Key Tips and F1 cross from their focus into the canvas.
    if (ribbon) {
      if (!primary && !event.altKey && key === 'f1') return consume(event, 'help');
      return false;
    }
    if (editing || event.altKey || event.metaKey) return false;
    const arrows = {
      arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1],
    };
    if (arrows[key]) {
      const step = event.ctrlKey ? 0.1 : event.shiftKey ? 10 : 1;
      return consume(event, 'nudge', {dx: arrows[key][0] * step, dy: arrows[key][1] * step});
    }
    if (primary) return false;
    if (key === 'delete' || key === 'backspace') return consume(event, 'delete');
    if (key === 'tab') return consume(event, 'cycle-selection', {direction: event.shiftKey ? -1 : 1});
    if (key === 'f2' || key === 'enter') return consume(event, 'edit-text');
    if (key === 'f1' || key === '?') return consume(event, 'help');
    if (!event.shiftKey && TOOL_KEYS[key]) return consume(event, TOOL_KEYS[key]);
    return false;
  };
  handler.reset = reset;
  return handler;
}
