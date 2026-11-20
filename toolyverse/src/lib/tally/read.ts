/**
 * Reads Tally XML of any kind: import files, Day Book and voucher exports, masters (ledgers,
 * groups, cost centres, stock items, voucher types), reports (Trial Balance, Balance Sheet…)
 * and Tally's replies to an import. Fields not mapped to the voucher model are kept as "extra"
 * and counted, so a conversion never drops information without saying so.
 */
import { child, children, findAll, val, type XNode } from './xml';
import { BILL_TYPES, parseAmount, parseDate, round2, type BillType, type Entry, type Voucher } from './model';

const VOUCHER_KNOWN = new Set([
  'DATE',
  'EFFECTIVEDATE',
  'VOUCHERTYPENAME',
  'VOUCHERNUMBER',
  'REFERENCE',
  'REFERENCEDATE',
  'NARRATION',
  'PARTYLEDGERNAME',
  'ALLLEDGERENTRIES.LIST',
  'LEDGERENTRIES.LIST',
  'ALLINVENTORYENTRIES.LIST',
  'INVENTORYENTRIES.LIST',
  'ISINVOICE',
  'PERSISTEDVIEW',
]);
const ENTRY_KNOWN = new Set(['LEDGERNAME', 'ISDEEMEDPOSITIVE', 'AMOUNT', 'CATEGORYALLOCATIONS.LIST', 'BILLALLOCATIONS.LIST', 'BANKALLOCATIONS.LIST', 'ISPARTYLEDGER']);

export interface Unsupported {
  /** Where it was found, like "VOUCHER/GSTDETAILS.LIST". */
  path: string;
  count: number;
  example: string;
}

export interface MasterTable {
  kind: string;
  rows: Record<string, string>[];
}

export interface TallyRead {
  vouchers: Voucher[];
  /** The VOUCHER elements themselves, same order, for passing a file on to Tally unchanged. */
  voucherNodes: XNode[];
  masters: MasterTable[];
  /** A report export (Trial Balance, Balance Sheet…) flattened to rows, when that is what the file is. */
  report: { columns: string[]; rows: Record<string, string>[] } | null;
  unsupported: Unsupported[];
  company: string;
  /** What kind of file this looks like, in words. */
  kind: string;
}

/** Leaf values below a node, as "TAG" or "PARENT.LIST/TAG" keys; lists of lists are not flattened. */
function leaves(node: XNode, prefix = '', out: Record<string, string> = {}, depth = 0): Record<string, string> {
  for (const c of node.children) {
    const key = prefix ? `${prefix}/${c.name}` : c.name;
    if (!c.children.length) {
      if (c.text) out[key] = out[key] ? `${out[key]}; ${c.text}` : c.text;
    } else if (depth < 3) leaves(c, key, out, depth + 1);
  }
  return out;
}

const hasContent = (n: XNode): boolean => !!n.text || n.children.some(hasContent) || Object.keys(n.attrs).some((k) => n.attrs[k] && !['TYPE', 'ISOPTIONAL'].includes(k));

function note(unsupported: Map<string, Unsupported>, path: string, n: XNode) {
  const u = unsupported.get(path) ?? { path, count: 0, example: '' };
  u.count++;
  if (!u.example) {
    const l = leaves(n);
    u.example = (n.text || Object.entries(l).slice(0, 3).map(([k, v]) => `${k}=${v}`).join(', ')).slice(0, 120);
  }
  unsupported.set(path, u);
}

