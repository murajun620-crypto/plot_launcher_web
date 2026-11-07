import {setupFigureBridge,getFigureBridgeContext} from './bridge-host.mjs?v=dd5569f5b97e';
import {setupDirectSendButton} from './direct-transfer.mjs?v=dd5569f5b97e';
import {identifyPlotProject,plotSheetIndex,mergePlotCheckpoint,samePlotCheckpoint,createPlotAcknowledgements} from './plot-sync.mjs?v=dd5569f5b97e';
import { compactHelp, documentSaver, filePickerOptions } from "./ui-common.js?v=9127ec4c4f31";
import { UNIT_FAMILIES, unitSuggestion, unitConversion, convertAxisUnit } from "./units.js?v=9127ec4c4f31";
import { parsePastedTable, pastedTableCSV } from "./data-paste.js?v=9127ec4c4f31";
import { configForSheet, sheetFileStem, zipFiles } from "./sheets.js?v=dd5569f5b97e";
import { USER_PRESET_KEY, USER_PRESET_FILE_LIMIT, captureUserPreset, encodeUserPresets, decodeUserPresets, readUserPresets, writeUserPresets, upsertUserPreset, renameUserPreset, mergeUserPresets, applyUserPreset, userPresetName } from "./user-presets.js?v=dd5569f5b97e";
import { APP_VERSION, COLORS, COLOR_PALETTE, UNIT_GROUPS, makeProject as encodePlotProject, parseProject, PROJECT_MAX_SIZE, applyPreset, createSeries, initialSeries, defaultAxes, makeSettings, restoreSettings, safeStem, sampleCSV, zoomAt, shiftCoordinate, snapPoint, parseCoefficient } from "./state.js?v=dd5569f5b97e";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const APP_BUILD = 'dd5569f5b97e';
function makeProject(settings,data,fonts,workspace={}){
  const live=sourceData&&data.filename===sourceData.filename&&(data.bytes===sourceData.bytes||data.files&&data.files===sourceData.files);
  const projectId=workspace.figureStudioProjectId||data.figureStudioProjectId||(live?(sourceData.figureStudioProjectId||=crypto.randomUUID()):crypto.randomUUID());
  return encodePlotProject(settings,data,fonts,{...workspace,figureStudioProjectId:projectId});
}

function positionDialog(dialog, left, top) {
  const box=dialog.getBoundingClientRect(), gap=8;
  const width=document.documentElement?.clientWidth || window.innerWidth,height=document.documentElement?.clientHeight || window.innerHeight;
  const x=Math.max(gap,Math.min(left,Math.max(gap,width-box.width-gap)));
  const y=Math.max(gap,Math.min(top,Math.max(gap,height-box.height-gap)));
  Object.assign(dialog.style,{position:'fixed',inset:'auto',margin:'0',left:`${Math.round(x)}px`,top:`${Math.round(y)}px`});
}
function keepDialogInView(dialog) {
  if(!dialog.open || !dialog.style.left)return;
  const box=dialog.getBoundingClientRect();positionDialog(dialog,box.left,box.top);
}
function showDialog(selector) {
  const dialog=$(selector);dialog.showModal();keepDialogInView(dialog);
}
function enableDialogDrag(dialog) {
  const heading=dialog.querySelector('.dialog-heading');
  if(!heading || dialog.dataset.movable)return;
  dialog.dataset.movable='true';dialog.classList.add('movable-dialog');
  heading.title='ドラッグで移動。矢印キーで微調整。ダブルクリックで中央に戻す。';
  heading.tabIndex=0;heading.setAttribute('role','group');heading.setAttribute('aria-label','ウィンドウの位置（ドラッグまたは矢印キーで移動）');
  const interactive=target=>target.closest('button,input,select,textarea,a,label,summary,[contenteditable]');
  let drag=null;
  const stop=()=>{
    if(!drag)return;
    const id=drag.id;drag=null;dialog.classList.remove('dialog-dragging');
    if(heading.hasPointerCapture?.(id))heading.releasePointerCapture(id);
  };
  const move=event=>{
    if(!drag || event.pointerId!==drag.id)return;
    positionDialog(dialog,drag.left+event.clientX-drag.x,drag.top+event.clientY-drag.y);
  };
  heading.addEventListener('pointerdown',event=>{
    if(event.button!==0 || event.isPrimary===false || interactive(event.target))return;
    const box=dialog.getBoundingClientRect();
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:box.left,top:box.top};
    event.preventDefault();heading.focus({preventScroll:true});heading.setPointerCapture(event.pointerId);
    dialog.classList.add('dialog-dragging');
  });
  heading.addEventListener('pointermove',move);
  heading.addEventListener('pointerup',event=>{if(event.pointerId===drag?.id){move(event);stop();}});
  heading.addEventListener('pointercancel',event=>{if(event.pointerId===drag?.id)stop();});
  heading.addEventListener('lostpointercapture',event=>{if(event.pointerId===drag?.id)stop();});
  dialog.addEventListener('close',stop);
  const center=()=>{
    stop();
    for(const key of ['position','inset','margin','left','top','right','bottom'])dialog.style.removeProperty(key);
  };
  heading.addEventListener('dblclick',event=>{if(!interactive(event.target)){event.preventDefault();center();}});
  heading.addEventListener('keydown',event=>{
    if(event.target!==heading || event.ctrlKey || event.metaKey || event.altKey)return;
    const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
    if(!direction)return;
    event.preventDefault();event.stopPropagation();
    const box=dialog.getBoundingClientRect(),step=event.shiftKey?20:5;
    positionDialog(dialog,box.left+direction[0]*step,box.top+direction[1]*step);
  });
  new ResizeObserver(()=>keepDialogInView(dialog)).observe(dialog);
}

const escapeHTML = text => String(text).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
const MICRO_HINT = 'μは \\micro と入力できます（例：\\microm、\\microA）。';
const LABEL_PADDING_BASE = defaultAxes().xLabelPad;
const LABEL_PADDING_HINT = `0は標準の余白（${LABEL_PADDING_BASE} pt）。正の値で広く、負の値で狭くします。`;
const isLabelPadding = key => /^(x|y|y2)LabelPad$/.test(key);
const axisSetting = key => config.axes[key] ?? (['xGrid','yGrid'].includes(key) ? Boolean(config.axes.grid) : /^(?:grid|minorGrid)(?:Style|Width|Color|Alpha)$/.test(key) ? defaultAxes()[key] : undefined);
// Keep saved settings compatible; controls show padding offsets and line widths in pt.
const fontPointBase = key => ({fontScale:8,tickFontScale:7,labelFontScale:8,legendFontScale:7})[key] * (key === 'fontScale' ? 1 : Number(config.axes.fontScale));
const axisControlValue = (key, value) => isLabelPadding(key) ? Number((Number(value) - LABEL_PADDING_BASE).toPrecision(12)) : key === 'spineScale' ? Number((Number(value) * .8).toPrecision(12)) : /^(fontScale|tickFontScale|labelFontScale|legendFontScale)$/.test(key) ? Number((Number(value)*fontPointBase(key)).toPrecision(12)) : value;
const axisConfigValue = (key, value) => isLabelPadding(key) ? Number((Number(value) + LABEL_PADDING_BASE).toPrecision(12)) : key === 'spineScale' ? Number((Number(value) / .8).toPrecision(12)) : /^(fontScale|tickFontScale|labelFontScale|legendFontScale)$/.test(key) ? Number((Number(value)/fontPointBase(key)).toPrecision(12)) : value;
const editableXY = type => !['XPS Fit','Particle Histogram','bar_graph_general','Raman 3D'].includes(type);
const seriesControlValue = (key,value) => key==='trendFontSize' ? Number((Number(value || 6)*Number(config.axes.fontScale)).toPrecision(12)) : value;
const SERIES_APPEARANCE_FIELDS = ['mode','lineWidth','markerSize','lineStyle','marker','lineAlpha','scatterColor','markerEdgeColor','markerFaceColor','markerEdgeAlpha','markerFaceAlpha'];
const PROCESSING_FIELDS = ['xFactor','yFactor','xOffset','yOffset','detrend','detrendMin','detrendMax','detrendSlope','density','currentUnit','area','areaUnit','normalization','referenceMode','referencePoint','referenceMin','referenceMax','referenceValue'];
const opacityPercent = value => `${Number((Number(value) * 100).toFixed(2))}%`;
const opacityControl = (attributes, label, value = 1) => `<label class="opacity-control" title="0%は透明、100%は不透明。←／→キーで1%ずつ調整できます。"><span class="opacity-caption">${escapeHTML(label)}<output aria-hidden="true">${opacityPercent(value)}</output></span><input ${attributes} data-opacity type="range" min="0" max="1" step="0.01" value="${escapeHTML(value)}" aria-label="${escapeHTML(label)}" aria-valuetext="${opacityPercent(value)}"></label>`;
const UNIT_HINT = '互換性のある単位をリストから選ぶと数値も換算します。自由入力は表記のみを変更します。元データは保持します。';
const readableUnit = unit => String(unit || '').replace(/\$\^\{?-1\}?\$/g, '⁻¹').replace(/\$\^\{?2\}?\$/g, '²');
const UNIT_VALUES = new Set(['auto', '', ...UNIT_GROUPS.flatMap(([, units]) => units.map(unit => Array.isArray(unit) ? unit[0] : unit))]);
const EXTRA_UNITS = [...new Set(UNIT_FAMILIES.flatMap(family=>family.map(([unit])=>unit)))].filter(unit=>!UNIT_VALUES.has(unit));
EXTRA_UNITS.forEach(unit=>UNIT_VALUES.add(unit));
let worker, engineReady = false, requestID = 0;
const requests = new Map();
let metadata = null, config = { axes: defaultAxes(), series: [] };
let loading = false, exporting = false, sample = false, loadedHeader = 1;
let revision = 0, renderedRevision = -1, renderRunning = false, renderWanted = false, renderTimer;
let previewURL, figureResult, dragging, livePreview;
let colorTarget;
const recentColors = [];
let colormapControlConfig=null,colormapPreviewToken=0,colormapPreviewTimer,colormapApplying=false;
const colormapRamps=new Map();
let sourceData = null;
var figureStudioBridge,figureStudioDirectSender;
let sourceHandle = null, sourceDirectory = null, saveDirectory = null;
const sourceHandles = new WeakMap();
let dataFileHandles = [];
const folderSupported = typeof window.showDirectoryPicker === 'function';
const importedFonts = new Map();
let savedProjectState = null;
let projectHandle=null, projectFilename='';
let updateChecking=false, updateReloading=false, availableUpdate=null, updateRecovery=null;
let pendingDataFiles = null;
let sampleCatalog = null, sampleCatalogPromise = null, sampleGroup = 'all', pendingSampleId = null;
let sheetSettings = new Map(), cancelBatch = false;
let sheetMode = 'shared', sharedSettings = null;
let myPresets = [];
let unitAdvice = null, unitAdviceSource = null;
const declinedUnits = new Set();
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
  if (!sourceData && ![...importedFonts.values()].some(font=>!font.automatic)) return false;
  const current = projectEditState(), saved = savedProjectState;
  return !saved || current.source !== saved.source || current.content !== saved.content ||
    current.fonts.length !== saved.fonts.length || current.fonts.some((font,index)=>font !== saved.fonts[index]);
}

