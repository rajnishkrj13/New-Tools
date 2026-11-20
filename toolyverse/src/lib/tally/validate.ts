/**
 * Checks vouchers before they become XML or go to Tally. Errors stop a voucher from being
 * exported; warnings point at things Tally may refuse or that look like mistakes.
 */
import { VOUCHER_TYPES, baseType, round2, totals, type Voucher } from './model';
import { child, children, val, type XNode } from './xml';

export type Level = 'error' | 'warning';

export interface Issue {
  level: Level;
  /** Index of the voucher in the list, or -1 for the file as a whole. */
  voucher: number;
  /** Spreadsheet row or XML line, when known. */
  at?: number;
  message: string;
}

export interface Summary {
  vouchers: number;
  entries: number;
  debit: number;
  credit: number;
  valid: number;
  invalid: number;
  errors: number;
  warnings: number;
}

export interface CheckOptions {
  /** Ledger names that exist in Tally (lower-cased), to find missing ledgers. */
  ledgers?: Set<string>;
  /** Voucher type names that exist in Tally (lower-cased) mapped to their parent type. */
  types?: Map<string, string>;
  /** Vouchers already in Tally, as "type|number|date" keys (lower-cased), to find duplicates. */
  existing?: Set<string>;
  company?: string;
  /** Whether a company name matters here (sending to Tally). */
  needCompany?: boolean;
}

const TAX = {
  cgst: /\bcgst\b|central (gst|tax)/i,
  sgst: /\b(sgst|utgst)\b|state (gst|tax)/i,
  igst: /\bigst\b|integrated (gst|tax)/i,
  input: /\binput\b|\bitc\b|receivable/i,
  output: /\boutput\b|payable/i,
};

export const voucherKey = (v: Pick<Voucher, 'type' | 'number' | 'date'>) => `${v.type}|${v.number}|${v.date}`.toLowerCase();

