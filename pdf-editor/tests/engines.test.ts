import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, StandardFonts, decodePDFRawStream } from 'pdf-lib';
import { getShaper } from '../src/engines/TextShaper';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { EditorObject, HighlightObject, ImageAsset } from '../src/types/objects';
import type { TextLine } from '../src/types/text';
import { markShapes, marksForBox, rotateMark } from '../src/engines/TextHighlighter';
import { analyzeImageOps, removeImageOps } from '../src/engines/PdfImages';
import type { Matrix, PageInfo } from '../src/types/pdf';
import { applyMatrix, computeViewTransform, invert, makePageInfo, mul, viewRectToPdfRect } from '../src/engines/CoordinateMapper';
import { exportPdf, ExportError, pageInfoFromPdfLib } from '../src/engines/PdfExporter';
import { buildLines, readRawItems } from '../src/engines/PdfTextExtractor';
import { applyRangeEdit, createTextEdit, isNoopEdit, layoutTextEdit } from '../src/engines/TextEditLayout';
import { groupParagraphs, reflowFrom, wrapText, type FlowLine } from '../src/engines/TextReflowEngine';
import { emptyHistory, pushHistory, redoHistory, undoHistory } from '../src/store/historyStore';
import { setMeasureImpl } from '../src/utils/fontUtils';
import { setBundledFontLoader } from '../src/engines/FontManager';
import { analyzeOperatorList, removeGlyphsFromContent, scanShowOps } from '../src/engines/TextRemover';

const NOTO = join(__dirname, '..', 'node_modules', '@expo-google-fonts', 'noto-sans');
const NOTO_FILES = ['400Regular/NotoSans_400Regular', '700Bold/NotoSans_700Bold', '400Regular_Italic/NotoSans_400Regular_Italic', '700Bold_Italic/NotoSans_700Bold_Italic'];
const NOTO_REGULAR = new Uint8Array(readFileSync(join(NOTO, `${NOTO_FILES[0]}.ttf`)));
const setBundledFontLoaderBytes = async () => NOTO_REGULAR;
setBundledFontLoader(async (bold, italic) => new Uint8Array(readFileSync(join(NOTO, `${NOTO_FILES[(bold ? 1 : 0) + (italic ? 2 : 0)]}.ttf`))));

const SAMPLE = join(__dirname, '..', 'test-assets', 'sample.pdf');
// 1x1 red PNG
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

let helvetica: Awaited<ReturnType<PDFDocument['embedFont']>>;

beforeAll(async () => {
  // Node has no canvas: measure with real Helvetica metrics instead.
  const d = await PDFDocument.create();
  helvetica = await d.embedFont(StandardFonts.Helvetica);
  setMeasureImpl((text, _font, size) => {
    try {
      return helvetica.widthOfTextAtSize(text, size);
    } catch {
      return text.length * size * 0.5;
    }
  });
});

async function openWithPdfJs(bytes: Uint8Array) {
  return pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false, verbosity: 0 }).promise;
}

/** Text items of a page in view space, straight from PDF.js (independent of our mapper). */
async function viewItems(doc: any, pageNumber: number) {
  const page = await doc.getPage(pageNumber);
  const vp = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  return {
    vp,
    items: (content.items as any[])
      .filter((i) => i.str?.trim())
      .map((i) => {
        const m = mul(vp.transform as Matrix, i.transform as Matrix);
        return { str: i.str as string, x: m[4], baseline: m[5], width: i.width as number, angle: Math.atan2(m[1], m[0]) };
      }),
  };
}

describe('CoordinateMapper', () => {
  it('maps the corners of a cropped box to the view rectangle for every rotation', () => {
    const box: [number, number, number, number] = [30, 40, 565, 800];
    for (const rotation of [0, 90, 180, 270]) {
      const { transform, width, height } = computeViewTransform(box, rotation);
      const swapped = rotation % 180 !== 0;
      expect(width).toBe(swapped ? 760 : 535);
      expect(height).toBe(swapped ? 535 : 760);
      const corners = [[30, 40], [565, 40], [565, 800], [30, 800]].map(([x, y]) => applyMatrix(transform, x, y));
      for (const [x, y] of corners) {
        expect(Math.min(Math.abs(x), Math.abs(x - width))).toBeCloseTo(0, 6);
        expect(Math.min(Math.abs(y), Math.abs(y - height))).toBeCloseTo(0, 6);
      }
    }
    // Unrotated: the top-left of the visible box is the view origin.
    const [x, y] = applyMatrix(computeViewTransform(box, 0).transform, 30, 800);
    expect([x, y]).toEqual([0, 0]);
  });

  it('round-trips view <-> PDF coordinates', () => {
    const { transform } = computeViewTransform([0, 0, 612, 792], 90);
    const [px, py] = applyMatrix(invert(transform), 100, 50);
    const [vx, vy] = applyMatrix(transform, px, py);
    expect(vx).toBeCloseTo(100, 6);
    expect(vy).toBeCloseTo(50, 6);
  });

  it('reduces to the simple flip formula on an unrotated page', () => {
    const page: PageInfo = makePageInfo({ id: 'p', source: 'main', srcIndex: 0, viewBox: [0, 0, 612, 792], userUnit: 1, baseRotation: 0 }, 0);
    const r = viewRectToPdfRect(page, { x: 100, y: 200, width: 50, height: 30 });
    expect(r.x).toBeCloseTo(100);
    expect(r.y).toBeCloseTo(792 - (200 + 30));
    expect(r.width).toBeCloseTo(50);
    expect(r.height).toBeCloseTo(30);
  });
});

