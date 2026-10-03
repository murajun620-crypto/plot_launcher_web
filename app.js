import { COLORS, COLOR_PALETTE, applyPreset, createSeries, defaultAxes, makeSettings, restoreSettings, safeStem, sampleCSV, zoomAt, shiftCoordinate, snapPoint } from "./state.js?v=218d4aa777cf";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escapeHTML = text => String(text).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
let worker, engineReady = false, requestID = 0;
const requests = new Map();
let metadata = null, config = { axes: defaultAxes(), series: [] };
let loading = false, exporting = false, sample = false, loadedHeader = 1;
let revision = 0, renderedRevision = -1, renderRunning = false, renderWanted = false, renderTimer;
let previewURL, figureResult, dragging;
let colorTarget;
const recentColors = [];
let presets = [], selected = new Set(), clipboard = [], view = {zoom:1,x:0,y:0}, panning;
let history = [], future = [], lastState, restoring = false;
const catalogReady = fetch(new URL("./presets.json" + new URL(import.meta.url).search, import.meta.url)).then(response => {if(!response.ok) throw new Error("プリセットの読み込みに失敗しました"); return response.json();}).then(items => {
  presets = items; $("#plot-type").replaceChildren(...items.map(item => new Option(item.label,item.id)));
});
catalogReady.catch(error => fatal(error.message));
const loadedFonts = new Set(["Liberation Sans", "Noto Sans JP", "DejaVu Sans"]);

function desktopAppearance() {
  const numeric = (key, label, min = 0, max = 3, step = 0.1) => `<label>${label}<input data-axis="${key}" type="number" min="${min}" max="${max}" step="${step}"></label>`;
  const check = (key, label) => `<label><input data-axis="${key}" type="checkbox">${label}</label>`;
  $("#desktop-appearance").innerHTML = `
    <label class="full-field">図のフォント<select id="font-family" data-axis="fontFamily"><option>Liberation Sans</option><option>Noto Sans JP</option><option>DejaVu Sans</option></select></label>
    <label class="full-field">日本語フォント<select id="japanese-font-family" data-axis="japaneseFontFamily"><option>Noto Sans JP</option><option>Liberation Sans</option><option>DejaVu Sans</option></select></label>
    <button type="button" id="load-font" class="button quiet">手元のフォントを読み込む</button><input id="font-file" type="file" accept=".ttf,.otf,.ttc" multiple hidden>
    <p class="field-hint">Python版のArialと同じ字形には、手元のArialを読み込んでください。標準のLiberation SansはArialと文字幅が互換です。日本語はNoto Sans JP、数式はSTIX Sansを使います。</p>
    <div class="field-grid">${numeric("tickFontScale", "目盛り文字倍率", .2)}${numeric("labelFontScale", "軸ラベル倍率", .2)}${numeric("spineScale", "枠線倍率", .1, 5)}${numeric("dataLineScale", "データ線倍率", 0, 6)}${numeric("tickLength", "目盛り長さ倍率", 0, 5)}</div>
    <p class="field-hint">倍率1：目盛り7 pt、軸ラベル8 pt、枠線0.8 pt、主目盛り2.5 pt・副目盛り1.25 pt。</p>
    <details><summary>余白・軸の表示</summary>
    <div class="field-grid">${numeric("xLabelPad", "Xラベル余白 (pt)", -100, 100)}${numeric("yLabelPad", "Yラベル余白 (pt)", -100, 100)}${numeric("xTickPad", "X目盛り追加余白 (pt)", -100, 100)}${numeric("yTickPad", "Y目盛り追加余白 (pt)", -100, 100)}</div>
    <div class="field-grid"><label>X対数表記<select data-axis="xLogFormat"><option value="power">累乗</option><option value="decimal">小数</option></select></label><label>Y対数表記<select data-axis="yLogFormat"><option value="power">累乗</option><option value="decimal">小数</option></select></label></div>
    <div class="check-options">${check("hideXLabel", "Xラベルを隠す")}${check("hideYLabel", "Yラベルを隠す")}${check("hideXTickLabels", "X目盛り文字を隠す")}${check("hideYTickLabels", "Y目盛り文字を隠す")}${check("hideXTicks", "X目盛り線を隠す")}${check("hideYTicks", "Y目盛り線を隠す")}${check("hideMinorTicks", "副目盛りを隠す")}${check("spineLeft", "左枠")}${check("spineRight", "右枠")}${check("spineTop", "上枠")}${check("spineBottom", "下枠")}${check("yAxisRight", "Y軸を右側")}${check("xAxisTop", "X軸を上側")}</div></details>
    <details><summary>背景・誤差棒</summary>
    <div class="field-grid"><label>枠線色<input data-axis="spineColor" type="color"></label><label>背景色<input data-axis="backgroundColor" type="color"></label>${numeric("backgroundAlpha", "背景不透明度", 0, 1)}${numeric("markerEdgeWidth", "マーカー縁幅 (pt)", 0, 20)}${numeric("errorLineWidth", "誤差棒幅 (pt)", 0, 20)}${numeric("errorCapSize", "誤差キャップ (pt)", 0, 20)}${numeric("errorCapThick", "キャップ幅 (pt)", 0, 20)}</div></details>`;
  $("#legend-appearance").innerHTML = `${numeric("legendScale", "凡例サイズ倍率", .2)}${numeric("legendFontScale", "凡例文字倍率", .2)}${numeric("legendX", "凡例X (軸比率)", -10, 10, .01)}${numeric("legendY", "凡例Y (軸比率)", -10, 10, .01)}`;
}
desktopAppearance();

