import { peso } from '@tm/shared';

/**
 * Turns row objects into a plain-text table with lined-up columns, e.g.
 *   Month  Revenue
 *   -----  --------
 *   Jan    ₱45,000
 * Column names come from the keys of the first row. Keys listed in `money` are shown as pesos;
 * numbers and money are right-aligned, text is left-aligned.
 */
export function textTable(rows, money = []) {
  if (!rows.length) return '(no rows)';
  const headers = Object.keys(rows[0]);
  // Text shown in each cell
  const cell = (row, h) => {
    const value = row[h];
    if (value === null || value === undefined) return '';
    return money.includes(h) ? peso(value) : String(value);
  };
  // Right-align columns that hold numbers or money
  const rightAligned = headers.map((h) => money.includes(h) || typeof rows[0][h] === 'number');
  // Each column is as wide as its longest value (header included)
  const widths = headers.map((h) => Math.max(h.length, ...rows.map((row) => cell(row, h).length)));
  const line = (values) => values.map((v, i) => (rightAligned[i] ? v.padStart(widths[i]) : v.padEnd(widths[i]))).join('  ').trimEnd();
  return [line(headers), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map((row) => line(headers.map((h) => cell(row, h))))].join('\n');
}

/**
 * Saves text as a .txt file in the browser. Uses Windows line endings and a UTF-8 BOM
 * so Notepad shows the lines and the peso sign correctly. Returns false when there is no text.
 */
export function downloadTxt(filename, text) {
  if (!text) return false;
  const blob = new Blob([`\uFEFF${text.replace(/\r?\n/g, '\r\n')}`], { type: 'text/plain;charset=utf-8' });
  // Create a temporary link to the file, click it to download, then remove it
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Free the file from memory once the download has started
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
