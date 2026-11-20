/**
 * The accounting voucher as every Tally tool here sees it, whatever it came from (the editor,
 * an Excel sheet, a Tally XML file) and wherever it goes (Tally XML, Excel, Tally itself).
 */

export const VOUCHER_TYPES = ['Journal', 'Payment', 'Receipt', 'Contra', 'Sales', 'Purchase', 'Debit Note', 'Credit Note'] as const;
export type BaseType = (typeof VOUCHER_TYPES)[number];

export const BILL_TYPES = ['New Ref', 'Agst Ref', 'Advance', 'On Account'] as const;
export type BillType = (typeof BILL_TYPES)[number];

export interface CostAlloc {
  centre: string;
  amount: number;
}

export interface BillAlloc {
  name: string;
  type: BillType;
  amount: number;
}

export interface Entry {
  ledger: string;
  /** Exactly one of dr / cr is above zero on a valid entry. */
  dr: number;
  cr: number;
  costCategory: string;
  costCentres: CostAlloc[];
  bills: BillAlloc[];
  /** Spreadsheet row this entry came from (1-based), for error messages. */
  row?: number;
  /** Bank details read from Tally XML (instrument number, date, transaction type…). */
  bank?: Record<string, string>;
  /** Other ledger-entry fields read from Tally XML, kept so nothing is dropped silently. */
  extra?: Record<string, string>;
}

export interface Voucher {
  date: string; // YYYY-MM-DD
  /** Voucher type name as in Tally (may be a custom type such as "Sales GST"). */
  type: string;
  number: string;
  reference: string;
  referenceDate: string; // YYYY-MM-DD or ''
  narration: string;
  entries: Entry[];
  /** Party ledger as Tally recorded it (read from XML). */
  party?: string;
  /** Fields of the voucher not covered above, from Tally XML. */
  extra?: Record<string, string>;
  /** Stock lines of an invoice, read from Tally XML. */
  inventory?: Record<string, string>[];
  /** Line in the XML file or first row in the sheet. */
  line?: number;
}

export const emptyEntry = (): Entry => ({ ledger: '', dr: 0, cr: 0, costCategory: '', costCentres: [], bills: [] });

export const totals = (v: Voucher) => ({
  dr: round2(v.entries.reduce((n, e) => n + (e.dr || 0), 0)),
  cr: round2(v.entries.reduce((n, e) => n + (e.cr || 0), 0)),
});

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The built-in type a voucher type name belongs to: "Sales GST" → Sales, "Bank Payment" → Payment. */
export function baseType(name: string, parents?: Map<string, string>): BaseType | null {
  let n = name.trim();
  for (let hops = 0; hops < 6 && n; hops++) {
    const exact = VOUCHER_TYPES.find((t) => t.toLowerCase() === n.toLowerCase());
    if (exact) return exact;
    const parent = parents?.get(n.toLowerCase());
    if (!parent) break;
    n = parent;
  }
  const s = name.toLowerCase().replace(/[^a-z ]/g, ' ');
  if (/\bjournal\b|\bjv\b/.test(s)) return 'Journal';
  if (/debit note|\bdn\b/.test(s)) return 'Debit Note';
  if (/credit note|\bcn\b/.test(s)) return 'Credit Note';
  if (/payment|\bpmt\b/.test(s)) return 'Payment';
  if (/receipt|\brct\b/.test(s)) return 'Receipt';
  if (/contra/.test(s)) return 'Contra';
  if (/sales|\bsale\b|invoice/.test(s)) return 'Sales';
  if (/purchase/.test(s)) return 'Purchase';
  return null;
}

// ---- Dates ----------------------------------------------------------------------------------------

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += y < 70 ? 2000 : 1900;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * A date written any common way, as YYYY-MM-DD, or null. Numbers are Excel serial dates.
 * Day comes before month (Indian order) unless the year comes first.
 */
export function parseDate(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : iso(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === 'number') {
    if (v > 19000101 && v < 21001231 && Number.isInteger(v)) return parseDate(String(v));
    if (v < 1 || v > 100000) return null;
    const ms = Math.round((v - 25569) * 86400000);
    const d = new Date(ms);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(v).trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(s); // Tally: 20260401
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/.exec(s);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2}|\d{4})$/.exec(s);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = /^(\d{1,2})[-/. ]?([A-Za-z]{3,9})[-/., ]*(\d{2}|\d{4})$/.exec(s); // 1-Apr-2026, 01 April 2026
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    return mi < 0 ? null : iso(+m[3], mi + 1, +m[1]);
  }
  m = /^([A-Za-z]{3,9})[ -](\d{1,2}),? (\d{4})$/.exec(s); // April 1, 2026
  if (m) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    return mi < 0 ? null : iso(+m[3], mi + 1, +m[2]);
  }
  if (/^\d+(\.\d+)?$/.test(s)) return parseDate(Number(s));
  return null;
}

export const tallyDate = (isoDate: string) => isoDate.replace(/-/g, '');

