/**
 * The Excel report of a GSTR-2B vs purchase register reconciliation: a summary, every line with
 * both sides and the differences, a sheet per outcome that needs action, and supplier totals.
 */
import { XL, buildWorkbook, type XCell, type XSheet } from './excel';
import { STATUS_LABEL, dayText, suppliers, taxOf, totals, type Doc, type Line, type Result, type Status } from './recon2b';

const S = XL.S;
const tone: Record<Status, Parameters<typeof XL.t>[1]> = { matched: S.ok, differs: S.warn, probable: S.warn, only2b: S.err, onlyBooks: S.err, outside: S.cell };
const DATE = 'dd-mm-yyyy';

const HEAD = [
  'Status', 'Notes', 'Supplier GSTIN', 'Supplier name', 'Document', '2B section', 'GSTR-2B month', 'Invoice no. (2B)', 'Invoice no. (books)',
  'Date (2B)', 'Date (books)', 'Books row', 'Taxable (2B)', 'Taxable (books)', 'IGST (2B)', 'IGST (books)', 'CGST (2B)', 'CGST (books)',
  'SGST (2B)', 'SGST (books)', 'Cess (2B)', 'Cess (books)', 'Total tax (2B)', 'Total tax (books)', 'Tax difference (2B − books)', 'ITC availability', 'Reverse charge',
];
const WIDTHS = [22, 48, 18, 34, 12, 9, 10, 20, 20, 11, 11, 8, 14, 14, 12, 12, 12, 12, 12, 12, 10, 10, 14, 14, 16, 10, 9];

const month = (m: number | null | undefined) => {
  if (m == null) return '';
  const t = new Date(Date.UTC(1899, 11, 30) + m * 86400000);
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][t.getUTCMonth()]}-${String(t.getUTCFullYear()).slice(2)}`;
};
const date = (d: number | null | undefined): XCell => (d == null ? XL.t('') : XL.n(d, S.cell, DATE));
const amt = (d: Doc | null, k: 'taxable' | 'igst' | 'cgst' | 'sgst' | 'cess') => XL.n(d ? d[k] : null);

function row(l: Line): XCell[] {
  const d = l.b2 ?? l.bk!;
  return [
    XL.t(STATUS_LABEL[l.status], tone[l.status]),
    XL.t(l.notes.join('; '), S.wrap),
    XL.t(d.gstin),
    XL.t(l.b2?.name || l.bk?.name || ''),
    XL.t(d.kind),
    XL.t(l.b2?.section ?? ''),
    XL.t(month(l.b2?.month)),
    XL.t(l.b2?.no ?? ''),
    XL.t(l.bk?.no ?? ''),
    date(l.b2?.date),
    date(l.bk?.date),
    l.bk ? XL.i(l.bk.row) : XL.t(''),
    amt(l.b2, 'taxable'),
    amt(l.bk, 'taxable'),
    amt(l.b2, 'igst'),
    amt(l.bk, 'igst'),
    amt(l.b2, 'cgst'),
    amt(l.bk, 'cgst'),
    amt(l.b2, 'sgst'),
    amt(l.bk, 'sgst'),
    amt(l.b2, 'cess'),
    amt(l.bk, 'cess'),
    XL.n(l.b2 ? taxOf(l.b2) : null, S.bold),
    XL.n(l.bk ? taxOf(l.bk) : null, S.bold),
    XL.n(l.diff.tax, Math.abs(l.diff.tax) > 0.005 ? S.warn : S.cell),
    XL.t(l.b2?.itc ?? ''),
    XL.t(l.b2 ? (l.b2.rcm ? 'Yes' : 'No') : ''),
  ];
}

function linesSheet(lines: Line[]): XSheet {
  return { rows: [HEAD.map((h) => XL.t(h, S.headL)), ...lines.map(row)], widths: WIDTHS };
}

export interface ReportInfo {
  /** Short description of what was compared, for the summary sheet. */
  twoB: string;
  books: string;
  tol: number;
  date: string;
}

/** The workbook, ready to save. */
export async function reconWorkbook(res: Result, info: ReportInfo): Promise<Uint8Array> {
  const t = totals(res.lines);
  const order: Status[] = ['matched', 'differs', 'probable', 'only2b', 'onlyBooks', 'outside'];
  const what: Record<Status, string> = {
    matched: 'Nothing to do.',
    differs: 'Check the amounts with the supplier or correct the books.',
    probable: 'Confirm each pair: the invoice number does not match exactly.',
    only2b: 'Not entered in the books yet, or entered without the supplier GSTIN or with a different number.',
    onlyBooks: 'The supplier has not reported it in GSTR-1 (or reported it under another GSTIN or number): follow up before claiming ITC.',
    outside: 'Dated outside the GSTR-2B months loaded: load those months to check them.',
  };
  const summary: XSheet = {
    rows: [
      [XL.t('GSTR-2B vs purchase register', S.title)],
      [XL.t(`GSTR-2B: ${info.twoB}`, S.sub)],
      [XL.t(`Books: ${info.books}`, S.sub)],
      [XL.t(`Amounts within ₹${info.tol.toFixed(2)} are taken as equal. Prepared ${info.date}.`, S.sub)],
      [],
      ['Result', 'Documents', 'Tax in 2B', 'Tax in books', 'Difference', 'What to do'].map((h) => XL.t(h, S.headL)),
      ...order.map((k) => [XL.t(STATUS_LABEL[k], tone[k]), XL.i(t[k].count), XL.n(t[k].tax2b), XL.n(t[k].taxBooks), XL.n(t[k].tax2b - t[k].taxBooks), XL.t(what[k], S.wrap)]),
      [XL.t('All', S.tot), XL.i(t.all.count, S.tot), XL.n(t.all.tax2b, S.tot), XL.n(t.all.taxBooks - t.outside.taxBooks, S.tot), XL.n(t.all.tax2b - (t.all.taxBooks - t.outside.taxBooks), S.tot), XL.t('Books tax leaves out documents outside the GSTR-2B months.', S.wrap)],
    ],
    widths: [32, 12, 16, 16, 16, 70],
  };
  const sup = suppliers(res.lines);
  const supSheet: XSheet = {
    rows: [
      ['Supplier GSTIN', 'Supplier name', 'Tax in 2B', 'Tax in books', 'Difference (2B − books)', ...order.map((k) => STATUS_LABEL[k])].map((h) => XL.t(h, S.headL)),
      ...sup.map((s) => [XL.t(s.gstin), XL.t(s.name), XL.n(s.tax2b), XL.n(s.taxBooks), XL.n(s.tax2b - s.taxBooks, Math.abs(s.tax2b - s.taxBooks) > 0.005 ? S.warn : S.cell), ...order.map((k) => XL.i(s.counts[k] || null))]),
    ],
    widths: [18, 36, 14, 14, 16, 10, 10, 10, 12, 12, 12],
  };
  const by = (k: Status[]) => res.lines.filter((l) => k.includes(l.status));
  const sheets = [
    { name: 'Summary', sheet: summary },
    { name: 'All documents', sheet: linesSheet(res.lines) },
    { name: 'Amounts differ', sheet: linesSheet(by(['differs'])) },
    { name: 'Probable matches', sheet: linesSheet(by(['probable'])) },
    { name: 'Not in books', sheet: linesSheet(by(['only2b'])) },
    { name: 'Not in 2B', sheet: linesSheet(by(['onlyBooks'])) },
    { name: 'Outside 2B months', sheet: linesSheet(by(['outside'])) },
    { name: 'Suppliers', sheet: supSheet },
  ];
  return buildWorkbook(sheets);
}

export { dayText };
