export const APP_VERSION = "1.2.2";

// src/plot_settings.py: default_auto_series_colors(), same order and shades.
export const COLORS = ["#1F8FE0", "#D4291E", "#2BA84D", "#D77207", "#7D3EDD", "#787878", "#666666", "#0052A8", "#A10000", "#009F22"];
export const COLOR_PALETTE = {
    blue:["#D8EBFF","#BFE0FF","#A5D5FF","#8BC9FF","#70BEFF","#56B2FF","#3CA6F5","#1F8FE0","#0C74C2","#0052A8"],
    red:["#FFD1CC","#FFB9B1","#FFA198","#FF897F","#FF7166","#F7574A","#E93E31","#D4291E","#BC170C","#A10000"],
    green:["#D8F5DF","#BFEECB","#A6E7B7","#8DDEA2","#74D68D","#5BCC77","#43C262","#2BA84D","#158E38","#009F22"],
    orange:["#FFE3C2","#FFD4A2","#FFC582","#FFB662","#FFA742","#FF9822","#F28610","#D77207","#BC5E03","#A14B00"],
    purple:["#E8D9FF","#DAC3FF","#CCADFF","#BE97FF","#AF81F8","#A06BEB","#9155DD","#7D3EDD","#6725C3","#5A1FA8"],
    gray:["#E0E0E0","#D2D2D2","#C4C4C4","#B6B6B6","#A8A8A8","#9A9A9A","#8A8A8A","#787878","#626262","#4A4A4A"],
    black:["#E6E6E6","#D5D5D5","#C4C4C4","#B3B3B3","#A2A2A2","#8F8F8F","#7C7C7C","#666666","#4A4A4A","#2A2A2A"],
  };

export const PLOT_TYPES = ["CV/LSV", "CA", "CP", "EDX", "XPS Survey", "XPS Core", "XPS Fit", "XAFS", "Raman Spectrum", "AFM Section", "Particle Histogram", "General", "Roughness", "bar_graph_general", "Raman 3D"];

export function applyPreset(config, preset) {
  config.plotType = preset.id;
  const [xLabel, xUnit, yLabel, yUnit] = preset.labels;
  Object.assign(config.axes, {xLabel: xLabel === "auto" ? "" : xLabel, xUnit, yLabel: yLabel === "auto" ? "" : yLabel, yUnit});
  const spectrum = ["EDX", "XPS Survey", "XPS Core", "XPS Fit", "XAFS", "Raman Spectrum"].includes(preset.id);
  Object.assign(config.axes, {hideYTickLabels: spectrum, hideYTicks: spectrum, xScale: "linear", yScale: preset.id === "Roughness" ? "log" : "linear", grid: preset.id === "Raman 3D"});
  if (preset.id === "Roughness") config.series.forEach(series => series.mode = "line+scatter");
  config.options ||= {};
}

export function zoomAt(view, factor, point) {
  const zoom = Math.max(.25, Math.min(4, view.zoom * factor));
  const ratio = zoom / view.zoom;
  return {zoom, x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio};
}

export function shiftCoordinate(value, delta, range, scale, coordinateSystem) {
  if (coordinateSystem === "axes_fraction") return Number(value) + delta;
  const [low, high] = range;
  return scale === "log" ? Number(value) * Math.exp(delta * (Math.log(high) - Math.log(low))) : Number(value) + delta * (high - low);
}

export function snapPoint(anchor, point) {
  const dx=point.x-anchor.x,dy=point.y-anchor.y,length=Math.hypot(dx,dy);
  const angle=Math.round(Math.atan2(dy,dx)*180/Math.PI/15)*15*Math.PI/180;
  return {x:anchor.x+length*Math.cos(angle),y:anchor.y+length*Math.sin(angle)};
}

