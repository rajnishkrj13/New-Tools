import { describe, expect, it } from 'vitest';
import { detectTables, type PageInput } from '../src/lib/tables/detect';
import { joinAcrossPages } from '../src/lib/tables/join';
import { valueOf } from '../src/lib/tables/values';
import { checkTable } from '../src/lib/tables/check';
import { cell, type Segment, type Table, type Word } from '../src/lib/tables/types';

/** A word of text as a PDF would place it: about half an em per character. */
const w = (text: string, x: number, y: number, size = 10, extra: Partial<Word> = {}): Word => ({ text, box: { x0: x, y0: y - size, x1: x + text.length * size * 0.5, y1: y + size * 0.2 }, size, ...extra });
const hl = (y: number, x0: number, x1: number): Segment => ({ x0, y0: y, x1, y1: y });
const vl = (x: number, y0: number, y1: number): Segment => ({ x0: x, y0, x1: x, y1 });
const page = (words: Word[], segments: Segment[] = [], n = 0): PageInput => ({ page: n, width: 595, height: 842, words, segments });
const grid = (t: Table) => t.rows.map((r) => r.map((c) => (c.hidden ? '·' : c.text)));

describe('ruled tables', () => {
  it('reads a full grid with a merged heading cell', () => {
    // 3 columns, 3 rows; the first row's "Amount" spans columns 2-3 (no line between them).
    const xs = [50, 150, 250, 350];
    const ys = [100, 120, 140, 160];
    const segs = [...ys.map((y) => hl(y, 50, 350)), vl(50, 100, 160), vl(150, 100, 160), vl(250, 120, 160), vl(350, 100, 160)];
    const words = [w('Item', 55, 115), w('Amount', 155, 115), w('Pen', 55, 135), w('10', 155, 135), w('5.00', 255, 135), w('Book', 55, 155), w('2', 155, 155), w('80.00', 255, 155)];
    const { tables, free } = detectTables(page(words, segs));
    expect(tables).toHaveLength(1);
    expect(free).toEqual([]);
    const t = tables[0];
    expect(t.method).toBe('ruled');
    expect(grid(t)).toEqual([['Item', 'Amount', '·'], ['Pen', '10', '5.00'], ['Book', '2', '80.00']]);
    expect(t.rows[0][1].colSpan).toBe(2);
    expect(t.headerRows).toBe(1);
    expect(t.confidence.rows).toBe(100);
    void xs;
  });

  it('takes rows from text lines when only column lines are drawn', () => {
    const segs = [hl(100, 50, 350), hl(200, 50, 350), vl(50, 100, 200), vl(150, 100, 200), vl(250, 100, 200), vl(350, 100, 200)];
    const words = [w('Date', 55, 115), w('Detail', 155, 115), w('Amount', 255, 115), w('01-04-2026', 55, 135), w('Rent', 155, 135), w('500.00', 255, 135), w('02-04-2026', 55, 150), w('Power', 155, 150), w('120.50', 255, 150), w('03-04-2026', 55, 165), w('Water', 155, 165), w('40.00', 255, 165)];
    const t = detectTables(page(words, segs)).tables[0];
    expect(t.method).toBe('ruled-partial');
    expect(grid(t)).toEqual([['Date', 'Detail', 'Amount'], ['01-04-2026', 'Rent', '500.00'], ['02-04-2026', 'Power', '120.50'], ['03-04-2026', 'Water', '40.00']]);
  });
});

