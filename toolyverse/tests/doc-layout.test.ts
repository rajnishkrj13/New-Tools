import { describe, expect, it } from 'vitest';
import { buildDocx } from '../src/lib/pdf/word/docx';
import { layoutPage, markLines, takeRunningHeads, type PageIn, type Span } from '../src/lib/pdf/word/layout';
import { detectTables, pageFrame, textBoxes } from '../src/lib/tables/detect';
import { patchIndic } from '../src/lib/tables/pdf';
import { hasBrokenIndic, joinMarkPieces } from '../src/lib/lang';
import type { Segment, Word } from '../src/lib/tables/types';

const A4 = { width: 595, height: 842 };
const span = (str: string, x: number, y: number, size = 11): Span => ({ str, x, y, w: str.length * size * 0.5, size, font: 'Arial', bold: false, italic: false });
const word = (text: string, x: number, y: number, size = 10, conf?: number): Word => ({ text, box: { x0: x, y0: y - size * 0.8, x1: x + text.length * size * 0.5, y1: y + size * 0.2 }, size, conf });
const page = (spans: Span[]): PageIn => ({ ...A4, spans, images: [] });

describe('running headers and footers', () => {
  it('numbers pages from where the PDF does, and starts again where the footer changes', () => {
    const pages = [
      page([span('Cover letter', 72, 100), span('https://example.org/page   1/2', 30, 830, 8)]),
      page([span('Second', 72, 100), span('https://example.org/page   2/2', 30, 830, 8)]),
      ...[1, 2, 3].map((n) => page([span(`Body ${n}`, 72, 100), span('Tender No.: ABC/01', 40, 805, 10), span(`Page ${n} of 26`, 470, 805, 10)])),
    ];
    const { headers, footers } = takeRunningHeads(pages);
    expect(headers).toHaveLength(0);
    expect(footers).toHaveLength(2);
    expect(footers[1]).toMatchObject({ from: 2, to: 4, start: 1 });
    expect(footers[1].lines[0].map((p) => [p.align, p.text])).toEqual([
      ['left', 'Tender No.: ABC/01'],
      ['right', 'Page {PAGE} of 26'],
    ]);
    // Taken off the pages.
    expect(pages[3].spans.map((s) => s.str)).toEqual(['Body 2']);
    // In Word: an own footer per run, page numbering restarting at 1.
    const outs = pages.map((p) => layoutPage(p, 11, { editable: true }));
    const xml = new TextDecoder().decode(buildDocx(outs, { footers }));
    expect(xml).toContain('<w:pgNumType w:start="1"/>');
  });
});

describe('page frame and lines', () => {
  const frame: Segment[] = [
    { x0: 24, y0: 24, x1: 572, y1: 24 },
    { x0: 24, y0: 819, x1: 572, y1: 819 },
    { x0: 24, y0: 24, x1: 24, y1: 819 },
    { x0: 572, y0: 24, x1: 572, y1: 819 },
  ];
  it('finds a border drawn round the page and keeps it out of the tables', () => {
    const words = [word('Annexure', 80, 100), word('Some', 80, 120), word('text', 140, 120)];
    const p = { page: 0, ...A4, words, segments: frame };
    expect(pageFrame(p)?.box).toEqual({ x0: 24, y0: 24, x1: 572, y1: 819 });
    expect(detectTables(p).tables).toHaveLength(0);
  });

  it('turns blank lines to fill in into underscores, and marks underlines', () => {
    const p = page([span('Name', 50, 600), span('Title', 50, 100)]);
    markLines(p, [{ x0: 80, y0: 601, x1: 400, y1: 601 }, { x0: 50, y0: 101.5, x1: 77.5, y1: 101.5 }], []);
    expect(p.spans.find((s) => s.str === 'Title')?.underline).toBe(true);
    const blank = p.spans.find((s) => /^_+$/.test(s.str));
    expect(blank?.x).toBe(80);
    expect(blank!.str.length).toBeGreaterThan(40);
  });
});