export function defaultAxes() {
  return {
    xLabelX: "", xLabelY: "", yLabelX: "", yLabelY: "",
    xLabel: "", yLabel: "", xUnit: "auto", yUnit: "auto", xScale: "linear", yScale: "linear",
    xMin: "", xMax: "", yMin: "", yMax: "", xStep: "", yStep: "", width: 4, height: 3,
    fontFamily: "Liberation Sans", japaneseFontFamily: "Noto Sans JP", fontScale: 1, tickFontScale: 1, labelFontScale: 1,
    spineScale: 1, dataLineScale: 1, tickLength: 1, xLabelPad: 0, yLabelPad: 0, xTickPad: 0, yTickPad: 0,
    xLogFormat: "power", yLogFormat: "power", hideXLabel: false, hideYLabel: false,
    hideXTickLabels: false, hideYTickLabels: false, hideXTicks: false, hideYTicks: false,
    hideMinorTicks: false, spineLeft: true, spineRight: true, spineTop: true, spineBottom: true,
    yAxisRight: false, xAxisTop: false, spineColor: "#000000",
    legend: true, legendPosition: "best", legendX: "", legendY: "", legendScale: 1, legendFontScale: 1,
    transparent: true, backgroundColor: "#ffffff", backgroundAlpha: 1, grid: false,
    plotBackgroundEnabled: false, plotBackgroundColor: "#ffffff", plotBackgroundAlpha: 1,
    markerEdgeWidth: 0.6, errorLineWidth: 0.8, errorCapSize: 3, errorCapThick: 0.8,
  };
}

export function createSeries(x, y, name, index = 0) {
  return { x, y, name, visible: true, color: COLORS[index % COLORS.length], scatterColor: "auto", mode: "line", lineWidth: 1, lineStyle: "-", lineAlpha: 1, marker: "o", markerSize: 18, markerEdgeColor: "auto", markerFaceColor: "auto", markerEdgeAlpha: 0.8, markerFaceAlpha: 0.8, xOffset: 0, yOffset: 0, error: "", errorMode: "auto", errorMin: "", errorMax: "" };
}

export function safeStem(name) {
  return String(name || "graph").replace(/(?:\.plot)?\.(xlsx|xlsm|xls|csv|svg|png|pdf|pptx|json)$/i, "").replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").slice(0, 120).replace(/[. ]+$/, "") || "graph";
}

export function makeSettings(config, metadata, headerRow) {
  const options = structuredClone(config.options || {});
  if (options.diameterColumn !== undefined) options.diameterColumnName = metadata.columns[Number(options.diameterColumn)]?.name;
  for (const fill of options.fills || []) for (const key of ["x", "upper", "lower"]) fill[`${key}Name`] = metadata.columns[Number(fill[key])]?.name;
  return {
    format: "plotlauncher-web", version: 1,
    data: { filename: metadata.filename, sheet: metadata.sheets[metadata.sheetIndex], headerRow },
    plotType: config.plotType || "General", options,
    axes: structuredClone(config.axes), annotations: structuredClone(config.annotations || []),
    series: config.series.map(series => ({ ...series, xColumn: metadata.columns[Number(series.x)]?.name, yColumn: metadata.columns[Number(series.y)]?.name, errorColumn: series.error === "" ? "" : metadata.columns[Number(series.error)]?.name, errorMinColumn: series.errorMin === "" ? "" : metadata.columns[Number(series.errorMin)]?.name, errorMaxColumn: series.errorMax === "" ? "" : metadata.columns[Number(series.errorMax)]?.name })),
  };
}

const MB = 1024 * 1024;
export const PROJECT_MAX_SIZE = 130 * MB;

function projectBytes(value, limit) {
  if (typeof value !== 'string' || !value.length || value.length > Math.ceil(limit / 3) * 4 || value.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('プロジェクトのデータが壊れています。');
  const binary = atob(value);
  if (binary.length > limit) throw new Error('プロジェクトのデータが大きすぎます。');
  return Uint8Array.from(binary, char => char.charCodeAt(0)).buffer;
}

function projectBase64(bytes) {
  const array = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < array.length; i += 32768) binary += String.fromCharCode(...array.subarray(i, i + 32768));
  return btoa(binary);
}

export function makeProject(settings, data, fonts = [], workspace = {}) {
  const saved = {format:'plotlauncher-project', version:1, settings:structuredClone(settings),
    data:{filename:data.filename, base64:projectBase64(data.bytes), sheetIndex:data.sheetIndex, headerRow:data.headerRow, sample:!!data.sample},
    fonts:fonts.map(font => ({name:font.name, family:font.family, base64:projectBase64(font.bytes)})), workspace:structuredClone(workspace)};
  parseProject(saved);
  return saved;
}

