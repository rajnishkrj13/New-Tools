import { beforeAll, describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { EditorObject } from '../src/types/objects';
import type { PageInfo } from '../src/types/pdf';
import { exportPdf, pageInfoFromPdfLib } from '../src/engines/PdfExporter';
import { setMeasureImpl } from '../src/utils/fontUtils';
import { everythingIn } from './helpers/fileContents';

// 1x1 PNG standing in for the picture of a flattened page.
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

/** Two pages. Page 1 carries a secret in its text; page 2 has a different one. */
async function twoPageFile() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([612, 792]).drawText('Visible heading and the SECRETONE account', { x: 72, y: 700, size: 14, font });
  doc.addPage([612, 792]).drawText('Second page with SECRETTWO inside', { x: 72, y: 700, size: 14, font });
  return doc.save();
}

let bytes: Uint8Array;
let pages: PageInfo[];

beforeAll(async () => {
  const d = await PDFDocument.create();
  const helv = await d.embedFont(StandardFonts.Helvetica);
  setMeasureImpl((text, _f, size) => helv.widthOfTextAtSize(text, size));
  bytes = await twoPageFile();
  pages = (await PDFDocument.load(bytes)).getPages().map((p, i) => pageInfoFromPdfLib(p, i));
});

describe('removed content is gone from the file', () => {
  it('the test file really contains its secrets', async () => {
    const all = await everythingIn(bytes);
    expect(all).toContain('SECRETONE');
    expect(all).toContain('SECRETTWO');
  });

  it('a deleted page takes its text and pictures with it', async () => {
    const result = await exportPdf({ bytes, pages: [pages[1]].map((p, i) => ({ ...p, index: i })), objects: [], assets: {} });
    const all = await everythingIn(result.bytes);
    expect(all).toContain('SECRETTWO');
    expect(all).not.toContain('SECRETONE');
  });

  it('a secure redaction leaves nothing of the original page in the file', async () => {
    const redact: EditorObject = { id: 'r', type: 'redact', pageIndex: 0, x: 70, y: 70, width: 300, height: 30, fill: '#000000' };
    const result = await exportPdf({ bytes, pages, objects: [redact], assets: {}, rasterizePage: async () => PNG });
    expect(result.flattenedPages).toEqual([0]);
    const all = await everythingIn(result.bytes);
    expect(all).not.toContain('SECRETONE');
    expect(all).not.toContain('Visible heading');
    // The other page is untouched.
    expect(all).toContain('SECRETTWO');
    const out = await pdfjs.getDocument({ data: result.bytes.slice(), verbosity: 0 }).promise;
    expect(out.numPages).toBe(2);
  });
});