describe('TextReflowEngine', () => {
  const measure = (t: string) => t.length * 10;
  const width = () => 200; // 20 characters per line
  const para: FlowLine[] = [
    { text: 'alpha beta gamma', soft: true },
    { text: 'delta epsilon zeta', soft: true },
    { text: 'eta theta', soft: false },
    { text: 'Signature: ______', soft: false },
  ];

  it('pushes overflowing words down and adds a line when text grows', () => {
    const lines = para.map((l) => ({ ...l }));
    lines[0].text = 'alpha beta INSERTED gamma';
    const out = reflowFrom(lines, 0, width, measure);
    expect(out.map((l) => l.text)).toEqual(['alpha beta INSERTED', 'gamma delta epsilon', 'zeta eta theta', 'Signature: ______']);
    out.forEach((l) => expect(measure(l.text)).toBeLessThanOrEqual(206));
  });

  it('adds a new line when the paragraph no longer fits', () => {
    const lines = para.map((l) => ({ ...l }));
    lines[0].text = 'alpha beta gamma plus several more inserted words here';
    const out = reflowFrom(lines, 0, width, measure);
    expect(out.length).toBeGreaterThan(para.length);
    expect(out[out.length - 1].text).toBe('Signature: ______');
    expect(out.map((l) => l.text).join(' ')).toContain('inserted words here delta');
  });

  it('pulls words up and removes empty lines when text is deleted', () => {
    const lines = para.map((l) => ({ ...l }));
    lines[0].text = 'alpha';
    const out = reflowFrom(lines, 0, width, measure);
    expect(out.map((l) => l.text)).toEqual(['alpha delta epsilon', 'zeta eta theta', 'Signature: ______']);
  });

  it('removes a line that was emptied', () => {
    const lines = para.map((l) => ({ ...l }));
    lines[3].text = '';
    expect(reflowFrom(lines, 3, width, measure).map((l) => l.text)).toEqual(para.slice(0, 3).map((l) => l.text));
  });

  it('never merges across a hard line end', () => {
    const lines = para.map((l) => ({ ...l }));
    lines[2].text = 'eta';
    const out = reflowFrom(lines, 2, width, measure);
    expect(out.map((l) => l.text)).toEqual(['alpha beta gamma', 'delta epsilon zeta', 'eta', 'Signature: ______']);
  });

  it('leaves the rest of the paragraph untouched after a same-length word swap', () => {
    const lines = para.map((l) => ({ ...l }));
    lines[0].text = 'alpha BETA gamma';
    const out = reflowFrom(lines, 0, width, measure);
    expect(out[1]).toBe(lines[1]);
    expect(out[2]).toBe(lines[2]);
  });

  it('wraps free text boxes and keeps explicit newlines', () => {
    expect(wrapText('one two three four\nfive', 80, measure)).toEqual(['one two', 'three', 'four', 'five']);
  });
});

describe('history', () => {
  it('undoes and redoes to the exact previous snapshots', () => {
    const a = ['a'];
    const b = ['a', 'b'];
    const c = ['a', 'b', 'c'];
    let h = emptyHistory<string[]>();
    h = pushHistory(h, a, null, 0);
    h = pushHistory(h, b, null, 10);
    const u1 = undoHistory(h, c)!;
    expect(u1.state).toBe(b);
    const u2 = undoHistory(u1.history, u1.state)!;
    expect(u2.state).toBe(a);
    const r1 = redoHistory(u2.history, u2.state)!;
    expect(r1.state).toBe(b);
    const r2 = redoHistory(r1.history, r1.state)!;
    expect(r2.state).toBe(c);
    expect(redoHistory(r2.history, r2.state)).toBeNull();
  });

  it('merges rapid changes of the same control into one step', () => {
    let h = emptyHistory<number>();
    h = pushHistory(h, 0, 'obj:opacity', 1000);
    h = pushHistory(h, 1, 'obj:opacity', 1200);
    h = pushHistory(h, 2, 'obj:opacity', 1400);
    expect(h.past).toEqual([0]);
    h = pushHistory(h, 3, 'obj:opacity', 5000);
    expect(h.past).toEqual([0, 3]);
  });
});