export function parseProject(saved) {
  if (saved?.format !== 'plotlauncher-project' || saved.version !== 1) throw new Error('PlotLauncher Webのプロジェクトファイルを選んでください。');
  const data = saved.data, settings = saved.settings, workspace = saved.workspace || {};
  if (!data || typeof data.filename !== 'string' || data.filename.length > 255 || !/\.(xlsx|xlsm|xls|csv)$/i.test(data.filename) || !Number.isInteger(data.sheetIndex) || data.sheetIndex < 0 || data.sheetIndex > 1000 || !Number.isInteger(data.headerRow) || data.headerRow < 1 || data.headerRow > 1000 || typeof data.sample !== 'boolean') throw new Error('プロジェクトのデータ・シート・ヘッダー行を確認してください。');
  if (settings?.format !== 'plotlauncher-web' || settings.version !== 1 || settings.data?.filename !== data.filename || settings.data?.headerRow !== data.headerRow || !Array.isArray(settings.series) || !settings.series.length || !settings.axes) throw new Error('プロジェクトのグラフ設定を確認してください。');
  if (!Array.isArray(saved.fonts) || saved.fonts.length > 32) throw new Error('プロジェクトのフォントを確認してください。');
  let total = 0;
  const fonts = saved.fonts.map(font => {
    if (typeof font?.name !== 'string' || font.name.length > 255 || typeof font.family !== 'string' || !font.family || font.family.length > 200) throw new Error('プロジェクトのフォントを確認してください。');
    const bytes = projectBytes(font.base64, 20 * MB); total += bytes.byteLength;
    if (total > 60 * MB) throw new Error('プロジェクトのフォントは合計60 MB以内にしてください。');
    return {name:font.name, family:font.family, bytes};
  });
  if (typeof workspace.saveName !== 'string' || workspace.saveName.length > 120 || ![150,300,600,1200].includes(workspace.pngDpi) || !workspace.view || !Number.isFinite(workspace.view.zoom) || workspace.view.zoom < .25 || workspace.view.zoom > 4 || !Number.isFinite(workspace.view.x) || !Number.isFinite(workspace.view.y) || !Array.isArray(workspace.sections) || workspace.sections.length > 20 || workspace.sections.some(open => typeof open !== 'boolean')) throw new Error('プロジェクトの画面・保存設定を確認してください。');
  return {settings:structuredClone(settings), data:{...data, bytes:projectBytes(data.base64,30 * MB)}, fonts, workspace:structuredClone(workspace)};
}

