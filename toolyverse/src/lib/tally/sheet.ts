/**
 * Spreadsheets in and out: the 12-column voucher template, recognising the columns of any
 * other sheet, turning rows into vouchers (one row per ledger line, several rows per voucher),
 * and the Excel workbooks the Tally tools download. Workbooks are written with the site's
 * existing ExcelJS writer (lib/gst/excel).
 */
import { XL, buildWorkbook, type XSheet } from '@/lib/gst/excel';
import { baseType, billCell, costCell, parseAmount, parseBills, parseCostCentres, parseDate, round2, totals, type Entry, type Voucher } from './model';
import type { Issue, Summary } from './validate';
import type { TallyRead } from './read';

export const FIELDS = [
  { key: 'date', label: 'Voucher Date', names: ['voucher date', 'date', 'vch date', 'txn date', 'transaction date', 'posting date', 'entry date', 'doc date'] },
  { key: 'type', label: 'Voucher Type', names: ['voucher type', 'vch type', 'voucher type name', 'type of voucher', 'entry type'] },
  { key: 'number', label: 'Voucher Number', names: ['voucher number', 'voucher no', 'vch no', 'no', 'no.', 'number', 'vno', 'voucher no.', 'vch no.', 'voucher #', 'entry no', 'jv no', 'jv number', 'doc no', 'document no'] },
  { key: 'reference', label: 'Reference Number', names: ['reference number', 'reference no', 'reference', 'ref no', 'ref no.', 'ref', 'invoice no', 'invoice number', 'bill no', 'supplier invoice no'] },
  { key: 'referenceDate', label: 'Reference Date', names: ['reference date', 'ref date', 'invoice date', 'bill date', 'supplier invoice date'] },
  { key: 'ledger', label: 'Ledger Name', names: ['ledger name', 'ledger', 'account', 'account name', 'particulars', 'gl account', 'gl name', 'account head', 'head'] },
  { key: 'debit', label: 'Debit Amount', names: ['debit amount', 'debit', 'dr', 'dr amount', 'dr.', 'debit (rs)', 'debit (inr)', 'withdrawal'] },
  { key: 'credit', label: 'Credit Amount', names: ['credit amount', 'credit', 'cr', 'cr amount', 'cr.', 'credit (rs)', 'credit (inr)', 'deposit'] },
  { key: 'narration', label: 'Voucher Narration', names: ['voucher narration', 'narration', 'description', 'remarks', 'memo', 'notes', 'details'] },
  { key: 'costCentre', label: 'Cost Centre', names: ['cost centre', 'cost center', 'cost centre name', 'cost center name', 'branch', 'department'] },
  { key: 'costCategory', label: 'Cost Category', names: ['cost category', 'cost category name'] },
  { key: 'bill', label: 'Bill-wise Reference', names: ['bill-wise reference', 'billwise reference', 'bill wise reference', 'bill reference', 'bill ref', 'against ref', 'agst ref', 'bill-wise'] },
  { key: 'amount', label: 'Amount (one column)', names: ['amount', 'amt', 'value', 'net amount'] },
  { key: 'side', label: 'Dr / Cr', names: ['dr/cr', 'dr / cr', 'side', 'debit/credit', 'type (dr/cr)', 'drcr'] },
] as const;

export type FieldKey = (typeof FIELDS)[number]['key'];
export type Mapping = Record<FieldKey, number>;

/** The 12 template columns, A to L. */
export const TEMPLATE_KEYS: FieldKey[] = ['date', 'type', 'number', 'reference', 'referenceDate', 'ledger', 'debit', 'credit', 'narration', 'costCentre', 'costCategory', 'bill'];
export const TEMPLATE_HEADERS = TEMPLATE_KEYS.map((k) => FIELDS.find((f) => f.key === k)!.label);

const norm = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[_*:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Finds the header row (within the first 25 rows) and which column holds which field. */
export function detectColumns(rows: unknown[][]): { headerRow: number; mapping: Mapping; matched: number } {
  let best = { headerRow: -1, mapping: emptyMapping(), matched: 0 };
  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const mapping = emptyMapping();
    const cells = (rows[r] ?? []).map(norm);
    let matched = 0;
    for (const f of FIELDS) {
      let col = cells.findIndex((c) => c && (f.names as readonly string[]).includes(c));
      if (col < 0) col = cells.findIndex((c) => c && (f.names as readonly string[]).some((n) => n.length > 3 && c.startsWith(n)));
      if (col >= 0 && !Object.values(mapping).includes(col)) {
        mapping[f.key] = col;
        matched++;
      }
    }
    if (matched > best.matched && mapping.ledger >= 0) best = { headerRow: r, mapping, matched };
  }
  return best;
}

