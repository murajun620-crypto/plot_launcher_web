import { createSeries, defaultAxes, makeSettings, restoreSettings, safeStem, sampleCSV } from "./state.js";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escapeHTML = text => String(text).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
let worker, engineReady = false, requestID = 0;
const requests = new Map();
let metadata = null, config = { axes: defaultAxes(), series: [] };
let loading = false, exporting = false, sample = false, loadedHeader = 1;
let revision = 0, renderedRevision = -1, renderRunning = false, renderWanted = false, renderTimer;
let previewURL;

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
  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
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
  return choices.map(([value, label]) => `<option value="${value}"${value === selected ? " selected" : ""}>${label}</option>`).join("");
}

function drawControls() {
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
        <label class="draw-mode">Y誤差（±）の列<select data-series-field="error">${columnOptions(series.error, true)}</select></label>
      </details></div>`;
  }).join("") || '<p class="empty-series">「系列を追加」でX列とY列を選んでください。</p>';
  $$('[data-axis]').forEach(input => {
    const value = config.axes[input.dataset.axis];
    if (input.type === "checkbox") input.checked = Boolean(value);
    else input.value = value;
  });
  updateButtons();
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
      config.axes.xLabel = "Potential (V)";
      config.axes.yLabel = "Current density (mA/cm²)";
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
    if (!previewURL) {
      $("#initial-message strong").textContent = "グラフを作成できませんでした";
      $("#initial-message p").textContent = error.message;
    }
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
try { startWorker(); }
catch (error) { fatal(`描画機能を開始できませんでした。ブラウザを更新してください。${error.message}`); }