export function restoreSettings(document, metadata) {
  if (document?.plot_type && !document.format) return restoreSettings(fromDesktopSettings(document, metadata), metadata);
  if (document?.format !== "plotlauncher-web" || document.version !== 1 || !Array.isArray(document.series) || document.series.length < 1 || document.series.length > 32 || !document.axes || typeof document.axes !== "object") {
    throw new Error("PlotLauncher Webで保存した設定JSONを選んでください。");
  }
  const find = name => {
    const index = metadata.columns.findIndex(column => column.name === name);
    if (index < 0) throw new Error(`列「${name}」が見つかりません。同じ列名のデータを読み込んでください。`);
    return index;
  };
  const axes = defaultAxes();
  for (const axis of ["x", "y"]) {
    if (!Object.hasOwn(document.axes, `${axis}Unit`) && document.axes[`${axis}Label`]) axes[`${axis}Unit`] = "";
  }
  for (const key of Object.keys(axes)) {
    if (Object.hasOwn(document.axes, key)) {
      const value = document.axes[key];
      const expected = typeof axes[key];
      if (expected === "boolean" ? typeof value !== "boolean" : expected === "string" ? typeof value !== "string" : !["number", "string"].includes(typeof value)) throw new Error("設定JSONの軸設定を確認してください。");
      axes[key] = value;
    }
  }
  const series = document.series.map((item, index) => {
    if (!item || typeof item !== "object" || typeof item.xColumn !== "string" || typeof item.yColumn !== "string") throw new Error("設定JSONの系列設定を確認してください。");
    const result = createSeries(find(item.xColumn), find(item.yColumn), item.yColumn, index);
    for (const key of Object.keys(result)) {
      if (["x", "y", "error", "errorMin", "errorMax"].includes(key)) continue;
      if (Object.hasOwn(item, key)) {
        if (key === 'visible') {
          if (typeof item[key] !== 'boolean') throw new Error("設定JSONの系列表示を確認してください。");
          result[key] = item[key]; continue;
        }
        if (!["string", "number"].includes(typeof item[key])) throw new Error("設定JSONの系列設定を確認してください。");
        result[key] = item[key];
      }
    }
    if (item.errorColumn !== undefined && typeof item.errorColumn !== "string") throw new Error("設定JSONの誤差列を確認してください。");
    result.error = item.errorColumn ? find(item.errorColumn) : "";
    for (const key of ["errorMin", "errorMax"]) {
      if (item[`${key}Column`] !== undefined && typeof item[`${key}Column`] !== "string") throw new Error("設定JSONの誤差列を確認してください。");
      result[key] = item[`${key}Column`] ? find(item[`${key}Column`]) : "";
    }
    return result;
  });
  const plotType = document.plotType || "General";
  if (!PLOT_TYPES.includes(plotType)) throw new Error("設定JSONのプロット種別を確認してください。");
  const restored = { axes, series, plotType, options: structuredClone(document.options || {}) };
  const optionColumn = key => { if (restored.options[`${key}Name`]) restored.options[key] = find(restored.options[`${key}Name`]); };
  optionColumn("diameterColumn");
  for (const fill of restored.options.fills || []) for (const key of ["x", "upper", "lower"]) if (fill[`${key}Name`]) fill[key] = find(fill[`${key}Name`]);
  if (document.annotations?.length) {
    if (!Array.isArray(document.annotations) || document.annotations.length > 200) throw new Error("設定JSONの注釈を確認してください。");
    restored.annotations = structuredClone(document.annotations);
  }
  return restored;
}

