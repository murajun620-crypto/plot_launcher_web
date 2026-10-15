// Excel's clipboard is a tab-separated table, with quoted multiline cells.
export const PASTE_MAX_BYTES = 30 * 1024 * 1024;
const MAX_ROWS = 200_000, MAX_COLUMNS = 256;
const numericCell = value => {
  const trimmed = value.trim();
  return /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(trimmed) ? trimmed.replaceAll(',', '') : value;
};

export function parsePastedTable(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Excelのセル範囲をコピーして貼り付けてください。');
  if (text.length > PASTE_MAX_BYTES || new TextEncoder().encode(text).length > PASTE_MAX_BYTES)
    throw new Error('貼り付けるデータは30 MB以内にしてください。');
  text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/^(?:[ \t]*\n)+/, '');
  let quoted = false, tabs = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') {
      if (quoted && text[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted && text[i] === '\t') tabs++;
    else if (!quoted && text[i] === '\n') break;
  }
  const delimiter = tabs ? '\t' : ',';
  const rows = []; let row = [], cell = '', inQuotes = false;
  const finishCell = () => {
    row.push(cell); cell = '';
    if (row.length > MAX_COLUMNS) throw new Error('貼り付けるデータは256列以内にしてください。');
  };
  const finishRow = () => {
    finishCell(); rows.push(row); row = [];
    if (rows.length > MAX_ROWS + 2) throw new Error('貼り付けるデータは20万行以内にしてください。');
  };
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (inQuotes) {
      if (character === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += character;
    } else if (character === '"' && cell === '') inQuotes = true;
    else if (character === delimiter) finishCell();
    else if (character === '\n') finishRow();
    else cell += character;
  }
  if (inQuotes) throw new Error('引用符が閉じていません。Excelのセル範囲をコピーし直してください。');
  finishRow();
  const blank = row => row.every(cell => !cell.trim());
  while (rows.length && blank(rows.at(-1))) rows.pop();
  while (rows.length && blank(rows[0])) rows.shift();
  const columnCount = rows.reduce((count, row) => Math.max(count, row.length), 0);
  if (columnCount < 2) throw new Error('X列とY列を含む、2列以上の範囲を貼り付けてください。');
  const numeric = cell => cell.trim() !== '' && Number.isFinite(Number(numericCell(cell)));
  // A categorical first column followed by numeric values is also a data row.
  const hasHeader = !rows[0].some(numeric) || (rows.length > 1 && rows[0].some((cell, index) =>
    cell.trim() && !numeric(cell) && rows.slice(1, 11).some(row => numeric(row[index] ?? ''))));
  return { rows, columnCount, hasHeader };
}

export function pastedTableCSV(table, hasHeader = table.hasHeader) {
  const { rows, columnCount } = table, rowCount = rows.length - Number(hasHeader);
  if (rowCount < 1) throw new Error('列名だけでなく、数値データも貼り付けてください。');
  if (rowCount > MAX_ROWS) throw new Error('貼り付けるデータは20万行以内にしてください。');
  const csvCell = value => /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  const csvRows = hasHeader ? rows : [Array.from({ length: columnCount }, (_, index) => `列 ${index + 1}`), ...rows];
  const csv = csvRows.map((row, rowIndex) => Array.from({ length: columnCount }, (_, index) => {
    const value = row[index] ?? '';
    return csvCell(rowIndex === 0 ? value : numericCell(value));
  }).join(',')).join('\r\n') + '\r\n';
  if (new TextEncoder().encode(csv).length > PASTE_MAX_BYTES) throw new Error('貼り付けるデータは30 MB以内にしてください。');
  return { csv, rowCount, columnCount };
}
