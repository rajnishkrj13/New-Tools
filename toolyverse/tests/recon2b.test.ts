import { describe, expect, it } from 'vitest';
import { coreNo, dayOf, dayText, dues, followUps, itcDeadline, monthly, pairKey, readRegister, reconcile, registerDocs, suppliers, totals, twoBDocs, twoBImports, twoBJson, type Doc } from '../src/lib/gst/recon2b';

const G1 = '27AAACA1234A1Z5';
const G2 = '29AAACB5678B1Z3';
const G1_OTHER_STATE = '24AAACA1234A1Z9'; // same PAN as G1
const APR = dayOf('01-04-2026')!;
const MAY = dayOf('01-05-2026')!;

const doc = (src: Doc['src'], gstin: string, no: string, date: string, taxable: number, igst: number, more: Partial<Doc> = {}): Doc => ({
  src, gstin, name: `Supplier ${gstin.slice(2, 7)}`, no, date: dayOf(date), kind: 'Invoice', taxable, igst, cgst: 0, sgst: 0, cess: 0, value: null, row: 0, month: src === '2b' ? APR : undefined, ...more,
});

describe('invoice numbers', () => {
  it('ignores punctuation, year parts and leading zeros', () => {
    expect(coreNo('INV/2023-24/0045')).toBe(coreNo('inv-45'));
    expect(coreNo('GST/24-25/123')).toBe('GST123');
    expect(coreNo('INV1213')).toBe('INV1213');
    expect(coreNo('A-0012')).toBe(coreNo('A12'));
  });
});

describe('matching', () => {
  const twoB = [
    doc('2b', G1, 'INV/2026-27/0045', '05-04-2026', 10000, 1800),
    doc('2b', G1, 'INV-46', '06-04-2026', 5000, 900),
    doc('2b', G2, 'B-78', '10-04-2026', 2000, 360),
    doc('2b', G1, 'CN-3', '12-04-2026', -1000, -180, { kind: 'Credit note', section: 'CDNR' }),
    doc('2b', G1, 'X9001', '15-04-2026', 3000, 540),
    doc('2b', G1, 'T-500', '18-04-2026', 4000, 720),
    doc('2b', G1, 'K-77', '20-04-2026', 6000, 0, { cgst: 540, sgst: 540, ours: '27AAACZ0000Z1Z1' }),
  ];
  const books = [
    doc('books', G1, 'inv-45', '05-04-2026', 10000, 1800),
    doc('books', G1, 'INV46', '06-04-2026', 5100, 918),
    doc('books', G1, 'CN/3', '12-04-2026', -1000, -180, { kind: 'Credit note' }),
    doc('books', G1, 'BILL-9001', '15-04-2026', 3000, 540),
    doc('books', G1_OTHER_STATE, 'T500', '18-04-2026', 4000, 720),
    doc('books', G1, 'K77', '20-04-2026', 6000, 1080),
    doc('books', G2, 'B-80', '25-04-2026', 1000, 180),
    doc('books', G2, 'B-99', '10-06-2026', 1000, 180),
  ];
  const res = reconcile(twoB, books, { tol: 1, dates: false });
  const of = (no: string) => res.lines.find((l) => l.b2?.no === no || l.bk?.no === no)!;

  it('matches the same invoice written differently', () => {
    expect(of('INV/2026-27/0045').status).toBe('matched');
    expect(of('INV/2026-27/0045').bk?.no).toBe('inv-45');
    expect(of('CN-3').status).toBe('matched');
  });

  it('reports differing amounts and IGST booked as CGST + SGST', () => {
    expect(of('INV-46').status).toBe('differs');
    expect(of('INV-46').diff.tax).toBe(-18);
    expect(of('K-77').status).toBe('differs');
    expect(of('K-77').notes.join(' ')).toContain('CGST + SGST in 2B, IGST in the books');
  });

  it('offers probable matches by number part and by the same PAN', () => {
    expect(of('X9001').status).toBe('probable');
    expect(of('X9001').bk?.no).toBe('BILL-9001');
    expect(of('T-500').status).toBe('probable');
    expect(of('T-500').bk?.gstin).toBe(G1_OTHER_STATE);
  });

  it('lists what is missing on each side, and books outside the 2B months apart', () => {
    expect(of('B-78').status).toBe('only2b');
    expect(of('B-80').status).toBe('onlyBooks');
    expect(of('B-99').status).toBe('outside');
    const t = totals(res.lines);
    expect(t.all.count).toBe(9);
    expect(t.only2b.tax2b).toBe(360);
    expect(suppliers(res.lines).map((s) => s.gstin)).toContain(G2);
  });

  it('does not match a credit note with an invoice', () => {
    const r = reconcile([doc('2b', G1, 'CN-1', '01-04-2026', -500, -90, { kind: 'Credit note' })], [doc('books', G1, 'CN-1', '01-04-2026', 500, 90)], { tol: 1, dates: false });
    expect(r.lines.map((l) => l.status).sort()).toEqual(['only2b', 'onlyBooks']);
  });

  it('can make a different date count as a difference', () => {
    const r = reconcile([doc('2b', G1, '1', '01-04-2026', 100, 18)], [doc('books', G1, '1', '03-04-2026', 100, 18)], { tol: 1, dates: true });
    expect(r.lines[0].status).toBe('differs');
    expect(reconcile([doc('2b', G1, '1', '01-04-2026', 100, 18)], [doc('books', G1, '1', '03-04-2026', 100, 18)], { tol: 1, dates: false }).lines[0].status).toBe('matched');
  });
});