window.addEventListener('beforeunload', event => {
  if(updateReloading)return;
  if(figureWorkspaceSavedSignature&&window.FigureStudioWorkspaceState?.signature()===figureWorkspaceSavedSignature)return;
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
const FONT_FOLDERS = {
  windows: [['標準フォント', '%WINDIR%\\Fonts'], ['ユーザーのフォント', '%LOCALAPPDATA%\\Microsoft\\Windows\\Fonts']],
  mac: [['追加の標準フォント（Arialなど）', '/System/Library/Fonts/Supplemental'], ['標準フォント', '/System/Library/Fonts'], ['全ユーザーのフォント', '/Library/Fonts'], ['ユーザーのフォント', '~/Library/Fonts']],
};
let localFontChoices = [];
let fontQueryID = 0, fontQueryRunning = false;
let fontAccess = typeof window.queryLocalFonts === 'function' ? 'idle' : 'unsupported';
let fontAccessMessage = '';
const failedLocalFonts = new Set(), localFontAliases = new Map();

function desktopAppearance() {
  const numeric = (key, label, min = 0, max = 3, step = 0.1) => `<label${isLabelPadding(key) ? ` title="${LABEL_PADDING_HINT}"` : ''}>${label}<input data-axis="${key}" type="number" min="${axisControlValue(key, min)}" max="${axisControlValue(key, max)}" step="${step}"></label>`;
  const check = (key, label) => `<label><input data-axis="${key}" type="checkbox">${label}</label>`;
  const displayCell = (key, label) => `<td><label><input data-axis="${key}" data-invert="true" type="checkbox"><span>${label}を表示</span></label></td>`;
  $("#desktop-appearance").innerHTML = `
    <details class="settings-panel" id="font-settings"><summary>フォント</summary>
    <label class="full-field" title="PCのフォントを自動で一覧に追加し、選ぶと読み込みます。初回のみブラウザの許可が必要です。">図のフォント<select id="font-family" data-axis="fontFamily"><option value="Arial">Arial</option><option>Liberation Sans</option><option>Noto Sans JP</option><option>DejaVu Sans</option></select></label>
    <p id="font-status" class="preset-message" role="status" hidden></p>
    <label class="full-field">日本語フォント<select id="japanese-font-family" data-axis="japaneseFontFamily"><option>Noto Sans JP</option><option>Liberation Sans</option><option>DejaVu Sans</option></select></label>
    <button type="button" id="load-font" class="button quiet">詳細設定</button><input id="font-file" type="file" accept=".ttf,.otf,.ttc" multiple hidden>
    <p class="field-hint">Arialと選択したPCのフォントを自動で読み込みます。アクセスできない場合はArialをLiberation Sansで代替します。日本語はNoto Sans JP、数式はSTIX Sansを使います。ファイルからの読み込みは詳細設定にあります。</p>
    <label title="軸ラベルを基準に、目盛り・凡例もまとめて拡大縮小します。標準は8 ptです。">全体のフォントサイズ (pt)<input id="font-scale" data-axis="fontScale" type="number" min="4" max="24" step="0.1" value="8" required></label>
    <div class="field-grid">${numeric("tickFontScale", "目盛りのフォントサイズ (pt)", .2)}${numeric("labelFontScale", "軸ラベルのフォントサイズ (pt)", .2)}</div></details>
    <details class="settings-panel"><summary>余白・ラベルと目盛りの表示</summary>
    <div class="field-grid">${numeric("xLabelPad", "Xラベル追加余白 (pt)", -100, 100)}${numeric("yLabelPad", "Yラベル追加余白 (pt)", -100, 100)}${numeric("xTickPad", "X目盛り追加余白 (pt)", -100, 100)}${numeric("yTickPad", "Y目盛り追加余白 (pt)", -100, 100)}</div>
    <fieldset class="axis-control-group"><legend>ラベル・目盛りの表示</legend>
      <table class="axis-visibility-table"><thead><tr><th scope="col">項目</th><th scope="col">X軸</th><th scope="col">Y軸</th></tr></thead><tbody>
        <tr><th scope="row">軸ラベル</th>${displayCell("hideXLabel", "X軸ラベル")}${displayCell("hideYLabel", "Y軸ラベル")}</tr>
        <tr><th scope="row">目盛り数値</th>${displayCell("hideXTickLabels", "X軸の目盛り数値")}${displayCell("hideYTickLabels", "Y軸の目盛り数値")}</tr>
        <tr><th scope="row">目盛り線</th>${displayCell("hideXTicks", "X軸の目盛り線")}${displayCell("hideYTicks", "Y軸の目盛り線")}</tr>
        <tr><th scope="row">副目盛線</th>${displayCell("hideXMinorTicks", "X軸の副目盛線")}${displayCell("hideYMinorTicks", "Y軸の副目盛線")}</tr>
      </tbody></table>
    </fieldset>
    ${numeric("tickLength", "目盛りの長さ（標準比）", 0, 5)}</details>
    <details class="settings-panel"><summary>グリッド線</summary><div id="grid-settings-content">${gridControls()}</div></details>
    <details class="settings-panel"><summary>枠線・軸の位置</summary><div id="frame-settings-content" class="frame-settings">
      <fieldset class="axis-control-group"><legend>表示する枠線</legend><div class="frame-edge-picker">
        <div class="frame-guide" aria-hidden="true">グラフ</div>
        <label class="frame-edge frame-top"><input data-axis="spineTop" type="checkbox" aria-label="上枠を表示">上枠</label>
        <label class="frame-edge frame-left"><input data-axis="spineLeft" type="checkbox" aria-label="左枠を表示">左枠</label>
        <label class="frame-edge frame-right"><input data-axis="spineRight" type="checkbox" aria-label="右枠を表示">右枠</label>
        <label class="frame-edge frame-bottom"><input data-axis="spineBottom" type="checkbox" aria-label="下枠を表示">下枠</label>
      </div></fieldset>
      <fieldset class="axis-control-group"><legend>色・太さ</legend><div class="field-grid"><label>枠線の色<input data-axis="spineColor" type="color"></label>${numeric("spineScale", "枠線の太さ (pt)", .1, 5, .01)}</div></fieldset>
      <fieldset class="axis-control-group"><legend>軸の位置</legend><div class="field-grid">
        <label>X軸<select data-axis="xAxisTop" data-axis-boolean="true"><option value="false">下側</option><option value="true">上側</option></select></label>
        <label>Y軸<select data-axis="yAxisRight" data-axis-boolean="true"><option value="false">左側</option><option value="true">右側</option></select></label>
      </div></fieldset>
    </div></details>
    <details class="settings-panel"><summary>背景色</summary>
    <fieldset class="axis-control-group"><legend>図全体</legend>
    <div class="check-options"><label><input id="background-enabled" data-axis="transparent" data-invert="true" type="checkbox">図全体の背景色を使用</label></div>
    <div class="field-grid"><label>図全体の背景色<input data-axis="backgroundColor" type="color"></label>${opacityControl('data-axis="backgroundAlpha"', '不透明度', config.axes.backgroundAlpha)}</div></fieldset>
    <fieldset class="axis-control-group"><legend>グラフの枠内</legend><div class="check-options">${check("plotBackgroundEnabled", "枠内の背景色を使用")}</div><div class="field-grid"><label>枠内の背景色<input data-axis="plotBackgroundColor" type="color"></label>${opacityControl('data-axis="plotBackgroundAlpha"', '不透明度', config.axes.plotBackgroundAlpha)}</div></fieldset></details>
    <details class="settings-panel"><summary>データ線・マーカー・誤差棒</summary>
    ${numeric("dataLineScale", "データ線の太さ（標準比）", 0, 6)}
    <div class="field-grid">${numeric("markerEdgeWidth", "マーカーの縁 (pt)", 0, 20)}${numeric("errorLineWidth", "誤差棒の太さ (pt)", 0, 20)}${numeric("errorCapSize", "キャップの長さ (pt)", 0, 20)}${numeric("errorCapThick", "キャップの太さ (pt)", 0, 20)}</div></details>`;
  $('#legend-modes').innerHTML=legendModeControls();
  $("#legend-appearance").innerHTML = `${numeric("legendScale", "凡例の線・点の大きさ（標準比）", .2)}${numeric("legendFontScale", "フォントサイズ (pt)", .2)}${numeric("legendX", "凡例の横位置（左0・右1）", -10, 10, .01)}${numeric("legendY", "凡例の縦位置（下0・上1）", -10, 10, .01)}`;
  for(const axis of ['x','y','y2'])$(`#${axis}-tick-appearance`).innerHTML=tickLineControls(axis);
}

function gridControls() {
  const appearance=(prefix,name)=>`<fieldset class="axis-control-group"><legend>${name}</legend><div class="field-grid">
    <label>線種<select data-axis="${prefix}Style" aria-label="${name}の線種">${choiceOptions([['-','実線'],['--','破線'],['-.','一点鎖線'],[':','点線']],axisSetting(prefix+'Style'))}</select></label>
    <label>太さ (pt)<input data-axis="${prefix}Width" aria-label="${name}の太さ (pt)" type="number" min="0" max="5" step="0.1" value="${axisSetting(prefix+'Width')}"></label>
    <label>色<input data-axis="${prefix}Color" aria-label="${name}の色" type="color" value="${escapeHTML(axisSetting(prefix+'Color'))}"></label>
    ${opacityControl(`data-axis="${prefix}Alpha"`,'不透明度',axisSetting(prefix+'Alpha'))}</div></fieldset>`;
  const styles=`<details class="settings-panel" title="${config.plotType==='Raman 3D'?'すべての面に共通の設定です。':'主線・補助線それぞれ、縦・横に共通の設定です。'}"><summary>線の見た目</summary>${appearance('grid',config.plotType==='Raman 3D'?'3Dグリッド線':'主グリッド線')}${config.plotType==='Raman 3D'?'':appearance('minorGrid','補助グリッド線')}</details>`;
  if(config.plotType==='Raman 3D')return `<label><input data-axis="grid" type="checkbox" ${config.axes.grid?'checked':''}>3Dグリッド線を表示</label>`+styles;
  const cell=(key,name)=>`<td><label><input data-axis="${key}" type="checkbox" ${axisSetting(key)?'checked':''}><span>${name}を表示</span></label></td>`;
  return `<table class="axis-visibility-table" aria-label="グリッド線の表示" title="縦はX軸、横はY軸の目盛位置。左右のY軸がある場合は左軸に合わせます。"><thead><tr><th scope="col">位置</th><th scope="col">縦</th><th scope="col">横</th></tr></thead><tbody>
    <tr><th scope="row">主目盛</th>${cell('xGrid','縦の主グリッド線')}${cell('yGrid','横の主グリッド線')}</tr>
    <tr><th scope="row">副目盛</th>${cell('xMinorGrid','縦の補助グリッド線')}${cell('yMinorGrid','横の補助グリッド線')}</tr>
    </tbody></table>`+styles;
}

function tickLineControls(axis) {
  return `<table class="tick-line-table"><thead><tr><th>目盛線</th><th>太さ（標準比）</th><th>長さ（標準比）</th></tr></thead><tbody>${[['Major','主目盛線'],['Minor','副目盛線']].map(([kind,name])=>`<tr><th scope="row">${name}</th>${[['Width','太さ'],['Length','長さ']].map(([key,label])=>`<td><label title="1が標準。0.5で半分、2で2倍。0で非表示になります。"><span>${name}の${label}（標準比）</span><input data-axis="${axis}${kind}Tick${key}" aria-label="${name}の${label}（標準比）" type="number" min="0" max="5" step="0.1" value="${config.axes[`${axis}${kind}Tick${key}`] ?? 1}"></label></td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
desktopAppearance();
compactHelp();

function status(text, kind = "working") {
  $("#status-text").textContent = text;
  $("#status").dataset.kind = kind;
  if ($("#save-dialog").open) {$("#save-progress").textContent = text; $("#save-progress").dataset.kind = kind;}
}

function updateButtons() {
  figureStudioDirectSender?.sync();
  compactHelp();
  const busy = loading || exporting;
  $('#check-update').disabled=busy || updateChecking;
  $('#apply-update').disabled=busy || !availableUpdate;
  $('#retry-update-restore').disabled=busy;
  const panel=panelLabel();
  for(const id of ['#panel-label','#preview-panel-label']){
    $(id).checked=!!panel && panel.visible!==false;
    $(id).disabled=!engineReady || !metadata || busy;
  }
  $("#new-project").disabled = busy;
  $("#open-project").disabled = !engineReady || busy;
  $("#save-project").disabled = !engineReady || busy || !sourceData || !metadata || !config.series.length;
  $('#save-project-as').disabled=$('#save-project').disabled;
  $('#save-project').title=projectHandle?`${projectFilename} に上書き保存します（Ctrl/Command＋S）`:'データと設定をまとめて保存します（Ctrl/Command＋S）';
  $("#drop-zone").disabled = !engineReady || busy;
  $("#data-drop-area").setAttribute("aria-disabled", String(!engineReady || busy));
  $("#sample-data").disabled = !engineReady || busy;
  $$('#sample-list button,#sample-groups button').forEach(button=>button.disabled=busy||pendingSampleId!==null);
  $('#add-data').hidden=!sourceData;
  $('#add-data').disabled=!engineReady || busy;
  $('#reload-data').hidden=!sourceData || sample;
  $('#reload-data').disabled=!engineReady || busy || !sourceData;
  $('#data-reload-actions').hidden=!sourceData || sample;
  $('#reload-data-menu').hidden=!folderSupported;
  $('#reload-data-folder').disabled=!engineReady || busy || !sourceData;
  $("#paste-data").disabled = !engineReady || busy;
  $("#plot-fields").disabled = !engineReady || !metadata || busy;
  $('#preset-fields').disabled = !engineReady || !metadata || busy;
  $("#header-row").disabled = !engineReady || !metadata || busy;
  $('#data-options').hidden = !metadata;
  $("#sheet-select").disabled = !engineReady || !metadata || busy || metadata.sheets.length < 2;
  const multipleSheets = (metadata?.sheets.length ?? 0) > 1;
  $('#sheet-select-field').hidden = !multipleSheets;
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
  const fontFallback = config.axes.fontFamily === 'Arial' && !loadedFonts.has('Arial');
  const fontHint = fontAccessMessage || (fontAccess === 'checking' ? 'PCのフォントを確認しています…' : fontFallback ? fontAccess === 'unsupported' ? 'PCフォントの自動取得に非対応です。詳細設定から読み込めます。' : fontAccess === 'prompt' ? '初回のみ、フォント欄を開いてブラウザのアクセスを許可してください。' : fontAccess === 'ready' ? 'Arialが見つからないため、代替フォントを使用します。' : '' : '');
  $('#font-status').textContent = fontHint; $('#font-status').hidden = !fontHint;
  $('#font-status').title = fontFallback ? 'Arialへのアクセス前は、文字幅が互換のLiberation Sansで描画します。' : '';
  $('#apply-unit-suggestion').disabled = busy || renderRunning || renderedRevision !== revision;
  for (const id of ['#choose-font-files','#browse-local-fonts','#import-local-fonts']) $(id).disabled = !engineReady || busy || (id !== '#choose-font-files' && fontQueryRunning) || (id === '#import-local-fonts' && !$('#local-font-select').selectedOptions?.length);
  const canSave = engineReady && !busy && !renderRunning && (renderedRevision === revision || multipleSheets && $('#save-all-sheets').checked);
  $$('[data-export]').forEach(button => { button.disabled = !canSave; });
  $("#open-save").disabled = !engineReady || busy || renderedRevision !== revision || renderRunning;
  $("#confirm-save").disabled = !canSave;
  for (const id of ["#save-name", "#png-dpi", "#save-destination", "#choose-save-folder", "#close-save"]) $(id).disabled = busy;
  $("#copy-image").disabled = !engineReady || busy || renderedRevision !== revision || renderRunning;
  $('#edit-all-series').hidden = !editableXY(config.plotType || 'General');
  $('#restore-legend-items').hidden=!hasHiddenLegendItems();
  $$('#element-editor-fields [data-restore-legend-items]').forEach(button=>button.hidden=!hasHiddenLegendItems());
  $('#restore-legend-items').disabled=busy || !metadata;
  $('#edit-all-series').disabled = !engineReady || busy || !config.series.length || renderedRevision !== revision || renderRunning;
  $('#series-table-panel').hidden = !metadata || !config.series.length;
  for(const id of ['color-map','colormap-target','colormap-start','colormap-end','apply-colormap','reset-colormap-range'])$('#'+id).disabled=!engineReady || busy || !metadata || !config.series.length || colormapApplying;
  $$('#series-table-body input,#series-table-body select').forEach(input=>input.disabled=!engineReady || busy);
  syncSeriesErrorControls();
  $$('#series-table-body [data-series-table-edit]').forEach(button=>button.disabled=busy || renderRunning || renderedRevision!==revision);
  $("#figure-stage").setAttribute("aria-busy", String(loading || exporting || renderRunning || !engineReady));
  $('#save-destination').disabled = $('#choose-save-folder').disabled = busy;
  syncColorIcons();
  updateUserPresetActions();
}

function request(operation, args) {
  return new Promise((resolve, reject) => {
    const id = ++requestID;
    requests.set(id, { resolve, reject });
    worker.postMessage({ id, operation, args }, [...new Set([args.bytes, ...(args.files || []).map(file=>file.bytes), ...(args.fonts || []).map(font => font.bytes)].filter(Boolean))]);
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
  worker = new Worker(new URL("./worker.js?v=dd5569f5b97e", import.meta.url), { type: "module" });
  worker.onmessage = async ({ data }) => {
    if (data.type === "progress") status(data.text);
    else if (data.type === "ready") {
      await catalogReady;
      engineReady = true;
      updateButtons();
      $("#initial-message .spinner").hidden = true;
      $("#initial-message strong").textContent = "データを選んでください";
      $("#initial-message p").textContent = "Excel / CSV / TXTを読み込むか、「サンプルを使う」を押してください。";
      $("#preview-state").textContent = "データ未選択";
      status("Excel / CSV / TXTファイルを選んでください。", "ready");
      if(!await restoreUpdateSession() && !getFigureBridgeContext())await openGalleryProject();
      // Permission waiting must never delay opening data or a gallery project.
      void browseLocalFonts({automatic:true});
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
  for (const input of $$('input[type="color"],input[data-axis$="Color"],input[data-series-field$="Color"],input[data-option$="Color"],input[data-legend-field="textColor"]')) {
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
function syncOpacityControls(activeInput = null) {
  for (const input of $$('input[data-opacity]')) {
    const data=input.dataset;
    const value=(data.axis ? config.axes[data.axis] :
      data.seriesField ? config.series[Number(input.closest('[data-series-index]')?.dataset.seriesIndex)]?.[data.seriesField] :
      data.annotationField ? config.annotations?.[Number(input.closest('[data-annotation-index]')?.dataset.annotationIndex)]?.[data.annotationField] :
      data.fill ? config.options?.fills?.[Number(input.closest('[data-fill-index]')?.dataset.fillIndex)]?.[data.fill] : config.options?.[data.option]) ?? input.value;
    if (input !== activeInput) input.value=value;
    const mixed=data.seriesAll==='true' && config.series.some(item=>String(item[data.seriesField])!==String(value));
    const percent=mixed?'混在':opacityPercent(value), output=input.closest('.opacity-control')?.querySelector('output');
    if(output)output.textContent=percent;
    input.setAttribute('aria-valuetext',percent);
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
  showDialog('#color-panel');
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
function syncUnitControls(manualKey = null) {
  const options = units => units.map(unit => {
    const [value, text] = Array.isArray(unit) ? unit : [unit, readableUnit(unit)];
    return `<option value="${escapeHTML(value)}">${escapeHTML(text)}</option>`;
  }).join('');
  for (const picker of $$('[data-unit-axis]')) {
    const key = `${picker.dataset.unitAxis}Unit`, value = String(config.axes[key] ?? 'auto');
    const custom = manualKey === key || !UNIT_VALUES.has(value);
    picker.innerHTML = options([['auto', '自動（列名から）'], ['', '単位なし']]) + [...UNIT_GROUPS,['その他の換算単位',EXTRA_UNITS]].map(([name, units]) => `<optgroup label="${escapeHTML(name)}">${options(units)}</optgroup>`).join('') + options([['__custom__', '自由入力…']]);
    picker.value = custom ? '__custom__' : value;
    picker.title = UNIT_HINT;
    const input = picker.parentElement.querySelector(`[data-axis="${key}"]`);
    input.value = value; input.hidden = !custom; input.title = MICRO_HINT;
  }
}
function openAxisEditor(axis, kind) {
  if (!metadata || loading || exporting || !figureWorkspaceRestoring&&(renderRunning || renderedRevision !== revision)) return;
  const fields = $('#axis-editor-fields'); fields.dataset.axisName = axis;fields.dataset.workspaceKind=kind;
  let html='';
  const label = (key, text, type='text', extra='') => `<label${isLabelPadding(key) ? ` title="${LABEL_PADDING_HINT}"` : ''}>${text}${key.endsWith('Unit') ? `<select data-unit-axis="${key.slice(0,-4)}" aria-label="${axisName(axis)}軸の単位"></select>` : ''}<input data-axis="${key}" type="${type}" value="${escapeHTML(axisControlValue(key, config.axes[key]))}" ${type==='text' && /(Label|Unit)$/.test(key)?`title="${MICRO_HINT}"`:''} ${key.endsWith('Unit') ? `aria-label="${axisName(axis)}軸単位を入力" placeholder="任意の単位"` : ''} ${extra}></label>`;
  $('#axis-editor-title').textContent = `${axisName(axis)}軸${kind === 'label' ? 'ラベル' : '目盛り'}の設定`;
  if (kind === 'label') {
    html = label(`${axis}Label`,'ラベル（空欄で自動）','text','maxlength="500"') + label(`${axis}Unit`,'単位') +
      `<div class="field-grid">${label(`${axis}LabelPad`,'ラベル追加余白 (pt)','number',`min="${-100-LABEL_PADDING_BASE}" max="${100-LABEL_PADDING_BASE}" step="0.1"`)}${label('labelFontScale','フォントサイズ (pt)','number',`min="${axisControlValue('labelFontScale',.2)}" max="${axisControlValue('labelFontScale',3)}" step="0.1"`)}</div>` +
      `<button type="button" class="button quiet" data-reset-label>標準位置に戻す</button>`;
  } else {
    const automatic = config.axes[`${axis}Min`] === '' && config.axes[`${axis}Max`] === '';
    html = `<div class="field-grid"><label>軸の種類<select data-axis="${axis}Scale">${choiceOptions([['linear','線形'],['log','対数']],config.axes[`${axis}Scale`])}</select></label>${label('tickFontScale','フォントサイズ (pt)','number',`min="${axisControlValue('tickFontScale',.2)}" max="${axisControlValue('tickFontScale',3)}" step="0.1"`)}</div>` + tickLineControls(axis) +
      `<details class="settings-panel"><summary>範囲・目盛り間隔</summary><label class="log-format-field" data-log-format-for="${axis}">目盛りの表記<select data-axis="${axis}LogFormat" aria-label="${axisName(axis)}軸の対数目盛り表記">${choiceOptions([['power','累乗（10ⁿ）'],['decimal','数値（0.1、1、10）']],config.axes[`${axis}LogFormat`])}</select></label>` +
      `<label><input type="checkbox" data-axis-auto="range" ${automatic?'checked':''}>範囲を自動設定</label><div class="field-grid">${label(`${axis}Min`,'最小','number','step="any" placeholder="自動"')}${label(`${axis}Max`,'最大','number','step="any" placeholder="自動"')}</div>` +
      `<label title="${axis==='x'?'両端をデータ範囲に合わせます。':'線形軸は下端を0（負の値がある場合は最小値）に合わせ、上端にデータ幅の5%の余裕を付けます。対数軸は正のデータ範囲と対数幅を使います。'}誤差棒・近似線を含みます。オンで最小・最大の指定を解除し、その後の手動指定は優先します。"><input type="checkbox" data-axis="${axis}FitData" ${config.axes[`${axis}FitData`]?'checked':''}>データ範囲にフィット</label>` +
      `<label><input type="checkbox" data-axis-auto="ticks" data-axis-name="${axis}">主目盛りを自動設定</label>` +
      label(`${axis}Step`,'主目盛り間隔','number','step="any" placeholder="自動"') +
      `<label><input type="checkbox" data-axis-auto="minor" data-axis-name="${axis}">副目盛りを自動設定</label>` +
      label(`${axis}MinorStep`,'副目盛り間隔','number','step="any" placeholder="自動"') + '</details>' +
      `<details class="settings-panel"><summary>表示・色・余白</summary>` +
      `<label><input type="checkbox" data-axis="hide${axis === 'x' ? 'X' : axis === 'y2' ? 'Y2' : 'Y'}MinorTicks" data-invert="true" ${config.axes[`hide${axis === 'x' ? 'X' : axis === 'y2' ? 'Y2' : 'Y'}MinorTicks`]?'':'checked'}>副目盛線を表示</label>` +
      label(`${axis}TickPad`,'目盛り追加余白 (pt)','number','min="-100" max="100" step="0.1"');
  }
  const flag=axis.toUpperCase();
  html+=`<div class="check-options">${(kind==='label'?[['Label','軸ラベル']]:[['TickLabels','目盛り数値'],['Ticks','主目盛線']]).map(([key,text])=>`<label><input data-axis="hide${flag}${key}" data-invert="true" type="checkbox" ${config.axes[`hide${flag}${key}`]?'':'checked'}>${text}を表示</label>`).join('')}</div>`;
  html += axis === 'x' ? label('spineColor','枠線・文字色','color') : label(`${axis}Color`,'軸の色（autoで自動）','text','title="軸線・目盛線・目盛数値・ラベルに適用します。autoでは、左右別の軸を使う場合に各軸の最初の系列と同じ色にします。"');
  if(kind==='ticks')html+=`</details><details class="settings-panel"><summary>グリッド線</summary>${gridControls()}</details>`;
  fields.innerHTML=html;
  syncAxisEditor(); syncUnitControls(); enhanceColorInputs(); showDialog('#axis-editor');
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
  for (const axis of ['x','y','y2']) {
    const manual = ['Min','Max','Step','MinorStep'].some(key=>config.axes[`${axis}${key}`] !== '');
    $(`#${axis}-settings-summary`).textContent = `${config.axes[`${axis}Scale`] === 'log' ? '対数' : '線形'}・${manual ? '指定あり' : config.axes[`${axis}FitData`] ? 'フィット' : '自動'}`;
  }
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
  if(mode==='range' && input.checked){config.axes[axis+'FitData']=true;$$(`[data-axis="${axis}FitData"]`).forEach(field=>field.checked=true);}
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
  } else if (input.dataset.unitAxis) {
    applyControlInput(event);
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
  for (const key of ['LabelX','LabelY','LabelPad']) {config.axes[`${axis}${key}`] = key === 'LabelPad' ? LABEL_PADDING_BASE : ''; $$(`[data-axis="${axis}${key}"]`).forEach(field => field.value = axisControlValue(`${axis}${key}`, config.axes[`${axis}${key}`]));}
  changed();
});
$('#close-axis-editor').addEventListener('click', () => $('#axis-editor').close());
$('#axis-editor-fields').addEventListener('focusout', syncAxisEditor);

function drawPresetOptions() {
  const type=config.plotType || "General", options=config.options ||= {};
  const number=(key,label,def,min=0,max=100,step=.1)=>`<label>${label}<input data-option="${key}" type="number" value="${escapeHTML(options[key] ?? def)}" min="${min}" max="${max}" step="${step}"></label>`;
  const color=(key,label,def)=>`<label>${label}<input data-option="${key}" value="${escapeHTML(options[key] ?? def)}"></label>`;
  let html='';
  const notes={"XPS Fit":"CSV/Au 10列/Ag 8列の配置を自動判定。成分の塗りつぶしは背景との差で描画します。", "Particle Histogram":"選択した粒径列から頻度%と対数正規分布を描画します。ビン幅は20 nmです。", "Raman 3D":"共通のX列と各Y列からウォーターフォールを作成します。Y軸設定は強度（Z軸）に適用します。", "bar_graph_general":"数値X・カテゴリXに対応した集合棒グラフです。", "Roughness":"線＋マーカー、Y対数軸が初期設定です。", "Waviness":"Roughnessと同じ線＋マーカー、Y対数軸が初期設定です。"};
  $("#plot-type").title=notes[type] || "プリセットに合わせて軸ラベル・単位を設定します。";
  $("#preset-note").textContent=""; $("#preset-note").hidden=true;
  if(type==='bar_graph_general') html=`<div class="field-grid">${number('barWidth','棒幅',.8,.01,100)}${opacityControl('data-option="barAlpha"','不透明度',options.barAlpha ?? .9)}${number('barEdgeWidth','縁幅 (pt)',.4,0,20)}${color('barEdgeColor','縁色 (auto / #色)','auto')}</div>`;
  if(type==='Particle Histogram') html=`<label>粒径列<select data-option="diameterColumn">${columnOptions(options.diameterColumn ?? config.series[0]?.y ?? 1)}</select></label><div class="field-grid">${color("histogramColor","分布の色","#70BEFF")}${opacityControl('data-option="histogramAlpha"','分布の不透明度',options.histogramAlpha ?? 1)}${color("histogramFitColor","分布曲線の色","#FF7166")}${number("histogramFitWidth","分布曲線の線幅 (pt)",.8,0,20)}</div>`;
  if(type==='Raman 3D') html=`<label><input type="checkbox" data-option="normalize" ${options.normalize!==false?'checked':''}>各系列を0〜1に正規化</label><div class="field-grid"><label>奥行きラベル<input data-option="depthLabel" value="${escapeHTML(options.depthLabel ?? "Series")}"></label>${number('depthStep','奥行き間隔',1,.01,10000)}${number('elevation','仰角 (度)',24,-180,180,1)}${number('azimuth','方位角 (度)',-66,-360,360,1)}</div>`;
  if(type==='XPS Fit') {
    if(!options.fills?.length && metadata?.columns.length>=8){
      const csv=metadata.xpsCSV, large=metadata.columns.length>=10;
      const indices=csv?Array.from({length:metadata.columns.length-7},(_,i)=>i+7):large?[6,7,8,9]:[3,4];
      options.fills=indices.map((upper,i)=>({x:csv||!large?0:3,upper,lower:csv?3:large?5:2,color:['#F7574A','#56B2FF','#FF9822','#5BCC77'][i%4],alpha:.3}));
    }
    html=`<div class="field-grid">${number('scatterSize','散布面積 (pt²)',18,0,500,1)}${number('scatterEdgeWidth','散布縁幅 (pt)',.6,0,20)}${color('scatterEdgeColor','散布縁色','#2A2A2A')}${color('scatterFaceColor','散布塗り色','#ffffff')}${opacityControl('data-option="scatterAlpha"','散布不透明度',options.scatterAlpha ?? .8)}${color('fitLineColor','fit線色','#2A2A2A')}${number('fitLineWidth','fit線幅 (0=非表示)',0,0,20)}${color('bgLineColor','背景線色','#8A8A8A')}${number('bgLineWidth','背景線幅 (0=非表示)',0,0,20)}</div>`;
    html+=(options.fills || []).map((fill,index)=>`<details data-fill-index="${index}"><summary>成分 ${index+1}</summary><div class="field-grid">${[['x','X'],['upper','成分Y'],['lower','背景Y']].map(([key,label])=>`<label>${label}<select data-fill="${key}" ${metadata.xpsCSV?'disabled':''}>${columnOptions(fill[key])}</select></label>`).join('')}<label>色<input type="color" data-fill="color" value="${escapeHTML(fill.color)}"></label>${opacityControl('data-fill="alpha"','不透明度',fill.alpha ?? .3)}</div><button type="button" class="button quiet" data-remove-fill="${index}" ${metadata.xpsCSV?'disabled':''}>成分を削除</button></details>`).join('');
    if(!metadata.xpsCSV) html+='<button type="button" class="button quiet" id="add-fill">成分を追加</button>';
  }
  $("#preset-options").innerHTML=html;
  syncOpacityControls();
  enhanceColorInputs();
  document.querySelector('.preview-footer > span').textContent=`PlotLauncher Web · ${presets.find(preset=>preset.id===type)?.label || type}`;
  document.querySelector('#axes-title').textContent=presets.find(preset=>preset.id===type)?.label || type;
}

function changePlotType(type) {
  if(metadata?.sources && !editableXY(type)){status('複数ファイルの重ね描きでは通常のXYグラフを選んでください。','error');$('#plot-type').value=config.plotType;return;}
  applyPreset(config,presets.find(item=>item.id===type),metadata);
  delete config.options.processingAxes;
  if(!editableXY(config.plotType))for(const item of config.series)for(const key of PROCESSING_FIELDS)item[key]=createSeries(item.x,item.y,item.name)[key];
  if(!editableXY(config.plotType))config.series.forEach(item=>{item.mode='line';item.errorMode='none';item.yAxis='left';});
  if(['XPS Fit','Particle Histogram','bar_graph_general','Raman 3D'].includes(config.plotType))config.series.forEach(item=>item.trendType='none');
  if(config.plotType==='Raman 3D') config.series=initialSeries(metadata.columns, config.plotType);
  if(config.plotType==='Particle Histogram')config.options.diameterColumn=Math.min(2,metadata.columns.length-1);
  drawControls();syncProcessingAxes();changed();
}
$("#plot-type").addEventListener("change",event=>changePlotType(event.target.value));
$("#preset-options").addEventListener('click',event=>{
  if(event.target.id==='add-fill'){config.options.fills.push({x:0,upper:1,lower:2,color:COLORS[config.options.fills.length%COLORS.length],alpha:.3});drawPresetOptions();changed();}
  const remove=event.target.closest('[data-remove-fill]');
  if(remove){config.options.fills.splice(Number(remove.dataset.removeFill),1);drawPresetOptions();changed();}
});
for(const [id,paired] of [['shared-x-series',false],['paired-series',true]]) $("#"+id).addEventListener('click',()=>{
  const columns=metadata.columns, pairs=[];
  for(let i=1;i<columns.length && pairs.length<32;i+=paired?2:1) pairs.push(createSeries(paired?i-1:0,i,columns[i].name,pairs.length,config.plotType));
  config.series=pairs;drawControls();changed();
});
$("#series-colors").addEventListener('click',()=>{config.series.forEach((item,i)=>item.color=COLORS[i%COLORS.length]);drawControls();changed();});
function colormapSelection() {
  return {name:$('#color-map').value,target:$('#colormap-target').value,start:Number($('#colormap-start').value)/100,end:Number($('#colormap-end').value)/100};
}
function syncColormapRange(changed=null) {
  const start=$('#colormap-start'),end=$('#colormap-end');
  if(Number(start.value)>Number(end.value)){if(changed===start)start.value=end.value;else end.value=start.value;}
  for(const key of ['start','end']){
    const input=$('#colormap-'+key),value=`${Number(input.value)}%`;
    $('#colormap-'+key+'-value').textContent=value;input.setAttribute('aria-valuetext',value);
  }
  $('#colormap-mask-start').style.width=`${start.value}%`;
  $('#colormap-mask-end').style.left=`${end.value}%`;
  start.setAttribute('aria-valuemax',end.value);end.setAttribute('aria-valuemin',start.value);
  $('#colormap-start').style.zIndex=Number(start.value)===100?'3':'1';
  const ramp=colormapRamps.get($('#color-map').value);
  $('#colormap-gradient').style.backgroundImage=ramp?`linear-gradient(to right,${ramp.join(',')})`:'none';
}
async function previewColormap() {
  if(!engineReady || loading || exporting || !metadata || !config.series.length || colormapApplying || $('#series-colormap').hidden || !$('#series-colormap').open)return;
  const token=++colormapPreviewToken,selection=colormapSelection(),count=config.series.length;
  try{
    const result=await request('colors',{...selection,count,preview:!colormapRamps.has(selection.name)});
    if(token!==colormapPreviewToken || JSON.stringify(selection)!==JSON.stringify(colormapSelection()) || count!==config.series.length)return;
    if(result.ramp?.length===256 && result.ramp.every(color=>/^#[\da-f]{6}$/i.test(color)))colormapRamps.set(selection.name,result.ramp);
    syncColormapRange();
    $('#colormap-samples').innerHTML=(result.colors || []).filter(color=>/^#[\da-f]{6}$/i.test(color)).map((color,i)=>`<span style="background:${color}" title="系列${i+1}：${color}"></span>`).join('');
    $('#colormap-error').hidden=true;
  }catch(error){if(token===colormapPreviewToken){$('#colormap-error').textContent=error.message;$('#colormap-error').hidden=false;}}
}
function scheduleColormapPreview() {
  ++colormapPreviewToken;clearTimeout(colormapPreviewTimer);
  $('#colormap-samples').innerHTML='';
  colormapPreviewTimer=setTimeout(previewColormap,80);
}
function drawColormapControls() {
  if(colormapControlConfig!==config){
    const saved=config.options?.colormapRange || {name:'viridis',target:'both',start:0,end:1};
    $('#color-map').value=saved.name;$('#colormap-target').value=saved.target;
    $('#colormap-start').value=String(saved.start*100);$('#colormap-end').value=String(saved.end*100);
    colormapControlConfig=config;
  }
  syncColormapRange();if($('#series-colormap').open)scheduleColormapPreview();
}
$('#series-colormap').addEventListener('toggle',()=>{if($('#series-colormap').open)void previewColormap();else{++colormapPreviewToken;clearTimeout(colormapPreviewTimer);}});
$('#color-map').addEventListener('input',()=>{syncColormapRange();scheduleColormapPreview();});
$('#colormap-target').addEventListener('input',scheduleColormapPreview);
for(const id of ['colormap-start','colormap-end'])$('#'+id).addEventListener('input',event=>{syncColormapRange(event.target);scheduleColormapPreview();});
$('#reset-colormap-range').addEventListener('click',()=>{$('#colormap-start').value='0';$('#colormap-end').value='100';syncColormapRange();scheduleColormapPreview();});
$("#apply-colormap").addEventListener('click',async()=>{
  if(!engineReady || loading || exporting || !metadata || !config.series.length || colormapApplying)return;
  const original=config,atRevision=revision,selection=colormapSelection(),count=config.series.length;
  colormapApplying=true;updateButtons();
  try{
    const result=await request('colors',{...selection,count});
    if(loading || exporting || config!==original || revision!==atRevision){status('グラフ設定が変更されました。もう一度「配色を適用」を押してください。','ready');return;}
    if(result.colors?.length!==count || !result.colors.every(color=>/^#[\da-f]{6}$/i.test(color)))throw new Error('配色を取得できませんでした。もう一度お試しください。');
    config.options ||= {};config.options.colormapRange=selection;
    config.series.forEach((item,i)=>{if(selection.target!=='scatter')item.color=result.colors[i];if(selection.target!=='line')item.scatterColor=result.colors[i];});
    drawControls();changed();$('#colormap-error').hidden=true;
  }catch(error){status(error.message,'error');}
  finally{colormapApplying=false;updateButtons();if($('#series-colormap').open)scheduleColormapPreview();}
});
$("#apply-offsets").addEventListener('click',()=>{
  if (['#offset-start','#offset-step'].some(selector => incompleteNumberInput($(selector)))) {
    status('オフセット開始と間隔に数値を入力してください。', 'error'); return;
  }
  const start=Number($("#offset-start").value), step=Number($("#offset-step").value);
  config.series.forEach((item,i)=>item.yOffset=start+i*step);drawControls();changed();
});

function seriesTableItems() {
  return ['XPS Fit','Particle Histogram'].includes(config.plotType)?config.series.slice(0,1):config.series;
}
function drawSeriesTableSummary() {
  const items=seriesTableItems();
  $('#series-table-summary').textContent=`${items.length} 系列 · 表示 ${items.filter(item=>item.visible!==false).length}`;
}
function drawSeriesTable() {
  if(!metadata){$('#series-table-head').innerHTML='';$('#series-table-body').innerHTML='';drawSeriesTableSummary();return;}
  const items=seriesTableItems(),text=value=>escapeHTML(value ?? '—');
  const modes={line:'線',scatter:'点','line+scatter':'線＋点'},styles={'-':'実線','--':'破線','-.':'一点鎖線',':':'点線'};
  const markers={o:'丸',s:'四角','^':'三角 ▲',v:'三角 ▼',D:'ひし形','+':'+',x:'×','*':'星',p:'五角形',h:'六角形'};
  const errors={auto:'±列から自動',none:'なし',symmetric:'±値',asymmetric:'正・負の誤差幅',minmax:'最小・最大値'};
  const headers=['No.','表示','系列名','X列','Y列','Y軸','描画','線・棒色','点色','線幅 (pt)','点面積 (pt²)','線種','マーカー','Xオフセット','Yオフセット','誤差','±列','正の誤差列','負の誤差列','最小値列','最大値列'];
  $('#series-table-head').innerHTML=`<tr>${headers.map((label,index)=>`<th scope="col"${index>=11?' data-series-detail':''}>${text(label)}</th>`).join('')}<th scope="col">設定</th></tr>`;
  $('#series-table-body').innerHTML=items.map((item,index)=>{
    const histogram=config.plotType==='Particle Histogram',xps=config.plotType==='XPS Fit',bar=config.plotType==='bar_graph_general',threeD=config.plotType==='Raman 3D',options=config.options || {};
    const attr=(key,label,option=false)=>`data-${option?'option':'series-field'}="${key}" aria-label="表の系列${index+1}の${text(label)}"`;
    const input=(key,label,type='text',attributes='',option=false,value=option?options[key]:item[key])=>`<input ${attr(key,label,option)} type="${type}" value="${text(value ?? '')}" ${attributes}>`;
    const select=(key,label,choices,option=false,value=option?options[key]:item[key])=>`<select ${attr(key,label,option)}>${choiceOptions(Object.entries(choices),value)}</select>`;
    const column=(key,label,optional=false,option=false,value=option?options[key]:item[key])=>`<label class="series-table-column"><select ${attr(key,label,option)}>${columnOptions(value,optional)}</select></label>`;
    const name=histogram?'粒径分布':xps?'実測点':input('name','名前','text','maxlength="200"');
    const cells=[text(index+1),`<input type="checkbox" data-series-field="visible" aria-label="表の系列${index+1}を描画" ${item.visible!==false?'checked':''}>`,
      name,column(histogram?'diameterColumn':'x','X列',false,histogram,histogram?options.diameterColumn ?? item.y:item.x),histogram?'頻度（算出）':column('y','Y列'),
      threeD?'強度（Z）':editableXY(config.plotType)?select('yAxis','Y軸',{left:'左軸',right:'右軸'}):'左',
      histogram?'ヒストグラム':xps?'点':bar?'棒':threeD?'3D線':select('mode','描画',modes),
      xps?'—':histogram?input('histogramColor','線・棒色','color','',true,options.histogramColor ?? '#70BEFF'):input('color','線・棒色','color'),
      histogram || bar || threeD?'—':xps?input('scatterFaceColor','点色','text','',true,options.scatterFaceColor ?? '#ffffff'):input('scatterColor','点色'),
      histogram || xps || threeD?'—':bar?input('barEdgeWidth','線幅 (pt)','number','min="0" max="6" step="0.1" title="全ての棒に適用します。"',true,options.barEdgeWidth ?? .4):input('lineWidth','線幅 (pt)','number','min="0" max="6" step="0.1"'),
      histogram || bar || threeD?'—':xps?input('scatterSize','点面積 (pt²)','number','min="1" max="200" step="0.1"',true,options.scatterSize ?? 18):input('markerSize','点面積 (pt²)','number','min="1" max="200" step="0.1"'),
      editableXY(config.plotType)?select('lineStyle','線種',styles):'—',histogram || bar || threeD?'—':xps?'丸':select('marker','マーカー',markers),
      histogram?'—':input('xOffset','Xオフセット','number','step="any"'),histogram?'—':input('yOffset','Yオフセット','number','step="any"'),
      editableXY(config.plotType)?select('errorMode','誤差',errors):'—',
      ...['error','errorPlus','errorMinus','errorMin','errorMax'].map((key,i)=>editableXY(config.plotType)?column(key,headers[16+i],true):'—')];
    return `<tr data-series-index="${index}">${cells.map((html,index)=>`<td${index>=11?' data-series-detail':''}>${html}</td>`).join('')}<td><button type="button" data-series-table-edit="${index}" aria-label="系列${index+1}の詳細設定を開く">詳細</button></td></tr>`;
  }).join('');
  drawSeriesTableSummary();enhanceColorInputs();updateButtons();
}
function toggleSeriesTable() {
  const content=$('#series-table-content'),button=$('#toggle-series-table');
  content.hidden=!content.hidden;
  button.textContent=content.hidden?'＋':'−';
  button.setAttribute('aria-expanded',String(!content.hidden));
  button.setAttribute('aria-label',content.hidden?'系列表を開く':'系列表を閉じる');
}
function editTableSeries(index) {
  if(!config.series[index] || loading || exporting || renderRunning || renderedRevision!==revision)return;
  openElementEditor('series',index);
}
$('#toggle-series-table').addEventListener('click',toggleSeriesTable);
$('#series-table-details').addEventListener('change',event=>{$('#series-table').dataset.details=String(event.target.checked);});
$('#series-table-body').addEventListener('input',event=>{
  if(!event.target.dataset.seriesField && !event.target.dataset.option || loading || exporting)return;
  applyControlInput(event);drawSeriesTableSummary();
});
$('#series-table-body').addEventListener('click',event=>{
  const button=event.target.closest('[data-series-table-edit]');if(button)editTableSeries(Number(button.dataset.seriesTableEdit));
});
$('#series-table-body').addEventListener('dblclick',event=>{
  if(event.target.closest('button,input,select,label,.color-control'))return;
  const row=event.target.closest('[data-series-index]');if(row)editTableSeries(Number(row.dataset.seriesIndex));
});

function drawControls() {
  $("#plot-type").value = config.plotType || "General";
  $('#grid-settings-content').innerHTML=gridControls();
  for(const option of $('#plot-type').options)option.disabled=!!metadata?.sources && !editableXY(option.value);
  drawPresetOptions();
  syncFontChoices();
  const xpsFit=config.plotType==='XPS Fit';
  const histogram=config.plotType==='Particle Histogram';
  const visibleSeries=xpsFit || histogram?config.series.slice(0,1):config.series;
  $("#series-count").textContent = xpsFit?'実測点':`${visibleSeries.length} 系列`;
  $("#series-list").innerHTML = visibleSeries.map((series, index) => {
    const input = (key, label, attributes = '') => `<label>${label}<input data-series-field="${key}" type="number" value="${escapeHTML(seriesControlValue(key,series[key]))}" ${attributes}></label>`;
    if(histogram)return `<div class="series-card" data-series-index="${index}"><label class="series-visibility"><input data-series-field="visible" type="checkbox" ${series.visible!==false?'checked':''}>粒径分布を描画</label></div>`;
    return `<div class="series-card" data-series-index="${index}">
      <label class="series-visibility"><input data-series-field="visible" type="checkbox" ${series.visible!==false?'checked':''}>系列${index+1}を描画</label><div class="series-heading">${xpsFit?'実測点の列':`<input data-series-field="color" type="color" value="${escapeHTML(series.color)}" aria-label="系列${index + 1}の色"><input class="series-label" data-series-field="name" value="${escapeHTML(series.name)}" maxlength="200" aria-label="系列${index + 1}の名前"><button type="button" class="icon-button" data-remove="${index}" aria-label="系列${index + 1}を削除"><svg><use href="#i-close"/></svg></button>`}</div>
      <div class="field-grid"><label>グラフの種類<select data-series-field="mode">${choiceOptions([["line", "線"], ["scatter", "点"], ["line+scatter", "線＋点"]], series.mode)}</select></label><label title="右軸を選ぶと右側に独立したY軸を表示します。">使用するY軸<select data-series-field="yAxis">${choiceOptions([['left','左軸'],['right','右軸']],series.yAxis || 'left')}</select></label></div>
      <details class="series-columns settings-panel"><summary>${editableXY(config.plotType)?'データ列':'データ列・オフセット'}</summary><div class="field-grid"><label>X列<select data-series-field="x">${columnOptions(series.x)}</select></label><label>Y列<select data-series-field="y">${columnOptions(series.y)}</select></label></div>${editableXY(config.plotType)?'':`<div class="field-grid">${input("xOffset", "Xオフセット", 'step="any"')}${input("yOffset", "Yオフセット", 'step="any"')}</div>`}</details>
      <div class="annotation-buttons"><button type="button" class="button quiet" data-series-up="${index}" ${index===0?'disabled':''}>↑</button><button type="button" class="button quiet" data-series-down="${index}" ${index===config.series.length-1?'disabled':''}>↓</button><button type="button" class="button quiet" data-series-copy="${index}">複製</button></div><details class="series-advanced settings-panel"><summary>線・点の見た目</summary>
        <div class="field-grid">${input("lineWidth", "線幅 (pt)", 'min="0" max="6" step="0.1"')}<label>線種<select data-series-field="lineStyle">${choiceOptions([["-", "実線"], ["--", "破線"], ["-.", "一点鎖線"], [":", "点線"]], series.lineStyle)}</select></label></div>
        <div class="field-grid"><label>マーカー<select data-series-field="marker">${choiceOptions([["o", "丸"], ["s", "四角"], ["^", "三角 ▲"], ["v", "三角 ▼"], ["D", "ひし形"], ["+", "+"], ["x", "×"], ["*", "星"], ["p", "五角形"], ["h", "六角形"]], series.marker)}</select></label>${input("markerSize", "マーカー面積 (pt²)", 'min="1" max="200" step="0.1"')}</div>
        <label title="全系列に共通です。">点の縁の太さ (pt・全系列)<input data-axis="markerEdgeWidth" type="number" min="0" max="20" step="0.1" value="${config.axes.markerEdgeWidth}"></label>
        <div class="field-grid"><label>マーカー色<input data-series-field="scatterColor" value="${escapeHTML(series.scatterColor)}" placeholder="auto / #色"></label>${opacityControl('data-series-field="lineAlpha"','線の不透明度',series.lineAlpha ?? 1)}<label>マーカー縁色<input data-series-field="markerEdgeColor" value="${escapeHTML(series.markerEdgeColor)}" placeholder="auto / none / #色"></label><label>マーカー塗り色<input data-series-field="markerFaceColor" value="${escapeHTML(series.markerFaceColor)}" placeholder="auto / none / #色"></label>${opacityControl('data-series-field="markerEdgeAlpha"','縁の不透明度',series.markerEdgeAlpha ?? 1)}${opacityControl('data-series-field="markerFaceAlpha"','塗りの不透明度',series.markerFaceAlpha ?? 1)}</div>
      </details><details class="series-errors settings-panel"><summary>エラーバー</summary><label class="draw-mode">誤差の種類<select data-series-field="errorMode">${choiceOptions([["auto", "±列から自動"], ["none", "なし"], ["symmetric", "±値"], ["asymmetric", "正・負の誤差幅"], ["minmax", "最小・最大値"]], series.errorMode)}</select></label>
        <label class="draw-mode">Y誤差（±）の列<select data-series-field="error">${columnOptions(series.error, true)}</select></label>
        <div class="field-grid"><label title="Yから上方向の誤差幅。0以上の値が入った列を選びます。上端＝Y＋正の誤差幅。">正の誤差幅（＋）<select data-series-field="errorPlus">${columnOptions(series.errorPlus, true)}</select></label><label title="Yから下方向の誤差幅。こちらも0以上の値を指定します。下端＝Y−負の誤差幅。">負の誤差幅（−）<select data-series-field="errorMinus">${columnOptions(series.errorMinus, true)}</select></label></div>
        <div class="field-grid"><label title="誤差幅ではなく下端のY値を指定します。最小値 ≤ Y ≤ 最大値。">Y誤差最小値<select data-series-field="errorMin">${columnOptions(series.errorMin, true)}</select></label><label title="誤差幅ではなく上端のY値を指定します。最小値 ≤ Y ≤ 最大値。">Y誤差最大値<select data-series-field="errorMax">${columnOptions(series.errorMax, true)}</select></label></div>
        <details class="settings-panel"><summary>太さ・キャップ（全系列）</summary><div class="field-grid">${['errorLineWidth','errorCapSize','errorCapThick'].map((key,i)=>`<label>${['線の太さ (pt)','キャップの長さ (pt)','キャップの太さ (pt)'][i]}<input data-axis="${key}" type="number" min="0" max="20" step="0.1" value="${config.axes[key]}"></label>`).join('')}</div></details>
      </details><details class="series-trend settings-panel"><summary>近似線</summary>
        <label title="表示中のX/Y値（オフセット適用後）の有効な点を最小二乗法で近似します。軸範囲外の点も含み、誤差棒を重みには使いません。">近似の種類<select data-series-field="trendType">${choiceOptions([['none','なし'],['linear','直線'],['polynomial','多項式'],['exponential','指数'],['logarithmic','対数'],['power','べき乗']],series.trendType || 'none')}</select></label>
        <label class="series-visibility" title="切片を0に固定して y=ax を求めます。チェックを外すと y=ax+b の傾きと切片を求めます。対数軸には原点を表示できません。"><input type="checkbox" data-series-field="trendOrigin" ${series.trendOrigin?'checked':''}>原点を通る直線</label>
        ${input('trendDegree','多項式の次数','min="2" max="6" step="1"')}
        <label class="series-visibility"><input type="checkbox" data-series-field="trendEquation" ${series.trendEquation!==false?'checked':''}>数式を表示</label>
        <details class="trend-appearance"><summary>線・数式の表示</summary><div class="field-grid">${input('trendWidth','近似線幅 (pt)','min=".1" max="6" step="0.1"')}<label>近似線の線種<select data-series-field="trendStyle">${choiceOptions([['--','破線'],['-','実線'],['-.','一点鎖線'],[':','点線']],series.trendStyle || '--')}</select></label></div>
          <label title="autoは系列と同じ色です。">近似線・数式の色<input data-series-field="trendColor" value="${escapeHTML(series.trendColor || 'auto')}" placeholder="auto / #色"></label>
          <div class="field-grid">${input('trendFontSize','数式のフォントサイズ (pt)',`min="${3*config.axes.fontScale}" max="${24*config.axes.fontScale}" step="0.1"`)}${input('trendDigits','係数の有効桁数','min="2" max="15" step="1" title="表示だけを丸めます。近似線の描画には丸め前の係数を使います。"')}</div>
          <div class="field-grid">${input('trendX','数式の横位置（左0・右1）','min="-10" max="10" step="0.01" placeholder="自動"')}${input('trendY','数式の縦位置（下0・上1）','min="-10" max="10" step="0.01" placeholder="自動"')}</div>
          <button type="button" class="button quiet" data-reset-trend="${index}">数式の位置を自動に戻す</button>
        </details>
      </details>${processingControls(series)}</div>`;
  }).join("") || '<p class="empty-series">「系列を追加」でX列とY列を選んでください。</p>';
  $$('[data-axis]').forEach(input => {
    const value = axisSetting(input.dataset.axis);
    if (input.type === "checkbox") input.checked = input.dataset.invert === 'true' ? !value : Boolean(value);
    else input.value = axisControlValue(input.dataset.axis, value);
    if(['tickFontScale','labelFontScale','legendFontScale'].includes(input.dataset.axis)){input.min=axisControlValue(input.dataset.axis,.2);input.max=axisControlValue(input.dataset.axis,3);}
  });
  const generic=editableXY(config.plotType || 'General');
  const markerFields=['mode','marker','markerSize','scatterColor','markerEdgeColor','markerFaceColor','markerEdgeAlpha','markerFaceAlpha','lineStyle','lineAlpha','error','errorMode','errorMin','errorMax','yAxis'];
  $$('[data-series-field]').forEach(input=>{if(!input.closest('#series-table-body') && markerFields.includes(input.dataset.seriesField))input.closest('label').hidden=!generic;});
  syncSeriesErrorControls();
  syncYAxesControls();
  syncTrendControls();
  syncProcessingControls();
  const seriesSection=$('#series-list').closest('.control-section');if(seriesSection)seriesSection.hidden=false;
  $('#add-series').hidden=xpsFit || histogram;
  $('#series-colormap').hidden=xpsFit || histogram;
  drawColormapControls();
  $('#series-batch').hidden=xpsFit || histogram;
  $$('.series-errors').forEach(panel=>panel.hidden=!generic);
  if(config.plotType==='XPS Fit')$$('.series-advanced,.series-card .annotation-buttons').forEach(element=>element.hidden=true);
  if(config.plotType==='Raman 3D')$$('#series-list [data-series-field="lineWidth"]').forEach(input=>input.closest('label').hidden=true);
  updateButtons();
  syncAxisAutomaticControls();
  drawAnnotations();
  syncUnitControls();
  $$('[data-axis="xLabel"],[data-axis="yLabel"],[data-axis="y2Label"],[data-axis="xUnit"],[data-axis="yUnit"],[data-axis="y2Unit"],.series-label').forEach(input=>input.title=MICRO_HINT);
  enhanceColorInputs();
  $$('[data-preview-preset]').forEach(input=>input.value=config.plotType);
  drawSeriesTable();
}

function processingControls(item) {
  const num=(key,label,extra='')=>`<label>${label}<input data-series-field="${key}" type="number" ${key==='referencePoint'?'step="1"':'step="any"'} value="${escapeHTML(item[key] ?? '')}" ${extra}></label>`;
  const factor=(key,label)=>`<label title="数値または分数を入力できます（例：0.5、1/2、1/0.25）。">${label}<input data-series-field="${key}" type="text" spellcheck="false" placeholder="例：1/2" value="${escapeHTML(item[key] ?? 1)}"></label>`;
  const referenceMode=item.referenceMode || 'max';
  const legacyReference=!['max','manual'].includes(referenceMode)?`<option value="${escapeHTML(referenceMode)}" selected hidden>保存時の基準</option>`:'';
  return `<details class="series-processing settings-panel"><summary>データ補正</summary>
    <div class="field-grid" title="元データを保持し、Yは傾き補正→係数→規格化→単位表示・Yオフセットの順に適用します。誤差棒も同じ倍率で変換します。面積で割る場合は、面積の逆数をY係数に入力します。">${factor('xFactor','Xに掛ける係数')}${factor('yFactor','Yに掛ける係数')}</div>
    <label><input data-series-field="detrend" type="checkbox" ${item.detrend?'checked':''}>傾きを補正</label>
    <div data-processing-for="detrend"><div class="field-grid" title="空欄は全範囲。指定範囲で直線を当てはめ、先頭の有効点の高さを保って傾きだけを除きます。範囲は表示中のX値です。">${num('detrendMin','補正範囲 X最小','placeholder="全範囲"')}${num('detrendMax','X最大','placeholder="全範囲"')}</div>
    <div class="slope-control"><label title="自動計算した直線の傾きを表示します。手入力や▲▼で微調整できます。Y係数・規格化・表示単位の変換前のY値を、表示中のX値で割った傾きです。">補正する傾き<input data-series-field="detrendSlope" type="number" step="0.001" value="${escapeHTML(item.detrendSlope ?? '')}" placeholder="自動計算中"></label><button type="button" class="button quiet" data-reset-slope title="指定範囲の近似直線から求めた傾きに戻します。">自動に戻す</button></div></div>
    <label>規格化<select data-series-field="normalization">${choiceOptions([['none','なし'],['ratio','基準値で割る（Y/Y₀）'],['relative','相対変化（(Y−Y₀)/Y₀）']],item.normalization || 'none')}</select></label>
    <div data-processing-for="normalization"><label title="最大値は、傾き補正・Y係数を適用した後の各系列から別々に求めます。">規格化の基準<select data-series-field="referenceMode">${legacyReference}${choiceOptions([['max','各系列の最大値'],['manual','値を入力']],referenceMode)}</select></label>
    <div data-processing-for="manual" title="傾き補正・Y係数を掛けた後、表示単位とYオフセットを適用する前の基準値です。系列ごとに指定できます。">${num('referenceValue','基準値 Y₀')}</div></div>
    <div class="field-grid" title="表示中の単位で位置をずらします。XはX係数・単位換算の後、Yは傾き補正・Y係数・規格化・単位換算の後に加算します。">${num('xOffset','Xオフセット')}${num('yOffset','Yオフセット')}</div>
  </details>`;
}

function syncProcessingControls() {
  $$('.series-processing').forEach(panel=>{
    panel.hidden=!editableXY(config.plotType);
    const all=!!panel.closest('[data-series-all-root]');
    const items=all?config.series:[config.series[Number(panel.closest('[data-series-index]')?.dataset.seriesIndex)]];
    panel.querySelectorAll('[data-processing-for]').forEach(group=>{
      const key=group.dataset.processingFor;
      group.hidden=!items.some(item=>item && (key==='detrend'||key==='density'?item[key]:key==='normalization'?item.normalization!=='none':item.normalization!=='none'&&item.referenceMode===key));
    });
    const input=panel.querySelector('[data-series-field="detrendSlope"]'),reset=panel.querySelector('[data-reset-slope]');
    if(!input)return;
    const values=items.map(item=>{
      if(item?.detrendSlope!==undefined && item.detrendSlope!=='')return item.detrendSlope;
      const index=config.series.indexOf(item);
      return renderedRevision===revision ? figureResult?.seriesProcessing?.[index]?.slope : undefined;
    });
    const available=values.length && values.every(value=>value!==undefined && Number.isFinite(Number(value)));
    const same=available && values.every(value=>Number(value)===Number(values[0]));
    const automatic=items.every(item=>item?.detrendSlope===undefined || item.detrendSlope==='');
    if(document.activeElement!==input){input.value=same?String(automatic?Number(Number(values[0]).toPrecision(8)):values[0]):'';input.setAttribute('value',input.value);}
    input.placeholder=available?'系列ごとに異なる傾き':'自動計算中';
    const magnitude=Math.abs(Number(same?values[0]:0));
    input.step=String(magnitude?Math.max(Number.MIN_VALUE,10**(Math.floor(Math.log10(magnitude))-2)):.001);
    reset.disabled=automatic;
  });
}

function resetProcessingSlope(event) {
  const button=event.target.closest('[data-reset-slope]');
  if(!button)return false;
  const panel=button.closest('.series-processing');
  const items=panel.closest('[data-series-all-root]')?config.series:[config.series[Number(panel.closest('[data-series-index]').dataset.seriesIndex)]];
  items.forEach(item=>item.detrendSlope='');
  changed();syncProcessingControls();return true;
}

function syncProcessingAxes() {
  config.options ||= {};
  const saved=config.options.processingAxes ||= {};
  for(const axis of ['y','y2']) {
    const items=config.series.filter(item=>(item.yAxis==='right'?'y2':'y')===axis);
    const kinds=new Set(items.map(item=>item.normalization && item.normalization!=='none'?'normalized':item.density?'density':'raw'));
    const kind=kinds.has('normalized')?'normalized':kinds.size===1?[...kinds][0]:'raw';
    if(kind==='raw' || !items.length) {
      if(saved[axis]){Object.assign(config.axes,saved[axis].original);delete saved[axis];}
      continue;
    }
    if(saved[axis]?.kind===kind)continue;
    const original=saved[axis]?.original || Object.fromEntries(['Label','Unit','UnitScale','Min','Max','Step','MinorStep'].map(key=>[axis+key,config.axes[axis+key]]));
    saved[axis]={kind,original};
    config.axes[axis+'Label']=kind==='density'?'Current density':'Normalized value';
    config.axes[axis+'Unit']=kind==='density'?'mA/cm$^2$':'';
    config.axes[axis+'UnitScale']=1;
    for(const suffix of ['Min','Max','Step','MinorStep'])config.axes[axis+suffix]='';
  }
  if(!Object.keys(saved).length)delete config.options.processingAxes;
  $$('[data-axis]').forEach(input=>{if(['y','y2'].some(axis=>['Label','Unit','Min','Max','Step','MinorStep'].some(suffix=>input.dataset.axis===axis+suffix)))input.value=config.axes[input.dataset.axis];});
  syncUnitControls();syncAxisAutomaticControls();
}

function syncYAxesControls() {
  const active = editableXY(config.plotType || 'General') && config.series.some(item=>item.yAxis === 'right');
  $('#right-axis-controls').hidden = !active;
  $$('[data-axis="yAxisRight"]').forEach(input=>input.closest('label').hidden=active);
}

function syncTrendControls() {
  const supported = !['XPS Fit','Particle Histogram','bar_graph_general','Raman 3D'].includes(config.plotType);
  const seriesFor = element => config.series[Number(element.closest('[data-series-index]').dataset.seriesIndex)];
  $$('.series-trend').forEach(element=>element.hidden=!supported);
  $$('.trend-appearance').forEach(element=>{const item=seriesFor(element);element.hidden=!item || !item.trendType || item.trendType==='none';});
  $$('[data-series-field]').forEach(input=>{
    const key=input.dataset.seriesField;if(!key.startsWith('trend'))return;
    const item=seriesFor(input),kind=item?.trendType || 'none',enabled=kind!=='none';
    input.closest('label').hidden=!supported || !item || (key==='trendType'?false:key==='trendOrigin'?kind!=='linear':key==='trendDegree'?kind!=='polynomial':!enabled || (['trendX','trendY','trendFontSize','trendDigits'].includes(key) && item.trendEquation===false));
  });
}

function syncSeriesErrorControls() {
  const modes = {error:['auto','symmetric'],errorPlus:['asymmetric'],errorMinus:['asymmetric'],errorMin:['minmax'],errorMax:['minmax']};
  const generic = editableXY(config.plotType || 'General');
  $$('[data-series-field]').forEach(input => {
    const allowed = modes[input.dataset.seriesField];
    if (!allowed) return;
    const series = config.series[Number(input.closest('[data-series-index]').dataset.seriesIndex)];
    const enabled=generic && series && allowed.includes(series.errorMode || 'auto');
    if(input.closest('#series-table-body'))input.disabled=!engineReady || loading || exporting || !enabled;
    else input.closest('label').hidden = !enabled;
  });
}

function drawAnnotations() {
  $("#annotation-list").innerHTML = (config.annotations || []).map((item, index) => {
    const text = (key, label) => `<label>${label}<input data-annotation-field="${key}" value="${escapeHTML(item[key] ?? '')}"></label>`;
    const num = (key, label) => `<label>${label}<input type="number" step="${/^[xy][12]?$/.test(key) ? (item.coordinate_system === 'data' ? 'any' : '.01') : key === 'rotation' ? '1' : '.1'}" data-annotation-field="${key}" value="${escapeHTML(item[key] ?? '')}"></label>`;
    return `<details class="annotation-card ${selected.has(item.id)?'selected':''}" data-annotation-index="${index}" ${selected.has(item.id)?'open':''}><summary><button type="button" class="button quiet" data-select-annotation="${escapeHTML(item.id)}" aria-pressed="${selected.has(item.id)}">${{text:"文字",arrow:"矢印",segment:"線"}[item.type]} ${index+1} ${escapeHTML(item.text || '')}</button></summary>
      ${item.type === "text" ? `<label>文字<textarea data-annotation-field="text" rows="3" spellcheck="false">${escapeHTML(item.text ?? '')}</textarea></label>` : ''}
      <div class="field-grid">${item.type === "text" ? num("x", "X") + num("y", "Y") + num("font_size", "フォントサイズ (pt)") + num("rotation", "回転 (度)") : num("x1", "始点X") + num("y1", "始点Y") + num("x2", "終点X") + num("y2", "終点Y") + num("line_width", "線幅 (pt)") + text("line_style", "線種 (- / -- / -. / :)")}
      ${item.type === "arrow" ? `<label>矢印<select data-annotation-field="arrow_style">${choiceOptions([["->","片矢印"],["<->","両矢印"],["-|>","塗り矢印"]],item.arrow_style)}</select></label>` + num("arrow_size", "矢印サイズ (pt)") : ''}
      <label>色<input type="color" data-annotation-field="color" value="${escapeHTML(item.color)}"></label>${opacityControl('data-annotation-field="opacity"','不透明度',item.opacity ?? 1)}<label title="グラフ枠基準では左下が0、右上が1です。位置はプレビュー上でドラッグできます。">座標<select data-annotation-field="coordinate_system">${choiceOptions([["axes_fraction","グラフ枠を基準（0〜1）"],["data","データ座標"]],item.coordinate_system)}</select></label></div>
      ${item.type === "text" ? `<label>フォント<select data-annotation-field="font_family">${choiceOptions([...loadedFonts].map(name=>[name,escapeHTML(name)]),item.font_family)}</select></label><div class="field-grid"><label>横揃え<select data-annotation-field="horizontal_alignment">${choiceOptions([["left","左"],["center","中央"],["right","右"]],item.horizontal_alignment)}</select></label><label>縦揃え<select data-annotation-field="vertical_alignment">${choiceOptions([["baseline","基準線"],["center","中央"],["top","上"],["bottom","下"]],item.vertical_alignment)}</select></label></div><div class="check-options"><label><input type="checkbox" data-annotation-field="bold" ${item.bold?'checked':''}>太字</label><label><input type="checkbox" data-annotation-field="italic" ${item.italic?'checked':''}>斜体</label></div>` : ''}
      <div class="check-options"><label><input type="checkbox" data-annotation-field="visible" ${item.visible?'checked':''}>表示</label><label><input type="checkbox" data-annotation-field="locked" ${item.locked?'checked':''}>位置を固定</label></div><button type="button" class="button quiet" data-remove-annotation="${index}">削除</button></details>`;
  }).join('');
  $$('[data-annotation-field="text"]').forEach(input=>{
    input.title=`Enterで改行できます。${MICRO_HINT}`;
    // HTML strips one leading newline in a textarea; restore the exact text.
    input.value=config.annotations[Number(input.closest('[data-annotation-index]').dataset.annotationIndex)]?.text ?? '';
  });
  syncOpacityControls();
  enhanceColorInputs();
}

function drawMetadata() {
  drawSources();
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
  clearLivePreview();
  figureResult = null;
  unitAdvice = null; $('#unit-suggestion').hidden = true;
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
  applyPreset(result, presets.find(item=>item.id===inferred),data);
  if (inferred==='XPS Fit') result.series=[createSeries(0,1,data.columns[1]?.name || 'Raw')];
  if (inferred==='Roughness') result.series.forEach(item=>item.mode='line+scatter');
  if (inferred==='Particle Histogram') result.options.diameterColumn=Math.min(2,data.columns.length-1);
  if(data.groups){
    result.series=data.groups.flatMap(group=>initialSeries(group.columns.map(column=>({...column,name:column.originalName})),editableXY(group.plotType)?group.plotType:'General').map(item=>({...item,name:`${safeStem(group.filename)} · ${item.name}`}))).slice(0,32);
    for(const [i,item] of result.series.entries())item.color=COLORS[i%COLORS.length];
    const first=result.series[0];
    if(first)for(const axis of ['x','y']){
      const column=data.columns[first[axis]].originalName,split=column.lastIndexOf('/');
      result.axes[axis+'Label']=split<0?column:column.slice(0,split);
      result.axes[axis+'Unit']=split<0?'':column.slice(split+1);
    }
  }
  for(const item of result.series){const name=data.columns[item.y]?.originalName || data.columns[item.y]?.name || '';const unit=name.match(/(?:\/|\()\s*(pA|nA|μA|µA|uA|mA|A)\s*\)?$/)?.[1];if(unit)item.currentUnit=unit.replace(/µ|u/,'μ');}
  return result;
}

function combinedConfig(data, previousMetadata, previousConfig) {
  const next=initialSheetConfig(data);
  if(!previousMetadata || !editableXY(previousConfig.plotType))return next;
  next.axes=structuredClone(previousConfig.axes);next.options=structuredClone(previousConfig.options || {});next.annotations=structuredClone(previousConfig.annotations || []);next.plotType=previousConfig.plotType;
  const match=index=>data.columns.find(column=>column.name===previousMetadata.columns[index]?.name || !previousMetadata.sources && column.sourceIndex===0 && column.originalName===previousMetadata.columns[index]?.name)?.index;
  for(const item of next.series){
    const old=previousConfig.series.find(series=>match(series.y)===item.y);
    if(old){const x=item.x,y=item.y;Object.assign(item,structuredClone(old),{x:match(old.x) ?? x,y});for(const key of ['error','errorPlus','errorMinus','errorMin','errorMax'])item[key]=old[key]===''?'':match(old[key]) ?? '';if(['error','errorPlus','errorMinus','errorMin','errorMax'].some(key=>old[key]!=='' && item[key]===''))item.errorMode='none';}
    else for(const key of [...SERIES_APPEARANCE_FIELDS,...PROCESSING_FIELDS])if(key!=='currentUnit' && previousConfig.series.length && previousConfig.series.every(series=>String(series[key])===String(previousConfig.series[0][key])))item[key]=previousConfig.series[0][key];
  }
  return next;
}

function drawSources() {
  $('#source-files').hidden=!metadata?.sources;
  $('#header-row').closest('details')?.toggleAttribute('hidden',!!metadata?.sources);
  $('#source-list').innerHTML=(metadata?.sources || []).map((source,index)=>`<div class="source-file" data-source-index="${index}"><strong title="${escapeHTML(source.filename)}">${escapeHTML(source.filename)}</strong><div class="field-grid"><label>シート<select data-source-sheet aria-label="${escapeHTML(source.filename)}のシート">${choiceOptions(source.sheets.map((name,index)=>[String(index),name]),String(source.sheetIndex))}</select></label><label>ヘッダー行<input data-source-header type="number" min="1" max="1000" step="1" value="${source.headerRow}"></label></div></div>`).join('');
}

async function openDataFiles(files) {
  if(!engineReady || loading || exporting || pendingDataFiles)return false;
  files=[...files];
  if(!files.length)return false;
  if(files.length>16 || files.some(file=>!/\.(xlsx|xlsm|xls|csv|txt)$/i.test(file.name)) || files.reduce((sum,file)=>sum+file.size,0)>30*1024*1024){
    status('Excel / CSV / TXTは16ファイル・合計30 MB以内で選んでください。','error');return false;
  }
  if(!sourceData || !metadata)return loadDataFiles(files);
  pendingDataFiles=files;
  $('#data-import-files').textContent=files.map(file=>file.name).join('、');
  $('#data-import-unsaved').hidden=!hasUnsavedChanges();
  $('#data-import-add').disabled=!editableXY(config.plotType);
  $('#data-import-unavailable').hidden=editableXY(config.plotType);
  showDialog('#data-import-dialog');
  $('#data-import-cancel').focus();
  return false;
}

function cancelDataImport() {
  pendingDataFiles=null;$('#data-import-dialog').close();
}
async function acceptDataImport(append) {
  if(!pendingDataFiles || loading || exporting || append && !editableXY(config.plotType))return false;
  const files=pendingDataFiles;cancelDataImport();
  return loadDataFiles(files,append);
}
$('#data-import-cancel').addEventListener('click',cancelDataImport);
$('#data-import-dialog').addEventListener('cancel',cancelDataImport);
$('#data-import-dialog').addEventListener('close',()=>{pendingDataFiles=null;});
$('#data-import-new').addEventListener('click',()=>acceptDataImport(false));
$('#data-import-add').addEventListener('click',()=>acceptDataImport(true));

async function loadDataFiles(files, append=false, selection=null) {
  if(!engineReady || loading || exporting)return;
  files=[...files];
  if(!selection && files.length===1 && !append)return loadFile(files[0]);
  const oldMetadata=metadata,oldConfig=structuredClone(config);
  const nextHandles=selection?dataFileHandles:[...(append?dataFileHandles:[]),...files.map(file=>sourceHandles.get(file) || null)];
  const existing=append && sourceData?(sourceData.files || [{...sourceData,sheetIndex:metadata.sheetIndex,headerRow:loadedHeader}]):[];
  if(!selection && (files.length+existing.length>16 || files.some(file=>!/\.(xlsx|xlsm|xls|csv|txt)$/i.test(file.name)) || files.reduce((sum,file)=>sum+file.size,0)+existing.reduce((sum,file)=>sum+file.bytes.byteLength,0)>30*1024*1024)){status('Excel / CSV / TXTは16ファイル・合計30 MB以内で選んでください。','error');return;}
  let originals;
  try{originals=selection?sourceData.files:[...existing,...await Promise.all(files.map(async file=>({filename:file.name,bytes:await file.arrayBuffer(),sheetIndex:0,headerRow:1})))];}
  catch(error){status(`ファイルを読み込めませんでした: ${error.message}`,'error');return false;}
  if(!originals.length || originals.length>16 || originals.some(file=>!/\.(xlsx|xlsm|xls|csv|txt)$/i.test(file.filename)) || originals.reduce((sum,file)=>sum+file.bytes.byteLength,0)>30*1024*1024){status('Excel / CSV / TXTは16ファイル・合計30 MB以内で選んでください。','error');return;}
  const filename=selection?sourceData.filename:`${safeStem(originals[0].filename).slice(0,80)}_combined.csv`;
  loading=true;clearTimeout(renderTimer);++revision;updateButtons();status('複数ファイルを読み込んでいます…');
  try{
    const args={filename,...(selection?{sources:selection}:{files:originals.map(file=>({...file,bytes:file.bytes.slice(0)}))})};
    if(!append&&!selection)await checkFigureStudioProjectReplacement();
    const data=await request('load-many',args);
    if(!append&&!selection)prepareFigureStudioProjectReplacement();
    config=combinedConfig(data,append || selection?oldMetadata:null,oldConfig);metadata=data;loadedHeader=1;
    sourceData={filename,files:originals.map((file,index)=>({...file,sheetIndex:data.sources[index].sheetIndex,headerRow:data.sources[index].headerRow})),...((append||selection)&&sourceData?.figureStudioProjectId?{figureStudioProjectId:sourceData.figureStudioProjectId}:{})};
    dataFileHandles=nextHandles;
    if(!append && !selection){projectHandle=null;projectFilename='';sourceHandle=sourceHandles.get(files[0]) || null;sourceDirectory=null;$('#save-destination').value=folderSupported?'source':'download';}
    sample=false;sheetMode='shared';sharedSettings=null;sheetSettings.clear();
    if(config.series.length){sharedSettings=makeSettings(config,metadata,1);sheetSettings.set(0,sharedSettings);}
    selected.clear();history=[];future=[];lastState=structuredClone(config);view={zoom:1,x:0,y:0};
    $('#save-name').value=safeStem(filename);resetPreview();drawMetadata();drawControls();refreshSaveDestination();renderWanted=!!config.series.length;
    if(!renderWanted)status('描画できる列がありません。各ファイルのシート・ヘッダー行を選んでください。','error');
    return true;
  }catch(error){status(`読み込みに失敗しました: ${error.message}`,'error');drawSources();renderWanted=!!config.series.length;return false;}
  finally{loading=false;updateButtons();if(renderWanted)renderPreview();}
}

async function reloadSourceData(chosenFiles=null,{fromFolder=false}={}) {
  if(!engineReady || loading || exporting || !sourceData || !metadata)return false;
  const originals=sourceData.files || [{filename:sourceData.filename,sheetIndex:metadata.sheetIndex,headerRow:loadedHeader}];
  loading=true;clearTimeout(renderTimer);updateButtons();status('データを再読み込みしています…');
  try {
    let files,handles,directory=null,direct=false;
    if(chosenFiles){files=[...chosenFiles];handles=files.map(file=>sourceHandles.get(file) || null);}
    else if(fromFolder){
      if(!folderSupported)throw new Error('このブラウザではフォルダーからの読み込みに対応していません。ChromeまたはEdgeを使用してください。');
      if(new Set(originals.map(item=>item.filename)).size!==originals.length)throw new Error('別フォルダーにある同名ファイルは、この方法では判別できません。ファイルを個別に読み直してください。');
      directory=await window.showDirectoryPicker({...directoryOptions(sourceDirectory||sourceHandle||saveDirectory),mode:'read'});
      handles=await Promise.all(originals.map(async item=>{
        try{return await directory.getFileHandle(item.filename,{create:false});}
        catch(error){if(error.name==='NotFoundError')throw new Error(`選択したフォルダーに「${item.filename}」がありません。元ファイルのあるフォルダーを選んでください。`);throw error;}
      }));
      files=await Promise.all(handles.map(handle=>handle.getFile()));direct=true;
    }
    else if(dataFileHandles.length===originals.length && dataFileHandles.every(Boolean)){
      handles=dataFileHandles;
      direct=true;
      try {
        files=await Promise.all(handles.map(async handle=>{
          if(handle.queryPermission && await handle.queryPermission({mode:'read'})!=='granted' && await handle.requestPermission({mode:'read'})!=='granted')throw new Error('アクセスが許可されていません。');
          return handle.getFile();
        }));
      } catch {
        dataFileHandles=[];
        throw new Error(folderSupported?'元ファイルを直接読み込めませんでした。再読み込みの▽から「フォルダーから再読み込み」を選んでください。':'元ファイルを直接読み込めませんでした。もう一度「再読み込み」を押し、元ファイルを選び直してください。');
      }
    } else {
      handles=await window.showOpenFilePicker({...filePickerOptions('plotlauncher-files','再読み込みする元ファイル',{'application/octet-stream':['.xlsx','.xlsm','.xls','.csv','.txt']},saveDirectory||sourceDirectory||sourceHandle),multiple:originals.length>1});
      files=await Promise.all(handles.map(handle=>handle.getFile()));
    }
    if(files.length!==originals.length || !direct && new Set(originals.map(item=>item.filename)).size!==originals.length)throw new Error('元ファイルと同じ名前・数のファイルを選んでください。同名のファイルが複数ある場合は「データを開く」から読み直してください。');
    const ordered=originals.map((item,index)=>direct?index:files.findIndex(file=>file.name===item.filename));
    if(ordered.some(index=>index<0))throw new Error('元ファイルと同じ名前のファイルを選んでください。');
    const selectedFiles=ordered.map(index=>files[index]);
    if(selectedFiles.some(file=>!/\.(xlsx|xlsm|xls|csv|txt)$/i.test(file.name)) || selectedFiles.reduce((sum,file)=>sum+file.size,0)>30*1024*1024)throw new Error('Excel / CSV / TXTは合計30 MB以内で選んでください。');
    const refreshed=await Promise.all(selectedFiles.map(async(file,index)=>({...originals[index],bytes:await file.arrayBuffer()})));
    const settings=makeSettings(config,metadata,loadedHeader);
    // The project loader validates settings and rolls back the worker if a
    // used column/sheet disappeared. No original file or font is overwritten.
    const result=await request('project',{filename:sourceData.filename,...(sourceData.files?{files:refreshed.map(file=>({...file,bytes:file.bytes.slice(0)}))}:{bytes:refreshed[0].bytes.slice(0)}),sheetIndex:metadata.sheetIndex,headerRow:loadedHeader,settings,fonts:[],sheetSettings:projectSheetSettings(),sharedSettings});
    ++revision;metadata=result.metadata;config=result.config;
    sourceData=sourceData.files?{filename:sourceData.filename,files:refreshed,figureStudioProjectId:sourceData.figureStudioProjectId}:{filename:sourceData.filename,bytes:refreshed[0].bytes,figureStudioProjectId:sourceData.figureStudioProjectId};
    dataFileHandles=ordered.map(index=>handles[index]);
    if(dataFileHandles[0] && sourceHandle!==dataFileHandles[0]){sourceHandle=dataFileHandles[0];sourceDirectory=null;refreshSaveDestination();}
    if(directory){sourceDirectory=directory;refreshSaveDestination();}
    selected.clear();history=[];future=[];lastState=structuredClone(config);
    resetPreview();drawMetadata();drawControls();renderWanted=true;
    return true;
  } catch(error){status(error.name==='AbortError'?'再読み込みをキャンセルしました。':`再読み込みに失敗しました: ${error.message}`,error.name==='AbortError'?'ready':'error');return false;}
  finally{loading=false;updateButtons();if(renderWanted)renderPreview();}
}
$('#reload-data').addEventListener('click',()=>{
  if(!engineReady || loading || exporting || !sourceData)return;
  const count=sourceData.files?.length || 1;
  if(!(dataFileHandles.length===count && dataFileHandles.every(Boolean)) && typeof window.showOpenFilePicker!=='function'){
    $('#reload-data-files').click();return;
  }
  void reloadSourceData();
});
$('#reload-data-files').addEventListener('change',event=>{const files=[...event.target.files];event.target.value='';if(files.length)void reloadSourceData(files);});
$('#reload-data-folder').addEventListener('click',()=>{$('#reload-data-menu').open=false;void reloadSourceData(null,{fromFolder:true});});
window.addEventListener('pointerdown',event=>{if(!event.target.closest('#reload-data-menu'))$('#reload-data-menu').open=false;});
$('#reload-data-menu').addEventListener('keydown',event=>{if(event.key==='Escape'){$('#reload-data-menu').open=false;event.preventDefault();}});

function configurationForSheet(data, setting, template) {
  const inherited = sheetMode === 'shared' ? template : setting?.inheritSharedSettings ? sharedSettings : setting?.inheritFirstSheet ? sheetSettings.get(0) : !setting ? template : null;
  return inherited ? configForSheet(inherited, data) : setting ? restoreSettings(setting, data) : initialSheetConfig(data);
}

async function loadFile(file, isSample = false, reload = false, fromClipboard = false, sampleSettings = null) {
  if (loading || exporting || !engineReady) return;
  if (!reload && (!/\.(xlsx|xlsm|xls|csv|txt)$/i.test(file.name) || file.size > 30 * 1024 * 1024)) {
    status("30 MB以内のExcel（.xlsx / .xlsm / .xls）、CSVまたはTXTを選んでください。", "error");
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
    if(!reload)await checkFigureStudioProjectReplacement();
    const nextMetadata = await request("load", args);
    if(!reload)prepareFigureStudioProjectReplacement();
    metadata = nextMetadata;
    loadedHeader = metadata.headerRow || headerRow;
    sheetSettings = nextSheets;
    if (!reload) {
      projectHandle=null;projectFilename='';
      sheetSettings.clear();
      sheetMode = 'shared'; sharedSettings = null;
      sourceData = {filename, bytes:originalBytes};
      dataFileHandles = [sourceHandles.get(file) || null];
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
      if (sampleSettings) config = restoreSettings(sampleSettings, metadata);
      else {
        config.series = metadata.columns.slice(1).map((column, index) => createSeries(0, column.index, column.name, index, config.plotType));
        config.axes.xLabel = "Potential"; config.axes.xUnit = "V";
        config.axes.yLabel = "Current density"; config.axes.yUnit = "mA/cm^2";
      }
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

function validateSampleCatalog(value) {
  const validId=id=>typeof id==='string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && id.length<=60;
  const text=(value,limit)=>typeof value==='string' && value.trim().length>0 && value.length<=limit;
  if(value?.version!==1 || !Array.isArray(value.groups) || !value.groups.length || value.groups.length>10 || !Array.isArray(value.samples) || !value.samples.length || value.samples.length>100)throw new Error('サンプルの一覧を確認してください。');
  const groups=new Set(),ids=new Set();
  for(const group of value.groups){if(!validId(group.id)||group.id==='all'||groups.has(group.id)||!text(group.title,40))throw new Error('サンプルの分類を確認してください。');groups.add(group.id);}
  for(const item of value.samples){if(!validId(item.id)||ids.has(item.id)||!groups.has(item.group)||!text(item.title,100)||!text(item.description,200))throw new Error('サンプルの一覧を確認してください。');ids.add(item.id);}
  return value;
}

function drawSamplePicker() {
  if(!sampleCatalog)return;
  $('#sample-groups').innerHTML=[{id:'all',title:'すべて'},...sampleCatalog.groups].map(group=>`<button type="button" class="sample-group" data-sample-group="${group.id}" aria-pressed="${sampleGroup===group.id}">${escapeHTML(group.title)}</button>`).join('');
  $('#sample-list').innerHTML=sampleCatalog.samples.filter(item=>sampleGroup==='all'||item.group===sampleGroup).map(item=>`<button type="button" class="sample-card" data-sample-id="${item.id}" aria-label="${escapeHTML(item.title)}のサンプルを使う" title="${escapeHTML(item.description)}"><img src="${escapeHTML(new URL(`samples/${item.id}.svg${new URL(import.meta.url).search}`,import.meta.url).href)}" alt="" loading="lazy"><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.description)}</span></button>`).join('');
  $$('#sample-list button,#sample-groups button').forEach(button=>button.disabled=loading||exporting||pendingSampleId!==null);
}

async function openSamplePicker() {
  if(!engineReady || loading || exporting)return;
  clearSampleConfirmation();
  showDialog('#sample-dialog');
  $('#sample-picker-status').textContent=sampleCatalog?'':'サンプルを読み込んでいます…';
  try {
    if(!sampleCatalog){
      sampleCatalogPromise ||= fetch(new URL(`samples/catalog.json${new URL(import.meta.url).search}`,import.meta.url)).then(async response=>{
        if(!response.ok)throw new Error('サンプルの一覧を読み込めませんでした。もう一度開いてください。');
        return validateSampleCatalog(await response.json());
      }).catch(error=>{sampleCatalogPromise=null;throw error;});
      sampleCatalog=await sampleCatalogPromise;
    }
    drawSamplePicker();$('#sample-picker-status').textContent='';
  } catch(error){$('#sample-picker-status').textContent=error.message;}
}

function clearSampleConfirmation() {
  pendingSampleId=null;$('#sample-confirm').hidden=true;updateButtons();
}

async function loadSample(id, confirmed=false) {
  if(!engineReady || loading || exporting || !sampleCatalog?.samples.some(item=>item.id===id))return false;
  if(!confirmed && hasUnsavedChanges()){
    pendingSampleId=id;
    $('#sample-confirm-message').textContent=`未保存の変更があります。「${sampleCatalog.samples.find(item=>item.id===id).title}」に切り替えますか？`;
    $('#sample-confirm').hidden=false;updateButtons();$('#sample-confirm-cancel').focus();return false;
  }
  clearSampleConfirmation();
  loading=true;updateButtons();$('#sample-picker-status').textContent='サンプルを読み込んでいます…';
  try {
    const response=await fetch(new URL(`samples/${id}.plotproject${new URL(import.meta.url).search}`,import.meta.url));
    if(!response.ok)throw new Error('サンプルを読み込めませんでした。もう一度選んでください。');
    const saved=await response.json(),project=parseProject(saved);
    const file=new File([project.data.bytes],project.data.filename,{type:'text/csv'});
    loading=false;
    const opened=await loadFile(file,true,false,false,project.settings);
    if(opened){$('#sample-dialog').close();$('#sample-picker-status').textContent='';return true;}
    $('#sample-picker-status').textContent='サンプルを開けませんでした。もう一度選んでください。';return false;
  } catch(error){$('#sample-picker-status').textContent=error.message;return false;}
  finally{loading=false;updateButtons();}
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
  showDialog('#paste-dialog'); $('#paste-text').focus();
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

function changed(delay = 400) {
  if (!restoring && lastState && JSON.stringify(lastState)!==JSON.stringify(config)) {
    history.push(lastState); if(history.length>30)history.shift(); future=[];
  }
  lastState=structuredClone(config); $("#undo").disabled=!history.length;$("#redo").disabled=!future.length;
  ++revision;
  $("#figure-stage").classList.add("pending");
  previewUpdating();
  $("#figure-size").textContent = `軸領域 ${config.axes.width || "—"} × ${config.axes.height || "—"} cm`;
  updateButtons();
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => { renderWanted = true; renderPreview(); }, delay);
}

function previewUpdating() {
  const existing=!!figureResult && !$('#figure-image').hidden,indicator=$('#preview-state');
  indicator.className=existing?'preview-state updating':'preview-state';
  indicator.textContent=existing?'':'設定を反映中';
  indicator.title='プレビューを更新中';
  indicator.setAttribute('aria-label','プレビューを更新中');
}

function legendModeControls() {
  return `<div class="field-grid"><label>凡例の表示<select data-axis="legendStyle">${choiceOptions([['symbols','線／点あり'],['text','文字列のみ']],config.axes.legendStyle || 'symbols')}</select></label><label>操作・移動<select data-axis="legendMode">${choiceOptions([['together','一括'],['individual','系列ごと']],config.axes.legendMode || 'together')}</select></label></div>`+legendTextColorControls(key=>`data-axis="legendText${key}"`,config.axes.legendTextColorMode || 'auto',config.axes.legendTextColor || '#000000');
}
function legendTextColorControls(attribute,mode,color,individual=false) {
  return `<div class="legend-text-color-controls field-grid"><label title="表示方法に合わせる：線／点ありは黒、文字列のみは系列の色になります。">${individual?'この凡例の文字色':'文字色'}<select data-legend-color-mode ${attribute('ColorMode')}>${choiceOptions([...(individual?[['inherit','全体に従う']]:[]),['auto','表示方法に合わせる'],['black','黒'],['series','系列の色'],['custom','指定色']],mode)}</select></label><label data-legend-custom-color ${mode==='custom'?'':'hidden'}>指定色<input type="color" ${attribute('Color')} value="${escapeHTML(color)}" aria-label="${individual?'この凡例の':'凡例の'}指定色"></label></div>`;
}
function syncLegendColorControls() {
  $$('[data-legend-color-mode]').forEach(input=>{const custom=input.closest('.legend-text-color-controls')?.querySelector('[data-legend-custom-color]');if(custom)custom.hidden=input.value!=='custom';});
}
const isLegendId=id=>id==='legend' || /^legend-item-\d+$/.test(id || '');
function legendEntry(id) {return figureResult?.geometry.legendItems?.find(item=>item.id===id);}
function legendEntryState(entry) {
  if(entry.seriesIndex!==null && entry.seriesIndex!==undefined)return config.series[entry.seriesIndex];
  config.options ||= {};config.options.legendEntries ||= {};
  return config.options.legendEntries[entry.key] ||= {};
}
function hasHiddenLegendItems() {
  return config.series.some(item=>item.legendVisible===false) || Object.values(config.options?.legendEntries || {}).some(item=>item.visible===false);
}
function resetLegendPositions(entry=null,position='best') {
  if(!entry){config.axes.legendX=config.axes.legendY='';config.axes.legendPosition=position;}
  for(const item of entry?[legendEntryState(entry)]:config.series){item.legendX=item.legendY='';}
  if(!entry)for(const item of Object.values(config.options?.legendEntries || {})){item.x=item.y='';}
  else if(entry.seriesIndex===null || entry.seriesIndex===undefined){const item=legendEntryState(entry);item.x=item.y='';delete item.legendX;delete item.legendY;}
}
function restoreLegendItems() {
  for(const item of config.series)item.legendVisible=true;
  for(const item of Object.values(config.options?.legendEntries || {}))item.visible=true;
  $$('[data-series-field="legendVisible"],[data-legend-field="visible"]').forEach(input=>input.checked=true);
  config.axes.legend=true;drawControls();changed();
}
$('#restore-legend-items').addEventListener('click',restoreLegendItems);

async function renderPreview() {
  if (!engineReady || !metadata || loading || exporting || renderRunning || !renderWanted) return;
  await loadCurrentLocalFonts();
  if (loading || exporting || renderRunning || !renderWanted) return;
  renderWanted = false;
  renderRunning = true;
  const snapshot = structuredClone(config), targetRevision = revision;
  const existing=!!figureResult && !$('#figure-image').hidden;
  previewUpdating();
  // Routine edits stay quiet. Announce only the first graph or a slow update.
  if(!existing)status("グラフを描画しています…");
  const progressTimer=existing?setTimeout(()=>{if(renderRunning && targetRevision===revision && !loading && !exporting)status('プレビューを更新しています…');},2000):null;
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
    $('#preview-state').title='';$('#preview-state').removeAttribute('aria-label');
    $("#figure-size").textContent = `軸領域 ${snapshot.axes.width} × ${snapshot.axes.height} cm`;
    const checks=[...result.warnings,...result.series.filter(item=>item.processing && Object.keys(item.processing).length).map(item=>`${item.name}: ${Object.entries(item.processing).map(([key,value])=>`${({slope:'補正した傾き',fittedSlope:'自動計算の傾き',reference:'基準値Y₀（表示単位変換前）',areaCm2:'試料面積（cm²）',factor:'Y係数'})[key] || key} = ${Number(value.toPrecision(8))}`).join('、')}`)];
    $("#warning-list").replaceChildren(...checks.map(text => { const item = document.createElement("li"); item.textContent = text; return item; }));
    $("#plot-warnings").hidden = !checks.length;
    status(`${result.series.length} 系列を描画しました · ${result.series.map(series => `${series.points.toLocaleString()} 点`).join(" / ")}`, "ready");
    renderedRevision = revision;
    syncProcessingControls();
    showUnitAdvice();
  } catch (error) {
    if (targetRevision !== revision) return;
    clearLivePreview();
    positionInteractions();
    $("#preview-state").className = "preview-state error";
    $("#preview-state").textContent = "設定を確認";
    $('#preview-state').title='';$('#preview-state').removeAttribute('aria-label');
    $("#figure-stage").classList.remove("pending");
    status(error.message, "error");
  } finally {
    clearTimeout(progressTimer);
    renderRunning = false;
    updateButtons();
    if(!renderWanted && $('#series-colormap').open)scheduleColormapPreview();
    if (renderWanted) renderPreview();
  }
}

function showUnitAdvice() {
  if (unitAdviceSource !== sourceData) {unitAdviceSource = sourceData; declinedUnits.clear();}
  unitAdvice = null;
  for (const axis of ['x','y','y2']) {
    if (axis !== 'x' && config.options?.processingAxes?.[axis]?.kind === 'normalized') continue;
    const suggestion = unitSuggestion(axis, figureResult?.axisInfo?.[axis]);
    if (suggestion && !declinedUnits.has(`${metadata?.sheetIndex}:${axis}:${suggestion.from}`)) {unitAdvice=suggestion;break;}
  }
  $('#unit-suggestion').hidden = !unitAdvice;
  if (!unitAdvice) return;
  const maximum=Number(unitAdvice.maximum.toPrecision(5));
  $('#unit-suggestion-text').textContent = unitAdvice.factor ?
    `${axisName(unitAdvice.axis)}軸の主目盛りの最大絶対値は ${maximum} ${readableUnit(unitAdvice.from)} です（推奨0.1〜1000）。${readableUnit(unitAdvice.to)}へ換算しますか？ 数値も×${Number(unitAdvice.factor.toPrecision(8))}に変更します。` :
    `${axisName(unitAdvice.axis)}軸の主目盛りの最大絶対値は ${maximum} です（推奨0.1〜1000）。${unitAdvice.from ? '対応する換算先がないため、軸の単位を確認してください。' : '換算のため、先に軸の単位を設定してください。'}`;
  $('#apply-unit-suggestion').hidden = !unitAdvice.factor;
  $('#dismiss-unit-suggestion').textContent = unitAdvice.factor ? 'いいえ' : '閉じる';
}
$('#apply-unit-suggestion').addEventListener('click', () => {
  if (!unitAdvice?.factor || loading || exporting || renderRunning || renderedRevision!==revision) return;
  try {
    config=convertAxisUnit(config,unitAdvice.axis,unitAdvice.from,unitAdvice.to);
    unitAdvice=null;$('#unit-suggestion').hidden=true;drawControls();changed();
  } catch(error) {status(error.message,'error');}
});
$('#dismiss-unit-suggestion').addEventListener('click', () => {
  if (unitAdvice) declinedUnits.add(`${metadata?.sheetIndex}:${unitAdvice.axis}:${unitAdvice.from}`);
  showUnitAdvice();
});

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
  const save=async(blob,requestedName)=>{
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
    save.handle=handle;
    return name;
  };
  return save;
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
  ['#data-file','Excel / CSV / TXT',{'application/octet-stream':['.xlsx','.xlsm','.xls','.csv','.txt']},openDataFiles],
  ['#add-data-files','Excel / CSV / TXT',{'application/octet-stream':['.xlsx','.xlsm','.xls','.csv','.txt']},files=>loadDataFiles(files,true)],
  ['#project-file','PlotLauncherプロジェクト',{'application/json':['.plotproject','.json']},readProject],
  ['#settings-file','設定JSON',{'application/json':['.json']},readSettings],
  ['#user-presets-file','マイプリセットJSON',{'application/json':['.json']},importUserPresetsFile]
]) $(selector).addEventListener('click',async event=>{
  if(typeof window.showOpenFilePicker!=='function')return;
  event.preventDefault();if(loading||exporting||(!engineReady && selector!=='#user-presets-file'))return;
  try {
    const multi=['#data-file','#add-data-files'].includes(selector);
    const handles=await window.showOpenFilePicker({...filePickerOptions('plotlauncher-files',description,accept,saveDirectory||sourceDirectory||sourceHandle),multiple:multi});
    const files=await Promise.all(handles.map(async handle=>{const file=await handle.getFile();sourceHandles.set(file,handle);return file;}));
    if(files.length)await open(multi?files:files[0]);
  } catch(error){if(error.name!=='AbortError'){if(selector==='#user-presets-file')presetMessage('#manage-presets-message',error.message,true);else status(error.message,'error');}}
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
  refreshSaveDestination(); updateButtons(); showDialog('#save-dialog');
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

async function prepareDocumentSaver(name, description, extension, startIn=saveDirectory||sourceDirectory||sourceHandle) {
  const fallback = () => prepareSaver();
  return documentSaver({name, id:'plotlauncher-files', description, accept:{'application/json':[extension]}, startIn, fallback});
}

$("#data-file").addEventListener("change", event => { const files=[...event.target.files];event.target.value="";if(files.length)openDataFiles(files); });
$('#add-data-files').addEventListener('change',event=>{const files=[...event.target.files];event.target.value='';if(files.length)loadDataFiles(files,true);});
$('#add-data').addEventListener('click',()=>$('#add-data-files').click());
$('#source-list').addEventListener('change',event=>{
  const input=event.target;if(input.dataset.sourceSheet===undefined && input.dataset.sourceHeader===undefined || loading || exporting)return;
  const index=Number(input.closest('[data-source-index]').dataset.sourceIndex),sources=metadata.sources.map((source,index)=>({index,sheetIndex:source.sheetIndex,headerRow:source.headerRow}));
  const value=Number(input.value),header=input.dataset.sourceHeader!==undefined;
  if(!Number.isInteger(value)||value<(header?1:0)||header&&value>1000){status('ヘッダー行は1〜1000の整数で指定してください。','error');drawSources();return;}
  sources[index][header?'headerRow':'sheetIndex']=value;void loadDataFiles([],false,sources);
});
$("#drop-zone").addEventListener("click", () => $("#data-file").click());
async function rememberDroppedHandles(transfer,files) {
  await Promise.allSettled([...(transfer.items || [])].filter(item=>item.kind==='file').map(async item=>{
    const handle=await item.getAsFileSystemHandle?.();
    if(handle?.kind==='file'){
      const file=files.find(file=>file.name===handle.name && !sourceHandles.has(file));
      if(file)sourceHandles.set(file,handle);
    }
  }));
}
for (const zone of [$("#drop-zone"), $("#data-drop-area")]) {
  for (const type of ["dragenter", "dragover"]) zone.addEventListener(type, event => { event.preventDefault(); if (engineReady && !loading && !exporting) event.currentTarget.classList.add("drag-over"); });
  zone.addEventListener("dragleave", event => event.currentTarget.classList.remove("drag-over"));
  zone.addEventListener("drop", async event => { event.preventDefault();event.stopPropagation();event.currentTarget.classList.remove("drag-over"); const files=[...event.dataTransfer.files];if(engineReady && !loading && !exporting && !pendingDataFiles && files.length){await rememberDroppedHandles(event.dataTransfer,files);files.length===1?openDroppedFile(files[0]):openDataFiles(files);} });
}
// Dropping a file elsewhere must not navigate away and discard the settings.
window.addEventListener("dragover", event => event.preventDefault());
window.addEventListener("drop", async event => {event.preventDefault();const files=[...event.dataTransfer.files];if(!files.length || loading || exporting || pendingDataFiles)return;await rememberDroppedHandles(event.dataTransfer,files);if(files.length===1)await openDroppedFile(files[0]);else await openDataFiles(files);});
$("#sample-data").addEventListener("click", openSamplePicker);
$('#close-sample-dialog').addEventListener('click',()=>{clearSampleConfirmation();$('#sample-dialog').close();});
$('#sample-dialog').addEventListener('cancel',clearSampleConfirmation);
$('#sample-confirm-cancel').addEventListener('click',clearSampleConfirmation);
$('#sample-confirm-load').addEventListener('click',()=>{if(pendingSampleId!==null)return loadSample(pendingSampleId,true);});
$('#sample-groups').addEventListener('click',event=>{
  const button=event.target.closest('[data-sample-group]');
  if(!button || !sampleCatalog || button.dataset.sampleGroup!=='all' && !sampleCatalog.groups.some(group=>group.id===button.dataset.sampleGroup))return;
  sampleGroup=button.dataset.sampleGroup;drawSamplePicker();
});
$('#sample-list').addEventListener('click',event=>{
  const button=event.target.closest('[data-sample-id]');if(button)return loadSample(button.dataset.sampleId);
});
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
  if (['trendX','trendY','legendFontSize'].includes(input.dataset.seriesField) || input.dataset.legendField==='fontSize') return false;
  if (['detrendMin','detrendMax','detrendSlope','referenceMin','referenceMax'].includes(input.dataset.seriesField)) return false;
  return !['xMin','xMax','yMin','yMax','y2Min','y2Max','xStep','yStep','y2Step','xMinorStep','yMinorStep','y2MinorStep','legendX','legendY','xLabelX','xLabelY','yLabelX','yLabelY','y2LabelX','y2LabelY'].includes(input.dataset.axis);
}

function applyControlInput(event) {
  const input = event.target;
  if (input.dataset.seriesScope !== undefined) {
    const fields=$('#element-editor-fields');
    const index=input.value==='all'?Number(fields.dataset.seriesEditorIndex):input.value==='one'?Number(fields.dataset.seriesEditorOrigin ?? fields.dataset.seriesEditorIndex):/^series:\d+$/.test(input.value)?Number(input.value.slice(7)):NaN;
    if(!Number.isInteger(index) || index<0 || !config.series[index])return;
    openElementEditor(input.value==='all'?'seriesAll':'series',index);
    fields.querySelector('[data-series-scope]')?.focus();return;
  }
  // Native number inputs keep an internal editing buffer for "0.", "-", "1e-".
  // Do not commit incomplete values or assign back to the field being edited.
  if (incompleteNumberInput(input)) return;
  if (input.dataset.axisAuto) {setAxisAutomatic(input);return;}
  if (input.dataset.unitAxis) {
    const key = `${input.dataset.unitAxis}Unit`;
    if (input.value === '__custom__') {
      syncUnitControls(key);
      const custom = input.parentElement.querySelector(`[data-axis="${key}"]`);
      custom.focus(); custom.select(); return;
    }
    const axis=input.dataset.unitAxis,from=config.axes[key]==='auto' ? figureResult?.axisInfo?.[axis]?.unit : config.axes[key];
    try {
      if (input.value!==from && !figureResult?.axisInfo?.[axis]?.categorical && unitConversion(from,input.value)) {
        config=convertAxisUnit(config,axis,from,input.value);drawControls();
      } else config.axes[key] = input.value;
    } catch(error) {syncUnitControls();status(error.message,'error');return;}
    syncUnitControls(); changed(); return;
  }
  if (input.dataset.axis) {
    const key = input.dataset.axis;
    if (key === 'fontFamily' || key === 'japaneseFontFamily') return selectLocalFont(input);
    config.axes[key] = input.type === "checkbox" ? (input.dataset.invert === "true" ? !input.checked : input.checked) :
      input.dataset.axisBoolean === 'true' ? input.value === 'true' : axisConfigValue(key,input.type === 'range' ? Number(input.value) : input.value);
    if (/^(x|y|y2)FitData$/.test(key) && input.checked) {
      const axis=key.replace(/FitData$/,'');
      for(const suffix of ['Min','Max']) {config.axes[axis+suffix]='';$$(`[data-axis="${axis}${suffix}"]`).forEach(field=>field.value='');}
    }
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
    if(key==='legendPosition')resetLegendPositions(null,input.value);
    if(key==='legendMode')selected.clear();
    if(key==='fontScale')for(const fontKey of ['tickFontScale','labelFontScale','legendFontScale'])$$(`[data-axis="${fontKey}"]`).forEach(field=>{field.value=axisControlValue(fontKey,config.axes[fontKey]);field.min=axisControlValue(fontKey,.2);field.max=axisControlValue(fontKey,3);});
    if(key==='fontScale')$$('[data-series-field="trendFontSize"]').forEach(field=>{const item=config.series[Number(field.closest('[data-series-index]').dataset.seriesIndex)];field.value=seriesControlValue('trendFontSize',item.trendFontSize);field.min=3*config.axes.fontScale;field.max=24*config.axes.fontScale;});
    $$(`[data-axis="${key}"]`).forEach(field => {if(field !== input) {field.value = axisControlValue(key, config.axes[key]); field.checked = field.dataset.invert === "true" ? !config.axes[key] : config.axes[key];}});
    if (/^(x|y|y2)Unit$/.test(key)) syncUnitControls(key);
  }
  else if (input.dataset.seriesField) {
    const key=input.dataset.seriesField,index=Number(input.closest('[data-series-index]').dataset.seriesIndex);
    const coefficient=['xFactor','yFactor'].includes(key) ? parseCoefficient(input.value) : undefined;
    if (coefficient !== undefined) {
      input.setCustomValidity?.(coefficient === null ? '数値または分数（例：1/2）を入力してください。分母を0にはできません。' : '');
      input.setAttribute('aria-invalid',String(coefficient === null));
      if (coefficient === null) return;
    }
    if(key==='detrendSlope')input.setAttribute('value',input.value);
    const indices=input.dataset.seriesAll==='true' && [...SERIES_APPEARANCE_FIELDS,...PROCESSING_FIELDS].includes(key)?config.series.map((_,i)=>i):[index];
    for(const index of indices) {
      config.series[index][key] = coefficient ?? (input.type==='checkbox'?input.checked:key==='trendFontSize'?Number((Number(input.value)/Number(config.axes.fontScale)).toPrecision(12)):input.type==='range'?Number(input.value):input.value);
      $$(`[data-series-index="${index}"] [data-series-field="${key}"]`).forEach(field=>{if(field!==input){field.value=coefficient ?? input.value;field.checked=input.checked;if(coefficient!==undefined){field.setCustomValidity?.('');field.setAttribute('aria-invalid','false');}}});
    }
    if (input.dataset.seriesField === 'errorMode') syncSeriesErrorControls();
    if (input.dataset.seriesField === 'yAxis') syncYAxesControls();
    if (['trendType','trendEquation'].includes(input.dataset.seriesField)) syncTrendControls();
    if (PROCESSING_FIELDS.includes(key) || key==='yAxis') {
      if(['density','normalization','yAxis'].includes(key))syncProcessingAxes();
      syncProcessingControls();
    }
  } else if (input.dataset.legendKey!==undefined && ['visible','style','fontSize','textColorMode','textColor'].includes(input.dataset.legendField)) {
    config.options ||= {};config.options.legendEntries ||= {};
    (config.options.legendEntries[input.dataset.legendKey] ||= {})[input.dataset.legendField]=input.type==='checkbox'?input.checked:input.value;
  } else if (input.dataset.annotationField) {
    const item = config.annotations[Number(input.closest("[data-annotation-index]").dataset.annotationIndex)];
    item[input.dataset.annotationField] = input.type === "checkbox" ? input.checked : ['number','range'].includes(input.type) ? Number(input.value) : input.value;
    const index=input.closest('[data-annotation-index]').dataset.annotationIndex,key=input.dataset.annotationField;
    $$(`[data-annotation-index="${index}"] [data-annotation-field="${key}"]`).forEach(field=>{
      if(field===input)return;
      if(field.type==='checkbox')field.checked=Boolean(item[key]);else field.value=item[key];
      if(field.tagName==='TEXTAREA')field.textContent=item[key];
    });
  } else if (input.dataset.option) {
    config.options ||= {}; config.options[input.dataset.option] = input.type === "checkbox" ? input.checked : ['number','range'].includes(input.type) ? Number(input.value) : input.value;
    $$(`[data-option="${input.dataset.option}"]`).forEach(field=>{if(field!==input){field.value=input.value;field.checked=input.checked;}});
  } else if (input.dataset.fill) {
    const fill=config.options.fills[Number(input.closest('[data-fill-index]').dataset.fillIndex)];
    fill[input.dataset.fill]=['number','range'].includes(input.type) || input.tagName === "SELECT"?Number(input.value):input.value;
  } else if(input.dataset.previewPreset !== undefined){changePlotType(input.value);return;}
  else return;
  syncAxisAutomaticControls(); syncOpacityControls(input); syncLegendColorControls(); changed();
}
$("#plot-form").addEventListener("input", applyControlInput);
$('#preset-options').addEventListener('input', applyControlInput);
$("#series-list").addEventListener("click", event => {
  if(resetProcessingSlope(event))return;
  const reset=event.target.closest('[data-reset-trend]');
  if(reset){const index=Number(reset.dataset.resetTrend);config.series[index].trendX=config.series[index].trendY='';for(const key of ['trendX','trendY'])$$(`[data-series-index="${index}"] [data-series-field="${key}"]`).forEach(input=>input.value='');changed();return;}
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
  config.series.push(createSeries(x, y, metadata.columns[y].name, config.series.length, config.plotType));
  drawControls();
  changed();
});
$("#refresh-preview").addEventListener("click", () => { clearTimeout(renderTimer); renderWanted = true; renderPreview(); });

$("#copy-image").addEventListener("click", copyFigureImage);
$("#open-project").addEventListener("click", () => $("#project-file").click());
$("#project-file").addEventListener("change", event => {
  const file=event.target.files[0]; event.target.value=""; if(file) readProject(file);
});
async function saveProject({saveAs=false}={}) {
  if(!engineReady || loading || exporting || !sourceData || !metadata || !config.series.length)return;
  exporting=true;updateButtons();
  try {
    const name=projectFilename || `${safeStem($("#save-name").value)}.plotproject`;
    let saveFile;
    if(projectHandle && !saveAs) {
      const permission={mode:'readwrite'};
      if(projectHandle.queryPermission && await projectHandle.queryPermission(permission)!=='granted' && (!projectHandle.requestPermission || await projectHandle.requestPermission(permission)!=='granted'))throw new Error('このファイルへの上書きが許可されていません。「名前を付けて保存」から保存先を選んでください。');
      saveFile=await documentSaver({name,handle:projectHandle});
    } else saveFile=await prepareDocumentSaver(name,"PlotLauncherプロジェクト",".plotproject",projectHandle || undefined);
    const savedState=projectEditState();
    const project=makeProject(makeSettings(config,metadata,loadedHeader), {...sourceData,sheetIndex:metadata.sheetIndex,headerRow:loadedHeader,sample}, [...importedFonts.values()], {
      saveName:$("#save-name").value,pngDpi:Number($("#png-dpi").value),view:{...view},sections:$$('#controls-panel .control-section').map(section=>section.open),sheetSettings:projectSheetSettings(),sheetMode,sharedSettings:sheetMode === 'shared' ? currentSharedSettings() : sharedSettings
    });
    const blob=new Blob([JSON.stringify(project)],{type:'application/json'});
    if(blob.size>PROJECT_MAX_SIZE)throw new Error('プロジェクトは130 MB以内にしてください。');
    const savedName=await saveFile(blob,name);
    projectHandle=saveFile.handle || null;projectFilename=savedName; savedProjectState=savedState; status(`${savedName} を保存しました。データと設定をまとめて再開できます。`,'ready');
  } catch(error){status(error.name==='AbortError'?'保存をキャンセルしました。':`プロジェクトを保存できませんでした: ${error.message}`,error.name==='AbortError'?'ready':'error');}
  finally{exporting=false;updateButtons();if(renderWanted)renderPreview();}
}
$("#save-project").addEventListener("click",saveProject);
$('#save-project-as').addEventListener('click',()=>{$('#project-save-menu').open=false;void saveProject({saveAs:true});});
window.addEventListener('pointerdown',event=>{if(!event.target.closest('#project-save-menu'))$('#project-save-menu').open=false;});
$('#project-save-menu').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();$('#project-save-menu').open=false;$('#project-save-menu summary')?.focus();}});
$('#new-project').addEventListener('click', () => {
  if (loading || exporting) return;
  // A fresh page clears data, settings, undo history and the worker together.
  // The existing beforeunload handler protects unsaved work on cancellation.
  window.location.assign(new URL('./', window.location.href).href);
});

function updateSessionStore(operation,key,value) {
  return new Promise((resolve,reject)=>{
    if(!window.indexedDB){reject(new Error('このブラウザでは作業の一時保存を利用できません。'));return;}
    const opening=window.indexedDB.open('plotlauncher-updates',1);
    opening.onupgradeneeded=()=>opening.result.createObjectStore('sessions');
    opening.onerror=()=>reject(opening.error || new Error('一時保存を開けませんでした。'));
    opening.onblocked=()=>reject(new Error('一時保存がほかのタブで使用されています。'));
    opening.onsuccess=()=>{
      const db=opening.result;
      try{
        const tx=db.transaction('sessions',operation==='get'?'readonly':'readwrite'),store=tx.objectStore('sessions');
        const result=operation==='put'?store.put(value,key):operation==='delete'?store.delete(key):store.get(key);
        tx.oncomplete=()=>{db.close();resolve(result.result);};
        tx.onabort=tx.onerror=()=>{db.close();reject(tx.error || result.error || new Error('作業内容を一時保存できませんでした。'));};
      }catch(error){db.close();reject(error);}
    };
  });
}
function captureUpdateSession(target) {
  return {format:'plotlauncher-update',version:1,target,fromVersion:APP_VERSION,fromBuild:APP_BUILD,createdAt:Date.now(),url:window.location.href,
    config,sourceData,metadata,fonts:[...importedFonts.values()],fontFamilies:[...loadedFonts],fontAliases:[...localFontAliases],
    savedProjectState,loadedHeader,sample,sheetSettings:[...sheetSettings],sheetMode,sharedSettings,
    history,future,lastState,selected:[...selected],clipboard,
    handles:{projectHandle,projectFilename,sourceHandle,sourceDirectory,saveDirectory,dataFileHandles},
    workspace:{saveName:$('#save-name').value,pngDpi:$('#png-dpi').value,saveDestination:$('#save-destination').value,
      view,tableHidden:$('#series-table-content').hidden,tableDetails:$('#series-table-details').checked,
      details:$$('#controls-panel details').map(node=>({id:node.id,open:node.open})),
      controlScroll:$('#controls-panel').scrollTop || 0,pageScroll:window.scrollY || 0}
  };
}
function updateMessage(message,error=false) {
  $('#update-message').textContent=message;
  $('#update-message').dataset.kind=error?'error':'ready';
}
async function checkAppUpdate() {
  if(updateChecking || loading || exporting)return;
  updateChecking=true;availableUpdate=null;
  $('#apply-update').hidden=true;$('#retry-update-restore').hidden=!updateRecovery;
  $('#download-update-backup').hidden=!updateRecovery?.record.sourceData || !updateRecovery.record.config.series.length;
  updateMessage('更新を確認しています…');showDialog('#update-dialog');updateButtons();
  try{
    const url=new URL('./version.json',window.location.href);url.searchParams.set('check',String(Date.now()));
    const response=await fetch(url,{cache:'no-store'});
    if(!response.ok)throw new Error('配信情報を取得できませんでした。');
    const latest=await response.json();
    if(!/^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(latest.version) || !/^[a-f\d]{12}$/.test(latest.build))throw new Error('配信情報を確認できませんでした。');
    const a=latest.version.split('.').map(Number),b=APP_VERSION.split('.').map(Number),difference=a.findIndex((value,i)=>value!==b[i]);
    if(difference>=0 && a[difference]<b[difference])updateMessage(`現在は v${APP_VERSION} です。配信情報が古いため、少し後に再確認してください。`);
    else if(latest.version===APP_VERSION && latest.build===APP_BUILD)updateMessage(`最新の v${APP_VERSION} を使用しています。`);
    else{
      availableUpdate=latest;$('#apply-update').hidden=false;
      updateMessage(`v${latest.version} に更新できます。開いているプロジェクトと未保存の変更を維持して更新します。`);
    }
  }catch(error){updateMessage(`更新を確認できませんでした。接続を確認して再確認してください。${error.message}`,true);}
  finally{updateChecking=false;updateButtons();}
}
async function applyAppUpdate() {
  if(!availableUpdate || loading || exporting)return;
  exporting=true;updateButtons();updateMessage('作業内容を一時保存しています…');
  const token=crypto.randomUUID();
  try{
    // IndexedDB clones one object graph, preserving the saved-state references
    // and file handles as well as binary data. No files leave this browser.
    const snapshot=updateRecovery && !sourceData?{...updateRecovery.record,target:{...availableUpdate},fromVersion:APP_VERSION,fromBuild:APP_BUILD}:captureUpdateSession({...availableUpdate});
    await updateSessionStore('put',token,snapshot);
    const url=new URL(window.location.href);url.searchParams.set('_update',token);
    updateReloading=true;
    window.location.replace(url.href);
    // Restore normal close protection if navigation was blocked by the browser.
    setTimeout(()=>{updateReloading=false;exporting=false;updateButtons();},5000);
  }catch(error){
    updateReloading=false;exporting=false;updateButtons();
    updateMessage(`更新を中止しました。現在の作業はそのままです。${error.message}`,true);
  }
}
async function restoreUpdateSession() {
  const token=new URL(window.location.href).searchParams.get('_update');
  if(!token || !/^[a-f\d-]{36}$/.test(token))return false;
  loading=true;updateButtons();status('更新前の作業を復元しています…');
  try{
    const record=await updateSessionStore('get',token);
    if(!record || record.format!=='plotlauncher-update' || record.version!==1 || !record.config?.axes || !Array.isArray(record.config.series))throw new Error('一時保存した作業が見つかりません。');
    updateRecovery={token,record};
    let restoredMetadata=null;
    if(record.sourceData){
      const data=record.sourceData;
      restoredMetadata=data.files?await request('load-many',{filename:data.filename,files:data.files.map(file=>({...file,bytes:file.bytes.slice(0)}))}):
        await request('load',{filename:data.filename,bytes:data.bytes.slice(0),sheetIndex:record.metadata.sheetIndex,headerRow:record.loadedHeader});
      if(restoredMetadata.filename!==record.metadata.filename || restoredMetadata.sheetIndex!==record.metadata.sheetIndex)throw new Error('データのシートを復元できませんでした。');
    }
    for(const font of record.fonts)await request('font',{filename:font.name,bytes:font.bytes.slice(0)});
    config=record.config;sourceData=record.sourceData;metadata=restoredMetadata;
    importedFonts.clear();record.fonts.forEach(font=>importedFonts.set(font.name,font));
    loadedFonts.clear();[...record.fontFamilies,...record.fonts.map(font=>font.family)].forEach(family=>loadedFonts.add(family));
    localFontAliases.clear();record.fontAliases.forEach(([family,alias])=>localFontAliases.set(family,alias));
    savedProjectState=record.savedProjectState;loadedHeader=record.loadedHeader;sample=record.sample;
    sheetSettings=new Map(record.sheetSettings);sheetMode=record.sheetMode;sharedSettings=record.sharedSettings;
    history=record.history;future=record.future;lastState=record.lastState;selected=new Set(record.selected);clipboard=record.clipboard;
    ({projectHandle,projectFilename,sourceHandle,sourceDirectory,saveDirectory,dataFileHandles}=record.handles);
    const workspace=record.workspace;view=workspace.view;
    $('#save-name').value=workspace.saveName;$('#png-dpi').value=workspace.pngDpi;$('#save-destination').value=workspace.saveDestination;
    clearTimeout(renderTimer);++revision;
    if(metadata)resetPreview();
    else{$('#preview-state').textContent='データ未選択';$('#initial-message strong').textContent='データを選んでください';}
    if(metadata)drawMetadata();drawControls();refreshSaveDestination();
    const details=$$('#controls-panel details');
    workspace.details.forEach((saved,index)=>{const node=saved.id?details.find(node=>node.id===saved.id):details[index];if(node)node.open=saved.open;});
    if($('#series-table-content').hidden!==workspace.tableHidden)toggleSeriesTable();
    $('#series-table-details').checked=workspace.tableDetails;$('#series-table').dataset.details=String(workspace.tableDetails);
    $('#undo').disabled=!history.length;$('#redo').disabled=!future.length;
    $('#controls-panel').scrollTop=workspace.controlScroll;window.scrollTo?.(0,workspace.pageScroll);
    const original=new URL(record.url);original.searchParams.delete('_update');
    if(original.origin===new URL(window.location.href).origin && original.pathname===new URL(window.location.href).pathname)window.history?.replaceState(null,'',original.href);
    try{await updateSessionStore('delete',token);}catch{} // The restored work remains usable if cleanup alone fails.
    updateRecovery=null;$('#update-dialog').close();
    if(APP_BUILD===record.fromBuild && APP_VERSION===record.fromVersion){
      updateMessage('作業は復元しましたが、更新ファイルをまだ取得できませんでした。少し後に再確認してください。');showDialog('#update-dialog');
    }
    status('作業内容を復元しました。','ready');
    renderWanted=!!metadata && !!config.series.length;
  }catch(error){
    availableUpdate=null;$('#apply-update').hidden=true;$('#retry-update-restore').hidden=false;
    $('#download-update-backup').hidden=!updateRecovery?.record.sourceData || !updateRecovery.record.config.series.length;
    updateMessage(`作業の復元を完了できませんでした。一時保存した内容は保持しています。${error.message}`,true);
    showDialog('#update-dialog');
  }finally{loading=false;updateButtons();if(renderWanted)renderPreview();}
  return true;
}
$('#check-update').addEventListener('click',checkAppUpdate);
$('#recheck-update').addEventListener('click',checkAppUpdate);
$('#apply-update').addEventListener('click',applyAppUpdate);
$('#close-update').addEventListener('click',()=>$('#update-dialog').close());
$('#retry-update-restore').addEventListener('click',restoreUpdateSession);
$('#download-update-backup').addEventListener('click',()=>{
  if(!updateRecovery)return;
  try{
    const record=updateRecovery.record,w=record.workspace,settings=makeSettings(record.config,record.metadata,record.loadedHeader);
    const project=makeProject(settings,{...record.sourceData,sheetIndex:record.metadata.sheetIndex,headerRow:record.loadedHeader,sample:record.sample},record.fonts,
      {saveName:w.saveName,pngDpi:Number(w.pngDpi),view:w.view,sections:[],sheetSettings:record.sheetSettings.map(([sheetIndex,settings])=>({sheetIndex,settings})),sheetMode:record.sheetMode,sharedSettings:record.sharedSettings});
    download(new Blob([JSON.stringify(project)],{type:'application/json'}),record.handles.projectFilename || `${safeStem(w.saveName)}.plotproject`);
  }catch(error){updateMessage(`プロジェクトを取り出せませんでした。${error.message}`,true);}
});
async function checkFigureStudioProjectReplacement({fromBridge=false}={}){
  if(fromBridge)return;
  if(figureStudioDirectSender?.sender.busy)throw new Error('Studioへの送信が完了してから、別のグラフを開いてください。');
  // Validate that no bridge result/import is in flight before changing the engine.
  await figureStudioBridge?.captureWorkspaceBinding?.();
}
function prepareFigureStudioProjectReplacement({fromBridge=false}={}){
  if(fromBridge)return;
  if(figureStudioDirectSender?.sender.busy)throw new Error('Studioへの送信が完了してから、別のグラフを開いてください。');
  // Called only after a successful staged read, before replacing visible work.
  figureStudioBridge?.resetWorkspaceBinding();
  figureStudioDirectSender?.sender.resetPending?.();
  figureBridgeBaseline=null;figureBridgePreservedOnReconnect=false;
  figureWorkspaceSavedSignature=null;
}
async function readProject(file, saved, options={}) {
  if(!engineReady || loading || exporting)return;
  loading=true; updateButtons(); status('プロジェクトを開いています…');
  try {
    if(file.size>PROJECT_MAX_SIZE)throw new Error('プロジェクトは130 MB以内のファイルを選んでください。');
    const raw=saved || JSON.parse(await file.text()),project=parseProject(raw),identity=await identifyPlotProject(raw);
    const retainedData={filename:project.data.filename,figureStudioProjectId:identity.projectId,...(project.data.files?{files:project.data.files.map(file=>({...file,bytes:file.bytes.slice(0)}))}:{bytes:project.data.bytes.slice(0)})};
    const retainedFonts=project.fonts.map(font=>({...font,bytes:font.bytes.slice(0)}));
    await checkFigureStudioProjectReplacement(options);
    const result=await request('project',{filename:project.data.filename,bytes:project.data.bytes,...(project.data.files?{files:project.data.files}:{}),sheetIndex:project.data.sheetIndex,headerRow:project.data.headerRow,settings:project.settings,fonts:project.fonts,sheetSettings:project.workspace.sheetSettings || [],sharedSettings:project.workspace.sharedSettings});
    prepareFigureStudioProjectReplacement(options);
    metadata=result.metadata; config=result.config; sourceData=retainedData; sample=project.data.sample; dataFileHandles=[];
    sheetSettings=new Map((project.workspace.sheetSettings || []).map(item=>[item.sheetIndex,item.settings]));
    // Older projects may contain distinct sheet styles; keep those individual.
    sheetMode=project.workspace.sheetMode || 'individual'; sharedSettings=project.workspace.sharedSettings || null;
    sourceHandle=sourceHandles.get(file) || null; sourceDirectory=null;
    projectHandle=sourceHandle;projectFilename=file.name;
    $('#save-destination').value=folderSupported?'source':'download'; refreshSaveDestination(); loadedHeader=metadata.headerRow;
    importedFonts.clear(); retainedFonts.forEach(font=>importedFonts.set(font.name,font));
    loadedFonts.clear(); ['Liberation Sans','Noto Sans JP','DejaVu Sans',...result.families].forEach(family=>loadedFonts.add(family));
    failedLocalFonts.clear(); localFontAliases.clear();
    clearTimeout(renderTimer); ++revision; selected.clear(); history=[]; future=[]; lastState=structuredClone(config);
    $("#undo").disabled=$("#redo").disabled=true;
    view={...project.workspace.view}; $("#save-name").value=project.workspace.saveName; $("#png-dpi").value=String(project.workspace.pngDpi);
    $$('dialog[open]').forEach(dialog=>dialog.close());
    resetPreview(); drawMetadata(); drawControls();
    $$('#controls-panel .control-section').forEach((section,index)=>{section.open=project.workspace.sections[index] ?? true;});
    savedProjectState=projectEditState();
    renderWanted=true; return true;
  } catch(error){status(`プロジェクトを開けませんでした: ${error.message}`,'error'); return false;}
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
  return openDataFiles([file]);
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

function presetMessage(selector, text, error = false) {
  const element = $(selector); element.textContent = text; element.hidden = !text; element.classList[error?'add':'remove']('error');
}
function presetFailure(error) {
  if (error.name === 'QuotaExceededError') return 'ブラウザの保存容量が不足しています。既存の登録内容は変更していません。';
  if (error.name === 'SecurityError') return 'ブラウザへの保存が許可されていません。サイトデータの保存設定を確認してください。';
  return error.message;
}
function updateUserPresetActions() {
  const busy = loading || exporting;
  $('#register-user-preset').disabled = !engineReady || !metadata || !config.series.length || busy || renderRunning || renderedRevision !== revision;
  $('#manage-user-presets').disabled = exporting;
  $('#user-preset-select').disabled = !engineReady || !metadata || !myPresets.length || busy || renderRunning;
  const current = myPresets.find(item=>item.id === $('#managed-preset-select').value);
  $('#managed-preset-select').disabled = exporting;
  $('#managed-preset-name').disabled = exporting;
  $('#rename-user-preset').textContent = current ? '名前を変更' : '現在の設定を登録';
  $('#rename-user-preset').disabled = exporting || !$('#managed-preset-name').value.trim() || !current && $('#register-user-preset').disabled;
  presetMessage('#manage-presets-hint',!current && $('#register-user-preset').disabled ? (!metadata ? 'データを読み込み、グラフを表示すると登録できます。' : 'プレビューを更新すると登録できます。') : '');
  $('#delete-user-preset').disabled = !current || exporting;
  $('#export-user-presets').disabled = !myPresets.length || exporting;
  $('#import-user-presets').disabled = exporting;
}
function syncManagedPreset() {
  const current = myPresets.find(item=>item.id === $('#managed-preset-select').value);
  $('#managed-preset-name').value = current?.name || '';
  updateUserPresetActions();
}
function drawUserPresetLibrary() {
  const selected = $('#managed-preset-select').value;
  $('#user-preset-field').hidden = !myPresets.length;
  $('#user-preset-select').innerHTML = '<option value="">選択して適用</option>' + choiceOptions(myPresets.map(item=>[item.id,item.name]),'');
  $('#user-preset-select').value = '';
  $('#managed-preset-select').innerHTML = '<option value="">新規登録（現在の設定）</option>' + choiceOptions(myPresets.map(item=>[item.id,item.name]),selected);
  $('#managed-preset-select').value = myPresets.some(item=>item.id === selected) ? selected : '';
  syncManagedPreset();
}
function refreshUserPresets() {
  try {myPresets = readUserPresets(window.localStorage); presetMessage('#user-preset-message','');}
  catch(error) {presetMessage('#user-preset-message',`マイプリセットを読み込めませんでした。${presetFailure(error)}`,true);}
  drawUserPresetLibrary();
}
function changeUserPresets(change) {
  const storage = window.localStorage;
  const next = change(readUserPresets(storage));
  myPresets = writeUserPresets(storage,next);
  presetMessage('#user-preset-message',''); drawUserPresetLibrary();
}
function syncPresetRegistration(reset = false) {
  if (reset) $('#overwrite-user-preset').checked = false;
  const name = $('#user-preset-name').value.trim(), duplicate = myPresets.some(item=>item.name === name);
  $('#overwrite-preset-field').hidden = !duplicate;
  if (!duplicate) $('#overwrite-user-preset').checked = false;
  $('#confirm-register-preset').textContent = duplicate ? '上書き' : '登録';
  $('#confirm-register-preset').disabled = !name || $('#register-user-preset').disabled || duplicate && !$('#overwrite-user-preset').checked;
}
$('#register-user-preset').addEventListener('click',()=>{
  if ($('#register-user-preset').disabled) return;
  $('#user-preset-name').value = '';
  $('#register-preset-error').textContent = '';
  syncPresetRegistration(true); showDialog('#register-preset-dialog'); $('#user-preset-name').focus();
});
$('#user-preset-name').addEventListener('input',()=>syncPresetRegistration(true));
$('#overwrite-user-preset').addEventListener('change',()=>syncPresetRegistration());
$('#user-preset-name').addEventListener('keydown',event=>{if(event.key === 'Enter' && !event.isComposing){event.preventDefault();if(!$('#confirm-register-preset').disabled)$('#confirm-register-preset').click();}});
$('#close-register-preset').addEventListener('click',()=>$('#register-preset-dialog').close());
$('#confirm-register-preset').addEventListener('click',()=>{
  if ($('#confirm-register-preset').disabled || !metadata) return;
  try {
    const entry = captureUserPreset($('#user-preset-name').value,config,metadata,loadedHeader);
    changeUserPresets(entries=>upsertUserPreset(entries,entry,$('#overwrite-user-preset').checked));
    $('#register-preset-dialog').close(); presetMessage('#user-preset-message',`「${entry.name}」をブラウザに保存しました。`);
  } catch(error) {$('#register-preset-error').textContent = presetFailure(error);}
});
$('#user-preset-select').addEventListener('change',event=>{
  const entry = myPresets.find(item=>item.id === event.target.value);
  event.target.value = '';
  if (!entry || !metadata || loading || exporting || renderRunning) return;
  try {
    const next = applyUserPreset(entry,metadata);
    const fonts = [next.axes.fontFamily,next.axes.japaneseFontFamily,...(next.annotations || []).filter(item=>item.type === 'text' && item.visible !== false).map(item=>item.font_family)].filter(Boolean);
    const missing = [...new Set(fonts.filter(font=>font!=='Arial' && !loadedFonts.has(font) && !localFontChoices.some(item=>item.family===font)))];
    if (missing.length) throw new Error(`先にフォント「${missing.join('、')}」を読み込んでください。プリセットにはフォントファイルを含みません。`);
    config = next; selected.clear(); drawControls(); changed();
    presetMessage('#user-preset-message',`「${entry.name}」を適用しました。`);
  } catch(error) {presetMessage('#user-preset-message',presetFailure(error),true);}
});
$('#manage-user-presets').addEventListener('click',()=>{
  refreshUserPresets(); presetMessage('#manage-presets-message',''); showDialog('#manage-presets-dialog');
});
$('#close-manage-presets').addEventListener('click',()=>$('#manage-presets-dialog').close());
$('#managed-preset-select').addEventListener('change',syncManagedPreset);
$('#managed-preset-name').addEventListener('input',updateUserPresetActions);
$('#managed-preset-name').addEventListener('keydown',event=>{if(event.key === 'Enter' && !event.isComposing){event.preventDefault();if(!$('#rename-user-preset').disabled)$('#rename-user-preset').click();}});
$('#rename-user-preset').addEventListener('click',()=>{
  if ($('#rename-user-preset').disabled) return;
  try {
    const id = $('#managed-preset-select').value, name = userPresetName($('#managed-preset-name').value);
    if (id) {changeUserPresets(entries=>renameUserPreset(entries,id,name));presetMessage('#manage-presets-message','名前を変更しました。');}
    else {
      if ($('#register-user-preset').disabled || !metadata) return;
      const entry = captureUserPreset(name,config,metadata,loadedHeader);
      changeUserPresets(entries=>upsertUserPreset(entries,entry));
      $('#managed-preset-select').value = entry.id; syncManagedPreset();
      presetMessage('#manage-presets-message',`「${entry.name}」をブラウザに保存しました。`);
    }
  }
  catch(error) {presetMessage('#manage-presets-message',presetFailure(error),true);}
});
$('#delete-user-preset').addEventListener('click',()=>{
  const entry = myPresets.find(item=>item.id === $('#managed-preset-select').value);
  if (!entry || !window.confirm(`マイプリセット「${entry.name}」を削除しますか？`)) return;
  try {changeUserPresets(entries=>entries.filter(item=>item.id !== entry.id));presetMessage('#manage-presets-message','削除しました。');}
  catch(error) {presetMessage('#manage-presets-message',presetFailure(error),true);}
});
$('#export-user-presets').addEventListener('click',async()=>{
  if (!myPresets.length || exporting) return;
  exporting = true; updateButtons();
  try {
    const blob = new Blob([encodeUserPresets(myPresets)],{type:'application/json'});
    const save = await prepareDocumentSaver('plotlauncher-presets.json','マイプリセットJSON','.json');
    await save(blob,'plotlauncher-presets.json');presetMessage('#manage-presets-message','全プリセットを書き出しました。');
  } catch(error) {presetMessage('#manage-presets-message',error.name === 'AbortError' ? '書き出しをキャンセルしました。' : presetFailure(error),error.name !== 'AbortError');}
  finally {exporting = false; updateButtons(); if(renderWanted)renderPreview();}
});
async function importUserPresetsFile(file) {
  if (exporting) return;
  try {
    if (file.size > USER_PRESET_FILE_LIMIT) throw new Error('プリセットJSONは4 MB以内のファイルを選んでください。');
    const incoming = decodeUserPresets(await file.text()), storage = window.localStorage;
    let current;
    try {current = readUserPresets(storage);}
    catch(error) {
      const raw = storage.getItem(USER_PRESET_KEY);
      if (raw === null || !window.confirm('保存済みのマイプリセットが読み取れません。元の内容を退避し、選択したJSONから復元しますか？')) throw error;
      storage.setItem(USER_PRESET_KEY+'.recovery',raw); current = [];
    }
    const next = mergeUserPresets(current,incoming);
    myPresets = writeUserPresets(storage,next); drawUserPresetLibrary();presetMessage('#user-preset-message','');
    presetMessage('#manage-presets-message',`${next.length-current.length}件を追加しました。同じ内容は追加せず、同名で内容が違う場合は名前に番号を付けます。`);
  } catch(error) {presetMessage('#manage-presets-message',presetFailure(error),true);}
}
$('#import-user-presets').addEventListener('click',()=>$('#user-presets-file').click());
$('#user-presets-file').addEventListener('change',event=>{const file=event.target.files[0];event.target.value='';if(file)importUserPresetsFile(file);});
window.addEventListener('storage',event=>{if(event.key === USER_PRESET_KEY || event.key === null){refreshUserPresets();syncPresetRegistration(true);}});
refreshUserPresets();
$("#open-settings").addEventListener("click", () => $("#settings-file").click());
async function readSettings(file) {
  if(!metadata){status('設定を開く前にExcel/CSV/TXTを読み込んでください。','error');return;}
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
function fontMessage(text, error = false) {
  $('#font-load-message').textContent = text;
  $('#font-load-message').className = `preset-message${error ? ' error' : ''}`;
}
function syncFontFolder() {
  const folders = FONT_FOLDERS[$('#font-os').value] || FONT_FOLDERS.windows;
  $('#font-folder-path').value = folders[Number($('#font-folder').value) || 0]?.[1] || folders[0][1];
  $('#font-folder-guide').textContent = $('#font-os').value === 'mac' ? 'ファイル選択画面で ⌘＋Shift＋G → パスを貼り付け → Enter。' : 'ファイル選択画面で Ctrl＋L → パスを貼り付け → Enter。';
}
function chooseFontOS() {
  const folders = FONT_FOLDERS[$('#font-os').value] || FONT_FOLDERS.windows;
  $('#font-folder').replaceChildren(...folders.map(([label], index) => new Option(label, String(index))));
  $('#font-folder').value = '0'; syncFontFolder();
}
function openFontSettings() {
  if (!engineReady || loading || exporting) return;
  if (!$('#font-os').value) {
    const platform = navigator.userAgentData?.platform || navigator.platform || '';
    $('#font-os').value = /mac/i.test(platform) ? 'mac' : 'windows';
    chooseFontOS();
  }
  $('#browse-local-fonts').hidden = typeof window.queryLocalFonts !== 'function';
  $('#font-advanced-fields').open = true;
  $('#local-font-list').hidden = !localFontChoices.length;
  if (localFontChoices.length) drawLocalFonts();
  fontMessage(''); updateButtons(); showDialog('#font-load-dialog');
}
$('#load-font').addEventListener('click', () => openFontSettings());
// Use the normal font controls for the first permission gesture; no extra picker.
for (const event of ['pointerdown','keydown']) $('#font-settings').addEventListener(event, () => {
  if (!fontQueryRunning && ['idle','prompt'].includes(fontAccess)) return browseLocalFonts({automatic:true});
});
$('#font-os').addEventListener('change', chooseFontOS);
$('#font-folder').addEventListener('change', syncFontFolder);
$('#close-font-load').addEventListener('click', () => $('#font-load-dialog').close());
$('#font-load-dialog').addEventListener('close', () => { fontQueryID++; fontQueryRunning = false; if(fontAccess === 'checking')fontAccess='prompt'; fontAccessMessage=''; updateButtons(); });
$('#copy-font-folder').addEventListener('click', async () => {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('パス欄を選択してコピーしてください。');
    await navigator.clipboard.writeText($('#font-folder-path').value);
    fontMessage('パスをコピーしました。「フォントファイルを選ぶ」を押し、選択画面に貼り付けてください。');
  } catch { $('#font-folder-path').focus(); $('#font-folder-path').select(); fontMessage('パス欄を選択しました。Ctrl／⌘＋Cでコピーしてください。'); }
});
$('#choose-font-files').addEventListener('click', async () => {
  if (!engineReady || loading || exporting) return;
  if (typeof window.showOpenFilePicker !== 'function') { $('#font-file').click(); return; }
  try {
    const handles = await window.showOpenFilePicker({...filePickerOptions('plotlauncher-fonts', 'フォント（TTF / OTF / TTC）', {'font/ttf':['.ttf'], 'font/otf':['.otf'], 'font/collection':['.ttc']}), multiple:true});
    const files = await Promise.all(handles.map(handle => handle.getFile()));
    if (await loadFontFiles(files)) $('#font-load-dialog').close();
  } catch (error) { fontMessage(error.name === 'AbortError' ? 'フォントの選択をキャンセルしました。' : `ファイルを選べませんでした：${error.message}`, error.name !== 'AbortError'); }
});
function drawLocalFonts() {
  const query = $('#local-font-search').value.trim().normalize('NFKC').toLowerCase();
  const items = localFontChoices.map((font,index) => ({font,index})).filter(({font}) => `${font.fullName} ${font.family} ${font.style}`.normalize('NFKC').toLowerCase().includes(query));
  $('#local-font-select').replaceChildren(...items.map(({font,index}) => {
    const option=new Option(font.fullName || `${font.family} ${font.style}`, String(index));
    option.selected=!query && font.family===config.axes.fontFamily && /regular|normal|book|標準/i.test(font.style || 'Regular');return option;
  }));
  fontMessage(`${items.length}件のフォント。通常・太字・斜体は別々に選択できます。`); updateButtons();
}
function syncFontChoices() {
  const names = [...new Set(['Arial',...loadedFonts,...localFontChoices.map(font=>font.family),config.axes.fontFamily,config.axes.japaneseFontFamily].filter(Boolean))];
  names.sort((a,b)=>a==='Arial'?-1:b==='Arial'?1:a.localeCompare(b));
  for (const [selector,key] of [['#font-family','fontFamily'],['#japanese-font-family','japaneseFontFamily']]) {
    for(const field of new Set([$(selector),...$$(`[data-axis="${key}"]`)])){
      field.replaceChildren(...names.map(name=>new Option(name,name)));
      field.value=config.axes[key];
    }
  }
}
async function registerFontFile(file, automatic = false) {
  if (file.size > 20 * 1024 * 1024) throw new Error('フォントは20 MB以内にしてください。');
  const bytes=await file.arrayBuffer(), originalBytes=bytes.slice(0);
  const result=await request('font',{bytes});
  importedFonts.set(file.name,{name:file.name,family:result.family,bytes:originalBytes,automatic});
  loadedFonts.add(result.family);
  return result.family;
}
async function loadLocalFontFamilies(families) {
  if (!engineReady || loading || exporting) return false;
  const pending=[...new Set(families)].filter(family=>!loadedFonts.has(family) && !localFontAliases.has(family) && localFontChoices.some(font=>font.family===family));
  if (!pending.length) return true;
  loading=true; fontAccessMessage='フォントを読み込んでいます…'; updateButtons();
  try {
    for (const family of pending) {
      const faces=localFontChoices.filter(font=>font.family===family);
      // Ordinary labels use the regular face; additional faces remain in advanced settings.
      const font=faces.find(font=>/^(regular|normal|book|roman|標準)$/i.test(font.style || 'Regular')) || faces[0];
      const blob=await font.blob();
      const actual=await registerFontFile(new File([blob],`local-${safeStem(font.postscriptName || font.fullName || family)}.ttf`,{type:'font/ttf'}),true);
      localFontAliases.set(family,actual); failedLocalFonts.delete(family);
    }
    fontAccessMessage=''; return true;
  } catch(error) {
    pending.forEach(family=>failedLocalFonts.add(family));
    fontAccessMessage=`フォントを読み込めませんでした。詳細設定からも読み込めます。`;
    fontMessage(error.message,true); return false;
  } finally {loading=false;syncFontChoices();updateButtons();}
}
async function loadCurrentLocalFonts() {
  const families=[config.axes.fontFamily,config.axes.japaneseFontFamily,...(config.annotations || []).filter(item=>item.type==='text' && item.visible!==false).map(item=>item.font_family)];
  const missing=[...new Set(families)].filter(family=>family && !loadedFonts.has(family) && !failedLocalFonts.has(family) && localFontChoices.some(font=>font.family===family));
  if (!missing.length || loading || exporting) return;
  const current=config, before=importedFonts.size;
  await loadLocalFontFamilies(missing);
  if (config!==current) return;
  for (const key of ['fontFamily','japaneseFontFamily']) config.axes[key]=localFontAliases.get(config.axes[key]) || config.axes[key];
  for (const item of config.annotations || []) if(item.type==='text')item.font_family=localFontAliases.get(item.font_family) || item.font_family;
  syncFontChoices();
  if(metadata && importedFonts.size!==before){++revision;renderWanted=true;}
}
async function selectLocalFont(input) {
  const key=input.dataset.axis, previous=config.axes[key], requested=input.value;
  if(loading || exporting){input.value=previous;return;}
  failedLocalFonts.delete(requested);
  if (!loadedFonts.has(requested) && !await loadLocalFontFamilies([requested])) {input.value=previous;return;}
  config.axes[key]=localFontAliases.get(requested) || requested;
  drawControls();changed();
}
async function browseLocalFonts({automatic = false} = {}) {
  if (!engineReady || loading || exporting || fontQueryRunning || typeof window.queryLocalFonts !== 'function') return;
  const queryID = ++fontQueryID;
  fontQueryRunning = true; fontAccess='checking'; updateButtons(); fontMessage('フォントへのアクセスを確認しています…');
  const waiting=setTimeout(()=>{
    if(queryID===fontQueryID && fontQueryRunning){fontAccessMessage='ブラウザのフォント許可を待っています。ほかの操作は続けられます。';updateButtons();}
  },15000);
  try {
    if(automatic && navigator.permissions?.query && !navigator.userActivation?.isActive) {
      let permission;
      try {permission=await navigator.permissions.query({name:'local-fonts'});} catch {}
      if(queryID!==fontQueryID)return;
      if(permission?.state==='prompt'){fontAccess='prompt';return;}
      if(permission?.state==='denied')throw Object.assign(new Error('denied'),{name:'NotAllowedError'});
    }
    const fonts = await window.queryLocalFonts();
    if (queryID !== fontQueryID) return;
    localFontChoices = [...fonts].sort((a,b) => (a.fullName || a.family).localeCompare(b.fullName || b.family));
    fontAccess='ready'; fontAccessMessage=''; failedLocalFonts.clear(); syncFontChoices();
    $('#local-font-list').hidden = false; $('#local-font-search').value = ''; drawLocalFonts();
    if (!localFontChoices.length) fontMessage('利用できるフォントがありません。「フォントファイルを選ぶ」から読み込めます。');
    await loadCurrentLocalFonts();if(renderWanted)renderPreview();
  } catch (error) {
    if (queryID === fontQueryID) {
      fontAccess=error.name==='SecurityError'?'prompt':'denied';
      fontAccessMessage=error.name==='SecurityError'?'':'PCフォントにアクセスできません。ブラウザで許可するか、詳細設定から読み込めます。';
      fontMessage(error.name==='NotAllowedError'?'フォントへのアクセスが許可されませんでした。「フォントファイルを選ぶ」からも読み込めます。':`フォントを取得できませんでした：${error.message}`,true);
    }
  } finally {clearTimeout(waiting);if (queryID === fontQueryID) {fontQueryRunning = false; updateButtons();} }
}
$('#browse-local-fonts').addEventListener('click', () => browseLocalFonts());
$('#local-font-search').addEventListener('input', drawLocalFonts);
$('#local-font-select').addEventListener('change', updateButtons);
$('#import-local-fonts').addEventListener('click', async () => {
  if (!engineReady || loading || exporting) return;
  const selected = [...($('#local-font-select').selectedOptions || [])].map(option => localFontChoices[Number(option.value)]).filter(Boolean);
  if (!selected.length) return;
  loading = true; updateButtons(); fontMessage('フォントを読み込んでいます…');
  let files;
  try {
    files = await Promise.all(selected.map(async font => {
      const blob = await font.blob();
      if (blob.size > 20 * 1024 * 1024) throw new Error('フォントは20 MB以内にしてください。');
      return new File([blob], `local-${safeStem(font.postscriptName || font.fullName || font.family)}.ttf`, {type:'font/ttf'});
    }));
  } catch (error) { fontMessage(`フォントを読み込めませんでした：${error.message}`, true); }
  finally { loading = false; updateButtons(); if (!files && renderWanted) renderPreview(); }
  if (files && await loadFontFiles(files)) $('#font-load-dialog').close();
});
$("#font-file").addEventListener("change", async event => {
  const files = [...event.target.files]; event.target.value = "";
  if (await loadFontFiles(files)) $('#font-load-dialog').close();
});
async function loadFontFiles(files) {
  if (!files.length || loading || exporting || !engineReady) return false;
  loading = true; updateButtons();
  try {
    for (const file of files) {
      config.axes.fontFamily = await registerFontFile(file);
    }
    fontAccessMessage='';
    drawControls(); changed(); return true;
  } catch (error) { status(error.message, "error"); fontMessage(error.message, true); return false; }
  finally { loading = false; updateButtons(); if (renderWanted) renderPreview(); }
}
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
  const switchingSeries=$('#element-editor').open && ['series','seriesAll'].includes(part);
  if(!metadata || loading || exporting || (renderRunning || renderedRevision!==revision) && !switchingSeries&&!figureWorkspaceRestoring)return;
  const fields=$('#element-editor-fields');fields.dataset.workspacePart=part;fields.dataset.workspaceIndex=String(index);let sources=[],title='';
  if(part==='seriesAll') {
    if(!editableXY(config.plotType) || !config.series[index])return;
    title='全系列の設定';
  } else if(part==='trend') {
    const series=config.series[index];if(!series)return;
    title=`系列${index+1}「${series.name}」の近似線`;
    sources=[$(`#series-list [data-series-index="${index}"] .series-trend`)];
  } else if(part==='series') {
    const series=config.series[index];if(!series)return;
    title=`系列${index+1}「${series.name}」の設定`;
    sources=[$(`#series-list [data-series-index="${index}"]`)];
    if(['XPS Fit','Particle Histogram'].includes(config.plotType))sources.push($('#preset-options'));
  } else if(part==='annotation') {
    const item=config.annotations?.[index];if(!item)return;
    selected=new Set([item.id]);drawAnnotations();syncInteractionSelection();
    title=({text:'テキスト',arrow:'矢印',segment:'線'})[item.type]+'の設定';
    sources=[$(`#annotation-list [data-annotation-index="${index}"]`)];
  } else if(part==='legend'){const entry=legendEntry(index);title=entry?`「${entry.label}」の凡例の設定`:'凡例の設定';sources=[];}
  else if(part==='preset'){title='グラフの設定';sources=[$('#preset-options')];}
  else if(part==='frame'){title='枠線・軸の位置';sources=[$('#frame-settings-content')];}
  else {
    const keys=part==='figureBackground'?['transparent','backgroundColor','backgroundAlpha']:
      part==='plotBackground'?['plotBackgroundEnabled','plotBackgroundColor','plotBackgroundAlpha']:
      part==='grid'?[]:
      ['spineColor','spineScale','spineLeft','spineRight','spineTop','spineBottom','yAxisRight','xAxisTop'];
    title=({figureBackground:'図全体の背景',plotBackground:'枠内の背景',grid:'グリッド線',frame:'枠線'})[part]+'の設定';
    sources=keys.map(key=>$(`#plot-form [data-axis="${key}"]`)?.closest('label'));
  }
  fields.innerHTML=sources.filter(Boolean).map(source=>source.outerHTML).join('');
  if(part==='seriesAll') {
    const control=key=>$(`#series-list [data-series-index="${index}"] [data-series-field="${key}"]`)?.closest('label')?.outerHTML || '';
    fields.innerHTML=`<div data-series-index="${index}" data-series-all-root><div class="field-grid">${SERIES_APPEARANCE_FIELDS.slice(0,3).map(control).join('')}</div><details class="settings-panel"><summary>線・点の詳細</summary><div class="field-grid">${SERIES_APPEARANCE_FIELDS.slice(3).map(control).join('')}</div></details>${processingControls(config.series[index])}</div>`;
  }
  fields.dataset.seriesEditorIndex=String(index);
  if(['series','seriesAll'].includes(part) && editableXY(config.plotType)) {
    const previousOrigin=Number(fields.dataset.seriesEditorOrigin);
    const origin=switchingSeries && Number.isInteger(previousOrigin) && config.series[previousOrigin]?previousOrigin:index;
    fields.dataset.seriesEditorOrigin=String(origin);
    const name=series=>String(series.name ?? '').trim() || metadata.columns[Number(series.y)]?.name || '名前なし';
    const choices=[['one',`この系列（${name(config.series[origin])}）`],['all',`全系列（${config.series.length}系列）`],...config.series.flatMap((series,i)=>i===origin?[]:[[ `series:${i}`,`系列${i+1}（${name(series)}）`]])];
    const scope=part==='seriesAll'?'all':index===origin?'one':`series:${index}`;
    fields.innerHTML=`<label class="series-scope">設定の適用先<select data-series-scope title="系列を選ぶと、その系列の現在の設定を表示します。全系列では変更した項目だけをまとめて反映し、データ列・系列名・系列色は保持します。">${choiceOptions(choices,scope)}</select></label>`+fields.innerHTML;
  }
  if(part==='legend'){
    const entry=legendEntry(index);fields.dataset.legendItemId=entry?.id || '';fields.dataset.legendSeriesIndex=entry?.seriesIndex ?? '';fields.dataset.legendKey=entry?.key || '';
    const item=entry?.seriesIndex!==null && entry?.seriesIndex!==undefined?config.series[entry.seriesIndex]:null;
    const stored=item || config.options?.legendEntries?.[entry?.key] || {};
    const attribute=key=>item?`data-series-field="${{style:'legendStyle',fontSize:'legendFontSize',ColorMode:'legendTextColorMode',Color:'legendTextColor'}[key]}"`:`data-legend-key="${escapeHTML(entry?.key)}" data-legend-field="${{ColorMode:'textColorMode',Color:'textColor'}[key] || key}"`;
    const appearance=entry?`<label>この凡例の表示<select ${attribute('style')}>${choiceOptions([['auto','全体に従う'],['symbols','線／点あり'],['text','文字列のみ']],stored[item?'legendStyle':'style'] || 'auto')}</select></label><label title="空欄は全体設定に従います。">この凡例のフォントサイズ (pt)<input ${attribute('fontSize')} type="number" min="2" max="72" step="0.1" value="${escapeHTML(stored[item?'legendFontSize':'fontSize'] ?? '')}" placeholder="全体設定（${axisControlValue('legendFontScale',config.axes.legendFontScale)} pt）"></label>`+legendTextColorControls(attribute,stored[item?'legendTextColorMode':'textColorMode'] || 'inherit',stored[item?'legendTextColor':'textColor'] || '#000000',true):'';
    const local=entry?item?`<div data-series-index="${entry.seriesIndex}"><label>凡例名<input data-series-field="name" value="${escapeHTML(item.name)}" maxlength="200"></label>${appearance}<label><input data-series-field="legendVisible" type="checkbox" ${item.legendVisible!==false?'checked':''}>この凡例を表示</label></div>`:`${appearance}<label><input data-legend-key="${escapeHTML(entry.key)}" data-legend-field="visible" type="checkbox" checked>この凡例を表示</label>`:'';
    const shared=`<label><input data-axis="legend" type="checkbox" ${config.axes.legend?'checked':''}>凡例を表示</label>${legendModeControls()}<label title="全凡例に共通です。">フォントサイズ (pt)<input data-axis="legendFontScale" type="number" min="${axisControlValue('legendFontScale',.2)}" max="${axisControlValue('legendFontScale',3)}" step="0.1" value="${axisControlValue('legendFontScale',config.axes.legendFontScale)}"></label><details class="settings-panel"><summary>線・点の大きさ</summary><label>大きさ（標準比）<input data-axis="legendScale" type="number" min=".2" max="3" step="0.1" value="${config.axes.legendScale}"></label></details>`;
    fields.innerHTML=local+(entry?`<details class="settings-panel"><summary>全凡例の設定</summary>${shared}</details>`:shared)+`<button type="button" class="button quiet" data-reset-legend>${entry?'この凡例を':'凡例を'}標準位置に戻す</button><button type="button" class="button quiet" data-restore-legend-items ${hasHiddenLegendItems()?'':'hidden'}>凡例項目をすべて再表示</button>`;
  }
  if(part==='figureBackground')fields.innerHTML+=`<details class="settings-panel"><summary>グラフの種類・サイズ</summary><label>グラフのプリセット<select data-preview-preset>${choiceOptions(presets.map(item=>[item.id,item.label]),config.plotType)}</select></label><div class="field-grid">${['width','height'].map((key,i)=>`<label>${['軸領域の幅 (cm)','軸領域の高さ (cm)'][i]}<input data-axis="${key}" type="number" min=".5" max="24" step="0.1" value="${config.axes[key]}"></label>`).join('')}</div></details>`+$('#font-settings').outerHTML;
  if(part==='plotBackground')fields.innerHTML+=`<details class="settings-panel"><summary>グリッド線</summary>${gridControls()}</details>`;
  if(part==='grid')fields.innerHTML=gridControls();
  if(part==='trend')fields.innerHTML=`<div data-series-index="${index}">${fields.innerHTML}</div>`;
  // Reuse the sidebar controls, restoring live values and color-picker handlers.
  fields.querySelectorAll('.color-control').forEach(wrapper=>{const input=wrapper.querySelector('input');if(input){input.hidden=false;delete input.dataset.paletteEnhanced;wrapper.replaceWith(input);}});
  fields.querySelectorAll('[id]').forEach(element=>element.removeAttribute('id'));
  fields.querySelectorAll('button').forEach(element=>{if(element.dataset.resetTrend===undefined&&element.dataset.resetLegend===undefined&&element.dataset.resetSlope===undefined&&element.dataset.restoreLegendItems===undefined)element.remove();});
  // Position is edited by dragging; retain numeric coordinates in the sidebar only.
  fields.querySelectorAll('[data-axis="legendX"],[data-axis="legendY"],[data-series-field="trendX"],[data-series-field="trendY"],[data-annotation-field="x"],[data-annotation-field="y"],[data-annotation-field="x1"],[data-annotation-field="y1"],[data-annotation-field="x2"],[data-annotation-field="y2"],[data-annotation-field="coordinate_system"]').forEach(input=>input.closest('label')?.remove());
  fields.querySelectorAll('.annotation-card > summary').forEach(element=>element.remove());
  fields.querySelectorAll('details').forEach(element=>element.open=element.classList.contains('annotation-card') || part==='trend' && element.classList.contains('series-trend'));
  fields.querySelectorAll('[data-axis],[data-series-field],[data-annotation-field],[data-option],[data-fill]').forEach(input=>{
    const data=input.dataset;
    const value=data.axis?axisSetting(data.axis):data.seriesField?config.series[Number(input.closest('[data-series-index]').dataset.seriesIndex)][data.seriesField]:
      data.annotationField?config.annotations[Number(input.closest('[data-annotation-index]').dataset.annotationIndex)][data.annotationField]:
      data.fill?config.options.fills[Number(input.closest('[data-fill-index]').dataset.fillIndex)][data.fill]:config.options?.[data.option] ?? input.value;
    if(input.type==='checkbox')input.checked=data.invert==='true'?!value:Boolean(value);else input.value=data.axis?axisControlValue(data.axis,value):data.seriesField?seriesControlValue(data.seriesField,value):value;
  });
  $('#element-editor-title').textContent=title;
  if(part==='seriesAll')fields.querySelectorAll('[data-series-field]').forEach(input=>{
    input.dataset.seriesAll='true';
    const key=input.dataset.seriesField,mixed=config.series.some(item=>String(item[key])!==String(config.series[index][key]));
    if(!mixed)return;
    if(input.type==='checkbox'){input.indeterminate=true;}
    else if(input.tagName==='SELECT'){const option=new Option('混在','');option.disabled=true;input.add(option,0);input.value='';}
    else if(input.type!=='range'){input.value='';input.placeholder='混在';}
  });
  showDialog('#element-editor');enhanceColorInputs();syncAxisAutomaticControls();syncUnitControls();syncOpacityControls();syncProcessingControls();syncLegendColorControls();
}
$('#element-editor-fields').addEventListener('input',applyControlInput);
for(const root of [$('#plot-form'),$('#element-editor-fields')])root.addEventListener('focusout',event=>{if(event.target.dataset.seriesField==='detrendSlope')syncProcessingControls();});
$('#edit-all-series').addEventListener('click',()=>openElementEditor('seriesAll'));
$('#element-editor-fields').addEventListener('click',event=>{
  if(resetProcessingSlope(event))return;
  if(event.target.closest('[data-restore-legend-items]')){restoreLegendItems();return;}
  if(event.target.closest('[data-reset-legend]')){const fields=$('#element-editor-fields');resetLegendPositions(fields.dataset.legendItemId?{seriesIndex:fields.dataset.legendSeriesIndex===''?null:Number(fields.dataset.legendSeriesIndex),key:fields.dataset.legendKey}:null);drawControls();changed();return;}
  const reset=event.target.closest('[data-reset-trend]');if(reset){const item=config.series[Number(reset.dataset.resetTrend)];item.trendX=item.trendY='';$$(`[data-series-index="${reset.dataset.resetTrend}"] [data-series-field="trendX"],[data-series-index="${reset.dataset.resetTrend}"] [data-series-field="trendY"]`).forEach(input=>input.value='');changed();}
});
$('#element-editor-fields').addEventListener('pointerdown',event=>{if(event.target.closest('[data-axis="fontFamily"],[data-axis="japaneseFontFamily"]')&&!fontQueryRunning&&['idle','prompt'].includes(fontAccess))void browseLocalFonts({automatic:true});});
$('#close-element-editor').addEventListener('click',()=>$('#element-editor').close());
$('#element-editor').addEventListener('close',()=>{drawControls();positionInteractions();});

function syncInteractionSelection(){
  // A stationary click must preserve its DOM target for the next dblclick.
  $$('#figure-interactions .figure-drag-target').forEach(target=>{
    const active=selected.has(target.dataset.dragId);
    target.classList[active?'add':'remove']('selected');
    if(isLegendId(target.dataset.dragId) || config.annotations?.some(item=>item.id===target.dataset.dragId))target.setAttribute('aria-pressed',String(active));
  });
  $$('#figure-interactions .annotation-handle').forEach(handle=>handle.remove());
  const imageBox=$('#figure-image').getBoundingClientRect();
  for(const target of figureResult?.geometry.annotations || []) {
    const item=config.annotations?.find(item=>item.id===target.id);if(!item || !selected.has(item.id) || item.locked)continue;
    const [x,y,w,h]=target.box;
    (target.points || [[x+w,y+h],[x+w/2,y-18/imageBox.height]]).forEach(([px,py],i)=>{
      const handle=document.createElement('button');handle.type='button';handle.className='annotation-handle';handle.dataset.dragId=item.id;
      handle.dataset.handle=target.points?String(i+1):i===0?'resize':'rotate';
      handle.setAttribute('aria-label',target.points?`注釈の${i===0?'始点':'終点'}を移動`:i===0?'フォントサイズを変更':'文字を回転');
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
    const title=series?`系列${entry.index+1}「${series.name}」：ダブルクリックで設定`:part==='ticks'?`${axisName(entry.axis)}軸目盛線：ダブルクリックで設定`:`${({frame:'枠線',grid:'グリッド線',preset:'グラフ'})[part] || 'グラフ'}：ダブルクリックで設定`;
    const target=(tag,filled=false)=>{
      const node=document.createElementNS(svg.namespaceURI,tag);node.classList.add('data-hit-target');node.setAttribute('tabindex','0');node.setAttribute('role','button');node.setAttribute('aria-label',title);node.setAttribute('vector-effect','non-scaling-stroke');
      node.setAttribute('stroke-width',12);node.setAttribute('stroke-linecap','round');node.setAttribute('fill',filled?'transparent':'none');node.setAttribute('stroke',filled?'none':'transparent');
      node.style.pointerEvents=filled?'all':'stroke';if(series)node.dataset.editSeries=String(entry.index);else if(part==='ticks'){node.dataset.editAxis=entry.axis;node.dataset.axisKind='ticks';}else node.dataset.editPart=part;svg.append(node);return node;
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
  (geometry.tickLines || []).forEach(entry=>add(entry,'ticks'));
  (geometry.depth || []).forEach(box=>add({boxes:[box]},'preset'));
}

function positionInteractions() {
  const overlay = $("#figure-interactions"), image = $("#figure-image");
  overlay.replaceChildren();
  if (!figureResult?.geometry || image.hidden || !image.naturalWidth) return;
  const imageBox = image.getBoundingClientRect();
  const hitSize = 24;
  Object.assign(overlay.style, {left:'0',top:'0',width:'100%',height:'100%'});
  if(figureResult.geometry.series) dataInteractions(overlay,imageBox);
  const targets = [...(figureResult.geometry.axisLabels || []), ...(figureResult.geometry.tickLabels || []), ...[...figureResult.geometry.annotations,...(figureResult.geometry.trendEquations || [])].sort((a,b)=>(a.seriesIndex!==undefined?30:config.annotations?.find(item=>item.id===a.id)?.zorder??20)-(b.seriesIndex!==undefined?30:config.annotations?.find(item=>item.id===b.id)?.zorder??20))];
  if (config.axes.legend && figureResult.geometry.legend) targets.unshift({id:"legend",box:figureResult.geometry.legend});
  if(config.axes.legend)targets.unshift(...(figureResult.geometry.legendItems || []).map(entry=>({id:entry.id,box:entry.box,legendItem:entry})));
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
    if(target.seriesIndex!==undefined)button.dataset.trendIndex=String(target.seriesIndex);
    button.title=target.legendItem?`凡例「${target.legendItem.label}」：ドラッグで移動・ダブルクリックで設定`:target.seriesIndex!==undefined ? `系列${target.seriesIndex+1}の近似式：ドラッグで移動・ダブルクリックで設定` : target.axis ? `${axisName(target.axis)}軸${target.kind === 'label' ? 'ラベル：ドラッグで移動・ダブルクリックで設定' : '目盛り：ダブルクリックで設定'}` : target.id==="legend"?"凡例：ドラッグで移動・ダブルクリックで設定":"注釈：ドラッグで移動・ダブルクリックで設定";
    button.setAttribute('aria-label',button.title);
    if(item || isLegendId(target.id))button.setAttribute('aria-pressed',String(selected.has(target.id)));
    if(isLegendId(target.id))button.title+='・選択してDelete／Backspaceで削除';
    if(item?.locked)button.title+='（位置固定）';
    if(item && selected.has(item.id) && !item.locked){
      const handleSize = 14;
      const handles=target.points || [[x+w,y+h],[x+w/2,y-18/imageBox.height]];
      handles.forEach(([px,py],i)=>{
        const handle=document.createElement('button');handle.type='button';handle.className='annotation-handle';handle.dataset.dragId=item.id;
        handle.dataset.handle=target.points?String(i+1):i===0?'resize':'rotate';
        handle.setAttribute('aria-label',target.points?`注釈の${i===0?'始点':'終点'}を移動`:i===0?'フォントサイズを変更':'文字を回転');
        Object.assign(handle.style,{left:`${px*100}%`,top:`${py*100}%`,width:`${handleSize/view.zoom}px`,height:`${handleSize/view.zoom}px`});overlay.append(handle);
      });
    }
  }
}
function clearLivePreview() {
  livePreview=null;
  $('#figure-live').hidden=true;
  $('#figure-live').replaceChildren();
  $('#figure-content').classList.remove('live-preview');
}
function prepareLivePreview(d) {
  // Parse only on the first drag of a rendered graph. All glyphs, math and
  // colors come from its original SVG rather than browser-rendered text.
  if(typeof DOMParser==='undefined')return;
  if(!livePreview){
    const parsed=new DOMParser().parseFromString(figureResult.svg,'image/svg+xml'),svg=parsed.documentElement;
    if(svg.localName!=='svg' || parsed.querySelector('parsererror'))return;
    const size=(svg.getAttribute('viewBox') || '').trim().split(/\s+/).map(Number);
    if(size.length!==4 || !size.every(Number.isFinite) || size[2]<=0 || size[3]<=0)return;
    // Only generated SVG is accepted; never enable executable or external content.
    svg.querySelectorAll('script,foreignObject').forEach(node=>node.remove());
    svg.querySelectorAll('*').forEach(node=>{for(const attr of [...node.attributes])if(/^on/i.test(attr.name) || /(^|:)href$/.test(attr.name) && !/^(#|data:image\/)/.test(attr.value))node.removeAttribute(attr.name);});
    // Matplotlib's universal stroke rule must stay inside the graph.
    svg.querySelectorAll('style').forEach(node=>node.textContent=node.textContent.replace(/(^|})\s*\*/g,'$1 #figure-live svg *'));
    svg.setAttribute('width','100%');svg.setAttribute('height','100%');svg.setAttribute('preserveAspectRatio','none');
    $('#figure-live').replaceChildren(svg);
    livePreview={svg,size};
  }
  const g=figureResult.geometry;
  const entries=d.axis || d.trendIndex!==undefined ? [...(g.axisLabels || []),...(g.trendEquations || [])].filter(entry=>entry.id===d.id) :
    d.id==='legend' ? [{id:'legend',svgIds:g.legendSvgIds}] : isLegendId(d.id) ? d.legendItems :
    g.annotations.filter(entry=>(d.handle?[d.item]:d.items.map(row=>row.item)).some(item=>item.id===entry.id));
  d.liveEntries=entries.map(entry=>({...entry,nodes:(entry.svgIds || []).map(id=>livePreview.svg.querySelector(`[id="${id}"]`)).filter(Boolean).map(node=>({node,original:node.getAttribute('transform') || ''}))}));
}
function annotationDragUpdates(d,event) {
  const dx=(event.clientX-d.x)/d.box.width/d.axes[2],dy=-(event.clientY-d.y)/d.box.height/d.axes[3];
  return (d.handle?[{item:d.item,start:d.start}]:d.items).map(({item,start})=>{
    const value={};
    if(d.handle==='resize')value.font_size=Math.max(2,Math.min(200,Number(start.font_size)+((event.clientX-d.x)-(event.clientY-d.y))/d.box.width*30));
    else if(d.handle==='rotate'){
      value.rotation=(Number(start.rotation)+(event.clientX-d.x)/d.box.width*360)%360;
      if(event.shiftKey)value.rotation=Math.round(value.rotation/15)*15;
    }else{
      const keys=start.type==='text'?['x','y']:d.handle?[`x${d.handle}`,`y${d.handle}`]:['x1','y1','x2','y2'];
      for(const key of keys)value[key]=shiftCoordinate(start[key],key.startsWith('x')?dx:dy,figureResult[`${key[0]}Range`],key.startsWith('y')?figureResult.yDataScale || config.axes.yScale:config.axes.xScale,start.coordinate_system);
      if(event.shiftKey && d.handle && start.type!=='text'){
        const other=d.handle==='1'?'2':'1',snapped=snapPoint({x:Number(start[`x${other}`]),y:Number(start[`y${other}`])},{x:Number(value[`x${d.handle}`]),y:Number(value[`y${d.handle}`])});
        value[`x${d.handle}`]=snapped.x;value[`y${d.handle}`]=snapped.y;
      }
    }
    return {item,start,value};
  });
}
function liveDragTransform(d,event,entry,size) {
  const [, ,width,height]=size,tx=(event.clientX-d.x)/d.box.width*width,ty=(event.clientY-d.y)/d.box.height*height;
  if(!d.handle)return `translate(${tx} ${ty})`;
  const update=annotationDragUpdates(d,event)[0];
  if(d.handle==='resize' || d.handle==='rotate'){
    if(!entry.anchor)return '';
    const [x,y]=[entry.anchor[0]*width,entry.anchor[1]*height];
    const transform=d.handle==='resize'?`scale(${update.value.font_size/Number(d.start.font_size)})`:`rotate(${Number(d.start.rotation)-update.value.rotation})`;
    return `translate(${x} ${y}) ${transform} translate(${-x} ${-y})`;
  }
  if(!entry.points)return '';
  const next={...d.start,...update.value},fraction=(key,value)=>{
    if(next.coordinate_system==='axes_fraction')return value;
    const range=figureResult[`${key}Range`],log=(key==='y'?figureResult.yDataScale || config.axes.yScale:config.axes.xScale)==='log',f=log?Math.log:value=>value;
    return (f(value)-f(range[0]))/(f(range[1])-f(range[0]));
  };
  const points=[1,2].map(i=>[(d.axes[0]+fraction('x',Number(next[`x${i}`]))*d.axes[2])*width,(d.axes[1]+(1-fraction('y',Number(next[`y${i}`])))*d.axes[3])*height]);
  const [a,b]=entry.points.map(([x,y])=>[x*width,y*height]),[c,e]=points;
  const oldLength=Math.hypot(b[0]-a[0],b[1]-a[1]),newLength=Math.hypot(e[0]-c[0],e[1]-c[1]);
  if(oldLength<1e-8)return `translate(${c[0]-a[0]} ${c[1]-a[1]})`;
  const angle=(p,q)=>Math.atan2(q[1]-p[1],q[0]-p[0])*180/Math.PI;
  return `translate(${c[0]} ${c[1]}) rotate(${angle(c,e)}) scale(${Math.max(1e-8,newLength)/oldLength} 1) rotate(${-angle(a,b)}) translate(${-a[0]} ${-a[1]})`;
}
function previewDrag(d,event) {
  if(!livePreview || !d.liveEntries?.some(entry=>entry.nodes.length) || Math.hypot(event.clientX-d.x,event.clientY-d.y)<3)return;
  for(const entry of d.liveEntries){
    const transform=liveDragTransform(d,event,entry,livePreview.size);
    for(const {node,original} of entry.nodes)node.setAttribute('transform',`${transform} ${original}`.trim());
  }
  $('#figure-live').hidden=false;
  $('#figure-content').classList.add('live-preview');
}
$("#figure-image").addEventListener("load",()=>{if(!dragging)clearLivePreview();layoutPreview();});
new ResizeObserver(layoutPreview).observe($("#figure-paper"));
$("#figure-interactions").addEventListener("pointerdown", event => {
  if(event.button !== 0)return;
  const target=event.target.closest('[data-drag-id]');
  if(!target || renderedRevision !== revision || loading || exporting || renderRunning) return;
  const id=target.dataset.dragId, item=config.annotations?.find(item=>item.id===id);
  target.focus({preventScroll:true});
  if(item || isLegendId(id)){
    if(event.shiftKey){if(selected.has(id))selected.delete(id);else selected.add(id);}else if(!selected.has(id))selected=new Set([id]);
    drawAnnotations();
  } else {
    selected.clear();drawAnnotations();
  }
  if(!target.dataset.handle)syncInteractionSelection();
  if(item?.locked || ((item || isLegendId(id)) && !selected.has(id)))return;
  const imageBox=$("#figure-image").getBoundingClientRect();
  dragging={pointerId:event.pointerId,id,item,axis:target.dataset.editAxis,trendIndex:target.dataset.trendIndex,anchor:[...(figureResult.geometry.axisLabels || []),...(figureResult.geometry.trendEquations || [])].find(label=>label.id===id)?.anchor,start:item?structuredClone(item):null,items:(config.annotations||[]).filter(item=>selected.has(item.id)&&!item.locked).map(item=>({item,start:structuredClone(item)})),handle:target.dataset.handle,x:event.clientX,y:event.clientY,box:imageBox,axes:figureResult.geometry.axes,legend:figureResult.geometry.legend};
  dragging.legendItems=(figureResult.geometry.legendItems || []).filter(entry=>selected.has(entry.id));
  const ids=dragging.axis || dragging.trendIndex!==undefined || id==='legend' ? [id] : isLegendId(id) ? dragging.legendItems.map(entry=>entry.id) : dragging.handle ? [id] : dragging.items.map(row=>row.item.id);
  dragging.targets=$$('#figure-interactions [data-drag-id]').filter(node=>ids.includes(node.dataset.dragId) && (!dragging.handle || node===target));
  prepareLivePreview(dragging);
  target.setPointerCapture(event.pointerId); event.preventDefault();
});
$("#figure-interactions").addEventListener("pointermove", event => {
  if(!dragging || dragging.pointerId !== event.pointerId) return;
  const dx=event.clientX-dragging.x,dy=event.clientY-dragging.y;
  previewDrag(dragging,event);
  for(const target of dragging.targets.length?dragging.targets:[event.target])target.style.transform=`translate(${dx/view.zoom}px,${dy/view.zoom}px)`;
});
function finishDrag(event) {
  if(!dragging || dragging.pointerId !== event.pointerId) return;
  const d=dragging; dragging=null;
  if(Math.hypot(event.clientX-d.x,event.clientY-d.y)<3){
    // Keep the label's DOM node between clicks so the browser emits dblclick.
    clearLivePreview();
    for(const target of d.targets.length?d.targets:[event.target])target.style.transform='';
    syncInteractionSelection();
    return;
  }
  previewDrag(d,event);
  const [ax,ay,aw,ah]=d.axes, dx=(event.clientX-d.x)/d.box.width/aw,dy=-(event.clientY-d.y)/d.box.height/ah;
  if(d.trendIndex!==undefined && d.anchor) {
    const item=config.series[Number(d.trendIndex)];
    item.trendX=Math.max(-10,Math.min(10,d.anchor[0]+dx)).toFixed(4);item.trendY=Math.max(-10,Math.min(10,d.anchor[1]+dy)).toFixed(4);
    for(const key of ['trendX','trendY'])$$(`[data-series-index="${d.trendIndex}"] [data-series-field="${key}"]`).forEach(input=>input.value=item[key]);
  } else if(d.axis && d.anchor) {
    config.axes[`${d.axis}LabelX`] = Math.max(-10,Math.min(10,d.anchor[0]+dx)).toFixed(4);
    config.axes[`${d.axis}LabelY`] = Math.max(-10,Math.min(10,d.anchor[1]+dy)).toFixed(4);
    for(const key of ['LabelX','LabelY'])$$(`[data-axis="${d.axis}${key}"]`).forEach(input=>input.value=config.axes[`${d.axis}${key}`]);
  } else if(d.id==="legend") {
    const [x,y,w,h]=d.legend;
    config.axes.legendX=((x+w/2-ax)/aw+dx).toFixed(4);
    config.axes.legendY=(1-(y+h/2-ay)/ah+dy).toFixed(4);
    $$('[data-axis="legendX"],[data-axis="legendY"]').forEach(input=>input.value=config.axes[input.dataset.axis]);
  } else if(isLegendId(d.id)) {
    for(const entry of d.legendItems){
      const [x,y,w,h]=entry.box,state=legendEntryState(entry),series=entry.seriesIndex!==null && entry.seriesIndex!==undefined;
      state[series?'legendX':'x']=Math.max(-10,Math.min(10,(x+w/2-ax)/aw+dx)).toFixed(4);
      state[series?'legendY':'y']=Math.max(-10,Math.min(10,1-(y+h/2-ay)/ah+dy)).toFixed(4);
    }
  } else {
    for(const {item,value} of annotationDragUpdates(d,event))Object.assign(item,value);
    drawAnnotations();
  }
  changed(0);
}
$("#figure-interactions").addEventListener("pointerup",finishDrag);
for(const name of ['pointercancel','lostpointercapture'])$("#figure-interactions").addEventListener(name,event=>{if(dragging && event.pointerId===dragging.pointerId){dragging=null;clearLivePreview();positionInteractions();}});

function selectAnnotation(id, multiple=false){
  if(multiple){if(selected.has(id))selected.delete(id);else selected.add(id);}else selected=new Set([id]);
  drawAnnotations();positionInteractions();
}
function deleteAnnotations(){
  if(!selected.size || loading || exporting)return;
  const hideLegend=[...selected].some(isLegendId);
  if(selected.has('legend'))config.axes.legend=false;
  for(const id of selected){const entry=legendEntry(id);if(entry)legendEntryState(entry)[entry.seriesIndex!==null && entry.seriesIndex!==undefined?'legendVisible':'visible']=false;}
  config.annotations=(config.annotations||[]).filter(item=>!selected.has(item.id));
  selected.clear();
  if(hideLegend)drawControls();else drawAnnotations();
  positionInteractions();changed();
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
function panelLabel(){return config.annotations?.find(item=>['__panel_label__','panel-label'].includes(item.id));}
function setPanelLabelVisible(visible){
  if(!engineReady || !metadata || loading || exporting)return;
  config.annotations ||= [];let label=panelLabel();
  if(!label && !visible)return;
  if(!label){label={id:'__panel_label__',type:'text',axes_id:'primary',coordinate_system:'axes_fraction',x:0,y:1.02,text:'(a)',font_size:8,font_family:config.axes.fontFamily,rotation:0,color:'#000000',opacity:1,bold:false,italic:false,horizontal_alignment:'left',vertical_alignment:'bottom',visible:true,locked:false,zorder:30};config.annotations.push(label);}
  if(visible)selected=new Set([label.id]);else selected.delete(label.id);
  label.visible=visible;
  drawAnnotations();changed(0);
}
for(const id of ['#panel-label','#preview-panel-label'])$(id).addEventListener('change',event=>setPanelLabelVisible(event.target.checked));
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
  const trend=event.target.closest('[data-trend-index]');
  if(trend?.dataset.trendIndex!==undefined){event.preventDefault();openElementEditor('trend',Number(trend.dataset.trendIndex));return;}
  const axis=event.target.closest('[data-edit-axis]');
  if(axis){event.preventDefault();openAxisEditor(axis.dataset.editAxis,axis.dataset.axisKind);return;}
  const series=event.target.closest('[data-edit-series]');
  if(series){event.preventDefault();openElementEditor('series',nearestSeries(event,Number(series.dataset.editSeries)));return;}
  const part=event.target.closest('[data-edit-part]');
  if(part){event.preventDefault();openElementEditor(part.dataset.editPart);return;}
  const target=event.target.closest('[data-drag-id]');if(!target)return;
  event.preventDefault();
  if(isLegendId(target.dataset.dragId))openElementEditor('legend',target.dataset.dragId);
  else openElementEditor('annotation',(config.annotations||[]).findIndex(item=>item.id===target.dataset.dragId));
}
$('#figure-interactions').addEventListener('dblclick',editPreviewElement);
$('#figure-paper').addEventListener('dblclick', event => {
  if (event.defaultPrevented || !figureResult || loading || exporting || renderRunning || renderedRevision!==revision) return;
  if (event.target.closest('[data-drag-id],[data-edit-axis],[data-edit-series],[data-edit-part],[data-trend-index]')) return;
  const box=$('#figure-image').getBoundingClientRect(),[x,y,w,h]=figureResult.geometry.axes;
  const px=(event.clientX-box.left)/box.width,py=(event.clientY-box.top)/box.height;
  if (px>=x && px<=x+w && py>=y && py<=y+h) return;
  event.preventDefault();openElementEditor('figureBackground');
});
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
  if($('#color-panel').open || $('#axis-editor').open || $('#element-editor').open || $('#save-dialog').open || $('#paste-dialog').open || $('#data-import-dialog').open)return;
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
  else if(control&&key==='s'){event.preventDefault();$(event.altKey?'#save-project-as':event.shiftKey?'#save-settings':'#save-project').click();}
  else if(control&&key==='o'){event.preventDefault();$(event.altKey?'#data-file':event.shiftKey?'#open-settings':'#open-project').click();}
});
$$('dialog').forEach(enableDialogDrag);
window.addEventListener('resize',()=>$$('dialog[open]').forEach(keepDialogInView));
try { startWorker(); }
catch (error) { fatal(`描画機能を開始できませんでした。ブラウザを更新してください。${error.message}`); }

// Figure Studio bridge: included in the source application's module scope.
let figureBridgeBaseline=null,figureBridgePreservedOnReconnect=false;
const figureBridgePendingInput=()=>$$('[data-axis],[data-option],[data-series-field],[data-annotation-field],[data-legend-field],[data-fill]').some(input=>!input.disabled&&input.getClientRects().length>0&&incompleteNumberInput(input));
async function figureBridgeIsDirty(){
  if(loading||exporting||renderRunning||renderedRevision!==revision||dragging||colormapApplying||pendingDataFiles||figureBridgePendingInput())return true;
  try{return !samePlotCheckpoint(figureBridgeBaseline,(await collectPlotGraphs()).checkpoint);}catch{return true;}
}
const figureBridgeWait = (predicate,checkError=()=>null) => new Promise((resolve,reject) => {
  const started = Date.now();
  const timer = setInterval(() => {
    const failure = checkError();
    if (failure) {clearInterval(timer);reject(new Error(failure));}
    else if (predicate()) {clearInterval(timer);resolve();}
    else if (Date.now()-started > 180000) {clearInterval(timer);reject(new Error('描画機能の準備が完了しませんでした。'))}
  },80);
});
const plotPreviewCache=new Map(),plotAcknowledgements=createPlotAcknowledgements();
let plotCollectionCache=null,plotMetadataSource=null,plotSheetMetadata=new Map();
async function collectPlotGraphs(){
  if(!metadata||!sourceData||!config.series.length)throw Error('先にグラフを作成してください。');
  const before=projectEditState(),selectedIndex=metadata.sheetIndex;
  const cache=plotCollectionCache;
  if(cache&&cache.source===before.source&&cache.content===before.content&&cache.fonts.length===before.fonts.length&&cache.fonts.every((font,i)=>font===before.fonts[i]))return cache.value;
  if(plotMetadataSource!==sourceData){plotMetadataSource=sourceData;plotSheetMetadata=new Map();plotPreviewCache.clear();}
  const names=[...metadata.sheets],filename=metadata.filename,snapshots=new Map(projectSheetSettings().map(item=>[item.sheetIndex,item.settings]));
  if(names.length>100)throw Error('Studioへの一括送信は100シート以内にしてください。');
  const template=sheetMode==='shared'?currentSharedSettings():sharedSettings||snapshots.get(0)||makeSettings(config,metadata,loadedHeader),graphs=[];
  for(let index=0;index<names.length;index++){
    const setting=snapshots.get(index),headerRow=setting?.data.headerRow??loadedHeader,key=index+':'+headerRow;
    let data=index===selectedIndex?metadata:plotSheetMetadata.get(key);
    if(!data){data=await request('sheet-info',{filename,sheetIndex:index,headerRow});plotSheetMetadata.set(key,data);}
    if(!data.rowCount||data.columns.length<2)throw Error(`シート「${names[index]}」にグラフ用のデータがありません。`);
    const graphConfig=index===selectedIndex?structuredClone(config):configurationForSheet(data,setting,template);
    if(!graphConfig.series.length)throw Error(`シート「${names[index]}」のX列とY列を設定してください。`);
    graphs.push({index,headerRow,config:graphConfig,settings:makeSettings(graphConfig,data,headerRow)});
  }
  const current=graphs.find(graph=>graph.index===selectedIndex),project=makeProject(current.settings,{...sourceData,sheetIndex:selectedIndex,headerRow:loadedHeader,sample},[...importedFonts.values()],{
    saveName:$('#save-name').value,pngDpi:Number($('#png-dpi').value),view:{...view},sections:$$('#controls-panel .control-section').map(section=>section.open),sheetSettings:graphs.map(graph=>({sheetIndex:graph.index,settings:graph.settings})),sheetMode,sharedSettings:sheetMode==='shared'?currentSharedSettings():sharedSettings
  });
  const identity=await identifyPlotProject(project),after=projectEditState();
  if(after.source!==before.source||after.content!==before.content||after.fonts.length!==before.fonts.length||after.fonts.some((font,i)=>font!==before.fonts[i]))throw Error('準備中にグラフが変更されました。もう一度お試しください。');
  const checkpoint={...after,identity},value={project,identity,graphs,checkpoint};plotCollectionCache={...after,value};return value;
}
async function captureFigureStudioImages(batch=false){
  if(!engineReady||loading||exporting||!metadata||!sourceData||!config.series.length)throw Error('グラフの処理が完了してから反映してください。');
  if(figureBridgePendingInput())throw Error('入力中の数値設定を確定してから反映してください。');
  await figureBridgeWait(()=>!renderRunning&&renderedRevision===revision,()=>!renderRunning&&$('#preview-state').classList.contains('error')?'グラフの設定を確認してください。':null);
  exporting=true;updateButtons();
  try{
    const captured=await collectPlotGraphs(),project=new Blob([JSON.stringify(captured.project)],{type:'application/json'});
    if(project.size>PROJECT_MAX_SIZE)throw Error('プロジェクトは130 MB以内にしてください。');
    const images=[],wanted=batch?captured.identity.images:captured.identity.images.filter(image=>image.imageId===captured.identity.activeImageId);
    for(const descriptor of wanted){
      const cached=plotPreviewCache.get(descriptor.imageId),graph=captured.graphs.find(graph=>graph.index===descriptor.sheetIndex);let preview=cached?.fingerprint===descriptor.fingerprint?cached.preview:null;
      if(!preview){const rendered=await request('sheet-export',{filename:metadata.filename,sheetIndex:graph.index,headerRow:graph.headerRow,config:graph.config,format:'svg',dpi:Number($('#png-dpi').value)});const bytes=Uint8Array.from(atob(rendered.base64),c=>c.charCodeAt(0));preview=new Blob([bytes],{type:'image/svg+xml'});plotPreviewCache.set(descriptor.imageId,{fingerprint:descriptor.fingerprint,preview});}
      images.push({...descriptor,preview,...(batch&&plotAcknowledgements.isUnchanged(captured.identity.projectId,descriptor)?{unchanged:true}:{})});
    }
    const result={project,sourceName:projectFilename||`${safeStem($('#save-name').value)}.plotproject`,bridgeState:captured.checkpoint};
    if(batch)return {...result,batch:{projectId:captured.identity.projectId,images}};
    const {preview,...image}=images[0];return {...result,preview,image:{projectId:captured.identity.projectId,...image}};
  }finally{exporting=false;updateButtons();if(renderWanted)renderPreview();}
}
const captureFigureStudioResult=()=>captureFigureStudioImages(false);
const captureFigureStudioBatch=()=>captureFigureStudioImages(true);
async function chooseFigureStudioSheet(imageId){
  const index=plotSheetIndex(imageId);if(index===null||!metadata?.sheets[index])throw Error('対象のシートが見つかりません。');
  if(index===metadata.sheetIndex)return;
  $('#sheet-select').value=String(index);await loadFile(null,false,true);
  if(metadata?.sheetIndex!==index)throw Error('対象のシートへ切り替えられませんでした。');
  await figureBridgeWait(()=>!loading&&!renderRunning&&renderedRevision===revision);
}

function figureStudioResultMatchesCurrentProject(result){return !!sourceData&&result?.bridgeState?.source===sourceData;}
function acceptFigureStudioResult(result){
  if(!figureStudioResultMatchesCurrentProject(result))return false;
  plotAcknowledgements.accept(result);figureBridgeBaseline=result.bridgeState?.identity?mergePlotCheckpoint(figureBridgeBaseline,result.bridgeState,!!result.batch):result.bridgeState;return true;
}
async function acceptDirectFigureStudioResult(result){
  if(!figureStudioResultMatchesCurrentProject(result))return;
  await figureStudioBridge?.rememberAccepted(result);
  acceptFigureStudioResult(result);
}
async function figureStudioProjectLoaded(){if(!figureBridgePreservedOnReconnect)figureBridgeBaseline=(await collectPlotGraphs()).checkpoint;}
function figureStudioHasUnreflectedContent(){return !!metadata&&!!sourceData&&(figureBridgeBaseline?figureBridgeIsDirty():hasUnsavedChanges());}
figureStudioBridge=setupFigureBridge({
  app:'plot',
  hasContent:figureStudioHasUnreflectedContent,
  async canReuseProject({project,imageId}){
    if(!sourceData||!metadata||loading||exporting||figureBridgePendingInput())return false;
    const identity=await identifyPlotProject(JSON.parse(await project.text())),index=plotSheetIndex(imageId);
    return identity.projectId===sourceData.figureStudioProjectId&&(!imageId||index!==null&&!!metadata.sheets[index]&&identity.images.some(image=>image.imageId===imageId));
  },
  canAdoptAccepted:result=>!!sourceData&&sourceData===result?.bridgeState?.source,
  onConnectionChange(connected){figureStudioDirectSender?.setBridgeConnected(connected);},
  async loadProject(file,{reconnect,imageId}={}) {
    parseProject(JSON.parse(await file.text()));
    await figureBridgeWait(() => engineReady && !loading && !exporting);
    const incomingIdentity=await identifyPlotProject(JSON.parse(await file.text()));
    figureBridgePreservedOnReconnect=!!(reconnect&&metadata&&sourceData&&incomingIdentity.projectId===sourceData.figureStudioProjectId);
    if (!figureBridgePreservedOnReconnect && !await readProject(file,undefined,{fromBridge:true})) throw new Error('プロジェクトを復元できませんでした。編集画面のエラーを確認してください。');
    if(imageId)await chooseFigureStudioSheet(imageId);
    await figureBridgeWait(() => !loading && !renderRunning && renderedRevision === revision,
      () => !renderRunning && $('#preview-state').classList.contains('error') ? 'グラフを描画できませんでした。編集画面で設定を確認してください。' : null);
  },
  selectImage:chooseFigureStudioSheet,
  captureResult:captureFigureStudioResult,
  captureBatchResult:captureFigureStudioBatch,
  isDirty:figureBridgeIsDirty,
  onProjectLoaded:figureStudioProjectLoaded,
  onAccepted:acceptFigureStudioResult
});
figureStudioDirectSender = setupDirectSendButton({app:'plot',captureResult:captureFigureStudioResult,captureBatchResult:captureFigureStudioBatch,container:'.header-actions',
  onAccepted:acceptDirectFigureStudioResult,
  isReady:()=>engineReady&&!loading&&!exporting&&!renderRunning&&!!metadata&&!!sourceData&&!!config.series.length&&renderedRevision===revision});
figureStudioDirectSender?.setBridgeConnected(figureStudioBridge?.isConnected===true);

// Figure Studio workspace snapshots retain editor work separately from reflected figures.
var figureWorkspaceSavedSignature=null;
let figureWorkspaceRestoring=false,figureWorkspaceCapturing=false;
const figureWorkspaceTokens=new WeakMap();
const figureWorkspaceAttributes=['data-axis','data-option','data-series-field','data-annotation-field','data-legend-field','data-legend-key','data-fill','data-unit-axis','data-axis-auto','data-axis-name','data-series-scope','data-preview-preset'];
const figureWorkspaceDialogIds=new Set($$('dialog[id]').map(node=>node.id));
const figureWorkspaceToken=value=>{if(!value)return null;if(!figureWorkspaceTokens.has(value))figureWorkspaceTokens.set(value,crypto.randomUUID());return figureWorkspaceTokens.get(value);};

// Pure guards: reject live browser objects, oversized graphs and malformed state before worker or UI changes.
function validateFigureWorkspaceGraph(root){
 const seen=new Set(),stack=[{value:root,depth:0}];let nodes=0,text=0,bytes=0;
 while(stack.length){const {value,depth}=stack.pop();if(depth>80||++nodes>250000)throw Error('PlotLauncherの保存状態が複雑すぎます。');
  if(value==null||typeof value==='boolean')continue;
  if(typeof value==='string'){text+=value.length*2;if(text>64*1024*1024)throw Error('PlotLauncherの文字情報が大きすぎます。');continue;}
  if(typeof value==='number'){if(!Number.isFinite(value))throw Error('PlotLauncherの数値情報が不正です。');continue;}
  if(typeof value!=='object')throw Error('PlotLauncherの保存状態に対応しない値があります。');if(seen.has(value))continue;seen.add(value);
  if(value instanceof ArrayBuffer){bytes+=value.byteLength;if(bytes>260*1024*1024)throw Error('PlotLauncherの保存データが大きすぎます。');continue;}
  if(ArrayBuffer.isView(value)){stack.push({value:value.buffer,depth:depth+1});continue;}
  if(typeof Blob!=='undefined'&&value instanceof Blob){bytes+=value.size;if(bytes>260*1024*1024)throw Error('PlotLauncherの保存データが大きすぎます。');continue;}
  if(value instanceof Date){if(!Number.isFinite(value.getTime()))throw Error('保存日時が不正です。');continue;}
  if(value instanceof Map){for(const [key,item]of value)stack.push({value:key,depth:depth+1},{value:item,depth:depth+1});continue;}
  if(value instanceof Set){for(const item of value)stack.push({value:item,depth:depth+1});continue;}
  if(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)throw Error('ファイルへのアクセス情報などは保存できません。');
  for(const [key,descriptor]of Object.entries(Object.getOwnPropertyDescriptors(value))){if(['__proto__','prototype','constructor'].includes(key)||descriptor.get||descriptor.set)throw Error('PlotLauncherの保存状態が不正です。');if(key!=='length')stack.push({value:descriptor.value,depth:depth+1});}
 }
 return true;
}
function validateFigureWorkspaceState(snapshot){
 if(snapshot==null)return true;validateFigureWorkspaceGraph(snapshot);
 if(snapshot.version!==1||snapshot.app!=='plot'||!Object.hasOwn(snapshot,'state'))throw Error('PlotLauncherの作業状態ではありません。');
 const state=snapshot.state;if(state===null)return true;
 const fail=()=>{throw Error('PlotLauncherの作業状態を確認してください。');};
 const string=(value,max=1000)=>typeof value==='string'&&value.length<=max;
 const list=(value,max)=>Array.isArray(value)&&value.length<=max;
 const configValid=value=>{if(!value||typeof value!=='object'||!value.axes||typeof value.axes!=='object'||Array.isArray(value.axes)||!list(value.series,32)||value.annotations!==undefined&&!list(value.annotations,200))return false;try{return JSON.stringify(value,(_key,item)=>{if(item&&typeof item==='object'&&!Array.isArray(item)&&Object.getPrototypeOf(item)!==Object.prototype&&Object.getPrototypeOf(item)!==null)throw Error();return item;}).length<=8*1024*1024;}catch{return false;}};
 if(!state||state.format!=='plotlauncher-workspace'||state.version!==1||!configValid(state.config)||!list(state.fonts,32)||!list(state.fontFamilies,200)||!list(state.fontAliases,200)||!list(state.history,30)||!list(state.future,30)||!list(state.selected,300)||!list(state.clipboard,200)||!list(state.sheetSettings,1001)||!['shared','individual'].includes(state.sheetMode)||!Number.isInteger(state.loadedHeader)||state.loadedHeader<1||state.loadedHeader>1000||typeof state.sample!=='boolean'||!string(state.projectFilename,255))fail();
 if(state.history.some(value=>!configValid(value))||state.future.some(value=>!configValid(value))||state.lastState!==undefined&&!configValid(state.lastState)||state.selected.some(value=>!string(value,200))||state.fontFamilies.some(value=>!string(value,200))||state.fontAliases.some(value=>!list(value,2)||value.length!==2||value.some(item=>!string(item,200))))fail();
 let fontBytes=0;for(const font of state.fonts){if(!string(font?.name,255)||!string(font?.family,200)||!(font.bytes instanceof ArrayBuffer)||!font.bytes.byteLength||font.bytes.byteLength>20*1024*1024)fail();fontBytes+=font.bytes.byteLength;}if(fontBytes>60*1024*1024)fail();
 if(state.sourceData){const data=state.sourceData,meta=state.metadata;if(!string(data.filename,255)||!/\.(xlsx|xlsm|xls|csv|txt)$/i.test(data.filename)||!meta||meta.filename!==data.filename||!list(meta.columns,20000)||!list(meta.sheets,1001)||!Number.isInteger(meta.sheetIndex)||meta.sheetIndex<0||meta.sheetIndex>=meta.sheets.length)fail();
  if(data.figureStudioProjectId!==undefined&&(typeof data.figureStudioProjectId!=='string'||!/^[a-zA-Z0-9-]{16,100}$/.test(data.figureStudioProjectId)))fail();
  const files=data.files??[data];if(!list(files,16)||!files.length)fail();let total=0;for(const file of files){if(!string(file?.filename,255)||!/\.(xlsx|xlsm|xls|csv|txt)$/i.test(file.filename)||!(file.bytes instanceof ArrayBuffer)||!file.bytes.byteLength)fail();total+=file.bytes.byteLength;if(data.files&&(!Number.isInteger(file.sheetIndex)||file.sheetIndex<0||file.sheetIndex>1000||!Number.isInteger(file.headerRow)||file.headerRow<1||file.headerRow>1000))fail();}if(total>30*1024*1024)fail();
  if(state.config.series.length)restoreSettings(makeSettings(state.config,meta,state.loadedHeader),meta);
 }else if(state.metadata!==null)fail();
 for(const entry of state.sheetSettings)if(!list(entry,2)||entry.length!==2||!Number.isInteger(entry[0])||entry[0]<0||entry[0]>1000||entry[1]?.format!=='plotlauncher-web'||entry[1].version!==1)fail();
 const w=state.workspace,u=state.ui;if(!w||!string(w.saveName,120)||![150,300,600,1200].includes(Number(w.pngDpi))||!w.view||!Number.isFinite(w.view.zoom)||w.view.zoom<.25||w.view.zoom>4||!Number.isFinite(w.view.x)||!Number.isFinite(w.view.y)||!list(w.details,1000)||typeof w.tableHidden!=='boolean'||typeof w.tableDetails!=='boolean'||!Number.isFinite(w.controlScroll)||!Number.isFinite(w.pageScroll)||!u||!list(u.fields,12000)||!list(u.dialogs,50)||!list(u.details,2000))fail();
 const locator=value=>value&&string(value.scope,200)&&string(value.id,200)&&['INPUT','SELECT','TEXTAREA'].includes(value.tag)&&string(value.type,30)&&list(value.attributes,figureWorkspaceAttributes.length)&&value.attributes.every(pair=>list(pair,2)&&pair.length===2&&figureWorkspaceAttributes.includes(pair[0])&&string(pair[1],1000))&&Number.isInteger(value.ordinal)&&value.ordinal>=0&&value.ordinal<12000;
 for(const field of u.fields)if(!locator(field.locator)||!string(field.value,30*1024*1024)||typeof field.checked!=='boolean'||typeof field.indeterminate!=='boolean'||field.badInput===true)fail();
 for(const dialog of u.dialogs)if(!string(dialog.id,200)||!string(dialog.left,50)||!string(dialog.top,50)||dialog.left&&!/^-?[\d.]+px$/.test(dialog.left)||dialog.top&&!/^-?[\d.]+px$/.test(dialog.top))fail();
 for(const detail of u.details)if(!string(detail.scope,200)||!Number.isInteger(detail.index)||detail.index<0||detail.index>2000||typeof detail.open!=='boolean')fail();
 if(u.colorTarget&&!locator(u.colorTarget)||u.focus&&!locator(u.focus))fail();
 if(u.axis&&(!['x','y','y2'].includes(u.axis.axis)||!['label','ticks'].includes(u.axis.kind)))fail();
 if(u.element&&(!['series','seriesAll','trend','annotation','legend','preset','frame','figureBackground','plotBackground','grid'].includes(u.element.part)||!string(u.element.index,200)||u.element.origin!==undefined&&!string(u.element.origin,200)||u.element.part!=='legend'&&(!/^\d+$/.test(u.element.index)||Number(u.element.index)>200)))fail();
 if(!string(state.sourceToken,200)&&state.sourceToken!==null||state.sourceData&&!string(state.sourceToken,200)||!list(state.fontTokens,32)||state.fontTokens.length!==state.fonts.length||state.fontTokens.some(value=>!string(value,200)))fail();
 if(state.pendingDataFiles!==null&&(!list(state.pendingDataFiles,16)||state.pendingDataFiles.some(file=>!(file instanceof File))))fail();
 return true;
}
// End pure workspace validation helpers.

function figureWorkspaceFields(root=document){return [...root.querySelectorAll('input,select,textarea')].filter(input=>!['file','password','hidden'].includes(input.type)&&input.id!=='save-destination'&&(!input.closest('dialog')||input.closest('dialog').open));}
function figureWorkspaceBaseLocator(input){return {scope:input.closest('dialog')?.id||'',id:input.id||'',tag:input.tagName,type:input.type||'',attributes:figureWorkspaceAttributes.filter(name=>input.hasAttribute(name)).map(name=>[name,input.getAttribute(name)]),ordinal:0};}
const figureWorkspaceLocatorKey=locator=>JSON.stringify([locator.scope,locator.id,locator.tag,locator.type,locator.attributes]);
function figureWorkspaceLocator(input){
 const locator=figureWorkspaceBaseLocator(input),root=locator.scope?document.getElementById(locator.scope):document;
 locator.ordinal=figureWorkspaceFields(root).filter(node=>figureWorkspaceMatches(node,locator)).indexOf(input);return locator;
}
function figureWorkspaceMatches(input,locator){return (input.closest('dialog')?.id||'')===locator.scope&&input.id===locator.id&&input.tagName===locator.tag&&(input.type||'')===locator.type&&locator.attributes.every(([name,value])=>input.getAttribute(name)===value);}
function figureWorkspaceField(locator){const root=locator.scope?document.getElementById(locator.scope):document;return root?figureWorkspaceFields(root).filter(input=>figureWorkspaceMatches(input,locator))[locator.ordinal]:null;}
function figureWorkspaceUI({rejectInvalid=false}={}){
 const locators=new Map(),ordinals=new Map();
 const fields=figureWorkspaceFields().map(input=>{if(rejectInvalid&&input.validity?.badInput)throw Error(`「${input.getAttribute('aria-label')||input.closest('label')?.textContent?.trim().slice(0,60)||input.dataset.axis||input.id||'数値欄'}」の入力を確定してから保存してください。`);const locator=figureWorkspaceBaseLocator(input),key=figureWorkspaceLocatorKey(locator);locator.ordinal=ordinals.get(key)||0;ordinals.set(key,locator.ordinal+1);locators.set(input,locator);return {locator,value:input.value,checked:!!input.checked,indeterminate:!!input.indeterminate,badInput:!!input.validity?.badInput};});
 const dialogs=$$('dialog[open]').map(dialog=>({id:dialog.id,left:dialog.style.left||'',top:dialog.style.top||''}));
 return {fields,dialogs,details:$$('details').filter(node=>!node.closest('dialog')||node.closest('dialog').open).map(node=>{const scope=node.closest('dialog')?.id||'',root=scope?document.getElementById(scope):document;return {scope,index:[...root.querySelectorAll('details')].filter(item=>(item.closest('dialog')?.id||'')===scope).indexOf(node),open:node.open};}),
  axis:$('#axis-editor').open?{axis:$('#axis-editor-fields').dataset.axisName,kind:$('#axis-editor-fields').dataset.workspaceKind||($('#axis-editor-fields').querySelector('[data-axis$="Label"]')?'label':'ticks')}:null,
  element:$('#element-editor').open?{part:$('#element-editor-fields').dataset.workspacePart,index:$('#element-editor-fields').dataset.workspaceIndex||'0',origin:$('#element-editor-fields').dataset.seriesEditorOrigin||''}:null,
  colorTarget:$('#color-panel').open&&colorTarget?.isConnected?locators.get(colorTarget)||null:null,
  focus:locators.get(document.activeElement)||null};
}
function figureWorkspaceHasWork(){return !!sourceData||[...importedFonts.values()].some(font=>!font.automatic)||!!pendingDataFiles||!!$('#paste-text').value||JSON.stringify(config)!==JSON.stringify({axes:defaultAxes(),series:[]});}
function figureWorkspaceBusy(){return figureWorkspaceCapturing||figureWorkspaceRestoring||loading||exporting||!!dragging||!!panning||colormapApplying||updateReloading||updateChecking||!!figureStudioDirectSender?.busy;}
function figureWorkspaceSignature(){
 if(!figureWorkspaceHasWork())return 'plot-empty';
 const ui=figureWorkspaceUI();ui.focus=null;
 const value=JSON.stringify({source:figureWorkspaceToken(sourceData),fonts:[...importedFonts.values()].map(figureWorkspaceToken),config,loadedHeader,sample,sheets:[...sheetSettings],sheetMode,sharedSettings,history,future,lastState,selected:[...selected],clipboard,view,ui,pending:pendingDataFiles?.map(file=>[file.name,file.size,file.lastModified]),pasteHeaderAutomatic});
 let a=2166136261,b=2246822507;for(let i=0;i<value.length;i++){const code=value.charCodeAt(i);a=Math.imul(a^code,16777619);b=Math.imul(b^code,3266489909);}return `plot-${value.length}-${(a>>>0).toString(16)}-${(b>>>0).toString(16)}`;
}
function figureWorkspaceEmpty(){return {format:'plotlauncher-workspace',version:1,config:{axes:defaultAxes(),series:[]},sourceData:null,metadata:null,fonts:[],fontFamilies:['Liberation Sans','Noto Sans JP','DejaVu Sans'],fontAliases:[],savedProjectState:null,loadedHeader:1,sample:false,sheetSettings:[],sheetMode:'shared',sharedSettings:null,history:[],future:[],lastState:undefined,selected:[],clipboard:[],projectFilename:'',sourceToken:null,fontTokens:[],bridgeBaseline:null,pendingDataFiles:null,pastedTable:null,pasteHeaderAutomatic:true,recentColors:[],workspace:{saveName:$('#save-name').defaultValue||'graph',pngDpi:'1200',saveDestination:'download',view:{zoom:1,x:0,y:0},tableHidden:false,tableDetails:false,details:[],controlScroll:0,pageScroll:0},ui:{fields:[],dialogs:[],details:[],axis:null,element:null,colorTarget:null,focus:null}};}
async function captureFigureWorkspace(){
 if(figureWorkspaceBusy())throw Error('PlotLauncherの処理が終わってから保存してください。');
 if(!figureWorkspaceHasWork())return {version:1,app:'plot',state:null,binding:null};
 figureWorkspaceUI({rejectInvalid:true});
 await figureBridgeWait(()=>engineReady&&!renderRunning&&!renderWanted&&(renderedRevision===revision||!metadata||!config.series.length||$('#preview-state').classList.contains('error')));
 if(figureWorkspaceBusy())throw Error('PlotLauncherの処理が終わってから保存してください。');
 figureWorkspaceCapturing=true;exporting=true;
 try{
  const {handles,...record}=captureUpdateSession(null);
  const state={...record,format:'plotlauncher-workspace',projectFilename:handles.projectFilename,sourceToken:figureWorkspaceToken(sourceData),fontTokens:[...importedFonts.values()].map(figureWorkspaceToken),bridgeBaseline:figureBridgeBaseline,pendingDataFiles,pastedTable,pasteHeaderAutomatic,recentColors:[...recentColors],ui:figureWorkspaceUI({rejectInvalid:true})};
  const snapshot=structuredClone({version:1,app:'plot',state,binding:null});snapshot.binding=await figureStudioBridge?.captureWorkspaceBinding?.()??null;validateFigureWorkspaceState(snapshot);return snapshot;
 }finally{figureWorkspaceCapturing=false;exporting=false;if(renderWanted)renderPreview();}
}
async function restoreFigureWorkspace(snapshot){
 if(figureWorkspaceBusy())throw Error('PlotLauncherの処理が終わってから開いてください。');
 snapshot=snapshot==null?null:structuredClone(snapshot);
 validateFigureWorkspaceState(snapshot);
 const record=structuredClone(snapshot?.state||figureWorkspaceEmpty());
 await figureBridgeWait(()=>(engineReady||!record.sourceData&&!record.fonts.length)&&!loading&&!exporting&&!renderRunning);
 if(figureWorkspaceBusy())throw Error('PlotLauncherの処理が終わってから開いてください。');
 figureWorkspaceRestoring=true;loading=true;updateButtons();
 try{
  let restoredMetadata=null;
  if(record.sourceData){const data=record.sourceData;restoredMetadata=data.files?await request('load-many',{filename:data.filename,files:data.files.map(file=>({...file,bytes:file.bytes.slice(0)}))}):await request('load',{filename:data.filename,bytes:data.bytes.slice(0),sheetIndex:record.metadata.sheetIndex,headerRow:record.loadedHeader});if(restoredMetadata.filename!==record.metadata.filename||restoredMetadata.sheetIndex!==record.metadata.sheetIndex)throw Error('元データのシートを復元できませんでした。');}
  for(const font of record.fonts)await request('font',{filename:font.name,bytes:font.bytes.slice(0)});
  $$('dialog[open]').forEach(dialog=>dialog.close());
  config=record.config;sourceData=record.sourceData;metadata=restoredMetadata;importedFonts.clear();record.fonts.forEach(font=>importedFonts.set(font.name,font));
  loadedFonts.clear();record.fontFamilies.forEach(family=>loadedFonts.add(family));localFontAliases.clear();record.fontAliases.forEach(([family,alias])=>localFontAliases.set(family,alias));failedLocalFonts.clear();
  if(sourceData)figureWorkspaceTokens.set(sourceData,record.sourceToken);record.fonts.forEach((font,index)=>figureWorkspaceTokens.set(font,record.fontTokens[index]));
  savedProjectState=record.savedProjectState;figureBridgeBaseline=record.bridgeBaseline;figureBridgePreservedOnReconnect=false;loadedHeader=record.loadedHeader;sample=record.sample;
  sheetSettings=new Map(record.sheetSettings);sheetMode=record.sheetMode;sharedSettings=record.sharedSettings;history=record.history;future=record.future;lastState=record.lastState;selected=new Set(record.selected);clipboard=record.clipboard;
  sourceHandle=sourceDirectory=saveDirectory=projectHandle=null;dataFileHandles=[];projectFilename=record.projectFilename;
  pendingDataFiles=record.pendingDataFiles;pastedTable=record.pastedTable;pasteHeaderAutomatic=record.pasteHeaderAutomatic;recentColors.splice(0,recentColors.length,...(record.recentColors||[]));
  const workspace=record.workspace;view=workspace.view;$('#save-name').value=workspace.saveName;$('#png-dpi').value=workspace.pngDpi;$('#save-destination').value='download';
  clearTimeout(renderTimer);++revision;resetPreview();if(metadata)drawMetadata();else{$('#data-preview').hidden=true;$('#initial-message strong').textContent='データを選んでください';$('#preview-state').textContent='データ未選択';}
  drawControls();refreshSaveDestination();if($('#series-table-content').hidden!==workspace.tableHidden)toggleSeriesTable();$('#series-table-details').checked=workspace.tableDetails;$('#series-table').dataset.details=String(workspace.tableDetails);
  $('#undo').disabled=!history.length;$('#redo').disabled=!future.length;renderWanted=!!metadata&&!!config.series.length;
 }catch(error){figureWorkspaceRestoring=false;throw error;}finally{loading=false;updateButtons();}
 try{
  if(renderWanted)await renderPreview();
  await figureBridgeWait(()=>!renderRunning&&!renderWanted);
  if(record.ui.axis&&metadata)openAxisEditor(record.ui.axis.axis,record.ui.axis.kind);
  if(record.ui.element&&metadata){const {part,index,origin}=record.ui.element;if(['series','seriesAll'].includes(part)&&/^\d+$/.test(origin||'')&&config.series[Number(origin)]&&origin!==index)openElementEditor('series',Number(origin));openElementEditor(part,part==='legend'?index:Number(index));$('#element-editor-fields').dataset.seriesEditorOrigin=origin||'';}
  for(const saved of record.ui.dialogs){if(!figureWorkspaceDialogIds.has(saved.id))continue;const dialog=document.getElementById(saved.id);if(saved.id==='color-panel'&&record.ui.colorTarget){const target=figureWorkspaceField(record.ui.colorTarget);if(target)openColorPanel(target,'色');}else if(!dialog.open)dialog.showModal();if(saved.left&&saved.top)positionDialog(dialog,parseFloat(saved.left),parseFloat(saved.top));}
  const fieldIndex=new Map();for(const input of figureWorkspaceFields()){const key=figureWorkspaceLocatorKey(figureWorkspaceBaseLocator(input));if(!fieldIndex.has(key))fieldIndex.set(key,[]);fieldIndex.get(key).push(input);}
  for(const field of record.ui.fields){const input=fieldIndex.get(figureWorkspaceLocatorKey(field.locator))?.[field.locator.ordinal];if(!input)continue;input.value=field.value;if(input.type==='checkbox'||input.type==='radio'){input.checked=field.checked;input.indeterminate=field.indeterminate;}}
  for(const detail of record.ui.details){const root=detail.scope?document.getElementById(detail.scope):document;if(!root)continue;const node=[...root.querySelectorAll('details')].filter(item=>(item.closest('dialog')?.id||'')===detail.scope)[detail.index];if(node)node.open=detail.open;}
  selected=new Set(record.selected);syncInteractionSelection();$('#controls-panel').scrollTop=record.workspace.controlScroll;window.scrollTo?.(0,record.workspace.pageScroll);
  if($('#paste-dialog').open){const automatic=pasteHeaderAutomatic;pasteHeaderAutomatic=false;updatePastePreview();pasteHeaderAutomatic=automatic;}
  if(record.ui.focus)figureWorkspaceField(record.ui.focus)?.focus({preventScroll:true});
  figureWorkspaceSavedSignature=null;status('PlotLauncherの作業状態を復元しました。','ready');
 }finally{figureWorkspaceRestoring=false;}
}
window.FigureStudioWorkspaceState={version:1,app:'plot',capture:captureFigureWorkspace,async validate(snapshot){return validateFigureWorkspaceState(snapshot==null?null:structuredClone(snapshot));},restore:restoreFigureWorkspace,signature:figureWorkspaceSignature,hasWork:figureWorkspaceHasWork,getBusy:figureWorkspaceBusy,
 async restoreBinding(binding){if(binding==null)return figureStudioBridge?.resetWorkspaceBinding?.();return figureStudioBridge?.restoreWorkspaceBinding?.(structuredClone(binding));},
 markSaved(signature){if(typeof signature==='string'&&signature===figureWorkspaceSignature()){figureWorkspaceSavedSignature=signature;return true;}return false;}
};

