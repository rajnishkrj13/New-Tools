import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFHexString, PDFName, StandardFonts } from 'pdf-lib';
import { exportPdf, pageInfoFromPdfLib } from '../src/engines/PdfExporter';
import { setMeasureImpl } from '../src/utils/fontUtils';
import { everythingIn } from './helpers/fileContents';

const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);
const N = (s: string) => PDFName.of(s);

/** A "tagged" PDF: its structure tree repeats the text of page 1 as alternative text, and a link on page 2 jumps to page 1. */
async function taggedFile() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  setMeasureImpl((t, _f, size) => font.widthOfTextAtSize(t, size));
  const ctx = doc.context;
  const p1 = doc.addPage([612, 792]);
  p1.drawText('Account number SECRETPAGEONE', { x: 72, y: 700, size: 14, font });
  const p2 = doc.addPage([612, 792]);
  p2.drawText('Second page', { x: 72, y: 700, size: 14, font });
  const elem = ctx.register(ctx.obj({ Type: 'StructElem', S: 'P', Pg: p1.ref, Alt: PDFHexString.fromText('SECRETALTTEXT'), ActualText: PDFHexString.fromText('SECRETACTUALTEXT') }));
  const tree = ctx.register(ctx.obj({ Type: 'StructTreeRoot', K: [elem] }));
  doc.catalog.set(N('StructTreeRoot'), tree);
  doc.catalog.set(N('MarkInfo'), ctx.obj({ Marked: true }));
  // an internal link on page 2 that jumps to page 1
  const jump = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [72, 600, 200, 620], Border: [0, 0, 0], Dest: [p1.ref, 'Fit'] }));
  p2.node.set(N('Annots'), ctx.obj([jump]));
  return doc.save();
}

describe('redaction and what points at the page', () => {
  it('a redacted page takes its accessibility tags and its text with it, and links to it still work', async () => {
    const bytes = await taggedFile();
    const pages = (await PDFDocument.load(bytes)).getPages().map((p, i) => pageInfoFromPdfLib(p, i));
    const result = await exportPdf({
      bytes, pages, assets: {}, rasterizePage: async () => PNG,
      objects: [{ id: 'r', type: 'redact', pageIndex: 0, x: 60, y: 60, width: 300, height: 40, fill: '#000000' }],
    });
    const all = await everythingIn(result.bytes);
    for (const gone of ['SECRETPAGEONE', 'SECRETALTTEXT', 'SECRETACTUALTEXT']) expect(all, gone).not.toContain(gone);
    expect(all).toContain('Second page');
    expect(result.notes.join(' ')).toMatch(/Accessibility tags/);
    // The link on page 2 now points at the replacement of page 1, not at nothing.
    const out = await PDFDocument.load(result.bytes);
    const link = out.context.lookup(out.getPage(1).node.Annots()!.get(0)) as any;
    const dest = link.lookup(N('Dest'));
    expect(dest.get(0)).toBe(out.getPage(0).ref);
  });

  it('a deleted page leaves nothing behind either, even when a link points at it', async () => {
    const bytes = await taggedFile();
    const pages = (await PDFDocument.load(bytes)).getPages().map((p, i) => pageInfoFromPdfLib(p, i));
    const result = await exportPdf({ bytes, pages: [pages[1]].map((p, i) => ({ ...p, index: i })), objects: [], assets: {} });
    const all = await everythingIn(result.bytes);
    for (const gone of ['SECRETPAGEONE', 'SECRETALTTEXT', 'SECRETACTUALTEXT']) expect(all, gone).not.toContain(gone);
    expect(all).toContain('Second page');
    expect(result.notes.join(' ')).toMatch(/Accessibility tags/);
  });

  it('keeps the accessibility tags when no page is removed', async () => {
    const bytes = await taggedFile();
    const pages = (await PDFDocument.load(bytes)).getPages().map((p, i) => pageInfoFromPdfLib(p, i));
    const result = await exportPdf({ bytes, pages: [pages[1], pages[0]].map((p, i) => ({ ...p, index: i })), objects: [], assets: {} });
    expect(await everythingIn(result.bytes)).toContain('SECRETALTTEXT'); // only reordered: nothing was taken out
  });
});