export function validate(vouchers: Voucher[], opts: CheckOptions = {}): { issues: Issue[]; summary: Summary; bad: Set<number> } {
  const issues: Issue[] = [];
  const add = (level: Level, voucher: number, message: string, at?: number) => issues.push({ level, voucher, message, at });

  if (opts.needCompany && !opts.company?.trim()) add('warning', -1, 'No company is chosen: Tally will import into the company that is open (or refuse when several are open).');
  if (!vouchers.length) add('error', -1, 'There are no vouchers to check.');

  const seen = new Map<string, number>();
  vouchers.forEach((v, i) => {
    const at = v.line ?? v.entries[0]?.row;
    const label = `Voucher ${v.number || i + 1}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) add('error', i, `${label}: the date "${v.date || 'blank'}" is not a valid date.`, at);
    else {
      const y = Number(v.date.slice(0, 4));
      if (y < 1990 || y > 2100) add('warning', i, `${label}: the year ${y} looks wrong.`, at);
    }
    if (!v.type.trim()) add('error', i, `${label}: the voucher type is missing.`, at);
    else {
      const known = opts.types?.has(v.type.toLowerCase());
      if (opts.types && !known) add('error', i, `${label}: voucher type "${v.type}" does not exist in Tally.`, at);
      else if (!opts.types && !VOUCHER_TYPES.some((t) => t.toLowerCase() === v.type.toLowerCase()))
        add('warning', i, `${label}: "${v.type}" is not one of Tally's standard voucher types${baseType(v.type) ? ` (it reads as ${baseType(v.type)})` : ''}; it must exist in the company with exactly this name.`, at);
    }
    if (!v.number.trim()) add('warning', i, `Voucher ${i + 1} (${v.date || 'no date'}): no voucher number. Tally numbers it only if the voucher type uses automatic numbering.`, at);
    else {
      const k = voucherKey({ ...v, date: '' });
      if (seen.has(k)) add('warning', i, `${label}: the same number is used again for a ${v.type} voucher (first at voucher ${seen.get(k)! + 1}).`, at);
      else seen.set(k, i);
    }
    if (opts.existing?.has(voucherKey(v))) add('error', i, `${label}: a ${v.type} voucher with this number and date is already in Tally.`, at);
    if (v.referenceDate && !/^\d{4}-\d{2}-\d{2}$/.test(v.referenceDate)) add('error', i, `${label}: the reference date is not a valid date.`, at);

    if (v.entries.length < 2) add('error', i, `${label}: a voucher needs at least two ledger lines (a debit and a credit).`, at);
    const base = baseType(v.type, opts.types);
    let hasDr = false;
    let hasCr = false;
    v.entries.forEach((e, j) => {
      const where = e.row ?? at;
      const line = `${label}, line ${j + 1}`;
      if (!e.ledger.trim()) add('error', i, `${line}: the ledger name is missing.`, where);
      else if (opts.ledgers && !opts.ledgers.has(e.ledger.trim().toLowerCase())) add('error', i, `${line}: ledger "${e.ledger}" does not exist in Tally.`, where);
      if (Number.isNaN(e.dr) || Number.isNaN(e.cr)) add('error', i, `${line}: the amount is not a number.`, where);
      else if (e.dr < 0 || e.cr < 0) add('error', i, `${line}: negative amount. Put it in the other column (debit or credit) instead.`, where);
      else if (e.dr > 0 && e.cr > 0) add('error', i, `${line}: has both a debit and a credit amount; use one per line.`, where);
      else if (!e.dr && !e.cr) add('error', i, `${line}: has no amount.`, where);
      if (e.dr > 0) hasDr = true;
      if (e.cr > 0) hasCr = true;
      const amt = e.dr || e.cr || 0;
      if (e.costCentres.length) {
        const sum = round2(e.costCentres.reduce((n, c) => n + c.amount, 0));
        if (e.costCentres.some((c) => !c.centre.trim())) add('error', i, `${line}: a cost centre has no name.`, where);
        if (Math.abs(sum - amt) > 0.005) add('error', i, `${line}: cost centres add up to ${sum.toFixed(2)}, not the line's ${amt.toFixed(2)}.`, where);
      } else if (e.costCategory) add('warning', i, `${line}: a cost category is given without a cost centre.`, where);
      if (e.bills.length) {
        const sum = round2(e.bills.reduce((n, b) => n + b.amount, 0));
        if (Math.abs(sum - amt) > 0.005) add('error', i, `${line}: bill references add up to ${sum.toFixed(2)}, not the line's ${amt.toFixed(2)}.`, where);
        if (e.bills.some((b) => b.type !== 'On Account' && !b.name.trim())) add('error', i, `${line}: a bill reference has no bill name.`, where);
      }
    });
    if (v.entries.length >= 2 && (!hasDr || !hasCr)) add('error', i, `${label}: needs at least one debit and one credit line.`, at);
    const t = totals(v);
    if (Math.abs(t.dr - t.cr) > 0.005) add('error', i, `${label}: debits (${t.dr.toFixed(2)}) and credits (${t.cr.toFixed(2)}) differ by ${round2(t.dr - t.cr).toFixed(2)}.`, at);

    // GST lines that do not pair up or sit on the unusual side.
    const cg = v.entries.filter((e) => TAX.cgst.test(e.ledger));
    const sg = v.entries.filter((e) => TAX.sgst.test(e.ledger));
    const ig = v.entries.filter((e) => TAX.igst.test(e.ledger));
    const sum = (l: typeof cg) => round2(l.reduce((n, e) => n + e.dr - e.cr, 0));
    if ((cg.length || sg.length) && Math.abs(sum(cg) - sum(sg)) > 0.05) add('warning', i, `${label}: CGST (${Math.abs(sum(cg)).toFixed(2)}) and SGST/UTGST (${Math.abs(sum(sg)).toFixed(2)}) are usually equal.`, at);
    if (ig.length && (cg.length || sg.length) && base !== 'Journal') add('warning', i, `${label}: IGST together with CGST/SGST on one ${base ?? ''} voucher is unusual (inter-state and intra-state tax).`, at);
    for (const e of [...cg, ...sg, ...ig]) {
      if ((base === 'Sales' || base === 'Debit Note') && TAX.input.test(e.ledger)) add('warning', i, `${label}: input tax ledger "${e.ledger}" on a ${base} voucher; sales usually use output tax.`, e.row ?? at);
      if ((base === 'Purchase' || base === 'Credit Note') && TAX.output.test(e.ledger)) add('warning', i, `${label}: output tax ledger "${e.ledger}" on a ${base} voucher; purchases usually use input tax.`, e.row ?? at);
      if (base === 'Sales' && e.dr > 0 && !TAX.input.test(e.ledger)) add('warning', i, `${label}: "${e.ledger}" is debited on a sales voucher; output tax is normally credited.`, e.row ?? at);
      if (base === 'Purchase' && e.cr > 0 && !TAX.output.test(e.ledger)) add('warning', i, `${label}: "${e.ledger}" is credited on a purchase voucher; input tax is normally debited.`, e.row ?? at);
    }
    if (base === 'Contra' && v.entries.some((e) => e.ledger && !/bank|cash|\bod\b|overdraft|\bcc\b|petty|hdfc|icici|sbi|axis|kotak/i.test(e.ledger)))
      add('warning', i, `${label}: a Contra voucher moves money between cash and bank ledgers only; check that every ledger is a cash or bank account.`, at);
  });

  const bad = new Set(issues.filter((x) => x.level === 'error' && x.voucher >= 0).map((x) => x.voucher));
  const all = vouchers.reduce(
    (a, v) => {
      const t = totals(v);
      a.dr += t.dr;
      a.cr += t.cr;
      a.n += v.entries.length;
      return a;
    },
    { dr: 0, cr: 0, n: 0 },
  );
  return {
    issues,
    bad,
    summary: {
      vouchers: vouchers.length,
      entries: all.n,
      debit: round2(all.dr),
      credit: round2(all.cr),
      valid: vouchers.length - bad.size,
      invalid: bad.size,
      errors: issues.filter((x) => x.level === 'error').length,
      warnings: issues.filter((x) => x.level === 'warning').length,
    },
  };
}

