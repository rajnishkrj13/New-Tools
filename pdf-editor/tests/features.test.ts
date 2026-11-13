import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString, PDFHexString, StandardFonts } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { EditorObject, FieldObject, LinkObject, NoteObject, TextObject } from '../src/types/objects';
import type { Matrix, PageInfo } from '../src/types/pdf';
import { mul } from '../src/engines/CoordinateMapper';
import { exportPdf, normalizeUrl, pageInfoFromPdfLib } from '../src/engines/PdfExporter';
import { layoutTextObject, resolveFields, setFieldContext } from '../src/engines/TextEditLayout';
import { findInText } from '../src/engines/TextSearch';
import { setMeasureImpl } from '../src/utils/fontUtils';
import { validateObjects } from '../src/utils/validationUtils';

const SAMPLE = join(__dirname, '..', 'test-assets', 'sample.pdf');
let bytes: Uint8Array;
let pages: PageInfo[];

beforeAll(async () => {
  const d = await PDFDocument.create();
  const helv = await d.embedFont(StandardFonts.Helvetica);
  const bold = await d.embedFont(StandardFonts.HelveticaBold);
  setMeasureImpl((text, font, size) => {
    try {
      return (/bold/.test(font) ? bold : helv).widthOfTextAtSize(text, size);
    } catch {
      return text.length * size * 0.5;
    }
  });
  bytes = new Uint8Array(readFileSync(SAMPLE));
  const doc = await PDFDocument.load(bytes);
  pages = doc.getPages().map((p, i) => pageInfoFromPdfLib(p, i));
});

const textBox = (over: Partial<TextObject>): TextObject => ({
  id: 't', type: 'text', pageIndex: 0, x: 100, y: 300, width: 300, rotation: 0, text: '',
  fontFamily: 'Helvetica', fontSize: 12, bold: false, italic: false, underline: false, color: '#111111', align: 'left', opacity: 1,
  ...over,
});

async function pageTexts(out: Uint8Array, pageNumber: number) {
  const doc = await pdfjs.getDocument({ data: out.slice(), useSystemFonts: false, verbosity: 0 }).promise;
  const page = await doc.getPage(pageNumber);
  const vp = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  return (content.items as any[])
    .filter((i) => i.str?.trim())
    .map((i) => {
      const m = mul(vp.transform as Matrix, i.transform as Matrix);
      return { str: i.str as string, x: m[4], baseline: m[5], font: i.fontName as string };
    });
}

const annotations = (doc: PDFDocument, pageIndex: number): PDFDict[] => {
  const annots = doc.getPage(pageIndex).node.Annots();
  return annots ? annots.asArray().map((r) => doc.context.lookup(r) as PDFDict) : [];
};
const text = (v: unknown) => (v instanceof PDFHexString || v instanceof PDFString ? v.decodeText() : String(v));

describe('search', () => {
  it('finds every occurrence, with and without matching case', () => {
    expect(findInText('The cat and the Cat', 'cat', false)).toEqual([4, 16]);
    expect(findInText('The cat and the Cat', 'Cat', true)).toEqual([16]);
    expect(findInText('aaaa', 'aa', true)).toEqual([0, 2]);
    expect(findInText('anything', '', false)).toEqual([]);
  });
});

describe('formatted text boxes', () => {
  it('lays out bullets, numbers and bold / italic parts', () => {
    const o = textBox({ rich: true, width: 200, text: 'Plain **bold** and *slanted* end\n- first item that is long enough to wrap onto a second line\n2. second' });
    const { lines, height } = layoutTextObject(o);
    const bold = lines.find((l) => l.text.trim() === 'bold')!;
    const italic = lines.find((l) => l.text.trim() === 'slanted')!;
    expect(bold.bold).toBe(true);
    expect(italic.italic).toBe(true);
    expect(lines.some((l) => l.text.includes('*'))).toBe(false); // the marks themselves are not drawn
    // Bullet marker at the left edge, its text indented, wrapped lines keep the indent.
    const bullet = lines.find((l) => l.text === '•')!;
    expect(bullet.x).toBe(0);
    const item = lines.filter((l) => l.baseline >= bullet.baseline && l.text !== '•' && !l.text.startsWith('2') && l.text !== 'second');
    expect(item.length).toBeGreaterThan(1);
    item.forEach((l) => expect(l.x).toBeGreaterThanOrEqual(o.fontSize * 1.3 - 0.01));
    expect(lines.some((l) => l.text === '2.')).toBe(true);
    lines.forEach((l) => expect(l.x + l.width).toBeLessThanOrEqual(o.width + 0.5));
    expect(height).toBeGreaterThan(o.fontSize * 1.2 * 3);
  });

  it('leaves text alone when formatting marks are off', () => {
    const { lines } = layoutTextObject(textBox({ text: '- not **a** list' }));
    expect(lines[0].text).toBe('- not **a** list');
  });

  it('exports bold parts in a bold font', async () => {
    const result = await exportPdf({ bytes, pages, assets: {}, objects: [textBox({ rich: true, text: 'Normal **Strong** tail' })] });
    const items = await pageTexts(result.bytes, 1);
    const normal = items.find((i) => i.str.trim() === 'Normal')!;
    const strong = items.find((i) => i.str.trim() === 'Strong')!;
    expect(strong).toBeTruthy();
    expect(strong.font).not.toBe(normal.font);
    expect(strong.x).toBeGreaterThan(normal.x);
    expect(strong.baseline).toBeCloseTo(normal.baseline, 1);
  });
});

