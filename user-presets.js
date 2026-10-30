import { makeSettings, restoreSettings } from "./state.js?v=94312791d8d3";
import { configForSheet } from "./sheets.js?v=94312791d8d3";

export const USER_PRESET_KEY = 'plotlauncher.user-presets.v1';
export const USER_PRESET_LIMIT = 100;
export const USER_PRESET_FILE_LIMIT = 4_000_000;
const LIBRARY_LIMIT = 2_000_000;
const format = 'plotlauncher-user-presets';

export function userPresetName(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('プリセット名は1〜80文字で入力してください。');
  return value.trim();
}

function normalizePreset(entry) {
  if (!entry || typeof entry.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(entry.id) ||
      !Array.isArray(entry.columns) || entry.columns.length < 2 || entry.columns.length > 256 ||
      entry.columns.some(name => typeof name !== 'string' || !name || name.length > 200) || new Set(entry.columns).size !== entry.columns.length) throw new Error('プリセットの形式・列情報を確認してください。');
  const metadata = {filename:'', sheets:[''], sheetIndex:0, columns:entry.columns.map((name,index)=>({name,index}))};
  if (!entry.settings || typeof entry.settings.options !== 'object' || Array.isArray(entry.settings.options) || entry.settings.options === null) throw new Error('プリセットの設定を確認してください。');
  const restored = restoreSettings(entry.settings, metadata);
  const settings = makeSettings(restored, metadata, 1);
  delete settings.data;
  return {id:entry.id, name:userPresetName(entry.name), columns:[...entry.columns], settings};
}

function normalizeLibrary(entries) {
  if (!Array.isArray(entries) || entries.length > USER_PRESET_LIMIT) throw new Error(`プリセットは${USER_PRESET_LIMIT}件まで登録できます。`);
  const result = entries.map(normalizePreset);
  if (new Set(result.map(item=>item.id)).size !== result.length || new Set(result.map(item=>item.name)).size !== result.length) throw new Error('プリセットのIDまたは名前が重複しています。');
  if (new TextEncoder().encode(JSON.stringify({format,version:1,presets:result})).length > LIBRARY_LIMIT) throw new Error('プリセットの保存容量（2 MB）を超えています。不要なプリセットや注釈を減らしてください。');
  return result;
}

export function captureUserPreset(name, config, metadata, headerRow, id = crypto.randomUUID()) {
  return normalizePreset({id, name, columns:metadata.columns.map(item=>item.name), settings:makeSettings(config,metadata,headerRow)});
}

export function encodeUserPresets(entries) {
  return JSON.stringify({format, version:1, presets:normalizeLibrary(entries)}, null, 2);
}

export function decodeUserPresets(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > USER_PRESET_FILE_LIMIT) throw new Error('プリセットJSONは4 MB以内のファイルを選んでください。');
  let document;
  try {document = JSON.parse(text);} catch {throw new Error('プリセットJSONを読み取れません。書き出したファイルを選んでください。');}
  if (document?.format !== format || document.version !== 1) throw new Error('PlotLauncherのマイプリセットJSONを選んでください。');
  return normalizeLibrary(document.presets);
}

export function readUserPresets(storage) {
  const text = storage.getItem(USER_PRESET_KEY);
  return text === null ? [] : decodeUserPresets(text);
}

export function writeUserPresets(storage, entries) {
  const normalized = normalizeLibrary(entries);
  storage.setItem(USER_PRESET_KEY, JSON.stringify({format,version:1,presets:normalized}));
  return normalized;
}

export function upsertUserPreset(entries, entry, overwrite = false) {
  entry = normalizePreset(entry);
  const existing = entries.find(item=>item.name === entry.name);
  if (existing && !overwrite) throw new Error('同じ名前のプリセットがあります。上書きするか、別の名前にしてください。');
  return normalizeLibrary(existing ? entries.map(item=>item.id === existing.id ? {...entry,id:existing.id} : item) : [...entries,entry]);
}

export function renameUserPreset(entries, id, name) {
  name = userPresetName(name);
  if (!entries.some(item=>item.id === id)) throw new Error('プリセットが見つかりません。');
  if (entries.some(item=>item.id !== id && item.name === name)) throw new Error('同じ名前のプリセットがあります。');
  return normalizeLibrary(entries.map(item=>item.id === id ? {...item,name} : item));
}

export function mergeUserPresets(entries, imported, makeId = () => crypto.randomUUID()) {
  const result = normalizeLibrary(entries);
  for (const entry of normalizeLibrary(imported)) {
    const content = item => JSON.stringify([item.columns,item.settings]);
    const sameName = item => {const tail = item.name.match(/ \(\d+\)$/)?.[0];return item.name === entry.name || tail && item.name === entry.name.slice(0,80-tail.length)+tail;};
    if (result.some(item=>(item.id === entry.id || sameName(item)) && content(item) === content(entry))) continue;
    let name = entry.name, suffix = 2;
    while (result.some(item=>item.name === name)) {const tail = ` (${suffix++})`;name = entry.name.slice(0,80-tail.length)+tail;}
    const id = result.some(item=>item.id === entry.id) ? makeId() : entry.id;
    result.push({...entry,id,name});
  }
  return normalizeLibrary(result);
}

export function applyUserPreset(entry, metadata) {
  entry = normalizePreset(entry);
  try {return configForSheet(entry.settings, metadata);}
  catch (error) {throw new Error(`このデータにはプリセットを適用できません。列の構成を確認してください。${error.message}`);}
}
