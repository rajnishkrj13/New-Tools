/**
 * GSTR-2B against the purchase register (ITC reconciliation). Pure functions, no DOM.
 *
 * The 2B side comes from the GSTR-2B reader (portal Excel downloads or a merged workbook); the
 * books side from any purchase register (Tally, Busy, SAP, Excel), whose columns are found by
 * their headings and can be corrected. Documents are matched supplier by supplier, in passes from
 * the surest to the loosest, and every pair is compared head by head.
 */

export type Field = 'gstin' | 'name' | 'no' | 'date' | 'booked' | 'boe' | 'taxable' | 'igst' | 'cgst' | 'sgst' | 'cess' | 'value' | 'type' | 'ours';
export type Mapping = Record<Field, number[]>;

export interface Doc {
  src: '2b' | 'books';
  /** Supplier GSTIN; empty for an import from overseas. */
  gstin: string;
  name: string;
  no: string;
  /** B2BA: the original invoice number the amendment replaces. */
  alt?: string;
  /** Imports: the bill of entry number, which is what the two sides are matched by. */
  boe?: string;
  /** Day number (Excel serial: days since 30 Dec 1899), or null when unknown. */
  date: number | null;
  /** Books only: the voucher date, when it was booked (the invoice date when not given). */
  booked?: number | null;
  kind: 'Invoice' | 'Credit note' | 'Debit note' | 'Bill of entry';
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  value: number | null;
  /** GSTR-2B month (Excel serial of the 1st), 2B only. */
  month?: number | null;
  section?: 'B2B' | 'B2BA' | 'CDNR' | 'IMPG' | 'IMPGSEZ';
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
  /** Last date to take the ITC (Section 16(4)); null for credit notes and undated bills. */
  deadline: number | null;
  /** A pair you confirmed, or made yourself. */
  decided?: 'confirmed' | 'paired';
}

/** What you decided about pairs, by `pairKey`: pairs you made, probable pairs confirmed or turned down. */
export interface Decisions {
  pairs: string[];
  accept: string[];
  reject: string[];
}

export interface Options {
  /** Largest difference (₹) still taken as equal, per head. */
  tol: number;
  /** A different invoice date makes a pair "Amounts differ" (otherwise it is only noted). */
  dates: boolean;
  /** Today (Excel serial), for the ITC time limit; without it no time limit is checked. */
  today?: number | null;
  decisions?: Decisions;
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

const dateOf = (d: number) => new Date(Date.UTC(1899, 11, 30) + d * 86400000);

/** The 1st of the date's month. */
export function monthStart(d: number | null | undefined): number | null {
  if (d == null) return null;
  const t = dateOf(d);
  return serial(t.getUTCFullYear(), t.getUTCMonth(), 1);
}

/** "Apr 2026". */
export function monthText(m: number | null | undefined): string {
  if (m == null) return '';
  const t = dateOf(m);
  return `${MON[t.getUTCMonth()].replace(/^./, (c) => c.toUpperCase())} ${t.getUTCFullYear()}`;
}

/** Today as an Excel serial. */
export const todaySerial = (now = new Date()) => serial(now.getFullYear(), now.getMonth(), now.getDate());

/**
 * Section 16(4): the ITC on an invoice or debit note can be taken until 30 November after the
 * end of the financial year it belongs to (or the annual return, if filed earlier).
 */
export function itcDeadline(d: number | null | undefined): number | null {
  if (d == null) return null;
  const t = dateOf(d);
  const fy = t.getUTCMonth() >= 3 ? t.getUTCFullYear() : t.getUTCFullYear() - 1;
  return serial(fy + 1, 10, 30);
}

/** The financial year whose ITC ends on this deadline: 30-11-2026 → "2025-26". */
export const fyOfDeadline = (deadline: number) => {
  const y = dateOf(deadline).getUTCFullYear();
  return `${y - 1}-${String(y % 100).padStart(2, '0')}`;
};

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
/** The amount with the sign of k (a credit note's amounts count as negative), never -0. */
const signed = (k: number, x: number) => k * Math.abs(x) || 0;

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
      value: amountOf(r[8]), rcm: /^y/i.test(s(r[10])), taxable: signed(k, num(r[11])), igst: signed(k, num(r[12])), cgst: signed(k, num(r[13])), sgst: signed(k, num(r[14])), cess: signed(k, num(r[15])),
      itc: s(r[24]), month: typeof r[1] === 'number' ? r[1] : null, ours: opts.ours, row: i + 2, file: opts.file,
    });
  });
  return out.filter((d) => LOOSE_GSTIN.test(d.gstin));
}

/**
 * Imports from the IMPG (overseas) and IMPGSEZ (from SEZ units) sheets of a GSTR-2B Excel
 * download. The columns are found by their headings (two rows, the upper one merged): port
 * code, bill of entry number and date, taxable value, integrated tax and cess.
 */
