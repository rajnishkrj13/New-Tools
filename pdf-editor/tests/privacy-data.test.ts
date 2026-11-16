import { beforeAll, describe, expect, it } from 'vitest';
import { PDFDocument, PDFHexString, PDFName, PDFString, StandardFonts } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { EditorObject } from '../src/types/objects';
import type { PageInfo } from '../src/types/pdf';
import type { RawTextItem } from '../src/types/text';
import { exportPdf, pageInfoFromPdfLib } from '../src/engines/PdfExporter';
import { ALL_CLEANING, NO_CLEANING, inspectHiddenData } from '../src/engines/PdfPrivacy';
import { FULL_PERMISSIONS, lockPdf, protectionProblem, unlockPdf, type Protection } from '../src/engines/PdfTools';
import { setMeasureImpl } from '../src/utils/fontUtils';
import { everythingIn } from './helpers/fileContents';

const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);
const N = (s: string) => PDFName.of(s);
const open = (b: Uint8Array, password?: string) => pdfjs.getDocument({ data: b.slice(), password, verbosity: 0 }).promise;
const infoOf = async (b: Uint8Array): Promise<PageInfo[]> => (await PDFDocument.load(b)).getPages().map((p, i) => pageInfoFromPdfLib(p, i));

beforeAll(async () => {
  const d = await PDFDocument.create();
  const helv = await d.embedFont(StandardFonts.Helvetica);
  setMeasureImpl((text, _f, size) => helv.widthOfTextAtSize(text, size));
});

async function twoPageFile() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([612, 792]).drawText('Visible heading and the SECRETONE account', { x: 72, y: 700, size: 14, font });
  doc.addPage([612, 792]).drawText('Second page with SECRETTWO inside', { x: 72, y: 700, size: 14, font });
  return doc.save();
}

/** A document that carries a secret in every hidden place a PDF has. */
async function fileWithHiddenData(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const ctx = doc.context;
  const p1 = doc.addPage([612, 792]);
  p1.drawText('Ordinary visible text', { x: 72, y: 700, size: 14, font });
  const p2 = doc.addPage([612, 792]);
  p2.drawText('Second page', { x: 72, y: 700, size: 14, font });
  doc.setTitle('SECRETTITLE');
  doc.setAuthor('SECRETAUTHOR');
  doc.setKeywords(['SECRETKEYWORD']);
  doc.setCreator('SECRETCREATOR');
  // a hidden XMP copy of the properties
  const xmp = ctx.stream('<?xpacket begin="" id="x"?><x:xmpmeta><dc:creator>SECRETXMP</dc:creator></x:xmpmeta><?xpacket end="w"?>', { Type: 'Metadata', Subtype: 'XML' });
  doc.catalog.set(N('Metadata'), ctx.register(xmp));
  await doc.attach(new TextEncoder().encode('SECRETFILECONTENT'), 'secret.txt', { mimeType: 'text/plain', description: 'SECRETATTACHMENTNAME' });
  // JavaScript that runs when the file opens
  doc.catalog.set(N('OpenAction'), ctx.register(ctx.obj({ S: 'JavaScript', JS: PDFString.of('app.alert("SECRETSCRIPT")') })));
  // a reviewer comment, and a link that has to survive
  const note = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Text', Rect: [100, 600, 120, 620], Contents: PDFHexString.fromText('SECRETNOTE'), T: PDFHexString.fromText('SECRETREVIEWER') }));
  const link = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [72, 690, 200, 714], Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: PDFString.of('https://keep.example/page') } }));
  p1.node.set(N('Annots'), ctx.obj([note, link]));
  // a bookmark
  const outRef = ctx.nextRef();
  const itemRef = ctx.nextRef();
  ctx.assign(outRef, ctx.obj({ Type: 'Outlines', First: itemRef, Last: itemRef, Count: 1 }));
  ctx.assign(itemRef, ctx.obj({ Title: PDFHexString.fromText('SECRETBOOKMARK'), Parent: outRef, Dest: [p1.ref, 'Fit'] }));
  doc.catalog.set(N('Outlines'), outRef);
  // a thumbnail and data left by another program
  p1.node.set(N('Thumb'), ctx.register(ctx.stream('SECRETTHUMB')));
  doc.catalog.set(N('PieceInfo'), ctx.obj({ SomeApp: { Private: PDFString.of('SECRETPIECE') } }));
  // a form field on each page
  const form = doc.getForm();
  const f1 = form.createTextField('firstfield');
  f1.setText('SECRETFIELDVALUE');
  f1.addToPage(p1, { x: 72, y: 500, width: 200, height: 20 });
  const f2 = form.createTextField('secondfield');
  f2.setText('KEEPFIELDVALUE');
  f2.addToPage(p2, { x: 72, y: 500, width: 200, height: 20 });
  return doc.save();
}

