import { restoreSettings, safeStem } from "./state.js?v=314dd3d36add";

// An unedited sheet inherits appearance and column choices from the preview.
// Prefer matching headers; use the same column position when headers differ.
export function configForSheet(settings, metadata) {
  const document = structuredClone(settings);
  const column = (name, index) => {
    const found = metadata.columns.find(item => item.name === name) || metadata.columns[Number(index)];
    if (!found) throw new Error(`列「${name}」に対応する列がありません。シートを開いて系列を設定してください。`);
    return found.name;
  };
  document.data = {filename:metadata.filename, sheet:metadata.sheets[metadata.sheetIndex], headerRow:metadata.headerRow};
  for (const series of document.series) {
    const oldName = series.yColumn;
    for (const key of ['x','y','error','errorMin','errorMax','errorPlus','errorMinus']) {
      if (['x','y'].includes(key) || series[`${key}Column`]) series[`${key}Column`] = column(series[`${key}Column`], series[key]);
    }
    if (series.name === oldName) series.name = series.yColumn;
  }
  if (document.options?.diameterColumnName) document.options.diameterColumnName = column(document.options.diameterColumnName, document.options.diameterColumn);
  for (const fill of document.options?.fills || []) for (const key of ['x','upper','lower']) fill[`${key}Name`] = column(fill[`${key}Name`], fill[key]);
  return restoreSettings(document, metadata);
}

export function sheetFileStem(stem, name, index) {
  return `${safeStem(stem).slice(0,60)}_${String(index + 1).padStart(2,'0')}_${safeStem(name).slice(0,50)}`;
}

// Stored ZIP entries avoid extra libraries and a separate download per sheet.
// UTF-8 names and CRC32 are supported by Windows and macOS archive tools.
export function zipFiles(files) {
  if (files.length > 65535) throw new Error('保存するファイルが多すぎます。');
  const encoder = new TextEncoder(), parts = [], directory = [];
  let offset = 0, directorySize = 0;
  for (const file of files) {
    const name = encoder.encode(file.name), bytes = file.bytes;
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit=0;bit<8;bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = new Uint8Array(30), local = new DataView(header.buffer);
    local.setUint32(0,0x04034b50,true); local.setUint16(4,20,true); local.setUint16(6,0x800,true);
    local.setUint16(12,0x21,true); local.setUint32(14,crc,true);
    local.setUint32(18,bytes.length,true); local.setUint32(22,bytes.length,true); local.setUint16(26,name.length,true);
    parts.push(header,name,bytes);
    const entry = new Uint8Array(46), central = new DataView(entry.buffer);
    central.setUint32(0,0x02014b50,true); central.setUint16(4,20,true); central.setUint16(6,20,true);
    central.setUint16(8,0x800,true); central.setUint16(14,0x21,true); central.setUint32(16,crc,true);
    central.setUint32(20,bytes.length,true); central.setUint32(24,bytes.length,true);
    central.setUint16(28,name.length,true); central.setUint32(42,offset,true);
    directory.push(entry,name); directorySize += entry.length + name.length;
    offset += header.length + name.length + bytes.length;
    if (offset > 250 * 1024 * 1024) throw new Error('ZIPが250 MBを超えます。保存先にフォルダを指定して保存してください。');
  }
  const end = new Uint8Array(22), view = new DataView(end.buffer);
  view.setUint32(0,0x06054b50,true); view.setUint16(8,files.length,true); view.setUint16(10,files.length,true);
  view.setUint32(12,directorySize,true); view.setUint32(16,offset,true);
  return new Blob([...parts,...directory,end],{type:'application/zip'});
}