function status(text, kind = "working") {
  $("#status-text").textContent = text;
  $("#status").dataset.kind = kind;
}

function updateButtons() {
  const busy = loading || exporting;
  $("#drop-zone").disabled = !engineReady || busy;
  $("#sample-data").disabled = !engineReady || busy;
  $("#plot-fields").disabled = !engineReady || !metadata || busy;
  $("#header-row").disabled = !engineReady || !metadata || busy;
  $("#sheet-select").disabled = !engineReady || !metadata || busy || metadata.sheets.length < 2;
  $("#open-settings").disabled = !metadata || busy;
  $("#save-settings").disabled = !metadata || busy || config.series.length === 0;
  $("#refresh-preview").disabled = !metadata || busy;
  $("#add-series").disabled = config.series.length >= 32 || (metadata?.columns.length ?? 0) < 2;
  $("#load-font").disabled = !engineReady || busy;
  $$('[data-export]').forEach(button => { button.disabled = !engineReady || busy || renderedRevision !== revision || renderRunning; });
  $("#copy-image").disabled = !engineReady || busy || renderedRevision !== revision || renderRunning;
  $("#figure-stage").setAttribute("aria-busy", String(loading || exporting || renderRunning || !engineReady));
  syncColorIcons();
}

function request(operation, args) {
  return new Promise((resolve, reject) => {
    const id = ++requestID;
    requests.set(id, { resolve, reject });
    worker.postMessage({ id, operation, args }, args.bytes ? [args.bytes] : []);
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
  worker = new Worker(new URL("./worker.js?v=218d4aa777cf", import.meta.url), { type: "module" });
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
  for (const input of $$('input[type="color"],input[data-series-field$="Color"],input[data-option$="Color"]')) {
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

function openAxisEditor(axis, kind) {
  if (!metadata || loading || exporting || renderRunning || renderedRevision !== revision) return;
  const fields = $('#axis-editor-fields'); fields.dataset.axisName = axis;
  const label = (key, text, type='text', extra='') => `<label>${text}<input data-axis="${key}" type="${type}" value="${escapeHTML(config.axes[key])}" ${extra}></label>`;
  $('#axis-editor-title').textContent = `${axis.toUpperCase()}軸${kind === 'label' ? 'ラベル' : '目盛り'}の設定`;
  if (kind === 'label') {
    fields.innerHTML = label(`${axis}Label`,'ラベル（空欄で自動）','text','maxlength="500"') + label(`${axis}Unit`,'単位（autoで自動）') +
      `<div class="field-grid">${label(`${axis}LabelPad`,'ラベル余白 (pt)','number','min="-100" max="100" step=".5"')}${label('labelFontScale','軸ラベル文字倍率','number','min=".2" max="3" step=".1"')}</div>` +
      `<div class="field-grid">${label(`${axis}LabelX`,'ラベルX (軸比率)','number','step=".01" placeholder="標準"')}${label(`${axis}LabelY`,'ラベルY (軸比率)','number','step=".01" placeholder="標準"')}</div><button type="button" class="button quiet" data-reset-label>標準位置に戻す</button>`;
  } else {
    const automatic = config.axes[`${axis}Min`] === '' && config.axes[`${axis}Max`] === '';
    fields.innerHTML = `<label><input type="checkbox" data-axis-auto="range" ${automatic?'checked':''}>範囲を自動設定</label><div class="field-grid">${label(`${axis}Min`,'最小','number','step="any" placeholder="自動"')}${label(`${axis}Max`,'最大','number','step="any" placeholder="自動"')}</div>` +
      `<label><input type="checkbox" data-axis-auto="ticks" ${config.axes[`${axis}Step`]===''?'checked':''}>目盛り間隔を自動設定</label>` +
      label(`${axis}Step`,'目盛り間隔','number','step="any" placeholder="自動"') + `<div class="field-grid">${label(`${axis}TickPad`,'目盛り追加余白 (pt)','number','min="-100" max="100" step=".5"')}${label('tickFontScale','目盛り文字倍率','number','min=".2" max="3" step=".1"')}</div>`;
  }
  fields.innerHTML += label('spineColor','枠線・文字色','color');
  syncAxisEditor(); enhanceColorInputs(); $('#axis-editor').showModal();
}
function syncAxisEditor() {
  const fields = $('#axis-editor-fields'), axis = fields.dataset.axisName;
  for (const [mode,keys] of [['range',['Min','Max']],['ticks',['Step']]]) {
    const checkbox = fields.querySelector(`[data-axis-auto="${mode}"]`); if (!checkbox) continue;
    for (const key of keys) fields.querySelector(`[data-axis="${axis}${key}"]`).disabled = checkbox.checked;
  }
}
$('#axis-editor-fields').addEventListener('input', event => {
  const fields = $('#axis-editor-fields'), axis = fields.dataset.axisName, input = event.target;
  if (input.dataset.axisAuto) {
    const keys = input.dataset.axisAuto === 'range' ? ['Min','Max'] : ['Step'];
    keys.forEach((key,i) => {
      config.axes[`${axis}${key}`] = input.checked ? '' : String(key === 'Step' ? Math.abs(figureResult[`${axis}Range`][1]-figureResult[`${axis}Range`][0])/5 : figureResult[`${axis}Range`][i]);
      $$(`[data-axis="${axis}${key}"]`).forEach(field => field.value = config.axes[`${axis}${key}`]);
    }); syncAxisEditor(); changed();
  } else if (input.dataset.axis) {
    // A partial manual position must never make the plot disappear while typing.
    if (/^[xy]Label[XY]$/.test(input.dataset.axis) && input.value !== '') {
      const other = `${axis}Label${input.dataset.axis.endsWith('X')?'Y':'X'}`;
      if(config.axes[other] === '') {config.axes[other] = String(figureResult.geometry.axisLabels?.find(label => label.axis === axis)?.anchor[other.endsWith('X')?0:1] ?? 0); fields.querySelector(`[data-axis="${other}"]`).value = config.axes[other];}
    }
    if (/^[xy]Label[XY]$/.test(input.dataset.axis) && input.value === '') config.axes[`${axis}LabelX`] = config.axes[`${axis}LabelY`] = '';
    applyControlInput(event);
    if (/^[xy]LabelPad$/.test(input.dataset.axis) || /^[xy]Label[XY]$/.test(input.dataset.axis)) {
      for (const key of ['LabelX','LabelY']) fields.querySelector(`[data-axis="${axis}${key}"]`).value = config.axes[`${axis}${key}`];
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

function drawPresetOptions() {
  const type=config.plotType || "General", options=config.options ||= {};
  const number=(key,label,def,min=0,max=100,step=.1)=>`<label>${label}<input data-option="${key}" type="number" value="${escapeHTML(options[key] ?? def)}" min="${min}" max="${max}" step="${step}"></label>`;
  const color=(key,label,def)=>`<label>${label}<input data-option="${key}" value="${escapeHTML(options[key] ?? def)}"></label>`;
  let html='';
  const notes={"XPS Fit":"Python版と同じCSV/Au 10列/Ag 8列の配置を自動判定。成分の塗りつぶしは背景との差で描画します。", "Particle Histogram":"選択した粒径列から頻度%と対数正規分布を描画します。ビン幅20 nmはPython版と同じです。", "Raman 3D":"共通のX列と各Y列からウォーターフォールを作成します。Y軸設定は強度（Z軸）に適用します。", "bar_graph_general":"数値X・カテゴリXに対応した集合棒グラフです。", "Roughness":"線＋マーカー、Y対数軸が初期設定です。"};
  $("#preset-note").textContent=notes[type] || "Python版の描画コード・軸ラベル・単位を使用します。";
  if(type==='bar_graph_general') html=`<div class="field-grid">${number('barWidth','棒幅',.8,.01,100)}${number('barAlpha','不透明度',.9,0,1)}${number('barEdgeWidth','縁幅 (pt)',.4,0,20)}${color('barEdgeColor','縁色 (auto / #色)','auto')}</div>`;
  if(type==='Particle Histogram') html=`<label>粒径列<select data-option="diameterColumn">${columnOptions(options.diameterColumn ?? config.series[0]?.y ?? 1)}</select></label>`;
  if(type==='Raman 3D') html=`<label><input type="checkbox" data-option="normalize" ${options.normalize!==false?'checked':''}>各系列を0〜1に正規化</label><div class="field-grid">${number('depthStep','奥行き間隔',1,.01,10000)}${number('elevation','仰角 (度)',24,-180,180,1)}${number('azimuth','方位角 (度)',-66,-360,360,1)}</div>`;
  if(type==='XPS Fit') {
    if(!options.fills?.length && metadata?.columns.length>=8){
      const csv=metadata.xpsCSV, large=metadata.columns.length>=10;
      const indices=csv?Array.from({length:metadata.columns.length-7},(_,i)=>i+7):large?[6,7,8,9]:[3,4];
      options.fills=indices.map((upper,i)=>({x:csv||!large?0:3,upper,lower:csv?3:large?5:2,color:['#F7574A','#56B2FF','#FF9822','#5BCC77'][i%4],alpha:.3}));
    }
    html=`<div class="field-grid">${number('scatterSize','散布面積 (pt²)',18,0,500,1)}${number('scatterEdgeWidth','散布縁幅 (pt)',.6,0,20)}${color('scatterEdgeColor','散布縁色','#2A2A2A')}${color('scatterFaceColor','散布塗り色','#ffffff')}${number('scatterAlpha','散布不透明度',.8,0,1)}${color('fitLineColor','fit線色','#2A2A2A')}${number('fitLineWidth','fit線幅 (0=非表示)',0,0,20)}${color('bgLineColor','背景線色','#8A8A8A')}${number('bgLineWidth','背景線幅 (0=非表示)',0,0,20)}</div>`;
    html+=(options.fills || []).map((fill,index)=>`<details data-fill-index="${index}"><summary>成分 ${index+1}</summary><div class="field-grid">${[['x','X'],['upper','成分Y'],['lower','背景Y']].map(([key,label])=>`<label>${label}<select data-fill="${key}" ${metadata.xpsCSV?'disabled':''}>${columnOptions(fill[key])}</select></label>`).join('')}<label>色<input type="color" data-fill="color" value="${escapeHTML(fill.color)}"></label><label>不透明度<input type="number" data-fill="alpha" min="0" max="1" step=".05" value="${fill.alpha}"></label></div><button type="button" class="button quiet" data-remove-fill="${index}" ${metadata.xpsCSV?'disabled':''}>成分を削除</button></details>`).join('');
    if(!metadata.xpsCSV) html+='<button type="button" class="button quiet" id="add-fill">成分を追加</button>';
  }
  $("#preset-options").innerHTML=html;
  enhanceColorInputs();
  document.querySelector('.preview-footer > span').textContent=`PlotLauncher Web · ${presets.find(preset=>preset.id===type)?.label || type}`;
  document.querySelector('#axes-title').textContent=presets.find(preset=>preset.id===type)?.label || type;
}

$("#plot-type").addEventListener("change",event=>{
  applyPreset(config,presets.find(item=>item.id===event.target.value));
  if(!['General','Roughness'].includes(config.plotType))config.series.forEach(item=>{item.mode='line';item.errorMode='none';});
  if(config.plotType==='Raman 3D') config.series=metadata.columns.slice(1,33).map((col,i)=>createSeries(0,col.index,col.name,i));
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
  const visibleSeries=xpsFit?config.series.slice(0,1):config.series;
  $("#series-count").textContent = xpsFit?'実測点':`${visibleSeries.length} 系列`;
  $("#series-list").innerHTML = visibleSeries.map((series, index) => {
    const input = (key, label, attributes = '') => `<label>${label}<input data-series-field="${key}" type="number" value="${escapeHTML(series[key])}" ${attributes}></label>`;
    return `<div class="series-card" data-series-index="${index}">
      <div class="series-heading">${xpsFit?'実測点の列':`<input data-series-field="color" type="color" value="${escapeHTML(series.color)}" aria-label="系列${index + 1}の色"><input class="series-label" data-series-field="name" value="${escapeHTML(series.name)}" maxlength="200" aria-label="系列${index + 1}の名前"><button type="button" class="icon-button" data-remove="${index}" aria-label="系列${index + 1}を削除"><svg><use href="#i-close"/></svg></button>`}</div>
      <div class="field-grid"><label>X列<select data-series-field="x">${columnOptions(series.x)}</select></label><label>Y列<select data-series-field="y">${columnOptions(series.y)}</select></label></div>
      <div class="annotation-buttons"><button type="button" class="button quiet" data-series-up="${index}" ${index===0?'disabled':''}>↑</button><button type="button" class="button quiet" data-series-down="${index}" ${index===config.series.length-1?'disabled':''}>↓</button><button type="button" class="button quiet" data-series-copy="${index}">複製</button></div><details class="series-advanced"><summary>線・マーカー・誤差</summary>
        <label class="draw-mode">描画方法<select data-series-field="mode">${choiceOptions([["line", "線"], ["scatter", "マーカー"], ["line+scatter", "線とマーカー"]], series.mode)}</select></label>
        <div class="field-grid">${input("lineWidth", "線幅 (pt)", 'min="0" max="6" step="0.1"')}<label>線種<select data-series-field="lineStyle">${choiceOptions([["-", "実線"], ["--", "破線"], ["-.", "一点鎖線"], [":", "点線"]], series.lineStyle)}</select></label></div>
        <div class="field-grid"><label>マーカー<select data-series-field="marker">${choiceOptions([["o", "丸"], ["s", "四角"], ["^", "三角 ▲"], ["v", "三角 ▼"], ["D", "ひし形"], ["+", "+"], ["x", "×"], ["*", "星"], ["p", "五角形"], ["h", "六角形"]], series.marker)}</select></label>${input("markerSize", "マーカー面積 (pt²)", 'min="1" max="200" step="1"')}</div>
        <div class="field-grid">${input("xOffset", "Xオフセット", 'step="any"')}${input("yOffset", "Yオフセット", 'step="any"')}</div>
        <div class="field-grid"><label>マーカー色<input data-series-field="scatterColor" value="${escapeHTML(series.scatterColor)}" placeholder="auto / #色"></label>${input("lineAlpha", "線の不透明度", 'min="0" max="1" step="0.1"')}<label>マーカー縁色<input data-series-field="markerEdgeColor" value="${escapeHTML(series.markerEdgeColor)}" placeholder="auto / none / #色"></label><label>マーカー塗り色<input data-series-field="markerFaceColor" value="${escapeHTML(series.markerFaceColor)}" placeholder="auto / none / #色"></label>${input("markerEdgeAlpha", "縁の不透明度", 'min="0" max="1" step="0.1"')}${input("markerFaceAlpha", "塗りの不透明度", 'min="0" max="1" step="0.1"')}</div>
        <label class="draw-mode">誤差の種類<select data-series-field="errorMode">${choiceOptions([["auto", "±列から自動"], ["none", "なし"], ["symmetric", "±値"], ["minmax", "最小・最大値"]], series.errorMode)}</select></label>
        <label class="draw-mode">Y誤差（±）の列<select data-series-field="error">${columnOptions(series.error, true)}</select></label>
        <div class="field-grid"><label>Y誤差最小値<select data-series-field="errorMin">${columnOptions(series.errorMin, true)}</select></label><label>Y誤差最大値<select data-series-field="errorMax">${columnOptions(series.errorMax, true)}</select></label></div>
      </details></div>`;
  }).join("") || '<p class="empty-series">「系列を追加」でX列とY列を選んでください。</p>';
  $$('[data-axis]').forEach(input => {
    const value = config.axes[input.dataset.axis];
    if (input.type === "checkbox") input.checked = Boolean(value);
    else input.value = value;
  });
  const generic=['General','Roughness'].includes(config.plotType || 'General');
  const markerFields=['mode','marker','markerSize','scatterColor','markerEdgeColor','markerFaceColor','markerEdgeAlpha','markerFaceAlpha','lineStyle','lineAlpha','error','errorMode','errorMin','errorMax'];
  $$('[data-series-field]').forEach(input=>{if(markerFields.includes(input.dataset.seriesField))input.closest('label').hidden=!generic;});
  const seriesSection=$('#series-list').closest('.control-section');if(seriesSection)seriesSection.hidden=config.plotType==='Particle Histogram';
  $('#add-series').hidden=config.plotType==='XPS Fit';
  $('#series-colormap').hidden=xpsFit;
  $('#series-batch').hidden=xpsFit;
  if(config.plotType==='XPS Fit')$$('.series-advanced,.series-card .annotation-buttons').forEach(element=>element.hidden=true);
  if(config.plotType==='Raman 3D')$$('[data-series-field="lineWidth"]').forEach(input=>input.closest('label').hidden=true);
  updateButtons();
  drawAnnotations();
  enhanceColorInputs();
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

async function loadFile(file, isSample = false, reload = false) {
  if (loading || exporting || !engineReady) return;
  if (!reload && (!/\.(xlsx|xlsm|xls|csv)$/i.test(file.name) || file.size > 30 * 1024 * 1024)) {
    status("30 MB以内のExcel（.xlsx / .xlsm / .xls）またはCSVを選んでください。", "error");
    return;
  }
  const headerRow = reload ? Number($("#header-row").value) : 1;
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
    const args = { filename, headerRow, sheetIndex: reload ? Number($("#sheet-select").value) : 0 };
    if (!reload) args.bytes = await file.arrayBuffer();
    const previous = metadata;
    metadata = await request("load", args);
    loadedHeader = metadata.headerRow || headerRow;
    sample = reload ? sample : isSample;
    // Retain settings if the same columns are still present after a sheet/header change.
    let retained;
    if (reload && previous && config.series.length) {
      try { retained = restoreSettings(makeSettings(config, previous, headerRow), metadata); } catch {}
    }
    const numeric = metadata.columns.filter(column => column.numeric > 0);
    const inferred=metadata.plotType || 'General';
    const x = inferred==='bar_graph_general'?0:numeric[0]?.index ?? 0, y = (inferred==='bar_graph_general'?numeric[0]:numeric[1])?.index ?? Math.min(1, metadata.columns.length - 1);
    config = retained || { axes: defaultAxes(), plotType: inferred, options: {}, series: metadata.columns.length >= 2 ? [createSeries(x, y, metadata.columns[y].name)] : [] };
    if(!retained){
      applyPreset(config,presets.find(item=>item.id===inferred));
      if(inferred==='XPS Fit')config.series=[createSeries(0,1,metadata.columns[1]?.name || 'Raw')];
      if(['Raman 3D','Raman Spectrum','EDX','XPS Survey','XPS Core','Roughness'].includes(inferred))config.series=metadata.columns.slice(1,33).map((col,i)=>createSeries(0,col.index,col.name,i));
      if(['CV/LSV','CA','CP'].includes(inferred))config.series=metadata.columns.filter((col,i)=>i%2===1).slice(0,32).map((col,i)=>createSeries(col.index-1,col.index,col.name,i));
      if(inferred==='Roughness')config.series.forEach(item=>item.mode='line+scatter');
      if(inferred==='Particle Histogram')config.options.diameterColumn=Math.min(2,metadata.columns.length-1);
    }
    if (sample && !reload) {
      config.series = metadata.columns.slice(1).map((column, index) => createSeries(0, column.index, column.name, index));
      config.axes.xLabel = "Potential"; config.axes.xUnit = "V";
      config.axes.yLabel = "Current density"; config.axes.yUnit = "mA/cm^2";
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
  } catch (error) {
    status(`読み込みに失敗しました: ${error.message}`, "error");
    // The worker retains the previous data when a load fails.
    if (metadata) drawMetadata();
  } finally {
    loading = false;
    updateButtons();
    if (renderWanted) renderPreview();
  }
}

function loadSample() {
  return loadFile(new File([sampleCSV()], "sample.csv", { type: "text/csv" }), true);
}

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
    if(result.statistics)$('#preset-note').textContent=`粒径の統計（Python版と同じ）：D50 = ${result.statistics.median.toFixed(3)}、平均 = ${result.statistics.mean.toFixed(3)}。ビン幅20 nm、頻度%。`;
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

async function exportFigure(format) {
  if (exporting || loading || renderedRevision !== revision) return;
  exporting = true;
  const filename = `${safeStem($("#save-name").value)}.${format}`;
  updateButtons();
  status(`${format.toUpperCase()}ファイルを作成しています…`);
  try {
    const result = await request("export", { config: structuredClone(config), format, dpi: Number($("#png-dpi").value) });
    const bytes = Uint8Array.from(atob(result.base64), character => character.charCodeAt(0));
    download(new Blob([bytes], { type: { svg: "image/svg+xml", png: "image/png", pdf: "application/pdf", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }[format] }), filename);
    status(`${filename} を保存しました`, "ready");
  } catch (error) { status(error.message, "error"); }
  finally { exporting = false; updateButtons(); }
}

$("#data-file").addEventListener("change", event => { const file = event.target.files[0]; event.target.value = ""; if (file) loadFile(file); });
$("#drop-zone").addEventListener("click", () => $("#data-file").click());
for (const type of ["dragenter", "dragover"]) $("#drop-zone").addEventListener(type, event => { event.preventDefault(); if (!event.currentTarget.disabled) event.currentTarget.classList.add("drag-over"); });
$("#drop-zone").addEventListener("dragleave", event => event.currentTarget.classList.remove("drag-over"));
$("#drop-zone").addEventListener("drop", event => { event.preventDefault();event.stopPropagation();event.currentTarget.classList.remove("drag-over"); const file=event.dataTransfer.files[0];if(!event.currentTarget.disabled && file){if(/\.json$/i.test(file.name))readSettings(file);else loadFile(file);} });
// Dropping a file elsewhere must not navigate away and discard the settings.
window.addEventListener("dragover", event => event.preventDefault());
window.addEventListener("drop", event => {event.preventDefault();const file=event.dataTransfer.files[0];if(file && /\.json$/i.test(file.name))readSettings(file);});
$("#sample-data").addEventListener("click", loadSample);
$("#sheet-select").addEventListener("change", () => loadFile(null, false, true));
$("#header-row").addEventListener("change", () => loadFile(null, false, true));
$("#plot-form").addEventListener("submit", event => event.preventDefault());
function applyControlInput(event) {
  const input = event.target;
  if (input.dataset.axis) {
    const key = input.dataset.axis;
    config.axes[key] = input.type === "checkbox" ? input.checked : input.value;
    if (/^[xy]LabelPad$/.test(key)) config.axes[`${key[0]}LabelX`] = config.axes[`${key[0]}LabelY`] = "";
    $$(`#plot-form [data-axis="${key}"]`).forEach(field => {if(field !== input) {field.value = input.value; field.checked = input.checked;}});
  }
  else if (input.dataset.seriesField) {
    const item = config.series[Number(input.closest("[data-series-index]").dataset.seriesIndex)];
    item[input.dataset.seriesField] = input.value;
  } else if (input.dataset.annotationField) {
    const item = config.annotations[Number(input.closest("[data-annotation-index]").dataset.annotationIndex)];
    item[input.dataset.annotationField] = input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) : input.value;
  } else if (input.dataset.option) {
    config.options ||= {}; config.options[input.dataset.option] = input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) : input.value;
  } else if (input.dataset.fill) {
    const fill=config.options.fills[Number(input.closest('[data-fill-index]').dataset.fillIndex)];
    fill[input.dataset.fill]=input.type === "number" || input.tagName === "SELECT"?Number(input.value):input.value;
  } else return;
  changed();
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
$$('[data-export]').forEach(button => button.addEventListener("click", () => exportFigure(button.dataset.export)));
$("#copy-image").addEventListener("click", copyFigureImage);
$("#save-settings").addEventListener("click", () => {
  download(new Blob([JSON.stringify(makeSettings(config, metadata, loadedHeader), null, 2)], { type: "application/json" }), `${safeStem($("#save-name").value)}.plot.json`);
  status("設定JSONを保存しました。データ自体は含まれていません。", "ready");
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
      const result = await request("font", { bytes: await file.arrayBuffer() });
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

function positionInteractions() {
  const overlay = $("#figure-interactions"), image = $("#figure-image");
  overlay.replaceChildren();
  if (!figureResult || image.hidden || !image.naturalWidth) return;
  const imageBox = image.getBoundingClientRect();
  const hitSize = 24;
  Object.assign(overlay.style, {left:'0',top:'0',width:'100%',height:'100%'});
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
    button.title=target.axis ? `${target.axis.toUpperCase()}軸${target.kind === 'label' ? 'ラベル：ドラッグで移動・ダブルクリックで設定' : '目盛り：ダブルクリックで設定'}` : target.id==="legend"?"凡例をドラッグして移動":"注釈をドラッグして移動";
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
  if(item?.locked || (item && !selected.has(id))){positionInteractions();return;}
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
    if(d.axis)event.target.style.transform='';else positionInteractions();
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
      for(const key of keys)item[key]=shiftCoordinate(start[key],key.startsWith('x')?dx:dy,figureResult[`${key[0]}Range`],config.axes[`${key[0]}Scale`],start.coordinate_system);
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
    for(const key of item.type==='text'?['x','y']:['x1','y1','x2','y2'])item[key]=shiftCoordinate(item[key],.025,figureResult?.[`${key[0]}Range`]||[0,1],config.axes[`${key[0]}Scale`],item.coordinate_system);
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
  if(event.target.closest('[data-drag-id],[data-edit-axis]') || event.button!==0)return;
  if(!event.shiftKey)selected.clear();drawAnnotations();positionInteractions();panning={pointerId:event.pointerId,x:event.clientX,y:event.clientY,start:{...view},select:event.shiftKey};event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault();
});
$("#figure-paper").addEventListener('pointermove',event=>{
  if(!panning || panning.pointerId !== event.pointerId)return;
  if(panning.select){const box=event.currentTarget.getBoundingClientRect();let marquee=$('#selection-marquee');if(!marquee){marquee=document.createElement('div');marquee.id='selection-marquee';event.currentTarget.append(marquee);}Object.assign(marquee.style,{left:`${Math.min(event.clientX,panning.x)-box.left}px`,top:`${Math.min(event.clientY,panning.y)-box.top}px`,width:`${Math.abs(event.clientX-panning.x)}px`,height:`${Math.abs(event.clientY-panning.y)}px`});return;}
  view={...panning.start,x:panning.start.x+event.clientX-panning.x,y:panning.start.y+event.clientY-panning.y};layoutPreview();
});
$("#figure-paper").addEventListener('pointerup',event=>{
  if((panning && panning.pointerId !== event.pointerId))return;
  if(panning?.select && figureResult){const box=$('#figure-image').getBoundingClientRect(),left=Math.min(event.clientX,panning.x),right=Math.max(event.clientX,panning.x),top=Math.min(event.clientY,panning.y),bottom=Math.max(event.clientY,panning.y);for(const item of figureResult.geometry.annotations){const [x,y,w,h]=item.box;if(box.left+x*box.width>=left && box.left+(x+w)*box.width<=right && box.top+y*box.height>=top && box.top+(y+h)*box.height<=bottom)selected.add(item.id);}drawAnnotations();positionInteractions();}
  $('#selection-marquee')?.remove();panning=null;
});
$("#figure-paper").addEventListener('pointercancel',()=>{$('#selection-marquee')?.remove();panning=null;});
$("#figure-interactions").addEventListener('dblclick',event=>{
  const axis = event.target.closest('[data-edit-axis]');
  if(axis) {event.preventDefault();openAxisEditor(axis.dataset.editAxis,axis.dataset.axisKind);return;}
  const target=event.target.closest('[data-drag-id]');if(!target || target.dataset.dragId==='legend')return;
  selectAnnotation(target.dataset.dragId);const index=(config.annotations||[]).findIndex(item=>item.id===target.dataset.dragId);
  const field=$(`[data-annotation-index="${index}"] input[data-annotation-field="text"]`);field?.focus();field?.select();
});
$("#figure-interactions").addEventListener('keydown',event=>{
  const axis=event.target.closest('[data-edit-axis]');
  if(axis && (event.key==='Enter' || event.key===' ')){event.preventDefault();openAxisEditor(axis.dataset.editAxis,axis.dataset.axisKind);}
});
window.addEventListener('keydown',event=>{
  if($('#color-panel').open || $('#axis-editor').open)return;
  if(event.target.matches('input,textarea,select') || event.target.isContentEditable)return;
  const control=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();
  if(key==='delete'||key==='backspace'){if(selected.size){event.preventDefault();deleteAnnotations();}}
  else if(key==='escape'){selected.clear();drawAnnotations();positionInteractions();}
  else if(control&&key==='c'){if(selected.size){event.preventDefault();copyAnnotations();}}
  else if(control&&key==='a'){event.preventDefault();selected=new Set((config.annotations||[]).filter(item=>item.visible).map(item=>item.id));drawAnnotations();positionInteractions();}
  else if(control&&key==='v'){if(clipboard.length){event.preventDefault();pasteAnnotations();}}
  else if(control&&key==='z'){event.preventDefault();restoreHistory(event.shiftKey);}
  else if(control&&key==='y'){event.preventDefault();restoreHistory(true);}
  else if(control&&['+','=','-','0'].includes(key)){event.preventDefault();if(key==='0')$('#zoom-reset').click();else zoomPreview(key==='-'?1/1.1:1.1);}
  else if(control&&key==='s'){event.preventDefault();$('#save-settings').click();}
  else if(control&&key==='o'){event.preventDefault();$('#open-settings').click();}
});
try { startWorker(); }
catch (error) { fatal(`描画機能を開始できませんでした。ブラウザを更新してください。${error.message}`); }