/** 2026-04-01 → 01-04-2026 for display. */
export const showDate = (isoDate: string) => (/^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? isoDate.split('-').reverse().join('-') : isoDate);

/** Indian financial year of a date: 2026-05-10 → "2026-27". */
export function financialYear(isoDate: string): string {
  const [y, m] = isoDate.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

// ---- Amounts --------------------------------------------------------------------------------------

/**
 * An amount as typed or exported: "1,25,000.50", "₹ 500", "(250.00)", "500 Dr", "-500".
 * Returns NaN when it is not a number, 0 for empty.
 */
export function parseAmount(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  let s = String(v).trim();
  if (!s) return 0;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  if (/\s*(cr|cr\.)$/i.test(s)) s = s.replace(/\s*cr\.?$/i, '');
  else if (/\s*(dr|dr\.)$/i.test(s)) s = s.replace(/\s*dr\.?$/i, '');
  s = s.replace(/[₹$€£,\s]|rs\.?|inr/gi, '');
  if (!/^[-+]?\d*\.?\d+$/.test(s)) return NaN;
  return sign * Number(s);
}

/** Tally amount text: two decimals, minus for debit as Tally writes it. */
export const tallyAmount = (n: number) => round2(n).toFixed(2);

// ---- Allocation cells ----------------------------------------------------------------------------

/**
 * A cost centre cell: "Delhi" (the whole amount) or a split "Delhi: 3000; Mumbai: 2000".
 */
export function parseCostCentres(cell: string, amount: number): { allocs: CostAlloc[]; error?: string } {
  const s = cell.trim();
  if (!s) return { allocs: [] };
  const parts = s.split(/[;|\n]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 1 && !/:\s*[\d,.]+\s*$/.test(parts[0])) return { allocs: [{ centre: parts[0], amount }] };
  const allocs: CostAlloc[] = [];
  for (const p of parts) {
    const m = /^(.*?):\s*([\d,.]+)\s*$/.exec(p);
    if (!m) return { allocs, error: `Cost centre "${p}" needs an amount, like "${p}: 1000".` };
    allocs.push({ centre: m[1].trim(), amount: parseAmount(m[2]) });
  }
  return { allocs };
}

/**
 * A bill-wise cell: "INV-101" (whole amount, usual type for the voucher), "Agst Ref INV-101",
 * "New Ref INV-9: 5000; Agst Ref INV-3: 2000", "Advance ADV-1" or "On Account".
 */
export function parseBills(cell: string, amount: number, voucherBase: BaseType | null): { bills: BillAlloc[]; error?: string } {
  const s = cell.trim();
  if (!s) return { bills: [] };
  const fallback: BillType = voucherBase === 'Payment' || voucherBase === 'Receipt' || voucherBase === 'Contra' ? 'Agst Ref' : 'New Ref';
  const parts = s.split(/[;|\n]/).map((p) => p.trim()).filter(Boolean);
  const bills: BillAlloc[] = [];
  for (const p of parts) {
    let rest = p;
    let type: BillType = fallback;
    const t = BILL_TYPES.find((b) => rest.toLowerCase().startsWith(b.toLowerCase()));
    if (t) {
      type = t;
      rest = rest.slice(t.length).replace(/^[\s:-]+/, '');
    } else if (/^agst\.?\s|^against\s/i.test(rest)) {
      type = 'Agst Ref';
      rest = rest.replace(/^(agst\.?|against)\s+(ref\.?\s+)?/i, '');
    }
    const m = /^(.*?)(?::\s*([\d,.]+))?\s*$/.exec(rest)!;
    const name = m[1].trim();
    if (!name && type !== 'On Account') return { bills, error: `Bill reference "${p}" has no bill name.` };
    bills.push({ name: name || (type === 'On Account' ? '' : name), type, amount: m[2] ? parseAmount(m[2]) : parts.length === 1 ? amount : NaN });
  }
  if (bills.some((b) => Number.isNaN(b.amount))) return { bills, error: 'When an entry is split over several bills, give each bill its amount, like "INV-1: 3000; INV-2: 2000".' };
  return { bills };
}

export const costCell = (e: Entry) => {
  const amt = e.dr || e.cr;
  if (e.costCentres.length === 1 && round2(e.costCentres[0].amount) === round2(amt)) return e.costCentres[0].centre;
  return e.costCentres.map((c) => `${c.centre}: ${round2(c.amount)}`).join('; ');
};

export const billCell = (e: Entry, voucherBase: BaseType | null) => {
  const amt = e.dr || e.cr;
  const fallback = voucherBase === 'Payment' || voucherBase === 'Receipt' || voucherBase === 'Contra' ? 'Agst Ref' : 'New Ref';
  if (e.bills.length === 1 && round2(e.bills[0].amount) === round2(amt)) return e.bills[0].type === fallback ? e.bills[0].name : `${e.bills[0].type} ${e.bills[0].name}`.trim();
  return e.bills.map((b) => `${b.type} ${b.name}: ${round2(b.amount)}`.replace('  ', ' ')).join('; ');
};
