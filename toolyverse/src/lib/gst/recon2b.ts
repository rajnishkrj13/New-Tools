/**
 * GSTR-2B against the purchase register (ITC reconciliation). Pure functions, no DOM.
 *
 * The 2B side comes from the GSTR-2B reader (portal Excel downloads or a merged workbook); the
 * books side from any purchase register (Tally, Busy, SAP, Excel), whose columns are found by
 * their headings and can be corrected. Documents are matched supplier by supplier, in passes from
 * the surest to the loosest, and every pair is compared head by head.
 */

export type Field = 'gstin' | 'name' | 'no' | 'date' | 'taxable' | 'igst' | 'cgst' | 'sgst' | 'cess' | 'value' | 'type' | 'ours';
export type Mapping = Record<Field, number[]>;

export interface Doc {
  src: '2b' | 'books';
  gstin: string;
  name: string;
  no: string;
  /** B2BA: the original invoice number the amendment replaces. */
  alt?: string;
  /** Day number (Excel serial: days since 30 Dec 1899), or null when unknown. */
  date: number | null;
  kind: 'Invoice' | 'Credit note' | 'Debit note';
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  value: number | null;
  /** GSTR-2B month (Excel serial of the 1st), 2B only. */
  month?: number | null;
  section?: 'B2B' | 'B2BA' | 'CDNR';
  rcm?: boolean;
  itc?: string;
  /** The recipient (our) GSTIN, where known. */
  ours?: string;
  /** Row in the source sheet (1-based), for finding it again. */
  row: number;
  file?: string;
}

export type Status = 'matched' | 'differs' | 'probable' | 'only2b' | 'onlyBooks' | 'outside';

export const STATUS_LABEL: Record<Status, string> = {
  matched: 'Matched',
  differs: 'Amounts differ',
  probable: 'Probable match',
  only2b: 'In 2B, not in books',
  onlyBooks: 'In books, not in 2B',
  outside: 'In books, outside the 2B months',
};

export interface Line {
  status: Status;
  /** How the pair was found, and what differs. */
  notes: string[];
  b2: Doc | null;
  bk: Doc | null;
  /** 2B minus books, per head. */
  diff: { taxable: number; igst: number; cgst: number; sgst: number; cess: number; tax: number };
}

export interface Options {
  /** Largest difference (₹) still taken as equal, per head. */
  tol: number;
  /** A different invoice date makes a pair "Amounts differ" (otherwise it is only noted). */
  dates: boolean;
}

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z][Z0-9][0-9A-Z]$/;
const LOOSE_GSTIN = /^[0-9A-Z]{15}$/;
const r2 = (x: number) => Math.round((x + (x >= 0 ? 1e-9 : -1e-9)) * 100) / 100;
export const taxOf = (d: Doc) => r2(d.igst + d.cgst + d.sgst + d.cess);

// ---- Values ------------------------------------------------------------------------------------

const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const serial = (y: number, m0: number, d: number) => Math.round((Date.UTC(y, m0, d) - Date.UTC(1899, 11, 30)) / 86400000);

/** A date from a cell: an Excel serial, a Date, or text such as 05-04-2026, 05/04/26, 5-Apr-2026. */
export function dayOf(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v > 20000 && v < 80000 ? Math.floor(v) : null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : serial(v.getFullYear(), v.getMonth(), v.getDate());
  const s = String(v).trim();
  let m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    const d = new Date(Date.UTC(y, +m[2] - 1, +m[1]));
    return d.getUTCMonth() === +m[2] - 1 ? serial(y, +m[2] - 1, +m[1]) : null;
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return serial(+m[1], +m[2] - 1, +m[3]);
  m = /^(\d{1,2})[-/ .]([A-Za-z]{3,9})[-/ .,]+(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const mi = MON.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi >= 0) return serial(+m[3] < 100 ? 2000 + +m[3] : +m[3], mi, +m[1]);
  }
  return null;
}

