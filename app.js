import { compactHelp, documentSaver, filePickerOptions } from "./ui-common.js?v=e51daecc14b3";
import { parsePastedTable, pastedTableCSV } from "./data-paste.js?v=e51daecc14b3";
import { configForSheet, sheetFileStem, zipFiles } from "./sheets.js?v=e51daecc14b3";
import { APP_VERSION, COLORS, COLOR_PALETTE, makeProject, parseProject, PROJECT_MAX_SIZE, applyPreset, createSeries, initialSeries, defaultAxes, makeSettings, restoreSettings, safeStem, sampleCSV, zoomAt, shiftCoordinate, snapPoint } from "./state.js?v=e51daecc14b3";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escapeHTML = text => String(text).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
const MICRO_HINT = 'μは \\micro と入力できます（例：\\microm、\\microA）。';
let worker, engineReady = false, requestID = 0;
const requests = new Map();
let metadata = null, config = { axes: defaultAxes(), series: [] };
let loading = false, exporting = false, sample = false, loadedHeader = 1;
let revision = 0, renderedRevision = -1, renderRunning = false, renderWanted = false, renderTimer;
let previewURL, figureResult, dragging;
let colorTarget;
const recentColors = [];
let sourceData = null;
let sourceHandle = null, sourceDirectory = null, saveDirectory = null;
const sourceHandles = new WeakMap();
const folderSupported = typeof window.showDirectoryPicker === 'function';
const importedFonts = new Map();
let savedProjectState = null;
let sheetSettings = new Map(), cancelBatch = false;
let sheetMode = 'shared', sharedSettings = null;
$('#app-version').textContent = `v${APP_VERSION}`;

function projectSheetSettings() {
  const sheets = new Map(sheetSettings);
  if (metadata && config.series.length) {
    const current = makeSettings(config, metadata, loadedHeader);
    sheets.set(metadata.sheetIndex, current);
  }
  return [...sheets].sort(([a],[b])=>a-b).map(([sheetIndex,settings])=>({sheetIndex,settings}));
}

function currentSharedSettings() {
  if (!metadata || !config.series.length) return sharedSettings;
  const current = makeSettings(config, metadata, loadedHeader), baseline = sheetSettings.get(metadata.sheetIndex);
  const graph = settings => JSON.stringify(settings && {plotType:settings.plotType, options:settings.options, axes:settings.axes, series:settings.series, annotations:settings.annotations});
  // Do not rebase column positions merely because a reordered sheet was viewed.
  return !sharedSettings || graph(current) !== graph(baseline) ? current : sharedSettings;
}

function setSheetMode(mode) {
  if (!['shared','individual'].includes(mode) || mode === sheetMode || loading || exporting || !metadata) return;
  const sheets = new Map(projectSheetSettings().map(item=>[item.sheetIndex,item.settings]));
  if (mode === 'shared') {
    sharedSettings = config.series.length ? makeSettings(config,metadata,loadedHeader) : sharedSettings || sheets.get(0) || sheets.values().next().value || null;
  } else {
    sharedSettings = currentSharedSettings();
    // Freeze the shared appearance as the starting point of individual edits.
    // Each sheet keeps its own header row and resolves columns when opened.
    if (sharedSettings) for (const [index,settings] of sheets) if (index !== metadata.sheetIndex) {
      const inherited = {...settings, inheritSharedSettings:true};
      delete inherited.inheritFirstSheet;
      sheets.set(index,inherited);
    }
  }
  sheetSettings = sheets; sheetMode = mode; updateButtons();
  status(mode === 'shared' ? '一括設定：表示中のグラフ設定を全シートに適用します。' : '個別設定：シートごとにグラフ設定を変更できます。','ready');
}

function projectEditState() {
  // Retained data/font objects are immutable; compare references rather than
  // encoding large files each time the browser asks whether it may leave.
  // Zoom, pan, selection and expanded sections only change the viewing state.
  return {source:sourceData, fonts:[...importedFonts.values()], content:JSON.stringify({
    settings:metadata ? makeSettings(config,metadata,loadedHeader) : config,
    sheetIndex:metadata?.sheetIndex, sample, sheetSettings:projectSheetSettings(),
    sheetMode, sharedSettings:sheetMode === 'shared' ? currentSharedSettings() : sharedSettings,
    saveName:$('#save-name').value, pngDpi:Number($('#png-dpi').value)
  })};
}

function hasUnsavedChanges() {
  if (!sourceData && !importedFonts.size) return false;
  const current = projectEditState(), saved = savedProjectState;
  return !saved || current.source !== saved.source || current.content !== saved.content ||
    current.fonts.length !== saved.fonts.length || current.fonts.some((font,index)=>font !== saved.fonts[index]);
}

window.addEventListener('beforeunload', event => {
  if (!hasUnsavedChanges()) return;
  event.preventDefault();
  event.returnValue = '';
});
let presets = [], selected = new Set(), clipboard = [], view = {zoom:1,x:0,y:0}, panning;
let history = [], future = [], lastState, restoring = false;
const catalogReady = fetch(new URL("./presets.json" + new URL(import.meta.url).search, import.meta.url)).then(response => {if(!response.ok) throw new Error("プリセットの読み込みに失敗しました"); return response.json();}).then(items => {
  presets = items; $("#plot-type").replaceChildren(...items.map(item => new Option(item.label,item.id)));
});
catalogReady.catch(error => fatal(error.message));
const loadedFonts = new Set(["Liberation Sans", "Noto Sans JP", "DejaVu Sans"]);

function desktopAppearance() {
  const numeric = (key, label, min = 0, max = 3, step = 0.1) => `<label>${label}<input data-axis="${key}" type="number" min="${min}" max="${max}" step="any"></label>`;
  const check = (key, label) => `<label><input data-axis="${key}" type="checkbox">${label}</label>`;
  $("#desktop-appearance").innerHTML = `
    <label class="full-field">図のフォント<select id="font-family" data-axis="fontFamily"><option>Liberation Sans</option><option>Noto Sans JP</option><option>DejaVu Sans</option></select></label>
    <label class="full-field">日本語フォント<select id="japanese-font-family" data-axis="japaneseFontFamily"><option>Noto Sans JP</option><option>Liberation Sans</option><option>DejaVu Sans</option></select></label>
    <button type="button" id="load-font" class="button quiet">手元のフォントを読み込む</button><input id="font-file" type="file" accept=".ttf,.otf,.ttc" multiple hidden>
    <p class="field-hint">Arialを使う場合は、手元のフォントを読み込んでください。標準のLiberation SansはArialと文字幅が互換です。日本語はNoto Sans JP、数式はSTIX Sansを使います。</p>
    <div class="field-grid">${numeric("tickFontScale", "目盛り文字倍率", .2)}${numeric("labelFontScale", "軸ラベル倍率", .2)}${numeric("spineScale", "枠線倍率", .1, 5)}${numeric("dataLineScale", "データ線倍率", 0, 6)}${numeric("tickLength", "目盛り長さ倍率", 0, 5)}</div>
    <p class="field-hint">倍率1：目盛り7 pt、軸ラベル8 pt、枠線0.8 pt、主目盛り2.5 pt・副目盛り1.25 pt。</p>
    <details><summary>余白・軸の表示</summary>
    <div class="field-grid">${numeric("xLabelPad", "Xラベル追加余白 (pt)", -100, 100)}${numeric("yLabelPad", "Yラベル追加余白 (pt)", -100, 100)}${numeric("xTickPad", "X目盛り追加余白 (pt)", -100, 100)}${numeric("yTickPad", "Y目盛り追加余白 (pt)", -100, 100)}</div>
    <div class="check-options">${check("hideXLabel", "Xラベルを隠す")}${check("hideYLabel", "Yラベルを隠す")}${check("hideXTickLabels", "X目盛り文字を隠す")}${check("hideYTickLabels", "Y目盛り文字を隠す")}${check("hideXTicks", "X目盛り線を隠す")}${check("hideYTicks", "Y目盛り線を隠す")}${check("spineLeft", "左枠")}${check("spineRight", "右枠")}${check("spineTop", "上枠")}${check("spineBottom", "下枠")}${check("yAxisRight", "Y軸を右側")}${check("xAxisTop", "X軸を上側")}</div></details>
    <details><summary>背景・誤差棒</summary>
    <div class="check-options"><label><input id="background-enabled" data-axis="transparent" data-invert="true" type="checkbox">図全体の背景色を使用</label></div>
    <div class="field-grid"><label>枠線色<input data-axis="spineColor" type="color"></label><label>図全体の背景色<input data-axis="backgroundColor" type="color"></label>${numeric("backgroundAlpha", "図全体の背景不透明度", 0, 1)}</div><div class="check-options">${check("plotBackgroundEnabled", "枠内の背景色を使用")}</div><div class="field-grid"><label>枠内の背景色<input data-axis="plotBackgroundColor" type="color"></label>${numeric("plotBackgroundAlpha", "枠内の背景不透明度", 0, 1)}</div><div class="field-grid">${numeric("markerEdgeWidth", "マーカー縁幅 (pt)", 0, 20)}${numeric("errorLineWidth", "誤差棒幅 (pt)", 0, 20)}${numeric("errorCapSize", "誤差キャップ (pt)", 0, 20)}${numeric("errorCapThick", "キャップ幅 (pt)", 0, 20)}</div></details>`;
  $("#legend-appearance").innerHTML = `${numeric("legendScale", "凡例サイズ倍率", .2)}${numeric("legendFontScale", "凡例文字倍率", .2)}${numeric("legendX", "凡例X (軸比率)", -10, 10, .01)}${numeric("legendY", "凡例Y (軸比率)", -10, 10, .01)}`;
}
desktopAppearance();
compactHelp();

function status(text, kind = "working") {
  $("#status-text").textContent = text;
  $("#status").dataset.kind = kind;
  if ($("#save-dialog").open) {$("#save-progress").textContent = text; $("#save-progress").dataset.kind = kind;}
}

function updateButtons() {
  compactHelp();
  const busy = loading || exporting;
  $("#new-project").disabled = busy;
  $("#open-project").disabled = !engineReady || busy;
  $("#save-project").disabled = !engineReady || busy || !sourceData || !metadata || !config.series.length;
  $("#drop-zone").disabled = !engineReady || busy;
  $("#data-drop-area").setAttribute("aria-disabled", String(!engineReady || busy));
  $("#sample-data").disabled = !engineReady || busy;
  $("#paste-data").disabled = !engineReady || busy;
  $("#plot-fields").disabled = !engineReady || !metadata || busy;
  $("#header-row").disabled = !engineReady || !metadata || busy;
  $("#sheet-select").disabled = !engineReady || !metadata || busy || metadata.sheets.length < 2;
  const multipleSheets = (metadata?.sheets.length ?? 0) > 1;
  for (const mode of ['shared','individual']) {
    $(`#sheet-mode-${mode}`).checked = sheetMode === mode;
    $(`#sheet-mode-${mode}`).disabled = !engineReady || busy || !multipleSheets;
  }
  $('#sheet-navigation').hidden = $('#open-save-all').hidden = $('#save-all-sheets-field').hidden = !multipleSheets;
  $('#previous-sheet').disabled = !engineReady || busy || !multipleSheets || metadata.sheetIndex <= 0;
  $('#next-sheet').disabled = !engineReady || busy || !multipleSheets || metadata.sheetIndex >= metadata.sheets.length - 1;
  $('#open-save-all').disabled = !engineReady || busy || !multipleSheets || renderRunning;
  $('#save-all-sheets').disabled = busy || !multipleSheets;
  if (!multipleSheets) $('#save-all-sheets').checked = false;
  if (metadata) {
    $('#preview-sheet-name').textContent = `${metadata.sheetIndex + 1} / ${metadata.sheets.length} · ${metadata.sheets[metadata.sheetIndex]}`;
    $('#preview-sheet-name').title = metadata.sheets[metadata.sheetIndex];
  }
  $("#open-settings").disabled = !metadata || busy;
  $("#save-settings").disabled = !metadata || busy || config.series.length === 0;
  $("#refresh-preview").disabled = !metadata || busy;
  $("#add-series").disabled = config.series.length >= 32 || (metadata?.columns.length ?? 0) < 2;
  $("#load-font").disabled = !engineReady || busy;
  const canSave = engineReady && !busy && !renderRunning && (renderedRevision === revision || multipleSheets && $('#save-all-sheets').checked);
  $$('[data-export]').forEach(button => { button.disabled = !canSave; });
  $("#open-save").disabled = !engineReady || busy || renderedRevision !== revision || renderRunning;
  $("#confirm-save").disabled = !canSave;
  for (const id of ["#save-name", "#png-dpi", "#save-destination", "#choose-save-folder", "#close-save"]) $(id).disabled = busy;
  $("#copy-image").disabled = !engineReady || busy || renderedRevision !== revision || renderRunning;
  $("#figure-stage").setAttribute("aria-busy", String(loading || exporting || renderRunning || !engineReady));
  $('#save-destination').disabled = $('#choose-save-folder').disabled = busy;
  syncColorIcons();
}

function request(operation, args) {
  return new Promise((resolve, reject) => {
    const id = ++requestID;
    requests.set(id, { resolve, reject });
    worker.postMessage({ id, operation, args }, [args.bytes, ...(args.fonts || []).map(font => font.bytes)].filter(Boolean));
  });
}

function fatal(message) {
  engineReady = false;
  worker?.terminate();
  requests.forEach(({ reject }) => reject(new Error(message)));
  requests.clear();
  status(message, "error");
  $("#retry-engine").hidden = false;
  $("#initial-message .spinner").hidden = true;
  $("#initial-message strong").textContent = "描画機能を読み込めませんでした";
  $("#initial-message p").textContent = "接続を確認して「再読み込み」を押してください。";
  updateButtons();
}

function startWorker() {
  worker = new Worker(new URL("./worker.js?v=e51daecc14b3", import.meta.url), { type: "module" });
  worker.onmessage = async ({ data }) => {
    if (data.type === "progress") status(data.text);
    else if (data.type === "ready") {
      await catalogReady;
      engineReady = true;
      updateButtons();
      $("#initial-message .spinner").hidden = true;
      $("#initial-message strong").textContent = "データを選んでください";
      $("#initial-message p").textContent = "Excel / CSVを読み込むか、「サンプルデータを使う」を押してください。";
      $("#preview-state").textContent = "データ未選択";
      status("Excel / CSVファイルを選んでください。", "ready");
      await openGalleryProject();
    } else if (data.type === "fatal") {
      console.error(data.detail);
      fatal(data.error);
    } else {
      const pending = requests.get(data.id);
      if (!pending) return;
      requests.delete(data.id);
      if (data.type === "error") pending.reject(new Error(data.error));
      else pending.resolve(data.result);
    }
  };
  worker.onerror = event => fatal(`描画処理が停止しました。再読み込みしてください。${event.message || ""}`);
}