/**
 * The shape of a Tally import file: envelope, request, where the vouchers sit, and the tags each
 * voucher and ledger line needs. Line numbers refer to the XML file.
 */
export function checkStructure(root: XNode, voucherNodes: XNode[]): Issue[] {
  const issues: Issue[] = [];
  const add = (level: Level, message: string, at?: number, voucher = -1) => issues.push({ level, voucher, at, message });
  if (root.name.toUpperCase() !== 'ENVELOPE') add('error', `The top element is <${root.name}>; Tally files start with <ENVELOPE>.`, root.line);
  const header = child(root, 'HEADER');
  const body = child(root, 'BODY');
  if (!header) add('warning', 'No <HEADER>: Tally needs one when the file is sent to its XML port.', root.line);
  const request = val(header, 'TALLYREQUEST');
  if (header && !request) add('warning', 'The <HEADER> has no <TALLYREQUEST> (for imports: "Import Data").', header.line);
  if (!body) add('error', 'No <BODY> element.', root.line);
  const importData = child(body, 'IMPORTDATA');
  if (/import/i.test(request) && body && !importData && !child(body, 'DATA')) add('error', 'An import request needs <BODY><IMPORTDATA>.', body.line);
  if (importData) {
    const desc = child(importData, 'REQUESTDESC');
    const report = val(desc, 'REPORTNAME');
    if (!desc) add('error', '<IMPORTDATA> has no <REQUESTDESC>.', importData.line);
    else if (!report) add('error', '<REQUESTDESC> has no <REPORTNAME> ("Vouchers" or "All Masters").', desc.line);
    else if (!/^(vouchers|all masters|masters|all vouchers)$/i.test(report)) add('warning', `REPORTNAME is "${report}"; Tally imports "Vouchers" or "All Masters".`, desc.line);
    if (report && /masters/i.test(report) && voucherNodes.length) add('warning', 'The file imports "All Masters" but holds vouchers; Tally may skip them. Use REPORTNAME "Vouchers".', desc?.line);
    const data = child(importData, 'REQUESTDATA');
    if (!data) add('error', '<IMPORTDATA> has no <REQUESTDATA>.', importData.line);
    else if (!children(data, 'TALLYMESSAGE').length) add('error', '<REQUESTDATA> has no <TALLYMESSAGE> elements.', data.line);
  }
  voucherNodes.forEach((n, i) => {
    const label = `Voucher ${val(n, 'VOUCHERNUMBER') || i + 1}`;
    const tname = val(n, 'VOUCHERTYPENAME');
    if (!val(n, 'DATE')) add('error', `${label}: no <DATE>.`, n.line, i);
    if (!tname && !n.attrs.VCHTYPE) add('error', `${label}: no <VOUCHERTYPENAME> or VCHTYPE.`, n.line, i);
    else if (tname && n.attrs.VCHTYPE && tname.toLowerCase() !== n.attrs.VCHTYPE.toLowerCase()) add('warning', `${label}: VCHTYPE "${n.attrs.VCHTYPE}" and VOUCHERTYPENAME "${tname}" differ.`, n.line, i);
    if (n.attrs.ACTION && !/^(create|alter|delete|cancel)$/i.test(n.attrs.ACTION)) add('warning', `${label}: ACTION "${n.attrs.ACTION}" is not one Tally knows.`, n.line, i);
    const lines = [...children(n, 'ALLLEDGERENTRIES.LIST'), ...children(n, 'LEDGERENTRIES.LIST')];
    const stock = [...children(n, 'ALLINVENTORYENTRIES.LIST'), ...children(n, 'INVENTORYENTRIES.LIST')];
    if (!lines.length && !stock.length) add('error', `${label}: no ledger lines (ALLLEDGERENTRIES.LIST).`, n.line, i);
    for (const e of lines) {
      if (!val(e, 'LEDGERNAME')) add('error', `${label}: a ledger line has no <LEDGERNAME>.`, e.line, i);
      const amt = val(e, 'AMOUNT');
      if (!amt) add('error', `${label}: ledger line "${val(e, 'LEDGERNAME')}" has no <AMOUNT>.`, e.line, i);
      else if (!/^-?\d+(\.\d+)?$/.test(amt.trim())) add('error', `${label}: AMOUNT "${amt}" is not a plain number (Tally wants 1234.50 or -1234.50).`, e.line, i);
      const deemed = val(e, 'ISDEEMEDPOSITIVE').toLowerCase();
      if (amt && deemed && Number(amt) !== 0 && (deemed === 'yes') !== Number(amt) < 0)
        add('warning', `${label}: "${val(e, 'LEDGERNAME')}" says ISDEEMEDPOSITIVE ${val(e, 'ISDEEMEDPOSITIVE')} but the amount is ${Number(amt) < 0 ? 'negative (a debit)' : 'positive (a credit)'}.`, e.line, i);
    }
    const date = val(n, 'DATE');
    if (date && !/^\d{8}$/.test(date)) add('warning', `${label}: DATE "${date}" is not in Tally's YYYYMMDD form.`, n.line, i);
  });
  return issues;
}
