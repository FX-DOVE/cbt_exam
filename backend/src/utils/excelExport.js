import xlsx from 'xlsx';

export function jsonToXlsxBuffer(rows, sheetName = 'Sheet1') {
  const ws = xlsx.utils.json_to_sheet(rows);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export function workbookToBuffer(wb) {
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