const SECRETS = ['SECRETTITLE', 'SECRETAUTHOR', 'SECRETKEYWORD', 'SECRETCREATOR', 'SECRETXMP', 'SECRETFILECONTENT', 'SECRETATTACHMENTNAME', 'SECRETSCRIPT', 'SECRETNOTE', 'SECRETREVIEWER', 'SECRETBOOKMARK', 'SECRETTHUMB', 'SECRETPIECE'];

describe('remove hidden data', () => {
  let hidden: Uint8Array;
  let info: PageInfo[];
  beforeAll(async () => {
    hidden = await fileWithHiddenData();
    info = await infoOf(hidden);
  });

  it('the test file really carries every secret', async () => {
    const all = await everythingIn(hidden);
    for (const s of SECRETS) expect(all, s).toContain(s);
  });

  it('finds what the file carries, without changing it', async () => {
    const found = await inspectHiddenData(hidden);
    expect(found.map((f) => f.key).sort()).toEqual(['attachments', 'bookmarks', 'comments', 'privateData', 'properties', 'scripts'].sort());
    expect(found.find((f) => f.key === 'comments')!.label).toMatch(/^1 comment/);
    expect(await everythingIn(hidden)).toContain('SECRETNOTE');
  });

  it('removes all of it from the file itself, and keeps links, form fields and the pages', async () => {
    const result = await exportPdf({ bytes: hidden, pages: info, objects: [], assets: {}, privacy: { clean: ALL_CLEANING } });
    expect(result.notes.length).toBeGreaterThanOrEqual(6);
    const all = await everythingIn(result.bytes);
    for (const s of SECRETS) expect(all, s).not.toContain(s);
    // What the document is for is still there.
    expect(all).toContain('KEEPFIELDVALUE');
    expect(all).toContain('https://keep.example/page');
    const out = await open(result.bytes);
    expect(out.numPages).toBe(2);
    const text = (await (await out.getPage(1)).getTextContent()).items.map((i: any) => i.str).join(' ');
    expect(text).toContain('Ordinary visible text');
    const form = (await PDFDocument.load(result.bytes)).getForm();
    expect(form.getFields().map((f) => f.getName()).sort()).toEqual(['firstfield', 'secondfield']);
  });

  it('removes only what was chosen', async () => {
    const result = await exportPdf({ bytes: hidden, pages: info, objects: [], assets: {}, privacy: { clean: { ...NO_CLEANING, comments: true, bookmarks: true } } });
    const all = await everythingIn(result.bytes);
    expect(all).not.toContain('SECRETNOTE');
    expect(all).not.toContain('SECRETBOOKMARK');
    for (const s of ['SECRETTITLE', 'SECRETFILECONTENT', 'SECRETSCRIPT', 'SECRETTHUMB']) expect(all, s).toContain(s);
  });

  it('leaves the file untouched when nothing is chosen', async () => {
    const result = await exportPdf({ bytes: hidden, pages: info, objects: [], assets: {}, privacy: { clean: NO_CLEANING } });
    const all = await everythingIn(result.bytes);
    for (const s of SECRETS) expect(all, s).toContain(s);
    expect(result.notes).toEqual([]);
  });

  it('keeps what you add yourself while cleaning', async () => {
    const mine: EditorObject = { id: 'n', type: 'note', pageIndex: 0, x: 300, y: 100, width: 18, height: 18, color: '#facc15', author: 'Me', text: 'MYOWNNOTE', replies: [] };
    const result = await exportPdf({ bytes: hidden, pages: info, objects: [mine], assets: {}, privacy: { clean: ALL_CLEANING } });
    const all = await everythingIn(result.bytes);
    expect(all).toContain('MYOWNNOTE');
    expect(all).not.toContain('SECRETNOTE');
  });
});

