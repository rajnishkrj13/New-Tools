import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import GST from '../src/lib/gst/core';
import { makeGstr2b } from '../src/lib/gst/gstr2b';
import { buildWorkbook, XL } from '../src/lib/gst/excel';
import { allRows } from '../src/lib/gst/helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---- synthetic portal PDFs: text items placed the way pdf.js reports them --------------------------

type Item = { s: string; x: number; y: number; w: number; h: number; rot: boolean };
/** One printed line: [text, x, width] tokens at height y. */
const line = (y: number, ...tokens: [string, number, number][]): Item[] => tokens.map(([s, x, w]) => ({ s, x, y, w, h: 9, rot: false }));
/** Right-aligned amounts ending at the given x positions. */
const amounts = (y: number, vals: string[], ends: number[]): Item[] => vals.map((v, i) => ({ s: v, x: ends[i] - v.length * 5, y, w: v.length * 5, h: 9, rot: false }));

function gstr3bPage(month: string, c: number, itc: number, taxable = 100000) {
  const cash = c - itc;
  const E5 = [420, 500, 580, 660, 740];
  const E4 = [500, 580, 660, 740];
  const E8 = [380, 440, 500, 560, 620, 680, 740, 800];
  let y = 800;
  const next = () => (y -= 20);
  return [
    ...line(next(), ['Form GSTR-3B', 40, 80]),
    ...line(next(), ['Year 2025-26', 40, 70]),
    ...line(next(), [`Period ${month}`, 40, 60]),
    ...line(next(), ['GSTIN of the supplier 27AAPFU0939F1ZV', 40, 220]),
    ...line(next(), ['Legal name of the registered person ACME TRADERS', 40, 260]),
    ...line(next(), ['Date of ARN 20/05/2025', 40, 120]),
    ...line(next(), ['3.1 Details of Outward supplies and inward supplies liable to reverse charge', 40, 400]),
    ...line(next(), ['Nature of Supplies', 40, 100], ['Total taxable value', 300, 80], ['Integrated tax', 400, 60]),
    ...line(y - 20, ['(a) Outward taxable supplies (other than zero rated, nil rated and exempted)', 40, 250]), ...amounts(next(), [`${taxable}.00`, '0.00', `${c}.00`, `${c}.00`, '0.00'], E5),
    ...line(next(), ['4. Eligible ITC', 40, 80]),
    ...line(next(), ['Details', 40, 40], ['Integrated tax', 400, 60]),
    ...line(next(), ['A. ITC Available (whether in full or part)', 40, 200]),
    ...line(y - 20, ['(5) All other ITC', 40, 90]), ...amounts(next(), ['0.00', `${itc}.00`, `${itc}.00`, '0.00'], E4),
    ...line(next(), ['B. ITC Reversed', 40, 80]),
    ...line(y - 20, ['(1) As per rules 38, 42 and 43 of CGST Rules and section 17(5)', 40, 240]), ...amounts(next(), ['0.00', '0.00', '0.00', '0.00'], E4),
    ...line(y - 20, ['C. Net ITC available (A-B)', 40, 120]), ...amounts(next(), ['0.00', `${itc}.00`, `${itc}.00`, '0.00'], E4),
    ...line(next(), ['6.1 Payment of tax', 40, 90]),
    ...line(next(), ['Description', 40, 60], ['Total tax payable', 300, 70]),
    ...line(next(), ['(A) Other than reverse charge', 40, 140]),
    ...line(y - 20, ['Integrated tax', 40, 60]), ...amounts(next(), ['0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00'], E8),
    ...line(y - 20, ['Central tax', 40, 50]), ...amounts(next(), [`${c}.00`, '0.00', `${itc}.00`, '0.00', '0.00', `${cash}.00`, '0.00', '0.00'], E8),
    ...line(y - 20, ['State/UT tax', 40, 55]), ...amounts(next(), [`${c}.00`, '0.00', '0.00', `${itc}.00`, '0.00', `${cash}.00`, '0.00', '0.00'], E8),
    ...line(y - 20, ['Cess', 40, 20]), ...amounts(next(), ['0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00'], E8),
    ...line(next(), ['Verification', 40, 60]),
  ];
}