// Read the actual v4.1 desktop snapshot structure. Unsupported plot types are
// rejected so a different scientific plot is never silently drawn as General.
function fromDesktopSettings(saved, metadata) {
  if (!PLOT_TYPES.includes(saved.plot_type)) throw new Error(`「${saved.plot_type}」の描画形式は未対応です。`);
  const axes = defaultAxes(), general = saved.general_options || {}, styles = saved.style_scales || {}, axisOptions = saved.axis_options || {};
  axes.fontFamily = "Arial";
  axes.width = saved.axes_size_cm?.w ?? 4; axes.height = saved.axes_size_cm?.h ?? 3;
  axes.spineScale = styles.line_width ?? 1; axes.tickFontScale = styles.tick_font ?? 1;
  axes.labelFontScale = styles.label_font ?? 1; axes.tickLength = styles.tick_length ?? 1;
  axes.legend = saved.preview_legend ?? true;
  axes.legendX = saved.legend_position?.x ?? ""; axes.legendY = saved.legend_position?.y ?? "";
  axes.legendScale = saved.legend_scale?.size ?? 1; axes.legendFontScale = saved.legend_scale?.font ?? 1;
  axes.spineColor = saved.spine_color === "black" ? "#000000" : saved.spine_color || "#000000";
  for (const axis of ["x", "y"]) {
    axes[`${axis}Scale`] = axisOptions[`${axis}scale`] || "linear";
    axes[`${axis}LogFormat`] = axisOptions[`${axis}log_format`] || "power";
    axes[`${axis}Min`] = saved.range_auto?.[axis] ? "" : String(saved[`${axis}_range`]?.min ?? "");
    axes[`${axis}Max`] = saved.range_auto?.[axis] ? "" : String(saved[`${axis}_range`]?.max ?? "");
    axes[`${axis}Step`] = saved.tick_auto?.[axis] ? "" : String(saved.tick_step?.[axis] ?? "");
    axes[`${axis}Label`] = saved.axis_labels?.[`${axis}_text`] === "auto" ? "" : saved.axis_labels?.[`${axis}_text`] || "";
    axes[`${axis}Unit`] = saved.axis_labels?.[`${axis}_unit`] ?? "auto";
    axes[`${axis}LabelPad`] = saved.axis_padding?.[`${axis}_label`] || 0;
    axes[`${axis}TickPad`] = saved.axis_padding?.[`${axis}_tick`] || 0;
  }
  for (const [key, source] of Object.entries({hideXLabel:"hide_xlabel",hideYLabel:"hide_ylabel",hideXTickLabels:"hide_xticklabels",hideYTickLabels:"hide_yticklabels",hideXTicks:"hide_xticks",hideYTicks:"hide_yticks",hideMinorTicks:"hide_minorticks",yAxisRight:"yaxis_right",xAxisTop:"xaxis_top"})) axes[key] = axisOptions[source] ?? false;
  for (const side of ["Left", "Right", "Top", "Bottom"]) axes[`spine${side}`] = !axisOptions[`hide_spine_${side.toLowerCase()}`];
  axes.markerEdgeWidth = general.scatter_edge_width ?? .6;
  axes.errorLineWidth = general.error_linewidth ?? .8; axes.errorCapSize = general.error_capsize ?? 3; axes.errorCapThick = general.error_capthick ?? .8;

  const color = (base, shade, fallback = "auto") => base === "custom" && /^#[0-9a-f]{6}$/i.test(shade) ? shade : base === "white" ? "#ffffff" : COLOR_PALETTE[base]?.[Number(shade)] || (/^#[0-9a-f]{6}$/i.test(base) ? base : base === "none" ? "none" : fallback);
  if (saved.figure_background) {
    axes.backgroundColor = color(saved.figure_background.base, saved.figure_background.shade, "#ffffff");
    axes.backgroundAlpha = saved.figure_background.alpha ?? 0;
    axes.transparent = Number(axes.backgroundAlpha) === 0;
  }
  const find = (index, name) => {
    const ci = metadata.columns.findIndex(column => column.name === name);
    if (ci >= 0) return ci;
    // Older snapshots may store normalized/duplicate header names; retain the
    // explicit column index only when the requested name cannot be resolved.
    if (Number.isInteger(index) && index >= 0 && index < metadata.columns.length) return index;
    throw new Error(`設定の列「${name}」が見つかりません。`);
  };
  let items = saved.series_items || [];
  if (!Array.isArray(items)) throw new Error("設定の系列を確認してください。");
  if (!items.length && saved.series_map_var) items = saved.series_map_var.split(',').map(pair => { const [x,y]=pair.split(':').map(Number); return `x=${x}: ${metadata.columns[x]?.name || ''} | y=${y}: ${metadata.columns[y]?.name || ''}`; });
  const series = items.map((item, index) => {
    if (typeof item !== "string") throw new Error("設定の系列を確認してください。");
    const fields = Object.fromEntries(item.split('|').map(part => { const at=part.indexOf('='); return [part.slice(0,at).trim(),part.slice(at+1).trim()]; }));
    const col = key => { const at=fields[key]?.indexOf(':'); if(at<0 || at===undefined) throw new Error("設定の列指定を確認してください。"); return find(Number(fields[key].slice(0,at)), fields[key].slice(at+1).trim()); };
    const x=col('x'), y=col('y'), result=createSeries(x,y,metadata.columns[y].name,index);
    const decode = value => new TextDecoder().decode(Uint8Array.from(atob(value),c=>c.charCodeAt(0)));
    result.name = fields.legend_label_b64 ? decode(fields.legend_label_b64) : fields.legend_label || saved.series_legend_labels?.[index] || result.name;
    const tupleColor = (token,fallback) => { if(!token)return fallback; const [base,shade,hex]=token.split(':'); return base==='auto'?fallback:hex || color(base,shade,fallback); };
    result.color=tupleColor(fields.line,result.color); result.scatterColor=tupleColor(fields.scatter,result.color);
    result.markerEdgeColor=color(fields.marker_edge_color || general.scatter_edge_base, fields.marker_edge_alpha || general.scatter_edge_shade);
    result.markerFaceColor=color(fields.marker_face_color || general.scatter_face_base, fields.marker_face_alpha || general.scatter_face_shade);
    for(const [key,source,fallback] of [["xOffset","xoff",0],["yOffset","yoff",0],["lineWidth","linewidth",general.line_width??1],["markerSize","size",general.scatter_size??18],["lineAlpha","line_opacity",1],["markerEdgeAlpha","marker_edge_opacity",fields.marker_alpha??general.scatter_alpha??.8],["markerFaceAlpha","marker_face_opacity",fields.marker_alpha??general.scatter_alpha??.8]]) result[key]=fields[source]??fallback;
    result.mode=fields.draw_mode || (general.scatter_enabled ? (general.plot_enabled ? 'line+scatter':'scatter'):'line');
    result.marker=fields.marker || 'o'; result.lineStyle=fields.linestyle || '-';
    const [mode,err,mini,maxi]=(fields.error || 'none:-1:-1:-1').split(':'); result.errorMode=mode;
    result.error=Number(err)>=0?Number(err):''; result.errorMin=Number(mini)>=0?Number(mini):''; result.errorMax=Number(maxi)>=0?Number(maxi):'';
    return result;
  });
  if (!series.length && metadata.columns.length >= 2) {
    if (["CV/LSV","CA","CP"].includes(saved.plot_type)) {
      for(let y=1;y<metadata.columns.length && series.length<32;y+=2)series.push(createSeries(y-1,y,metadata.columns[y].name,series.length));
    } else if (["EDX","Raman Spectrum","XPS Survey","XPS Core","Roughness","Raman 3D"].includes(saved.plot_type)) {
      metadata.columns.slice(1,33).forEach(column=>series.push(createSeries(0,column.index,column.name,series.length)));
    } else series.push(createSeries(0, 1, metadata.columns[1].name));
  }
  for(const [i,item] of series.entries())item.yOffset=Number(item.yOffset)+Number(saved.y_offset_start || 0)+i*Number(saved.y_offset_step || 0);
  const xps = saved.xpsfit_options || {}, options = {};
  for (const [key, source] of Object.entries({scatterSize:"scatter_size",scatterEdgeWidth:"scatter_edge_width",scatterAlpha:"scatter_alpha",fitLineColor:"fit_line_color",fitLineWidth:"fit_line_width",bgLineColor:"bg_line_color",bgLineWidth:"bg_line_width"})) if (xps[source] !== undefined) options[key] = xps[source];
  options.scatterEdgeColor = color(xps.scatter_edge_base, xps.scatter_edge_shade, "#2A2A2A");
  options.scatterFaceColor = color(xps.scatter_face_base, xps.scatter_face_shade, "#ffffff");
  options.fills = (saved.fill_items || []).map(item => {
    const fields = Object.fromEntries(item.split('|').map(part => {const at=part.indexOf('=');return [part.slice(0,at).trim(),part.slice(at+1).trim()];}));
    return {x:Number(fields.x.split(':')[0]),upper:Number(fields.y1.split(':')[0]),lower:Number(fields.y2.split(':')[0]),color:fields.color.split(':')[2],alpha:Number(fields.alpha)};
  });
  if(saved.plot_type==='Particle Histogram')options.diameterColumn=Math.min(2,metadata.columns.length-1);
  axes.dataLineScale = styles.plot_width ?? 1;
  return makeSettings({axes,series,plotType:saved.plot_type,options,annotations:saved.annotations || []}, metadata, saved.header_row || 1);
}

export function sampleCSV() {
  const rows = ["Potential/V,Sample A,Sample B,Sample C"];
  for (let index = 0; index <= 180; index++) {
    const x = -0.3 + index / 150;
    const values = [0, 1, 2].map(series => {
      const center = 0.32 + series * 0.07;
      return 0.012 + (0.22 + series * 0.045) * Math.exp(-(((x - center) / (0.16 + series * 0.01)) ** 2)) + 0.008 * x;
    });
    rows.push([x.toFixed(5), ...values.map(value => value.toFixed(7))].join(","));
  }
  return rows.join("\n");
}
