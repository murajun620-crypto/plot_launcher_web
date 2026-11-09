export function createDataEditor({dialog, request, getSource, getMetadata, apply, saveCSV, show}) {
  const $ = selector => dialog.querySelector(selector);
  let source = null, page = null, busy = false, downloadURL = null;
  function clearDownload() {if(downloadURL)URL.revokeObjectURL(downloadURL);downloadURL=null;$('#data-csv-download').hidden=true;$('#data-csv-download').removeAttribute('href');}
  const cells = new Map(), headers = new Map();
  const message = (text, error = false) => { $('#data-editor-message').textContent = text; $('#data-editor-message').dataset.kind = error ? 'error' : 'ready'; };
  const hasDraft = () => cells.size > 0 || headers.size > 0;
  function controls() {
    $('#apply-data-edits').disabled = busy || !hasDraft();
    $('#discard-data-edits').disabled = busy || !hasDraft();
    $('#save-data-csv').disabled = busy || !page;
    $('#close-data-editor').disabled = busy;
    $('#data-row-previous').disabled = busy || !page || page.start === 0;
    $('#data-row-next').disabled = busy || !page || page.start + 50 >= page.rowCount;
    $('#data-column-previous').disabled = busy || !page || page.columnStart === 0;
    $('#data-column-next').disabled = busy || !page || page.columnStart + 12 >= page.columnCount;
    $('#data-row-jump').disabled = busy || !page || !page.rowCount;
    $('#data-editor-count').textContent = hasDraft() ? `未反映：${cells.size} セル・列名 ${headers.size} 件` : '変更はありません';
    $('#editable-data-table').inert = busy;
  }
  function draw() {
    const table = $('#editable-data-table'), head = document.createElement('tr');
    const corner = document.createElement('th'); corner.textContent = '行'; head.append(corner);
    for (const column of page.columns) {
      const th = document.createElement('th'), input = document.createElement('input');
      const label = document.createElement('span'); label.textContent = `${column.index + 1} · ${column.filename}`; label.title = column.filename;
      input.type = 'text'; input.maxLength = 200; input.spellcheck = false;
      input.value = headers.get(column.index) ?? column.name;
      input.dataset.dataColumn = column.index;
      input.setAttribute('aria-label', `列${column.index + 1}の名前`);
      input.classList.toggle('data-cell-changed', headers.has(column.index));
      th.append(label, input); head.append(th);
    }
    table.tHead.replaceChildren(head);
    const rows = page.rows.map((row, offset) => {
      const tr = document.createElement('tr'), th = document.createElement('th'), rowIndex = page.start + offset;
      th.scope = 'row'; th.textContent = rowIndex + 1; tr.append(th);
      row.forEach((value, local) => {
        const column = page.columns[local], td = document.createElement('td'), input = document.createElement('input');
        const key = `${rowIndex}:${column.index}`;
        input.type = 'text'; input.spellcheck = false; input.maxLength = 10000;
        input.value = cells.get(key)?.[2] ?? value ?? '';
        input.dataset.dataRow = rowIndex; input.dataset.dataColumn = column.index;
        input.setAttribute('aria-label', `${rowIndex + 1}行 ${column.index + 1}列`);
        input.disabled = rowIndex >= column.rowCount;
        if (input.disabled) input.title = 'この元ファイルには、この行のデータがありません。';
        input.classList.toggle('data-cell-changed', cells.has(key));
        td.append(input); tr.append(td);
      });
      return tr;
    });
    table.tBodies[0].replaceChildren(...rows);
    $('#data-row-jump').value = page.rowCount ? page.start + 1 : 1;
    $('#data-row-jump').max = Math.max(1, page.rowCount);
    $('#data-editor-range').textContent = `${page.rowCount ? page.start + 1 : 0}–${Math.min(page.start + 50, page.rowCount)} / ${page.rowCount.toLocaleString()} 行`;
    $('#data-editor-columns').textContent = `${page.columnStart + 1}–${Math.min(page.columnStart + 12, page.columnCount)} / ${page.columnCount} 列`;
    controls();
  }
  async function load(start = 0, columnStart = 0) {
    if (busy || source !== getSource()) return false;
    busy = true; controls();
    try {
      page = await request('table-page', {start, column_start: columnStart});
      draw(); return true;
    } catch (error) { message(error.message, true); return false; }
    finally { busy = false; controls(); }
  }
  async function open() {
    if (!getSource() || busy) return;
    if (source !== getSource()) { source = getSource(); page = null; cells.clear(); headers.clear(); clearDownload(); }
    $('#data-editor-filename').textContent = getMetadata().filename;
    $('#data-editor-discard-confirm').hidden = true;
    if (!dialog.open) show();
    message('列名・セルを編集し、「グラフに反映」を押してください。');
    await load(Math.min(page?.start ?? 0, Math.max(0,getMetadata().rowCount-1)), Math.min(page?.columnStart ?? 0,Math.max(0,getMetadata().columns.length-1)));
  }
  function close() {
    if (busy) return;
    if (hasDraft()) { $('#data-editor-discard-confirm').hidden = false; return; }
    dialog.close();
  }
  async function commit() {
    if (busy || !hasDraft()) return !busy;
    busy = true; controls();
    try {
      const metadata = getMetadata();
      const columns = metadata.columns.map(column => headers.get(column.index) ?? column.originalName ?? column.name);
      await apply({columns, cells: [...cells.values()]});
      source = getSource(); cells.clear(); headers.clear();
      message('編集内容をグラフに反映しました。プロジェクト保存で編集内容も保存できます。');
      return true;
    } catch (error) { message(error.message, true); return false; }
    finally { busy = false; controls(); }
  }
  $('#editable-data-table').addEventListener('input', event => {
    const input = event.target.closest('input[data-data-column]'); if (!input || busy || !page) return;
    const columnIndex = Number(input.dataset.dataColumn), column = page.columns.find(column => column.index === columnIndex);
    $('#data-editor-discard-confirm').hidden = true;
    if (input.dataset.dataRow === undefined) {
      if (input.value === column.name) headers.delete(columnIndex); else headers.set(columnIndex, input.value);
      input.classList.toggle('data-cell-changed', headers.has(columnIndex));
    } else {
      const rowIndex = Number(input.dataset.dataRow), key = `${rowIndex}:${columnIndex}`;
      const original = page.rows[rowIndex - page.start][page.columns.indexOf(column)] ?? '';
      if (input.value === original) cells.delete(key); else cells.set(key, [rowIndex, columnIndex, input.value]);
      input.classList.toggle('data-cell-changed', cells.has(key));
    }
    controls();
  });
  $('#apply-data-edits').addEventListener('click', async () => { if (await commit()) await load(page.start, page.columnStart); });
  $('#save-data-csv').addEventListener('click', async () => {
    if (busy) return;
    // Resolve the destination before committing staged edits.
    let destination;
    try { destination = await saveCSV.prepare(getMetadata().filename); }
    catch (error) { if (error.name !== 'AbortError') message(error.message, true); return; }
    if (hasDraft() && !await commit()) return;
    busy = true; controls();
    try {
      const result = await saveCSV.write(destination);
      clearDownload();downloadURL=URL.createObjectURL(result.blob);const link=$('#data-csv-download');link.href=downloadURL;link.download=result.name;link.hidden=false;
      message('CSVを保存しました。データ補正・規格化はCSVの値には適用していません。');
    }
    catch (error) { if (error.name !== 'AbortError') message(error.message, true); }
    finally { busy = false; controls(); await load(page.start, page.columnStart); }
  });
  $('#discard-data-edits').addEventListener('click', () => { $('#data-editor-discard-confirm').hidden = false; });
  $('#data-editor-discard').addEventListener('click', () => { cells.clear(); headers.clear(); $('#data-editor-discard-confirm').hidden = true; draw(); message('未反映の編集を取り消しました。'); });
  $('#data-editor-keep').addEventListener('click', () => { $('#data-editor-discard-confirm').hidden = true; });
  $('#close-data-editor').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  $('#data-row-previous').addEventListener('click', () => load(Math.max(0, page.start - 50), page.columnStart));
  $('#data-row-next').addEventListener('click', () => load(page.start + 50, page.columnStart));
  $('#data-column-previous').addEventListener('click', () => load(page.start, Math.max(0, page.columnStart - 12)));
  $('#data-column-next').addEventListener('click', () => load(page.start, page.columnStart + 12));
  $('#data-row-jump').addEventListener('change', event => {
    const row = Number(event.target.value);
    if (Number.isInteger(row) && row >= 1 && row <= page.rowCount) load(Math.floor((row - 1) / 50) * 50, page.columnStart);
    else event.target.value = page.start + 1;
  });
  return {open, hasDraft, get busy() {return busy;}, reset() {source = null; page = null; cells.clear(); headers.clear(); clearDownload(); $('#editable-data-table thead').replaceChildren(); $('#editable-data-table tbody').replaceChildren(); dialog.close();}};
}