describe('purchase register', () => {
  // As Tally exports it: title rows, then headings, tax split by rate, a total row at the end.
  const aoa: unknown[][] = [
    ['ABC Traders Pvt Ltd'],
    ['Purchase Register'],
    ['1-Apr-2026 to 30-Apr-2026'],
    [],
    ['Date', 'Particulars', 'Voucher Type', 'Voucher No.', 'Supplier Invoice No.', 'Supplier Invoice Date', 'GSTIN/UIN', 'Taxable Value', 'IGST @5%', 'IGST @18%', 'CGST', 'SGST/UTGST', 'Gross Total'],
    ['05-Apr-2026', 'Alpha Steel', 'Purchase', '101', 'INV/2026-27/0045', '05-Apr-2026', G1, '10,000.00', '', '1,800.00', '', '', '11,800.00'],
    ['06-Apr-2026', 'Beta Paints', 'Purchase', '102', 'B-78', '04-Apr-2026', G2, 2000, 100, 0, 0, 0, 2100],
    ['07-Apr-2026', 'Cash purchase', 'Purchase', '103', '55', '07-Apr-2026', '', 500, 0, 0, 45, 45, 590],
    ['12-Apr-2026', 'Alpha Steel', 'Debit Note', '9', 'CN-3', '12-Apr-2026', G1, 1000, 0, 180, 0, 0, 1180],
    ['', 'Grand Total', '', '', '', '', '', 13500, 100, 1980, 45, 45, 15670],
  ];
  it('finds the headings and the columns, adding tax columns split by rate', () => {
    const reg = readRegister(aoa);
    expect(reg.header).toBe(4);
    expect(reg.mapping.gstin).toEqual([6]);
    expect(reg.mapping.no).toEqual([4]);
    expect(reg.mapping.date).toEqual([5]);
    expect(reg.mapping.igst).toEqual([8, 9]);
    expect(reg.mapping.sgst).toEqual([11]);
    expect(reg.mapping.name).toEqual([1]);
    const read = registerDocs(aoa, reg);
    expect(read.docs).toHaveLength(3);
    expect(read.noGstin).toBe(2);
    expect(read.docs[0]).toMatchObject({ no: 'INV/2026-27/0045', taxable: 10000, igst: 1800, date: dayOf('05-04-2026') });
    expect(read.docs[1].igst).toBe(100);
    // A debit note in the books (a purchase return) lowers the credit.
    expect(read.docs[2]).toMatchObject({ kind: 'Credit note', taxable: -1000, igst: -180 });
    // The voucher date tells when it was booked.
    expect(reg.mapping.booked).toEqual([0]);
    expect(read.docs[1]).toMatchObject({ date: dayOf('04-04-2026'), booked: dayOf('06-04-2026') });
  });

  it('reads imports by their bill of entry, without a supplier GSTIN', () => {
    const rows: unknown[][] = [
      ['Date', 'Party Name', 'Supplier Invoice No.', 'GSTIN/UIN', 'Bill of Entry No.', 'Bill of Entry Date', 'Taxable Value', 'IGST'],
      ['18-Apr-2026', 'Acme GmbH', 'EXP-77', '', '1234567', '18-Apr-2026', 50000, 9000],
      ['19-Apr-2026', 'Cash', '12', '', '', '', 100, 18],
    ];
    const reg = readRegister(rows);
    expect(reg.mapping.boe).toEqual([4]);
    expect(reg.mapping.no).toEqual([2]);
    const read = registerDocs(rows, reg);
    expect(read.noGstin).toBe(1);
    expect(read.docs).toEqual([expect.objectContaining({ gstin: '', boe: '1234567', no: 'EXP-77', kind: 'Bill of entry', igst: 9000 })]);
  });
});