export const emptyMapping = (): Mapping => Object.fromEntries(FIELDS.map((f) => [f.key, -1])) as Mapping;

export interface RowProblem {
  row: number;
  message: string;
}

/**
 * Rows to vouchers. A voucher's date, type and number may be written on its first row only;
 * a new voucher starts when the number (or date) changes, or, when there are no numbers, as
 * soon as the lines so far balance.
 */
export function rowsToVouchers(rows: unknown[][], mapping: Mapping, opts: { headerRow: number; defaultType: string }): { vouchers: Voucher[]; problems: RowProblem[] } {
  const vouchers: Voucher[] = [];
  const problems: RowProblem[] = [];
  const get = (r: unknown[], k: FieldKey) => (mapping[k] >= 0 ? r[mapping[k]] : undefined);
  const str = (v: unknown) => (v == null ? '' : v instanceof Date ? (parseDate(v) ?? '') : String(v).trim());
  let cur: Voucher | null = null;

  for (let i = opts.headerRow + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const rowNo = i + 1;
    const ledger = str(get(r, 'ledger'));
    let dr = parseAmount(get(r, 'debit'));
    let cr = parseAmount(get(r, 'credit'));
    if (mapping.amount >= 0 && !dr && !cr) {
      const raw = get(r, 'amount');
      const amt = parseAmount(raw);
      const side = str(get(r, 'side')).toLowerCase() || (/cr\.?\s*$/i.test(String(raw ?? '')) ? 'cr' : /dr\.?\s*$/i.test(String(raw ?? '')) ? 'dr' : '');
      if (side.startsWith('c')) cr = Math.abs(amt);
      else if (side.startsWith('d')) dr = Math.abs(amt);
      else if (amt < 0) cr = -amt;
      else dr = amt;
    }
    // A negative debit is a credit and vice versa (many exports write it that way).
    if (dr < 0 && !cr) [dr, cr] = [0, -dr];
    if (cr < 0 && !dr) [cr, dr] = [0, -cr];
    const number = str(get(r, 'number'));
    const dateRaw = get(r, 'date');
    const date = dateRaw === undefined || dateRaw === '' ? '' : (parseDate(dateRaw) ?? `?${str(dateRaw)}`);
    const type = str(get(r, 'type'));
    const blank = !ledger && !dr && !cr && !number && !date;
    if (blank) continue;
    if (!ledger && !dr && !cr) {
      // A row with voucher details only (a heading row of a voucher): starts it, no line.
      if (!number && !date) continue;
    }

    const balanced = cur && cur.entries.length > 1 && Math.abs(totals(cur).dr - totals(cur).cr) < 0.005;
    const startsNew =
      !cur ||
      (number && number !== cur.number) ||
      (number && type && type !== cur.type) ||
      (date && date !== cur.date && (!!number || balanced)) ||
      (!number && !cur.number && balanced);
    if (startsNew) {
      const prev = cur as Voucher | null;
      cur = {
        date: date.startsWith('?') ? date.slice(1) : date || prev?.date || '',
        type: type || (prev && !number ? prev.type : '') || opts.defaultType,
        number,
        reference: str(get(r, 'reference')),
        referenceDate: '',
        narration: str(get(r, 'narration')),
        entries: [],
        line: rowNo,
      };
      if (date.startsWith('?')) problems.push({ row: rowNo, message: `"${date.slice(1)}" is not a date this tool can read. Use DD-MM-YYYY.` });
      const refDate = get(r, 'referenceDate');
      if (refDate !== undefined && refDate !== '') {
        const d = parseDate(refDate);
        if (d) cur.referenceDate = d;
        else problems.push({ row: rowNo, message: `Reference date "${str(refDate)}" is not a date this tool can read.` });
      }
      vouchers.push(cur);
    } else if (cur) {
      if (!cur.narration) cur.narration = str(get(r, 'narration'));
      if (!cur.reference) cur.reference = str(get(r, 'reference'));
    }
    if (!ledger && !dr && !cr) continue;
    const amount = dr || cr;
    const base = baseType(cur!.type);
    const cc = parseCostCentres(str(get(r, 'costCentre')), amount);
    const bills = parseBills(str(get(r, 'bill')), amount, base);
    if (cc.error) problems.push({ row: rowNo, message: cc.error });
    if (bills.error) problems.push({ row: rowNo, message: bills.error });
    const e: Entry = { ledger, dr: Number.isNaN(dr) ? NaN : round2(dr), cr: Number.isNaN(cr) ? NaN : round2(cr), costCategory: str(get(r, 'costCategory')), costCentres: cc.allocs, bills: bills.bills, row: rowNo };
    if (Number.isNaN(dr) || Number.isNaN(cr)) problems.push({ row: rowNo, message: 'The amount is not a number.' });
    cur!.entries.push(e);
  }
  return { vouchers, problems };
}