export function dayText(d: number | null): string {
  if (d == null) return '';
  const t = new Date(Date.UTC(1899, 11, 30) + d * 86400000);
  return `${String(t.getUTCDate()).padStart(2, '0')}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${t.getUTCFullYear()}`;
}

/** An amount from a cell: numbers, "1,25,000.50", "(250.00)", "₹ 1,200", "1,200.00 Dr". */
export function amountOf(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v).trim();
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s);
  s = s.replace(/[()₹,\s]|rs\.?|inr|\b(dr|cr)\.?$/gi, '').replace(/^-|-$/g, '');
  if (!/^\d*\.?\d+$/.test(s)) return null;
  return Number(s) * (neg ? -1 : 1);
}

// ---- Invoice numbers ---------------------------------------------------------------------------

/** "INV/2023-24/0045" → "INV2023240045": letters and digits only. */
export const plainNo = (s: string) => s.toUpperCase().replace(/[^0-9A-Z]/g, '');

/** The number without its year part and leading zeros: "INV/2023-24/0045" and "inv-45" → "INV45". */
export function coreNo(s: string): string {
  const up = s.toUpperCase();
  // A financial year written into the number: 2023-24, 2023-2024, 23-24, 202324, FY 23-24.
  const noYear = up.replace(/\bF\.?Y\.?/g, ' ').replace(/(?:20)?(\d{2})\s*[-/]?\s*(?:20)?(\d{2})(?!\d)/g, (all: string, a: string, b: string) => ((+a + 1) % 100 === +b ? ' ' : all));
  // The year goes only when a number is left ("INV1213" is invoice 1213, not year 2012-13).
  const t = (/\d/.test(noYear) ? noYear : up).replace(/[^0-9A-Z]/g, '');
  return t.replace(/(^|\D)0+(?=\d)/g, '$1') || plainNo(s);
}

/** The last run of digits, without leading zeros: "INV/23-24/0045" → "45". */
export function numPart(s: string): string {
  const m = /(\d+)\D*$/.exec(s);
  return m ? m[1].replace(/^0+(?=\d)/, '') : '';
}

// ---- GSTR-2B rows ------------------------------------------------------------------------------

const num = (v: unknown) => amountOf(v) ?? 0;

/**
 * Documents from GSTR-2B sheets as the GSTR-2B reader gives them (State and GSTR-2B Month first,
 * then the portal columns). `ours` is the recipient GSTIN when known.
 */
export function twoBDocs(sheets: Record<string, unknown[][]>, opts: { ours?: string; file?: string } = {}): Doc[] {
  const out: Doc[] = [];
  const s = (v: unknown) => (v == null ? '' : String(v).trim());
  (sheets.B2B ?? []).forEach((r, i) =>
    out.push({
      src: '2b', section: 'B2B', gstin: s(r[2]).toUpperCase(), name: s(r[3]), no: s(r[4]), date: dayOf(r[6]), kind: 'Invoice',
      value: amountOf(r[7]), rcm: /^y/i.test(s(r[9])), taxable: num(r[10]), igst: num(r[11]), cgst: num(r[12]), sgst: num(r[13]), cess: num(r[14]),
      itc: s(r[17]), month: typeof r[1] === 'number' ? r[1] : null, ours: opts.ours, row: i + 2, file: opts.file,
    }),
  );
  (sheets.B2BA ?? []).forEach((r, i) =>
    out.push({
      src: '2b', section: 'B2BA', alt: s(r[2]), gstin: s(r[4]).toUpperCase(), name: s(r[5]), no: s(r[6]), date: dayOf(r[8]), kind: 'Invoice',
      value: amountOf(r[9]), rcm: /^y/i.test(s(r[11])), taxable: num(r[12]), igst: num(r[13]), cgst: num(r[14]), sgst: num(r[15]), cess: num(r[16]),
      itc: s(r[25]), month: typeof r[1] === 'number' ? r[1] : null, ours: opts.ours, row: i + 2, file: opts.file,
    }),
  );
  (sheets['B2B-CDNR'] ?? []).forEach((r, i) => {
    // A credit note lowers the input tax credit: its amounts count as negative.
    const credit = /credit/i.test(s(r[5])) || /^c$/i.test(s(r[5]));
    const k = credit ? -1 : 1;
    out.push({
      src: '2b', section: 'CDNR', gstin: s(r[2]).toUpperCase(), name: s(r[3]), no: s(r[4]), date: dayOf(r[7]), kind: credit ? 'Credit note' : 'Debit note',
      value: amountOf(r[8]), rcm: /^y/i.test(s(r[10])), taxable: k * Math.abs(num(r[11])), igst: k * Math.abs(num(r[12])), cgst: k * Math.abs(num(r[13])), sgst: k * Math.abs(num(r[14])), cess: k * Math.abs(num(r[15])),
      itc: s(r[24]), month: typeof r[1] === 'number' ? r[1] : null, ours: opts.ours, row: i + 2, file: opts.file,
    });
  });
  return out.filter((d) => LOOSE_GSTIN.test(d.gstin));
}

