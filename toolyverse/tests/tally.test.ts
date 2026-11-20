import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseXml, decodeXml, esc } from '../src/lib/tally/xml';
import { parseAmount, parseDate, parseBills, parseCostCentres, baseType, financialYear, type Voucher } from '../src/lib/tally/model';
import { vouchersXml, voucherXml, profileFor, ledgersXml, partyOf, vouchersXmlByType } from '../src/lib/tally/build';
import { readTally, readImportResult, flattenReport, xmlToTable, isTallyXml } from '../src/lib/tally/read';
import { validate } from '../src/lib/tally/validate';
import { detectColumns, rowsToVouchers, vouchersToRows, templateWorkbook, tallyReadWorkbook, TEMPLATE_HEADERS } from '../src/lib/tally/sheet';
import { TEMPLATES, fromTemplate, toTemplate } from '../src/lib/tally/templates';
import { convertTallyXml, cleanVoucherXml } from '../src/lib/tally/convert';
import { checkStructure } from '../src/lib/tally/validate';

const v = (over: Partial<Voucher> = {}): Voucher => ({
  date: '2026-04-30',
  type: 'Journal',
  number: 'JV-1',
  reference: '',
  referenceDate: '',
  narration: 'Rent & charges <April>',
  entries: [
    { ledger: 'Rent', dr: 50000, cr: 0, costCategory: 'Primary Cost Category', costCentres: [{ centre: 'HO', amount: 30000 }, { centre: 'Branch', amount: 20000 }], bills: [] },
    { ledger: 'TDS Payable', dr: 0, cr: 5000, costCategory: '', costCentres: [], bills: [] },
    { ledger: 'Landlord & Sons', dr: 0, cr: 45000, costCategory: '', costCentres: [], bills: [{ name: 'RENT-APR', type: 'New Ref', amount: 45000 }] },
  ],
  ...over,
});

describe('xml', () => {
  it('parses, reports line numbers and never expands entities', () => {
    const ok = parseXml('<A x="1 &amp; 2"><B>t&lt;1&#4;</B><C/></A>');
    expect(ok.problems).toEqual([]);
    expect(ok.root!.attrs.x).toBe('1 & 2');
    expect(ok.root!.children[0].text).toBe('t<1');
    const bad = parseXml('<A>\n<B>\n</A>');
    expect(bad.problems[0]).toMatchObject({ line: 3 });
    const xxe = parseXml('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///c:/windows/win.ini">]><A>&e;</A>');
    expect(xxe.problems[0].message).toMatch(/DOCTYPE/);
    expect(xxe.root!.text).toBe('&e;');
  });
  it('reads UTF-16 files Tally writes', () => {
    const s = '<ENVELOPE>₹</ENVELOPE>';
    const bytes = new Uint8Array(2 + s.length * 2);
    bytes.set([0xff, 0xfe]);
    for (let i = 0; i < s.length; i++) new DataView(bytes.buffer).setUint16(2 + i * 2, s.charCodeAt(i), true);
    expect(decodeXml(bytes)).toBe(s);
  });
  it('escapes everything XML needs', () => expect(esc(`a&b<c>"d'\u0001`)).toBe('a&amp;b&lt;c&gt;&quot;d&apos;'));
});

describe('model', () => {
  it('reads dates written in Indian and other styles', () => {
    for (const s of ['01-04-2026', '1/4/2026', '01.04.26', '2026-04-01', '20260401', '1-Apr-2026', '01 April 2026', 'April 1, 2026', 46113]) expect(parseDate(s), String(s)).toBe('2026-04-01');
    expect(parseDate('31-02-2026')).toBeNull();
    expect(parseDate('hello')).toBeNull();
    expect(financialYear('2026-03-31')).toBe('2025-26');
  });
  it('reads amounts with commas, symbols, brackets and Dr/Cr', () => {
    expect(parseAmount('1,25,000.50')).toBe(125000.5);
    expect(parseAmount('₹ 500')).toBe(500);
    expect(parseAmount('(250.00)')).toBe(-250);
    expect(parseAmount('500 Cr')).toBe(500);
    expect(parseAmount('abc')).toBeNaN();
    expect(parseAmount('')).toBe(0);
  });
  it('reads cost centre and bill-wise cells', () => {
    expect(parseCostCentres('HO: 3000; Branch: 2000', 5000).allocs).toEqual([{ centre: 'HO', amount: 3000 }, { centre: 'Branch', amount: 2000 }]);
    expect(parseCostCentres('HO', 5000).allocs).toEqual([{ centre: 'HO', amount: 5000 }]);
    expect(parseBills('INV-1', 100, 'Sales').bills).toEqual([{ name: 'INV-1', type: 'New Ref', amount: 100 }]);
    expect(parseBills('INV-1', 100, 'Receipt').bills[0].type).toBe('Agst Ref');
    expect(parseBills('Agst Ref INV-1: 60; New Ref INV-2: 40', 100, 'Journal').bills).toEqual([
      { name: 'INV-1', type: 'Agst Ref', amount: 60 },
      { name: 'INV-2', type: 'New Ref', amount: 40 },
    ]);
    expect(parseBills('INV-1; INV-2', 100, 'Journal').error).toBeTruthy();
  });
  it('finds the built-in type of custom voucher types', () => {
    expect(baseType('Sales GST')).toBe('Sales');
    expect(baseType('Bank Payment')).toBe('Payment');
    expect(baseType('My Type', new Map([['my type', 'Credit Note']]))).toBe('Credit Note');
  });
});