describe('unruled tables', () => {
  const statement = (y0: number) => [
    w('Date', 50, y0), w('Narration', 130, y0), w('Debit', 330, y0), w('Credit', 400, y0), w('Balance', 470, y0),
    w('01/04/2026', 50, y0 + 16), w('Opening balance', 130, y0 + 16), w('10,000.00', 470, y0 + 16),
    w('02/04/2026', 50, y0 + 32), w('UPI/Grocery Mart', 130, y0 + 32), w('1,250.00', 330, y0 + 32), w('8,750.00', 470, y0 + 32),
    w('ref 4471 Pune', 130, y0 + 44),
    w('05/04/2026', 50, y0 + 60), w('NEFT Salary', 130, y0 + 60), w('50,000.00', 400, y0 + 60), w('58,750.00', 470, y0 + 60),
    w('09/04/2026', 50, y0 + 76), w('ATM', 130, y0 + 76), w('5,000.00', 330, y0 + 76), w('53,750.00', 470, y0 + 76),
  ];

  it('finds columns from the white space, joins wrapped descriptions and keeps blanks', () => {
    const t = detectTables(page(statement(100))).tables[0];
    expect(t.method).toBe('aligned');
    expect(grid(t)).toEqual([
      ['Date', 'Narration', 'Debit', 'Credit', 'Balance'],
      ['01/04/2026', 'Opening balance', '', '', '10,000.00'],
      ['02/04/2026', 'UPI/Grocery Mart\nref 4471 Pune', '1,250.00', '', '8,750.00'],
      ['05/04/2026', 'NEFT Salary', '', '50,000.00', '58,750.00'],
      ['09/04/2026', 'ATM', '5,000.00', '', '53,750.00'],
    ]);
    expect(t.headerRows).toBe(1);
    expect(t.confidence.cols).toBe(100);
  });

  it('keeps two tables on one page apart and leaves the paragraph between them out', () => {
    const words = [...statement(100), w('This paragraph of ordinary text sits between the two tables on the page.', 50, 230), w('Item', 50, 280), w('Qty', 200, 280), w('Pen', 50, 296), w('10', 200, 296), w('Ink', 50, 312), w('4', 200, 312)];
    const { tables, free } = detectTables(page(words));
    expect(tables.map((t) => t.rows.length)).toEqual([5, 3]);
    expect(free.map((x) => x.text)).toEqual(['This paragraph of ordinary text sits between the two tables on the page.']);
  });

  it('does not take running text in two columns for a table', () => {
    const words: Word[] = [];
    for (let i = 0; i < 10; i++) words.push(w('Lorem ipsum dolor sit amet consectetur', 50, 100 + i * 14), w('adipiscing elit sed do eiusmod tempor', 320, 100 + i * 14));
    expect(detectTables(page(words)).tables).toEqual([]);
  });

  it('joins a table continued on the next page and drops the repeated heading', () => {
    const p1 = detectTables(page(statement(700), [], 0)).tables;
    const p2 = detectTables(page(statement(60), [], 1)).tables;
    const { tables, joined } = joinAcrossPages([...p1, ...p2], () => 595);
    expect(tables).toHaveLength(1);
    expect(joined).toHaveLength(1);
    expect(tables[0].rows).toHaveLength(9);
    expect(tables[0].pages).toEqual([0, 1]);
    expect(tables[0].rowPages).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1]);
  });
});

describe('values', () => {
  it('types numbers, dates and identifiers without changing them', () => {
    // Indian grouping is kept: lakhs and crores by size.
    expect(valueOf('1,25,000.50')).toEqual({ kind: 'number', value: 125000.5, format: '[>=10000000]##\\,##\\,##\\,##0.00;[>=100000]##\\,##\\,##0.00;##,##0.00' });
    expect(valueOf('125,000.50')).toEqual({ kind: 'number', value: 125000.5, format: '#,##0.00' });
    expect(valueOf('-250')).toMatchObject({ kind: 'number', value: -250 });
    expect(valueOf('(250.00)')).toEqual({ kind: 'number', value: -250, format: '#,##0.00;(#,##0.00)' });
    expect(valueOf('1,000.00 Cr')).toEqual({ kind: 'number', value: 1000, format: '#,##0.00 "Cr"' });
    expect(valueOf('18%')).toEqual({ kind: 'number', value: 0.18, format: '0%' });
    expect(valueOf('₹ 500')).toMatchObject({ kind: 'number', value: 500, format: '"₹"#,##0' });
    expect(valueOf('05/04/2026')).toMatchObject({ kind: 'date', format: 'dd-mm-yyyy' });
    expect((valueOf('05/04/2026') as { value: Date }).value.toISOString().slice(0, 10)).toBe('2026-04-05');
    expect(valueOf('1-Apr-2026')).toMatchObject({ kind: 'date', format: 'dd-mmm-yyyy' });
    for (const id of ['27AAPFU0939F1ZV', 'ABCDE1234F', 'HDFC0001234', '000123', '123456789012345678', 'INV-001'])
      expect(valueOf(id).kind, id).toBe('text');
    expect(valueOf('12345', true).kind).toBe('text');
    expect(valueOf('१२३').kind).toBe('text');
  });
});