// ---- Purchase register -------------------------------------------------------------------------

/** Headings that name each field, surest first. */
const NAMES: Record<Field, RegExp[]> = {
  ours: [/(company|our|recipient|buyer|branch|own)\s*gst/i],
  gstin: [/supplier.*gst|party.*gst|vendor.*gst|gstin\s*of\s*supplier/i, /gstin|gst\s*(no|number|reg)|uin/i],
  name: [/supplier.*name|party.*name|vendor.*name|trade\s*name|legal\s*name/i, /^(supplier|party|vendor|particulars|ledger|name)\b/i, /party|supplier|vendor|particulars/i],
  no: [/supplier.*(inv|bill|ref|doc).*(no|num|#)|(inv|bill).*(no|num)\.?\s*of\s*supplier|ref(erence)?\.?\s*no/i, /(invoice|inv|bill|doc(ument)?|note)\.?\s*(no|num|#)/i, /(voucher|vch)\.?\s*(no|num)/i],
  date: [/supplier.*(inv|bill|ref|doc).*date|ref(erence)?\.?\s*date/i, /(invoice|inv|bill|doc(ument)?|note)\.?\s*date/i, /^date$|(voucher|vch)\.?\s*date/i],
  taxable: [/taxable/i, /assessable|value\s*of\s*supply|basic\s*(value|amount)|net\s*(value|amount)/i],
  igst: [/igst|integrated/i],
  cgst: [/cgst|central\s*tax/i],
  sgst: [/sgst|utgst|state\s*tax|ut\s*tax/i],
  cess: [/cess/i],
  value: [/invoice\s*(value|amount)|bill\s*(value|amount)|gross\s*total|total\s*(value|amount)|^total$/i],
  type: [/(voucher|vch|doc(ument)?|invoice|note)\s*type|^type$/i],
};
const MANY: Field[] = ['igst', 'cgst', 'sgst', 'cess'];
export const FIELDS: { key: Field; label: string; need?: boolean }[] = [
  { key: 'gstin', label: 'Supplier GSTIN', need: true },
  { key: 'no', label: 'Supplier invoice number', need: true },
  { key: 'date', label: 'Invoice date' },
  { key: 'name', label: 'Supplier name' },
  { key: 'taxable', label: 'Taxable value' },
  { key: 'igst', label: 'IGST' },
  { key: 'cgst', label: 'CGST' },
  { key: 'sgst', label: 'SGST / UTGST' },
  { key: 'cess', label: 'Cess' },
  { key: 'value', label: 'Invoice value' },
  { key: 'type', label: 'Voucher / document type' },
  { key: 'ours', label: 'Our GSTIN (if several)' },
];

const letter = (c: number): string => (c < 26 ? String.fromCharCode(65 + c) : letter(Math.floor(c / 26) - 1) + String.fromCharCode(65 + (c % 26)));

export interface Register {
  /** Row index (0-based) of the headings. */
  header: number;
  columns: string[];
  mapping: Mapping;
}

/**
 * Finds the heading row of a purchase register (the row whose cells name the most fields, or
 * row `fixed` when given) and
 * which column holds what. Columns that hold GSTINs or dates are also found by their contents
 * when no heading names them.
 */
export function readRegister(aoa: unknown[][], fixed?: number): Register {
  const text = (v: unknown) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
  let header = fixed ?? 0;
  let best = -1;
  for (let i = 0; fixed == null && i < Math.min(aoa.length, 40); i++) {
    const cells = (aoa[i] ?? []).map(text).filter(Boolean);
    const hits = cells.filter((c) => c.length < 60 && Object.values(NAMES).some((rs) => rs.some((r) => r.test(c)))).length;
    if (hits > best) {
      best = hits;
      header = i;
    }
  }
  const width = Math.max(...aoa.slice(header, header + 50).map((r) => (r ?? []).length), 0);
  const columns = Array.from({ length: width }, (_, c) => text(aoa[header]?.[c]) || `Column ${letter(c)}`);
  const body = aoa.slice(header + 1, header + 201);
  const share = (c: number, test: (v: unknown) => boolean) => {
    const vals = body.map((r) => r?.[c]).filter((v) => v != null && v !== '');
    return vals.length ? vals.filter(test).length / vals.length : 0;
  };
  const isGstin = (v: unknown) => GSTIN.test(text(v).toUpperCase());
  const mapping = Object.fromEntries(FIELDS.map((f) => [f.key, [] as number[]])) as Mapping;
  const used = new Set<number>();
  const order: Field[] = ['ours', 'gstin', 'no', 'date', 'type', 'value', 'taxable', 'igst', 'cgst', 'sgst', 'cess', 'name'];
  for (const f of order) {
    for (const re of NAMES[f]) {
      const cols = columns.map((h, c) => c).filter((c) => !used.has(c) && re.test(columns[c]) && !(MANY.includes(f) && /\brate\b/i.test(columns[c]) && !/amount|amt|value/i.test(columns[c])));
      // Amount columns must hold amounts; GSTIN and date columns, GSTINs and dates.
      const fit = cols.filter((c) => (f === 'gstin' || f === 'ours' ? share(c, isGstin) >= 0.5 : f === 'date' ? share(c, (v) => dayOf(v) != null) >= 0.5 : ['taxable', 'igst', 'cgst', 'sgst', 'cess', 'value'].includes(f) ? share(c, (v) => amountOf(v) != null) >= 0.6 : true));
      if (!fit.length) continue;
      mapping[f] = MANY.includes(f) ? fit : [fit[0]];
      mapping[f].forEach((c) => used.add(c));
      break;
    }
    // Found by contents when no heading names them.
    if (!mapping[f].length && (f === 'gstin' || f === 'date')) {
      const c = columns.findIndex((_, k) => !used.has(k) && share(k, f === 'gstin' ? isGstin : (v) => dayOf(v) != null) >= 0.8);
      if (c >= 0) {
        mapping[f] = [c];
        used.add(c);
      }
    }
  }
  return { header, columns, mapping };
}

export interface RegisterRead {
  docs: Doc[];
  /** Rows left out: without a GSTIN (unregistered or total rows), and without an invoice number. */
  noGstin: number;
  noNumber: number;
}

/** The documents of a purchase register, read with the given mapping. */
export function registerDocs(aoa: unknown[][], reg: Pick<Register, 'header' | 'mapping'>): RegisterRead {
  const m = reg.mapping;
  const text = (r: unknown[], f: Field) => m[f].map((c) => (r[c] == null ? '' : String(r[c]).trim())).filter(Boolean).join(' ');
  const sum = (r: unknown[], f: Field) => r2(m[f].reduce((t, c) => t + (amountOf(r[c]) ?? 0), 0));
  const docs: Doc[] = [];
  let noGstin = 0;
  let noNumber = 0;
  for (let i = reg.header + 1; i < aoa.length; i++) {
    const r = aoa[i] ?? [];
    if (!r.some((v) => v != null && String(v).trim() !== '')) continue;
    const gstin = text(r, 'gstin').toUpperCase().replace(/\s/g, '');
    if (!LOOSE_GSTIN.test(gstin)) {
      noGstin++;
      continue;
    }
    const no = text(r, 'no');
    if (!no) {
      noNumber++;
      continue;
    }
    const type = text(r, 'type');
    let d: Doc = {
      src: 'books', gstin, name: text(r, 'name'), no, date: m.date.length ? dayOf(r[m.date[0]]) : null, kind: 'Invoice',
      taxable: sum(r, 'taxable'), igst: sum(r, 'igst'), cgst: sum(r, 'cgst'), sgst: sum(r, 'sgst'), cess: sum(r, 'cess'),
      value: m.value.length ? sum(r, 'value') : null, ours: text(r, 'ours').toUpperCase() || undefined, row: i + 1,
    };
    // A purchase return (our debit note) is the supplier's credit note: it lowers the credit.
    const note = /debit\s*note|credit\s*note|purchase\s*return|\bcn\b|\bdn\b|return/i.test(type);
    const negative = d.taxable < 0 || taxOf(d) < 0;
    if (note || negative) {
      const flip = (x: number) => -Math.abs(x);
      d = { ...d, kind: 'Credit note', taxable: flip(d.taxable), igst: flip(d.igst), cgst: flip(d.cgst), sgst: flip(d.sgst), cess: flip(d.cess), value: d.value == null ? null : flip(d.value) };
    }
    docs.push(d);
  }
  return { docs, noGstin, noNumber };
}

// ---- Matching ----------------------------------------------------------------------------------

const diffOf = (a: Doc | null, b: Doc | null) => {
  const g = (d: Doc | null, k: 'taxable' | 'igst' | 'cgst' | 'sgst' | 'cess') => (d ? d[k] : 0);
  const out = { taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, tax: 0 };
  for (const k of ['taxable', 'igst', 'cgst', 'sgst', 'cess'] as const) out[k] = r2(g(a, k) - g(b, k));
  out.tax = r2(out.igst + out.cgst + out.sgst + out.cess);
  return out;
};

const sameSign = (a: Doc, b: Doc) => Math.sign(taxOf(a) || a.taxable) === Math.sign(taxOf(b) || b.taxable) || (taxOf(a) === 0 && taxOf(b) === 0);
const pan = (g: string) => g.slice(2, 12);
const fmtAmt = (x: number) => x.toFixed(2);

export interface Result {
  lines: Line[];
  /** First and last GSTR-2B month loaded (Excel serials of the 1st), if known. */
  months: [number, number] | null;
}

/**
 * Matches 2B documents with the books, in passes from the surest to the loosest:
 * 1. same GSTIN and the same invoice number (letters and digits);
 * 2. same GSTIN and the same number once the year part, punctuation and leading zeros go;
 * 3. same GSTIN, the same last number, and the same tax (a probable match);
 * 4. same GSTIN, the same taxable value and tax within a month (a probable match);
 * 5. the same invoice under another GSTIN of the same PAN (a probable match).
 */
export function reconcile(twoB: Doc[], books: Doc[], opt: Options): Result {
  const tol = Math.max(0, opt.tol);
  const close = (a: number, b: number) => Math.abs(a - b) <= tol + 1e-9;
  const left = new Set(books);
  const lines: Line[] = [];
  const byGstin = new Map<string, Doc[]>();
  for (const b of books) byGstin.set(b.gstin, [...(byGstin.get(b.gstin) ?? []), b]);
  const byPan = new Map<string, Doc[]>();
  for (const b of books) byPan.set(pan(b.gstin), [...(byPan.get(pan(b.gstin)) ?? []), b]);

  // Invoices entered twice in the books.
  const seen = new Map<string, number>();
  for (const b of books) seen.set(`${b.gstin}|${plainNo(b.no)}`, (seen.get(`${b.gstin}|${plainNo(b.no)}`) ?? 0) + 1);

  // The 2B document's own numbers to look for (an amendment also by its original number).
  const numbers = (d: Doc) => [d.no, d.alt].filter((x): x is string => !!x);
  const pick = (cands: Doc[], d: Doc) =>
    cands
      .filter((b) => left.has(b) && sameSign(b, d))
      .sort((a, b) => Math.abs(taxOf(a) - taxOf(d)) - Math.abs(taxOf(b) - taxOf(d)) || Math.abs((a.date ?? 0) - (d.date ?? 0)) - Math.abs((b.date ?? 0) - (d.date ?? 0)))[0];

  type Pass = { probable: boolean; note: string; find: (d: Doc) => Doc | undefined };
  const passes: Pass[] = [
    { probable: false, note: 'Same invoice number', find: (d) => pick((byGstin.get(d.gstin) ?? []).filter((b) => numbers(d).some((n) => plainNo(n) === plainNo(b.no))), d) },
    { probable: false, note: 'Invoice number written differently', find: (d) => pick((byGstin.get(d.gstin) ?? []).filter((b) => numbers(d).some((n) => coreNo(n) === coreNo(b.no))), d) },
    {
      probable: true,
      note: 'Same number part and tax, invoice number written differently',
      find: (d) => pick((byGstin.get(d.gstin) ?? []).filter((b) => numbers(d).some((n) => numPart(n) && numPart(n) === numPart(b.no)) && close(taxOf(b), taxOf(d))), d),
    },
    {
      probable: true,
      note: 'Same supplier, taxable value and tax; invoice number does not match',
      find: (d) => pick((byGstin.get(d.gstin) ?? []).filter((b) => close(b.taxable, d.taxable) && close(taxOf(b), taxOf(d)) && (b.date == null || d.date == null || Math.abs(b.date - d.date) <= 31)), d),
    },
    {
      probable: true,
      note: 'Same invoice under another GSTIN of the same PAN',
      find: (d) => pick((byPan.get(pan(d.gstin)) ?? []).filter((b) => b.gstin !== d.gstin && numbers(d).some((n) => coreNo(n) === coreNo(b.no))), d),
    },
  ];

  const pending = [...twoB];
  const pairs = new Map<Doc, { bk: Doc; pass: Pass }>();
  for (const pass of passes)
    for (const d of pending) {
      if (pairs.has(d)) continue;
      const bk = pass.find(d);
      if (!bk) continue;
      left.delete(bk);
      pairs.set(d, { bk, pass });
    }

  for (const d of twoB) {
    const p = pairs.get(d);
    const notes: string[] = [];
    if (/^n/i.test(d.itc ?? '')) notes.push('ITC not available as per GSTR-2B');
    if (d.rcm) notes.push('Reverse charge: ITC after paying the tax');
    if (d.section === 'B2BA') notes.push(`Amendment of invoice ${d.alt || ''}`.trim());
    if (!p) {
      lines.push({ status: 'only2b', notes, b2: d, bk: null, diff: diffOf(d, null) });
      continue;
    }
    const { bk, pass } = p;
    const diff = diffOf(d, bk);
    notes.unshift(pass.note);
    const differs: string[] = [];
    if (!close(d.taxable, bk.taxable)) differs.push(`Taxable value differs by ${fmtAmt(diff.taxable)}`);
    const igst2 = Math.abs(d.igst) > tol;
    const igstB = Math.abs(bk.igst) > tol;
    if (igst2 !== igstB && (Math.abs(d.cgst) > tol || Math.abs(bk.cgst) > tol)) differs.push(igst2 ? 'IGST in 2B, CGST + SGST in the books' : 'CGST + SGST in 2B, IGST in the books');
    else
      for (const k of ['igst', 'cgst', 'sgst', 'cess'] as const) if (!close(d[k], bk[k])) differs.push(`${k.toUpperCase()} differs by ${fmtAmt(diff[k])}`);
    if (d.date != null && bk.date != null && d.date !== bk.date) (opt.dates ? differs : notes).push(`Invoice date differs (${dayText(d.date)} in 2B, ${dayText(bk.date)} in the books)`);
    if ((seen.get(`${bk.gstin}|${plainNo(bk.no)}`) ?? 0) > 1) notes.push('Entered more than once in the books');
    lines.push({ status: pass.probable ? 'probable' : differs.length ? 'differs' : 'matched', notes: [...notes, ...differs], b2: d, bk, diff });
  }

  // Books documents never found: within the 2B months they are missing from 2B; outside, the
  // supplier's return for that month was simply not loaded.
  const months = twoB.map((d) => d.month).filter((m): m is number => typeof m === 'number');
  const span: [number, number] | null = months.length ? [Math.min(...months), Math.max(...months)] : null;
  const end = span ? (() => {
    const t = new Date(Date.UTC(1899, 11, 30) + span[1] * 86400000);
    return serial(t.getUTCFullYear(), t.getUTCMonth() + 1, 1) - 1;
  })() : 0;
  for (const b of books) {
    if (!left.has(b)) continue;
    const notes: string[] = [];
    if ((seen.get(`${b.gstin}|${plainNo(b.no)}`) ?? 0) > 1) notes.push('Entered more than once in the books');
    const outside = span && b.date != null && (b.date < span[0] || b.date > end);
    lines.push({ status: outside ? 'outside' : 'onlyBooks', notes, b2: null, bk: b, diff: diffOf(null, b) });
  }
  return { lines, months: span };
}

// ---- Summaries ---------------------------------------------------------------------------------

export interface Totals {
  count: number;
  tax2b: number;
  taxBooks: number;
}

export function totals(lines: Line[]): Record<Status | 'all', Totals> {
  const out = Object.fromEntries((['all', 'matched', 'differs', 'probable', 'only2b', 'onlyBooks', 'outside'] as const).map((k) => [k, { count: 0, tax2b: 0, taxBooks: 0 }])) as Record<Status | 'all', Totals>;
  for (const l of lines)
    for (const k of ['all', l.status] as const) {
      out[k].count++;
      out[k].tax2b = r2(out[k].tax2b + (l.b2 ? taxOf(l.b2) : 0));
      out[k].taxBooks = r2(out[k].taxBooks + (l.bk ? taxOf(l.bk) : 0));
    }
  return out;
}

export interface Supplier {
  gstin: string;
  name: string;
  tax2b: number;
  taxBooks: number;
  counts: Record<Status, number>;
}

/** One line per supplier: tax in 2B and in the books, and how its documents came out. */
export function suppliers(lines: Line[]): Supplier[] {
  const map = new Map<string, Supplier>();
  for (const l of lines) {
    const d = l.b2 ?? l.bk!;
    const s = map.get(d.gstin) ?? { gstin: d.gstin, name: '', tax2b: 0, taxBooks: 0, counts: { matched: 0, differs: 0, probable: 0, only2b: 0, onlyBooks: 0, outside: 0 } };
    s.name ||= l.b2?.name || l.bk?.name || '';
    if (l.b2) s.tax2b = r2(s.tax2b + taxOf(l.b2));
    if (l.bk && l.status !== 'outside') s.taxBooks = r2(s.taxBooks + taxOf(l.bk));
    s.counts[l.status]++;
    map.set(d.gstin, s);
  }
  return [...map.values()].sort((a, b) => Math.abs(b.tax2b - b.taxBooks) - Math.abs(a.tax2b - a.taxBooks) || a.gstin.localeCompare(b.gstin));
}