describe('build and read Tally XML', () => {
  it('writes the Tally sign convention and reads it back unchanged', () => {
    const xml = vouchersXml([v()], profileFor('prime', 'Demo & Co'));
    expect(xml).toContain('<SVCURRENTCOMPANY>Demo &amp; Co</SVCURRENTCOMPANY>');
    expect(xml).toContain('<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n       <AMOUNT>-50000.00</AMOUNT>');
    expect(xml).toContain('<NAME>HO</NAME>\n         <AMOUNT>-30000.00</AMOUNT>');
    expect(xml).toContain('<BILLTYPE>New Ref</BILLTYPE>\n        <AMOUNT>45000.00</AMOUNT>');
    expect(xml).toContain('OBJVIEW="Accounting Voucher View"');
    const { root, problems } = parseXml(xml);
    expect(problems).toEqual([]);
    const read = readTally(root!);
    expect(read.vouchers).toHaveLength(1);
    const back = read.vouchers[0];
    expect(back).toMatchObject({ date: '2026-04-30', type: 'Journal', number: 'JV-1', narration: 'Rent & charges <April>' });
    expect(back.entries.map((e) => [e.ledger, e.dr, e.cr])).toEqual(v().entries.map((e) => [e.ledger, e.dr, e.cr]));
    expect(back.entries[0].costCentres).toEqual(v().entries[0].costCentres);
    expect(back.entries[2].bills).toEqual(v().entries[2].bills);
    expect(read.company).toBe('Demo & Co');
    expect(read.unsupported).toEqual([]);
  });
  it('leaves Prime-only views out in Tally.ERP 9 mode and marks the party on sales', () => {
    const sale = v({ type: 'Sales', entries: [
      { ledger: 'ABC Traders', dr: 118, cr: 0, costCategory: '', costCentres: [], bills: [] },
      { ledger: 'Sales', dr: 0, cr: 100, costCategory: '', costCentres: [], bills: [] },
      { ledger: 'Output CGST', dr: 0, cr: 9, costCategory: '', costCentres: [], bills: [] },
      { ledger: 'Output SGST', dr: 0, cr: 9, costCategory: '', costCentres: [], bills: [] },
    ] });
    const x = voucherXml(sale, profileFor('erp9'));
    expect(x).not.toContain('OBJVIEW');
    expect(x).toContain('<PARTYLEDGERNAME>ABC Traders</PARTYLEDGERNAME>');
    expect(x.match(/<ISPARTYLEDGER>/g)).toHaveLength(1);
    expect(partyOf(sale, 'Sales')).toBe('ABC Traders');
    expect(vouchersXmlByType([sale, v()], profileFor('prime')).map((f) => f.type)).toEqual(['Sales', 'Journal']);
  });
  it('writes ledger masters', () => {
    const x = ledgersXml([{ name: 'Rent & Co', group: 'Indirect Expenses', costCentres: true }], '');
    expect(x).toContain('<LEDGER NAME="Rent &amp; Co" ACTION="Create">');
    expect(x).toContain('<REPORTNAME>All Masters</REPORTNAME>');
    expect(parseXml(x).problems).toEqual([]);
  });
  it('reads an invoice exported from Tally, keeping stock lines and fields it does not map', () => {
    const xml = `<ENVELOPE><BODY><DATA><TALLYMESSAGE><VOUCHER VCHTYPE="Sales" REMOTEID="abc"><DATE>20260405</DATE><GUID>g-1</GUID><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>7</VOUCHERNUMBER><PARTYLEDGERNAME>ABC</PARTYLEDGERNAME><GSTDETAILS.LIST><X>1</X></GSTDETAILS.LIST><EMPTY.LIST></EMPTY.LIST>
      <LEDGERENTRIES.LIST><LEDGERNAME>ABC</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-1180.00</AMOUNT><BANKALLOCATIONS.LIST></BANKALLOCATIONS.LIST></LEDGERENTRIES.LIST>
      <LEDGERENTRIES.LIST><LEDGERNAME>Output IGST</LEDGERNAME><AMOUNT>180.00</AMOUNT></LEDGERENTRIES.LIST>
      <ALLINVENTORYENTRIES.LIST><STOCKITEMNAME>Widget</STOCKITEMNAME><ACTUALQTY> 10 Nos</ACTUALQTY><AMOUNT>1000.00</AMOUNT><ACCOUNTINGALLOCATIONS.LIST><LEDGERNAME>Sales</LEDGERNAME><AMOUNT>1000.00</AMOUNT></ACCOUNTINGALLOCATIONS.LIST></ALLINVENTORYENTRIES.LIST>
      </VOUCHER></TALLYMESSAGE></DATA></BODY></ENVELOPE>`;
    const read = readTally(parseXml(xml).root!);
    const x = read.vouchers[0];
    expect(x.entries.map((e) => [e.ledger, e.dr, e.cr])).toEqual([['ABC', 1180, 0], ['Output IGST', 0, 180], ['Sales', 0, 1000]]);
    expect(x.inventory![0]).toMatchObject({ STOCKITEMNAME: 'Widget', ACTUALQTY: '10 Nos' });
    expect(x.extra).toMatchObject({ GUID: 'g-1', '@REMOTEID': 'abc' });
    expect(read.unsupported.map((u) => u.path)).toEqual(['VOUCHER/GSTDETAILS.LIST']);
    expect(validate(read.vouchers).bad.size).toBe(0);
  });
  it('reads masters and report exports', () => {
    const m = readTally(parseXml('<ENVELOPE><BODY><DATA><COLLECTION><LEDGER NAME="Cash"><PARENT>Cash-in-Hand</PARENT></LEDGER><LEDGER NAME="HDFC"><PARENT>Bank Accounts</PARENT><CLOSINGBALANCE>-500</CLOSINGBALANCE></LEDGER></COLLECTION></DATA></BODY></ENVELOPE>').root!);
    expect(m.masters[0].rows).toEqual([{ NAME: 'Cash', PARENT: 'Cash-in-Hand' }, { NAME: 'HDFC', PARENT: 'Bank Accounts', CLOSINGBALANCE: '-500' }]);
    const tb = flattenReport(parseXml('<ENVELOPE><DSPACCNAME><DSPDISPNAME>Capital</DSPDISPNAME></DSPACCNAME><DSPACCINFO><DSPCLDRAMT><DSPCLDRAMTA></DSPCLDRAMTA></DSPCLDRAMT><DSPCLCRAMT><DSPCLCRAMTA>5000</DSPCLCRAMTA></DSPCLCRAMT></DSPACCINFO><DSPACCNAME><DSPDISPNAME>Cash</DSPDISPNAME></DSPACCNAME><DSPACCINFO><DSPCLDRAMT><DSPCLDRAMTA>-5000</DSPCLDRAMTA></DSPCLDRAMT></DSPACCINFO></ENVELOPE>').root!);
    expect(tb.rows).toEqual([{ DSPDISPNAME: 'Capital', DSPCLCRAMTA: '5000' }, { DSPDISPNAME: 'Cash', DSPCLDRAMTA: '-5000' }]);
  });
  it("reads Tally's import replies from TallyPrime and Tally.ERP 9", () => {
    const prime = readImportResult(parseXml('<ENVELOPE><HEADER><STATUS>1</STATUS></HEADER><BODY><DATA><IMPORTRESULT><CREATED>2</CREATED><ALTERED>0</ALTERED><ERRORS>1</ERRORS><EXCEPTIONS>0</EXCEPTIONS><LINEERROR>Ledger \'Rentt\' does not exist!</LINEERROR></IMPORTRESULT></DATA></BODY></ENVELOPE>').root);
    expect(prime).toMatchObject({ created: 2, errors: 1, understood: true, lineErrors: ["Ledger 'Rentt' does not exist!"] });
    const erp = readImportResult(parseXml('<RESPONSE><CREATED>1</CREATED><ALTERED>0</ALTERED><LASTVCHID>55</LASTVCHID><ERRORS>0</ERRORS></RESPONSE>').root);
    expect(erp).toMatchObject({ created: 1, errors: 0, lastVoucherId: '55', understood: true });
    expect(readImportResult(null, 'Unknown request').understood).toBe(false);
  });
  it('turns other XML into a table and tells Tally XML apart', () => {
    const root = parseXml('<Export><Txn id="1"><Date>2026-04-01</Date><Account>Rent</Account><Debit>100</Debit></Txn><Txn id="2"><Date>2026-04-01</Date><Account>Bank</Account><Credit>100</Credit></Txn></Export>').root!;
    expect(isTallyXml(root)).toBe(false);
    const t = xmlToTable(root);
    expect(t.record).toBe('Txn');
    expect(t.rows[1]).toEqual({ id: '2', Date: '2026-04-01', Account: 'Bank', Credit: '100' });
  });
});

