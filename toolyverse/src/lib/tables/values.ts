/**
 * What kind of value a cell holds, for Excel: a number (with its format), a date, or text.
 * Nothing is rounded or re-signed: "1,250.00 Cr" stays 1250 shown as "1,250.00 Cr". Identifiers
 * (GSTIN, PAN, IFSC, account and invoice numbers, anything with leading zeros or more than 15
 * digits) stay text so Excel cannot drop zeros or turn them into 1.23E+15.
 */

export type Value = { kind: 'number'; value: number; format: string } | { kind: 'date'; value: Date; format: string } | { kind: 'text'; value: string };

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN = /^[A-Z]{5}\d{4}[A-Z]$/;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Column headings whose values are identifiers, never amounts. */
export const ID_HEADING = /invoice|inv\.?\s*no|bill\s*no|voucher|vch|ref|cheque|chq|instrument|account\s*no|a\/c\s*no|acc\.?\s*no|gstin|gst\s*no|pan|ifsc|pin\s*code|pincode|mobile|phone|contact|hsn|sac|code|serial|sr\.?\s*no|s\.?\s*no|utr|txn|transaction\s*id|order|policy|aadhaar|uan|folio|isin|batch|lot/i;

function utcDate(y: number, m: number, d: number): Date | null {
  if (y < 100) y += y < 70 ? 2000 : 1900;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : null;
}

function parseDateText(s: string): { date: Date; format: string } | null {
  let m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const d = utcDate(+m[3], +m[2], +m[1]);
    return d ? { date: d, format: 'dd-mm-yyyy' } : null;
  }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const d = utcDate(+m[1], +m[2], +m[3]);
    return d ? { date: d, format: 'yyyy-mm-dd' } : null;
  }
  m = /^(\d{1,2})[-/. ]([A-Za-z]{3,9})[-/., ]+(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    const d = mi < 0 ? null : utcDate(+m[3], mi + 1, +m[1]);
    return d ? { date: d, format: 'dd-mmm-yyyy' } : null;
  }
  return null;
}

/** A cell's text as an Excel value. `idColumn` keeps everything as text (a heading said so). */
export function valueOf(raw: string, idColumn = false): Value {
  const s = raw.trim();
  if (!s || idColumn || s.includes('\n')) return { kind: 'text', value: raw };
  const compact = s.replace(/\s+/g, '');
  if (GSTIN.test(compact) || PAN.test(compact) || IFSC.test(compact)) return { kind: 'text', value: raw };
  const date = parseDateText(s);
  if (date) return { kind: 'date', value: date.date, format: date.format };

  // Amounts: Indian or international grouping, minus, brackets or a trailing minus, Dr/Cr, %, currency.
  const m = /^([-+])?\s*\(?\s*(₹|rs\.?|inr|\$|€|£)?\s*([-+])?\s*(\d{1,3}(?:,\d{2,3})+|\d+)(\.\d+)?\s*\)?\s*(-)?\s*(%|cr\.?|dr\.?)?$/i.exec(s);
  if (!m) return { kind: 'text', value: raw };
  const [, sign1, cur, sign2, int, frac = '', trail, suffix] = m;
  const digits = int.replace(/,/g, '');
  // Leading zeros (codes, account numbers) and very long numbers stay text.
  if ((digits.length > 1 && digits.startsWith('0') && !frac) || digits.length + frac.length - 1 > 15) return { kind: 'text', value: raw };
  if (int.includes(',') && !/^\d{1,3}(,\d{3})+$/.test(int) && !/^\d{1,2}(,\d{2})*,\d{3}$/.test(int)) return { kind: 'text', value: raw };
  const bracketed = /^\(/.test(s.replace(/^[-+]\s*/, '')) && /\)\s*(%|cr\.?|dr\.?)?$/i.test(s);
  if (/\(/.test(s) !== /\)/.test(s)) return { kind: 'text', value: raw };
  const neg = sign1 === '-' || sign2 === '-' || !!trail || bracketed;
  let value = Number(digits + frac) * (neg ? -1 : 1);
  const dec = Math.max(0, frac.length - 1);
  const places = dec ? `.${'0'.repeat(dec)}` : '';
  const prefix = cur ? `"${cur.startsWith('₹') ? '₹' : cur}"` : '';
  const after = suffix && /cr/i.test(suffix) ? ' "Cr"' : suffix && /dr/i.test(suffix) ? ' "Dr"' : '';
  let format = `${prefix}#,##0${places}${after}`;
  if (suffix === '%') {
    value /= 100;
    format = `0${places}%`;
  } else if (/^\d{1,2}(,\d{2})+,\d{3}$/.test(int) && value >= 0) {
    // Written the Indian way (1,25,000.50): shown the same way, lakhs and crores, still a number.
    // Excel has no such grouping of its own, so the format picks it by size.
    const g = (pattern: string) => `${prefix}${pattern}${places}${after}`;
    format = `[>=10000000]${g('##\\,##\\,##\\,##0')};[>=100000]${g('##\\,##\\,##0')};${g('##,##0')}`;
  }
  // Negative amounts written in brackets keep their brackets.
  if (bracketed) format = `${format};(${format})`;
  return { kind: 'number', value, format };
}