function gstr1Page(month: string, v: number, c: number) {
  // Column headings end at these x positions; amounts are right-aligned to them.
  const ENDS = [410, 500, 570, 645, 685];
  let y = 800;
  const next = () => (y -= 20);
  const row = (label: string, vals: string[], rec?: string, doc?: string) => {
    const yy = next();
    return [...line(yy, [label, 40, 150]), ...(rec ? line(yy, [rec, 255, 5]) : []), ...(doc ? line(yy, [doc, 300, 35]) : []), ...amounts(yy, vals, ENDS)];
  };
  const amt = [`${v}.00`, '0.00', `${c}.00`, `${c}.00`, '0.00'];
  return [
    ...line(next(), ['Form GSTR-1', 40, 70]),
    ...line(next(), ['Financial year 2025-26', 40, 110]),
    ...line(next(), [`Tax period ${month}`, 40, 80]),
    ...line(next(), ['GSTIN 27AAPFU0939F1ZV', 40, 130]),
    ...line(next(), ['Legal name of the registered person ACME TRADERS', 40, 260]),
    ...line(next(), ['ARN date 11/05/2025', 40, 100]),
    ...line(next(), ['No. of', 250, 25], ['Document', 300, 40]),
    ...line(next(), ['Description', 40, 60], ['Value', 380, 30], ['Integrated tax', 440, 60], ['Central tax', 520, 50], ['State/UT tax', 590, 55], ['Cess', 665, 20]),
    ...line(next(), ['4A - Taxable outward supplies made to registered persons, other than reverse charge supplies - B2B Regular', 40, 330]),
    ...row('Total', amt, '2', 'Invoice'),
    ...row('Total Liability (Outward supplies other than Reverse charge)', amt),
    ...line(next(), ['Verification', 40, 60]),
  ];
}

describe('GSTR-3B reader (ported engine)', () => {
  it('reads the tables and passes its own checks', () => {
    const r = GST.parse(GST.lines([gstr3bPage('April', 9000, 5000)]));
    expect(r.type).toBe('GSTR3B');
    expect(r.gstin).toBe('27AAPFU0939F1ZV');
    expect(r.fy).toBe('2025-26');
    expect(r.month).toBe(4);
    expect(r.state).toBe('Maharashtra');
    expect(r.arnDate).toBe('20/05/2025');
    expect(r.f['3.1a']).toMatchObject({ v: 100000, i: 0, c: 9000, s: 9000, cs: 0 });
    expect(r.f['4C']).toMatchObject({ c: 5000, s: 5000 });
    expect(r.f['6.1A.cash']).toMatchObject({ c: 4000, s: 4000 });
    expect(r.checks.map((c: any) => c.lvl)).toEqual(['ok', 'ok', 'ok']);
  });

  it('flags a return whose tax paid does not add up', () => {
    const page = gstr3bPage('May', 9000, 5000).map((t) => (t.s === '4000.00' ? { ...t, s: '3000.00' } : t));
    const r = GST.parse(GST.lines([page]));
    expect(r.checks.find((c: any) => /ITC \+ cash|ITC used \+ cash/.test(c.msg)).lvl).toBe('warn');
  });
});

describe('GSTR-1 reader and the reconciliation (ported engine)', () => {
  it('reads B2B and Total Liability and checks they agree', () => {
    const r = GST.parse(GST.lines([gstr1Page('April', 100000, 9000)]));
    expect(r.type).toBe('GSTR1');
    expect(r.month).toBe(4);
    expect(r.f.B2B).toMatchObject({ rec: 2, v: 100000, c: 9000, s: 9000 });
    expect(r.f.TL).toMatchObject({ v: 100000, c: 9000 });
    expect(r.checks[0]).toMatchObject({ lvl: 'ok' });
  });

  it('pairs both returns by GSTIN and month and finds the difference', () => {
    const g1 = GST.parse(GST.lines([gstr1Page('April', 100000, 9000)]));
    const g3 = GST.parse(GST.lines([gstr3bPage('April', 9500, 5000)]));
    const A = GST.RECON.find((L: any) => L.id === 'A');
    expect(GST.reconValue(g3.f, A.b3, 'c') - GST.reconValue(g1.f, A.g1, 'c')).toBe(500);
    expect(GST.reconValue(g3.f, A.b3, 'i') - GST.reconValue(g1.f, A.g1, 'i')).toBe(0);
  });

  it('groups months by GSTIN and year, keeping the latest ARN for a repeated month', () => {
    const a = { ...GST.parse(GST.lines([gstr3bPage('April', 9000, 5000)])), file: 'a.pdf', arnDate: '20/05/2025' };
    const b = { ...GST.parse(GST.lines([gstr3bPage('April', 9100, 5000)])), file: 'b.pdf', arnDate: '01/06/2025' };
    const m = { ...GST.parse(GST.lines([gstr3bPage('May', 8000, 4000)])), file: 'm.pdf' };
    const { list, dups } = GST.group([a, b, m]);
    expect(list).toHaveLength(1);
    expect(list[0].months[4].file).toBe('b.pdf');
    expect(dups.map((d: any) => d.file)).toEqual(['a.pdf']);
    const rows = GST.monthTable(GST.G3_FIELDS, list[0], { hideZero: true });
    const cgst = rows.find((r: any) => r.key === '3.1a' && r.head === 'c');
    expect(cgst.vals.slice(0, 2)).toEqual([9100, 8000]);
    expect(cgst.total).toBe(17100);
    expect(allRows(GST.G3_FIELDS, list, true).find((r: any) => r.key === '3.1a' && r.head === 'c').vals).toEqual([17100]);
  });
});

