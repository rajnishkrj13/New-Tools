/**
 * The Excel report of a GSTR-2B vs purchase register reconciliation: a summary, the months, every
 * line with both sides and the differences, a sheet per outcome that needs action, supplier
 * totals, and a message per supplier to follow up.
 */
import { XL, buildWorkbook, type XCell, type XSheet } from './excel';
import { STATUS_LABEL, dayText, dues, followUps, fyOfDeadline, monthly, suppliers, taxOf, totals, type Doc, type Line, type Result, type Status } from './recon2b';

const S = XL.S;
const tone: Record<Status, Parameters<typeof XL.t>[1]> = { matched: S.ok, differs: S.warn, probable: S.warn, only2b: S.err, onlyBooks: S.err, outside: S.cell };
const DATE = 'dd-mm-yyyy';

const HEAD = [
  'Status', 'Notes', 'Supplier GSTIN', 'Supplier name', 'Document', '2B section', 'GSTR-2B month', 'Invoice / bill of entry no. (2B)', 'Invoice no. (books)',
  'Date (2B)', 'Date (books)', 'Booked on', 'Books row', 'Taxable (2B)', 'Taxable (books)', 'IGST (2B)', 'IGST (books)', 'CGST (2B)', 'CGST (books)',
  'SGST (2B)', 'SGST (books)', 'Cess (2B)', 'Cess (books)', 'Total tax (2B)', 'Total tax (books)', 'Tax difference (2B − books)', 'ITC availability', 'Reverse charge', 'Last date for ITC',
];
const WIDTHS = [22, 48, 18, 34, 12, 9, 10, 20, 20, 11, 11, 11, 8, 14, 14, 12, 12, 12, 12, 12, 12, 10, 10, 14, 14, 16, 10, 9, 11];

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
    date(l.bk?.booked),
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
    date(l.deadline),
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
  /** Today (Excel serial), for the ITC time limit. */
  today?: number | null;
}

const LEFT: Partial<Record<Status, string>> = { only2b: 'in 2B, not in the books', onlyBooks: 'in the books, not in 2B', differs: 'amounts differ', probable: 'probable matches' };

/** The workbook, ready to save. */
export async function reconWorkbook(res: Result, info: ReportInfo): Promise<Uint8Array> {
  const t = totals(res.lines);
  const today = info.today ?? null;
  const due = today != null ? dues(res.lines, today) : { soon: [], barred: [] };
  const decided = { confirmed: res.lines.filter((l) => l.decided === 'confirmed').length, paired: res.lines.filter((l) => l.decided === 'paired').length };
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
      ...(decided.confirmed || decided.paired ? [[], [XL.t(`Your decisions: ${decided.confirmed} probable pair${decided.confirmed === 1 ? '' : 's'} confirmed, ${decided.paired} pair${decided.paired === 1 ? '' : 's'} made by hand (see the notes).`, S.sub)]] : []),
      ...(due.soon.length || due.barred.length
        ? [
            [],
            [XL.t('ITC time limit (Section 16(4))', S.headL), XL.t('Documents', S.headL), XL.t('Tax at stake', S.headL), XL.t('', S.headL), XL.t('', S.headL), XL.t('Still open', S.headL)],
            ...due.soon.map((d) => [XL.t(`${fyOfDeadline(d.deadline)}: take by ${dayText(d.deadline)}`, S.warn), XL.i(d.count), XL.n(d.tax), null, null, XL.t(open(d.by), S.wrap)]),
            ...due.barred.map((d) => [XL.t(`${fyOfDeadline(d.deadline)}: time-barred since ${dayText(d.deadline)}`, S.err), XL.i(d.count), XL.n(d.tax), null, null, XL.t(open(d.by), S.wrap)]),
          ]
        : []),
    ],
    widths: [32, 12, 16, 16, 16, 70],
  };
  const months = monthly(res);
  const monthSheet: XSheet = {
    rows: [
      ['GSTR-2B month', 'ITC in GSTR-2B', 'ITC booked that month', 'Difference', 'Of the 2B ITC, booked in another month'].map((h) => XL.t(h, S.headL)),
      ...months.map((m) => [XL.n(m.month, S.cell, 'mmm-yyyy'), XL.n(m.tax2b), XL.n(m.taxBooks), XL.n(m.tax2b - m.taxBooks, Math.abs(m.tax2b - m.taxBooks) > 0.005 ? S.warn : S.cell), XL.n(m.otherMonth)]),
      [XL.t('Total', S.tot), ...(['tax2b', 'taxBooks'] as const).map((k) => XL.n(months.reduce((s, m) => s + m[k], 0), S.tot)), XL.n(months.reduce((s, m) => s + m.tax2b - m.taxBooks, 0), S.tot), XL.n(months.reduce((s, m) => s + m.otherMonth, 0), S.tot)],
      [],
      [XL.t('Booked that month: by the voucher date where the register has one, else the invoice date. Hold these against the ITC taken in each GSTR-3B.', S.sub)],
    ],
    widths: [16, 18, 20, 16, 26],
  };
  const follow = followUps(res, { today });
  const followSheet: XSheet = {
    rows: [
      ['Supplier GSTIN', 'Supplier name', 'Tax involved', 'Bills', 'Message to send'].map((h) => XL.t(h, S.headL)),
      ...follow.map((f) => [XL.t(f.gstin), XL.t(f.name), XL.n(f.tax, S.bold), XL.i(f.lines.length), XL.t(f.text, S.wrap)]),
    ],
    widths: [18, 30, 14, 8, 100],
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
    { name: 'Month-wise', sheet: monthSheet },
    { name: 'All documents', sheet: linesSheet(res.lines) },
    { name: 'Amounts differ', sheet: linesSheet(by(['differs'])) },
    { name: 'Probable matches', sheet: linesSheet(by(['probable'])) },
    { name: 'Not in books', sheet: linesSheet(by(['only2b'])) },
    { name: 'Not in 2B', sheet: linesSheet(by(['onlyBooks'])) },
    { name: 'Outside 2B months', sheet: linesSheet(by(['outside'])) },
    { name: 'Suppliers', sheet: supSheet },
    { name: 'Supplier follow-up', sheet: followSheet },
  ];
  return buildWorkbook(sheets);
}

/** "2 in 2B, not in the books (₹1,800.00); 1 amounts differ (₹18.00)". */
function open(by: Partial<Record<Status, { count: number; tax: number }>>): string {
  return Object.entries(by)
    .map(([k, v]) => `${v.count} ${LEFT[k as Status] ?? STATUS_LABEL[k as Status]} (₹${v.tax.toFixed(2)})`)
    .join('; ');
}

export { dayText };
