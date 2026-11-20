/**
 * Tally XML to Tally XML: takes vouchers and masters out of any Tally file (an export, another
 * company's import file, a Tally.ERP 9 file) and writes a clean import file, changing only what
 * was asked. The XML elements themselves are carried over, so stock lines, GST details and other
 * fields this site does not model are kept as they were.
 */
import { child, findAll, val, writeXml, type XNode } from './xml';
import { importEnvelope, type XmlProfile } from './build';
import { parseDate } from './model';

export interface ConvertOptions {
  profile: XmlProfile;
  /** Old name → new name; only names that change need an entry. */
  ledgers: Record<string, string>;
  types: Record<string, string>;
  /** Remove GUID, REMOTEID, ALTERID… so Tally creates new entries instead of matching old ones. */
  stripIds: boolean;
  /** Remove empty elements (Tally exports are full of them). */
  dropEmpty: boolean;
  vouchers: boolean;
  masters: boolean;
  /** Voucher type names to keep; empty keeps all. */
  keepTypes: string[];
  from?: string;
  to?: string;
}

export interface ConvertResult {
  xml: string;
  vouchers: number;
  masters: number;
  /** What was changed or removed, for the report. */
  changes: Record<string, number>;
}

const ID_TAGS = new Set(['GUID', 'ALTERID', 'MASTERID', 'VOUCHERKEY', 'VOUCHERRETAINKEY', 'REMOTEID']);
const ID_ATTRS = ['REMOTEID', 'VCHKEY'];
const NAME_TAGS = new Set(['LEDGERNAME', 'PARTYLEDGERNAME', 'PARTYNAME']);
const MASTER_TAGS = ['LEDGER', 'GROUP', 'COSTCENTRE', 'COSTCATEGORY', 'STOCKITEM', 'STOCKGROUP', 'UNIT', 'GODOWN', 'VOUCHERTYPE', 'CURRENCY'];

const clone = (n: XNode): XNode => ({ name: n.name, attrs: { ...n.attrs }, text: n.text, line: n.line, children: n.children.map(clone) });

export function convertTallyXml(root: XNode, o: ConvertOptions): ConvertResult {
  const changes: Record<string, number> = {};
  const bump = (k: string, by = 1) => (changes[k] = (changes[k] ?? 0) + by);
  const ledgerMap = new Map(Object.entries(o.ledgers).filter(([a, b]) => b.trim() && a !== b.trim()).map(([a, b]) => [a, b.trim()]));
  const typeMap = new Map(Object.entries(o.types).filter(([a, b]) => b.trim() && a !== b.trim()).map(([a, b]) => [a, b.trim()]));

  const fix = (n: XNode, inVoucher: boolean): XNode | null => {
    const up = n.name.toUpperCase();
    if (o.stripIds && ID_TAGS.has(up)) {
      bump(`Removed <${up}>`);
      return null;
    }
    if (o.stripIds) for (const a of ID_ATTRS) if (n.attrs[a] !== undefined) {
      delete n.attrs[a];
      bump(`Removed ${a}="…"`);
    }
    if (NAME_TAGS.has(up) && ledgerMap.has(n.text)) {
      n.text = ledgerMap.get(n.text)!;
      bump('Ledger names changed');
    }
    if (up === 'VOUCHERTYPENAME' && inVoucher && typeMap.has(n.text)) {
      n.text = typeMap.get(n.text)!;
      bump('Voucher types changed');
    }
    n.children = n.children.map((c) => fix(c, inVoucher)).filter((c): c is XNode => !!c);
    if (o.dropEmpty && !n.text && !n.children.length && !Object.keys(n.attrs).length) {
      bump('Empty elements removed');
      return null;
    }
    return n;
  };

  const messages: string[] = [];
  let vouchers = 0;
  let masters = 0;

  if (o.masters) {
    for (const kind of MASTER_TAGS) {
      for (const m of findAll(root, kind).filter((x) => x.children.length || x.attrs.NAME)) {
        const c = fix(clone(m), false);
        if (!c) continue;
        if (kind === 'LEDGER') {
          const old = c.attrs.NAME;
          if (old && ledgerMap.has(old)) {
            c.attrs.NAME = ledgerMap.get(old)!;
            for (const nl of findAll(c, 'NAME.LIST')) for (const nm of nl.children) if (nm.text === old) nm.text = ledgerMap.get(old)!;
            bump('Ledger masters renamed');
          }
        }
        c.attrs.ACTION = 'Create';
        messages.push(writeXml(c, '     '));
        masters++;
      }
    }
  }

  if (o.vouchers) {
    for (const v of findAll(root, 'VOUCHER').filter((x) => x.children.length)) {
      const type = val(v, 'VOUCHERTYPENAME') || v.attrs.VCHTYPE || '';
      if (o.keepTypes.length && !o.keepTypes.includes(type)) continue;
      const date = parseDate(val(v, 'DATE')) ?? '';
      if ((o.from && date && date < o.from) || (o.to && date && date > o.to)) continue;
      const c = fix(clone(v), true)!;
      if (c.attrs.VCHTYPE && typeMap.has(c.attrs.VCHTYPE)) c.attrs.VCHTYPE = typeMap.get(c.attrs.VCHTYPE)!;
      c.attrs.ACTION = 'Create';
      const stock = !!child(c, 'ALLINVENTORYENTRIES.LIST') || !!child(c, 'INVENTORYENTRIES.LIST');
      if (!stock) {
        // Accounting vouchers: use the ledger-line tag and view tags of the chosen Tally version.
        const other = o.profile.entriesTag === 'ALLLEDGERENTRIES.LIST' ? 'LEDGERENTRIES.LIST' : 'ALLLEDGERENTRIES.LIST';
        for (const e of c.children)
          if (e.name.toUpperCase() === other) {
            e.name = o.profile.entriesTag;
            bump(`Ledger lines written as ${o.profile.entriesTag}`);
          }
        if (o.profile.views) {
          if (!c.attrs.OBJVIEW) c.attrs.OBJVIEW = 'Accounting Voucher View';
          if (!child(c, 'PERSISTEDVIEW')) c.children.push({ name: 'PERSISTEDVIEW', attrs: {}, children: [], text: 'Accounting Voucher View', line: 0 });
        } else if (o.profile.mode === 'erp9' && c.attrs.OBJVIEW) {
          delete c.attrs.OBJVIEW;
          bump('OBJVIEW removed for Tally.ERP 9');
        }
      }
      messages.push(writeXml(c, '     '));
      vouchers++;
    }
  }

  const report = vouchers ? 'Vouchers' : 'All Masters';
  return { xml: importEnvelope(report, messages, o.profile.company), vouchers, masters, changes };
}

/** One VOUCHER element as it should be sent for import: same content, without Tally's IDs or empty tags. */
export function cleanVoucherXml(n: XNode, stripIds = true): string {
  const fix = (x: XNode): XNode | null => {
    const up = x.name.toUpperCase();
    if (stripIds && ID_TAGS.has(up)) return null;
    if (stripIds) for (const a of ID_ATTRS) delete x.attrs[a];
    x.children = x.children.map(fix).filter((c): c is XNode => !!c);
    return !x.text && !x.children.length && !Object.keys(x.attrs).length ? null : x;
  };
  const c = fix(clone(n))!;
  c.attrs.ACTION = 'Create';
  return writeXml(c, '     ');
}