describe.runIf(existsSync(SAMPLE))('PdfExporter on test-assets/sample.pdf', () => {
  let bytes: Uint8Array;
  let pages: PageInfo[];
  const assets: Record<string, ImageAsset> = { img: { id: 'img', name: 'dot.png', mime: 'image/png', bytes: PNG, url: '', width: 1, height: 1 } };
  const text = (id: string, pageIndex: number, x: number, y: number, value: string, rotation = 0): EditorObject => ({
    id, type: 'text', pageIndex, x, y, width: 300, rotation, text: value,
    fontFamily: 'Helvetica', fontSize: 14, bold: false, italic: false, underline: false, color: '#aa0000', align: 'left', opacity: 1,
  });

  beforeAll(async () => {
    bytes = new Uint8Array(readFileSync(SAMPLE));
    const doc = await PDFDocument.load(bytes);
    pages = doc.getPages().map((p, i) => pageInfoFromPdfLib(p, i));
  });

  it('derives the same page geometry as PDF.js (rotation and CropBox included)', async () => {
    const doc = await openWithPdfJs(bytes);
    expect(doc.numPages).toBe(5);
    for (let i = 0; i < 5; i++) {
      const vp = (await doc.getPage(i + 1)).getViewport({ scale: 1 });
      expect(pages[i].width).toBeCloseTo(vp.width, 4);
      expect(pages[i].height).toBeCloseTo(vp.height, 4);
      pages[i].viewTransform.forEach((v, k) => expect(v).toBeCloseTo(vp.transform[k], 4));
    }
    expect(pages[2].width).toBeGreaterThan(pages[2].height); // landscape
    expect(pages[3].rotation).toBe(90);
  });

  it('writes text at the exact view position on portrait, landscape, rotated and cropped pages', async () => {
    const objects: EditorObject[] = [
      text('t0', 0, 100, 300, 'ADDED ON PAGE ONE'),
      text('t2', 2, 400, 200, 'ADDED ON LANDSCAPE'),
      text('t3', 3, 120, 380, 'ADDED ON ROTATED'),
      text('t4', 4, 80, 400, 'ADDED ON CROPPED'),
      { id: 'w', type: 'whiteout', pageIndex: 0, x: 72, y: 60, width: 200, height: 30, fill: '#ffffff' },
      { id: 'r', type: 'rect', pageIndex: 2, x: 50, y: 50, width: 80, height: 40, rotation: 15, fill: '#ffee00', stroke: '#000000', strokeWidth: 2, opacity: 0.8 },
      { id: 'e', type: 'ellipse', pageIndex: 3, x: 50, y: 50, width: 80, height: 40, rotation: 0, fill: null, stroke: '#0000ff', strokeWidth: 1, opacity: 1 },
      { id: 'a', type: 'arrow', pageIndex: 1, points: [100, 100, 220, 160], stroke: '#ff0000', strokeWidth: 2, opacity: 1 },
      { id: 'p', type: 'path', pageIndex: 1, points: [100, 300, 120, 320, 150, 310, 180, 340], stroke: '#000000', strokeWidth: 1.5, opacity: 1 },
      { id: 'i', type: 'image', pageIndex: 4, x: 200, y: 200, width: 60, height: 40, rotation: 30, opacity: 1, assetId: 'img', keepRatio: true },
    ];
    const result = await exportPdf({ bytes, pages, objects, assets });
    expect(result.pagesModified).toBe(5);
    expect(result.objectsWritten).toBe(objects.length);

    const out = await openWithPdfJs(result.bytes);
    expect(out.numPages).toBe(5);
    const expected: Record<number, [string, number, number]> = {
      1: ['ADDED ON PAGE ONE', 100, 300],
      3: ['ADDED ON LANDSCAPE', 400, 200],
      4: ['ADDED ON ROTATED', 120, 380],
      5: ['ADDED ON CROPPED', 80, 400],
    };
    for (const [pageNo, [str, x, top]] of Object.entries(expected)) {
      const { items, vp } = await viewItems(out, Number(pageNo));
      const hit = items.find((i) => i.str === str);
      expect(hit, `"${str}" on page ${pageNo}`).toBeTruthy();
      expect(hit!.x).toBeCloseTo(x, 1);
      expect(hit!.baseline).toBeCloseTo(top + 14 * 0.94, 1); // first baseline of a 14pt box
      expect(Math.abs(hit!.angle)).toBeLessThan(0.001); // reads horizontally in the viewer
      // page geometry is preserved
      expect(vp.width).toBeCloseTo(pages[Number(pageNo) - 1].width, 4);
      expect(vp.height).toBeCloseTo(pages[Number(pageNo) - 1].height, 4);
    }
    // Untouched original content is still there.
    const first = await viewItems(out, 1);
    expect(first.items.some((i) => i.str.includes('Quarterly Report'))).toBe(true);
  });

  it('edits existing text: replaces a word, reflows the paragraph and exports it', async () => {
    const doc = await openWithPdfJs(bytes);
    const page = await doc.getPage(1);
    const { items } = await readRawItems(page as any, pages[0]);
    const lines = buildLines(items, 0);
    const paragraphs = groupParagraphs(lines, 0, pages[0].height);
    const para = paragraphs.find((p) => p.lines[0].text.startsWith('The editor keeps'))!;
    expect(para.lines.length).toBeGreaterThanOrEqual(3);
    expect(para.soft.slice(0, -1).every(Boolean)).toBe(true);

    const base = createTextEdit(para, { background: '#ffffff', text: '#000000' }, 'edit1');
    expect(isNoopEdit(base)).toBe(true);
    expect(base.fontMatch).toBe('standard');

    // Word replacement of equal width class: only that line changes.
    const word = 'original';
    const at = para.lines[0].text.indexOf(word);
    const swapped = applyRangeEdit(base, 0, at, at + word.length, 'existing');
    expect(swapped.lines.length).toBe(para.lines.length);
    expect(swapped.lines.slice(2)).toEqual(base.lines.slice(2));
    const swappedLayout = layoutTextEdit(swapped);
    expect(swappedLayout.masks.length).toBeLessThanOrEqual(2);
    // The unchanged start of the line is kept as original glyphs: the mask starts at the word.
    expect(swappedLayout.masks[0].x).toBeGreaterThan(para.lines[0].x + 20);

    // Growing the first line pushes words down and adds a line.
    const grown = applyRangeEdit(
      base, 0, at, at + word.length,
      'original and now considerably longer than before, with enough additional words in this sentence to need a whole extra line at the end of the paragraph, so it really',
    );
    expect(grown.lines.length).toBeGreaterThan(para.lines.length);
    const layout = layoutTextEdit(grown);
    const baselines = layout.slots.map((s) => s.baseline);
    for (let i = 1; i < baselines.length; i++) expect(baselines[i] - baselines[i - 1]).toBeGreaterThan(10); // no overlap
    layout.runs.forEach((r) => expect(r.x + r.width).toBeLessThanOrEqual(grown.maxRight + 1));

    // Deleting text shortens the paragraph again.
    const shrunk = applyRangeEdit(base, 1, 0, base.lines[1].length, '');
    expect(shrunk.lines.length).toBe(para.lines.length - 1);

    const result = await exportPdf({ bytes, pages, objects: [grown], assets: {} });
    const out = await openWithPdfJs(result.bytes);
    const { items: after } = await viewItems(out, 1);
    const all = after.map((i) => i.str).join(' ');
    expect(all).toContain('considerably longer than before');
    const run = after.find((i) => i.str.includes('considerably'))!;
    const expectedRun = layout.runs.find((r) => r.text.includes('considerably'))!;
    expect(run.x).toBeCloseTo(expectedRun.x, 0);
    expect(run.baseline).toBeCloseTo(expectedRun.baseline, 1);
    expect(Math.abs(run.width - expectedRun.width)).toBeLessThan(1.5); // fitted to the on-screen width
  });

  it('refuses to silently drop characters no font can draw', async () => {
    const objects = [text('bad', 0, 100, 100, 'Price ₹ 500 日本')];
    await expect(exportPdf({ bytes, pages, objects, assets: {} })).rejects.toBeInstanceOf(ExportError);
  });

  it('draws characters outside the standard fonts with the bundled Unicode font', async () => {
    const objects = [
      text('u1', 0, 100, 300, 'Total ₹ 1,500 paid'),
      text('u2', 0, 100, 340, 'Привет, Ελληνικά, naïve café'),
      { ...text('u3', 0, 100, 380, 'नमस्ते ₹ 250'), fontFamily: 'NotoSans' } as EditorObject,
    ];
    const result = await exportPdf({ bytes, pages, objects, assets: {} });
    expect(result.warnings.join(' ')).toMatch(/Noto Sans/);
    const out = await openWithPdfJs(result.bytes);
    const { items } = await viewItems(out, 1);
    const all = items.map((i) => i.str).join('|');
    expect(all).toContain('₹');
    expect(all).toContain('Total');
    expect(all).toContain('1,500 paid');
    expect(all).toContain('Привет');
    expect(all).toContain('Ελληνικά');
    expect(all).toContain('café');
    // Pieces drawn by two fonts stay on one baseline, in reading order.
    const total = items.find((i) => i.str.trim() === 'Total')!;
    const rupee = items.find((i) => i.str.includes('₹') && Math.abs(i.baseline - total.baseline) < 0.5)!;
    const paid = items.find((i) => i.str.includes('paid'))!;
    expect(rupee.x).toBeGreaterThan(total.x);
    expect(paid.x).toBeGreaterThan(rupee.x);
    expect(paid.baseline).toBeCloseTo(total.baseline, 1);
  });

  it('shapes Hindi with HarfBuzz: conjuncts form and vowel signs are reordered', async () => {
    const shaper = (await getShaper())!;
    expect(shaper).toBeTruthy();
    const font = await setBundledFontLoaderBytes();
    const glyphOf = (ch: string) => shaper.shape(font, ch).glyphs[0].gid;
    // "कि": the vowel sign (typed second) must be drawn before the consonant.
    const ki = shaper.shape(font, 'कि');
    // (The font may pick a width variant of the sign, so only the consonant's glyph is fixed.)
    expect(ki.glyphs.length).toBe(2);
    expect(ki.glyphs[1].gid).toBe(glyphOf('क'));
    expect(ki.glyphs[0].gid).not.toBe(glyphOf('क'));
    expect(ki.glyphs[0].x).toBeLessThan(ki.glyphs[1].x);
    // "स्त": three characters (sa + virama + ta) join into a conjunct, not three separate glyphs.
    const sta = shaper.shape(font, 'स्त');
    expect(sta.glyphs.length).toBe(2);
    expect(sta.glyphs.map((g) => g.gid)).not.toContain(glyphOf('्'));
    // Positions advance left to right and the total width is sensible.
    const word = shaper.shape(font, 'नमस्ते दुनिया');
    expect(word.advance).toBeGreaterThan(3);
    expect(word.glyphs.length).toBeLessThan([...'नमस्ते दुनिया'].length);

    const objects = [
      { ...text('h1', 0, 100, 300, 'नमस्ते दुनिया ₹ 250'), fontFamily: 'NotoSans' } as EditorObject,
      text('h2', 0, 100, 340, 'Amount कुल राशि 500'), // Helvetica chosen: Hindi falls back to Noto Sans and is shaped
    ];
    const result = await exportPdf({ bytes, pages, objects, assets: {} });
    expect(result.shapedRuns).toBe(2);
    expect(result.warnings.join(' ')).not.toMatch(/could not be shaped/);
    // The file still opens, keeps its pages, and the Latin part of the mixed line is intact.
    const out = await openWithPdfJs(result.bytes);
    const { items } = await viewItems(out, 1);
    expect(items.some((i) => i.str.includes('Amount'))).toBe(true);
    // The shaped glyphs are in the page content as positioned glyph ids with the logical text attached.
    const doc = await PDFDocument.load(result.bytes);
    const streams = doc.getPage(0).node.Contents() as any;
    const content = streams
      .asArray()
      .map((ref: any) => new TextDecoder().decode(decodePDFRawStream(doc.context.lookup(ref) as any).decode()))
      .join('\n');
    expect(content).toContain('/ActualText');
    expect(content).toContain(`<${glyphOf('न').toString(16).padStart(4, '0')}> Tj`);
  });

  it('applies page tools on export: delete, reorder, rotate, blank page, pages of another PDF', async () => {
    // A second document to take a page from.
    const other = await PDFDocument.create();
    const f = await other.embedFont(StandardFonts.Helvetica);
    other.addPage([400, 300]).drawText('FROM OTHER FILE', { x: 40, y: 150, size: 20, font: f });
    other.addPage([400, 300]).drawText('NOT WANTED', { x: 40, y: 150, size: 20, font: f });
    const otherBytes = await other.save();
    const added = makePageInfo({ id: 'x:0', source: 'x', srcIndex: 0, viewBox: [0, 0, 400, 300], userUnit: 1, baseRotation: 0 }, 0);
    const blank = makePageInfo({ id: 'b', source: 'blank', srcIndex: 0, viewBox: [0, 0, 612, 792], userUnit: 1, baseRotation: 0 }, 0);

    // New order: page 3 (landscape, rotated right), page 1, blank, added page, page 5. Pages 2 and 4 are deleted.
    const order = [makePageInfo(pages[2], 0, 90), pages[0], blank, added, pages[4]].map((p, i) => ({ ...p, index: i }));
    const objects: EditorObject[] = [
      text('s0', 0, 60, 100, 'ON ROTATED LANDSCAPE'),
      text('s2', 2, 100, 200, 'ON BLANK PAGE'),
      text('s3', 3, 40, 60, 'ON ADDED PAGE'),
    ];
    const result = await exportPdf({ bytes, pages: order, objects, assets: {}, sources: { x: otherBytes } });
    expect(result.structureChanged).toBe(true);

    const out = await openWithPdfJs(result.bytes);
    expect(out.numPages).toBe(5);
    const texts: string[] = [];
    for (let n = 1; n <= 5; n++) {
      const { items, vp } = await viewItems(out, n);
      texts.push(items.map((i) => i.str).join('|'));
      expect(vp.width).toBeCloseTo(order[n - 1].width, 3);
      expect(vp.height).toBeCloseTo(order[n - 1].height, 3);
    }
    expect(texts[0]).toContain('Landscape Overview');
    expect(texts[1]).toContain('Quarterly Report');
    expect(texts[2]).toBe('ON BLANK PAGE');
    expect(texts[3]).toContain('FROM OTHER FILE');
    expect(texts[3]).toContain('ON ADDED PAGE');
    expect(texts[4]).toContain('Cropped Page');
    // Deleted pages are gone from the document, including their text.
    const everything = texts.join('|');
    expect(everything).not.toContain('Terms and Conditions');
    expect(everything).not.toContain('Rotated Page Heading');
    expect(everything).not.toContain('NOT WANTED');
    expect(new TextDecoder('latin1').decode(result.bytes)).not.toContain('NOT WANTED');

    // The landscape page is now portrait, and text added in the editor reads upright at its place.
    expect(order[0].width).toBeCloseTo(612, 3);
    const first = await viewItems(out, 1);
    const stamp = first.items.find((i) => i.str === 'ON ROTATED LANDSCAPE')!;
    expect(stamp.x).toBeCloseTo(60, 1);
    expect(stamp.baseline).toBeCloseTo(100 + 14 * 0.94, 1);
    expect(Math.abs(stamp.angle)).toBeLessThan(0.001);
    // Original text of that page is now sideways on screen (it was rotated with the page).
    const heading = first.items.find((i) => i.str.includes('Landscape Overview'))!;
    expect(Math.abs(Math.abs(heading.angle) - Math.PI / 2)).toBeLessThan(0.001);

    // An unchanged page list leaves the structure alone.
    const same = await exportPdf({ bytes, pages, objects: [], assets: {} });
    expect(same.structureChanged).toBe(false);
  });

  it('deletes edited original text from the file instead of covering it', async () => {
    const src = await openWithPdfJs(bytes);
    const page = await src.getPage(1);
    const { items } = await readRawItems(page as any, pages[0]);
    const paragraphs = groupParagraphs(buildLines(items, 0), 0, pages[0].height);
    const analyzeText = async (pageIndex: number) => {
      const p: any = await src.getPage(pageIndex + 1);
      return analyzeOperatorList(await p.getOperatorList(), pdfjs.OPS as any, pages[pageIndex].viewTransform, () => null);
    };

    // 1. Replace the invoice number (the start of the line stays as original glyphs).
    const invoice = paragraphs.find((p) => p.lines[0].text.startsWith('Invoice Number'))!;
    const at = invoice.lines[0].text.indexOf('INV-2026-001');
    const e1 = applyRangeEdit(createTextEdit(invoice, { background: '#ffffff', text: '#000000' }, 'e1'), 0, at, at + 12, 'INV-2026-777');
    // 2. Delete the second line of the first paragraph.
    const para = paragraphs.find((p) => p.lines[0].text.startsWith('The editor keeps'))!;
    const gone = para.lines[1].text;
    const e2 = applyRangeEdit(createTextEdit(para, { background: '#ffffff', text: '#000000' }, 'e2'), 1, 0, gone.length, '');

    const before = (await viewItems(src, 1)).items;
    const result = await exportPdf({ bytes, pages, objects: [e1, e2], assets: {}, analyzeText });
    expect(result.removedGlyphs).toBeGreaterThan(50);
    expect(result.warnings.join(' ')).not.toMatch(/covered instead/);

    const out = await openWithPdfJs(result.bytes);
    const after = (await viewItems(out, 1)).items;
    const all = after.map((i) => i.str).join('|');
    expect(all).not.toContain('INV-2026-001');
    expect(all).toContain('INV-2026-777');
    expect(all).toContain('Invoice Number:');
    expect(all).not.toContain(gone.slice(0, 30));
    // Everything that was not edited is still exactly where it was.
    for (const text of ['Quarterly Report', 'Total due: $1,250.00', 'Page 1 - portrait', para.lines[0].text]) {
      const a = before.find((i) => i.str === text)!;
      const b = after.find((i) => i.str === text)!;
      expect(b, text).toBeTruthy();
      expect(b.x).toBeCloseTo(a.x, 3);
      expect(b.baseline).toBeCloseTo(a.baseline, 3);
    }
    // Without the glyph map the exporter still works, by covering.
    const covered = await exportPdf({ bytes, pages, objects: [e1], assets: {} });
    expect(covered.removedGlyphs).toBe(0);
    expect(covered.warnings.join(' ')).toMatch(/covered instead/);
  });

  it('removes glyphs from Tj, TJ, quote operators and keeps the pen position', () => {
    const enc = new TextEncoder();
    const stream = enc.encode("BT /F1 10 Tf 10 20 Td (Hello World) Tj [(AB) -50 (CD)] TJ (keep \\(this\\)) ' 1 2 (xy) \" ET");
    const ops = scanShowOps(stream);
    expect(ops.map((o) => o.kind)).toEqual(['Tj', 'TJ', "'", '"']);
    expect(new TextDecoder().decode(ops[2].elems[0] as Uint8Array)).toBe('keep (this)');
    const glyph = (x: number) => ({ x, y: 5, comp: -500 });
    const info = [
      { editable: true, glyphs: [...'Hello World'].map((_, k) => glyph(k)) },
      { editable: true, glyphs: [100, 101, 102, 103].map(glyph) },
      { editable: true, glyphs: [...'keep (this)'].map((_, k) => glyph(200 + k)) },
      { editable: true, glyphs: [300, 301].map(glyph) },
    ];
    // Remove "World" (x 6..10), "B" and "C" (x 101..102) and "x" (x 300).
    const res = removeGlyphsFromContent(stream, info, [
      { x: 5.5, y: 0, width: 5, height: 10 },
      { x: 100.5, y: 0, width: 2, height: 10 },
      { x: 299.5, y: 0, width: 1, height: 10 },
    ]);
    if ('error' in res) throw new Error(res.error);
    expect(res.removedPerRect).toEqual([5, 2, 1]);
    const text = new TextDecoder().decode(res.bytes);
    expect(text).toContain('[<48656c6c6f20> -2500] TJ'); // "Hello " then the width of "World"
    expect(text).toContain('[<41> -1050 <44>] TJ'); // A, (B + -50 + C), D
    expect(text).toContain("(keep \\(this\\)) '"); // untouched operator is byte-identical
    expect(text).toContain('1 Tw 2 Tc T* [-500 <79>] TJ');
    // A glyph map that does not match the stream is refused.
    expect('error' in removeGlyphsFromContent(stream, info.slice(1), [])).toBe(true);
  });

  it('reports broken objects instead of exporting without them', async () => {
    const objects: EditorObject[] = [{ id: 'i', type: 'image', pageIndex: 0, x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1, assetId: 'missing', keepRatio: true }];
    await expect(exportPdf({ bytes, pages, objects, assets: {} })).rejects.toThrow(/cannot be exported/);
  });

  it('flattens a page for secure redaction so its text is gone', async () => {
    const objects: EditorObject[] = [{ id: 'x', type: 'redact', pageIndex: 1, x: 72, y: 60, width: 300, height: 40, fill: '#000000' }];
    const result = await exportPdf({ bytes, pages, objects, assets: {}, rasterizePage: async () => PNG });
    expect(result.flattenedPages).toEqual([1]);
    const out = await openWithPdfJs(result.bytes);
    expect((await viewItems(out, 2)).items.length).toBe(0);
    expect((await viewItems(out, 1)).items.length).toBeGreaterThan(0);
    const vp = (await out.getPage(2)).getViewport({ scale: 1 });
    expect(vp.width).toBeCloseTo(pages[1].width, 3);
  });
});