// ---- GSTR-2B merger with the current SheetJS and ExcelJS --------------------------------------------

async function portal2b(month: string, gstin: string, invoices: [string, number][]) {
  const wb = new ExcelJS.Workbook();
  const rm = wb.addWorksheet('Read me');
  rm.addRows([['Goods and Services Tax - GSTR-2B'], [], ['Financial Year', '2025-26'], ['Tax Period', month], ['GSTIN', gstin], ['Legal Name', 'ACME TRADERS PRIVATE LIMITED']]);
  const b2b = wb.addWorksheet('B2B');
  b2b.addRows([['Taxpayer details'], [], [], ['GSTIN of supplier', 'Trade/Legal name', 'Invoice number', 'Invoice type', 'Invoice Date', 'Invoice Value', 'Place of supply', 'Supply Attract Reverse Charge', 'Taxable Value', 'Integrated Tax', 'Central Tax', 'State/UT Tax', 'Cess', 'GSTR-1/IFF/GSTR-5 Period', 'GSTR-1/IFF/GSTR-5 Filing Date', 'ITC Availability'], []]);
  invoices.forEach(([no, taxable]) => b2b.addRow(['29AAGCB7383J1Z4', 'SUPPLIER CO', no, 'Regular', '05-04-2025', taxable * 1.18, 'Maharashtra', 'No', taxable, 0, taxable * 0.09, taxable * 0.09, 0, 'Apr-25', '11-05-2025', 'Yes']));
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe('GSTR-2B merger (ported core)', () => {
  const core = makeGstr2b(XLSX, ExcelJS);

  it('reads a portal download, merges it and reads the merged file back', async () => {
    const file = await portal2b('April', '27AAPFU0939F1ZV', [['INV-1', 1000], ['INV-2', 2000]]);
    const wb = XLSX.read(file, { type: 'array' });
    expect(core.sniff(wb)).toBe('portal');
    const p = core.parsePortal(wb, '042025_27AAPFU0939F1ZV_GSTR2B_14052025.xlsx');
    expect(p.errors).toEqual([]);
    expect(p.counts.B2B).toBe(2);
    expect(core.monthLabel(p.monthSerial)).toBe('Apr-25');
    expect(p.totals.cgst).toBeCloseTo(270);
    expect(core.suggestState(p.gstin, {}, null)).toEqual({ label: 'Maharashtra', source: 'code' });

    const merged = core.merge(null, [{ parsed: p, state: 'Mumbai' }]);
    const out = await core.writeWorkbook(merged);
    const master = core.parseMaster(XLSX.read(new Uint8Array(out), { type: 'array' }), 'merged.xlsx');
    expect(master.errors).toEqual([]);
    expect(master.sheets.B2B).toHaveLength(2);
    expect(master.sheets.B2B[0][0]).toBe('Mumbai');
    expect(core.monthLabel(master.sheets.B2B[0][1])).toBe('Apr-25');
    expect(master.sheets.B2B[1][4]).toBe('INV-2');

    // The same month again replaces its rows instead of adding to them.
    const again = core.parsePortal(XLSX.read(await portal2b('April', '27AAPFU0939F1ZV', [['INV-9', 500]]), { type: 'array' }), 'fix.xlsx');
    const m2 = core.merge(master, [{ parsed: again, state: 'Mumbai' }]);
    expect(m2.report.replaced).toHaveLength(1);
    expect(m2.sheets.B2B.map((r: any[]) => r[4])).toEqual(['INV-9']);
  });

  it('skips a sheet whose columns moved instead of misplacing values', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Read me').addRows([['Financial Year', '2025-26'], ['Tax Period', 'May'], ['GSTIN', '27AAPFU0939F1ZV']]);
    wb.addWorksheet('B2B').addRows([['GSTIN of supplier', 'Name', 'Extra column', 'ITC Availability']]);
    const p = core.parsePortal(XLSX.read(new Uint8Array(await wb.xlsx.writeBuffer()), { type: 'array' }), 'x.xlsx');
    expect(p.errors.join(' ')).toMatch(/columns are not where expected/);
  });
});

describe('Excel output', () => {
  it('writes values, number formats and colours that Excel reads back', async () => {
    const bytes = await buildWorkbook([{ name: XL.name('Returns', {}), sheet: XL.sheet([[XL.t('Title', XL.S.title)], [XL.t('GSTIN', XL.S.headL), XL.n(1234.567)]], [10, 12]) }]);
    const wb = XLSX.read(bytes, { type: 'array', cellStyles: true });
    const ws = wb.Sheets.Returns;
    expect(ws.A1.v).toBe('Title');
    expect(ws.B2.v).toBe(1234.57);
    expect(ws.B2.z).toContain('#,##0.00');
    expect(XL.name('A:B/C?', {})).toBe('A B C');
  });
});