function columnOptions(selected, optional = false) {
  return `${optional ? '<option value="">なし</option>' : ""}${metadata.columns.map(column => `<option value="${column.index}"${String(selected) === String(column.index) ? " selected" : ""}>${escapeHTML(column.name)}</option>`).join("")}`;
}

function choiceOptions(choices, selected) {
  return choices.map(([value, label]) => `<option value="${escapeHTML(value)}"${value === selected ? " selected" : ""}>${escapeHTML(label)}</option>`).join("");
}

function enhanceColorInputs() {
  for (const input of $$('input[type="color"],input[data-axis$="Color"],input[data-series-field$="Color"],input[data-option$="Color"]')) {
    if (input.closest('#color-panel') || input.dataset.paletteEnhanced) continue;
    input.dataset.paletteEnhanced = 'true';
    const title = input.getAttribute('aria-label') || input.closest('label')?.childNodes[0]?.textContent?.trim() || '色';
    const wrapper = document.createElement('span'); wrapper.className = 'color-control';
    input.before(wrapper); wrapper.append(input);
    if (input.type === 'color') input.hidden = true;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'color-icon';
    button.setAttribute('aria-label', `${title}を選ぶ`); button.setAttribute('aria-haspopup','dialog');
    button.addEventListener('click', () => openColorPanel(input, title)); wrapper.append(button);
    input.addEventListener('input',syncColorIcons);
    input.addEventListener('change',syncColorIcons);
  }
  syncColorIcons();
}
function syncColorIcons() {
  for (const wrapper of $$('.color-control')) {
    const input=wrapper.querySelector('input'), button=wrapper.querySelector('.color-icon');
    if (!input || !button) continue;
    const hex=/^#[0-9a-f]{6}$/i.test(input.value);
    button.style.backgroundColor=hex ? input.value : '#ffffff';
    button.textContent=hex ? '' : input.value.toLowerCase()==='none' ? '∅' : 'A';
    button.title=`${button.getAttribute('aria-label')}：${input.value}`;
    button.disabled=input.matches(':disabled') || loading || exporting;
  }
}