describe('imports', () => {
  // The IMPG sheet of a GSTR-2B Excel download: a merged heading over two rows.
  const impg: unknown[][] = [
    ['Goods and Services Tax - GSTR-2B'],
    ['Import of goods from overseas on bill of entry'],
    ['Icegate Reference Date', 'Bill of Entry Details', null, null, 'Taxable Value (₹)', 'Amount of tax (₹)', null, 'Amended (Yes)'],
    [null, 'Port Code', 'Number', 'Date', null, 'Integrated Tax(₹)', 'Cess(₹)', null],
    ['20-04-2026', 'INNSA1', '1234567', '18-04-2026', 50000, 9000, 0, 'No'],
    ['22-04-2026', 'INMAA1', '7654321', '21-04-2026', 10000, 1800, 0, 'No'],
  ];
  it('reads the IMPG sheet and matches by the bill of entry', () => {
    const docs = twoBImports(impg, 'IMPG', { month: APR });
    expect(docs).toHaveLength(2);
    expect(docs[0]).toMatchObject({ section: 'IMPG', gstin: '', no: '1234567', boe: '1234567', date: dayOf('18-04-2026'), taxable: 50000, igst: 9000, name: 'Import, port INNSA1', month: APR });
    const books = [doc('books', '', 'EXP-77', '18-04-2026', 50000, 9000, { boe: '1234567', kind: 'Bill of entry' }), doc('books', G1, '1234567', '21-04-2026', 10000, 1800)];
    const r = reconcile(docs, books, { tol: 1, dates: false });
    expect(r.lines.find((l) => l.b2?.boe === '1234567')).toMatchObject({ status: 'matched', notes: ['Same bill of entry number'] });
    // A supplier invoice with the same number is not a bill of entry.
    expect(r.lines.find((l) => l.b2?.boe === '7654321')?.status).toBe('only2b');
    expect(suppliers(r.lines).find((s) => !s.gstin)?.name).toBe('Imports (bills of entry)');
  });
});

describe('the ITC time limit (Section 16(4))', () => {
  it('ends on 30 November after the financial year', () => {
    expect(dayText(itcDeadline(dayOf('15-03-2026')))).toBe('30-11-2026');
    expect(dayText(itcDeadline(dayOf('01-04-2026')))).toBe('30-11-2027');
  });

  it('flags open bills whose last date is near or past', () => {
    const today = dayOf('26-11-2026')!;
    // GSTR-2B of March 2026; A-2 is a year old, reported late.
    const month = dayOf('01-03-2026');
    const twoB = [doc('2b', G1, 'A-1', '10-03-2026', 1000, 180, { month }), doc('2b', G1, 'A-2', '10-03-2025', 500, 90, { month }), doc('2b', G1, 'A-3', '10-03-2026', 100, 18, { month })];
    const books = [
      doc('books', G1, 'B-9', '12-03-2026', 2000, 360),
      doc('books', G1, 'A-3', '10-03-2026', 100, 18),
      doc('books', G2, 'CN-1', '10-03-2026', -100, -18, { kind: 'Credit note' }),
      // Outside the 2B months: not checked, so no time limit is pointed out.
      doc('books', G2, 'B-1', '10-02-2026', 100, 18),
    ];
    const r = reconcile(twoB, books, { tol: 1, dates: false, today });
    expect(r.lines.find((l) => l.bk?.no === 'B-1')).toMatchObject({ status: 'outside', notes: [] });
    const of = (no: string) => r.lines.find((l) => l.b2?.no === no || l.bk?.no === no)!;
    expect(of('A-1').notes).toContain('Take the ITC by 30-11-2026 (Section 16(4))');
    expect(of('A-2').notes.join()).toContain('Time-barred');
    expect(of('B-9').notes).toContain('Take the ITC by 30-11-2026 (Section 16(4))');
    // Matched bills and credit notes have nothing to take.
    expect(of('A-3').notes.join()).not.toContain('16(4)');
    expect(of('CN-1').deadline).toBeNull();
    const d = dues(r.lines, today);
    expect(d.soon).toEqual([{ deadline: dayOf('30-11-2026'), count: 2, tax: 540, by: { only2b: { count: 1, tax: 180 }, onlyBooks: { count: 1, tax: 360 } } }]);
    expect(d.barred[0]).toMatchObject({ count: 1, tax: 90 });
  });
});