describe('validation', () => {
  it('passes a correct voucher and catches the usual mistakes', () => {
    expect(validate([v()]).summary).toMatchObject({ vouchers: 1, valid: 1, errors: 0, debit: 50000, credit: 50000 });
    const broken = v({ date: '?', type: '', entries: [
      { ledger: '', dr: 100, cr: 0, costCategory: '', costCentres: [{ centre: 'HO', amount: 60 }], bills: [] },
      { ledger: 'Bank', dr: -5, cr: 0, costCategory: '', costCentres: [], bills: [] },
      { ledger: 'X', dr: 10, cr: 10, costCategory: '', costCentres: [], bills: [] },
    ] });
    const msgs = validate([broken]).issues.map((i) => i.message).join('\n');
    for (const m of ['not a valid date', 'type is missing', 'ledger name is missing', 'negative amount', 'both a debit and a credit', 'cost centres add up', 'differ by']) expect(msgs).toContain(m);
  });
  it('checks against Tally: missing ledgers, unknown types and vouchers already there', () => {
    const r = validate([v()], { ledgers: new Set(['rent', 'tds payable']), types: new Map([['journal', 'Journal']]), existing: new Set(['journal|jv-1|2026-04-30']) });
    const all = r.issues.map((i) => i.message).join('\n');
    expect(all).toContain('ledger "Landlord & Sons" does not exist in Tally');
    expect(all).toContain('already in Tally');
  });
  it('warns about GST lines that do not pair up', () => {
    const sale = v({ type: 'Sales', entries: [
      { ledger: 'ABC', dr: 118, cr: 0, costCategory: '', costCentres: [], bills: [] },
      { ledger: 'Sales', dr: 0, cr: 100, costCategory: '', costCentres: [], bills: [] },
      { ledger: 'Output CGST', dr: 0, cr: 10, costCategory: '', costCentres: [], bills: [] },
      { ledger: 'Output SGST', dr: 0, cr: 8, costCategory: '', costCentres: [], bills: [] },
    ] });
    const r = validate([sale]);
    expect(r.summary.errors).toBe(0);
    expect(r.issues.some((i) => i.level === 'warning' && /CGST .* SGST/.test(i.message))).toBe(true);
  });
});

