// CSV for spreadsheets: UTF-8 BOM so Excel reads Vietnamese, every text cell quoted, and text starting with
// = + - @ TAB CR prefixed with ' so it is never run as a formula. Real numbers stay numbers.
const cell = value => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};
export function toCsv(columns, rows) {
  return '﻿' + [columns.map(c => cell(c.label)), ...rows.map(row => columns.map(c => cell(row[c.key])))].map(line => line.join(',')).join('\r\n');
}
export function downloadCsv(name, columns, rows) {
  const url = URL.createObjectURL(new Blob([toCsv(columns, rows)], { type: 'text/csv;charset=utf-8;' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
