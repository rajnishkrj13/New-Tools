/**
 * Writes vouchers (and ledger masters) as Tally import XML: the envelope Tally reads from
 * Gateway of Tally → Import → Transactions, and from its XML port.
 *
 * Accounting convention in Tally XML: a debit is written ISDEEMEDPOSITIVE=Yes with a negative
 * AMOUNT, a credit ISDEEMEDPOSITIVE=No with a positive AMOUNT. Allocations (cost centres, bills)
 * carry the same sign as their ledger entry.
 */
import { esc } from './xml';
import { baseType, round2, tallyAmount, tallyDate, type BaseType, type Entry, type Voucher } from './model';

export type TallyMode = 'prime' | 'erp9' | 'custom';

export interface XmlProfile {
  mode: TallyMode;
  /** Company to import into; empty imports into the company open in Tally. */
  company: string;
  /** ALLLEDGERENTRIES.LIST (accounting voucher view) or LEDGERENTRIES.LIST. */
  entriesTag: 'ALLLEDGERENTRIES.LIST' | 'LEDGERENTRIES.LIST';
  /** OBJVIEW / PERSISTEDVIEW: tells TallyPrime which voucher screen the entry belongs to. */
  views: boolean;
  /** EFFECTIVEDATE beside DATE. */
  effectiveDate: boolean;
  /** Mark the party ledger (ISPARTYLEDGER, PARTYLEDGERNAME) on sales, purchase and notes. */
  party: boolean;
}

export const PROFILES: Record<Exclude<TallyMode, 'custom'>, Omit<XmlProfile, 'company'>> = {
  prime: { mode: 'prime', entriesTag: 'ALLLEDGERENTRIES.LIST', views: true, effectiveDate: true, party: true },
  erp9: { mode: 'erp9', entriesTag: 'ALLLEDGERENTRIES.LIST', views: false, effectiveDate: true, party: true },
};

export const profileFor = (mode: TallyMode, company = '', custom?: Partial<XmlProfile>): XmlProfile => ({
  ...PROFILES[mode === 'custom' ? 'prime' : mode],
  ...(mode === 'custom' ? custom : {}),
  mode,
  company,
});

/** The ledger Tally treats as the party of the voucher, or '' when the type has none. */
export function partyOf(v: Voucher, base: BaseType | null): string {
  const dr = v.entries.filter((e) => e.dr > 0);
  const cr = v.entries.filter((e) => e.cr > 0);
  const notTax = (e: Entry) => !/\b(c|s|i|ut)gst\b|\bgst\b|\bcess\b|\btds\b|\btcs\b|round/i.test(e.ledger);
  const biggest = (list: Entry[]) => [...list].sort((a, b) => b.dr + b.cr - (a.dr + a.cr))[0]?.ledger ?? '';
  switch (base) {
    case 'Sales':
    case 'Debit Note':
      return biggest(dr.filter(notTax));
    case 'Purchase':
    case 'Credit Note':
      return biggest(cr.filter(notTax));
    case 'Payment':
      return biggest(dr.filter(notTax));
    case 'Receipt':
      return biggest(cr.filter(notTax));
    default:
      return '';
  }
}

function entryXml(e: Entry, p: XmlProfile, isParty: boolean, pad: string): string {
  const debit = e.dr > 0;
  const amount = debit ? -round2(e.dr) : round2(e.cr);
  const amt = tallyAmount(amount);
  const sign = (n: number) => tallyAmount(debit ? -Math.abs(n) : Math.abs(n));
  const lines = [
    `${pad}<${p.entriesTag}>`,
    `${pad} <LEDGERNAME>${esc(e.ledger)}</LEDGERNAME>`,
    `${pad} <ISDEEMEDPOSITIVE>${debit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>`,
    ...(p.party && isParty ? [`${pad} <ISPARTYLEDGER>Yes</ISPARTYLEDGER>`] : []),
    `${pad} <AMOUNT>${amt}</AMOUNT>`,
  ];
  if (e.costCentres.length) {
    lines.push(`${pad} <CATEGORYALLOCATIONS.LIST>`, `${pad}  <CATEGORY>${esc(e.costCategory || 'Primary Cost Category')}</CATEGORY>`, `${pad}  <ISDEEMEDPOSITIVE>${debit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>`);
    for (const c of e.costCentres) lines.push(`${pad}  <COSTCENTREALLOCATIONS.LIST>`, `${pad}   <NAME>${esc(c.centre)}</NAME>`, `${pad}   <AMOUNT>${sign(c.amount)}</AMOUNT>`, `${pad}  </COSTCENTREALLOCATIONS.LIST>`);
    lines.push(`${pad} </CATEGORYALLOCATIONS.LIST>`);
  }
  for (const b of e.bills) {
    lines.push(`${pad} <BILLALLOCATIONS.LIST>`);
    if (b.name) lines.push(`${pad}  <NAME>${esc(b.name)}</NAME>`);
    lines.push(`${pad}  <BILLTYPE>${esc(b.type)}</BILLTYPE>`, `${pad}  <AMOUNT>${sign(b.amount)}</AMOUNT>`, `${pad} </BILLALLOCATIONS.LIST>`);
  }
  if (e.bank && Object.keys(e.bank).length) {
    lines.push(`${pad} <BANKALLOCATIONS.LIST>`);
    for (const [k, v] of Object.entries(e.bank)) if (v && /^[A-Z][A-Z0-9.]*$/.test(k)) lines.push(`${pad}  <${k}>${esc(v)}</${k}>`);
    lines.push(`${pad}  <AMOUNT>${amt}</AMOUNT>`, `${pad} </BANKALLOCATIONS.LIST>`);
  }
  lines.push(`${pad}</${p.entriesTag}>`);
  return lines.join('\n');
}