describe('spreadsheets', () => {
  it('finds headers by many names and groups rows into vouchers', () => {
    const rows = [
      ['My company ledger export'],
      ['Date', 'Vch Type', 'Vch No', 'Particulars', 'Dr', 'Cr', 'Narration', 'Cost Center', 'Bill Ref'],
      ['01-04-2026', 'Journal', 'J1', 'Rent', '5,000', '', 'April rent', 'HO: 3000; Branch: 2000', ''],
      ['', '', '', 'Landlord', '', '5,000', '', '', 'RENT-APR'],
      ['02-04-2026', 'Payment', 'P1', 'Landlord', 5000, '', '', '', 'Agst Ref RENT-APR'],
      ['', '', '', 'HDFC Bank', '', 5000, '', '', ''],
    ];
    const det = detectColumns(rows);
    expect(det.headerRow).toBe(1);
    const { vouchers, problems } = rowsToVouchers(rows, det.mapping, { headerRow: det.headerRow, defaultType: 'Journal' });
    expect(problems).toEqual([]);
    expect(vouchers.map((x) => [x.date, x.type, x.number, x.entries.length])).toEqual([['2026-04-01', 'Journal', 'J1', 2], ['2026-04-02', 'Payment', 'P1', 2]]);
    expect(vouchers[0].entries[0].costCentres).toHaveLength(2);
    expect(vouchers[0].entries[1].bills).toEqual([{ name: 'RENT-APR', type: 'New Ref', amount: 5000 }]);
    expect(vouchers[1].entries[0].bills[0].type).toBe('Agst Ref');
    expect(validate(vouchers).summary.errors).toBe(0);
  });
  it('splits unnumbered rows into vouchers where they balance, with one amount column and Dr/Cr', () => {
    const rows = [
      ['Date', 'Ledger', 'Amount', 'Dr/Cr'],
      ['01/04/2026', 'Rent', 100, 'Dr'],
      ['', 'Cash', 100, 'Cr'],
      ['', 'Salary', 200, 'Dr'],
      ['', 'Bank', 200, 'Cr'],
    ];
    const det = detectColumns(rows);
    const { vouchers } = rowsToVouchers(rows, det.mapping, { headerRow: det.headerRow, defaultType: 'Journal' });
    expect(vouchers).toHaveLength(2);
    expect(vouchers[1]).toMatchObject({ date: '2026-04-01', type: 'Journal' });
  });
  it('round-trips the template layout', () => {
    const rows = [TEMPLATE_HEADERS as unknown as string[], ...vouchersToRows([v()])];
    const det = detectColumns(rows);
    expect(det.matched).toBe(12);
    const back = rowsToVouchers(rows, det.mapping, { headerRow: 0, defaultType: 'Journal' }).vouchers;
    expect(back[0].entries).toEqual(v().entries.map((e, i) => ({ ...e, costCategory: e.costCentres.length ? e.costCategory : '', row: i + 2 })));
  });
  it('writes a template workbook Excel opens, with headers A to L', async () => {
    const bytes = await templateWorkbook();
    const wb = XLSX.read(bytes, { type: 'array', cellDates: true });
    expect(wb.SheetNames).toEqual(['Vouchers', 'How to fill']);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Vouchers, { header: 1, raw: true });
    expect(rows[0]).toEqual(TEMPLATE_HEADERS);
    const det = detectColumns(rows);
    const { vouchers } = rowsToVouchers(rows, det.mapping, { headerRow: 0, defaultType: 'Journal' });
    expect(vouchers).toHaveLength(2);
    expect(validate(vouchers).summary.errors).toBe(0);
  }, 60000);
  it('writes every part of a Tally file to its own sheet', async () => {
    const read = readTally(parseXml(vouchersXml([v()], profileFor('prime'))).root!);
    const { sheets } = await tallyReadWorkbook(read);
    expect(sheets).toEqual(['Vouchers', 'Voucher summary', 'Bill-wise', 'Cost centres']);
  }, 60000);
});

