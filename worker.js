import { APP_VERSION, restoreSettings } from "./state.js?v=88e6604ff6b6";
import { validateTableEdits } from './table-edits.mjs?v=27ae7675c457';
// All user data stays in this worker's in-memory filesystem.
const PYODIDE_VERSION = "0.29.3";
const WORKER_BUILD = '88e6604ff6b6';
const INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
let pyodide, dispatch, currentPath = "", uploadNumber = 0;
let currentSources = [];
let progressRequestId=null;
function operationProgress(text,completed=null,total=null,unit=''){self.postMessage({type:'progress',id:progressRequestId,text,completed,total,unit});}

function progress(text) { self.postMessage({ type: "progress", text }); }
async function fetchAsset(relative, binary = false) {
  const url=new URL(relative,import.meta.url);url.searchParams.set('release',new URL(import.meta.url).searchParams.get('v')||'current');
  const response = await fetch(url,{cache:binary?'default':'no-store'});
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
    fetchAsset("./python/engine.py?v=db41dbe0ccaf"), fetchAsset("./python/plot_utils.py"),
    fetchAsset("./python/generic_xy_base.py"), fetchAsset("./assets/fonts/NotoSansJP.ttf", true),
    ...["Regular", "Bold", "Italic", "BoldItalic"].map(style => fetchAsset(`./assets/fonts/LiberationSans-${style}.ttf`, true)),
    fetchAsset("./python/annotation_model.py?v=61d158587773"), fetchAsset("./python/annotation_manager.py?v=61d158587773"),
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
  pyodide.FS.writeFile("/app/python/spatial.py", await fetchAsset("./python/spatial.py?v=88e6604ff6b6"));
  await pyodide.runPythonAsync("import sys\nsys.path.insert(0, '/app/python')\nfrom engine import PlotEngine\n_engine = PlotEngine('/app/python', '/app/NotoSansJP.ttf')\n_dispatch = _engine.dispatch");
  pyodide.globals.set("_report_file_progress",(text,completed,total)=>operationProgress(text,completed,total,'ファイル'));
  pyodide.runPython("_engine.progress_callback = _report_file_progress");
  dispatch = pyodide.globals.get("_dispatch");
  self.postMessage({ type: "ready",version:APP_VERSION,build:WORKER_BUILD,releaseProtocol:1 });
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
    let uploadPath, projectSnapshot = false, loadSnapshot = false, nextSources;
    const uploadedPaths=[];
    const projectFonts = [];
    try {
      await ready;
      progressRequestId=id;
      let payload = args;
      let dispatchOperation=operation==='project'?'load':operation;
      if(operation==='load'||operation==='load-many'){
        pyodide.runPython('_load_previous = dict(_engine.__dict__)');loadSnapshot=true;
      }
      if (operation === "project") {
        pyodide.runPython("from matplotlib import font_manager\n_project_previous = dict(_engine.__dict__)\n_project_previous['font_families'] = set(_engine.font_families)\n_project_fonts = list(font_manager.fontManager.ttflist)");
        projectSnapshot = true;
      }
      if (operation === 'sheet-list') {
        if(!/\.(xlsx|xlsm|xls)$/i.test(args.filename)||!(args.bytes instanceof ArrayBuffer)||args.bytes.byteLength>30*1024*1024)throw new Error('30 MB以内のExcelファイルを選んでください。');
        uploadPath=`/data/inspect-${++uploadNumber}.${args.filename.split('.').pop().toLowerCase()}`;
        pyodide.FS.writeFile(uploadPath,new Uint8Array(args.bytes));
        payload={path:uploadPath,filename:args.filename};
      } else if (operation === 'load-many' || operation === 'project' && args.files) {
        if(args.files){
          if(!Array.isArray(args.files) || !args.files.length || args.files.length>16 || args.files.reduce((sum,file)=>sum+(file.bytes?.byteLength || 0),0)>30*1024*1024)throw new Error('複数ファイルは16個・合計30 MB以内にしてください。');
          nextSources=args.files.map(file=>{
            const extension=file.filename.split('.').pop().toLowerCase();
            if(!['xlsx','xlsm','xls','csv','txt'].includes(extension))throw new Error('Excel、CSVまたはTXTファイルを選んでください。');
            const path=`/data/upload-${++uploadNumber}.${extension}`;uploadedPaths.push(path);
            pyodide.FS.writeFile(path,new Uint8Array(file.bytes));
            return {path,filename:file.filename,sheetIndex:file.sheetIndex ?? 0,headerRow:file.headerRow ?? 1};
          });
        }else nextSources=args.sources.map(item=>{if(!Number.isInteger(item.index)||!currentSources[item.index])throw new Error('元ファイルが見つかりません。');return {...currentSources[item.index],sheetIndex:item.sheetIndex,headerRow:item.headerRow};});
        payload={sources:nextSources,filename:args.filename,table_edits:validateTableEdits(args.tableEdits)};dispatchOperation='load-many';
      } else if (operation === "load" || operation === "project") {
        const extension = args.filename.split(".").pop().toLowerCase();
        if (!["xlsx", "xlsm", "xls", "csv", "txt"].includes(extension)) throw new Error("Excel、CSVまたはTXTファイルを選んでください。");
        if (args.bytes) {
          uploadPath = `/data/upload-${++uploadNumber}.${extension}`;
          pyodide.FS.writeFile(uploadPath, new Uint8Array(args.bytes));
        }
        payload = { path: uploadPath || currentPath, filename: args.filename, sheet_index: args.sheetIndex ?? 0, header_row: args.headerRow ?? 1, table_edits:validateTableEdits(args.tableEdits) };
      }
      if (operation === "font") {
        const path = `/app/user-font-${++uploadNumber}.ttf`;
        pyodide.FS.writeFile(path, new Uint8Array(args.bytes));
        payload = { path };
      }
      if (operation === 'sheet-info' || operation === 'sheet-export') {
        payload = {path:currentPath,...(currentSources.length?{sources:currentSources}:{}),filename:args.filename, sheet_index:args.sheetIndex, header_row:args.headerRow, config:args.config, format:args.format, content:args.content, dpi:args.dpi,table_edits:validateTableEdits(args.tableEdits)};
      }
      if (operation === 'table-apply') {
        payload = {columns:args.columns,cells:args.cells,path:currentPath,filename:args.filename,...(currentSources.length?{sources:currentSources}:{})};
      }
      if(['load','load-many','project','sheet-list'].includes(operation))operationProgress(operation==='sheet-list'?'Excelのシートを確認しています…':'データを解析しています…');
      let result = JSON.parse(dispatch(dispatchOperation, JSON.stringify(payload)));
      if(operation==='project')operationProgress('グラフ設定を確認しています…');
      if (operation === "project") {
        if (result.sheets[result.sheetIndex] !== args.settings.data.sheet) throw new Error("プロジェクトのシートが設定と一致しません。");
        if(args.selectedSheets && args.selectedSheets.some(index=>index>=result.sheets.length))throw new Error('選択したシートが元データにありません。');
        if (args.sharedSettings && !result.sheets.includes(args.sharedSettings.data.sheet)) throw new Error('プロジェクトの共通設定がデータと一致しません。');
        for (const item of args.sheetSettings || []) if (result.sheets[item.sheetIndex] !== item.settings.data.sheet) throw new Error('プロジェクトのシート設定がデータと一致しません。');
        const settings = structuredClone(args.settings);
        if(args.remapColumns){
          for(const item of settings.series)for(const key of ['x','y','error','errorMin','errorMax','errorPlus','errorMinus']){
            if(Number.isInteger(item[key])&&result.columns[item[key]])item[key+'Column']=result.columns[item[key]].name;
          }
          if(settings.options){const options=settings.options;if(Number.isInteger(options.diameterColumn)&&result.columns[options.diameterColumn])options.diameterColumnName=result.columns[options.diameterColumn].name;
            for(const fill of options.fills||[])for(const key of ['x','upper','lower'])if(Number.isInteger(fill[key])&&result.columns[fill[key]])fill[key+'Name']=result.columns[fill[key]].name;}
        }
        const config = restoreSettings(settings, result), families = [];
        for (const [fontIndex,font] of args.fonts.entries()) {
          operationProgress(`フォントを復元しています：${font.name}`,fontIndex,args.fonts.length,'フォント');
          const path = `/app/user-font-${++uploadNumber}.ttf`;
          projectFonts.push(path); pyodide.FS.writeFile(path, new Uint8Array(font.bytes));
          const registered = JSON.parse(dispatch("font", JSON.stringify({path})));
          if (registered.family !== font.family) throw new Error("プロジェクトのフォントが設定と一致しません。");
          families.push(registered.family);
        }
        result = {metadata:result, config, families};
      }
      if (operation !== 'sheet-list' && (nextSources || uploadPath)) {
        const oldPaths=new Set([currentPath,...currentSources.map(source=>source.path)].filter(Boolean));
        const keep=new Set(nextSources?nextSources.map(source=>source.path):[uploadPath]);
        for(const path of oldPaths)if(!keep.has(path))try{pyodide.FS.unlink(path);}catch{}
        currentSources=nextSources || [];currentPath=uploadPath || '';
      }
      self.postMessage({ type: "result", id, result });
    } catch (error) {
      if (loadSnapshot) pyodide.runPython('_engine.__dict__.clear()\n_engine.__dict__.update(_load_previous)');
      if (projectSnapshot) pyodide.runPython("_engine.__dict__.clear()\n_engine.__dict__.update(_project_previous)\nfont_manager.fontManager.ttflist = _project_fonts\nfont_manager.fontManager._findfont_cached.cache_clear()");
      for (const path of projectFonts) { try { pyodide.FS.unlink(path); } catch {} }
      if (uploadPath) { try { pyodide.FS.unlink(uploadPath); } catch {} }
      for(const path of uploadedPaths)try{pyodide.FS.unlink(path);}catch{}
      const text = String(error);
      const message = text.split("\n").filter(Boolean).pop().replace(/^(ValueError|RuntimeError|IndexError|EmptyDataError|ParserError):\s*/, "");
      self.postMessage({ type: "error", id, error: message, detail: text });
    } finally {
      if(operation==='sheet-list'&&uploadPath)try{pyodide.FS.unlink(uploadPath);}catch{}
      if (loadSnapshot) pyodide.runPython('del _load_previous');
      if (projectSnapshot) pyodide.runPython("del _project_previous, _project_fonts");
    }
  });
};
