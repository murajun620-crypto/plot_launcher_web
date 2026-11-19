export const MAX_SHEET_SOURCES = 16;

// A workbook used by several series is one physical file and several sheets.
export function groupSheetSources(files) {
  const sources = [], indexes = new Map();
  const sourceIndexes = files.map(file => {
    if (!indexes.has(file.bytes)) {
      indexes.set(file.bytes, sources.length);
      sources.push(file);
    }
    return indexes.get(file.bytes);
  });
  return {sources, sourceIndexes};
}

export function copySheetSources(files) {
  const {sources, sourceIndexes} = groupSheetSources(files);
  const copies = sources.map(file => file.bytes.slice(0));
  return files.map((file, index) => ({...file, bytes: copies[sourceIndexes[index]]}));
}
