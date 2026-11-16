/**
 * Excel output for the GST tools. Offers the same small interface the GST Toolkit used with
 * xlsx-js-style (XL.t / XL.n / XL.i cells, XL.sheet, XL.name and the style set XL.S), written
 * with ExcelJS so the workbooks keep their colours, borders and number formats.
 */
import { r2 } from './helpers';

type Rgb = { rgb: string };
interface XStyle {
  font?: { bold?: boolean; sz?: number; color?: Rgb };
  fill?: { fgColor: Rgb };
  border?: Record<'top' | 'bottom' | 'left' | 'right', { style: string; color: Rgb }>;
  alignment?: { vertical?: string; horizontal?: string; wrapText?: boolean };
}
export interface XCell {
  v: string | number;
  t: 's' | 'n';
  z?: string;
  s?: XStyle;
}
export interface XSheet {
  rows: (XCell | null | undefined)[][];
  widths?: number[];
  merges?: { s: { r: number; c: number }; e: { r: number; c: number } }[];
  heights?: Record<number, number>;
}

const line = { style: 'thin', color: { rgb: 'D5DAE1' } };
const border = { top: line, bottom: line, left: line, right: line };
const S = {
  title: { font: { bold: true, sz: 14, color: { rgb: '1A1D23' } } },
  sub: { font: { sz: 10, color: { rgb: '5B6370' } } },
  head: { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1F3A5F' } }, border, alignment: { vertical: 'middle', horizontal: 'center', wrapText: true } },
  headL: { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1F3A5F' } }, border, alignment: { vertical: 'middle', wrapText: true } },
  grp: { font: { bold: true, color: { rgb: '1F3A5F' } }, fill: { fgColor: { rgb: 'E8EEF7' } }, border },
  cell: { border, alignment: { vertical: 'top' } },
  wrap: { border, alignment: { vertical: 'top', wrapText: true } },
  bold: { font: { bold: true }, border },
  tot: { font: { bold: true }, fill: { fgColor: { rgb: 'F3F4F6' } }, border },
  ok: { font: { bold: true, color: { rgb: '067647' } }, fill: { fgColor: { rgb: 'ECFDF3' } }, border },
  warn: { font: { bold: true, color: { rgb: '93370D' } }, fill: { fgColor: { rgb: 'FFFAEB' } }, border },
  err: { font: { bold: true, color: { rgb: 'B42318' } }, fill: { fgColor: { rgb: 'FEF3F2' } }, border },
  g3: { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '0E7490' } }, border, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true } },
  g1: { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '6D28D9' } }, border, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true } },
  gd: { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: 'B42318' } }, border, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true } },
} satisfies Record<string, XStyle>;

const NUM = '#,##0.00;-#,##0.00;"-"';

export const XL = {
  S,
  NUM,
  t: (v: unknown, s?: XStyle): XCell => ({ v: v == null ? '' : String(v), t: 's', s: s || S.cell }),
  n: (v: number | null | undefined, s?: XStyle, z?: string): XCell => (v == null ? { v: '', t: 's', s: s || S.cell } : { v: r2(v)!, t: 'n', z: z || NUM, s: s || S.cell }),
  i: (v: number | null | undefined, s?: XStyle): XCell => (v == null ? { v: '', t: 's', s: s || S.cell } : { v, t: 'n', z: '#,##0', s: s || S.cell }),
  sheet: (rows: XSheet['rows'], widths?: number[], merges?: XSheet['merges']): XSheet => ({ rows, widths, merges }),
  /** A sheet name Excel accepts (31 characters, no \ / ? * [ ] :), unique in this workbook. */
  name(s: string, used: Record<string, number>) {
    const b = String(s).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim();
    let n = b;
    let k = 2;
    while (used[n]) n = `${b.slice(0, 28)} ${k++}`;
    used[n] = 1;
    return n;
  },
};
export type XLApi = typeof XL;

const argb = (c?: Rgb) => (c ? { argb: `FF${c.rgb}` } : undefined);

/** Builds the .xlsx file from the sheets, in order. */
export async function buildWorkbook(sheets: { name: string; sheet: XSheet }[]): Promise<Uint8Array> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Toolyverse';
  for (const { name, sheet } of sheets) {
    const ws = wb.addWorksheet(name);
    sheet.rows.forEach((row, r) => {
      (row || []).forEach((c, ci) => {
        if (!c || c.v === '' && !c.s) return;
        const cell = ws.getCell(r + 1, ci + 1);
        cell.value = c.v;
        if (c.z) cell.numFmt = c.z;
        const s = c.s;
        if (!s) return;
        if (s.font) cell.font = { bold: s.font.bold, size: s.font.sz, color: argb(s.font.color) };
        if (s.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: argb(s.fill.fgColor) };
        if (s.border) {
          const b = (x: { style: string; color: Rgb }) => ({ style: x.style as 'thin', color: argb(x.color) });
          cell.border = { top: b(s.border.top), bottom: b(s.border.bottom), left: b(s.border.left), right: b(s.border.right) };
        }
        if (s.alignment) cell.alignment = s.alignment as never;
      });
    });
    sheet.widths?.forEach((w, i) => (ws.getColumn(i + 1).width = w));
    sheet.merges?.forEach((m) => ws.mergeCells(m.s.r + 1, m.s.c + 1, m.e.r + 1, m.e.c + 1));
    Object.entries(sheet.heights ?? {}).forEach(([r, h]) => (ws.getRow(Number(r) + 1).height = h));
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