function colorSwatch(hex, name = hex) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'color-swatch';
  button.style.backgroundColor = hex; button.title = name; button.setAttribute('aria-label', name);
  button.setAttribute('aria-pressed', String(hex.toLowerCase() === colorTarget?.value.toLowerCase()));
  button.addEventListener('click', () => chooseColor(hex)); return button;
}
function openColorPanel(input, title) {
  if (loading || exporting || input.matches(':disabled')) return;
  colorTarget = input;
  $('#color-panel-title').textContent = `${title}を選ぶ`;
  const names = {black:'黒',gray:'灰',blue:'青',orange:'橙',red:'赤',green:'緑',purple:'紫'};
  $('#color-swatches').replaceChildren(...Array.from({length:10},(_,shade) => Object.keys(names).map(base => colorSwatch(COLOR_PALETTE[base][shade], `${names[base]} ${shade} ${COLOR_PALETTE[base][shade]}`))).flat());
  $('#basic-colors').replaceChildren(...['#000000','#ffffff'].map(hex => colorSwatch(hex)));
  $('#recent-colors').replaceChildren(...recentColors.map(hex => colorSwatch(hex)));
  $('#custom-color').value = /^#[0-9a-f]{6}$/i.test(input.value) ? input.value : '#000000';
  $('#color-code').value = $('#custom-color').value; $('#color-error').textContent = '';
  $('#color-panel').showModal();
}
function chooseColor(value) {
  if (!/^#[0-9a-f]{6}$/i.test(value)) {$('#color-error').textContent = '#RRGGBB形式で入力してください。'; return;}
  if (!colorTarget?.isConnected || colorTarget.matches(':disabled') || loading || exporting) {$('#color-panel').close(); return;}
  colorTarget.value = value;
  recentColors.splice(0, recentColors.length, value, ...recentColors.filter(hex => hex.toLowerCase() !== value.toLowerCase()).slice(0,7));
  applyControlInput({target:colorTarget});
  syncColorIcons();
  $('#color-panel').close();
}
$('#close-color-panel').addEventListener('click', () => $('#color-panel').close());
$('#custom-color').addEventListener('change', event => chooseColor(event.target.value));
$('#apply-color-code').addEventListener('click', () => chooseColor($('#color-code').value.trim()));
$('#color-code').addEventListener('keydown', event => {if(event.key === 'Enter') {event.preventDefault(); chooseColor(event.target.value.trim());}});
enhanceColorInputs();

const axisName = axis => axis === 'y2' ? '右Y' : axis.toUpperCase();
function openAxisEditor(axis, kind) {
  if (!metadata || loading || exporting || renderRunning || renderedRevision !== revision) return;
  const fields = $('#axis-editor-fields'); fields.dataset.axisName = axis;
  const label = (key, text, type='text', extra='') => `<label>${text}<input data-axis="${key}" type="${type}" value="${escapeHTML(config.axes[key])}" ${type==='text' && /(Label|Unit)$/.test(key)?`title="${MICRO_HINT}"`:''} ${extra}></label>`;
  $('#axis-editor-title').textContent = `${axisName(axis)}軸${kind === 'label' ? 'ラベル' : '目盛り'}の設定`;
  if (kind === 'label') {
    fields.innerHTML = label(`${axis}Label`,'ラベル（空欄で自動）','text','maxlength="500"') + label(`${axis}Unit`,'単位（autoで自動）') +
      `<div class="field-grid">${label(`${axis}LabelPad`,'ラベル追加余白 (pt)','number','min="-100" max="100" step="any"')}${label('labelFontScale','軸ラベル文字倍率','number','min=".2" max="3" step="any"')}</div>` +
      `<div class="field-grid">${label(`${axis}LabelX`,'ラベルX (軸比率)','number','step="any" placeholder="標準"')}${label(`${axis}LabelY`,'ラベルY (軸比率)','number','step="any" placeholder="標準"')}</div><button type="button" class="button quiet" data-reset-label>標準位置に戻す</button>`;
  } else {
    const automatic = config.axes[`${axis}Min`] === '' && config.axes[`${axis}Max`] === '';
    fields.innerHTML = `<label class="log-format-field" data-log-format-for="${axis}">目盛りの表記<select data-axis="${axis}LogFormat" aria-label="${axisName(axis)}軸の対数目盛り表記">${choiceOptions([['power','累乗（10ⁿ）'],['decimal','数値（0.1、1、10）']],config.axes[`${axis}LogFormat`])}</select></label>` +
      `<label><input type="checkbox" data-axis-auto="range" ${automatic?'checked':''}>範囲を自動設定</label><div class="field-grid">${label(`${axis}Min`,'最小','number','step="any" placeholder="自動"')}${label(`${axis}Max`,'最大','number','step="any" placeholder="自動"')}</div>` +
      `<label><input type="checkbox" data-axis-auto="ticks" data-axis-name="${axis}">主目盛りを自動設定</label>` +
      label(`${axis}Step`,'主目盛り間隔','number','step="any" placeholder="自動"') +
      `<label><input type="checkbox" data-axis-auto="minor" data-axis-name="${axis}">副目盛りを自動設定</label>` +
      label(`${axis}MinorStep`,'副目盛り間隔','number','step="any" placeholder="自動"') +
      `<label><input type="checkbox" data-axis="hideMinorTicks" data-invert="true" ${config.axes.hideMinorTicks?'':'checked'}>副目盛りを表示</label>` +
      `<div class="field-grid">${label(`${axis}TickPad`,'目盛り追加余白 (pt)','number','min="-100" max="100" step="any"')}${label('tickFontScale','目盛り文字倍率','number','min=".2" max="3" step="any"')}</div>`;
  }
  fields.innerHTML += axis === 'x' ? label('spineColor','枠線・文字色','color') : label(`${axis}Color`,'軸の色（autoで自動）','text','title="軸線・目盛線・目盛数値・ラベルに適用します。autoでは、左右別の軸を使う場合に各軸の最初の系列と同じ色にします。"');
  syncAxisEditor(); enhanceColorInputs(); $('#axis-editor').showModal();
}
function syncAxisEditor() {
  const fields = $('#axis-editor-fields'), axis = fields.dataset.axisName;
  for (const [mode,keys] of [['range',['Min','Max']],['ticks',['Step']],['minor',['MinorStep']]]) {
    const checkbox = fields.querySelector(`[data-axis-auto="${mode}"]`); if (!checkbox) continue;
    for (const key of keys) {
      const field = fields.querySelector(`[data-axis="${axis}${key}"]`);
      field.disabled = (checkbox.checked && field !== document.activeElement) || (mode !== 'range' && config.axes[`${axis}Scale`] === 'log');
    }
  }
  syncAxisAutomaticControls();
}
function syncAxisAutomaticControls() {
  for (const field of $$('[data-log-format-for]')) field.hidden = config.axes[`${field.dataset.logFormatFor}Scale`] !== 'log';
  for (const input of $$('[data-axis-auto]')) {
    const axis = input.dataset.axisName || (input.closest('#axis-editor-fields') ? $('#axis-editor-fields').dataset.axisName : null);
    if (!axis) continue;
    const mode = input.dataset.axisAuto, keys = mode === 'range' ? ['Min','Max'] : mode === 'minor' ? ['MinorStep'] : ['Step'];
    input.checked = keys.every(key => config.axes[`${axis}${key}`] === '');
    input.disabled = mode !== 'range' && config.axes[`${axis}Scale`] === 'log';
  }
  for (const axis of ['x','y','y2']) for (const key of ['Step','MinorStep']) {
    $$(`[data-axis="${axis}${key}"]`).forEach(input => {
      input.disabled = config.axes[`${axis}Scale`] === 'log' || (!!input.closest('#axis-editor-fields') && config.axes[`${axis}${key}`] === '' && input !== document.activeElement);
    });
  }
}
function setAxisAutomatic(input, axis = input.dataset.axisName || $('#axis-editor-fields').dataset.axisName) {
  const mode = input.dataset.axisAuto, keys = mode === 'range' ? ['Min','Max'] : mode === 'minor' ? ['MinorStep'] : ['Step'];
  const range = figureResult?.[`${axis}Range`] || [0,1];
  const spacing = figureResult?.tickSteps?.[axis];
  keys.forEach((key,index) => {
    let value = key === 'Step' ? spacing?.major || Math.abs(range[1]-range[0])/5 :
      key === 'MinorStep' ? spacing?.minor || (spacing?.major || Math.abs(range[1]-range[0])/5)/5 : range[index];
    config.axes[`${axis}${key}`] = input.checked ? '' : String(Number(value.toPrecision(12)));
    $$(`[data-axis="${axis}${key}"]`).forEach(field => field.value = config.axes[`${axis}${key}`]);
  });
  syncAxisEditor(); changed();
}
$('#axis-editor-fields').addEventListener('input', event => {
  const fields = $('#axis-editor-fields'), axis = fields.dataset.axisName, input = event.target;
  if (incompleteNumberInput(input)) return;
  if (input.dataset.axisAuto) {
    setAxisAutomatic(input, axis);
  } else if (input.dataset.axis) {
    // A partial manual position must never make the plot disappear while typing.
    if (/^(x|y|y2)Label[XY]$/.test(input.dataset.axis) && input.value !== '') {
      const other = `${axis}Label${input.dataset.axis.endsWith('X')?'Y':'X'}`;
      if(config.axes[other] === '') {config.axes[other] = String(figureResult.geometry.axisLabels?.find(label => label.axis === axis)?.anchor[other.endsWith('X')?0:1] ?? 0); fields.querySelector(`[data-axis="${other}"]`).value = config.axes[other];}
    }
    if (/^(x|y|y2)Label[XY]$/.test(input.dataset.axis) && input.value === '') config.axes[`${axis}LabelX`] = config.axes[`${axis}LabelY`] = '';
    applyControlInput(event);
    if (/^(x|y|y2)LabelPad$/.test(input.dataset.axis) || /^(x|y|y2)Label[XY]$/.test(input.dataset.axis)) {
      for (const key of ['LabelX','LabelY']) {
        const field = fields.querySelector(`[data-axis="${axis}${key}"]`);
        if (field !== input) field.value = config.axes[`${axis}${key}`];
      }
    }
  }
});
$('#axis-editor-fields').addEventListener('click', event => {
  if (!event.target.closest('[data-reset-label]')) return;
  const axis = $('#axis-editor-fields').dataset.axisName;
  for (const key of ['LabelX','LabelY','LabelPad']) {config.axes[`${axis}${key}`] = key === 'LabelPad' ? 0 : ''; $$(`[data-axis="${axis}${key}"]`).forEach(field => field.value = config.axes[`${axis}${key}`]);}
  changed();
});
$('#close-axis-editor').addEventListener('click', () => $('#axis-editor').close());
$('#axis-editor-fields').addEventListener('focusout', syncAxisEditor);

function drawPresetOptions() {
  const type=config.plotType || "General", options=config.options ||= {};
  const number=(key,label,def,min=0,max=100,step=.1)=>`<label>${label}<input data-option="${key}" type="number" value="${escapeHTML(options[key] ?? def)}" min="${min}" max="${max}" step="any"></label>`;
  const color=(key,label,def)=>`<label>${label}<input data-option="${key}" value="${escapeHTML(options[key] ?? def)}"></label>`;
  let html='';
  const notes={"XPS Fit":"CSV/Au 10列/Ag 8列の配置を自動判定。成分の塗りつぶしは背景との差で描画します。", "Particle Histogram":"選択した粒径列から頻度%と対数正規分布を描画します。ビン幅は20 nmです。", "Raman 3D":"共通のX列と各Y列からウォーターフォールを作成します。Y軸設定は強度（Z軸）に適用します。", "bar_graph_general":"数値X・カテゴリXに対応した集合棒グラフです。", "Roughness":"線＋マーカー、Y対数軸が初期設定です。"};
  $("#plot-type").title=notes[type] || "プリセットに合わせて軸ラベル・単位を設定します。";
  $("#preset-note").textContent=""; $("#preset-note").hidden=true;
  if(type==='bar_graph_general') html=`<div class="field-grid">${number('barWidth','棒幅',.8,.01,100)}${number('barAlpha','不透明度',.9,0,1)}${number('barEdgeWidth','縁幅 (pt)',.4,0,20)}${color('barEdgeColor','縁色 (auto / #色)','auto')}</div>`;
  if(type==='Particle Histogram') html=`<label>粒径列<select data-option="diameterColumn">${columnOptions(options.diameterColumn ?? config.series[0]?.y ?? 1)}</select></label><div class="field-grid">${color("histogramColor","分布の色","#70BEFF")}${number("histogramAlpha","分布の不透明度",1,0,1)}${color("histogramFitColor","分布曲線の色","#FF7166")}${number("histogramFitWidth","分布曲線の線幅 (pt)",.8,0,20)}</div>`;
  if(type==='Raman 3D') html=`<label><input type="checkbox" data-option="normalize" ${options.normalize!==false?'checked':''}>各系列を0〜1に正規化</label><div class="field-grid"><label>奥行きラベル<input data-option="depthLabel" value="${escapeHTML(options.depthLabel ?? "Series")}"></label>${number('depthStep','奥行き間隔',1,.01,10000)}${number('elevation','仰角 (度)',24,-180,180,1)}${number('azimuth','方位角 (度)',-66,-360,360,1)}</div>`;
  if(type==='XPS Fit') {
    if(!options.fills?.length && metadata?.columns.length>=8){
      const csv=metadata.xpsCSV, large=metadata.columns.length>=10;
      const indices=csv?Array.from({length:metadata.columns.length-7},(_,i)=>i+7):large?[6,7,8,9]:[3,4];
      options.fills=indices.map((upper,i)=>({x:csv||!large?0:3,upper,lower:csv?3:large?5:2,color:['#F7574A','#56B2FF','#FF9822','#5BCC77'][i%4],alpha:.3}));
    }
    html=`<div class="field-grid">${number('scatterSize','散布面積 (pt²)',18,0,500,1)}${number('scatterEdgeWidth','散布縁幅 (pt)',.6,0,20)}${color('scatterEdgeColor','散布縁色','#2A2A2A')}${color('scatterFaceColor','散布塗り色','#ffffff')}${number('scatterAlpha','散布不透明度',.8,0,1)}${color('fitLineColor','fit線色','#2A2A2A')}${number('fitLineWidth','fit線幅 (0=非表示)',0,0,20)}${color('bgLineColor','背景線色','#8A8A8A')}${number('bgLineWidth','背景線幅 (0=非表示)',0,0,20)}</div>`;
    html+=(options.fills || []).map((fill,index)=>`<details data-fill-index="${index}"><summary>成分 ${index+1}</summary><div class="field-grid">${[['x','X'],['upper','成分Y'],['lower','背景Y']].map(([key,label])=>`<label>${label}<select data-fill="${key}" ${metadata.xpsCSV?'disabled':''}>${columnOptions(fill[key])}</select></label>`).join('')}<label>色<input type="color" data-fill="color" value="${escapeHTML(fill.color)}"></label><label>不透明度<input type="number" data-fill="alpha" min="0" max="1" step="any" value="${fill.alpha}"></label></div><button type="button" class="button quiet" data-remove-fill="${index}" ${metadata.xpsCSV?'disabled':''}>成分を削除</button></details>`).join('');
    if(!metadata.xpsCSV) html+='<button type="button" class="button quiet" id="add-fill">成分を追加</button>';
  }
  $("#preset-options").innerHTML=html;
  enhanceColorInputs();
  document.querySelector('.preview-footer > span').textContent=`PlotLauncher Web · ${presets.find(preset=>preset.id===type)?.label || type}`;
  document.querySelector('#axes-title').textContent=presets.find(preset=>preset.id===type)?.label || type;
}

$("#plot-type").addEventListener("change",event=>{
  applyPreset(config,presets.find(item=>item.id===event.target.value));
  if(!['General','Roughness'].includes(config.plotType))config.series.forEach(item=>{item.mode='line';item.errorMode='none';item.yAxis='left';});
  if(config.plotType==='Raman 3D') config.series=initialSeries(metadata.columns, config.plotType);
  if(config.plotType==='Particle Histogram')config.options.diameterColumn=Math.min(2,metadata.columns.length-1);
  drawControls();changed();
});
$("#preset-options").addEventListener('click',event=>{
  if(event.target.id==='add-fill'){config.options.fills.push({x:0,upper:1,lower:2,color:COLORS[config.options.fills.length%COLORS.length],alpha:.3});drawPresetOptions();changed();}
  const remove=event.target.closest('[data-remove-fill]');
  if(remove){config.options.fills.splice(Number(remove.dataset.removeFill),1);drawPresetOptions();changed();}
});
for(const [id,paired] of [['shared-x-series',false],['paired-series',true]]) $("#"+id).addEventListener('click',()=>{
  const columns=metadata.columns, pairs=[];
  for(let i=1;i<columns.length && pairs.length<32;i+=paired?2:1) pairs.push(createSeries(paired?i-1:0,i,columns[i].name,pairs.length));
  config.series=pairs;drawControls();changed();
});
$("#series-colors").addEventListener('click',()=>{config.series.forEach((item,i)=>item.color=COLORS[i%COLORS.length]);drawControls();changed();});
$("#apply-colormap").addEventListener('click',async()=>{
  try{const result=await request('colors',{name:$('#color-map').value,count:config.series.length}),target=$('#colormap-target').value;config.series.forEach((item,i)=>{if(target!=='scatter')item.color=result.colors[i];if(target!=='line')item.scatterColor=result.colors[i];});drawControls();changed();}catch(error){status(error.message,'error');}
});
$("#apply-offsets").addEventListener('click',()=>{
  if (['#offset-start','#offset-step'].some(selector => incompleteNumberInput($(selector)))) {
    status('オフセット開始と間隔に数値を入力してください。', 'error'); return;
  }
  const start=Number($("#offset-start").value), step=Number($("#offset-step").value);
  config.series.forEach((item,i)=>item.yOffset=start+i*step);drawControls();changed();
});

function drawControls() {
  $("#plot-type").value = config.plotType || "General";
  drawPresetOptions();
  for (const [selector, key] of [["#font-family", "fontFamily"], ["#japanese-font-family", "japaneseFontFamily"]]) {
    const field = $(selector), family = config.axes[key];
    if (![...field.options].some(option => option.value === family)) field.add(new Option(`${family}（要読み込み）`, family));
  }
  const xpsFit=config.plotType==='XPS Fit';
  const histogram=config.plotType==='Particle Histogram';
  const visibleSeries=xpsFit || histogram?config.series.slice(0,1):config.series;
  $("#series-count").textContent = xpsFit?'実測点':`${visibleSeries.length} 系列`;
  $("#series-list").innerHTML = visibleSeries.map((series, index) => {
    const input = (key, label, attributes = '') => `<label>${label}<input data-series-field="${key}" type="number" value="${escapeHTML(series[key])}" ${attributes}></label>`;
    if(histogram)return `<div class="series-card" data-series-index="${index}"><label class="series-visibility"><input data-series-field="visible" type="checkbox" ${series.visible!==false?'checked':''}>粒径分布を描画</label></div>`;
    return `<div class="series-card" data-series-index="${index}">
      <label class="series-visibility"><input data-series-field="visible" type="checkbox" ${series.visible!==false?'checked':''}>系列${index+1}を描画</label><div class="series-heading">${xpsFit?'実測点の列':`<input data-series-field="color" type="color" value="${escapeHTML(series.color)}" aria-label="系列${index + 1}の色"><input class="series-label" data-series-field="name" value="${escapeHTML(series.name)}" maxlength="200" aria-label="系列${index + 1}の名前"><button type="button" class="icon-button" data-remove="${index}" aria-label="系列${index + 1}を削除"><svg><use href="#i-close"/></svg></button>`}</div>
      <div class="field-grid"><label>X列<select data-series-field="x">${columnOptions(series.x)}</select></label><label>Y列<select data-series-field="y">${columnOptions(series.y)}</select></label></div>
      <label title="右軸を選ぶと「03 軸とサイズ」に右Y軸の設定が表示されます。">使用するY軸<select data-series-field="yAxis">${choiceOptions([['left','左軸'],['right','右軸']],series.yAxis || 'left')}</select></label>
      <div class="annotation-buttons"><button type="button" class="button quiet" data-series-up="${index}" ${index===0?'disabled':''}>↑</button><button type="button" class="button quiet" data-series-down="${index}" ${index===config.series.length-1?'disabled':''}>↓</button><button type="button" class="button quiet" data-series-copy="${index}">複製</button></div><details class="series-advanced"><summary>線・マーカー・誤差</summary>
        <label class="draw-mode">描画方法<select data-series-field="mode">${choiceOptions([["line", "線"], ["scatter", "マーカー"], ["line+scatter", "線とマーカー"]], series.mode)}</select></label>
        <div class="field-grid">${input("lineWidth", "線幅 (pt)", 'min="0" max="6" step="any"')}<label>線種<select data-series-field="lineStyle">${choiceOptions([["-", "実線"], ["--", "破線"], ["-.", "一点鎖線"], [":", "点線"]], series.lineStyle)}</select></label></div>
        <div class="field-grid"><label>マーカー<select data-series-field="marker">${choiceOptions([["o", "丸"], ["s", "四角"], ["^", "三角 ▲"], ["v", "三角 ▼"], ["D", "ひし形"], ["+", "+"], ["x", "×"], ["*", "星"], ["p", "五角形"], ["h", "六角形"]], series.marker)}</select></label>${input("markerSize", "マーカー面積 (pt²)", 'min="1" max="200" step="any"')}</div>
        <div class="field-grid">${input("xOffset", "Xオフセット", 'step="any"')}${input("yOffset", "Yオフセット", 'step="any"')}</div>
        <div class="field-grid"><label>マーカー色<input data-series-field="scatterColor" value="${escapeHTML(series.scatterColor)}" placeholder="auto / #色"></label>${input("lineAlpha", "線の不透明度", 'min="0" max="1" step="any"')}<label>マーカー縁色<input data-series-field="markerEdgeColor" value="${escapeHTML(series.markerEdgeColor)}" placeholder="auto / none / #色"></label><label>マーカー塗り色<input data-series-field="markerFaceColor" value="${escapeHTML(series.markerFaceColor)}" placeholder="auto / none / #色"></label>${input("markerEdgeAlpha", "縁の不透明度", 'min="0" max="1" step="any"')}${input("markerFaceAlpha", "塗りの不透明度", 'min="0" max="1" step="any"')}</div>
        <label class="draw-mode">誤差の種類<select data-series-field="errorMode">${choiceOptions([["auto", "±列から自動"], ["none", "なし"], ["symmetric", "±値"], ["asymmetric", "正・負の誤差幅"], ["minmax", "最小・最大値"]], series.errorMode)}</select></label>
        <label class="draw-mode">Y誤差（±）の列<select data-series-field="error">${columnOptions(series.error, true)}</select></label>
        <div class="field-grid"><label title="Yから上方向の誤差幅。0以上の値が入った列を選びます。上端＝Y＋正の誤差幅。">正の誤差幅（＋）<select data-series-field="errorPlus">${columnOptions(series.errorPlus, true)}</select></label><label title="Yから下方向の誤差幅。こちらも0以上の値を指定します。下端＝Y−負の誤差幅。">負の誤差幅（−）<select data-series-field="errorMinus">${columnOptions(series.errorMinus, true)}</select></label></div>
        <div class="field-grid"><label title="誤差幅ではなく下端のY値を指定します。最小値 ≤ Y ≤ 最大値。">Y誤差最小値<select data-series-field="errorMin">${columnOptions(series.errorMin, true)}</select></label><label title="誤差幅ではなく上端のY値を指定します。最小値 ≤ Y ≤ 最大値。">Y誤差最大値<select data-series-field="errorMax">${columnOptions(series.errorMax, true)}</select></label></div>
      </details></div>`;
  }).join("") || '<p class="empty-series">「系列を追加」でX列とY列を選んでください。</p>';
  $$('[data-axis]').forEach(input => {
    const value = config.axes[input.dataset.axis];
    if (input.type === "checkbox") input.checked = input.dataset.invert === 'true' ? !value : Boolean(value);
    else input.value = value;
  });
  const generic=['General','Roughness'].includes(config.plotType || 'General');
  const markerFields=['mode','marker','markerSize','scatterColor','markerEdgeColor','markerFaceColor','markerEdgeAlpha','markerFaceAlpha','lineStyle','lineAlpha','error','errorMode','errorMin','errorMax','yAxis'];
  $$('[data-series-field]').forEach(input=>{if(markerFields.includes(input.dataset.seriesField))input.closest('label').hidden=!generic;});
  syncSeriesErrorControls();
  syncYAxesControls();
  const seriesSection=$('#series-list').closest('.control-section');if(seriesSection)seriesSection.hidden=false;
  $('#add-series').hidden=xpsFit || histogram;
  $('#series-colormap').hidden=xpsFit || histogram;
  $('#series-batch').hidden=xpsFit || histogram;
  if(config.plotType==='XPS Fit')$$('.series-advanced,.series-card .annotation-buttons').forEach(element=>element.hidden=true);
  if(config.plotType==='Raman 3D')$$('[data-series-field="lineWidth"]').forEach(input=>input.closest('label').hidden=true);
  updateButtons();
  syncAxisAutomaticControls();
  drawAnnotations();
  $$('[data-axis="xLabel"],[data-axis="yLabel"],[data-axis="y2Label"],[data-axis="xUnit"],[data-axis="yUnit"],[data-axis="y2Unit"],.series-label').forEach(input=>input.title=MICRO_HINT);
  enhanceColorInputs();
}

function syncYAxesControls() {
  const active = ['General','Roughness'].includes(config.plotType || 'General') && config.series.some(item=>item.yAxis === 'right');
  $('#right-axis-controls').hidden = !active;
  $$('[data-axis="yAxisRight"]').forEach(input=>input.closest('label').hidden=active);
}

function syncSeriesErrorControls() {
  const modes = {error:['auto','symmetric'],errorPlus:['asymmetric'],errorMinus:['asymmetric'],errorMin:['minmax'],errorMax:['minmax']};
  const generic = ['General','Roughness'].includes(config.plotType || 'General');
  $$('[data-series-field]').forEach(input => {
    const allowed = modes[input.dataset.seriesField];
    if (!allowed) return;
    const series = config.series[Number(input.closest('[data-series-index]').dataset.seriesIndex)];
    input.closest('label').hidden = !generic || !series || !allowed.includes(series.errorMode || 'auto');
  });
}

function drawAnnotations() {
  $("#annotation-list").innerHTML = (config.annotations || []).map((item, index) => {
    const text = (key, label) => `<label>${label}<input data-annotation-field="${key}" value="${escapeHTML(item[key] ?? '')}"></label>`;
    const num = (key, label) => `<label>${label}<input type="number" step="any" data-annotation-field="${key}" value="${escapeHTML(item[key] ?? '')}"></label>`;
    return `<details class="annotation-card ${selected.has(item.id)?'selected':''}" data-annotation-index="${index}" ${selected.has(item.id)?'open':''}><summary><button type="button" class="button quiet" data-select-annotation="${escapeHTML(item.id)}" aria-pressed="${selected.has(item.id)}">${{text:"文字",arrow:"矢印",segment:"線"}[item.type]} ${index+1} ${escapeHTML(item.text || '')}</button></summary>
      ${item.type === "text" ? text("text", "文字") : ''}
      <div class="field-grid">${item.type === "text" ? num("x", "X") + num("y", "Y") + num("font_size", "文字サイズ (pt)") + num("rotation", "回転 (度)") : num("x1", "始点X") + num("y1", "始点Y") + num("x2", "終点X") + num("y2", "終点Y") + num("line_width", "線幅 (pt)") + text("line_style", "線種 (- / -- / -. / :)")}
      ${item.type === "arrow" ? `<label>矢印<select data-annotation-field="arrow_style">${choiceOptions([["->","片矢印"],["<->","両矢印"],["-|>","塗り矢印"]],item.arrow_style)}</select></label>` + num("arrow_size", "矢印サイズ (pt)") : ''}
      <label>色<input type="color" data-annotation-field="color" value="${escapeHTML(item.color)}"></label>${num("opacity", "不透明度")}<label>座標<select data-annotation-field="coordinate_system">${choiceOptions([["axes_fraction","軸比率（0〜1）"],["data","データ座標"]],item.coordinate_system)}</select></label></div>
      ${item.type === "text" ? `<label>フォント<select data-annotation-field="font_family">${choiceOptions([...loadedFonts].map(name=>[name,escapeHTML(name)]),item.font_family)}</select></label><div class="field-grid"><label>横揃え<select data-annotation-field="horizontal_alignment">${choiceOptions([["left","左"],["center","中央"],["right","右"]],item.horizontal_alignment)}</select></label><label>縦揃え<select data-annotation-field="vertical_alignment">${choiceOptions([["baseline","基準線"],["center","中央"],["top","上"],["bottom","下"]],item.vertical_alignment)}</select></label></div><div class="check-options"><label><input type="checkbox" data-annotation-field="bold" ${item.bold?'checked':''}>太字</label><label><input type="checkbox" data-annotation-field="italic" ${item.italic?'checked':''}>斜体</label></div>` : ''}
      <div class="check-options"><label><input type="checkbox" data-annotation-field="visible" ${item.visible?'checked':''}>表示</label><label><input type="checkbox" data-annotation-field="locked" ${item.locked?'checked':''}>位置を固定</label></div><button type="button" class="button quiet" data-remove-annotation="${index}">削除</button></details>`;
  }).join('');
  $$('[data-annotation-field="text"]').forEach(input=>input.title=MICRO_HINT);
  enhanceColorInputs();
}

function drawMetadata() {
  $("#file-summary").hidden = false;
  $("#file-name").textContent = metadata.filename;
  $("#file-stats").textContent = `${metadata.rowCount.toLocaleString()} 行 · ${metadata.columns.length} 列`;
  $("#sample-badge").hidden = !sample;
  $("#sheet-select").replaceChildren(...metadata.sheets.map((name, index) => new Option(name, String(index))));
  $("#sheet-select").value = String(metadata.sheetIndex);
  $("#header-row").value = loadedHeader;
  $("#data-preview").hidden = false;
  $("#table-caption").textContent = `${metadata.sheets[metadata.sheetIndex]} · ${metadata.rowCount.toLocaleString()} 行`;
  $("#data-table thead").innerHTML = `<tr><th>#</th>${metadata.columns.map(column => `<th>${escapeHTML(column.name)}</th>`).join("")}</tr>`;
  $("#data-table tbody").innerHTML = metadata.rows.map((row, index) => `<tr><td>${index + 1}</td>${row.map(value => `<td>${escapeHTML(value ?? "")}</td>`).join("")}</tr>`).join("");
}

function resetPreview() {
  figureResult = null;
  $("#figure-interactions").replaceChildren();
  if (previewURL) URL.revokeObjectURL(previewURL);
  previewURL = null;
  $("#figure-image").hidden = true;
  $("#figure-image").removeAttribute("src");
  $("#initial-message").hidden = false;
  $("#initial-message .spinner").hidden = true;
  $("#initial-message strong").textContent = "グラフを描画しています";
  $("#initial-message p").textContent = "シート・列・軸の設定を確認してください。";
  $("#plot-warnings").hidden = true;
  $("#preview-state").className = "preview-state";
  $("#preview-state").textContent = "設定を反映中";
  renderedRevision = -1;
}

function initialSheetConfig(data) {
  const inferred = data.plotType || 'General';
  const result = {axes:defaultAxes(), plotType:inferred, options:{}, series:initialSeries(data.columns, inferred)};
  applyPreset(result, presets.find(item=>item.id===inferred));
  if (inferred==='XPS Fit') result.series=[createSeries(0,1,data.columns[1]?.name || 'Raw')];
  if (inferred==='Roughness') result.series.forEach(item=>item.mode='line+scatter');
  if (inferred==='Particle Histogram') result.options.diameterColumn=Math.min(2,data.columns.length-1);
  return result;
}

function configurationForSheet(data, setting, template) {
  const inherited = sheetMode === 'shared' ? template : setting?.inheritSharedSettings ? sharedSettings : setting?.inheritFirstSheet ? sheetSettings.get(0) : !setting ? template : null;
  return inherited ? configForSheet(inherited, data) : setting ? restoreSettings(setting, data) : initialSheetConfig(data);
}

async function loadFile(file, isSample = false, reload = false, fromClipboard = false) {
  if (loading || exporting || !engineReady) return;
  if (!reload && (!/\.(xlsx|xlsm|xls|csv)$/i.test(file.name) || file.size > 30 * 1024 * 1024)) {
    status("30 MB以内のExcel（.xlsx / .xlsm / .xls）またはCSVを選んでください。", "error");
    return;
  }
  const sheetIndex = reload ? Number($('#sheet-select').value) : 0;
  const switchingSheet = reload && sheetIndex !== metadata.sheetIndex;
  const nextSheets = reload ? new Map(projectSheetSettings().map(item=>[item.sheetIndex,item.settings])) : new Map();
  const nextShared = reload && sheetMode === 'shared' ? currentSharedSettings() : sharedSettings;
  const stored = switchingSheet ? nextSheets.get(sheetIndex) : null;
  const headerRow = reload ? (stored?.data.headerRow ?? Number($("#header-row").value)) : 1;
  if (!Number.isInteger(headerRow) || headerRow < 1 || headerRow > 1000) {
    status("ヘッダー行は1〜1000の整数で指定してください。", "error");
    return;
  }
  loading = true;
  clearTimeout(renderTimer);
  ++revision;
  updateButtons();
  status("データを読み込んでいます…");
  try {
    const filename = reload ? metadata.filename : file.name;
    const args = { filename, headerRow, sheetIndex };
    if (!reload) args.bytes = await file.arrayBuffer();
    const originalBytes = args.bytes?.slice(0);
    const previous = metadata;
    const previousSettings = previous && config.series.length ? makeSettings(config, previous, loadedHeader) : null;
    metadata = await request("load", args);
    loadedHeader = metadata.headerRow || headerRow;
    sheetSettings = nextSheets;
    if (!reload) {
      sheetSettings.clear();
      sheetMode = 'shared'; sharedSettings = null;
      sourceData = {filename, bytes:originalBytes};
      sourceHandle = sourceHandles.get(file) || null; sourceDirectory = null;
      $('#save-destination').value = folderSupported ? (isSample || fromClipboard ? 'folder' : 'source') : 'download';
      refreshSaveDestination();
    }
    sample = reload ? sample : isSample;
    // Retain settings if the same columns are still present after a sheet/header change.
    let retained;
    if (reload && previousSettings) sheetSettings.set(previous.sheetIndex, previousSettings);
    if (reload) {
      if (sheetMode === 'shared') sharedSettings = nextShared;
      const template = sheetMode === 'shared' ? nextShared : sharedSettings || nextSheets.get(0) || previousSettings;
      try {retained = configurationForSheet(metadata, switchingSheet ? stored : previousSettings, template);} catch {}
    }
    config = retained || initialSheetConfig(metadata);
    if (sample && !reload) {
      config.series = metadata.columns.slice(1).map((column, index) => createSeries(0, column.index, column.name, index));
      config.axes.xLabel = "Potential"; config.axes.xUnit = "V";
      config.axes.yLabel = "Current density"; config.axes.yUnit = "mA/cm^2";
    }
    if (config.series.length) {
      const current = makeSettings(config, metadata, loadedHeader);
      sheetSettings.set(sheetIndex,current);
      if (sheetMode === 'shared' && !sharedSettings) sharedSettings = current;
    }
    if (!reload) $("#save-name").value = safeStem(filename);
    selected.clear(); history=[];future=[];lastState=structuredClone(config);view={zoom:1,x:0,y:0};
    resetPreview();
    drawMetadata();
    drawControls();
    renderWanted = config.series.length > 0;
    if (!renderWanted) {
      const message = "X列とY列が必要です。シートまたはヘッダー行を変更してください。";
      $("#initial-message strong").textContent = "描画する列を選んでください";
      $("#initial-message p").textContent = message;
      $("#preview-state").textContent = "データを確認";
      status(message, "error");
    }
    return true;
  } catch (error) {
    status(`読み込みに失敗しました: ${error.message}`, "error");
    // The worker retains the previous data when a load fails.
    if (metadata) drawMetadata();
    return false;
  } finally {
    loading = false;
    updateButtons();
    if (renderWanted) renderPreview();
  }
}

function loadSample() {
  return loadFile(new File([sampleCSV()], "sample.csv", { type: "text/csv" }), true);
}

let pastedTable = null, pasteHeaderAutomatic = true;
function updatePastePreview() {
  pastedTable = null;
  $('#paste-preview').replaceChildren();
  $('#paste-error').textContent = '';
  $('#import-paste').disabled = true;
  if (!$('#paste-text').value.trim()) { $('#paste-summary').textContent = ''; return; }
  try {
    pastedTable = parsePastedTable($('#paste-text').value);
    if (pasteHeaderAutomatic) $('#paste-header').checked = pastedTable.hasHeader;
    const data = pastedTableCSV(pastedTable, $('#paste-header').checked);
    $('#paste-summary').textContent = `${data.rowCount.toLocaleString()} 行 · ${data.columnCount} 列`;
    $('#paste-preview').innerHTML = `<table><tbody>${pastedTable.rows.slice(0, 6).map(row => `<tr>${Array.from({length:pastedTable.columnCount}, (_, index) => `<td>${escapeHTML(row[index] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    $('#import-paste').disabled = false;
  } catch (error) { pastedTable = null; $('#paste-error').textContent = error.message; $('#paste-summary').textContent = ''; }
}
function openPasteDialog(text = '') {
  if (!engineReady || loading || exporting) return;
  $('#paste-text').value = text; pasteHeaderAutomatic = true;
  $('#paste-header').checked = true;
  updatePastePreview();
  $('#paste-dialog').showModal(); $('#paste-text').focus();
}
$('#paste-data').addEventListener('click', () => openPasteDialog());
$('#close-paste').addEventListener('click', () => $('#paste-dialog').close());
$('#paste-text').addEventListener('input', updatePastePreview);
$('#paste-header').addEventListener('change', () => { pasteHeaderAutomatic = false; updatePastePreview(); });
$('#import-paste').addEventListener('click', async () => {
  if (!pastedTable || loading || exporting) return;
  try {
    const {csv} = pastedTableCSV(pastedTable, $('#paste-header').checked);
    $('#import-paste').disabled = true;
    if (await loadFile(new File([csv], 'pasted-data.csv', {type:'text/csv'}), false, false, true)) $('#paste-dialog').close();
    else $('#paste-error').textContent = $('#status-text').textContent;
  } catch (error) { $('#paste-error').textContent = error.message; }
  finally { $('#import-paste').disabled = !pastedTable; }
});

function changed() {
  if (!restoring && lastState && JSON.stringify(lastState)!==JSON.stringify(config)) {
    history.push(lastState); if(history.length>30)history.shift(); future=[];
  }
  lastState=structuredClone(config); $("#undo").disabled=!history.length;$("#redo").disabled=!future.length;
  ++revision;
  $("#figure-stage").classList.add("pending");
  $("#preview-state").className = "preview-state";
  $("#preview-state").textContent = "設定を反映中";
  $("#figure-size").textContent = `軸領域 ${config.axes.width || "—"} × ${config.axes.height || "—"} cm`;
  updateButtons();
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => { renderWanted = true; renderPreview(); }, 400);
}

async function renderPreview() {
  if (!engineReady || !metadata || loading || exporting || renderRunning || !renderWanted) return;
  renderWanted = false;
  renderRunning = true;
  const snapshot = structuredClone(config), targetRevision = revision;
  status("グラフを描画しています…");
  updateButtons();
  try {
    const result = await request("render", { config: snapshot });
    if (targetRevision !== revision) return;
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = URL.createObjectURL(new Blob([result.svg], { type: "image/svg+xml" }));
    $("#figure-image").src = previewURL;
    $("#figure-image").hidden = false;
    $("#initial-message").hidden = true;
    $("#figure-stage").classList.remove("pending");
    figureResult = result;
    if(result.statistics){$('#preset-note').hidden=false;$('#preset-note').textContent=`粒径の統計：D50 = ${result.statistics.median.toFixed(3)}、平均 = ${result.statistics.mean.toFixed(3)}。ビン幅20 nm、頻度%。`;}
    $("#preview-state").className = "preview-state ready";
    $("#preview-state").textContent = "更新済み";
    $("#figure-size").textContent = `軸領域 ${snapshot.axes.width} × ${snapshot.axes.height} cm`;
    $("#warning-list").replaceChildren(...result.warnings.map(text => { const item = document.createElement("li"); item.textContent = text; return item; }));
    $("#plot-warnings").hidden = !result.warnings.length;
    status(`${result.series.length} 系列を描画しました · ${result.series.map(series => `${series.points.toLocaleString()} 点`).join(" / ")}`, "ready");
    renderedRevision = revision;
  } catch (error) {
    if (targetRevision !== revision) return;
    $("#preview-state").className = "preview-state error";
    $("#preview-state").textContent = "設定を確認";
    $("#figure-stage").classList.remove("pending");
    status(error.message, "error");
  } finally {
    renderRunning = false;
    updateButtons();
    if (renderWanted) renderPreview();
  }
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// A shared picker ID remembers the opened data folder, as in MiFiTo.
function refreshSaveDestination() {
  const mode=$('#save-destination').value;
  $('#choose-save-folder').hidden=mode!=='folder';
  $('#save-folder-info').textContent=mode==='download'?'ブラウザの保存先':(mode==='source'?sourceDirectory:saveDirectory)?.name || '未選択';
  $('#save-folder-info').title='初回保存時にフォルダを確認します。非対応ブラウザではダウンロードします。';
}
function directoryOptions(startIn) {
  return {id:'plotlauncher-files',mode:'readwrite',...(startIn?{startIn}:{})};
}
async function identifySourceDirectory(directory) {
  if(!sourceHandle || sourceDirectory)return;
  try {
    const candidate=await directory.getFileHandle(sourceHandle.name);
    if(await candidate.isSameEntry(sourceHandle))sourceDirectory=directory;
  } catch(error) {if(error.name!=='NotFoundError')throw error;}
}
async function prepareSaver() {
  let mode=$('#save-destination').value;
  if(!folderSupported || mode==='download')return async(blob,name)=>{download(blob,name);return name;};
  let directory=mode==='source'?sourceDirectory:saveDirectory;
  if(!directory) {
    directory=await window.showDirectoryPicker(directoryOptions(mode==='source'?sourceHandle:saveDirectory||sourceDirectory||sourceHandle));
    saveDirectory=directory; await identifySourceDirectory(directory);
    if(mode==='source' && !sourceDirectory){mode='folder';$('#save-destination').value=mode;}
    refreshSaveDestination();
  }
  const permission={mode:'readwrite'};
  if(await directory.queryPermission(permission)!=='granted' && await directory.requestPermission(permission)!=='granted')
    throw new Error('このフォルダへの保存が許可されていません。保存先を選び直してください。');
  return async(blob,requestedName)=>{
    const dot=requestedName.lastIndexOf('.'), stem=requestedName.slice(0,dot), extension=requestedName.slice(dot);
    let name=requestedName;
    for(let number=1;;number++) {
      try {await directory.getFileHandle(name);}
      catch(error) {if(error.name==='NotFoundError')break;throw error;}
      if(number>=10000)throw new Error('同名のファイルが多すぎます。保存先を変更してください。');
      name=`${stem}_${number+1}${extension}`;
    }
    const handle=await directory.getFileHandle(name,{create:true}), writer=await handle.createWritable();
    try {await writer.write(blob);await writer.close();}
    catch(error) {try{await writer.abort();}catch{}throw error;}
    return name;
  };
}
$('#save-destination').value=folderSupported?'folder':'download';
for(const option of $('#save-destination').options)if(option.value!=='download')option.disabled=!folderSupported;
$('#save-destination').addEventListener('change',refreshSaveDestination);
$('#choose-save-folder').addEventListener('click',async()=>{
  if(loading||exporting)return;
  exporting=true;updateButtons();
  try {saveDirectory=await window.showDirectoryPicker(directoryOptions(saveDirectory||sourceDirectory||sourceHandle));await identifySourceDirectory(saveDirectory);refreshSaveDestination();}
  catch(error){status(error.name==='AbortError'?'保存先の選択をキャンセルしました。':error.message,error.name==='AbortError'?'ready':'error');}
  finally{exporting=false;updateButtons();}
});
for(const [selector,description,accept,open] of [
  ['#data-file','Excel / CSV',{'application/octet-stream':['.xlsx','.xlsm','.xls','.csv']},loadFile],
  ['#project-file','PlotLauncherプロジェクト',{'application/json':['.plotproject','.json']},readProject],
  ['#settings-file','設定JSON',{'application/json':['.json']},readSettings]
]) $(selector).addEventListener('click',async event=>{
  if(typeof window.showOpenFilePicker!=='function')return;
  event.preventDefault();if(loading||exporting||!engineReady)return;
  try {
    const [handle]=await window.showOpenFilePicker({...filePickerOptions('plotlauncher-files',description,accept,saveDirectory||sourceDirectory||sourceHandle),multiple:false});
    const file=await handle.getFile();sourceHandles.set(file,handle);await open(file);
  } catch(error){if(error.name!=='AbortError')status(error.message,'error');}
});
refreshSaveDestination();

async function copyFigureImage() {
  if (exporting || loading || renderRunning || renderedRevision !== revision || !engineReady) return;
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    status("このブラウザでは画像コピーを使用できません。HTTPSのChrome・Edge・Safari等で開くか、PNGを保存してください。", "error");
    return;
  }
  exporting = true; updateButtons();
  status("グラフの画像をコピーしています…");
  try {
    // Call write during the click gesture. Safari accepts a promised Blob,
    // so rendering in the worker does not consume the user activation.
    const png = request("export", { config: structuredClone(config), format: "png", dpi: Number($("#png-dpi").value) }).then(result =>
      new Blob([Uint8Array.from(atob(result.base64), character => character.charCodeAt(0))], { type: "image/png" }));
    png.catch(() => {});
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    status("グラフの画像をコピーしました。PowerPointなどで貼り付け（Ctrl/Command＋V）できます。", "ready");
  } catch (error) {
    status(error.name === "NotAllowedError" ? "画像コピーが許可されませんでした。ブラウザのクリップボード書き込みを許可して、もう一度「画像をコピー」を押してください。" : `画像をコピーできませんでした: ${error.message}`, "error");
  } finally {
    exporting = false; updateButtons();
    if (renderWanted) renderPreview();
  }
}

function openSaveDialog(allSheets = false) {
  if ($(allSheets ? '#open-save-all' : '#open-save').disabled) return;
  $('#save-all-sheets').checked = allSheets;
  $('#save-progress').textContent = '';
  refreshSaveDestination(); updateButtons(); $('#save-dialog').showModal();
}
$('#open-save').addEventListener('click', () => openSaveDialog());
$('#open-save-all').addEventListener('click', () => openSaveDialog(true));
$('#save-all-sheets').addEventListener('change', updateButtons);
$('#close-save').addEventListener('click', () => {if (!exporting) $('#save-dialog').close();});
$('#save-dialog').addEventListener('cancel', event => {if (exporting) event.preventDefault();});
$('#confirm-save').addEventListener('click', () => exportFigure($$('[data-export]').filter(input => input.checked).map(input => input.dataset.export), $('#save-all-sheets').checked));
$('#cancel-batch').addEventListener('click', () => {cancelBatch=true;$('#cancel-batch').disabled=true;status('処理中のファイルが完成したところで停止します…');});
async function exportFigure(formats, allSheets = false) {
  if (exporting || loading || renderRunning || !engineReady || !metadata || (!allSheets && renderedRevision !== revision)) return;
  formats = typeof formats === 'string' ? [formats] : formats;
  if (!formats.length) {status('保存形式を1つ以上選択してください。', 'error'); return;}
  if (allSheets && metadata.sheets.length > 1) return exportSheets(formats);
  exporting = true; updateButtons();
  const stem = safeStem($('#save-name').value), snapshot = structuredClone(config), dpi = Number($('#png-dpi').value);
  const saved = [];
  try {
    const saveFile = await prepareSaver();
    for (const format of formats) {
      status(`${format.toUpperCase()}ファイルを作成しています…`);
      const result = await request('export', {config:snapshot, format, dpi});
      const bytes = Uint8Array.from(atob(result.base64), character => character.charCodeAt(0));
      saved.push(await saveFile(new Blob([bytes], {type:{svg:'image/svg+xml',png:'image/png',pdf:'application/pdf',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'}[format]}), `${stem}.${format}`));
    }
    status(`${saved.join('、')} を保存しました`, 'ready');
  } catch (error) {
    const message = error.name === 'AbortError' ? '保存をキャンセルしました。' : error.message;
    status(`${message}${saved.length ? ` 保存済み：${saved.join('、')}` : ''}`, error.name === 'AbortError' ? 'ready' : 'error');
  } finally {exporting = false; updateButtons(); if(renderWanted)renderPreview();}
}

async function exportSheets(formats) {
  exporting = true; cancelBatch = false;
  $('#cancel-batch').hidden = false; $('#cancel-batch').disabled = false; updateButtons();
  const filename = metadata.filename, names = [...metadata.sheets];
  const snapshots = new Map(projectSheetSettings().map(item=>[item.sheetIndex,item.settings]));
  const template = sheetMode === 'shared' ? currentSharedSettings() : sharedSettings || snapshots.get(0) || (config.series.length ? makeSettings(config, metadata, loadedHeader) : null);
  const stem = safeStem($('#save-name').value), dpi = Number($('#png-dpi').value);
  const asZip = !folderSupported || $('#save-destination').value === 'download';
  const files = [], saved = [], errors = [];
  let zipBytes = 0;
  try {
    // Ask for a destination while this action still has the click gesture.
    const saveFile = await prepareSaver();
    sheetSettings = new Map(snapshots);
    if (sheetMode === 'shared') sharedSettings = template;
    for (let index=0;index<names.length && !cancelBatch;index++) {
      const setting = snapshots.get(index), headerRow = setting?.data.headerRow ?? loadedHeader;
      const prefix = `${index + 1} / ${names.length} · ${names[index]}`;
      let sheetConfig;
      status(`${prefix} を準備しています…`);
      try {
        const data = await request('sheet-info', {filename, sheetIndex:index, headerRow});
        if (!data.rowCount || data.columns.length < 2) throw new Error('描画するデータがありません。');
        sheetConfig = configurationForSheet(data, setting, template);
        if (!sheetConfig.series.length) throw new Error('X列とY列を設定してください。');
        sheetSettings.set(index, makeSettings(sheetConfig, data, headerRow));
      } catch (error) {errors.push(`${names[index]}：${error.message}`);continue;}
      for (const format of formats) {
        if (cancelBatch) break;
        status(`${prefix} · ${format.toUpperCase()}を作成しています…`);
        let result;
        try {result = await request('sheet-export', {filename, sheetIndex:index, headerRow, config:sheetConfig, format, dpi});}
        catch (error) {errors.push(`${names[index]}（${format.toUpperCase()}）：${error.message}`);continue;}
        const bytes = Uint8Array.from(atob(result.base64), character=>character.charCodeAt(0));
        const name = `${sheetFileStem(stem,names[index],index)}.${format}`;
        if (asZip) {
          zipBytes += bytes.length;
          if (zipBytes > 250 * 1024 * 1024) throw new Error('ZIPが250 MBを超えます。保存先にフォルダを指定して保存してください。');
          files.push({name,bytes});
        } else saved.push(await saveFile(new Blob([bytes]),name));
      }
    }
    if (asZip && files.length) saved.push(await saveFile(zipFiles(files),`${stem}_sheets.zip`));
    const count = asZip ? files.length : saved.length;
    const summary = `${cancelBatch ? '一括保存を中止しました。' : ''}${count}ファイルを${asZip ? 'ZIPにまとめて' : ''}保存しました。`;
    status(`${summary}${errors.length ? `\n保存できなかった項目：\n${errors.join('\n')}` : ''}`, errors.length || !count && !cancelBatch ? 'error' : 'ready');
  } catch (error) {
    const cancelled = error.name === 'AbortError';
    status(`${cancelled ? '保存をキャンセルしました。' : error.message}${saved.length ? `\n保存済み：${saved.join('、')}` : ''}`,cancelled?'ready':'error');
  } finally {
    exporting = false; $('#cancel-batch').hidden = true; updateButtons();
    if (renderWanted) renderPreview();
  }
}

async function prepareDocumentSaver(name, description, extension) {
  const fallback = () => prepareSaver();
  return documentSaver({name, id:'plotlauncher-files', description, accept:{'application/json':[extension]}, startIn:saveDirectory||sourceDirectory||sourceHandle, fallback});
}

$("#data-file").addEventListener("change", event => { const file = event.target.files[0]; event.target.value = ""; if (file) loadFile(file); });
$("#drop-zone").addEventListener("click", () => $("#data-file").click());
for (const zone of [$("#drop-zone"), $("#data-drop-area")]) {
  for (const type of ["dragenter", "dragover"]) zone.addEventListener(type, event => { event.preventDefault(); if (engineReady && !loading && !exporting) event.currentTarget.classList.add("drag-over"); });
  zone.addEventListener("dragleave", event => event.currentTarget.classList.remove("drag-over"));
  zone.addEventListener("drop", event => { event.preventDefault();event.stopPropagation();event.currentTarget.classList.remove("drag-over"); const file=event.dataTransfer.files[0];if(engineReady && !loading && !exporting && file){openDroppedFile(file);} });
}
// Dropping a file elsewhere must not navigate away and discard the settings.
window.addEventListener("dragover", event => event.preventDefault());
window.addEventListener("drop", event => {event.preventDefault();const file=event.dataTransfer.files[0];if(file && /\.(json|plotproject)$/i.test(file.name))openDroppedFile(file);});
$("#sample-data").addEventListener("click", loadSample);
$("#sheet-select").addEventListener("change", () => loadFile(null, false, true));
async function changeSheet(index) {
  if (!engineReady || loading || exporting || !metadata || index < 0 || index >= metadata.sheets.length || index === metadata.sheetIndex) return;
  $('#sheet-select').value = String(index);
  return loadFile(null, false, true);
}
$('#previous-sheet').addEventListener('click', () => changeSheet(metadata?.sheetIndex - 1));
$('#next-sheet').addEventListener('click', () => changeSheet(metadata?.sheetIndex + 1));
for (const mode of ['shared','individual']) $(`#sheet-mode-${mode}`).addEventListener('change', () => setSheetMode(mode));
$("#header-row").addEventListener("change", () => loadFile(null, false, true));
$("#plot-form").addEventListener("submit", event => event.preventDefault());
function incompleteNumberInput(input) {
  if (input.type !== 'number') return false;
  if (input.validity?.badInput) return true;
  if (input.value !== '') return !Number.isFinite(Number(input.value));
  return !['xMin','xMax','yMin','yMax','y2Min','y2Max','xStep','yStep','y2Step','xMinorStep','yMinorStep','y2MinorStep','legendX','legendY','xLabelX','xLabelY','yLabelX','yLabelY','y2LabelX','y2LabelY'].includes(input.dataset.axis);
}

function applyControlInput(event) {
  const input = event.target;
  // Native number inputs keep an internal editing buffer for "0.", "-", "1e-".
  // Do not commit incomplete values or assign back to the field being edited.
  if (incompleteNumberInput(input)) return;
  if (input.dataset.axisAuto) {setAxisAutomatic(input);return;}
  if (input.dataset.axis) {
    const key = input.dataset.axis;
    config.axes[key] = input.type === "checkbox" ? (input.dataset.invert === "true" ? !input.checked : input.checked) : input.value;
    if (/^(x|y|y2)Scale$/.test(key) && input.value === 'log') {
      const axis=key.replace(/Scale$/,'');
      config.axes[`${axis}Step`] = config.axes[`${axis}MinorStep`] = '';
      for (const suffix of ['Step','MinorStep']) $$(`[data-axis="${axis}${suffix}"]`).forEach(field=>field.value='');
    }
    if (['backgroundColor','backgroundAlpha','transparent'].includes(key)) {
      if (key === 'backgroundColor') {
        config.axes.transparent = false;
        if (Number(config.axes.backgroundAlpha) === 0) config.axes.backgroundAlpha = 1;
      } else if (key === 'backgroundAlpha') {
        config.axes.transparent = Number(config.axes.backgroundAlpha) === 0;
      } else if (!config.axes.transparent && Number(config.axes.backgroundAlpha) === 0) config.axes.backgroundAlpha = 1;
      for (const related of ['backgroundColor','backgroundAlpha','transparent']) {
        $$(`[data-axis="${related}"]`).forEach(field => {
          if (field === input) return;
          if (field.type === 'checkbox') field.checked = field.dataset.invert === 'true' ? !config.axes[related] : config.axes[related];
          else field.value = config.axes[related];
        });
      }
    }
    if (['plotBackgroundColor','plotBackgroundAlpha','plotBackgroundEnabled'].includes(key)) {
      if(key==='plotBackgroundColor')config.axes.plotBackgroundEnabled=true;
      if(key==='plotBackgroundAlpha')config.axes.plotBackgroundEnabled=Number(config.axes.plotBackgroundAlpha)>0;
      if(config.axes.plotBackgroundEnabled && Number(config.axes.plotBackgroundAlpha)===0)config.axes.plotBackgroundAlpha=1;
      for(const related of ['plotBackgroundColor','plotBackgroundAlpha','plotBackgroundEnabled']) {
        $$(`[data-axis="${related}"]`).forEach(field=>{if(field===input)return;if(field.type==='checkbox')field.checked=config.axes[related];else field.value=config.axes[related];});
      }
    }
    if (/^(x|y|y2)LabelPad$/.test(key)) {const axis=key.replace(/LabelPad$/,'');config.axes[`${axis}LabelX`] = config.axes[`${axis}LabelY`] = "";}
    $$(`[data-axis="${key}"]`).forEach(field => {if(field !== input) {field.value = input.value; field.checked = field.dataset.invert === "true" ? !config.axes[key] : config.axes[key];}});
  }
  else if (input.dataset.seriesField) {
    const item = config.series[Number(input.closest("[data-series-index]").dataset.seriesIndex)];
    item[input.dataset.seriesField] = input.type==='checkbox'?input.checked:input.value;
    const index=input.closest('[data-series-index]').dataset.seriesIndex;
    $$(`[data-series-index="${index}"] [data-series-field="${input.dataset.seriesField}"]`).forEach(field=>{if(field!==input){field.value=input.value;field.checked=input.checked;}});
    if (input.dataset.seriesField === 'errorMode') syncSeriesErrorControls();
    if (input.dataset.seriesField === 'yAxis') syncYAxesControls();
  } else if (input.dataset.annotationField) {
    const item = config.annotations[Number(input.closest("[data-annotation-index]").dataset.annotationIndex)];
    item[input.dataset.annotationField] = input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) : input.value;
  } else if (input.dataset.option) {
    config.options ||= {}; config.options[input.dataset.option] = input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) : input.value;
  } else if (input.dataset.fill) {
    const fill=config.options.fills[Number(input.closest('[data-fill-index]').dataset.fillIndex)];
    fill[input.dataset.fill]=input.type === "number" || input.tagName === "SELECT"?Number(input.value):input.value;
  } else return;
  syncAxisAutomaticControls(); changed();
}
$("#plot-form").addEventListener("input", applyControlInput);
$("#series-list").addEventListener("click", event => {
  const reorder=event.target.closest('[data-series-up],[data-series-down],[data-series-copy]');
  if(reorder){const kind=Object.keys(reorder.dataset)[0],index=Number(reorder.dataset[kind]);if(kind==='seriesCopy' && config.series.length<32)config.series.splice(index+1,0,structuredClone(config.series[index]));else if(kind!=='seriesCopy'){const other=index+(kind==='seriesUp'?-1:1);[config.series[index],config.series[other]]=[config.series[other],config.series[index]];}drawControls();changed();return;}
  const button = event.target.closest("[data-remove]");
  if (!button) return;
  config.series.splice(Number(button.dataset.remove), 1);
  drawControls();
  changed();
});
$("#add-series").addEventListener("click", () => {
  const numeric = metadata.columns.filter(column => column.numeric > 0);
  const x = config.series[0]?.x ?? numeric[0]?.index ?? 0;
  const y = numeric[Math.min(config.series.length + 1, numeric.length - 1)]?.index ?? Math.min(1, metadata.columns.length - 1);
  config.series.push(createSeries(x, y, metadata.columns[y].name, config.series.length));
  drawControls();
  changed();
});
$("#refresh-preview").addEventListener("click", () => { clearTimeout(renderTimer); renderWanted = true; renderPreview(); });

$("#copy-image").addEventListener("click", copyFigureImage);
$("#open-project").addEventListener("click", () => $("#project-file").click());
$("#project-file").addEventListener("change", event => {
  const file=event.target.files[0]; event.target.value=""; if(file) readProject(file);
});
async function saveProject() {
  if(!engineReady || loading || exporting || !sourceData || !metadata || !config.series.length)return;
  exporting=true;updateButtons();
  try {
    const name=`${safeStem($("#save-name").value)}.plotproject`;
    const saveFile=await prepareDocumentSaver(name,"PlotLauncherプロジェクト",".plotproject");
    const savedState=projectEditState();
    const project=makeProject(makeSettings(config,metadata,loadedHeader), {...sourceData,sheetIndex:metadata.sheetIndex,headerRow:loadedHeader,sample}, [...importedFonts.values()], {
      saveName:$("#save-name").value,pngDpi:Number($("#png-dpi").value),view:{...view},sections:$$('#controls-panel .control-section').map(section=>section.open),sheetSettings:projectSheetSettings(),sheetMode,sharedSettings:sheetMode === 'shared' ? currentSharedSettings() : sharedSettings
    });
    const blob=new Blob([JSON.stringify(project)],{type:'application/json'});
    if(blob.size>PROJECT_MAX_SIZE)throw new Error('プロジェクトは130 MB以内にしてください。');
    const filename=`${safeStem($("#save-name").value)}.plotproject`;
    const savedName=await saveFile(blob,filename); savedProjectState=savedState; status(`${savedName} を保存しました。データと設定をまとめて再開できます。`,'ready');
  } catch(error){status(error.name==='AbortError'?'保存をキャンセルしました。':`プロジェクトを保存できませんでした: ${error.message}`,error.name==='AbortError'?'ready':'error');}
  finally{exporting=false;updateButtons();if(renderWanted)renderPreview();}
}
$("#save-project").addEventListener("click",saveProject);
$('#new-project').addEventListener('click', () => {
  if (loading || exporting) return;
  // A fresh page clears data, settings, undo history and the worker together.
  // The existing beforeunload handler protects unsaved work on cancellation.
  window.location.assign(new URL('./', window.location.href).href);
});
async function readProject(file, saved) {
  if(!engineReady || loading || exporting)return;
  loading=true; updateButtons(); status('プロジェクトを開いています…');
  try {
    if(file.size>PROJECT_MAX_SIZE)throw new Error('プロジェクトは130 MB以内のファイルを選んでください。');
    const project=parseProject(saved || JSON.parse(await file.text()));
    const retainedData={filename:project.data.filename,bytes:project.data.bytes.slice(0)};
    const retainedFonts=project.fonts.map(font=>({...font,bytes:font.bytes.slice(0)}));
    const result=await request('project',{filename:project.data.filename,bytes:project.data.bytes,sheetIndex:project.data.sheetIndex,headerRow:project.data.headerRow,settings:project.settings,fonts:project.fonts,sheetSettings:project.workspace.sheetSettings || [],sharedSettings:project.workspace.sharedSettings});
    metadata=result.metadata; config=result.config; sourceData=retainedData; sample=project.data.sample;
    sheetSettings=new Map((project.workspace.sheetSettings || []).map(item=>[item.sheetIndex,item.settings]));
    // Older projects may contain distinct sheet styles; keep those individual.
    sheetMode=project.workspace.sheetMode || 'individual'; sharedSettings=project.workspace.sharedSettings || null;
    sourceHandle=sourceHandles.get(file) || null; sourceDirectory=null;
    $('#save-destination').value=folderSupported?'source':'download'; refreshSaveDestination(); loadedHeader=metadata.headerRow;
    importedFonts.clear(); retainedFonts.forEach(font=>importedFonts.set(font.name,font));
    loadedFonts.clear(); ['Liberation Sans','Noto Sans JP','DejaVu Sans',...result.families].forEach(family=>loadedFonts.add(family));
    for(const selector of ['#font-family','#japanese-font-family'])$(selector).replaceChildren(...[...loadedFonts].map(family=>new Option(family,family)));
    clearTimeout(renderTimer); ++revision; selected.clear(); history=[]; future=[]; lastState=structuredClone(config);
    $("#undo").disabled=$("#redo").disabled=true;
    view={...project.workspace.view}; $("#save-name").value=project.workspace.saveName; $("#png-dpi").value=String(project.workspace.pngDpi);
    $$('dialog[open]').forEach(dialog=>dialog.close());
    resetPreview(); drawMetadata(); drawControls();
    $$('#controls-panel .control-section').forEach((section,index)=>{section.open=project.workspace.sections[index] ?? true;});
    savedProjectState=projectEditState();
    renderWanted=true;
  } catch(error){status(`プロジェクトを開けませんでした: ${error.message}`,'error');}
  finally{loading=false;updateButtons();if(renderWanted)renderPreview();}
}
async function openGalleryProject() {
  const slug = new URLSearchParams(location.search).get('gallery');
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return;
  try {
    const response = await fetch(new URL(`gallery/projects/${slug}.plotproject`, import.meta.url), {cache:'no-cache'});
    if (!response.ok) throw new Error('ギャラリーのプロジェクトを開けませんでした。');
    await readProject(new File([await response.blob()], `${slug}.plotproject`, {type:'application/octet-stream'}));
  } catch (error) { status(error.message, 'error'); }
}
async function openDroppedFile(file) {
  if(/\.plotproject$/i.test(file.name)){await readProject(file);return;}
  if(/\.json$/i.test(file.name)){
    if(file.size>PROJECT_MAX_SIZE){status('ファイルが大きすぎます。','error');return;}
    try {const saved=JSON.parse(await file.text());if(saved?.format==='plotlauncher-project'){await readProject(file,saved);return;}}
    catch{status('JSONファイルを読み込めません。','error');return;}
    await readSettings(file);return;
  }
  await loadFile(file);
}

$('#save-settings').addEventListener('click', async()=>{
  if(loading||exporting||!metadata||!config.series.length)return;
  exporting=true;updateButtons();
  try {
    const name=`${safeStem($('#save-name').value)}.plot.json`;
    const saveFile=await prepareDocumentSaver(name,'設定JSON','.json');
    const filename=await saveFile(new Blob([JSON.stringify(makeSettings(config,metadata,loadedHeader),null,2)],{type:'application/json'}),`${safeStem($('#save-name').value)}.plot.json`);
    status(`${filename} を保存しました。データ自体は含まれていません。`,'ready');
  } catch(error){status(error.name==='AbortError'?'保存をキャンセルしました。':error.message,error.name==='AbortError'?'ready':'error');}
  finally{exporting=false;updateButtons();if(renderWanted)renderPreview();}
});
$("#open-settings").addEventListener("click", () => $("#settings-file").click());
async function readSettings(file) {
  if(!metadata){status('設定を開く前にExcel/CSVを読み込んでください。','error');return;}
  if(loading||exporting)return;loading=true;updateButtons();
  try {
    if (file.size > 1024 * 1024) throw new Error("設定JSONは1 MB以内のファイルを選んでください。");
    const saved=JSON.parse(await file.text());config = restoreSettings(saved, metadata);
    if(saved.plot_type && !saved.format){
      for(const [source,field,token] of [['line_colormap','color','line'],['scatter_colormap','scatterColor','scatter']]){
        if(!['viridis','virigit','plasma','spectrum'].includes(saved[source]))continue;
        const result=await request('colors',{name:saved[source],count:config.series.length});
        config.series.forEach((item,i)=>{const text=saved.series_items?.[i] || '';if(!text.includes(`${token}=`)||new RegExp(`${token}=auto:`).test(text))item[field]=result.colors[i];});
      }
    }
    selected.clear();
    drawControls(); changed();
  } catch (error) { status(`設定を開けませんでした: ${error.message}`, "error"); }
  finally{loading=false;updateButtons();if(renderWanted)renderPreview();}
}
$("#settings-file").addEventListener("change", async event => {
  const file = event.target.files[0]; event.target.value = "";
  if (file) await readSettings(file);
});
$("#retry-engine").addEventListener("click", () => location.reload());
$("#load-font").addEventListener("click", () => $("#font-file").click());
$("#font-file").addEventListener("change", async event => {
  const files = [...event.target.files]; event.target.value = "";
  if (!files.length || loading || exporting) return;
  loading = true; updateButtons();
  try {
    for (const file of files) {
      if (file.size > 20 * 1024 * 1024) throw new Error("フォントは20 MB以内にしてください。");
      const bytes=await file.arrayBuffer(), originalBytes=bytes.slice(0);
      const result = await request("font", { bytes });
      importedFonts.set(file.name,{name:file.name,family:result.family,bytes:originalBytes});
      for (const selector of ["#font-family", "#japanese-font-family"]) {
        const field=$(selector), option=[...field.options].find(option=>option.value===result.family);
        if(option) option.textContent=result.family;
        else field.add(new Option(result.family, result.family));
      }
      loadedFonts.add(result.family);
      config.axes.fontFamily = result.family;
    }
    drawControls(); changed();
  } catch (error) { status(error.message, "error"); }
  finally { loading = false; updateButtons(); if (renderWanted) renderPreview(); }
});
$$('[data-add-annotation]').forEach(button => button.addEventListener("click", () => {
  config.annotations ||= [];
  if (config.annotations.length >= 200) return;
  const type = button.dataset.addAnnotation;
  const offset=(config.annotations.length % 6)*.04;
  const base = { id: crypto.randomUUID(), type, axes_id: "primary", coordinate_system: "axes_fraction", visible: true, locked: false, zorder: 20, color: "#222222", opacity: 1 };
  config.annotations.push(type === "text" ? { ...base, x: .15+offset, y: .8-offset, text: "テキスト", font_size: 7, font_family: config.axes.fontFamily, rotation: 0, horizontal_alignment: "left", vertical_alignment: "baseline", bold: false, italic: false } : { ...base, x1: .2+offset, y1: .7-offset, x2: .4+offset, y2: .7-offset, line_width: .5, line_style: "-", arrow_style: "->", arrow_size: 7 });
  selected=new Set([base.id]);
  drawAnnotations(); changed();
}));
$("#annotation-list").addEventListener("click", event => {
  const select=event.target.closest('[data-select-annotation]');
  if(select){selectAnnotation(select.dataset.selectAnnotation,event.shiftKey);return;}
  const button = event.target.closest('[data-remove-annotation]');
  if (!button) return;
  const removed=config.annotations.splice(Number(button.dataset.removeAnnotation), 1); selected.delete(removed[0].id); drawAnnotations(); changed();
});


function openElementEditor(part,index=0) {
  if(!metadata || loading || exporting || renderRunning || renderedRevision!==revision)return;
  const fields=$('#element-editor-fields');let sources=[],title='';
  if(part==='series') {
    const series=config.series[index];if(!series)return;
    title=`系列${index+1}「${series.name}」の設定`;
    sources=[$(`#series-list [data-series-index="${index}"]`)];
    if(['XPS Fit','Particle Histogram'].includes(config.plotType))sources.push($('#preset-options'));
  } else if(part==='annotation') {
    const item=config.annotations?.[index];if(!item)return;
    selected=new Set([item.id]);drawAnnotations();syncInteractionSelection();
    title=({text:'テキスト',arrow:'矢印',segment:'線'})[item.type]+'の設定';
    sources=[$(`#annotation-list [data-annotation-index="${index}"]`)];
  } else if(part==='legend'){title='凡例の設定';sources=[$('.legend-controls')];}
  else if(part==='preset'){title='グラフの設定';sources=[$('#preset-options')];}
  else {
    const keys=part==='figureBackground'?['transparent','backgroundColor','backgroundAlpha']:
      part==='plotBackground'?['plotBackgroundEnabled','plotBackgroundColor','plotBackgroundAlpha']:
      part==='grid'?['grid','tickLength','hideXTicks','hideYTicks','hideMinorTicks','xMinorStep','yMinorStep']:
      ['spineColor','spineScale','spineLeft','spineRight','spineTop','spineBottom','yAxisRight','xAxisTop'];
    title=({figureBackground:'図全体の背景',plotBackground:'枠内の背景',grid:'目盛り線・グリッド',frame:'枠線'})[part]+'の設定';
    sources=keys.map(key=>$(`#plot-form [data-axis="${key}"]`)?.closest('label'));
  }
  if(part==='grid')sources.push(...$$('#plot-form [data-axis-auto="minor"]').map(input=>input.closest('label')));
  fields.innerHTML=sources.filter(Boolean).map(source=>source.outerHTML).join('');
  // Reuse the sidebar controls, restoring live values and color-picker handlers.
  fields.querySelectorAll('.color-control').forEach(wrapper=>{const input=wrapper.querySelector('input');if(input){input.hidden=false;delete input.dataset.paletteEnhanced;wrapper.replaceWith(input);}});
  fields.querySelectorAll('[id]').forEach(element=>element.removeAttribute('id'));
  fields.querySelectorAll('button,summary').forEach(element=>element.remove());
  fields.querySelectorAll('details').forEach(element=>element.open=true);
  fields.querySelectorAll('[data-axis],[data-series-field],[data-annotation-field],[data-option],[data-fill]').forEach(input=>{
    const data=input.dataset;
    const value=data.axis?config.axes[data.axis]:data.seriesField?config.series[Number(input.closest('[data-series-index]').dataset.seriesIndex)][data.seriesField]:
      data.annotationField?config.annotations[Number(input.closest('[data-annotation-index]').dataset.annotationIndex)][data.annotationField]:
      data.fill?config.options.fills[Number(input.closest('[data-fill-index]').dataset.fillIndex)][data.fill]:config.options?.[data.option] ?? input.value;
    if(input.type==='checkbox')input.checked=data.invert==='true'?!value:Boolean(value);else input.value=value;
  });
  $('#element-editor-title').textContent=title;
  $('#element-editor').showModal();enhanceColorInputs();syncAxisAutomaticControls();
}
$('#element-editor-fields').addEventListener('input',applyControlInput);
$('#close-element-editor').addEventListener('click',()=>$('#element-editor').close());
$('#element-editor').addEventListener('close',()=>{drawControls();positionInteractions();});

function syncInteractionSelection(){
  // A stationary click must preserve its DOM target for the next dblclick.
  $$('#figure-interactions .figure-drag-target').forEach(target=>target.classList[selected.has(target.dataset.dragId)?'add':'remove']('selected'));
  $$('#figure-interactions .annotation-handle').forEach(handle=>handle.remove());
  const imageBox=$('#figure-image').getBoundingClientRect();
  for(const target of figureResult?.geometry.annotations || []) {
    const item=config.annotations?.find(item=>item.id===target.id);if(!item || !selected.has(item.id) || item.locked)continue;
    const [x,y,w,h]=target.box;
    (target.points || [[x+w,y+h],[x+w/2,y-18/imageBox.height]]).forEach(([px,py],i)=>{
      const handle=document.createElement('button');handle.type='button';handle.className='annotation-handle';handle.dataset.dragId=item.id;
      handle.dataset.handle=target.points?String(i+1):i===0?'resize':'rotate';
      handle.setAttribute('aria-label',target.points?`注釈の${i===0?'始点':'終点'}を移動`:i===0?'文字サイズを変更':'文字を回転');
      Object.assign(handle.style,{left:`${px*100}%`,top:`${py*100}%`,width:`${14/view.zoom}px`,height:`${14/view.zoom}px`});$('#figure-interactions').append(handle);
    });
  }
}
function dataInteractions(overlay,imageBox){
  const geometry=figureResult.geometry;
  const background=(part,box,title)=>{
    const [x,y,w,h]=box,button=document.createElement('button');button.type='button';button.className='background-hit-target';button.dataset.editPart=part;
    Object.assign(button.style,{left:`${x*100}%`,top:`${y*100}%`,width:`${w*100}%`,height:`${h*100}%`});button.setAttribute('aria-label',title+'：ダブルクリックで設定');button.title=button.getAttribute('aria-label');overlay.append(button);
  };
  background('figureBackground',[0,0,1,1],'図全体の背景');background('plotBackground',geometry.axes,'枠内の背景');
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('line-hit-area','data-hit-areas');svg.setAttribute('viewBox','0 0 1000 1000');svg.setAttribute('preserveAspectRatio','none');overlay.append(svg);
  const points=segment=>segment.map(([x,y],i)=>`${i?'L':'M'}${x*1000},${y*1000}`).join('');
  const add=(entry,part)=>{
    const series=entry.index===undefined?null:config.series[entry.index];
    const title=series?`系列${entry.index+1}「${series.name}」：ダブルクリックで設定`:`${({frame:'枠線',grid:'目盛り線・グリッド',preset:'グラフ'})[part] || 'グラフ'}：ダブルクリックで設定`;
    const target=(tag,filled=false)=>{
      const node=document.createElementNS(svg.namespaceURI,tag);node.classList.add('data-hit-target');node.setAttribute('tabindex','0');node.setAttribute('role','button');node.setAttribute('aria-label',title);node.setAttribute('vector-effect','non-scaling-stroke');
      node.setAttribute('stroke-width',12);node.setAttribute('stroke-linecap','round');node.setAttribute('fill',filled?'transparent':'none');node.setAttribute('stroke',filled?'none':'transparent');
      node.style.pointerEvents=filled?'all':'stroke';if(series)node.dataset.editSeries=String(entry.index);else node.dataset.editPart=part;svg.append(node);return node;
    };
    const path=(entry.paths || []).map(points).join('');
    if(path)target('path').setAttribute('d',path);
    const markers=(entry.points || []).map(([x,y])=>`M${x*1000},${y*1000}h.001`).join('');
    if(markers){const node=target('path');node.setAttribute('d',markers);node.setAttribute('stroke-width',Math.max(12,2*(entry.pointRadius || 0)*imageBox.width));}
    const fills=(entry.boxes || []).map(([x,y,w,h])=>points([[x,y],[x+w,y],[x+w,y+h],[x,y+h]])+'Z').join('')+(entry.polygons || []).map(polygon=>points(polygon)+'Z').join('');
    if(fills)target('path',true).setAttribute('d',fills);
  };
  (geometry.grid || []).forEach(entry=>add(entry,'grid'));
  geometry.series.forEach(entry=>add(entry,entry.part));
  (geometry.spines || []).forEach(entry=>add(entry,'frame'));
  (geometry.depth || []).forEach(box=>add({boxes:[box]},'preset'));
}

function positionInteractions() {
  const overlay = $("#figure-interactions"), image = $("#figure-image");
  overlay.replaceChildren();
  if (!figureResult || image.hidden || !image.naturalWidth) return;
  const imageBox = image.getBoundingClientRect();
  const hitSize = 24;
  Object.assign(overlay.style, {left:'0',top:'0',width:'100%',height:'100%'});
  if(figureResult.geometry.series) dataInteractions(overlay,imageBox);
  const targets = [...(figureResult.geometry.axisLabels || []), ...(figureResult.geometry.tickLabels || []), ...[...figureResult.geometry.annotations].sort((a,b)=>(config.annotations?.find(item=>item.id===a.id)?.zorder??20)-(config.annotations?.find(item=>item.id===b.id)?.zorder??20))];
  if (figureResult.geometry.legend) targets.unshift({id:"legend",box:figureResult.geometry.legend});
  for (const target of targets) {
    const item = config.annotations?.find(item => item.id === target.id);
    const [x,y,w,h]=target.box;
    let button;
    if(target.points){
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('line-hit-area');svg.setAttribute('viewBox',`0 0 ${imageBox.width} ${imageBox.height}`);
      button=document.createElementNS(svg.namespaceURI,'line');
      for(const [i,[px,py]] of target.points.entries()){button.setAttribute(`x${i+1}`,px*imageBox.width);button.setAttribute(`y${i+1}`,py*imageBox.height);}
      button.setAttribute('stroke','transparent');button.setAttribute('stroke-width','20');button.setAttribute('tabindex','0');svg.append(button);overlay.append(svg);
    } else {
      button=document.createElement('button');button.type="button";
      // Adjacent X/Y ticks must not cover each other's glyphs on a small plot.
      const minimum = target.axis ? target.kind === 'ticks' ? 16 : 24 : hitSize;
      const width=Math.max(w*imageBox.width,minimum)/view.zoom,height=Math.max(h*imageBox.height,minimum)/view.zoom;
      Object.assign(button.style,{left:`calc(${x*100}% - ${Math.max(0,minimum-w*imageBox.width)/2/view.zoom}px)`,top:`calc(${y*100}% - ${Math.max(0,minimum-h*imageBox.height)/2/view.zoom}px)`,width:`${width}px`,height:`${height}px`});
      overlay.append(button);
    }
    button.classList.add("figure-drag-target");if(selected.has(target.id))button.classList.add('selected');
    if(target.kind !== 'ticks')button.dataset.dragId=target.id;
    if(target.axis) {button.dataset.editAxis = target.axis; button.dataset.axisKind = target.kind; if(target.kind === 'ticks')button.classList.add('axis-tick-target');}
    button.title=target.axis ? `${axisName(target.axis)}軸${target.kind === 'label' ? 'ラベル：ドラッグで移動・ダブルクリックで設定' : '目盛り：ダブルクリックで設定'}` : target.id==="legend"?"凡例をドラッグして移動":"注釈をドラッグして移動";
    button.setAttribute('aria-label',button.title);
    if(item?.locked)button.title+='（位置固定）';
    if(item && selected.has(item.id) && !item.locked){
      const handleSize = 14;
      const handles=target.points || [[x+w,y+h],[x+w/2,y-18/imageBox.height]];
      handles.forEach(([px,py],i)=>{
        const handle=document.createElement('button');handle.type='button';handle.className='annotation-handle';handle.dataset.dragId=item.id;
        handle.dataset.handle=target.points?String(i+1):i===0?'resize':'rotate';
        handle.setAttribute('aria-label',target.points?`注釈の${i===0?'始点':'終点'}を移動`:i===0?'文字サイズを変更':'文字を回転');
        Object.assign(handle.style,{left:`${px*100}%`,top:`${py*100}%`,width:`${handleSize/view.zoom}px`,height:`${handleSize/view.zoom}px`});overlay.append(handle);
      });
    }
  }
}
$("#figure-image").addEventListener("load", layoutPreview);
new ResizeObserver(layoutPreview).observe($("#figure-paper"));
$("#figure-interactions").addEventListener("pointerdown", event => {
  if(event.button !== 0)return;
  const target=event.target.closest('[data-drag-id]');
  if(!target || renderedRevision !== revision || loading || exporting || renderRunning) return;
  const id=target.dataset.dragId, item=config.annotations?.find(item=>item.id===id);
  target.focus({preventScroll:true});
  if(item){
    if(event.shiftKey){if(selected.has(id))selected.delete(id);else selected.add(id);}else if(!selected.has(id))selected=new Set([id]);
    drawAnnotations();
  }
  if(item?.locked || (item && !selected.has(id))){syncInteractionSelection();return;}
  const imageBox=$("#figure-image").getBoundingClientRect();
  dragging={pointerId:event.pointerId,id,item,axis:target.dataset.editAxis,anchor:figureResult.geometry.axisLabels?.find(label=>label.id===id)?.anchor,start:item?structuredClone(item):null,items:(config.annotations||[]).filter(item=>selected.has(item.id)&&!item.locked).map(item=>({item,start:structuredClone(item)})),handle:target.dataset.handle,x:event.clientX,y:event.clientY,box:imageBox,axes:figureResult.geometry.axes,legend:figureResult.geometry.legend};
  target.setPointerCapture(event.pointerId); event.preventDefault();
});
$("#figure-interactions").addEventListener("pointermove", event => {
  if(!dragging || dragging.pointerId !== event.pointerId) return;
  const dx=event.clientX-dragging.x,dy=event.clientY-dragging.y;
  if(!dragging.handle)event.target.style.transform=`translate(${dx/view.zoom}px,${dy/view.zoom}px)`;
});
function finishDrag(event) {
  if(!dragging || dragging.pointerId !== event.pointerId) return;
  const d=dragging; dragging=null;
  if(Math.hypot(event.clientX-d.x,event.clientY-d.y)<3){
    // Keep the label's DOM node between clicks so the browser emits dblclick.
    event.target.style.transform='';syncInteractionSelection();
    return;
  }
  const [ax,ay,aw,ah]=d.axes, dx=(event.clientX-d.x)/d.box.width/aw,dy=-(event.clientY-d.y)/d.box.height/ah;
  if(d.axis && d.anchor) {
    config.axes[`${d.axis}LabelX`] = Math.max(-10,Math.min(10,d.anchor[0]+dx)).toFixed(4);
    config.axes[`${d.axis}LabelY`] = Math.max(-10,Math.min(10,d.anchor[1]+dy)).toFixed(4);
    for(const key of ['LabelX','LabelY'])$$(`[data-axis="${d.axis}${key}"]`).forEach(input=>input.value=config.axes[`${d.axis}${key}`]);
  } else if(d.id==="legend") {
    const [x,y,w,h]=d.legend;
    config.axes.legendX=((x+w/2-ax)/aw+dx).toFixed(4);
    config.axes.legendY=(1-(y+h/2-ay)/ah+dy).toFixed(4);
    $$('[data-axis="legendX"],[data-axis="legendY"]').forEach(input=>input.value=config.axes[input.dataset.axis]);
  } else {
    if(d.handle==='resize')d.item.font_size=Math.max(2,Math.min(200,Number(d.start.font_size)+((event.clientX-d.x)-(event.clientY-d.y))/d.box.width*30));
    else if(d.handle==='rotate'){d.item.rotation=(Number(d.start.rotation)+(event.clientX-d.x)/d.box.width*360)%360;if(event.shiftKey)d.item.rotation=Math.round(d.item.rotation/15)*15;}
    else for(const {item,start} of d.handle?[{item:d.item,start:d.start}]:d.items){
      const keys=start.type==='text'?['x','y']:d.handle?[`x${d.handle}`,`y${d.handle}`]:['x1','y1','x2','y2'];
      for(const key of keys)item[key]=shiftCoordinate(start[key],key.startsWith('x')?dx:dy,figureResult[`${key[0]}Range`],key.startsWith('y')?figureResult.yDataScale || config.axes.yScale:config.axes.xScale,start.coordinate_system);
      if(event.shiftKey && d.handle && start.type!=='text'){
        const other=d.handle==='1'?'2':'1';
        const snapped=snapPoint({x:Number(item[`x${other}`]),y:Number(item[`y${other}`])},{x:Number(item[`x${d.handle}`]),y:Number(item[`y${d.handle}`])});item[`x${d.handle}`]=snapped.x;item[`y${d.handle}`]=snapped.y;
      }
    }
    drawAnnotations();
  }
  changed();
}
$("#figure-interactions").addEventListener("pointerup",finishDrag);
$("#figure-interactions").addEventListener("pointercancel",()=>{dragging=null;positionInteractions();});

function selectAnnotation(id, multiple=false){
  if(multiple){if(selected.has(id))selected.delete(id);else selected.add(id);}else selected=new Set([id]);
  drawAnnotations();positionInteractions();
}
function deleteAnnotations(){
  if(!selected.size || loading || exporting)return;config.annotations=(config.annotations||[]).filter(item=>!selected.has(item.id));selected.clear();drawAnnotations();changed();
}
function copyAnnotations(){clipboard=(config.annotations||[]).filter(item=>selected.has(item.id)).map(item=>structuredClone(item));}
function pasteAnnotations(){
  config.annotations ||= [];selected.clear();
  for(const source of clipboard){if(config.annotations.length>=200)break;const item=structuredClone(source);item.id=crypto.randomUUID();item.locked=false;
    for(const key of item.type==='text'?['x','y']:['x1','y1','x2','y2'])item[key]=shiftCoordinate(item[key],.025,figureResult?.[`${key[0]}Range`]||[0,1],key.startsWith('y')?figureResult?.yDataScale || config.axes.yScale:config.axes.xScale,item.coordinate_system);
    config.annotations.push(item);selected.add(item.id);
  }drawAnnotations();changed();
}
$("#delete-annotation").addEventListener('click',deleteAnnotations);
$("#copy-annotation").addEventListener('click',()=>{copyAnnotations();pasteAnnotations();});
$("#panel-label").addEventListener('click',()=>{
  config.annotations ||= [];let label=config.annotations.find(item=>['__panel_label__','panel-label'].includes(item.id));
  if(!label){label={id:'__panel_label__',type:'text',axes_id:'primary',coordinate_system:'axes_fraction',x:0,y:1.02,text:'(a)',font_size:8,font_family:config.axes.fontFamily,rotation:0,color:'#000000',opacity:1,bold:false,italic:false,horizontal_alignment:'left',vertical_alignment:'bottom',visible:true,locked:false,zorder:30};config.annotations.push(label);}
  selected=new Set([label.id]);drawAnnotations();changed();
});
$$('[data-align]').forEach(button=>button.addEventListener('click',async()=>{
  if(selected.size<2 || loading || exporting)return;
  loading=true;updateButtons();
  try{const result=await request('align',{config:structuredClone(config),ids:[...selected],operation:button.dataset.align});config.annotations=result.annotations;drawAnnotations();changed();}
  catch(error){status(error.message,'error');}
  finally{loading=false;updateButtons();if(renderWanted)renderPreview();}
}));
$$('[data-layer]').forEach(button=>button.addEventListener('click',()=>{const items=config.annotations||[],top=Math.max(20,...items.map(item=>item.zorder||20)),bottom=Math.min(20,...items.map(item=>item.zorder||20));items.filter(item=>selected.has(item.id)).forEach((item,i)=>item.zorder=button.dataset.layer==='front'?top+1+i:bottom-1-i);changed();}));
function restoreHistory(redo=false){
  const source=redo?future:history,destination=redo?history:future;if(!source.length)return;
  destination.push(structuredClone(config));config=source.pop();restoring=true;selected.clear();drawControls();changed();restoring=false;
}
$("#undo").addEventListener('click',()=>restoreHistory());$("#redo").addEventListener('click',()=>restoreHistory(true));

function layoutPreview(){
  const paper=$("#figure-paper"),image=$("#figure-image"),content=$("#figure-content");if(image.hidden||!image.naturalWidth||!paper.clientWidth||!paper.clientHeight)return;
  const padding=40;
  const availableWidth=Math.max(40,paper.clientWidth-padding),availableHeight=Math.max(40,paper.clientHeight-padding);
  const scale=Math.min(availableWidth/image.naturalWidth,availableHeight/image.naturalHeight);
  content.style.width=`${image.naturalWidth*scale}px`;content.style.height=`${image.naturalHeight*scale}px`;
  content.style.transform=`translate(${view.x}px,${view.y}px) scale(${view.zoom})`;$("#zoom-level").textContent=`${Math.round(view.zoom*100)}%`;
  positionInteractions();
}
function zoomPreview(factor,point={x:0,y:0}){view=zoomAt(view,factor,point);layoutPreview();}
$("#zoom-in").addEventListener('click',()=>zoomPreview(1.1));$("#zoom-out").addEventListener('click',()=>zoomPreview(1/1.1));
$("#zoom-reset").addEventListener('click',()=>{view={zoom:1,x:0,y:0};layoutPreview();});
$("#figure-paper").addEventListener('wheel',event=>{
  if((!event.ctrlKey && !event.metaKey) || !event.deltaY)return;event.preventDefault();
  const box=event.currentTarget.getBoundingClientRect();zoomPreview(event.deltaY<0?1.1:1/1.1,{x:event.clientX-box.left-box.width/2,y:event.clientY-box.top-box.height/2});
},{passive:false});
$("#figure-paper").addEventListener('pointerdown',event=>{
  if(event.target.closest('[data-drag-id],[data-edit-axis],[data-edit-series],[data-edit-part]:not([data-edit-part$=Background])') || event.button!==0)return;
  if(!event.shiftKey)selected.clear();drawAnnotations();syncInteractionSelection();panning={pointerId:event.pointerId,x:event.clientX,y:event.clientY,start:{...view},select:event.shiftKey};
  if(event.shiftKey){event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault();}
});
$("#figure-paper").addEventListener('pointermove',event=>{
  if(!panning || panning.pointerId !== event.pointerId)return;
  if(panning.select){const box=event.currentTarget.getBoundingClientRect();let marquee=$('#selection-marquee');if(!marquee){marquee=document.createElement('div');marquee.id='selection-marquee';event.currentTarget.append(marquee);}Object.assign(marquee.style,{left:`${Math.min(event.clientX,panning.x)-box.left}px`,top:`${Math.min(event.clientY,panning.y)-box.top}px`,width:`${Math.abs(event.clientX-panning.x)}px`,height:`${Math.abs(event.clientY-panning.y)}px`});return;}
  if(Math.hypot(event.clientX-panning.x,event.clientY-panning.y)<3)return;
  event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault();
  view={...panning.start,x:panning.start.x+event.clientX-panning.x,y:panning.start.y+event.clientY-panning.y};layoutPreview();
});
$("#figure-paper").addEventListener('pointerup',event=>{
  if((panning && panning.pointerId !== event.pointerId))return;
  if(panning?.select && figureResult){const box=$('#figure-image').getBoundingClientRect(),left=Math.min(event.clientX,panning.x),right=Math.max(event.clientX,panning.x),top=Math.min(event.clientY,panning.y),bottom=Math.max(event.clientY,panning.y);for(const item of figureResult.geometry.annotations){const [x,y,w,h]=item.box;if(box.left+x*box.width>=left && box.left+(x+w)*box.width<=right && box.top+y*box.height>=top && box.top+(y+h)*box.height<=bottom)selected.add(item.id);}drawAnnotations();positionInteractions();}
  $('#selection-marquee')?.remove();panning=null;
});
$("#figure-paper").addEventListener('pointercancel',()=>{$('#selection-marquee')?.remove();panning=null;});
function nearestSeries(event,fallback) {
  if(!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY))return fallback;
  const box=$('#figure-image').getBoundingClientRect(),pointer=[event.clientX-box.left,event.clientY-box.top];
  const pixel=([x,y])=>[x*box.width,y*box.height];
  const distance=([x,y])=>(x-pointer[0])**2+(y-pointer[1])**2;
  const segment=(a,b)=>{
    a=pixel(a);b=pixel(b);const dx=b[0]-a[0],dy=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((pointer[0]-a[0])*dx+(pointer[1]-a[1])*dy)/(dx*dx+dy*dy || 1)));
    return distance([a[0]+t*dx,a[1]+t*dy]);
  };
  let best=fallback,limit=36,priority=0;
  for(const entry of figureResult?.geometry.series || []) {
    if(entry.index===undefined)continue;
    let value=Infinity,pointHit=false;
    for(const point of entry.points || []){const d=Math.sqrt(distance(pixel(point)))-(entry.pointRadius || 0)*box.width;value=Math.min(value,Math.max(0,d)**2);if(d<=0)pointHit=true;}
    for(const path of entry.paths || []){
      if(path.length===1)value=Math.min(value,distance(pixel(path[0])));
      for(let i=1;i<path.length;i++)value=Math.min(value,segment(path[i-1],path[i]));
    }
    for(const [x,y,w,h] of entry.boxes || [])if(pointer[0]>=x*box.width && pointer[0]<=(x+w)*box.width && pointer[1]>=y*box.height && pointer[1]<=(y+h)*box.height)value=0;
    if(value<limit || (value===limit && Number(pointHit)>=priority)){limit=value;best=entry.index;priority=Number(pointHit);}
  }
  return best;
}

