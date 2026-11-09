// Sparse edits are stored separately from the original files, by source/sheet/header.
export function validateTableEdits(edits = []) {
  const fail = () => { throw Error('データ表の編集内容を確認してください。'); };
  if (!Array.isArray(edits) || edits.length > 1001) fail();
  const keys = new Set(); let count = 0;
  for (const edit of edits) {
    if (!edit || !Number.isInteger(edit.sourceIndex) || edit.sourceIndex < 0 || edit.sourceIndex > 15 ||
        !Number.isInteger(edit.sheetIndex) || edit.sheetIndex < 0 || edit.sheetIndex > 1000 ||
        !Number.isInteger(edit.headerRow) || edit.headerRow < 1 || edit.headerRow > 1000 ||
        !Number.isInteger(edit.rowCount) || edit.rowCount < 0 || edit.rowCount > 200000 ||
        !Number.isInteger(edit.columnCount) || edit.columnCount < 1 || edit.columnCount > 256 ||
        !Array.isArray(edit.columns) || edit.columns.length !== edit.columnCount ||
        edit.columns.some(name => typeof name !== 'string' || !name.trim() || name.length > 200) ||
        new Set(edit.columns).size !== edit.columnCount || !Array.isArray(edit.cells)) fail();
    const key = [edit.sourceIndex, edit.sheetIndex, edit.headerRow].join(':');
    if (keys.has(key)) fail(); keys.add(key);
    const cells = new Set();
    for (const cell of edit.cells) {
      if (!Array.isArray(cell) || cell.length !== 3 || !Number.isInteger(cell[0]) || cell[0] < 0 || cell[0] >= edit.rowCount ||
          !Number.isInteger(cell[1]) || cell[1] < 0 || cell[1] >= edit.columnCount ||
          typeof cell[2] !== 'string' || cell[2].length > 10000) fail();
      const position = `${cell[0]}:${cell[1]}`; if (cells.has(position)) fail(); cells.add(position);
    }
    count += edit.cells.length;
  }
  if (count > 50000 || JSON.stringify(edits).length > 8 * 1024 * 1024) throw Error('データ表の編集は合計5万セル・8 MB以内にしてください。');
  return edits;
}