function readEntry(n: XNode, unsupported: Map<string, Unsupported>, where: string): Entry {
  const amount = parseAmount(val(n, 'AMOUNT'));
  const deemed = val(n, 'ISDEEMEDPOSITIVE').toLowerCase();
  // Negative amounts are debits in Tally XML; ISDEEMEDPOSITIVE settles a zero or unsigned amount.
  const debit = amount < 0 || (amount === 0 && deemed === 'yes');
  const abs = Math.abs(amount) || 0;
  const e: Entry = { ledger: val(n, 'LEDGERNAME'), dr: debit ? round2(abs) : 0, cr: debit ? 0 : round2(abs), costCategory: '', costCentres: [], bills: [] };
  for (const cat of children(n, 'CATEGORYALLOCATIONS.LIST')) {
    e.costCategory = e.costCategory || val(cat, 'CATEGORY');
    for (const cc of children(cat, 'COSTCENTREALLOCATIONS.LIST')) e.costCentres.push({ centre: val(cc, 'NAME'), amount: Math.abs(parseAmount(val(cc, 'AMOUNT'))) || 0 });
  }
  for (const b of children(n, 'BILLALLOCATIONS.LIST')) {
    const type = (BILL_TYPES.find((t) => t.toLowerCase() === val(b, 'BILLTYPE').toLowerCase()) ?? 'Agst Ref') as BillType;
    if (!val(b, 'NAME') && !val(b, 'BILLTYPE') && !val(b, 'AMOUNT')) continue;
    e.bills.push({ name: val(b, 'NAME'), type, amount: Math.abs(parseAmount(val(b, 'AMOUNT'))) || 0 });
  }
  const bank = child(n, 'BANKALLOCATIONS.LIST');
  if (bank && hasContent(bank)) {
    const l = leaves(bank);
    delete l.AMOUNT;
    if (Object.keys(l).length) e.bank = l;
  }
  const extra: Record<string, string> = {};
  for (const c of n.children) {
    const up = c.name.toUpperCase();
    if (ENTRY_KNOWN.has(up) || !hasContent(c)) continue;
    if (!c.children.length) extra[c.name] = c.text;
    else note(unsupported, `${where}/${c.name}`, c);
  }
  if (Object.keys(extra).length) e.extra = extra;
  return e;
}

/** One VOUCHER element as a voucher. */
export function readVoucher(n: XNode, unsupported: Map<string, Unsupported> = new Map()): Voucher {
  const entries: Entry[] = [];
  for (const tag of ['ALLLEDGERENTRIES.LIST', 'LEDGERENTRIES.LIST']) for (const e of children(n, tag)) if (val(e, 'LEDGERNAME') || val(e, 'AMOUNT')) entries.push(readEntry(e, unsupported, `VOUCHER/${tag}`));
  const inventory: Record<string, string>[] = [];
  for (const tag of ['ALLINVENTORYENTRIES.LIST', 'INVENTORYENTRIES.LIST']) {
    for (const inv of children(n, tag)) {
      const row: Record<string, string> = {};
      for (const c of inv.children) if (!c.children.length && c.text) row[c.name] = c.text;
      for (const b of children(inv, 'BATCHALLOCATIONS.LIST')) for (const [k, v] of Object.entries(leaves(b))) row[`BATCH/${k}`] = v;
      if (Object.keys(row).length) inventory.push(row);
      // The sales or purchase ledger of an invoice sits inside each stock line.
      for (const acc of children(inv, 'ACCOUNTINGALLOCATIONS.LIST')) if (val(acc, 'LEDGERNAME')) entries.push(readEntry(acc, unsupported, `VOUCHER/${tag}/ACCOUNTINGALLOCATIONS.LIST`));
    }
  }
  const extra: Record<string, string> = {};
  for (const [k, v] of Object.entries(n.attrs)) if (v && !['VCHTYPE', 'ACTION', 'OBJVIEW'].includes(k)) extra[`@${k}`] = v;
  for (const c of n.children) {
    const up = c.name.toUpperCase();
    if (VOUCHER_KNOWN.has(up) || !hasContent(c)) continue;
    if (!c.children.length) extra[c.name] = c.text;
    else note(unsupported, `VOUCHER/${c.name}`, c);
  }
  const type = val(n, 'VOUCHERTYPENAME') || n.attrs.VCHTYPE || '';
  return {
    date: parseDate(val(n, 'DATE')) ?? val(n, 'DATE'),
    type,
    number: val(n, 'VOUCHERNUMBER'),
    reference: val(n, 'REFERENCE'),
    referenceDate: parseDate(val(n, 'REFERENCEDATE')) ?? '',
    narration: val(n, 'NARRATION'),
    party: val(n, 'PARTYLEDGERNAME') || undefined,
    entries,
    extra: Object.keys(extra).length ? extra : undefined,
    inventory: inventory.length ? inventory : undefined,
    line: n.line,
  };
}