export function twoBImports(aoa: unknown[][], section: 'IMPG' | 'IMPGSEZ', opts: { month?: number | null; ours?: string; file?: string } = {}): Doc[] {
  const s = (v: unknown) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
  const h = aoa.slice(0, 20).findIndex((r) => (r ?? []).some((v) => /port\s*code/i.test(s(v))));
  if (h < 0) return [];
  const width = Math.max(...aoa.slice(h, h + 20).map((r) => (r ?? []).length), 0);
  const labels = Array.from({ length: width }, (_, c) => `${h > 0 ? s(aoa[h - 1]?.[c]) : ''} ${s(aoa[h]?.[c])}`.trim());
  const col = (re: RegExp, not?: RegExp) => labels.findIndex((l) => re.test(l) && !(not && not.test(l)));
  const c = {
    port: col(/port/i),
    no: col(/number|\bno\b/i, /port|gstin/i),
    date: col(/date/i, /reference|icegate/i),
    taxable: col(/taxable/i),
    igst: col(/integrated|igst/i),
    cess: col(/cess/i),
    gstin: col(/gstin/i),
    name: col(/trade|legal|name/i),
  };
  if (c.no < 0) return [];
  const out: Doc[] = [];
  for (let j = h + 1; j < aoa.length; j++) {
    const r = aoa[j] ?? [];
    const no = s(r[c.no]);
    if (!/\d/.test(no) || (amountOf(r[c.taxable]) == null && amountOf(r[c.igst]) == null)) continue;
    const port = c.port >= 0 ? s(r[c.port]) : '';
    out.push({
      src: '2b', section, gstin: section === 'IMPGSEZ' && c.gstin >= 0 ? s(r[c.gstin]).toUpperCase() : '', name: (c.name >= 0 && s(r[c.name])) || (port ? `Import, port ${port}` : 'Import'),
      no, boe: no, date: c.date >= 0 ? dayOf(r[c.date]) : null, kind: 'Bill of entry', value: null,
      taxable: c.taxable >= 0 ? num(r[c.taxable]) : 0, igst: c.igst >= 0 ? num(r[c.igst]) : 0, cgst: 0, sgst: 0, cess: c.cess >= 0 ? num(r[c.cess]) : 0,
      month: opts.month ?? null, ours: opts.ours, row: j + 1, file: opts.file,
    });
  }
  return out;
}

// ---- GSTR-2B JSON ------------------------------------------------------------------------------

export interface JsonRead {
  docs: Doc[];
  /** Recipient GSTIN and return period from the file. */
  gstin: string | null;
  month: number | null;
  /** "GSTR-2B" or "GSTR-2A", from the layout. */
  kind: string;
  errors: string[];
  warnings: string[];
}

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === 'object' && !Array.isArray(v) ? (v as J) : {});
const arr = (v: unknown): J[] => (Array.isArray(v) ? (v as J[]).map(obj) : []);
const str = (v: unknown) => (v == null ? '' : String(v).trim());

/** "042026" (MMYYYY) → the Excel serial of 1 April 2026. */
const periodOf = (p: unknown): number | null => {
  const m = /^(\d{2})(\d{4})$/.exec(str(p));
  return m && +m[1] >= 1 && +m[1] <= 12 ? serial(+m[2], +m[1] - 1, 1) : null;
};

/** Taxes of a document: on the document (GSTR-2B), or added up from its items (GSTR-2A). */
function taxesOf(d: J): Pick<Doc, 'taxable' | 'igst' | 'cgst' | 'sgst' | 'cess'> {
  const items = arr(d.itms).map((i) => obj(i.itm_det));
  if (items.length && d.txval == null) {
    const add = (k: string) => r2(items.reduce((t, i) => t + num(i[k]), 0));
    return { taxable: add('txval'), igst: add('iamt'), cgst: add('camt'), sgst: add('samt'), cess: add('csamt') };
  }
  return { taxable: num(d.txval), igst: num(d.igst ?? d.iamt), cgst: num(d.cgst ?? d.camt), sgst: num(d.sgst ?? d.samt), cess: num(d.cess ?? d.csamt) };
}

/**
 * Documents from a GSTR-2B JSON file as the GST portal gives it (also the older GSTR-2A layout):
 * B2B invoices, their amendments (B2BA), credit and debit notes (CDNR, CDNRA) and imports (IMPG,
 * IMPGSEZ). ISD entries have no supplier invoice in the books to compare with, so they are only counted.
 */
