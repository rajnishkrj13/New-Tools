/**
 * Tables to an Excel workbook: one sheet per table (or as chosen), real numbers and dates where
 * the cell holds one, identifiers kept as text, merged cells, bold frozen headings with filters,
 * right-to-left sheets for Urdu and other Arabic-script tables, uncertain cells marked, and an
 * extraction report. The finished file is opened again and checked before it is handed over.
 */
import { isRtl } from '../lang';
import { checkTable, type Finding } from './check';
import { ID_HEADING, valueOf } from './values';
import type { Table } from './types';

export interface SheetPlan {
  table: Table;
  sheet: string;
}

export interface WorkbookOptions {
  /** Numbers and dates as Excel values (true) or every cell as the text it shows (false). */
  typed: boolean;
  /** Fill uncertain cells yellow with a note. */
  mark: boolean;
  report: boolean;
  source: string;
  warnings?: string[];
}

/** A sheet name Excel accepts: 31 characters, none of \ / ? * [ ] :, unique in the workbook. */
export function sheetName(name: string, used: Set<string>): string {
  const base = (name.replace(/[\\/?*[\]:]/g, ' ').trim() || 'Sheet').slice(0, 31);
  let n = base;
  for (let k = 2; used.has(n.toLowerCase()); k++) n = `${base.slice(0, 27)} (${k})`;
  used.add(n.toLowerCase());
  return n;
}

const THIN = { style: 'thin' as const, color: { argb: 'FFBFC5CC' } };
const BORDER = { top: THIN, bottom: THIN, left: THIN, right: THIN };

export async function tablesWorkbook(plans: SheetPlan[], o: WorkbookOptions): Promise<{ bytes: Uint8Array; findings: Map<string, Finding[]> }> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Toolyverse';
  const findings = new Map<string, Finding[]>();

  // Several tables can share a sheet (when combined): they go one under the other, a blank row between.
  const bySheet = new Map<string, Table[]>();
  for (const p of plans) bySheet.set(p.sheet, [...(bySheet.get(p.sheet) ?? []), p.table]);

  for (const [name, tables] of bySheet) {
    const rtl = tables.every((t) => t.rtl ?? isRtl(t.rows.flat().map((c) => c.text).join(' ')));
    const ws = wb.addWorksheet(name, { views: [{ rightToLeft: rtl }] });
    const widths: number[] = [];
    let top = 1;
    for (const t of tables) {
      findings.set(t.id, checkTable(t).findings);
      const nc = t.rows[0]?.length ?? 0;
      const idCol = Array.from({ length: nc }, (_, c) => ID_HEADING.test(t.rows.slice(0, Math.max(1, t.headerRows)).map((r) => r[c]?.text ?? '').join(' ')));
      t.rows.forEach((row, r) => {
        row.forEach((c, k) => {
          if (c.hidden) return;
          const x = ws.getCell(top + r, k + 1);
          const head = r < t.headerRows;
          const v = o.typed && !head ? valueOf(c.text, idCol[k]) : { kind: 'text' as const, value: c.text };
          if (v.kind === 'number') {
            x.value = v.value;
            x.numFmt = v.format;
          } else if (v.kind === 'date') {
            x.value = v.value;
            x.numFmt = v.format;
          } else x.value = c.link ? { text: c.text, hyperlink: c.link } : c.text;
          const cellRtl = isRtl(c.text);
          x.alignment = { vertical: 'top', wrapText: c.text.includes('\n'), ...(cellRtl ? { horizontal: 'right' as const, readingOrder: 'rtl' as const } : {}) };
          x.border = BORDER;
          if (head || c.bold) x.font = { bold: true };
          // The PDF's own shading; headings without any get a light blue.
          if (c.fill) x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${c.fill}` } };
          else if (head) x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF5' } };
          if (o.mark && c.text && (c.conf ?? 100) < 80) {
            x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2B3' } };
            x.note = `Read with low certainty (${c.conf}%). Check against the document.`;
          }
          if (c.rowSpan > 1 || c.colSpan > 1) ws.mergeCells(top + r, k + 1, top + r + c.rowSpan - 1, k + c.colSpan);
          const longest = Math.max(...c.text.split('\n').map((l) => l.length));
          if (c.colSpan === 1) widths[k] = Math.max(widths[k] ?? 6, Math.min(60, longest * 1.15 + 2));
        });
        // Empty cells of the grid still get borders, so blank cells stay visible as cells.
        for (let k = 0; k < nc; k++) if (!row[k].hidden && !row[k].text) ws.getCell(top + r, k + 1).border = BORDER;
      });
      if (tables.length === 1 && t.headerRows > 0 && t.headerRows <= 4) {
        ws.views = [{ state: 'frozen', ySplit: t.headerRows, rightToLeft: rtl }];
        const lastHead = t.rows[t.headerRows - 1];
        if (lastHead.every((c) => c.colSpan === 1 && c.rowSpan === 1) && t.rows.length > t.headerRows) ws.autoFilter = { from: { row: t.headerRows, column: 1 }, to: { row: t.headerRows, column: nc } };
      }
      top += t.rows.length + 1;
    }
    widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  }

  if (o.report) {
    const ws = wb.addWorksheet(sheetName('Extraction report', new Set(plans.map((p) => p.sheet.toLowerCase()))));
    ws.columns = [{ width: 34 }, { width: 14 }, { width: 10 }, { width: 10 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 80 }];
    ws.addRow([`Source: ${o.source}`]).font = { bold: true };
    for (const w of o.warnings ?? []) ws.addRow([`Note: ${w}`]);
    ws.addRow([]);
    const head = ws.addRow(['Table', 'Pages', 'Rows', 'Columns', 'Read as', 'Table found %', 'Rows %', 'Columns %', 'Lowest cell %', 'Checks and notes']);
    head.font = { bold: true };
    const methodName: Record<Table['method'], string> = { ruled: 'Ruled grid', 'ruled-partial': 'Column lines', aligned: 'Aligned text', 'scan-ruled': 'Scan, ruled', 'scan-aligned': 'Scan, aligned', word: 'Word table' };
    for (const p of plans) {
      const t = p.table;
      const f = findings.get(t.id) ?? [];
      const text = [...t.notes, ...f.map((x) => `${x.level === 'error' ? 'MISMATCH: ' : x.level === 'warning' ? 'Check: ' : 'OK: '}${x.message}`)].join('\n');
      const row = ws.addRow([`${t.name} → sheet "${p.sheet}"`, t.pages.map((n) => n + 1).join(', '), t.rows.length, t.rows[0]?.length ?? 0, methodName[t.method], t.confidence.table, t.confidence.rows, t.confidence.cols, t.confidence.cells, text]);
      row.alignment = { vertical: 'top', wrapText: true };
      if (f.some((x) => x.level === 'error')) row.getCell(10).font = { color: { argb: 'FFB42318' } };
    }
    ws.addRow([]);
    ws.addRow(['Certainty figures come from the extraction itself: how cleanly white space or drawn lines separate the columns and rows, and OCR scores for scanned pages. Totals and balances are checked, never changed.']).alignment = { wrapText: true };
  }

  const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
  // Open the file again before handing it over: a broken workbook is never offered as a result.
  const check = new ExcelJS.Workbook();
  await check.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  if (check.worksheets.length !== bySheet.size + (o.report ? 1 : 0)) throw new Error('The Excel file did not come out complete. Please try again.');
  return { bytes, findings };
}