const MASTERS = ['LEDGER', 'GROUP', 'COSTCENTRE', 'COSTCATEGORY', 'STOCKITEM', 'STOCKGROUP', 'UNIT', 'GODOWN', 'VOUCHERTYPE', 'CURRENCY', 'COMPANY'];

function masterName(n: XNode): string {
  if (n.attrs.NAME) return n.attrs.NAME;
  const list = child(n, 'NAME.LIST') ?? child(child(n, 'LANGUAGENAME.LIST'), 'NAME.LIST');
  return val(list, 'NAME') || val(n, 'NAME');
}

/** Reads everything a Tally XML file holds. */
export function readTally(root: XNode): TallyRead {
  const unsupported = new Map<string, Unsupported>();
  const voucherNodes = findAll(root, 'VOUCHER').filter((v) => v.children.length);
  const vouchers = voucherNodes.map((n) => readVoucher(n, unsupported));

  const masters: MasterTable[] = [];
  for (const kind of MASTERS) {
    const nodes = findAll(root, kind).filter((n) => n.children.length || n.attrs.NAME);
    if (!nodes.length) continue;
    const rows = nodes.map((n) => {
      const row: Record<string, string> = { NAME: masterName(n) };
      for (const [k, v] of Object.entries(n.attrs)) if (k !== 'NAME' && v) row[`@${k}`] = v;
      for (const [k, v] of Object.entries(leaves(n))) if (k !== 'NAME.LIST/NAME' && k !== 'LANGUAGENAME.LIST/NAME.LIST/NAME') row[k] = v;
      return row;
    });
    masters.push({ kind, rows });
  }

  const company = val(child(child(child(child(root, 'BODY'), 'IMPORTDATA'), 'REQUESTDESC'), 'STATICVARIABLES'), 'SVCURRENTCOMPANY') || val(child(child(child(root, 'BODY'), 'DESC'), 'STATICVARIABLES'), 'SVCURRENTCOMPANY');

  let report: TallyRead['report'] = null;
  if (!vouchers.length && !masters.length) report = flattenReport(root);

  const kind = vouchers.length
    ? `${vouchers.length} voucher${vouchers.length === 1 ? '' : 's'}${masters.length ? ` and ${masters.map((m) => `${m.rows.length} ${m.kind.toLowerCase()}`).join(', ')}` : ''}`
    : masters.length
      ? masters.map((m) => `${m.rows.length} ${m.kind.toLowerCase()} master${m.rows.length === 1 ? '' : 's'}`).join(', ')
      : report && report.rows.length
        ? `a report with ${report.rows.length} rows`
        : 'no vouchers, masters or report rows';
  return { vouchers, voucherNodes, masters, report, unsupported: [...unsupported.values()], company, kind };
}

/**
 * Tally's report exports (Trial Balance, Balance Sheet, Profit & Loss, Bills Outstanding…) are a
 * flat run of repeating element groups under ENVELOPE. A new row starts each time the first
 * element name of the run comes round again.
 */