/** One VOUCHER element. */
export function voucherXml(v: Voucher, p: XmlProfile, typeParents?: Map<string, string>, pad = '     '): string {
  const base = baseType(v.type, typeParents);
  const party = p.party ? partyOf(v, base) : '';
  const view = 'Accounting Voucher View';
  const attrs = `VCHTYPE="${esc(v.type)}" ACTION="Create"${p.views ? ` OBJVIEW="${view}"` : ''}`;
  const d = tallyDate(v.date);
  const lines = [
    `${pad}<VOUCHER ${attrs}>`,
    `${pad} <DATE>${d}</DATE>`,
    ...(p.effectiveDate ? [`${pad} <EFFECTIVEDATE>${d}</EFFECTIVEDATE>`] : []),
    `${pad} <VOUCHERTYPENAME>${esc(v.type)}</VOUCHERTYPENAME>`,
    ...(v.number ? [`${pad} <VOUCHERNUMBER>${esc(v.number)}</VOUCHERNUMBER>`] : []),
    ...(v.reference ? [`${pad} <REFERENCE>${esc(v.reference)}</REFERENCE>`] : []),
    ...(v.referenceDate ? [`${pad} <REFERENCEDATE>${tallyDate(v.referenceDate)}</REFERENCEDATE>`] : []),
    ...(party ? [`${pad} <PARTYLEDGERNAME>${esc(party)}</PARTYLEDGERNAME>`] : []),
    ...(v.narration ? [`${pad} <NARRATION>${esc(v.narration)}</NARRATION>`] : []),
    `${pad} <ISINVOICE>No</ISINVOICE>`,
    ...(p.views ? [`${pad} <PERSISTEDVIEW>${view}</PERSISTEDVIEW>`] : []),
  ];
  let partyMarked = false;
  for (const e of v.entries) {
    const isParty = !!party && !partyMarked && e.ledger === party;
    if (isParty) partyMarked = true;
    lines.push(entryXml(e, p, isParty, `${pad} `));
  }
  lines.push(`${pad}</VOUCHER>`);
  return lines.join('\n');
}

/** The import envelope around TALLYMESSAGE bodies. */
export function importEnvelope(report: 'Vouchers' | 'All Masters', messages: string[], company: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ENVELOPE>',
    ' <HEADER>',
    '  <TALLYREQUEST>Import Data</TALLYREQUEST>',
    ' </HEADER>',
    ' <BODY>',
    '  <IMPORTDATA>',
    '   <REQUESTDESC>',
    `    <REPORTNAME>${report}</REPORTNAME>`,
    ...(company ? ['    <STATICVARIABLES>', `     <SVCURRENTCOMPANY>${esc(company)}</SVCURRENTCOMPANY>`, '    </STATICVARIABLES>'] : []),
    '   </REQUESTDESC>',
    '   <REQUESTDATA>',
    ...messages.map((m) => `    <TALLYMESSAGE xmlns:UDF="TallyUDF">\n${m}\n    </TALLYMESSAGE>`),
    '   </REQUESTDATA>',
    '  </IMPORTDATA>',
    ' </BODY>',
    '</ENVELOPE>',
    '',
  ].join('\n');
}