describe('months', () => {
  it('notes bills booked in another month and adds up each month', () => {
    const twoB = [doc('2b', G1, 'M-1', '28-04-2026', 1000, 180, { month: MAY }), doc('2b', G1, 'M-2', '05-04-2026', 500, 90)];
    const books = [doc('books', G1, 'M-1', '28-04-2026', 1000, 180, { booked: dayOf('30-04-2026') }), doc('books', G1, 'M-2', '05-04-2026', 500, 90, { booked: dayOf('06-04-2026') })];
    const r = reconcile(twoB, books, { tol: 1, dates: false });
    expect(r.lines[0]).toMatchObject({ status: 'matched' });
    expect(r.lines[0].notes).toContain('In GSTR-2B of May 2026, booked in Apr 2026');
    expect(r.lines[1].notes.join()).not.toContain('booked in');
    expect(monthly(r)).toEqual([
      { month: APR, tax2b: 90, taxBooks: 270, otherMonth: 0 },
      { month: MAY, tax2b: 180, taxBooks: 0, otherMonth: 180 },
    ]);
  });
});

describe('your decisions', () => {
  const twoB = [doc('2b', G1, 'X9001', '15-04-2026', 3000, 540), doc('2b', G2, 'B-1', '10-04-2026', 2000, 360)];
  const books = [doc('books', G1, 'BILL-9001', '15-04-2026', 3000, 540), doc('books', G2, 'Q/77', '12-04-2026', 2100, 378)];
  const run = (decisions = { pairs: [] as string[], accept: [] as string[], reject: [] as string[] }) => reconcile(twoB, books, { tol: 1, dates: false, decisions });

  it('confirms a probable pair, or turns it down', () => {
    expect(run().lines[0].status).toBe('probable');
    const key = pairKey(twoB[0], books[0]);
    const ok = run({ pairs: [], accept: [key], reject: [] }).lines[0];
    expect(ok).toMatchObject({ status: 'matched', decided: 'confirmed' });
    expect(ok.notes).toContain('Confirmed by you');
    const no = run({ pairs: [], accept: [], reject: [key] }).lines;
    expect(no.map((l) => l.status).sort()).toEqual(['only2b', 'only2b', 'onlyBooks', 'onlyBooks']);
  });

  it('pairs two bills by hand, and still compares their amounts', () => {
    const l = run({ pairs: [pairKey(twoB[1], books[1])], accept: [], reject: [] }).lines.find((x) => x.b2?.no === 'B-1')!;
    expect(l).toMatchObject({ status: 'differs', decided: 'paired', bk: expect.objectContaining({ no: 'Q/77' }) });
    expect(l.notes[0]).toBe('Paired by you');
  });
});

describe('supplier follow-up', () => {
  it('lists what the supplier has not reported, or reported short, with a message', () => {
    const twoB = [doc('2b', G1, 'INV-46', '06-04-2026', 5000, 900, { ours: '27AAACZ0000Z1Z1' })];
    const books = [
      doc('books', G1, 'INV-46', '06-04-2026', 5100, 918, { name: 'Alpha Steel' }),
      doc('books', G1, 'INV-50', '18-04-2026', 4000, 720, { name: 'Alpha Steel' }),
      doc('books', G2, 'B-80', '20-04-2026', 1000, 180),
      // Entered twice: the second copy is ours to correct, not the supplier's to report.
      doc('books', G1, 'INV-46', '06-04-2026', 5100, 918, { name: 'Alpha Steel' }),
    ];
    const f = followUps(reconcile(twoB, books, { tol: 1, dates: false }));
    expect(f.map((x) => [x.gstin, x.tax, x.lines.length])).toEqual([
      [G1, 738, 2],
      [G2, 180, 1],
    ]);
    expect(f[0].text).toContain('Dear Alpha Steel,');
    expect(f[0].text).toContain('our GSTIN 27AAACZ0000Z1Z1');
    expect(f[0].text).toContain('This bill is not in it, so we cannot take the input tax credit.');
    expect(f[0].text).toContain('1. Invoice INV-50 dated 18-04-2026: taxable ₹4,000.00, tax ₹720.00');
    expect(f[0].text).toContain('1. Invoice INV-46 dated 06-04-2026: tax ₹918.00 charged, ₹900.00 reported');
  });
});