export function twoBJson(json: unknown, file?: string): JsonRead {
  const root = obj(obj(json).data ?? json);
  const dd = obj(root.docdata ?? root);
  const gstin = str(root.gstin).toUpperCase() || null;
  const month = periodOf(root.rtnprd ?? root.fp ?? root.ret_period);
  const kind = root.rtnprd != null || root.docdata != null ? 'GSTR-2B' : 'GSTR-2A';
  const out: JsonRead = { docs: [], gstin, month, kind, errors: [], warnings: [] };
  // Your own returns share some section names (a GSTR-1's b2b lists your customers), so they are turned away first.
  if (root.rtnprd == null && root.docdata == null) {
    const has = (keys: string[]) => keys.some((k) => k in root);
    if (has(['b2cs', 'b2cl', 'hsn', 'doc_issue', 'exp', 'nil', 'gt', 'cur_gt'])) out.errors.push('This is a GSTR-1 JSON: your sales. Add the GSTR-2B JSON from the portal instead.');
    else if (has(['sup_details', 'itc_elg', 'inter_sup'])) out.errors.push('This is a GSTR-3B JSON. Add the GSTR-2B JSON from the portal instead.');
    if (out.errors.length) return { ...out, kind: '' };
  }
  const base = (s: J): Pick<Doc, 'src' | 'gstin' | 'name' | 'month' | 'ours' | 'file'> => ({
    src: '2b', gstin: str(s.ctin).toUpperCase(), name: str(s.trdnm ?? s.cname), month: month ?? periodOf(s.supprd ?? s.fp), ours: gstin ?? undefined, file,
  });
  const itc = (d: J) => {
    const v = str(d.itcavl);
    return v === 'Y' ? 'Yes' : v === 'N' ? 'No' : v === 'T' ? 'Temporary' : v;
  };
  let row = 0;
  for (const s of arr(dd.b2b))
    for (const d of arr(s.inv))
      out.docs.push({ ...base(s), section: 'B2B', no: str(d.inum), date: dayOf(d.dt ?? d.idt), kind: 'Invoice', value: amountOf(d.val), rcm: /^y/i.test(str(d.rev ?? d.rchrg)), itc: itc(d), ...taxesOf(d), row: ++row });
  for (const s of arr(dd.b2ba))
    for (const d of arr(s.inv))
      out.docs.push({ ...base(s), section: 'B2BA', alt: str(d.oinum), no: str(d.inum), date: dayOf(d.dt ?? d.idt), kind: 'Invoice', value: amountOf(d.val), rcm: /^y/i.test(str(d.rev ?? d.rchrg)), itc: itc(d), ...taxesOf(d), row: ++row });
  for (const key of ['cdnr', 'cdn', 'cdnra', 'cdna'])
    for (const s of arr(dd[key]))
      for (const d of arr(s.nt)) {
        // A credit note lowers the input tax credit: its amounts count as negative.
        const credit = /^c/i.test(str(d.typ ?? d.ntty));
        const k = credit ? -1 : 1;
        const t = taxesOf(d);
        out.docs.push({
          ...base(s), section: 'CDNR', no: str(d.ntnum ?? d.nt_num), alt: str(d.ontnum ?? d.ont_num) || undefined, date: dayOf(d.dt ?? d.nt_dt), kind: credit ? 'Credit note' : 'Debit note',
          value: amountOf(d.val), rcm: /^y/i.test(str(d.rev ?? d.rchrg)), itc: itc(d),
          taxable: signed(k, t.taxable), igst: signed(k, t.igst), cgst: signed(k, t.cgst), sgst: signed(k, t.sgst), cess: signed(k, t.cess), row: ++row,
        });
      }
  out.docs = out.docs.filter((d) => LOOSE_GSTIN.test(d.gstin));
  // Imports, matched with the books by the bill of entry number.
  const boe = (e: J, section: 'IMPG' | 'IMPGSEZ', s: J = {}) => {
    const no = str(e.boenum);
    if (!no) return;
    out.docs.push({
      src: '2b', section, gstin: str(s.ctin).toUpperCase(), name: str(s.trdnm) || (str(e.portcode) ? `Import, port ${str(e.portcode)}` : 'Import'), no, boe: no, date: dayOf(e.boedt),
      kind: 'Bill of entry', value: null, taxable: num(e.txval), igst: num(e.igst), cgst: 0, sgst: 0, cess: num(e.cess), month, ours: gstin ?? undefined, row: ++row, file,
    });
  };
  for (const e of arr(dd.impg)) boe(e, 'IMPG');
  for (const s of arr(dd.impgsez)) for (const e of arr(s.boe).length ? arr(s.boe) : [s]) boe(e, 'IMPGSEZ', s);
  const isd = ['isd', 'isda'].reduce((n, k) => n + arr(dd[k]).length, 0);
  if (isd) out.warnings.push(`${isd} ISD entries are not compared: they come from your own Input Service Distributor, not from a supplier invoice.`);
  if (!['b2b', 'b2ba', 'cdnr', 'cdn', 'cdnra', 'cdna', 'impg', 'impgsez'].some((k) => k in dd) && !out.docs.length) out.errors.push('No B2B, B2BA, credit/debit note or import sections found. Is this a GSTR-2B (or GSTR-2A) JSON from the GST portal?');
  if (!gstin) out.warnings.push('The file does not say whose GSTR-2B it is (no GSTIN).');
  return out;
}

// ---- Purchase register -------------------------------------------------------------------------