describe('checks', () => {
  const table = (rows: string[][], headerRows = 1): Table => ({ id: 't', name: 't', pages: [0], box: { x0: 0, y0: 0, x1: 1, y1: 1 }, rows: rows.map((r) => r.map((t) => cell(t))), headerRows, method: 'aligned', confidence: { table: 100, rows: 100, cols: 100, cells: 100 }, notes: [] });

  it('matches totals and points at the one that does not add up', () => {
    const good = checkTable(table([['Item', 'Amount'], ['A', '100.00'], ['B', '250.50'], ['C', '49.50'], ['Total', '400.00']]));
    expect(good.findings.filter((f) => f.level === 'ok')).toHaveLength(1);
    const bad = checkTable(table([['Item', 'Amount'], ['A', '100.00'], ['B', '250.50'], ['C', '49.50'], ['Total', '410.00']]));
    expect(bad.findings.find((f) => f.level === 'error')?.message).toMatch(/total is 410\.00 but the rows above add up to 400\.00/);
  });

  it('follows running balances and finds the row that breaks them', () => {
    const rows = [['Date', 'Particulars', 'Debit', 'Credit', 'Balance'], ['01/04', 'Opening', '', '', '1,000.00'], ['02/04', 'A', '200.00', '', '800.00'], ['03/04', 'B', '', '500.00', '1,300.00'], ['04/04', 'C', '100.00', '', '1,250.00'], ['05/04', 'D', '50.00', '', '1,150.00']];
    const r = checkTable(table(rows));
    const errs = r.findings.filter((f) => f.level === 'error');
    expect(errs.map((e) => e.row)).toEqual([4, 5]);
    rows[4][4] = '1,200.00';
    expect(checkTable(table(rows)).findings.some((f) => f.level === 'ok' && /running balance/.test(f.message))).toBe(true);
  });

  it('reports repeated headings, duplicates and text in amount columns', () => {
    const r = checkTable(table([['Item', 'Amount'], ['A', '1.00'], ['Item', 'Amount'], ['B', '2.00'], ['B', '2.00'], ['C', 'see note']]));
    const msgs = r.findings.map((f) => f.message).join('\n');
    expect(msgs).toMatch(/repeats the heading/);
    expect(msgs).toMatch(/identical to row/);
    expect(msgs).toMatch(/"see note" in a column of amounts/);
  });
});

import { combine, deleteCol, deleteRow, insertCol, insertRow, merge, split, splitTable, setText } from '../src/lib/tables/edit';

describe('editing', () => {
  const base = (): Table => ({ id: 't', name: 'T', pages: [0], box: { x0: 0, y0: 0, x1: 1, y1: 1 }, rows: [[cell('A'), cell('B'), cell('C')], [cell('1'), cell('2'), cell('3')], [cell('4'), cell('5'), cell('6')]], headerRows: 1, method: 'aligned', confidence: { table: 100, rows: 100, cols: 100, cells: 100 }, notes: [] });
  const g = (t: Table) => t.rows.map((r) => r.map((c) => (c.hidden ? '·' : c.text)));

  it('merges and splits cells and keeps spans right when rows and columns change', () => {
    const m = merge(base(), 1, 0, 2, 1) as Table;
    expect(g(m)).toEqual([['A', 'B', 'C'], ['1\n2\n4\n5', '·', '3'], ['·', '·', '6']]);
    expect(merge(m, 0, 1, 1, 1)).toMatch(/cuts through/);
    const r = insertRow(m, 2);
    expect(r.rows[1][0].rowSpan).toBe(3);
    expect(g(deleteRow(m, 1))).toEqual([['A', 'B', 'C'], ['1\n2\n4\n5', '·', '6']]);
    const c = insertCol(m, 1);
    expect(c.rows[1][0].colSpan).toBe(3);
    expect(g(deleteCol(m, 0))).toEqual([['B', 'C'], ['1\n2\n4\n5', '3'], ['·', '6']]);
    expect(g(split(m, 2, 1))).toEqual([['A', 'B', 'C'], ['1\n2\n4\n5', '', '3'], ['', '', '6']]);
    expect(g(setText(m, 2, 1, 'X'))[1][0]).toBe('X');
  });

  it('splits a table in two and puts tables under each other without repeating the heading', () => {
    const [a, b] = splitTable(base(), 2, 't2');
    expect(g(a)).toEqual([['A', 'B', 'C'], ['1', '2', '3']]);
    expect(g(b)).toEqual([['4', '5', '6']]);
    const twice = combine(base(), base());
    expect(g(twice)).toEqual([['A', 'B', 'C'], ['1', '2', '3'], ['4', '5', '6'], ['1', '2', '3'], ['4', '5', '6']]);
    const wide = combine(base(), { ...base(), rows: [[cell('x'), cell('y'), cell('z'), cell('w')]], headerRows: 0 });
    expect(wide.rows[0]).toHaveLength(4);
  });
});