describe('headers, footers, page numbers and stamps', () => {
  it('fills page placeholders for each page', async () => {
    setFieldContext(5, 'report.pdf');
    expect(resolveFields('Page {page} of {pages} - {file}', 2)).toBe('Page 3 of 5 - report');
    const objects = pages.map((p, i) => textBox({ id: `f${i}`, pageIndex: i, fields: true, text: 'Page {page} of {pages}', y: p.height - 40, x: 40 }));
    const result = await exportPdf({ bytes, pages, assets: {}, objects });
    for (const n of [1, 3, 5]) {
      const items = await pageTexts(result.bytes, n);
      expect(items.some((i) => i.str === `Page ${n} of 5`), `page ${n}`).toBe(true);
    }
  });

  it('draws the frame of a stamp', async () => {
    const stamp = textBox({ text: 'APPROVED', bold: true, rotation: -12, frame: { color: '#dc2626', width: 2, padding: 6 } });
    const result = await exportPdf({ bytes, pages, assets: {}, objects: [stamp] });
    const items = await pageTexts(result.bytes, 1);
    expect(items.some((i) => i.str === 'APPROVED')).toBe(true);
    expect(result.objectsWritten).toBe(1);
  });
});

describe('links', () => {
  const link = (over: Partial<LinkObject>): LinkObject => ({ id: 'l', type: 'link', pageIndex: 0, x: 72, y: 100, width: 120, height: 20, url: 'example.com/page', ...over });

  it('adds a web link with the right clickable area', async () => {
    const result = await exportPdf({ bytes, pages, assets: {}, objects: [link({})] });
    const doc = await PDFDocument.load(result.bytes);
    const [a] = annotations(doc, 0);
    expect(a.get(PDFName.of('Subtype'))).toBe(PDFName.of('Link'));
    const action = a.lookup(PDFName.of('A'), PDFDict);
    expect(text(action.get(PDFName.of('URI')))).toBe('https://example.com/page');
    const rect = (a.lookup(PDFName.of('Rect'), PDFArray).asArray() as any[]).map((n) => n.asNumber());
    // View (72,100)-(192,120) on a 792pt high page is PDF (72,672)-(192,692).
    expect(rect).toEqual([72, 672, 192, 692]);
  });

  it('adds a jump to another page, following the page order', async () => {
    const result = await exportPdf({ bytes, pages, assets: {}, objects: [link({ url: '', targetPageId: pages[3].id })] });
    const doc = await PDFDocument.load(result.bytes);
    const dest = annotations(doc, 0)[0].lookup(PDFName.of('Dest'), PDFArray);
    expect(dest.get(0)).toBe(doc.getPage(3).ref);
  });

  it('refuses script addresses and normalises plain ones', () => {
    expect(normalizeUrl('  www.site.org ')).toBe('https://www.site.org');
    expect(normalizeUrl('mailto:a@b.c')).toBe('mailto:a@b.c');
    expect(validateObjects([link({ url: 'javascript:alert(1)' })], pages, {})).toHaveLength(1);
    expect(validateObjects([link({})], pages, {})).toHaveLength(0);
  });

  it('replaces and removes links the document already had', async () => {
    // A document with two links of its own.
    const first = await exportPdf({ bytes, pages, assets: {}, objects: [link({ id: 'a', url: 'old-one.example' }), link({ id: 'b', y: 200, url: 'old-two.example' })] });
    const withLinks = await PDFDocument.load(first.bytes);
    const refs = withLinks.getPage(0).node.Annots()!.asArray().map((r: any) => `${r.objectNumber}R`);
    const info = withLinks.getPages().map((p, i) => pageInfoFromPdfLib(p, i));
    const result = await exportPdf({
      bytes: first.bytes, pages: info, assets: {},
      objects: [link({ id: 'c', sourceRef: refs[0], url: 'new-address.example' }), link({ id: 'd', y: 200, sourceRef: refs[1], url: 'old-two.example', removed: true })],
    });
    const doc = await PDFDocument.load(result.bytes);
    const urls = annotations(doc, 0).map((a) => text(a.lookup(PDFName.of('A'), PDFDict).get(PDFName.of('URI'))));
    expect(urls).toEqual(['https://new-address.example']);
  });
});

