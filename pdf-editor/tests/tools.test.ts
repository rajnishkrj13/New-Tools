import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import type { EditorObject } from '../src/types/objects';
import type { RawTextItem } from '../src/types/text';
import { exportPdf, pageInfoFromPdfLib } from '../src/engines/PdfExporter';
import { setMeasureImpl } from '../src/utils/fontUtils';

setMeasureImpl((text, _font, size) => text.length * size * 0.5);
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { COMPRESS_LEVELS, compressPdfImages, imagesToPdf, lockPdf, looksEncrypted, parsePageRanges, unlockPdf, WrongPasswordError, zipStore } from '../src/engines/PdfTools';

const SAMPLE = new Uint8Array(readFileSync(join(__dirname, '..', 'test-assets', 'sample.pdf')));
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);
// Smallest valid baseline JPEG (1x1, grey).
const JPEG = Uint8Array.from(
  atob(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=',
  ),
  (c) => c.charCodeAt(0),
);

const open = (bytes: Uint8Array, password?: string) => pdfjs.getDocument({ data: bytes.slice(), password, verbosity: 0 }).promise;

describe('page ranges', () => {
  it('reads lists, ranges and open ends', () => {
    expect(parsePageRanges('1-3, 5', 10)).toEqual([0, 1, 2, 4]);
    expect(parsePageRanges('8-', 10)).toEqual([7, 8, 9]);
    expect(parsePageRanges('-2', 10)).toEqual([0, 1]);
    expect(parsePageRanges('3-1', 10)).toEqual([2, 1, 0]);
    expect(parsePageRanges('2 2', 10)).toEqual([1, 1]);
  });
  it('rejects pages that do not exist and nonsense', () => {
    expect(parsePageRanges('0', 5)).toBeNull();
    expect(parsePageRanges('4-9', 5)).toBeNull();
    expect(parsePageRanges('a-b', 5)).toBeNull();
    expect(parsePageRanges('', 5)).toBeNull();
  });
});

describe('zip', () => {
  it('writes an archive other tools can read', () => {
    const files = [
      { name: 'page-1.png', bytes: PNG },
      { name: 'ñote.txt', bytes: new TextEncoder().encode('hello') },
    ];
    const zip = zipStore(files);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    // End record: two entries, directory where it says it is.
    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    const dirAt = view.getUint32(end + 16, true);
    expect(view.getUint32(dirAt, true)).toBe(0x02014b50);
    // The first file is stored as-is right after its header.
    const nameLen = view.getUint16(26, true);
    expect(Array.from(zip.subarray(30 + nameLen, 30 + nameLen + PNG.length))).toEqual(Array.from(PNG));
    // CRC of "hello" is a well-known value.
    const second = 30 + nameLen + PNG.length;
    expect(view.getUint32(second + 14, true)).toBe(0x3610a686);
  });
});

describe('pictures to PDF', () => {
  it('makes one page per picture, sized to the picture', async () => {
    const bytes = await imagesToPdf([
      { bytes: PNG, mime: 'image/png', width: 1000, height: 2000 },
      { bytes: JPEG, mime: 'image/jpeg', width: 3000, height: 1500 },
    ]);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    const a = doc.getPage(0).getSize();
    expect(a.height).toBeCloseTo(842, 3);
    expect(a.width).toBeCloseTo(421, 3);
    const b = doc.getPage(1).getSize();
    expect(b.width).toBeCloseTo(842, 3);
    expect(b.height).toBeCloseTo(421, 3);
  });
});

describe('passwords', () => {
  it('locks a PDF and unlocks it again', async () => {
    expect(looksEncrypted(SAMPLE)).toBe(false);
    const locked = await lockPdf(SAMPLE, 'test-pass-123');
    expect(looksEncrypted(locked)).toBe(true);
    // It no longer opens without the password ...
    await expect(open(locked)).rejects.toMatchObject({ name: 'PasswordException' });
    // ... but does with it, and keeps its pages and text.
    const viewed = await open(locked, 'test-pass-123');
    expect(viewed.numPages).toBe(5);
    const text = (await (await viewed.getPage(1)).getTextContent()).items.map((i: any) => i.str).join(' ');
    expect(text).toContain('Quarterly Report');

    await expect(unlockPdf(locked, 'wrong')).rejects.toBeInstanceOf(WrongPasswordError);
    const unlocked = await unlockPdf(locked, 'test-pass-123');
    const plain = await open(unlocked);
    expect(plain.numPages).toBe(5);
    // The unlocked copy can be edited by the normal exporter library.
    expect((await PDFDocument.load(unlocked)).getPageCount()).toBe(5);
  });
});