export function flattenReport(root: XNode): { columns: string[]; rows: Record<string, string>[] } {
  const kids = root.children.filter((c) => c.name.toUpperCase() !== 'HEADER');
  const body = kids.length === 1 && kids[0].children.length > 1 ? kids[0].children : kids;
  if (!body.length) return { columns: [], rows: [] };
  const first = body[0].name;
  const rows: Record<string, string>[] = [];
  let row: Record<string, string> | null = null;
  const columns: string[] = [];
  const put = (k: string, v: string) => {
    if (!row) return;
    if (!columns.includes(k)) columns.push(k);
    row[k] = row[k] ? `${row[k]}; ${v}` : v;
  };
  for (const c of body) {
    if (c.name === first || !row) {
      row = {};
      rows.push(row);
    }
    if (!c.children.length) put(c.name, c.text);
    else for (const [k, v] of Object.entries(leaves(c))) put(k.split('/').pop()!, v);
  }
  return { columns, rows: rows.filter((r) => Object.keys(r).length) };
}

export interface ImportResult {
  created: number;
  altered: number;
  deleted: number;
  ignored: number;
  combined: number;
  cancelled: number;
  errors: number;
  exceptions: number;
  lastVoucherId: string;
  lineErrors: string[];
  /** The reply was understood as an import result at all. */
  understood: boolean;
}

/** Tally's reply to an import: <RESPONSE> (Tally.ERP 9) or <IMPORTRESULT> (TallyPrime). */
export function readImportResult(root: XNode | null, raw = ''): ImportResult {
  const num = (tag: string) => {
    const n = root ? findAll(root, tag)[0] : undefined;
    return n ? Number(n.text) || 0 : 0;
  };
  const has = (tag: string) => !!root && findAll(root, tag).length > 0;
  const lineErrors = root ? findAll(root, 'LINEERROR').map((n) => n.text).filter(Boolean) : [];
  if (!root && raw.trim()) lineErrors.push(raw.trim().slice(0, 500));
  return {
    created: num('CREATED'),
    altered: num('ALTERED'),
    deleted: num('DELETED'),
    ignored: num('IGNORED'),
    combined: num('COMBINED'),
    cancelled: num('CANCELLED'),
    errors: num('ERRORS'),
    exceptions: num('EXCEPTIONS'),
    lastVoucherId: root ? (findAll(root, 'LASTVCHID')[0]?.text ?? '') : '',
    lineErrors,
    understood: has('CREATED') || has('ERRORS') || has('LINEERROR'),
  };
}

/**
 * Any XML that is not Tally's, as a table: the element that repeats most, with leaf children,
 * becomes the rows; its leaf values (and attributes) become the columns.
 */
export function xmlToTable(root: XNode): { record: string; columns: string[]; rows: Record<string, string>[] } {
  const counts = new Map<string, { n: number; nodes: XNode[] }>();
  const walk = (x: XNode) => {
    for (const c of x.children) {
      if (c.children.some((g) => !g.children.length) || Object.keys(c.attrs).length) {
        const e = counts.get(c.name) ?? { n: 0, nodes: [] };
        e.n++;
        e.nodes.push(c);
        counts.set(c.name, e);
      }
      walk(c);
    }
  };
  walk(root);
  let best: { name: string; nodes: XNode[] } | null = null;
  for (const [name, e] of counts) if (!best || e.n > best.nodes.length) best = { name, nodes: e.nodes };
  if (!best) return { record: '', columns: [], rows: [] };
  const columns: string[] = [];
  const rows = best.nodes.map((n) => {
    const r: Record<string, string> = {};
    for (const [k, v] of Object.entries(n.attrs)) r[k] = v;
    for (const [k, v] of Object.entries(leaves(n))) r[k] = v;
    for (const k of Object.keys(r)) if (!columns.includes(k)) columns.push(k);
    return r;
  });
  return { record: best.name, columns, rows };
}

/** Whether a parsed file is Tally XML (an ENVELOPE with Tally content) rather than some other XML. */
export const isTallyXml = (root: XNode | null) =>
  !!root && (root.name.toUpperCase() === 'ENVELOPE' || findAll(root, 'TALLYMESSAGE').length > 0 || findAll(root, 'VOUCHER').length > 0);
