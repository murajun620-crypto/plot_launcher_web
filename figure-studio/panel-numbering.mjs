// Numbering matches MiFiTo: alphabet, branches, Roman numerals and custom labels.
export function sequenceLabel(index, mode, start = 1, prefix = '', uppercase = false) {
  if (!Number.isSafeInteger(index) || index < 0 || !Number.isSafeInteger(start) || start < 1) throw new Error('連番が不正です。');
  if (mode === 'number') return `${prefix}${start + index}`;
  if (mode === 'roman') {
    let value = start + index, result = '';
    for (const [n, letters] of [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']]) while (value >= n) { result += letters; value -= n; }
    return prefix + (uppercase ? result : result.toLowerCase());
  }
  let value = start + index, label = '';
  while (value > 0) { value--; label = String.fromCharCode(97 + value % 26) + label; value = Math.floor(value / 26); }
  return prefix + (uppercase ? label.toUpperCase() : label);
}

// Mirrors SectionSettingsDialog.panel_numbering_settings in the Python app.
export function panelNumbering(preset, values = {}) {
  const defaults = { mode:'alphabet', start:1, startLetter:'a', prefix:'', separator:'', uppercase:false, parentheses:true };
  if (preset === 'alpha') return defaults;
  if (preset === 'none') return { ...defaults, mode:'none' };
  if (!['branch-number','branch-roman','number','custom'].includes(preset)) throw new Error('ラベル種別が不正です。');
  const start = values.start ?? 1;
  if (!Number.isSafeInteger(start) || start < 1 || start > 9999) throw new Error('開始番号は1〜9,999の整数にしてください。');
  if (preset === 'custom') {
    const mode = values.mode ?? 'alphabet';
    if (!['alphabet','number','roman'].includes(mode)) throw new Error('ラベルの連番形式が不正です。');
    return { ...defaults, mode, start, startLetter:values.startLetter?.trim() || 'a', prefix:values.prefix ?? '', separator:values.separator ?? '-', uppercase:!!values.uppercase, parentheses:values.parentheses ?? true };
  }
  return { ...defaults, mode:preset==='branch-roman'?'roman':'number', start, prefix:preset==='number'?'':values.parent?.trim() || 'a', separator:preset==='number'?'':'-' };
}

export function numberedLabel(index, settings) {
  if (settings.mode === 'none') return '';
  // Python uses the first letter and falls back to a for non-Latin input.
  const letter = (settings.startLetter || 'a')[0].toLowerCase(), letterStart = /^[a-z]$/.test(letter) ? letter.charCodeAt(0)-96 : 1;
  const start = settings.mode === 'alphabet' ? letterStart : settings.start;
  const prefix = (settings.prefix || '') + (settings.prefix ? settings.separator ?? '' : '');
  const text = sequenceLabel(index, settings.mode, start, prefix, settings.uppercase);
  return settings.parentheses ? `(${text})` : text;
}