/** One row per ledger line, voucher details repeated on every row so the sheet sorts and filters. */
export function vouchersToRows(vouchers: Voucher[]): (string | number)[][] {
  const rows: (string | number)[][] = [];
  for (const v of vouchers) {
    const base = baseType(v.type);
    for (const e of v.entries) rows.push([v.date, v.type, v.number, v.reference, v.referenceDate, e.ledger, e.dr || '', e.cr || '', v.narration, costCell(e), e.costCentres.length ? e.costCategory : '', billCell(e, base)]);
  }
  return rows;
}

// ---- Workbooks ------------------------------------------------------------------------------------

const serial = (isoDate: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 + 25569 : null;
};
const dateCell = (isoDate: string) => {
  const s = serial(isoDate);
  return s == null ? XL.t(isoDate) : XL.n(s, XL.S.cell, 'dd-mm-yyyy');
};
const head = (labels: string[]) => labels.map((l) => XL.t(l, XL.S.headL));
const WIDTHS = [12, 14, 13, 15, 13, 32, 14, 14, 40, 22, 18, 24];

function voucherSheet(vouchers: Voucher[], extraCols: { label: string; get: (v: Voucher, e: Entry) => string }[] = []): XSheet {
  const rows: XSheet['rows'] = [head([...TEMPLATE_HEADERS, ...extraCols.map((c) => c.label)])];
  for (const v of vouchers) {
    const base = baseType(v.type);
    for (const e of v.entries)
      rows.push([
        dateCell(v.date),
        XL.t(v.type),
        XL.t(v.number),
        XL.t(v.reference),
        v.referenceDate ? dateCell(v.referenceDate) : XL.t(''),
        XL.t(e.ledger),
        e.dr ? XL.n(e.dr) : XL.t(''),
        e.cr ? XL.n(e.cr) : XL.t(''),
        XL.t(v.narration, XL.S.wrap),
        XL.t(costCell(e)),
        XL.t(e.costCentres.length ? e.costCategory : ''),
        XL.t(billCell(e, base)),
        ...extraCols.map((c) => XL.t(c.get(v, e))),
      ]);
  }
  return { rows, widths: [...WIDTHS, ...extraCols.map(() => 22)] };
}

function summarySheet(vouchers: Voucher[], bad?: Set<number>): XSheet {
  const rows: XSheet['rows'] = [head(['Voucher Date', 'Voucher Type', 'Voucher Number', 'Reference', 'Ledger lines', 'Total Debit', 'Total Credit', 'Difference', 'Narration', ...(bad ? ['Check'] : [])])];
  vouchers.forEach((v, i) => {
    const t = totals(v);
    const diff = round2(t.dr - t.cr);
    rows.push([
      dateCell(v.date),
      XL.t(v.type),
      XL.t(v.number),
      XL.t(v.reference),
      XL.i(v.entries.length),
      XL.n(t.dr),
      XL.n(t.cr),
      XL.n(diff, diff ? XL.S.err : XL.S.cell),
      XL.t(v.narration, XL.S.wrap),
      ...(bad ? [bad.has(i) ? XL.t('Has errors', XL.S.err) : XL.t('OK', XL.S.ok)] : []),
    ]);
  });
  const all = vouchers.reduce((a, v) => ({ dr: a.dr + totals(v).dr, cr: a.cr + totals(v).cr }), { dr: 0, cr: 0 });
  rows.push([XL.t('Total', XL.S.tot), XL.t('', XL.S.tot), XL.t('', XL.S.tot), XL.t('', XL.S.tot), XL.i(vouchers.reduce((n, v) => n + v.entries.length, 0), XL.S.tot), XL.n(all.dr, XL.S.tot), XL.n(all.cr, XL.S.tot), XL.n(round2(all.dr - all.cr), XL.S.tot), XL.t('', XL.S.tot)]);
  return { rows, widths: [12, 14, 14, 15, 10, 15, 15, 12, 50, 12] };
}