/** Vouchers as one import file. */
export function vouchersXml(vouchers: Voucher[], p: XmlProfile, typeParents?: Map<string, string>): string {
  return importEnvelope(
    'Vouchers',
    vouchers.map((v) => voucherXml(v, p, typeParents)),
    p.company,
  );
}

/** One file per voucher type, for "separate files" downloads. */
export function vouchersXmlByType(vouchers: Voucher[], p: XmlProfile, typeParents?: Map<string, string>): { type: string; xml: string; count: number }[] {
  const groups = new Map<string, Voucher[]>();
  for (const v of vouchers) groups.set(v.type, [...(groups.get(v.type) ?? []), v]);
  return [...groups].map(([type, list]) => ({ type, xml: vouchersXml(list, p, typeParents), count: list.length }));
}

export interface NewLedger {
  name: string;
  group: string;
  billWise?: boolean;
  costCentres?: boolean;
  /** Opening balance: positive debit, negative credit. */
  opening?: number;
}

/** Ledger masters to create before importing vouchers that use them. */
export function ledgersXml(ledgers: NewLedger[], company: string): string {
  return importEnvelope(
    'All Masters',
    ledgers.map((l) =>
      [
        `     <LEDGER NAME="${esc(l.name)}" ACTION="Create">`,
        '      <NAME.LIST>',
        `       <NAME>${esc(l.name)}</NAME>`,
        '      </NAME.LIST>',
        `      <PARENT>${esc(l.group)}</PARENT>`,
        `      <ISBILLWISEON>${l.billWise ? 'Yes' : 'No'}</ISBILLWISEON>`,
        `      <ISCOSTCENTRESON>${l.costCentres ? 'Yes' : 'No'}</ISCOSTCENTRESON>`,
        ...(l.opening ? [`      <OPENINGBALANCE>${tallyAmount(-l.opening)}</OPENINGBALANCE>`] : []),
        '     </LEDGER>',
      ].join('\n'),
    ),
    company,
  );
}

/** Tally's predefined groups, for choosing where a new ledger goes. */
export const TALLY_GROUPS = [
  'Bank Accounts',
  'Bank OD A/c',
  'Branch / Divisions',
  'Capital Account',
  'Cash-in-Hand',
  'Current Assets',
  'Current Liabilities',
  'Deposits (Asset)',
  'Direct Expenses',
  'Direct Incomes',
  'Duties & Taxes',
  'Fixed Assets',
  'Indirect Expenses',
  'Indirect Incomes',
  'Investments',
  'Loans & Advances (Asset)',
  'Loans (Liability)',
  'Misc. Expenses (ASSET)',
  'Provisions',
  'Purchase Accounts',
  'Reserves & Surplus',
  'Sales Accounts',
  'Secured Loans',
  'Stock-in-Hand',
  'Sundry Creditors',
  'Sundry Debtors',
  'Suspense A/c',
  'Unsecured Loans',
];

/** A sensible group for a ledger name, as a starting point the user can change. */
export function guessGroup(name: string): string {
  const s = name.toLowerCase();
  if (/\b(c|s|i|ut)gst\b|\bgst\b|\btds\b|\btcs\b|\bcess\b|professional tax|\bpt payable/.test(s)) return 'Duties & Taxes';
  if (/\bbank\b|hdfc|icici|\bsbi\b|axis|kotak|\bpnb\b|yes bank/.test(s)) return 'Bank Accounts';
  if (/\bcash\b|petty/.test(s)) return 'Cash-in-Hand';
  if (/\bsales?\b|revenue|turnover/.test(s)) return 'Sales Accounts';
  if (/purchase/.test(s)) return 'Purchase Accounts';
  if (/provision|payable|outstanding/.test(s)) return 'Provisions';
  if (/\bloan\b|borrowing/.test(s)) return 'Loans (Liability)';
  if (/advance|prepaid|deposit|receivable/.test(s)) return 'Loans & Advances (Asset)';
  if (/depreciation|rent|salary|wages|electricity|telephone|internet|insurance|advertis|marketing|charges|expense|fees|repair|welfare|bonus|gratuity|royalty|subscription|bad debt|loss|interest paid|commission paid/.test(s)) return 'Indirect Expenses';
  if (/interest received|income|discount received|gain|commission received/.test(s)) return 'Indirect Incomes';
  if (/machinery|furniture|computer|vehicle|building|plant|equipment|asset|cwip|work-in-progress/.test(s)) return 'Fixed Assets';
  if (/capital|drawings/.test(s)) return 'Capital Account';
  return 'Suspense A/c';
}