describe('comments', () => {
  it('writes a sticky note with its replies', async () => {
    const note: NoteObject = {
      id: 'n', type: 'note', pageIndex: 1, x: 300, y: 150, width: 18, height: 18, color: '#facc15',
      author: 'Asha', text: 'Please check this total', replies: [{ author: 'Ravi', text: 'Checked, it is right' }, { author: '', text: '  ' }],
    };
    const result = await exportPdf({ bytes, pages, assets: {}, objects: [note] });
    const doc = await PDFDocument.load(result.bytes);
    const list = annotations(doc, 1);
    expect(list).toHaveLength(2); // the empty reply is left out
    const [main, reply] = list;
    expect(main.get(PDFName.of('Subtype'))).toBe(PDFName.of('Text'));
    expect(text(main.get(PDFName.of('Contents')))).toBe('Please check this total');
    expect(text(main.get(PDFName.of('T')))).toBe('Asha');
    expect(main.lookup(PDFName.of('AP'), PDFDict).get(PDFName.of('N'))).toBeTruthy(); // has its own icon
    expect(text(reply.get(PDFName.of('Contents')))).toBe('Checked, it is right');
    expect(reply.get(PDFName.of('IRT'))).toBe(doc.getPage(1).node.Annots()!.get(0));
  });
});

describe('forms', () => {
  const field = (over: Partial<FieldObject>): FieldObject => ({
    id: 'f', type: 'field', kind: 'text', name: 'Customer', pageIndex: 0, x: 72, y: 400, width: 200, height: 22, value: '', checked: false, fontSize: 11, ...over,
  });

  it('creates real form fields', async () => {
    const objects: EditorObject[] = [field({ value: 'Nirula' }), field({ id: 'g', kind: 'checkbox', name: 'Agree', y: 440, width: 14, height: 14, checked: true })];
    const result = await exportPdf({ bytes, pages, assets: {}, objects });
    const form = (await PDFDocument.load(result.bytes)).getForm();
    expect(form.getTextField('Customer').getText()).toBe('Nirula');
    expect(form.getCheckBox('Agree').isChecked()).toBe(true);
    const widget = form.getTextField('Customer').acroField.getWidgets()[0].getRectangle();
    // pdf-lib grows the box by half its border, so allow a point.
    expect(Math.abs(widget.x - 72)).toBeLessThan(1);
    expect(Math.abs(widget.y - (792 - 422))).toBeLessThan(1);
    expect(Math.abs(widget.width - 200)).toBeLessThan(2);
  });

  it('rejects two fields with the same name', () => {
    const problems = validateObjects([field({}), field({ id: 'h', y: 500 })], pages, {});
    expect(problems.join(' ')).toMatch(/both named "Customer"/);
  });

  it('fills the fields a PDF already has', async () => {
    const src = await PDFDocument.create();
    const page = src.addPage([400, 300]);
    const f = src.getForm();
    f.createTextField('name').addToPage(page, { x: 40, y: 220, width: 200, height: 20 });
    f.createCheckBox('ok').addToPage(page, { x: 40, y: 180, width: 14, height: 14 });
    const radio = f.createRadioGroup('colour');
    radio.addOptionToPage('red', page, { x: 40, y: 140, width: 14, height: 14 });
    radio.addOptionToPage('blue', page, { x: 80, y: 140, width: 14, height: 14 });
    const drop = f.createDropdown('city');
    drop.addOptions(['Delhi', 'Mumbai']);
    drop.addToPage(page, { x: 40, y: 100, width: 120, height: 20 });
    const formBytes = await src.save();
    const info = [pageInfoFromPdfLib((await PDFDocument.load(formBytes)).getPage(0), 0)];

    const result = await exportPdf({
      bytes: formBytes, pages: info, assets: {}, objects: [],
      formValues: { name: 'Rajnish Kumar', ok: true, colour: 'blue', city: 'Mumbai', missing: 'x' },
    });
    const form = (await PDFDocument.load(result.bytes)).getForm();
    expect(form.getTextField('name').getText()).toBe('Rajnish Kumar');
    expect(form.getCheckBox('ok').isChecked()).toBe(true);
    expect(form.getRadioGroup('colour').getSelected()).toBe('blue');
    expect(form.getDropdown('city').getSelected()).toEqual(['Mumbai']);
    expect(result.warnings.join(' ')).toMatch(/could not be filled: missing/);
  });
});