describe('compression', () => {
  it('replaces photos only when the new version is smaller', async () => {
    const src = await PDFDocument.create();
    const big = new Uint8Array(JPEG.length + 4000);
    big.set(JPEG.subarray(0, JPEG.length - 2));
    big.set([0xff, 0xd9], big.length - 2); // padded JPEG: same picture, larger file
    const page = src.addPage([200, 200]);
    page.drawImage(await src.embedJpg(JPEG), { x: 0, y: 0, width: 50, height: 50 });
    const bytes = await src.save();
    // Swap the stored picture for the padded one so there is something to gain.
    const doc = await PDFDocument.load(bytes);
    for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')) doc.context.assign(ref, PDFRawStream.of(obj.dict, big));
    }
    const padded = await doc.save();

    const kept = await compressPdfImages(padded, COMPRESS_LEVELS.small, async (jpeg) => ({ bytes: jpeg, width: 1, height: 1 }));
    expect(kept).toMatchObject({ shrunk: 0, candidates: 1 });
    expect(kept.bytes).toBe(padded);

    const smaller = await compressPdfImages(padded, COMPRESS_LEVELS.small, async () => ({ bytes: JPEG, width: 1, height: 1 }));
    expect(smaller).toMatchObject({ shrunk: 1, candidates: 1 });
    expect(smaller.bytes.length).toBeLessThan(padded.length - 3000);
    expect((await open(smaller.bytes)).numPages).toBe(1);
  });
});

describe('exporter: duplicates, extracts and recognised text', () => {
  const pagesOf = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p, i) => pageInfoFromPdfLib(p, i));
  const textOf = async (bytes: Uint8Array, n: number) =>
    (await (await (await open(bytes)).getPage(n)).getTextContent()).items.map((i: any) => i.str).join(' ');

  it('writes a duplicated page as a page of its own', async () => {
    const pages = await pagesOf(SAMPLE);
    // Page 1, a duplicate of page 1, then page 2.
    const order = [pages[0], { ...pages[0], id: 'main:0#copy' }, pages[1]].map((p, i) => ({ ...p, index: i }));
    const note: EditorObject = {
      id: 't', type: 'text', pageIndex: 1, x: 80, y: 500, width: 300, rotation: 0, text: 'ONLY ON THE COPY',
      fontFamily: 'Helvetica', fontSize: 14, bold: false, italic: false, underline: false, color: '#000000', align: 'left', opacity: 1,
    };
    const result = await exportPdf({ bytes: SAMPLE, pages: order, objects: [note], assets: {} });
    const doc = await PDFDocument.load(result.bytes);
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getPage(0).ref).not.toBe(doc.getPage(1).ref);
    expect(await textOf(result.bytes, 1)).toContain('Quarterly Report');
    expect(await textOf(result.bytes, 1)).not.toContain('ONLY ON THE COPY');
    expect(await textOf(result.bytes, 2)).toContain('Quarterly Report');
    expect(await textOf(result.bytes, 2)).toContain('ONLY ON THE COPY');
    expect(await textOf(result.bytes, 3)).toContain('Terms and Conditions');
  });

  it('adds recognised text of a scan as a hidden, searchable layer', async () => {
    // A "scan": one page that is only a picture.
    const scan = await imagesToPdf([{ bytes: PNG, mime: 'image/png', width: 600, height: 800 }]);
    const pages = await pagesOf(scan);
    expect(await textOf(scan, 1)).toBe('');
    const word = (str: string, x: number): RawTextItem => ({ str, x, baseline: 120, width: 60, fontSize: 12, fontName: 'ocr', generic: 'sans-serif', ascent: 0.9, descent: -0.25, angle: 0 });
    const result = await exportPdf({ bytes: scan, pages, objects: [], assets: {}, ocrText: { 0: [word('Invoice', 50), word('Total', 120)] } });
    expect(result.ocrWords).toBe(2);
    expect(await textOf(result.bytes, 1)).toContain('Invoice');
    // Hidden: drawn in the invisible text mode, so the picture looks the same.
    const doc = await PDFDocument.load(result.bytes);
    const contents = doc.getPage(0).node.Contents() as any;
    const stream = contents.asArray().map((r: any) => new TextDecoder().decode(decodePDFRawStream(doc.context.lookup(r) as any).decode())).join('\n');
    expect(stream).toMatch(/\b3 Tr\b/);
  });
});
