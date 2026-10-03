import { restoreSettings } from "./state.js?v=0cc132bfdf16";
// All user data stays in this worker's in-memory filesystem.
const PYODIDE_VERSION = "0.29.3";
const INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
let pyodide, dispatch, currentPath = "", uploadNumber = 0;

function progress(text) { self.postMessage({ type: "progress", text }); }
async function fetchAsset(relative, binary = false) {
  const response = await fetch(new URL(relative + new URL(import.meta.url).search, import.meta.url));
  if (!response.ok) throw new Error(`必要なファイルを読み込めませんでした (${response.status}): ${relative}`);
  return binary ? new Uint8Array(await response.arrayBuffer()) : response.text();
}

async function initialize() {
  progress("描画機能を準備しています…");
  const { loadPyodide } = await import(`${INDEX_URL}pyodide.mjs`);
  pyodide = await loadPyodide({ indexURL: INDEX_URL, stdout: () => {}, stderr: text => console.warn(text) });
  progress("数値計算・グラフの機能を読み込んでいます…");
  await pyodide.loadPackage(["numpy", "pandas", "matplotlib", "micropip"]);
  progress("Excel読み込みの機能を準備しています…");
  await pyodide.runPythonAsync("import micropip\nawait micropip.install(['openpyxl==3.1.5', 'xlrd==2.0.2'])");
  progress("日本語フォントと描画設定を読み込んでいます…");
  const files = await Promise.all([
    fetchAsset("./python/engine.py"), fetchAsset("./python/plot_utils.py"),
    fetchAsset("./python/generic_xy_base.py"), fetchAsset("./assets/fonts/NotoSansJP.ttf", true),
    ...["Regular", "Bold", "Italic", "BoldItalic"].map(style => fetchAsset(`./assets/fonts/LiberationSans-${style}.ttf`, true)),
    fetchAsset("./python/annotation_model.py"), fetchAsset("./python/annotation_manager.py"),
  ]);
  pyodide.FS.mkdirTree("/app/python");
  pyodide.FS.mkdirTree("/data");
  ["engine.py", "plot_utils.py", "generic_xy_base.py"].forEach((name, index) => pyodide.FS.writeFile(`/app/python/${name}`, files[index]));
  pyodide.FS.writeFile("/app/NotoSansJP.ttf", files[3]);
  ["Regular", "Bold", "Italic", "BoldItalic"].forEach((style, index) => pyodide.FS.writeFile(`/app/LiberationSans-${style}.ttf`, files[4 + index]));
  ["annotation_model.py", "annotation_manager.py"].forEach((name, index) => pyodide.FS.writeFile(`/app/python/${name}`, files[8 + index]));
  const catalog = JSON.parse(await fetchAsset("./presets.json"));
  pyodide.FS.writeFile("/app/presets.json", JSON.stringify(catalog));
  pyodide.FS.mkdirTree("/app/assets");
  pyodide.FS.writeFile("/app/assets/plot-template.pptx", await fetchAsset("./assets/plot-template.pptx", true));
  await Promise.all([...new Set([...catalog.map(preset => preset.script), "xps_csv.py", "desktop_defaults.py"])].map(async name => {
    pyodide.FS.writeFile(`/app/python/${name}`, await fetchAsset(`./python/${name}`));
  }));
  await pyodide.runPythonAsync("import sys\nsys.path.insert(0, '/app/python')\nfrom engine import PlotEngine\n_engine = PlotEngine('/app/python', '/app/NotoSansJP.ttf')\n_dispatch = _engine.dispatch");
  dispatch = pyodide.globals.get("_dispatch");
  self.postMessage({ type: "ready" });
}

const ready = initialize().catch(error => {
  self.postMessage({ type: "fatal", error: "描画機能の読み込みに失敗しました。インターネット接続を確認して、再読み込みしてください。", detail: String(error) });
  throw error;
});
ready.catch(() => {});
// Serialize operations so a later render cannot race an Excel load or export.
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.catch(() => {}).then(async () => {
    const { id, operation, args } = data;
    let uploadPath, projectSnapshot = false;
    const projectFonts = [];
    try {
      await ready;
      let payload = args;
      if (operation === "project") {
        pyodide.runPython("from matplotlib import font_manager\n_project_previous = dict(_engine.__dict__)\n_project_previous['font_families'] = set(_engine.font_families)\n_project_fonts = list(font_manager.fontManager.ttflist)");
        projectSnapshot = true;
      }
      if (operation === "load" || operation === "project") {
        const extension = args.filename.split(".").pop().toLowerCase();
        if (!["xlsx", "xlsm", "xls", "csv"].includes(extension)) throw new Error("ExcelまたはCSVファイルを選んでください。");
        if (args.bytes) {
          uploadPath = `/data/upload-${++uploadNumber}.${extension}`;
          pyodide.FS.writeFile(uploadPath, new Uint8Array(args.bytes));
        }
        payload = { path: uploadPath || currentPath, filename: args.filename, sheet_index: args.sheetIndex ?? 0, header_row: args.headerRow ?? 1 };
      }
      if (operation === "font") {
        const path = `/app/user-font-${++uploadNumber}.ttf`;
        pyodide.FS.writeFile(path, new Uint8Array(args.bytes));
        payload = { path };
      }
      let result = JSON.parse(dispatch(operation === "project" ? "load" : operation, JSON.stringify(payload)));
      if (operation === "project") {
        if (result.sheets[result.sheetIndex] !== args.settings.data.sheet) throw new Error("プロジェクトのシートが設定と一致しません。");
        const config = restoreSettings(args.settings, result), families = [];
        for (const font of args.fonts) {
          const path = `/app/user-font-${++uploadNumber}.ttf`;
          projectFonts.push(path); pyodide.FS.writeFile(path, new Uint8Array(font.bytes));
          const registered = JSON.parse(dispatch("font", JSON.stringify({path})));
          if (registered.family !== font.family) throw new Error("プロジェクトのフォントが設定と一致しません。");
          families.push(registered.family);
        }
        result = {metadata:result, config, families};
      }
      if (uploadPath) {
        if (currentPath) pyodide.FS.unlink(currentPath);
        currentPath = uploadPath;
      }
      self.postMessage({ type: "result", id, result });
    } catch (error) {
      if (projectSnapshot) pyodide.runPython("_engine.__dict__.clear()\n_engine.__dict__.update(_project_previous)\nfont_manager.fontManager.ttflist = _project_fonts\nfont_manager.fontManager._findfont_cached.cache_clear()");
      for (const path of projectFonts) { try { pyodide.FS.unlink(path); } catch {} }
      if (uploadPath) { try { pyodide.FS.unlink(uploadPath); } catch {} }
      const text = String(error);
      const message = text.split("\n").filter(Boolean).pop().replace(/^(ValueError|RuntimeError|IndexError|EmptyDataError|ParserError):\s*/, "");
      self.postMessage({ type: "error", id, error: message, detail: text });
    } finally {
      if (projectSnapshot) pyodide.runPython("del _project_previous, _project_fonts");
    }
  });
};