/** Headings that name each field, surest first. */
const NAMES: Record<Field, RegExp[]> = {
  ours: [/(company|our|recipient|buyer|branch|own)\s*gst/i],
  gstin: [/supplier.*gst|party.*gst|vendor.*gst|gstin\s*of\s*supplier/i, /gstin|gst\s*(no|number|reg)|uin/i],
  name: [/supplier.*name|party.*name|vendor.*name|trade\s*name|legal\s*name/i, /^(supplier|party|vendor|particulars|ledger|name)\b/i, /party|supplier|vendor|particulars/i],
  no: [/supplier.*(inv|bill|ref|doc).*(no|num|#)|(inv|bill).*(no|num)\.?\s*of\s*supplier|ref(erence)?\.?\s*no/i, /(invoice|inv|bill|doc(ument)?|note)\.?\s*(no|num|#)/i, /(voucher|vch)\.?\s*(no|num)/i],
  date: [/supplier.*(inv|bill|ref|doc).*date|ref(erence)?\.?\s*date/i, /(invoice|inv|bill|doc(ument)?|note)\.?\s*date/i, /^date$|(voucher|vch)\.?\s*date/i],
  // When the bill was booked: taken only when another column holds the invoice date.
  booked: [/^(voucher|vch|posting|entry|booking|accounting|gl)?\.?\s*date$/i],
  boe: [/^(?!.*date).*(bill\s*of\s*entry|\bboe\b|\bb\/e\b)/i],
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
  { key: 'booked', label: 'Voucher date (when booked)' },
  { key: 'name', label: 'Supplier name' },
  { key: 'taxable', label: 'Taxable value' },
  { key: 'igst', label: 'IGST' },
  { key: 'cgst', label: 'CGST' },
  { key: 'sgst', label: 'SGST / UTGST' },
  { key: 'cess', label: 'Cess' },
  { key: 'value', label: 'Invoice value' },
  { key: 'type', label: 'Voucher / document type' },
  { key: 'boe', label: 'Bill of entry no. (imports)' },
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
  const order: Field[] = ['ours', 'gstin', 'boe', 'no', 'date', 'booked', 'type', 'value', 'taxable', 'igst', 'cgst', 'sgst', 'cess', 'name'];
  for (const f of order) {
    for (const re of NAMES[f]) {
      const cols = columns.map((h, c) => c).filter((c) => !used.has(c) && re.test(columns[c]) && !(MANY.includes(f) && /\brate\b/i.test(columns[c]) && !/amount|amt|value/i.test(columns[c])));
      // Amount columns must hold amounts; GSTIN and date columns, GSTINs and dates.
      const fit = cols.filter((c) => (f === 'gstin' || f === 'ours' ? share(c, isGstin) >= 0.5 : f === 'date' || f === 'booked' ? share(c, (v) => dayOf(v) != null) >= 0.5 : ['taxable', 'igst', 'cgst', 'sgst', 'cess', 'value'].includes(f) ? share(c, (v) => amountOf(v) != null) >= 0.6 : true));
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
  /** Rows left out: without a GSTIN or bill of entry (unregistered or total rows), and without an invoice number. */
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
    let gstin = text(r, 'gstin').toUpperCase().replace(/\s/g, '');
    // An import has a bill of entry; from overseas it has no supplier GSTIN.
    const boe = text(r, 'boe');
    if (!LOOSE_GSTIN.test(gstin)) {
      if (!boe || !/\d/.test(boe)) {
        noGstin++;
        continue;
      }
      gstin = '';
    }
    const no = text(r, 'no') || boe;
    if (!no) {
      noNumber++;
      continue;
    }
    const type = text(r, 'type');
    const date = m.date.length ? dayOf(r[m.date[0]]) : null;
    let d: Doc = {
      src: 'books', gstin, name: text(r, 'name'), no, date, booked: m.booked.length ? (dayOf(r[m.booked[0]]) ?? date) : date, kind: boe ? 'Bill of entry' : 'Invoice',
      taxable: sum(r, 'taxable'), igst: sum(r, 'igst'), cgst: sum(r, 'cgst'), sgst: sum(r, 'sgst'), cess: sum(r, 'cess'),
      value: m.value.length ? sum(r, 'value') : null, ours: text(r, 'ours').toUpperCase() || undefined, row: i + 1,
    };
    if (boe) d.boe = boe;
    // A purchase return (our debit note) is the supplier's credit note: it lowers the credit.
    const note = /debit\s*note|credit\s*note|purchase\s*return|\bcn\b|\bdn\b|return/i.test(type);
    const negative = d.taxable < 0 || taxOf(d) < 0;
    if (!boe && (note || negative)) {
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

/** A document's identity from run to run (file, section, row, supplier, number), for your decisions. */
export const docKey = (d: Doc) => `${d.src}|${d.file ?? ''}|${d.section ?? ''}|${d.row}|${d.gstin}|${plainNo(d.no)}`;
/** A pair, for `Decisions`. */
export const pairKey = (b2: Doc, bk: Doc) => `${docKey(b2)}\n${docKey(bk)}`;

export interface Result {
  lines: Line[];
  /** First and last GSTR-2B month loaded (Excel serials of the 1st), if known. */
  months: [number, number] | null;
}

/**
 * Matches 2B documents with the books, supplier by supplier. Pairs you made come first; then the
 * passes, from the surest to the loosest:
 * 1. same GSTIN and the same invoice number (letters and digits);
 * 2. same GSTIN and the same number once the year part, punctuation and leading zeros go;
 * 3. same GSTIN, the same last number, and the same tax (a probable match);
 * 4. same GSTIN, the same taxable value and tax within a month (a probable match);
 * 5. the same invoice under another GSTIN of the same PAN (a probable match).
 * Imports are matched apart, by the bill of entry number, or else by the same amounts within a month.
 * Every number is looked up in an index, so a year of bills takes a moment, not minutes.
 */
export function reconcile(twoB: Doc[], books: Doc[], opt: Options): Result {
  const tol = Math.max(0, opt.tol);
  const close = (a: number, b: number) => Math.abs(a - b) <= tol + 1e-9;
  const near = (a: Doc, b: Doc) => a.date == null || b.date == null || Math.abs(a.date - b.date) <= 31;
  const rejected = new Set(opt.decisions?.reject ?? []);
  const accepted = new Set(opt.decisions?.accept ?? []);
  const left = new Set(books);
  const lines: Line[] = [];

  // Each document's numbers, worked out once: an amendment is also looked for by its original
  // number, an import by its bill of entry.
  type Keys = { key: string; plain: string[]; core: string[]; num: string[] };
  const cache = new Map<Doc, Keys>();
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];
  const k = (d: Doc): Keys => {
    let c = cache.get(d);
    if (!c) {
      const ns = (d.boe ? [d.boe] : d.src === '2b' ? [d.no, d.alt] : [d.no]).filter((x): x is string => !!x);
      c = { key: docKey(d), plain: uniq(ns.map(plainNo)), core: uniq(ns.map(coreNo)), num: uniq(ns.map(numPart)) };
      cache.set(d, c);
    }
    return c;
  };

  const add = (m: Map<string, Doc[]>, key: string, d: Doc) => {
    const l = m.get(key);
    if (l) l.push(d);
    else m.set(key, [d]);
  };
  const byGstin = new Map<string, Doc[]>();
  const byNo = new Map<string, Doc[]>();
  const byCore = new Map<string, Doc[]>();
  const byNum = new Map<string, Doc[]>();
  const byPanCore = new Map<string, Doc[]>();
  const byBoe = new Map<string, Doc[]>();
  const imports: Doc[] = [];
  // Invoices entered twice in the books.
  const seen = new Map<string, number>();
  const seenKey = (b: Doc) => `${b.gstin}|${k(b).plain[0] ?? ''}`;
  const twice = (b: Doc) => (seen.get(seenKey(b)) ?? 0) > 1;
  for (const b of books) {
    const c = k(b);
    seen.set(seenKey(b), (seen.get(seenKey(b)) ?? 0) + 1);
    if (b.boe) {
      imports.push(b);
      for (const p of c.plain) add(byBoe, p, b);
      continue;
    }
    add(byGstin, b.gstin, b);
    for (const p of c.plain) add(byNo, `${b.gstin}|${p}`, b);
    for (const p of c.core) {
      add(byCore, `${b.gstin}|${p}`, b);
      add(byPanCore, `${pan(b.gstin)}|${p}`, b);
    }
    for (const p of c.num) add(byNum, `${b.gstin}|${p}`, b);
  }

  const from = (m: Map<string, Doc[]>, keys: string[]) => {
    if (keys.length === 1) return m.get(keys[0]) ?? [];
    const out: Doc[] = [];
    for (const key of keys) for (const b of m.get(key) ?? []) if (!out.includes(b)) out.push(b);
    return out;
  };
  // The closest in tax, then in date, among those still free (and not turned down by you).
  const pick = (cands: Doc[], d: Doc, ok: (b: Doc) => boolean = () => true) => {
    let best: Doc | undefined;
    let bt = Infinity;
    let bd = Infinity;
    const t = taxOf(d);
    const kd = k(d).key;
    for (const b of cands) {
      if (!left.has(b) || !sameSign(b, d) || !ok(b) || (rejected.size > 0 && rejected.has(`${kd}\n${k(b).key}`))) continue;
      const dt = Math.abs(taxOf(b) - t);
      const dd = Math.abs((b.date ?? 0) - (d.date ?? 0));
      if (dt < bt || (dt === bt && dd < bd)) {
        best = b;
        bt = dt;
        bd = dd;
      }
    }
    return best;
  };

  type Pass = { probable: boolean; note: string; find: (d: Doc) => Doc | undefined };
  const at = (d: Doc, ps: string[], prefix = d.gstin) => ps.map((p) => `${prefix}|${p}`);
  const regular: Pass[] = [
    { probable: false, note: 'Same invoice number', find: (d) => pick(from(byNo, at(d, k(d).plain)), d) },
    { probable: false, note: 'Invoice number written differently', find: (d) => pick(from(byCore, at(d, k(d).core)), d) },
    { probable: true, note: 'Same number part and tax, invoice number written differently', find: (d) => pick(from(byNum, at(d, k(d).num)), d, (b) => close(taxOf(b), taxOf(d))) },
    { probable: true, note: 'Same supplier, taxable value and tax; invoice number does not match', find: (d) => pick(byGstin.get(d.gstin) ?? [], d, (b) => close(b.taxable, d.taxable) && close(taxOf(b), taxOf(d)) && near(b, d)) },
    { probable: true, note: 'Same invoice under another GSTIN of the same PAN', find: (d) => pick(from(byPanCore, at(d, k(d).core, pan(d.gstin))), d, (b) => b.gstin !== d.gstin) },
  ];
  const imported: Pass[] = [
    { probable: false, note: 'Same bill of entry number', find: (d) => pick(from(byBoe, k(d).plain), d) },
    { probable: true, note: 'Same taxable value and IGST; bill of entry number does not match', find: (d) => pick(imports, d, (b) => close(b.taxable, d.taxable) && close(taxOf(b), taxOf(d)) && near(b, d)) },
  ];

  const pairs = new Map<Doc, { bk: Doc; pass: Pass | null }>();
  // Pairs you made.
  if (opt.decisions?.pairs.length) {
    const b2By = new Map<string, Doc>();
    for (const d of twoB) if (!b2By.has(k(d).key)) b2By.set(k(d).key, d);
    const bkBy = new Map<string, Doc>();
    for (const b of books) if (!bkBy.has(k(b).key)) bkBy.set(k(b).key, b);
    for (const id of opt.decisions.pairs) {
      const [a, b] = id.split('\n');
      const d = b2By.get(a);
      const bk = bkBy.get(b);
      if (!d || !bk || pairs.has(d) || !left.has(bk)) continue;
      left.delete(bk);
      pairs.set(d, { bk, pass: null });
    }
  }
  for (const [list, isImport] of [[regular, false], [imported, true]] as const)
    for (const pass of list)
      for (const d of twoB) {
        if (!!d.boe !== isImport || pairs.has(d)) continue;
        const bk = pass.find(d);
        if (!bk) continue;
        left.delete(bk);
        pairs.set(d, { bk, pass });
      }

  // The ITC time limit, for what is still open.
  const today = opt.today ?? null;
  const deadlineOf = (d: Doc) => (d.kind === 'Credit note' ? null : itcDeadline(d.date));
  const late = (deadline: number | null, status: Status): string[] => {
    // Bills outside the 2B months loaded were not checked, so nothing is known to be open.
    if (today == null || deadline == null || status === 'matched' || status === 'outside') return [];
    if (today > deadline) return [`Time-barred: ITC had to be taken by ${dayText(deadline)} (Section 16(4))`];
    return deadline - today <= 60 ? [`Take the ITC by ${dayText(deadline)} (Section 16(4))`] : [];
  };

  for (const d of twoB) {
    const p = pairs.get(d);
    const notes: string[] = [];
    if (/^n/i.test(d.itc ?? '')) notes.push('ITC not available as per GSTR-2B');
    if (d.rcm) notes.push('Reverse charge: ITC after paying the tax');
    if (d.section === 'B2BA') notes.push(`Amendment of invoice ${d.alt || ''}`.trim());
    if (!p) {
      const deadline = deadlineOf(d);
      lines.push({ status: 'only2b', notes: [...notes, ...late(deadline, 'only2b')], b2: d, bk: null, diff: diffOf(d, null), deadline });
      continue;
    }
    const { bk, pass } = p;
    const decided = !pass ? 'paired' : pass.probable && accepted.has(`${k(d).key}\n${k(bk).key}`) ? 'confirmed' : undefined;
    const diff = diffOf(d, bk);
    notes.unshift(pass ? pass.note : 'Paired by you');
    if (decided === 'confirmed') notes.push('Confirmed by you');
    const differs: string[] = [];
    if (!close(d.taxable, bk.taxable)) differs.push(`Taxable value differs by ${fmtAmt(diff.taxable)}`);
    const igst2 = Math.abs(d.igst) > tol;
    const igstB = Math.abs(bk.igst) > tol;
    if (igst2 !== igstB && (Math.abs(d.cgst) > tol || Math.abs(bk.cgst) > tol)) differs.push(igst2 ? 'IGST in 2B, CGST + SGST in the books' : 'CGST + SGST in 2B, IGST in the books');
    else
      for (const key of ['igst', 'cgst', 'sgst', 'cess'] as const) if (!close(d[key], bk[key])) differs.push(`${key.toUpperCase()} differs by ${fmtAmt(diff[key])}`);
    if (d.date != null && bk.date != null && d.date !== bk.date) (opt.dates ? differs : notes).push(`${d.boe ? 'Bill of entry' : 'Invoice'} date differs (${dayText(d.date)} in 2B, ${dayText(bk.date)} in the books)`);
    // The credit shows in one month's GSTR-2B but was booked in another.
    const bm = monthStart(bk.booked ?? bk.date);
    if (d.month != null && bm != null && bm !== d.month) notes.push(`In GSTR-2B of ${monthText(d.month)}, booked in ${monthText(bm)}`);
    if (twice(bk)) notes.push('Entered more than once in the books');
    const status: Status = pass?.probable && !decided ? 'probable' : differs.length ? 'differs' : 'matched';
    const deadline = deadlineOf(d.date != null ? d : bk);
    lines.push({ status, notes: [...notes, ...differs, ...late(deadline, status)], b2: d, bk, diff, deadline, ...(decided ? { decided } : {}) });
  }

  // Books documents never found: within the 2B months they are missing from 2B; outside, the
  // supplier's return for that month was simply not loaded.
  let lo = Infinity;
  let hi = -Infinity;
  for (const d of twoB)
    if (typeof d.month === 'number') {
      lo = Math.min(lo, d.month);
      hi = Math.max(hi, d.month);
    }
  const span: [number, number] | null = lo <= hi ? [lo, hi] : null;
  const end = span ? monthEnd(span[1]) : 0;
  for (const b of books) {
    if (!left.has(b)) continue;
    const notes: string[] = [];
    if (twice(b)) notes.push('Entered more than once in the books');
    const status: Status = span && b.date != null && (b.date < span[0] || b.date > end) ? 'outside' : 'onlyBooks';
    const deadline = deadlineOf(b);
    lines.push({ status, notes: [...notes, ...late(deadline, status)], b2: null, bk: b, diff: diffOf(null, b), deadline });
  }
  return { lines, months: span };
}

/** The last day of the date's month. */
const monthEnd = (d: number) => {
  const t = dateOf(d);
  return serial(t.getUTCFullYear(), t.getUTCMonth() + 1, 1) - 1;
};

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
    // Imports from overseas have no supplier GSTIN: they are listed together.
    const s = map.get(d.gstin) ?? { gstin: d.gstin, name: d.gstin ? '' : 'Imports (bills of entry)', tax2b: 0, taxBooks: 0, counts: { matched: 0, differs: 0, probable: 0, only2b: 0, onlyBooks: 0, outside: 0 } };
    s.name ||= l.b2?.name || l.bk?.name || '';
    if (l.b2) s.tax2b = r2(s.tax2b + taxOf(l.b2));
    if (l.bk && l.status !== 'outside') s.taxBooks = r2(s.taxBooks + taxOf(l.bk));
    s.counts[l.status]++;
    map.set(d.gstin, s);
  }
  return [...map.values()].sort((a, b) => Math.abs(b.tax2b - b.taxBooks) - Math.abs(a.tax2b - a.taxBooks) || a.gstin.localeCompare(b.gstin));
}

export interface MonthRow {
  month: number;
  /** ITC in that month's GSTR-2B. */
  tax2b: number;
  /** ITC booked in that month (voucher date, or the invoice date when not given). */
  taxBooks: number;
  /** Of the 2B ITC, what was booked in another month. */
  otherMonth: number;
}

/** Month by month over the GSTR-2B months loaded: the figures to hold against GSTR-3B. */
export function monthly(res: Result): MonthRow[] {
  if (!res.months) return [];
  const rows = new Map<number, MonthRow>();
  for (let m = res.months[0]; m <= res.months[1]; m = monthEnd(m) + 1) rows.set(m, { month: m, tax2b: 0, taxBooks: 0, otherMonth: 0 });
  for (const l of res.lines) {
    const bm = l.bk ? monthStart(l.bk.booked ?? l.bk.date) : null;
    const r2b = l.b2?.month != null ? rows.get(l.b2.month) : undefined;
    if (r2b && l.b2) {
      r2b.tax2b = r2(r2b.tax2b + taxOf(l.b2));
      if (l.bk && bm != null && bm !== l.b2.month) r2b.otherMonth = r2(r2b.otherMonth + taxOf(l.b2));
    }
    const rbk = bm != null ? rows.get(bm) : undefined;
    if (rbk && l.bk) rbk.taxBooks = r2(rbk.taxBooks + taxOf(l.bk));
  }
  return [...rows.values()];
}

/** The tax at stake on a line still open: missing on one side, or the difference. */
export const atStake = (l: Line) => (l.status === 'only2b' || l.status === 'probable' ? taxOf(l.b2!) : l.status === 'onlyBooks' || l.status === 'outside' ? taxOf(l.bk!) : l.status === 'differs' ? Math.abs(l.diff.tax) : 0);

export interface Due {
  deadline: number;
  count: number;
  tax: number;
  by: Partial<Record<Status, { count: number; tax: number }>>;
}

/**
 * Lines still open (in 2B only, in books only, differing or probable) whose ITC time limit is
 * near (within 60 days) or past.
 */
export function dues(lines: Line[], today: number): { soon: Due[]; barred: Due[] } {
  const soon = new Map<number, Due>();
  const barred = new Map<number, Due>();
  for (const l of lines) {
    if (l.deadline == null || !['only2b', 'onlyBooks', 'differs', 'probable'].includes(l.status)) continue;
    const to = l.deadline < today ? barred : l.deadline - today <= 60 ? soon : null;
    if (!to) continue;
    const d = to.get(l.deadline) ?? { deadline: l.deadline, count: 0, tax: 0, by: {} };
    const tax = atStake(l);
    d.count++;
    d.tax = r2(d.tax + tax);
    const b = (d.by[l.status] ??= { count: 0, tax: 0 });
    b.count++;
    b.tax = r2(b.tax + tax);
    to.set(l.deadline, d);
  }
  return { soon: [...soon.values()].sort((a, b) => a.deadline - b.deadline), barred: [...barred.values()].sort((a, b) => b.deadline - a.deadline) };
}

export interface FollowUp {
  gstin: string;
  name: string;
  lines: Line[];
  /** Tax the supplier has not reported (or reported short). */
  tax: number;
  /** A message to send the supplier, ready to paste into an email. */
  text: string;
}

const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Per supplier, the bills to take up with them: in the books but not in GSTR-2B, and those
 * reported with less tax than booked. Each comes with a message to send.
 */
export function followUps(res: Result, opt: { today?: number | null } = {}): FollowUp[] {
  const ours = [...new Set(res.lines.map((l) => l.b2?.ours).filter(Boolean))];
  const period = res.months ? (res.months[0] === res.months[1] ? monthText(res.months[0]) : `${monthText(res.months[0])} to ${monthText(res.months[1])}`) : '';
  // A bill entered twice in the books whose other copy matched is ours to correct, not the supplier's.
  const found = new Set(res.lines.filter((l) => l.b2 && l.bk).map((l) => `${l.bk!.gstin}|${plainNo(l.bk!.no)}`));
  const map = new Map<string, Line[]>();
  for (const l of res.lines) {
    const short = l.status === 'differs' && l.diff.tax < 0;
    if (!l.bk?.gstin || (l.status !== 'onlyBooks' && !short) || (l.status === 'onlyBooks' && found.has(`${l.bk.gstin}|${plainNo(l.bk.no)}`))) continue;
    map.set(l.bk.gstin, [...(map.get(l.bk.gstin) ?? []), l]);
  }
  const out: FollowUp[] = [];
  for (const [gstin, ls] of map) {
    const name = ls.find((l) => l.bk?.name)?.bk?.name || gstin;
    const tax = r2(ls.reduce((t, l) => t + (l.status === 'onlyBooks' ? taxOf(l.bk!) : -l.diff.tax), 0));
    const missing = ls.filter((l) => l.status === 'onlyBooks');
    const short = ls.filter((l) => l.status !== 'onlyBooks');
    const doc = (l: Line) => `${l.bk!.kind === 'Invoice' ? 'Invoice' : l.bk!.kind} ${l.bk!.no}${l.bk!.date != null ? ` dated ${dayText(l.bk!.date)}` : ''}`;
    const due = opt.today != null ? ls.map((l) => l.deadline).filter((d): d is number => d != null && d >= opt.today! && d - opt.today! <= 60).sort((a, b) => a - b)[0] : undefined;
    const text = [
      `Dear ${name},`,
      '',
      `We have checked our GSTR-2B${period ? ` for ${period}` : ''}${ours.length === 1 ? ` (our GSTIN ${ours[0]})` : ''} against our purchase register.`,
      ...(missing.length
        ? ['', `${missing.length === 1 ? 'This bill is' : `These ${missing.length} bills are`} not in it, so we cannot take the input tax credit. Please report ${missing.length === 1 ? 'it' : 'them'} in your GSTR-1 / IFF, or tell us if ${missing.length === 1 ? 'it was' : 'they were'} reported under another GSTIN or number:`, ...missing.map((l, i) => `${i + 1}. ${doc(l)}: taxable ₹${inr.format(l.bk!.taxable)}, tax ₹${inr.format(taxOf(l.bk!))}`)]
        : []),
      ...(short.length
        ? ['', `${short.length === 1 ? 'This bill was' : 'These bills were'} reported with less tax than charged to us. Please correct ${short.length === 1 ? 'it' : 'them'} by an amendment:`, ...short.map((l, i) => `${i + 1}. ${doc(l)}: tax ₹${inr.format(taxOf(l.bk!))} charged, ₹${inr.format(taxOf(l.b2!))} reported`)]
        : []),
      '',
      `Tax involved: ₹${inr.format(tax)}.${due != null ? ` The credit has to be taken by ${dayText(due)}, so please do this before then.` : ''}`,
      '',
      'Thank you.',
    ].join('\n');
    out.push({ gstin, name, lines: ls, tax, text });
  }
  return out.sort((a, b) => b.tax - a.tax);
}