describe('GSTR-2B rows', () => {
  it('reads B2B, amendments and credit notes from the reader layout', () => {
    const b2b = ['Maharashtra', APR, G1, 'Alpha Steel', 'INV-1', 'Regular', '05-04-2026', 11800, 'Maharashtra', 'N', 10000, 1800, 0, 0, 0, 'Apr-26', '11-05-2026', 'Yes'];
    const cdnr = ['Maharashtra', APR, G1, 'Alpha Steel', 'CN-3', 'Credit Note', 'Regular', '12-04-2026', 1180, 'Maharashtra', 'N', 1000, 180, 0, 0, 0, null, null, null, null, null, null, 'Apr-26', '11-05-2026', 'Yes'];
    const docs = twoBDocs({ B2B: [b2b], 'B2B-CDNR': [cdnr] }, { ours: '27AAACZ0000Z1Z1' });
    expect(docs[0]).toMatchObject({ section: 'B2B', no: 'INV-1', taxable: 10000, igst: 1800, itc: 'Yes', month: APR });
    expect(docs[1]).toMatchObject({ section: 'CDNR', kind: 'Credit note', taxable: -1000, igst: -180 });
  });
});

describe('GSTR-2B JSON', () => {
  // Everything but where the row came from, in one order.
  const same = (docs: Doc[]) => docs.map((d) => ({ ...d, row: 0, file: undefined, alt: d.alt || undefined })).sort((a, b) => `${a.section}${a.gstin}${a.no}`.localeCompare(`${b.section}${b.gstin}${b.no}`));

  it('gives the same documents as the Excel file of the same month', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const XLSX = await import('xlsx');
    const ExcelJS = (await import('exceljs')).default;
    const { makeGstr2b } = await import('../src/lib/gst/gstr2b');
    const dir = path.join(__dirname, 'fixtures');
    const p = makeGstr2b(XLSX, ExcelJS).parsePortal(XLSX.read(fs.readFileSync(path.join(dir, 'gstr2b-apr-2026.xlsx'))), 'x');
    const excel = twoBDocs(p.sheets, { ours: p.gstin });
    const j = twoBJson(JSON.parse(fs.readFileSync(path.join(dir, 'gstr2b-apr-2026.json'), 'utf8')), 'gstr2b-apr-2026.json');
    expect(j).toMatchObject({ kind: 'GSTR-2B', gstin: p.gstin, month: APR, errors: [], warnings: [] });
    expect(excel).toHaveLength(8);
    expect(same(j.docs.filter((d) => !d.boe))).toEqual(same(excel));
    expect(j.docs.find((d) => d.kind === 'Credit note')).toMatchObject({ no: 'CN-3', taxable: -1000, igst: -180 });
    // The import is read too, by its bill of entry.
    expect(j.docs.find((d) => d.boe)).toMatchObject({ section: 'IMPG', gstin: '', boe: '1234567', kind: 'Bill of entry', date: dayOf('18-04-2026'), taxable: 50000, igst: 9000, month: APR, name: 'Import, port INNSA1' });
  }, 30000);

  it('reads amendments, debit notes and the older GSTR-2A layout', () => {
    const r = twoBJson({
      data: {
        rtnprd: '052026', gstin: '27AAACZ0000Z1Z1',
        docdata: {
          b2ba: [{ ctin: G1, trdnm: 'Alpha', inv: [{ oinum: 'A-1', inum: 'A-1R', dt: '02-05-2026', val: 118, txval: 100, igst: 18, cgst: 0, sgst: 0, cess: 0, itcavl: 'N', rev: 'N' }] }],
          cdnr: [{ ctin: G2, trdnm: 'Beta', nt: [{ ntnum: 'DN-1', typ: 'D', dt: '03-05-2026', val: 59, txval: 50, igst: 9, cgst: 0, sgst: 0, cess: 0, itcavl: 'Y' }] }],
        },
      },
    });
    expect(r.month).toBe(MAY);
    expect(r.docs[0]).toMatchObject({ section: 'B2BA', alt: 'A-1', no: 'A-1R', itc: 'No', taxable: 100, month: MAY });
    expect(r.docs[1]).toMatchObject({ kind: 'Debit note', taxable: 50, igst: 9 });

    const twoA = twoBJson({
      gstin: '27AAACZ0000Z1Z1', fp: '042026',
      b2b: [{ ctin: G1, cfs: 'Y', inv: [{ inum: '77', idt: '09-04-2026', val: 1180, rchrg: 'N', itms: [{ num: 1, itm_det: { rt: 18, txval: 600, iamt: 108 } }, { num: 2, itm_det: { rt: 18, txval: 400, iamt: 72 } }] }] }],
      cdn: [{ ctin: G1, nt: [{ ntty: 'C', nt_num: 'C9', nt_dt: '10-04-2026', val: 118, itms: [{ num: 1, itm_det: { rt: 18, txval: 100, iamt: 18 } }] }] }],
    });
    expect(twoA.kind).toBe('GSTR-2A');
    expect(twoA.docs[0]).toMatchObject({ no: '77', date: dayOf('09-04-2026'), taxable: 1000, igst: 180, month: APR });
    expect(twoA.docs[1]).toMatchObject({ no: 'C9', kind: 'Credit note', taxable: -100, igst: -18 });
  });

  it('says so when the file is not a GSTR-2B', () => {
    expect(twoBJson({ data: { gstin: '27AAACZ0000Z1Z1', ret_period: '042026' } }).errors).toHaveLength(1);
    expect(twoBJson({ gstin: '27AAACZ0000Z1Z1', ret_period: '042026', sup_details: {}, itc_elg: {} }).errors.join()).toContain('GSTR-3B');
    // A GSTR-1 has b2b too, but its GSTINs are your customers'.
    const gstr1 = twoBJson({ gstin: '27AAACZ0000Z1Z1', fp: '042026', b2b: [{ ctin: G1, inv: [{ inum: 'S-1', idt: '01-04-2026', val: 118, itms: [{ num: 1, itm_det: { txval: 100, iamt: 18 } }] }] }], hsn: {} });
    expect(gstr1.docs).toEqual([]);
    expect(gstr1.errors.join()).toContain('GSTR-1');
  });
});