describe('boxes and shading', () => {
  const box = (x0: number, y0: number, x1: number, y1: number): Segment[] => [
    { x0, y0, x1, y1: y0 },
    { x0, y0: y1, x1, y1 },
    { x0, y0, x1: x0, y1 },
    { x0: x1, y0, x1, y1 },
  ];

  it('finds a box drawn round text and gives its paragraphs a Word border', () => {
    const words = [word('INDIAN', 120, 60), word('INSTITUTE', 170, 60), word('Website', 150, 80)];
    const p = { page: 0, ...A4, words, segments: box(100, 40, 400, 95) };
    const boxes = textBoxes(p, []);
    expect(boxes).toEqual([{ x0: 100, y0: 40, x1: 400, y1: 95 }]);
    const out = layoutPage(page([span('INDIAN INSTITUTE', 120, 60), span('Website', 150, 80)]), 11, { editable: true, boxes });
    expect(out.paras.every((q) => q.border)).toBe(true);
    const xml = new TextDecoder().decode(buildDocx([out]));
    expect(xml).toContain('<w:pBdr>');
  });

  it('shades table cells and paragraphs with the colour painted under them', () => {
    const p = page([span('Note: read carefully', 80, 300)]);
    p.fills = [{ box: { x0: 70, y0: 285, x1: 400, y1: 306 }, color: 'FFFF00' }];
    const out = layoutPage(p, 11, { editable: true });
    expect(out.paras[0].shade).toBe('FFFF00');
    expect(new TextDecoder().decode(buildDocx([out]))).toContain('w:fill="FFFF00"');
  });
});

describe('lists are not tables', () => {
  it('keeps lettered items with running text as text', () => {
    const lines = ['The Institute reserves the right to relocate the space', 'The bidder shall obtain all necessary permissions first', 'The licensee has to do the same business as mentioned'];
    // Words set as in running text: each starts a space (3pt) after the one before.
    const line = (l: string, y: number) => {
      let x = 70;
      return l.split(' ').map((t) => {
        const w = word(t, x, y);
        x = w.box.x1 + 3;
        return w;
      });
    };
    const words = lines.flatMap((l, i) => [word(`${'fgh'[i]})`, 40, 100 + i * 14), ...line(l, 100 + i * 14)]);
    expect(detectTables({ page: 0, ...A4, words, segments: [] }).tables).toHaveLength(0);
  });
});

describe('Indian-language text stored in pieces', () => {
  it('joins a piece starting with a vowel sign to the word it finishes, even out of order', () => {
    const items = [
      { x: 179, y: 41, size: 18, text: 'भारतीय' },
      { x: 243, y: 41, size: 18, text: 'ौद्योगिकी' },
      { x: 243, y: 41, size: 18, text: 'प्र' },
    ];
    const gone = joinMarkPieces(items, (t) => t, (into, p) => (into.text += p.text));
    expect(gone).toEqual([1]);
    expect(items.map((t) => t.text)).toEqual(['भारतीय', 'प्रौद्योगिकी']);
    expect(hasBrokenIndic('ौद्योगिकी')).toBe(true);
    expect(hasBrokenIndic('प्रौद्योगिकी')).toBe(false);
  });

  it('puts garbled words right from confident OCR and keeps the rest', () => {
    const items = [word('किजली', 100, 200), word('Bill', 160, 200), word('भारतीय', 100, 300)];
    const ocr = [word('बिजली', 100, 200, 10, 92), word('Bil', 160, 200, 10, 95), word('तय', 100, 300, 10, 90)];
    patchIndic(items, ocr, (w) => ({ text: w.text, box: w.box }), (w, t) => (w.text = t));
    // Replaced: it differs from what OCR reads with confidence.
    expect(items[0].text).toBe('बिजली');
    // English is never taken from OCR; a reading much shorter than the word missed part of it.
    expect(items[1].text).toBe('Bill');
    expect(items[2].text).toBe('भारतीय');
  });
});
