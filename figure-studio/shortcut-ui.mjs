import {isMacPlatform,keyboardPlatform,shortcutLabel,shortcutRows} from './shortcuts.mjs?v=rotation-v079-1';

/** Localize command labels only; figure names and user text are untouched. */
export function installShortcutUI({documentRef=globalThis.document,platform=keyboardPlatform()}={}){
 if(!documentRef)return;
 const mac=isMacPlatform(platform),format=text=>shortcutLabel(text,platform);
 for(const element of documentRef.querySelectorAll('[data-action][title],[data-tool][title],#finishTextEdit'))if(element.title)element.title=format(element.title);
 for(const key of documentRef.querySelectorAll('#imageArrayDialog kbd'))key.textContent=format(key.textContent);
 const table=documentRef.querySelector('#helpDialog .shortcut-table tbody');
 if(table){
  table.replaceChildren();
  const rows=[...shortcutRows(platform),['サムネイルの複数選択',mac?'⌘ + クリック / Shift + クリック':'Ctrl + クリック / Shift + クリック'],['サイドバーでFigure追加','Enter'],['Figureの並べ替え','サムネイルをドラッグ']];
  for(const [label,keys] of rows){const row=documentRef.createElement('tr'),name=documentRef.createElement('td'),value=documentRef.createElement('td'),key=documentRef.createElement('kbd');name.textContent=label;key.textContent=keys;value.append(key);row.append(name,value);table.append(row);}
 }
 const lead=documentRef.querySelector('#helpDialog .dialog-lead');
 if(mac&&lead)lead.textContent='⌘はCommand、Optionは⌥キーです。Option → 5 → Gは順番に押せます。キャンバスをクリックしてから操作してください。';
 const note=documentRef.querySelector('#helpDialog .dialog-note');if(note)note.textContent=format(note.textContent);
 if(mac&&note)note.textContent+=' Figure追加はControl＋Mを使えます。';
}
