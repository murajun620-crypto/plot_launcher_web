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
    let uploadPath;
    try {
      await ready;
      let payload = args;
      if (operation === "load") {
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
      const result = JSON.parse(dispatch(operation, JSON.stringify(payload)));
      if (uploadPath) {
        if (currentPath) pyodide.FS.unlink(currentPath);
        currentPath = uploadPath;
      }
      self.postMessage({ type: "result", id, result });
    } catch (error) {
      if (uploadPath) { try { pyodide.FS.unlink(uploadPath); } catch {} }
      const text = String(error);
      const message = text.split("\n").filter(Boolean).pop().replace(/^(ValueError|RuntimeError|IndexError|EmptyDataError|ParserError):\s*/, "");
      self.postMessage({ type: "error", id, error: message, detail: text });
    }
  });
};