describe('document properties', () => {
  it('sets, replaces and clears properties, and drops the stale XMP copy', async () => {
    const hidden = await fileWithHiddenData();
    const info = await infoOf(hidden);
    const props = { title: 'Quarterly report', author: '', subject: 'Finance', keywords: 'q3, board', creator: '', producer: 'PDF Editor' };
    const result = await exportPdf({ bytes: hidden, pages: info, objects: [], assets: {}, privacy: { props } });
    expect(result.notes).toContain('Document properties changed');
    const read = await PDFDocument.load(result.bytes, { updateMetadata: false });
    expect(read.getTitle()).toBe('Quarterly report');
    expect(read.getSubject()).toBe('Finance');
    expect(read.getKeywords()).toBe('q3, board');
    expect(read.getProducer()).toBe('PDF Editor');
    expect(read.getAuthor()).toBeUndefined();
    expect(read.getCreator()).toBeUndefined();
    const all = await everythingIn(result.bytes);
    for (const s of ['SECRETAUTHOR', 'SECRETCREATOR', 'SECRETXMP', 'SECRETTITLE']) expect(all, s).not.toContain(s);
    // The things that were not asked about are still there.
    expect(all).toContain('SECRETFILECONTENT');
  });

  it('supports other languages in the title', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    const bytes = await doc.save();
    const title = 'तिमाही रिपोर्ट';
    const result = await exportPdf({ bytes, pages: await infoOf(bytes), objects: [], assets: {}, privacy: { props: { title, author: '', subject: '', keywords: '', creator: '', producer: '' } } });
    expect((await PDFDocument.load(result.bytes, { updateMetadata: false })).getTitle()).toBe(title);
  });
});

describe('redactions cover and remove what was added on top', () => {
  const word = (str: string, x: number, baseline: number): RawTextItem => ({ str, x, baseline, width: 100, fontSize: 12, fontName: 'ocr', generic: 'sans-serif', ascent: 0.9, descent: -0.25, angle: 0 });
  const text = (id: string, y: number, value: string): EditorObject => ({
    id, type: 'text', pageIndex: 0, x: 80, y, width: 300, rotation: 0, text: value, fontFamily: 'Helvetica', fontSize: 12,
    bold: false, italic: false, underline: false, color: '#111111', align: 'left', opacity: 1,
  });

  it('leaves no text, recognised word, link or note under a box, and keeps the rest', async () => {
    const bytes = await twoPageFile();
    const pages = await infoOf(bytes);
    const objects: EditorObject[] = [
      { id: 'r', type: 'redact', pageIndex: 0, x: 60, y: 60, width: 340, height: 60, fill: '#000000' },
      text('under', 75, 'SECRETBOXTEXT'),
      text('away', 300, 'KEPTTEXT'),
      { id: 'lk', type: 'link', pageIndex: 0, x: 70, y: 70, width: 100, height: 20, url: 'https://secret-link.example' },
      { id: 'nt', type: 'note', pageIndex: 0, x: 90, y: 90, width: 18, height: 18, color: '#facc15', author: 'a', text: 'SECRETNOTETEXT', replies: [] },
      { id: 'nt2', type: 'note', pageIndex: 0, x: 400, y: 500, width: 18, height: 18, color: '#facc15', author: 'a', text: 'KEPTNOTE', replies: [] },
    ];
    const result = await exportPdf({
      bytes, pages, objects, assets: {}, rasterizePage: async () => PNG,
      ocrText: { 0: [word('SECRETOCR', 80, 100), word('KEEPOCR', 80, 400)] },
    });
    const all = await everythingIn(result.bytes);
    for (const gone of ['SECRETBOXTEXT', 'SECRETOCR', 'secret-link.example', 'SECRETNOTETEXT', 'SECRETONE']) expect(all, gone).not.toContain(gone);
    for (const kept of ['KEPTTEXT', 'KEEPOCR', 'KEPTNOTE', 'SECRETTWO']) expect(all, kept).toContain(kept);
    expect(result.warnings.join(' ')).toMatch(/overlapped a redaction/);
    // The text that is left is searchable: the recognised word that was not covered.
    const items = (await (await (await open(result.bytes)).getPage(1)).getTextContent()).items.map((i: any) => i.str).join(' ');
    expect(items).toContain('KEEPOCR');
    expect(items).not.toContain('SECRETOCR');
    // And a solid black box is drawn on top of the page.
    expect(all).toMatch(/0 0 0 rg/);
  });

  it('removes the fields of a redacted or deleted page from the form', async () => {
    const hidden = await fileWithHiddenData();
    const info = await infoOf(hidden);
    const redacted = await exportPdf({
      bytes: hidden, pages: info, assets: {}, rasterizePage: async () => PNG,
      objects: [{ id: 'r', type: 'redact', pageIndex: 0, x: 60, y: 60, width: 100, height: 40, fill: '#000000' }],
    });
    let all = await everythingIn(redacted.bytes);
    expect(all).not.toContain('SECRETFIELDVALUE');
    expect(all).not.toContain('Ordinary visible text'); // the bookmark to the old page does not keep it alive
    expect(all).toContain('KEEPFIELDVALUE');
    expect((await PDFDocument.load(redacted.bytes)).getForm().getFields().map((f) => f.getName())).toEqual(['secondfield']);
    // The bookmark still works: it now leads to the replacement page.
    expect(all).toContain('SECRETBOOKMARK');
    // Document-level data stays until it is cleaned, and the export says so.
    expect(all).toContain('SECRETBOOKMARK');
    expect(redacted.warnings.join(' ')).toMatch(/Remove hidden data/);

    const deleted = await exportPdf({ bytes: hidden, pages: [info[1]].map((p, i) => ({ ...p, index: i })), objects: [], assets: {} });
    all = await everythingIn(deleted.bytes);
    expect(all).not.toContain('SECRETFIELDVALUE');
    expect(all).toContain('KEEPFIELDVALUE');
    expect((await PDFDocument.load(deleted.bytes)).getForm().getFields().map((f) => f.getName())).toEqual(['secondfield']);
  });
});