describe('templates', () => {
  it('has the categories asked for, each template balancing for any amount', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(100);
    for (const t of TEMPLATES) {
      for (const base of [1, 999.99, 123456]) {
        const x = fromTemplate(t, base, '2026-04-01');
        expect(validate([x]).issues.filter((i) => i.level === 'error' && /differ/.test(i.message)), t.name).toEqual([]);
      }
    }
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
  });
  it('turns a voucher into a reusable template', () => {
    const t = toTemplate(v(), 'Monthly rent');
    const again = fromTemplate(t, 50000, '2026-05-31');
    expect(again.entries.map((e) => [e.ledger, e.dr, e.cr])).toEqual(v().entries.map((e) => [e.ledger, e.dr, e.cr]));
  });
});

describe('Tally XML to Tally XML', () => {
  const exported = `<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC><REQUESTDATA>
    <TALLYMESSAGE><LEDGER NAME="Rent" RESERVEDNAME=""><GUID>l-1</GUID><PARENT>Indirect Expenses</PARENT><NAME.LIST><NAME>Rent</NAME></NAME.LIST></LEDGER></TALLYMESSAGE>
    <TALLYMESSAGE><VOUCHER REMOTEID="r-1" VCHTYPE="Journal" ACTION="Alter"><DATE>20260430</DATE><GUID>g-1</GUID><ALTERID> 55</ALTERID><VOUCHERTYPENAME>Journal</VOUCHERTYPENAME><VOUCHERNUMBER>1</VOUCHERNUMBER><EMPTYTAG></EMPTYTAG><GSTDETAILS.LIST><X>1</X></GSTDETAILS.LIST>
      <LEDGERENTRIES.LIST><LEDGERNAME>Rent</LEDGERNAME><AMOUNT>-100.00</AMOUNT></LEDGERENTRIES.LIST><LEDGERENTRIES.LIST><LEDGERNAME>Cash</LEDGERNAME><AMOUNT>100.00</AMOUNT></LEDGERENTRIES.LIST></VOUCHER></TALLYMESSAGE>
    <TALLYMESSAGE><VOUCHER VCHTYPE="Payment"><DATE>20250101</DATE><VOUCHERTYPENAME>Payment</VOUCHERTYPENAME><ALLLEDGERENTRIES.LIST><LEDGERNAME>Rent</LEDGERNAME><AMOUNT>-5.00</AMOUNT></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><LEDGERNAME>Cash</LEDGERNAME><AMOUNT>5.00</AMOUNT></ALLLEDGERENTRIES.LIST></VOUCHER></TALLYMESSAGE>
    </REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
  const root = parseXml(exported).root!;
  const base = { profile: profileFor('prime', 'New Co'), ledgers: { Rent: 'Office Rent' }, types: { Journal: 'JV' }, stripIds: true, dropEmpty: true, keepTypes: [] as string[], vouchers: true, masters: false };

  it('renames, removes IDs and keeps every other field', () => {
    const r = convertTallyXml(root, { ...base, from: '2026-04-01' });
    expect(r.vouchers).toBe(1);
    expect(r.xml).not.toMatch(/GUID|ALTERID|REMOTEID|EMPTYTAG/);
    expect(r.xml).toContain('<LEDGERNAME>Office Rent</LEDGERNAME>');
    expect(r.xml).toContain('VCHTYPE="JV"');
    expect(r.xml).toContain('<VOUCHERTYPENAME>JV</VOUCHERTYPENAME>');
    expect(r.xml).toContain('<GSTDETAILS.LIST>');
    expect(r.xml).toContain('<ALLLEDGERENTRIES.LIST>');
    expect(r.xml).toContain('OBJVIEW="Accounting Voucher View"');
    expect(r.xml).toContain('ACTION="Create"');
    expect(r.xml).toContain('<SVCURRENTCOMPANY>New Co</SVCURRENTCOMPANY>');
    expect(r.changes['Ledger names changed']).toBe(1);
    const back = readTally(parseXml(r.xml).root!).vouchers[0];
    expect(back.entries.map((e) => [e.ledger, e.dr, e.cr])).toEqual([['Office Rent', 100, 0], ['Cash', 0, 100]]);
  });
  it('filters by type and writes masters on their own', () => {
    expect(convertTallyXml(root, { ...base, keepTypes: ['Payment'] }).vouchers).toBe(1);
    const m = convertTallyXml(root, { ...base, vouchers: false, masters: true });
    expect(m.masters).toBe(1);
    expect(m.xml).toContain('<LEDGER NAME="Office Rent"');
    expect(m.xml).toContain('<REPORTNAME>All Masters</REPORTNAME>');
  });
  it('cleans a single voucher for import', () => {
    const x = cleanVoucherXml(readTally(root).voucherNodes[0]);
    expect(x).not.toMatch(/GUID|REMOTEID|EMPTYTAG/);
    expect(x).toContain('ACTION="Create"');
  });
});

describe('XML structure checks', () => {
  it('passes a file this site writes and catches broken ones', () => {
    const good = parseXml(vouchersXml([v()], profileFor('prime'))).root!;
    expect(checkStructure(good, readTally(good).voucherNodes)).toEqual([]);
    const bad = parseXml(
      '<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC></REQUESTDESC><REQUESTDATA><TALLYMESSAGE><VOUCHER><ALLLEDGERENTRIES.LIST><AMOUNT>1,000</AMOUNT><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE></ALLLEDGERENTRIES.LIST></VOUCHER></TALLYMESSAGE></REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>',
    ).root!;
    const msgs = checkStructure(bad, readTally(bad).voucherNodes)
      .map((i) => i.message)
      .join('\n');
    for (const m of ['no <REPORTNAME>', 'no <DATE>', 'no <VOUCHERTYPENAME>', 'no <LEDGERNAME>', 'not a plain number']) expect(msgs).toContain(m);
  });
});