describe('TextHighlighter', () => {
  const line = (id: string, top: number, text: string, x = 100): TextLine => ({
    id, pageIndex: 0, text, x, right: x + text.length * 10, baseline: top + 10, top, bottom: top + 12, fontSize: 12,
    fontName: 'f', generic: 'sans-serif', segments: [{ str: text, x, width: text.length * 10, start: 0 }], reliableChars: true,
    charX: Array.from({ length: text.length + 1 }, (_, k) => x + k * 10),
  });
  const lines = [line('a', 100, 'Hello world'), line('b', 120, 'Second line'), line('c', 300, 'Far away')];

  it('marks only the characters and lines the dragged box covers', () => {
    // Covers "world" on the first line and "line" on the second; the third line is out of reach.
    const marks = marksForBox(lines, { x: 158, y: 104, width: 60, height: 24 });
    expect(marks).toHaveLength(2);
    expect(marks[0]).toMatchObject({ x: 160, y: 100, width: 50, height: 12, base: 10 });
    expect(marks[1]).toMatchObject({ x: 170, width: 40, y: 120 });
    // A thin drag along one line marks that line only.
    expect(marksForBox(lines, { x: 100, y: 105, width: 40, height: 1 })).toHaveLength(1);
    expect(marksForBox(lines, { x: 400, y: 100, width: 50, height: 12 })).toHaveLength(0);
  });

  it('draws underline below and strikethrough above the baseline, inside the line band', () => {
    const rects = marksForBox(lines, { x: 100, y: 100, width: 200, height: 12 });
    const [hl] = markShapes({ mode: 'highlight', rects });
    const [ul] = markShapes({ mode: 'underline', rects });
    const [st] = markShapes({ mode: 'strike', rects });
    expect(hl).toEqual({ x: 100, y: 100, width: 110, height: 12 });
    expect(ul.y).toBeGreaterThan(110);
    expect(ul.y + ul.height).toBeLessThanOrEqual(112.5);
    expect(st.y).toBeGreaterThan(100);
    expect(st.y + st.height).toBeLessThan(110);
  });

  it.runIf(existsSync(SAMPLE))('exports a highlight with multiply blending and keeps the text under it', async () => {
    const bytes = new Uint8Array(readFileSync(SAMPLE));
    const src = await PDFDocument.load(bytes);
    const pages = src.getPages().map((p, i) => pageInfoFromPdfLib(p, i));
    const rects = [{ x: 72, y: 60, width: 200, height: 20, base: 16 }];
    const objects: EditorObject[] = [
      { id: 'h', type: 'highlight', pageIndex: 0, mode: 'highlight', rects, color: '#ffe14d', opacity: 0.4 },
      { id: 'u', type: 'highlight', pageIndex: 3, mode: 'underline', rects, color: '#e11d48', opacity: 1 },
    ];
    const result = await exportPdf({ bytes, pages, objects, assets: {} });
    expect(result.objectsWritten).toBe(2);
    const out = await PDFDocument.load(result.bytes);
    const res = out.getPage(0).node.Resources()!.toString();
    expect(res).toContain('/BM /Multiply');
    const first = await viewItems(await openWithPdfJs(result.bytes), 1);
    expect(first.items.some((i) => i.str.includes('Quarterly Report'))).toBe(true);
    // Rotating the page turns an underline into its painted shape at the new position.
    const turned = rotateMark(objects[1] as HighlightObject, [0, 1, -1, 0, 500, 0]);
    expect(turned.mode).toBe('highlight');
    expect(turned.rects[0].width).toBeLessThan(2);
    expect(turned.rects[0].height).toBeCloseTo(200, 5);
  });
});

