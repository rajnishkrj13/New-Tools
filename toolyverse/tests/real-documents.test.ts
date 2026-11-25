/**
 * Real and realistic documents, converted end to end (everything but OCR and pictures, which need
 * a browser). The tender is a 28-page government tender: web-page printouts with many bordered
 * tables, prose pages with lettered lists, forms with blanks, a letterhead box, shaded menus,
 * page borders and changing footers. The others are statements, invoices and ledgers in several
 * languages, with their contents known cell by cell.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { extractTables, type Extraction } from '../src/lib/tables/extract';
import { readDigitalPage } from '../src/lib/tables/pdf';
import { detectTables, pageFrame, textBoxes } from '../src/lib/tables/detect';
import { readPage } from '../src/lib/pdf/word/extract';
import { layoutPage, bodySize, markLines, takeRunningHeads, type PageIn } from '../src/lib/pdf/word/layout';
import { buildDocx } from '../src/lib/pdf/word/docx';
import type { PdfDoc } from '../src/lib/pdf/render';
import type { Box, Table } from '../src/lib/tables/types';

const dir = path.join(__dirname, 'fixtures');
const open = async (name: string): Promise<PdfDoc> => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return (await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(path.join(dir, name))), verbosity: 0 }).promise) as unknown as PdfDoc;
};
const tables = (doc: PdfDoc) => extractTables(doc, { ocr: 'never', languages: 'auto', mode: 'auto', join: true }, () => {});
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('documents with known tables', () => {
  const expected = JSON.parse(fs.readFileSync(path.join(dir, 'expected-tables.json'), 'utf8')) as Record<string, { rows: string[][] }[]>;
  for (const [name, want] of Object.entries(expected))
    it(`${name}: every table and every cell`, async () => {
      const got = (await tables(await open(`${name}.pdf`))).tables;
      expect(got).toHaveLength(want.length);
      want.forEach((t, k) => {
        const g = got[k].rows.map((r) => r.map((c) => (c.hidden ? '' : norm(c.text))));
        expect(g).toEqual(t.rows.map((r) => r.map(norm)));
      });
    }, 60000);
});

describe('the tender, to Excel', () => {
  let ex: Extraction;
  beforeAll(async () => {
    ex = await tables(await open('tender.pdf'));
  }, 120000);
  const on = (page: number) => ex.tables.filter((t) => t.pages[0] === page - 1);
  const size = (t: Table) => `${t.rows.length}x${t.rows[0].length}`;

  it('finds the web page tables, with two-line cells kept in one row', () => {
    expect(on(1)).toHaveLength(7);
    expect(on(2)).toHaveLength(7);
    const basic = on(1)[1];
    expect(size(basic)).toBe('9x4');
    expect(basic.rows[2][0].text).toBe('Tender Reference\nNumber');
  });

  it('finds no tables in prose, lists and justified text', () => {
    for (let p = 5; p <= 15; p++) expect(on(p), `page ${p}`).toHaveLength(0);
  });

  it('keeps the cover and notice Shop tables apart, and joins the menu across pages', () => {
    expect(on(3).map(size)).toEqual(['2x3']);
    expect(on(4).map(size)).toEqual(['2x3', '13x3']);
    const menu = on(25)[0];
    expect(menu.pages).toEqual([24, 25]);
    expect(size(menu)).toBe('81x5');
  });

  it('takes the shading: yellow heading, beige section rows across the row', () => {
    expect(on(24)[0].rows[0].map((c) => c.fill)).toEqual(['FFFF00', 'FFFF00']);
    const section = on(25)[0].rows.find((r) => r[0].text.startsWith('Section A'))!;
    expect(section[0]).toMatchObject({ colSpan: 3, bold: true, fill: 'EEECE1' });
  });
});

describe('the tender, to Word', () => {
  type P = { page: PageIn; tables: Table[]; frame?: Box; boxes: Box[] };
  const pages: P[] = [];
  // Taking the running heads off the pages changes them: done once, for all the tests below.
  let heads: ReturnType<typeof takeRunningHeads>;
  beforeAll(async () => {
    const doc = await open('tender.pdf');
    for (let i = 0; i < doc.numPages; i++) {
      const digital = await readDigitalPage(doc, i);
      const found = detectTables(digital).tables;
      const rp = await readPage(doc, i, { graphics: false, mask: found.map((t) => t.box), pictures: false });
      markLines(rp, digital.segments, found.map((t) => t.box));
      rp.fills = digital.fills;
      pages.push({ page: rp, tables: found, frame: pageFrame(digital)?.box, boxes: textBoxes(digital, found.map((t) => t.box)) });
    }
    heads = takeRunningHeads(pages.map((p) => p.page));
  }, 120000);

  it('finds the page border from page 3 on, and the letterhead box', () => {
    expect(pages.map((p) => !!p.frame)).toEqual([false, false, ...Array(26).fill(true)]);
    expect(pages[2].boxes).toHaveLength(1);
  });

  it('turns the footers into Word footers with page numbers that start where the PDF starts', () => {
    const { footers } = heads;
    expect(footers[0]).toMatchObject({ from: 0, to: 1, start: 1 });
    expect(footers[0].lines[0].at(-1)!.text).toBe('{PAGE}/2');
    expect(footers[1]).toMatchObject({ from: 2, start: 1 });
    expect(footers[1].lines[0].map((p) => p.text)).toEqual(['Tender No.: IITBBS/IMMC/Restaurant/2026-2027/02', 'Page {PAGE} of 26']);
  });

  it('writes one Word section per PDF page, with borders, shading and footers', () => {
    const body = bodySize(pages.map((p) => p.page));
    const outs = pages.map((p) => layoutPage(p.page, body, { tables: p.tables, editable: true, frame: p.frame, boxes: p.boxes }));
    const bytes = buildDocx(outs, { headers: heads.headers, footers: heads.footers });
    const xml = new TextDecoder('utf-8').decode(bytes);
    expect(xml.match(/<w:sectPr>/g)).toHaveLength(28);
    expect(xml).toContain('<w:pgBorders');
    expect(xml).toContain('w:fill="EEECE1"');
    expect(xml).toContain('<w:pBdr>');
    expect(xml).toContain('<w:pgNumType w:start="1"/>');
  });
});
