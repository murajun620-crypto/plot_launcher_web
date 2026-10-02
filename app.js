import { createSeries, defaultAxes, makeSettings, restoreSettings, safeStem, sampleCSV } from "./state.js?v=44af9d23f892";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escapeHTML = text => String(text).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
let worker, engineReady = false, requestID = 0;
const requests = new Map();
let metadata = null, config = { axes: defaultAxes(), series: [] };
let loading = false, exporting = false, sample = false, loadedHeader = 1;
let revision = 0, renderedRevision = -1, renderRunning = false, renderWanted = false, renderTimer;
let previewURL, figureResult, dragging;
const loadedFonts = new Set(["Liberation Sans", "Noto Sans JP", "DejaVu Sans"]);

function desktopAppearance() {
  const numeric = (key, label, min = 0, max = 3, step = 0.1) => `<label>${label}<input data-axis="${key}" type="number" min="${min}" max="${max}" step="${step}"></label>`;
  const check = (key, label) => `<label><input data-axis="${key}" type="checkbox">${label}</label>`;
  $("#desktop-appearance").innerHTML = `
    <label class="full-field">図のフォント<select id="font-family" data-axis="fontFamily"><option>Liberation Sans</option><option>Noto Sans JP</option><option>DejaVu Sans</option></select></label>
    <label class="full-field">日本語フォント<select id="japanese-font-family" data-axis="japaneseFontFamily"><option>Noto Sans JP</option><option>Liberation Sans</option><option>DejaVu Sans</option></select></label>
    <button type="button" id="load-font" class="button quiet">手元のフォントを読み込む</button><input id="font-file" type="file" accept=".ttf,.otf" multiple hidden>
    <p class="field-hint">Python版のArialと同じ字形には、手元のArialを読み込んでください。標準のLiberation SansはArialと文字幅が互換です。日本語はNoto Sans JP、数式はSTIX Sansを使います。</p>
    <div class="field-grid">${numeric("tickFontScale", "目盛り文字倍率", .2)}${numeric("labelFontScale", "軸ラベル倍率", .2)}${numeric("spineScale", "枠線倍率", .1, 5)}${numeric("tickLength", "目盛り長さ倍率", 0, 5)}</div>
    <p class="field-hint">倍率1：目盛り7 pt、軸ラベル8 pt、枠線0.8 pt、主目盛り2.5 pt・副目盛り1.25 pt。</p>
    <details><summary>余白・軸の表示</summary>
    <div class="field-grid">${numeric("xLabelPad", "Xラベル余白 (pt)", -30, 100)}${numeric("yLabelPad", "Yラベル余白 (pt)", -30, 100)}${numeric("xTickPad", "X目盛り追加余白 (pt)", -30, 100)}${numeric("yTickPad", "Y目盛り追加余白 (pt)", -30, 100)}</div>
    <div class="field-grid"><label>X対数表記<select data-axis="xLogFormat"><option value="power">累乗</option><option value="decimal">小数</option></select></label><label>Y対数表記<select data-axis="yLogFormat"><option value="power">累乗</option><option value="decimal">小数</option></select></label></div>
    <div class="check-options">${check("hideXLabel", "Xラベルを隠す")}${check("hideYLabel", "Yラベルを隠す")}${check("hideXTickLabels", "X目盛り文字を隠す")}${check("hideYTickLabels", "Y目盛り文字を隠す")}${check("hideXTicks", "X目盛り線を隠す")}${check("hideYTicks", "Y目盛り線を隠す")}${check("hideMinorTicks", "副目盛りを隠す")}${check("spineLeft", "左枠")}${check("spineRight", "右枠")}${check("spineTop", "上枠")}${check("spineBottom", "下枠")}${check("yAxisRight", "Y軸を右側")}${check("xAxisTop", "X軸を上側")}</div></details>
    <details><summary>凡例・背景・誤差棒</summary><p class="field-hint">凡例は図上でドラッグして移動できます。位置を自動に戻す場合はX・Yを両方空欄にします。</p>
    <div class="field-grid">${numeric("legendScale", "凡例サイズ倍率", .2)}${numeric("legendFontScale", "凡例文字倍率", .2)}${numeric("legendX", "凡例X (軸比率)", -10, 10, .01)}${numeric("legendY", "凡例Y (軸比率)", -10, 10, .01)}<label>枠線色<input data-axis="spineColor" type="color"></label><label>背景色<input data-axis="backgroundColor" type="color"></label>${numeric("backgroundAlpha", "背景不透明度", 0, 1)}${numeric("markerEdgeWidth", "マーカー縁幅 (pt)", 0, 20)}${numeric("errorLineWidth", "誤差棒幅 (pt)", 0, 20)}${numeric("errorCapSize", "誤差キャップ (pt)", 0, 20)}${numeric("errorCapThick", "キャップ幅 (pt)", 0, 20)}</div></details>`;
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
  $("#figure-stage").setAttribute("aria-busy", String(loading || exporting || renderRunning || !engineReady));
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
  worker = new Worker(new URL("./worker.js?v=44af9d23f892", import.meta.url), { type: "module" });
  worker.onmessage = ({ data }) => {
    if (data.type === "progress") status(data.text);
    else if (data.type === "ready") {
      engineReady = true;
      updateButtons();
      loadSample();
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

function drawControls() {
  for (const [selector, key] of [["#font-family", "fontFamily"], ["#japanese-font-family", "japaneseFontFamily"]]) {
    const field = $(selector), family = config.axes[key];
    if (![...field.options].some(option => option.value === family)) field.add(new Option(`${family}（要読み込み）`, family));
  }
  $("#series-count").textContent = `${config.series.length} 系列`;
  $("#series-list").innerHTML = config.series.map((series, index) => {
    const input = (key, label, attributes = '') => `<label>${label}<input data-series-field="${key}" type="number" value="${escapeHTML(series[key])}" ${attributes}></label>`;
    return `<div class="series-card" data-series-index="${index}">
      <div class="series-heading"><input data-series-field="color" type="color" value="${escapeHTML(series.color)}" aria-label="系列${index + 1}の色"><input class="series-label" data-series-field="name" value="${escapeHTML(series.name)}" maxlength="200" aria-label="系列${index + 1}の名前"><button type="button" class="icon-button" data-remove="${index}" aria-label="系列${index + 1}を削除"><svg><use href="#i-close"/></svg></button></div>
      <div class="field-grid"><label>X列<select data-series-field="x">${columnOptions(series.x)}</select></label><label>Y列<select data-series-field="y">${columnOptions(series.y)}</select></label></div>
      <details class="series-advanced"><summary>線・マーカー・誤差</summary>
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
  updateButtons();
  drawAnnotations();
}

function drawAnnotations() {
  $("#annotation-list").innerHTML = (config.annotations || []).map((item, index) => {
    const text = (key, label) => `<label>${label}<input data-annotation-field="${key}" value="${escapeHTML(item[key] ?? '')}"></label>`;
    const num = (key, label) => `<label>${label}<input type="number" step="any" data-annotation-field="${key}" value="${escapeHTML(item[key] ?? '')}"></label>`;
    return `<details class="annotation-card" data-annotation-index="${index}" open><summary>${{text:"文字",arrow:"矢印",segment:"線"}[item.type]} ${index+1}</summary>
      ${item.type === "text" ? text("text", "文字") : ''}
      <div class="field-grid">${item.type === "text" ? num("x", "X") + num("y", "Y") + num("font_size", "文字サイズ (pt)") + num("rotation", "回転 (度)") : num("x1", "始点X") + num("y1", "始点Y") + num("x2", "終点X") + num("y2", "終点Y") + num("line_width", "線幅 (pt)") + text("line_style", "線種 (- / -- / -. / :)")}
      ${item.type === "arrow" ? `<label>矢印<select data-annotation-field="arrow_style">${choiceOptions([["->","片矢印"],["<->","両矢印"],["-|>","塗り矢印"]],item.arrow_style)}</select></label>` + num("arrow_size", "矢印サイズ (pt)") : ''}
      <label>色<input type="color" data-annotation-field="color" value="${escapeHTML(item.color)}"></label>${num("opacity", "不透明度")}<label>座標<select data-annotation-field="coordinate_system">${choiceOptions([["axes_fraction","軸比率（0〜1）"],["data","データ座標"]],item.coordinate_system)}</select></label></div>
      ${item.type === "text" ? `<label>フォント<select data-annotation-field="font_family">${choiceOptions([...loadedFonts].map(name=>[name,escapeHTML(name)]),item.font_family)}</select></label><div class="field-grid"><label>横揃え<select data-annotation-field="horizontal_alignment">${choiceOptions([["left","左"],["center","中央"],["right","右"]],item.horizontal_alignment)}</select></label><label>縦揃え<select data-annotation-field="vertical_alignment">${choiceOptions([["baseline","基準線"],["center","中央"],["top","上"],["bottom","下"]],item.vertical_alignment)}</select></label></div><div class="check-options"><label><input type="checkbox" data-annotation-field="bold" ${item.bold?'checked':''}>太字</label><label><input type="checkbox" data-annotation-field="italic" ${item.italic?'checked':''}>斜体</label></div>` : ''}
      <div class="check-options"><label><input type="checkbox" data-annotation-field="visible" ${item.visible?'checked':''}>表示</label><label><input type="checkbox" data-annotation-field="locked" ${item.locked?'checked':''}>位置を固定</label></div><button type="button" class="button quiet" data-remove-annotation="${index}">削除</button></details>`;
  }).join('');
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
    loadedHeader = headerRow;
    sample = reload ? sample : isSample;
    // Retain settings if the same columns are still present after a sheet/header change.
    let retained;
    if (reload && previous && config.series.length) {
      try { retained = restoreSettings(makeSettings(config, previous, headerRow), metadata); } catch {}
    }
    const numeric = metadata.columns.filter(column => column.numeric > 0);
    const x = numeric[0]?.index ?? 0, y = numeric[1]?.index ?? Math.min(1, metadata.columns.length - 1);
    config = retained || { axes: defaultAxes(), series: metadata.columns.length >= 2 ? [createSeries(x, y, metadata.columns[y].name)] : [] };
    if (sample && !reload) {
      config.series = metadata.columns.slice(1).map((column, index) => createSeries(0, column.index, column.name, index));
      config.axes.xLabel = "Potential"; config.axes.xUnit = "V";
      config.axes.yLabel = "Current density"; config.axes.yUnit = "mA/cm^2";
    }
    if (!reload) $("#save-name").value = safeStem(filename);
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

async function exportFigure(format) {
  if (exporting || loading || renderedRevision !== revision) return;
  exporting = true;
  const filename = `${safeStem($("#save-name").value)}.${format}`;
  updateButtons();
  status(`${format.toUpperCase()}ファイルを作成しています…`);
  try {
    const result = await request("export", { config: structuredClone(config), format, dpi: Number($("#png-dpi").value) });
    const bytes = Uint8Array.from(atob(result.base64), character => character.charCodeAt(0));
    download(new Blob([bytes], { type: { svg: "image/svg+xml", png: "image/png", pdf: "application/pdf" }[format] }), filename);
    status(`${filename} を保存しました`, "ready");
  } catch (error) { status(error.message, "error"); }
  finally { exporting = false; updateButtons(); }
}

$("#data-file").addEventListener("change", event => { const file = event.target.files[0]; event.target.value = ""; if (file) loadFile(file); });
$("#drop-zone").addEventListener("click", () => $("#data-file").click());
for (const type of ["dragenter", "dragover"]) $("#drop-zone").addEventListener(type, event => { event.preventDefault(); if (!event.currentTarget.disabled) event.currentTarget.classList.add("drag-over"); });
$("#drop-zone").addEventListener("dragleave", event => event.currentTarget.classList.remove("drag-over"));
$("#drop-zone").addEventListener("drop", event => { event.preventDefault(); event.currentTarget.classList.remove("drag-over"); if (!event.currentTarget.disabled && event.dataTransfer.files[0]) loadFile(event.dataTransfer.files[0]); });
// Dropping a file elsewhere must not navigate away and discard the settings.
window.addEventListener("dragover", event => event.preventDefault());
window.addEventListener("drop", event => event.preventDefault());
$("#sample-data").addEventListener("click", loadSample);
$("#sheet-select").addEventListener("change", () => loadFile(null, false, true));
$("#header-row").addEventListener("change", () => loadFile(null, false, true));
$("#plot-form").addEventListener("submit", event => event.preventDefault());
$("#plot-form").addEventListener("input", event => {
  const input = event.target;
  if (input.dataset.axis) config.axes[input.dataset.axis] = input.type === "checkbox" ? input.checked : input.value;
  else if (input.dataset.seriesField) {
    const item = config.series[Number(input.closest("[data-series-index]").dataset.seriesIndex)];
    item[input.dataset.seriesField] = input.value;
  } else if (input.dataset.annotationField) {
    const item = config.annotations[Number(input.closest("[data-annotation-index]").dataset.annotationIndex)];
    item[input.dataset.annotationField] = input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) : input.value;
  } else return;
  changed();
});
$("#series-list").addEventListener("click", event => {
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
$("#save-settings").addEventListener("click", () => {
  download(new Blob([JSON.stringify(makeSettings(config, metadata, loadedHeader), null, 2)], { type: "application/json" }), `${safeStem($("#save-name").value)}.plot.json`);
  status("設定JSONを保存しました。データ自体は含まれていません。", "ready");
});
$("#open-settings").addEventListener("click", () => $("#settings-file").click());
$("#settings-file").addEventListener("change", async event => {
  const file = event.target.files[0]; event.target.value = "";
  if (!file) return;
  try {
    if (file.size > 1024 * 1024) throw new Error("設定JSONは1 MB以内のファイルを選んでください。");
    config = restoreSettings(JSON.parse(await file.text()), metadata);
    drawControls(); changed();
  } catch (error) { status(`設定を開けませんでした: ${error.message}`, "error"); }
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
  const base = { id: crypto.randomUUID(), type, axes_id: "primary", coordinate_system: "axes_fraction", visible: true, locked: false, zorder: 20, color: "#222222", opacity: 1 };
  config.annotations.push(type === "text" ? { ...base, x: .15, y: .8, text: "Text", font_size: 7, font_family: config.axes.fontFamily, rotation: 0, horizontal_alignment: "left", vertical_alignment: "baseline", bold: false, italic: false } : { ...base, x1: .2, y1: .7, x2: .4, y2: .7, line_width: .5, line_style: "-", arrow_style: "->", arrow_size: 7 });
  drawAnnotations(); changed();
}));
$("#annotation-list").addEventListener("click", event => {
  const button = event.target.closest('[data-remove-annotation]');
  if (!button) return;
  config.annotations.splice(Number(button.dataset.removeAnnotation), 1); drawAnnotations(); changed();
});

function positionInteractions() {
  const overlay = $("#figure-interactions"), image = $("#figure-image");
  overlay.replaceChildren();
  if (!figureResult || image.hidden || !image.naturalWidth) return;
  const imageBox = image.getBoundingClientRect(), parent = $("#figure-paper").getBoundingClientRect();
  Object.assign(overlay.style, { left: `${imageBox.left-parent.left}px`, top: `${imageBox.top-parent.top}px`, width: `${imageBox.width}px`, height: `${imageBox.height}px` });
  const targets = [...figureResult.geometry.annotations];
  if (figureResult.geometry.legend) targets.push({id:"legend",box:figureResult.geometry.legend});
  for (const target of targets) {
    const item = config.annotations?.find(item => item.id === target.id);
    if (item?.locked) continue;
    const [x,y,w,h]=target.box, button=document.createElement('button');
    button.type="button"; button.className="figure-drag-target"; button.dataset.dragId=target.id;
    button.title=target.id==="legend"?"凡例をドラッグして移動":"注釈をドラッグして移動";
    button.setAttribute('aria-label',button.title);
    Object.assign(button.style,{left:`${x*100}%`,top:`${y*100}%`,width:`${Math.max(w*imageBox.width,12)}px`,height:`${Math.max(h*imageBox.height,12)}px`});
    overlay.append(button);
  }
}
$("#figure-image").addEventListener("load", positionInteractions);
new ResizeObserver(positionInteractions).observe($("#figure-image"));
$("#figure-interactions").addEventListener("pointerdown", event => {
  const target=event.target.closest('[data-drag-id]');
  if(!target || renderedRevision !== revision || loading || exporting || renderRunning) return;
  const id=target.dataset.dragId, item=config.annotations?.find(item=>item.id===id);
  const imageBox=$("#figure-image").getBoundingClientRect();
  dragging={id,item,start:item?structuredClone(item):null,x:event.clientX,y:event.clientY,box:imageBox,axes:figureResult.geometry.axes,legend:figureResult.geometry.legend};
  target.setPointerCapture(event.pointerId); event.preventDefault();
});
$("#figure-interactions").addEventListener("pointermove", event => {
  if(!dragging) return;
  const dx=event.clientX-dragging.x,dy=event.clientY-dragging.y;
  event.target.style.transform=`translate(${dx}px,${dy}px)`;
});
function finishDrag(event) {
  if(!dragging) return;
  const d=dragging; dragging=null;
  const [ax,ay,aw,ah]=d.axes, dx=(event.clientX-d.x)/d.box.width/aw,dy=-(event.clientY-d.y)/d.box.height/ah;
  if(d.id==="legend") {
    const [x,y,w,h]=d.legend;
    config.axes.legendX=((x+w/2-ax)/aw+dx).toFixed(4);
    config.axes.legendY=(1-(y+h/2-ay)/ah+dy).toFixed(4);
    $$('[data-axis="legendX"],[data-axis="legendY"]').forEach(input=>input.value=config.axes[input.dataset.axis]);
  } else {
    const convert=(value,delta,axis)=>{
      if(d.start.coordinate_system==="axes_fraction") return value+delta;
      const [low,high]=figureResult[`${axis}Range`];
      return config.axes[`${axis}Scale`]==="log"?value*Math.exp(delta*(Math.log(high)-Math.log(low))):value+delta*(high-low);
    };
    for(const key of d.start.type==="text"?["x","y"]:["x1","y1","x2","y2"]) d.item[key]=convert(Number(d.start[key]),key.startsWith('x')?dx:dy,key[0]);
    drawAnnotations();
  }
  changed();
}
$("#figure-interactions").addEventListener("pointerup",finishDrag);
$("#figure-interactions").addEventListener("pointercancel",()=>{dragging=null;positionInteractions();});
try { startWorker(); }
catch (error) { fatal(`描画機能を開始できませんでした。ブラウザを更新してください。${error.message}`); }