describe('permissions on protected files', () => {
  const protection = (over: Partial<Protection['permissions']>, user = '', owner = 'owner-pass-1'): Protection => ({
    userPassword: user, ownerPassword: owner, permissions: { ...FULL_PERMISSIONS, ...over },
  });
  const PRINT = 0x04, MODIFY = 0x08, COPY = 0x10, ANNOTATE = 0x20, FILL = 0x100, ASSEMBLE = 0x400, PRINT_HQ = 0x800;
  const flags = async (b: Uint8Array, password?: string) => new Set((await (await open(b, password)).getPermissions()) ?? []);
  let plain: Uint8Array;
  beforeAll(async () => {
    plain = await twoPageFile();
  });

  it('opens for everyone but blocks printing, copying and editing', async () => {
    const locked = await lockPdf(plain, protection({ printing: 'none', copying: false, modifying: false, assembling: false }));
    expect(new TextDecoder('latin1').decode(locked)).toContain('AESV3'); // AES-256
    const f = await flags(locked); // no password needed to open
    expect(f.has(PRINT) || f.has(PRINT_HQ)).toBe(false);
    expect(f.has(COPY)).toBe(false);
    expect(f.has(MODIFY)).toBe(false);
    expect(f.has(ASSEMBLE)).toBe(false);
    // What was left allowed stays allowed.
    expect(f.has(ANNOTATE)).toBe(true);
    expect(f.has(FILL)).toBe(true);
    expect((await open(locked)).numPages).toBe(2);
  });

  it('low-quality printing is different from none', async () => {
    const f = await flags(await lockPdf(plain, protection({ printing: 'low' })));
    expect(f.has(PRINT)).toBe(true);
    expect(f.has(PRINT_HQ)).toBe(false);
  });

  it('needs the open password when one is set, and the owner password lifts the limits', async () => {
    const locked = await lockPdf(plain, protection({ copying: false }, 'open-pass-1', 'owner-pass-1'));
    await expect(open(locked)).rejects.toMatchObject({ name: 'PasswordException' });
    expect((await flags(locked, 'open-pass-1')).has(COPY)).toBe(false);
    // The owner password opens the file with full rights: an unlocked copy carries no restrictions at all.
    expect(await (await open(await unlockPdf(locked, 'owner-pass-1'))).getPermissions()).toBeNull();
    await expect(unlockPdf(locked, 'not-a-password')).rejects.toThrow();
    // The editor opens it with the open password, as an unprotected working copy.
    expect((await open(await unlockPdf(locked, 'open-pass-1'))).numPages).toBe(2);
  });

  it('refuses settings that would not protect anything', () => {
    expect(protectionProblem(protection({}, '', ''))).toMatch(/Enter a password/);
    expect(protectionProblem(protection({ copying: false }, 'same-pass', 'same-pass'))).toMatch(/second, different password/);
    expect(protectionProblem(protection({ copying: false }, '', ''))).toBeTruthy();
    expect(protectionProblem(protection({ copying: false }, '', 'abc'))).toMatch(/at least 4/);
    expect(protectionProblem(protection({}, 'only-open', ''))).toBeNull(); // nothing restricted: one password is enough
    expect(protectionProblem(protection({ copying: false }, '', 'owner-pass-1'))).toBeNull();
  });
});
