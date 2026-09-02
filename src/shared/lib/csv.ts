import { downloadBlob } from './misc';

/** UTF-8 BOM bilan CSV — Excel to'g'ri ochadi */
export function exportCSV(filename: string, headers: string[], rows: (string | number)[][]): void {
  const esc = (v: string | number): string => {
    const s = String(v);
    if (/[";\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [headers.map(esc).join(';'), ...rows.map((r) => r.map(esc).join(';'))];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, filename);
}