describe('PdfImages', () => {
  const OPS = pdfjs.OPS as unknown as Record<string, number>;
  async function withPictures() {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const image = await doc.embedPng(PNG);
    const page = doc.addPage([612, 792]);
    page.drawText('Before the pictures', { x: 72, y: 720, size: 12, font });
    page.drawImage(image, { x: 72, y: 500, width: 240, height: 150 });
    page.drawImage(image, { x: 380, y: 520, width: 130, height: 130 });
    page.drawText('After the pictures', { x: 72, y: 400, size: 12, font });
    const bytes = await doc.save();
    const pages = (await PDFDocument.load(bytes)).getPages().map((p, i) => pageInfoFromPdfLib(p, i));
    return { bytes, pages };
  }
  const paintedImages = async (bytes: Uint8Array) => {
    const page = await (await openWithPdfJs(bytes)).getPage(1);
    const list = await page.getOperatorList();
    return { list, count: Array.from(list.fnArray).filter((fn) => fn === OPS.paintImageXObject).length };
  };

  it('finds the pictures of a page with their place on screen', async () => {
    const { bytes, pages } = await withPictures();
    const found = analyzeImageOps((await paintedImages(bytes)).list, OPS, pages[0].viewTransform);
    expect(found).toHaveLength(2);
    expect(found[0]).toMatchObject({ key: 't0', seq: 0, total: 2 });
    // PDF y = 500..650 on a 792pt page is 142..292 from the top.
    expect(found[0].x).toBeCloseTo(72, 3);
    expect(found[0].y).toBeCloseTo(142, 3);
    expect(found[0].width).toBeCloseTo(240, 3);
    expect(found[0].height).toBeCloseTo(150, 3);
    expect(Math.abs(found[0].rotation)).toBeLessThan(0.001);
    expect(found[1]).toMatchObject({ seq: 1, total: 2 });
    expect(found[1].x).toBeCloseTo(380, 3);
  });

  it('takes a moved picture out of the page and draws it at its new place', async () => {
    const { bytes, pages } = await withPictures();
    const [first] = analyzeImageOps((await paintedImages(bytes)).list, OPS, pages[0].viewTransform);
    const assets: Record<string, ImageAsset> = { img: { id: 'img', name: 'dot.png', mime: 'image/png', bytes: PNG, url: '', width: 1, height: 1 } };
    const box = { x: first.x, y: first.y, width: first.width, height: first.height, rotation: 0 };
    const objects: EditorObject[] = [
      { id: 'cut', type: 'imagecut', pageIndex: 0, ...box, fill: '#ffffff', key: first.key, seq: first.seq, total: first.total },
      { id: 'moved', type: 'image', pageIndex: 0, ...box, x: 300, y: 600, width: 120, height: 75, opacity: 1, assetId: 'img', keepRatio: true },
    ];
    const result = await exportPdf({ bytes, pages, objects, assets });
    expect(result.removedImages).toBe(1);
    expect(result.warnings.join(' ')).not.toContain('covered');
    const out = await paintedImages(result.bytes);
    expect(out.count).toBe(2); // the second original and the moved copy
    const placed = analyzeImageOps(out.list, OPS, pages[0].viewTransform);
    expect(placed.some((p) => Math.abs(p.x - 72) < 1 && Math.abs(p.y - 142) < 1)).toBe(false);
    expect(placed.some((p) => Math.abs(p.x - 380) < 1)).toBe(true);
    const text = await viewItems(await openWithPdfJs(result.bytes), 1);
    expect(text.items.map((i) => i.str)).toEqual(expect.arrayContaining(['Before the pictures', 'After the pictures']));

    // Deleting = the cut alone. A cut that no longer matches the page is covered, never guessed.
    const deleted = await exportPdf({ bytes, pages, objects: [objects[0]], assets });
    expect((await paintedImages(deleted.bytes)).count).toBe(1);
    const stale = await exportPdf({ bytes, pages, objects: [{ ...objects[0], total: 5 } as EditorObject], assets });
    expect(stale.removedImages).toBe(0);
    expect((await paintedImages(stale.bytes)).count).toBe(2);
    expect(stale.warnings.join(' ')).toContain('covered');
  });

  it('finds a picture inside a form XObject and covers it on export', async () => {
    // A page with a picture, embedded into another document as a form and drawn at half size.
    const inner = await PDFDocument.create();
    inner.addPage([400, 300]).drawImage(await inner.embedPng(PNG), { x: 100, y: 50, width: 200, height: 100 });
    const doc = await PDFDocument.create();
    const [form] = await doc.embedPdf(await inner.save());
    doc.addPage([612, 792]).drawPage(form, { x: 100, y: 400, width: 200, height: 150 });
    const bytes = await doc.save();
    const pages = (await PDFDocument.load(bytes)).getPages().map((p, i) => pageInfoFromPdfLib(p, i));
    const found = analyzeImageOps((await paintedImages(bytes)).list, OPS, pages[0].viewTransform);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ key: 'f0', seq: -1, total: -1 });
    // Form at (100, 400) scaled 0.5: picture at x 150..250, y 425..475 from the bottom.
    expect(found[0].x).toBeCloseTo(150, 2);
    expect(found[0].y).toBeCloseTo(792 - 475, 2);
    expect(found[0].width).toBeCloseTo(100, 2);
    expect(found[0].height).toBeCloseTo(50, 2);
    const { key, seq, total, objId: _id, ...box } = found[0];
    const result = await exportPdf({ bytes, pages, objects: [{ id: 'c', type: 'imagecut', pageIndex: 0, ...box, fill: '#ffffff', key, seq, total }], assets: {} });
    expect(result.removedImages).toBe(0);
    expect(result.warnings.join(' ')).toContain('covered');
  });

  it('removes only image operators, by position, and leaves form XObjects alone', () => {
    const enc = new TextEncoder();
    const content = enc.encode('q 1 0 0 1 0 0 cm /Im1 Do Q /Fm1 Do BT (Do not remove) Tj ET q /Im2 Do Q');
    const isImage = (name: string) => name.startsWith('Im');
    const out = new TextDecoder().decode(removeImageOps(content, isImage, [{ seq: 1, total: 2 }])!);
    expect(out).toContain('/Im1 Do');
    expect(out).toContain('/Fm1 Do');
    expect(out).toContain('(Do not remove) Tj');
    expect(out).not.toContain('/Im2');
    expect(out.length).toBe(content.length);
    expect(removeImageOps(content, isImage, [{ seq: 0, total: 3 }])).toBeNull();
  });
});