function issuesSheet(issues: Issue[], vouchers: Voucher[]): XSheet {
  const rows: XSheet['rows'] = [head(['Level', 'Voucher', 'Row / line', 'Problem'])];
  for (const x of issues)
    rows.push([x.level === 'error' ? XL.t('Error', XL.S.err) : XL.t('Warning', XL.S.warn), XL.t(x.voucher >= 0 ? `${vouchers[x.voucher]?.type ?? ''} ${vouchers[x.voucher]?.number || `#${x.voucher + 1}`}` : 'File'), x.at ? XL.i(x.at) : XL.t(''), XL.t(x.message, XL.S.wrap)]);
  if (!issues.length) rows.push([XL.t('OK', XL.S.ok), XL.t(''), XL.t(''), XL.t('No problems found.')]);
  return { rows, widths: [10, 22, 10, 90] };
}

const EXAMPLE: Voucher[] = [
  {
    date: '2026-04-30',
    type: 'Journal',
    number: 'JV-001',
    reference: '',
    referenceDate: '',
    narration: 'Rent for April 2026 provided',
    entries: [
      { ledger: 'Rent', dr: 50000, cr: 0, costCategory: 'Primary Cost Category', costCentres: [{ centre: 'Head Office', amount: 30000 }, { centre: 'Branch', amount: 20000 }], bills: [] },
      { ledger: 'TDS Payable on Rent', dr: 0, cr: 5000, costCategory: '', costCentres: [], bills: [] },
      { ledger: 'Rent Payable', dr: 0, cr: 45000, costCategory: '', costCentres: [], bills: [{ name: 'RENT-APR26', type: 'New Ref', amount: 45000 }] },
    ],
  },
  {
    date: '2026-04-30',
    type: 'Journal',
    number: 'JV-002',
    reference: 'DEP-FY27',
    referenceDate: '',
    narration: 'Depreciation on computers for April 2026',
    entries: [
      { ledger: 'Depreciation', dr: 2500, cr: 0, costCategory: '', costCentres: [], bills: [] },
      { ledger: 'Computers', dr: 0, cr: 2500, costCategory: '', costCentres: [], bills: [] },
    ],
  },
];

const HOW = [
  ['Column', 'What to write'],
  ['Voucher Date', 'DD-MM-YYYY (01-04-2026), or a date cell. Write it on the first row of each voucher; rows below may be left blank.'],
  ['Voucher Type', 'Journal, Payment, Receipt, Contra, Sales, Purchase, Debit Note or Credit Note, or your own type name exactly as in Tally (for example "Sales GST").'],
  ['Voucher Number', 'The same number on every row of one voucher. Leave blank if the voucher type numbers itself in Tally.'],
  ['Reference Number / Date', "Supplier's bill number and date, cheque number or any reference. Optional."],
  ['Ledger Name', 'Exactly as the ledger is named in Tally, including spaces and capitals.'],
  ['Debit Amount / Credit Amount', 'One of the two on each row. Debits and credits of a voucher must be equal.'],
  ['Voucher Narration', 'Optional; written once per voucher.'],
  ['Cost Centre', 'A cost centre name for the whole row, or a split: "Head Office: 30000; Branch: 20000".'],
  ['Cost Category', 'Optional; "Primary Cost Category" is used when blank.'],
  ['Bill-wise Reference', 'Bill name for bill-wise ledgers (parties): "INV-101", "Agst Ref INV-101", "New Ref INV-9: 5000; Agst Ref INV-3: 2000", "Advance ADV-1" or "On Account".'],
];

/** The blank template with two worked examples and a sheet of instructions. */
export async function templateWorkbook(): Promise<Uint8Array> {
  return buildWorkbook([
    { name: 'Vouchers', sheet: voucherSheet(EXAMPLE) },
    { name: 'How to fill', sheet: { rows: HOW.map((r, i) => r.map((c) => XL.t(c, i ? XL.S.wrap : XL.S.headL))), widths: [26, 110] } },
  ]);
}

/** Vouchers as an Excel file in the template layout, with a summary and the checks. */
export async function vouchersWorkbook(vouchers: Voucher[], check?: { issues: Issue[]; bad: Set<number> }): Promise<Uint8Array> {
  return buildWorkbook([
    { name: 'Vouchers', sheet: voucherSheet(vouchers) },
    { name: 'Summary', sheet: summarySheet(vouchers, check?.bad) },
    ...(check ? [{ name: 'Checks', sheet: issuesSheet(check.issues, vouchers) }] : []),
  ]);
}

/** A validation report as Excel. */
export async function reportWorkbook(vouchers: Voucher[], issues: Issue[], summary: Summary, bad: Set<number>): Promise<Uint8Array> {
  const s = summary;
  const totalsSheet: XSheet = {
    rows: [
      head(['Check', 'Result']),
      ...(
        [
          ['Vouchers', s.vouchers],
          ['Ledger lines', s.entries],
          ['Total debit', s.debit],
          ['Total credit', s.credit],
          ['Valid vouchers', s.valid],
          ['Vouchers with errors', s.invalid],
          ['Errors', s.errors],
          ['Warnings', s.warnings],
        ] as [string, number][]
      ).map(([k, v]) => [XL.t(k), k.startsWith('Total') ? XL.n(v) : XL.i(v)]),
    ],
    widths: [26, 18],
  };
  return buildWorkbook([
    { name: 'Summary', sheet: totalsSheet },
    { name: 'Problems', sheet: issuesSheet(issues, vouchers) },
    { name: 'Vouchers', sheet: summarySheet(vouchers, bad) },
  ]);
}

/** Everything read from a Tally XML file, sheet by sheet. Nothing is left out without a row saying so. */
export async function tallyReadWorkbook(read: TallyRead): Promise<{ bytes: Uint8Array; sheets: string[] }> {
  const used: Record<string, number> = {};
  const sheets: { name: string; sheet: XSheet }[] = [];
  const add = (name: string, sheet: XSheet) => sheets.push({ name: XL.name(name, used), sheet });
  const { vouchers } = read;

  if (vouchers.length) {
    add('Vouchers', voucherSheet(vouchers, [{ label: 'Party Ledger', get: (v) => v.party ?? '' }]));
    add('Voucher summary', summarySheet(vouchers));
    const bills: XSheet['rows'] = [head(['Voucher Date', 'Voucher Type', 'Voucher Number', 'Ledger Name', 'Bill Type', 'Bill Name', 'Amount', 'Dr / Cr'])];
    const centres: XSheet['rows'] = [head(['Voucher Date', 'Voucher Type', 'Voucher Number', 'Ledger Name', 'Cost Category', 'Cost Centre', 'Amount', 'Dr / Cr'])];
    const bank: { v: Voucher; e: Entry }[] = [];
    const extraKeys = new Set<string>();
    for (const v of vouchers) {
      for (const e of v.entries) {
        const side = e.dr ? 'Dr' : 'Cr';
        for (const b of e.bills) bills.push([dateCell(v.date), XL.t(v.type), XL.t(v.number), XL.t(e.ledger), XL.t(b.type), XL.t(b.name), XL.n(b.amount), XL.t(side)]);
        for (const c of e.costCentres) centres.push([dateCell(v.date), XL.t(v.type), XL.t(v.number), XL.t(e.ledger), XL.t(e.costCategory), XL.t(c.centre), XL.n(c.amount), XL.t(side)]);
        if (e.bank) bank.push({ v, e });
        for (const k of Object.keys(e.extra ?? {})) extraKeys.add(`line:${k}`);
      }
      for (const k of Object.keys(v.extra ?? {})) extraKeys.add(`voucher:${k}`);
    }
    if (bills.length > 1) add('Bill-wise', { rows: bills, widths: [12, 14, 14, 30, 12, 20, 14, 8] });
    if (centres.length > 1) add('Cost centres', { rows: centres, widths: [12, 14, 14, 30, 22, 22, 14, 8] });
    if (bank.length) {
      const keys = [...new Set(bank.flatMap((b) => Object.keys(b.e.bank!)))];
      add('Bank details', { rows: [head(['Voucher Date', 'Voucher Type', 'Voucher Number', 'Ledger Name', 'Amount', ...keys]), ...bank.map(({ v, e }) => [dateCell(v.date), XL.t(v.type), XL.t(v.number), XL.t(e.ledger), XL.n(e.dr || e.cr), ...keys.map((k) => XL.t(e.bank![k] ?? ''))])], widths: [12, 14, 14, 30, 14, ...keys.map(() => 20)] });
    }
    const inv = vouchers.filter((v) => v.inventory?.length);
    if (inv.length) {
      const keys = [...new Set(inv.flatMap((v) => v.inventory!.flatMap((r) => Object.keys(r))))];
      add('Stock lines', { rows: [head(['Voucher Date', 'Voucher Type', 'Voucher Number', ...keys]), ...inv.flatMap((v) => v.inventory!.map((r) => [dateCell(v.date), XL.t(v.type), XL.t(v.number), ...keys.map((k) => XL.t(r[k] ?? ''))]))], widths: [12, 14, 14, ...keys.map(() => 18)] });
    }
    if (extraKeys.size) {
      // Long format: one row per value, so any number of extra fields fits.
      const rows: XSheet['rows'] = [head(['Voucher Date', 'Voucher Type', 'Voucher Number', 'Ledger Name', 'Field', 'Value'])];
      for (const v of vouchers) {
        for (const [k, val] of Object.entries(v.extra ?? {})) rows.push([dateCell(v.date), XL.t(v.type), XL.t(v.number), XL.t(''), XL.t(k), XL.t(val, XL.S.wrap)]);
        for (const e of v.entries) for (const [k, val] of Object.entries(e.extra ?? {})) rows.push([dateCell(v.date), XL.t(v.type), XL.t(v.number), XL.t(e.ledger), XL.t(k), XL.t(val, XL.S.wrap)]);
      }
      add('Other fields', { rows, widths: [12, 14, 14, 28, 30, 50] });
    }
  }
  for (const m of read.masters) {
    const keys = [...new Set(m.rows.flatMap((r) => Object.keys(r)))];
    const name = { LEDGER: 'Ledgers', GROUP: 'Groups', COSTCENTRE: 'Cost centres list', COSTCATEGORY: 'Cost categories', STOCKITEM: 'Stock items', STOCKGROUP: 'Stock groups', UNIT: 'Units', GODOWN: 'Godowns', VOUCHERTYPE: 'Voucher types', CURRENCY: 'Currencies', COMPANY: 'Companies' }[m.kind] ?? m.kind;
    add(name, { rows: [head(keys), ...m.rows.map((r) => keys.map((k) => (k.endsWith('BALANCE') || k.endsWith('VALUE')) && r[k] && !Number.isNaN(parseAmount(r[k])) ? XL.n(parseAmount(r[k])) : XL.t(r[k] ?? '')))], widths: keys.map((k, i) => (i === 0 ? 34 : 18)) });
  }
  if (read.report && read.report.rows.length) {
    const { columns, rows } = read.report;
    add('Report', { rows: [head(columns), ...rows.map((r) => columns.map((c) => (r[c] && /^-?[\d,]+\.?\d*$/.test(r[c]) ? XL.n(parseAmount(r[c])) : XL.t(r[c] ?? ''))))], widths: columns.map((c, i) => (i === 0 ? 34 : 16)) });
  }
  if (read.unsupported.length)
    add('Not converted', { rows: [head(['Where in the XML', 'How many', 'Example']), ...read.unsupported.map((u) => [XL.t(u.path), XL.i(u.count), XL.t(u.example, XL.S.wrap)])], widths: [44, 10, 80] });
  if (!sheets.length) add('Empty', { rows: [[XL.t('The file held no vouchers, masters or report rows.')]] });
  return { bytes: await buildWorkbook(sheets), sheets: sheets.map((s) => s.name) };
}