describe('end to end: portal GSTR-2B files and a Tally purchase register', () => {
  it('reads both and gives every outcome', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const XLSX = await import('xlsx');
    const ExcelJS = (await import('exceljs')).default;
    const { makeGstr2b } = await import('../src/lib/gst/gstr2b');
    const { reconWorkbook } = await import('../src/lib/gst/recon2b-excel');
    const dir = path.join(__dirname, 'fixtures');
    const core = makeGstr2b(XLSX, ExcelJS);
    const twoB = ['gstr2b-apr-2026.xlsx', 'gstr2b-may-2026.xlsx'].flatMap((f) => {
      const p = core.parsePortal(XLSX.read(fs.readFileSync(path.join(dir, f))), f);
      expect(p.errors).toEqual([]);
      return twoBDocs(p.sheets, { ours: p.gstin, file: f });
    });
    expect(twoB).toHaveLength(11);
    const wb = XLSX.read(fs.readFileSync(path.join(dir, 'purchase-register.xlsx')));
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null, blankrows: false }) as unknown[][];
    const read = registerDocs(aoa, readRegister(aoa));
    expect(read.docs).toHaveLength(14);
    const res = reconcile(twoB, read.docs, { tol: 1, dates: false });
    const t = totals(res.lines);
    expect(Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.count]))).toEqual({ all: 15, matched: 6, differs: 2, probable: 2, only2b: 1, onlyBooks: 2, outside: 2 });
    expect(t.all.tax2b).toBe(8280);
    expect(t.all.taxBooks - t.outside.taxBooks).toBe(8388);
    // The report opens and has a sheet per outcome.
    const book = new ExcelJS.Workbook();
    await book.xlsx.load((await reconWorkbook(res, { twoB: 'test', books: 'test', tol: 1, date: '25-11-2026' })) as never);
    expect(book.worksheets.map((w) => w.name)).toEqual(['Summary', 'Month-wise', 'All documents', 'Amounts differ', 'Probable matches', 'Not in books', 'Not in 2B', 'Outside 2B months', 'Suppliers', 'Supplier follow-up']);
    // The bill booked in April but in May's GSTR-2B is pointed out.
    expect(res.lines.find((l) => l.b2?.no === 'INV/2026-27/0061')?.notes).toContain('In GSTR-2B of May 2026, booked in Apr 2026');
    const months = monthly(res);
    expect(months.map((m) => m.tax2b)).toEqual([5460, 2820]);
    expect(months.reduce((s, m) => s + m.tax2b, 0)).toBe(t.all.tax2b);
    expect(book.getWorksheet('Supplier follow-up')!.rowCount).toBe(1 + followUps(res).length);
  }, 30000);
});
