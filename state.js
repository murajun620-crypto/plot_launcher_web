export const COLORS = ["#2361b5", "#14866e", "#dd7b38", "#9466ac", "#d45564", "#657994"];

export function defaultAxes() {
  return { xLabel: "", yLabel: "", xScale: "linear", yScale: "linear", xMin: "", xMax: "", yMin: "", yMax: "", xStep: "", yStep: "", width: 8, height: 5, fontScale: 1, legend: true, legendPosition: "best", transparent: true, grid: false };
}

export function createSeries(x, y, name, index = 0) {
  return { x, y, name, color: COLORS[index % COLORS.length], mode: "line", lineWidth: 1.2, lineStyle: "-", marker: "o", markerSize: 18, xOffset: 0, yOffset: 0, error: "" };
}

export function safeStem(name) {
  return String(name || "graph").replace(/(?:\.plot)?\.(xlsx|xlsm|xls|csv|svg|png|pdf|json)$/i, "").replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").slice(0, 120).replace(/[. ]+$/, "") || "graph";
}

export function makeSettings(config, metadata, headerRow) {
  return {
    format: "plotlauncher-web", version: 1,
    data: { filename: metadata.filename, sheet: metadata.sheets[metadata.sheetIndex], headerRow },
    axes: structuredClone(config.axes),
    series: config.series.map(series => ({ ...series, xColumn: metadata.columns[Number(series.x)]?.name, yColumn: metadata.columns[Number(series.y)]?.name, errorColumn: series.error === "" ? "" : metadata.columns[Number(series.error)]?.name })),
  };
}

export function restoreSettings(document, metadata) {
  if (document?.format !== "plotlauncher-web" || document.version !== 1 || !Array.isArray(document.series) || document.series.length < 1 || document.series.length > 32 || !document.axes || typeof document.axes !== "object") {
    throw new Error("PlotLauncher Webで保存した設定JSONを選んでください。");
  }
  const find = name => {
    const index = metadata.columns.findIndex(column => column.name === name);
    if (index < 0) throw new Error(`列「${name}」が見つかりません。同じ列名のデータを読み込んでください。`);
    return index;
  };
  const axes = defaultAxes();
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
      if (["x", "y", "error"].includes(key)) continue;
      if (Object.hasOwn(item, key)) {
        if (!["string", "number"].includes(typeof item[key])) throw new Error("設定JSONの系列設定を確認してください。");
        result[key] = item[key];
      }
    }
    if (item.errorColumn !== undefined && typeof item.errorColumn !== "string") throw new Error("設定JSONの誤差列を確認してください。");
    result.error = item.errorColumn ? find(item.errorColumn) : "";
    return result;
  });
  return { axes, series };
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