function editPreviewElement(event) {
  const axis=event.target.closest('[data-edit-axis]');
  if(axis){event.preventDefault();openAxisEditor(axis.dataset.editAxis,axis.dataset.axisKind);return;}
  const series=event.target.closest('[data-edit-series]');
  if(series){event.preventDefault();openElementEditor('series',nearestSeries(event,Number(series.dataset.editSeries)));return;}
  const part=event.target.closest('[data-edit-part]');
  if(part){event.preventDefault();openElementEditor(part.dataset.editPart);return;}
  const target=event.target.closest('[data-drag-id]');if(!target)return;
  event.preventDefault();
  if(target.dataset.dragId==='legend')openElementEditor('legend');
  else openElementEditor('annotation',(config.annotations||[]).findIndex(item=>item.id===target.dataset.dragId));
}
$('#figure-interactions').addEventListener('dblclick',editPreviewElement);
$('#figure-interactions').addEventListener('keydown',event=>{if(event.key==='Enter' || event.key===' ')editPreviewElement(event);});
// Each glyph retains its own small hit area; highlight every number on that axis.
function highlightTicks(event,active){
  const target=event.target.closest('[data-axis-kind="ticks"]');if(!target)return;
  const next=event.relatedTarget?.closest?.('[data-axis-kind="ticks"]');
  if(!active && next?.dataset.editAxis===target.dataset.editAxis)return;
  $$(`#figure-interactions [data-axis-kind="ticks"][data-edit-axis="${target.dataset.editAxis}"]`).forEach(field=>field.classList[active?'add':'remove']('highlighted'));
}
for(const name of ['pointerover','focusin'])$('#figure-interactions').addEventListener(name,event=>highlightTicks(event,true));
for(const name of ['pointerout','focusout'])$('#figure-interactions').addEventListener(name,event=>highlightTicks(event,false));
window.addEventListener('keydown',event=>{
  if($('#color-panel').open || $('#axis-editor').open || $('#element-editor').open || $('#save-dialog').open || $('#paste-dialog').open)return;
  if(event.target.matches('input,textarea,select') || event.target.isContentEditable)return;
  const control=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();
  if(key==='delete'||key==='backspace'){if(selected.size){event.preventDefault();deleteAnnotations();}}
  else if(key==='escape'){selected.clear();drawAnnotations();positionInteractions();}
  else if(control&&key==='c'){if(selected.size){event.preventDefault();copyAnnotations();}}
  else if(control&&key==='a'){event.preventDefault();selected=new Set((config.annotations||[]).filter(item=>item.visible).map(item=>item.id));drawAnnotations();positionInteractions();}
  else if(control&&key==='v'){if(event.altKey){event.preventDefault();openPasteDialog();}else if(clipboard.length){event.preventDefault();pasteAnnotations();}}
  else if(control&&key==='z'){event.preventDefault();restoreHistory(event.shiftKey);}
  else if(control&&key==='y'){event.preventDefault();restoreHistory(true);}
  else if(control&&['+','=','-','0'].includes(key)){event.preventDefault();if(key==='0')$('#zoom-reset').click();else zoomPreview(key==='-'?1/1.1:1.1);}
  else if(control&&key==='s'){event.preventDefault();$(event.shiftKey?'#save-settings':'#save-project').click();}
  else if(control&&key==='o'){event.preventDefault();$(event.altKey?'#data-file':event.shiftKey?'#open-settings':'#open-project').click();}
});
try { startWorker(); }
catch (error) { fatal(`描画機能を開始できませんでした。ブラウザを更新してください。${error.message}`); }
