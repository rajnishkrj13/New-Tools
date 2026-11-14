import { PDFDocument } from 'pdf-lib';
import type { ImageObject } from '../types/objects';
import { loadPdf, readDocument } from '../engines/PdfRenderer';
import { clearTextCache } from '../engines/PdfTextExtractor';
import { getState } from '../store/documentStore';
import { importImageFile, newId } from '../utils/imageUtils';
import { validatePdfFile } from '../utils/validationUtils';
import { looksEncrypted, unlockPdf, WrongPasswordError } from '../engines/PdfTools';
import { askText } from '../store/promptActions';
import { beginNewTab } from '../store/tabActions';

/** Checks in the background that the open file can also be rewritten, and says so if not. */
export function checkExportable(bytes: Uint8Array) {
  setTimeout(async () => {
    try {
      await PDFDocument.load(bytes, { updateMetadata: false });
    } catch (e: any) {
      if (getState().bytes !== bytes) return;
      const reason = /encrypt/i.test(e?.message ?? '')
        ? 'This PDF is encrypted. You can view it, but edits cannot be saved until you open an unprotected copy.'
        : 'This PDF has a structure that cannot be rewritten, so edits cannot be saved.';
      getState().patchDoc({ exportable: false, exportBlocker: reason });
      getState().toast(reason, 'warning');
    }
  }, 50);
}

/**
 * Protected PDFs: returns an unprotected copy to work on, asking for the password when the
 * file needs one to open. Returns null when the user cancels. A file that only restricts
 * editing is unlocked without a question.
 */
async function ensureUnlocked(name: string, bytes: Uint8Array): Promise<Uint8Array | null> {
  if (!looksEncrypted(bytes)) return bytes;
  try {
    await PDFDocument.load(bytes, { updateMetadata: false });
    return bytes; // not actually encrypted
  } catch (e: any) {
    if (!/encrypt/i.test(e?.message ?? '')) return bytes;
  }
  try {
    const plain = await unlockPdf(bytes, '');
    getState().toast(`"${name}" was protected against editing. That protection is removed in the copy you are working on.`, 'info');
    return plain;
  } catch (e) {
    if (!(e instanceof WrongPasswordError)) return bytes; // viewing may still work
  }
  let message = `"${name}" is protected. Enter its password to open it. The password is only used on this device.`;
  for (;;) {
    getState().setLoading(null);
    const password = await askText({ title: 'Password needed', message, label: 'Password', password: true, okLabel: 'Open' });
    if (password === null) return null;
    getState().setLoading(`Opening ${name}…`);
    try {
      return await unlockPdf(bytes, password);
    } catch (e) {
      if (!(e instanceof WrongPasswordError)) throw e;
      message = `That password did not open "${name}". Try again.`;
    }
  }
}

/** Opens a PDF from bytes that never leave this tab. */
export async function openPdfBytes(name: string, bytes: Uint8Array) {
  const s = getState();
  const problem = validatePdfFile(name, bytes);
  if (problem) {
    s.setError(problem);
    return;
  }
  s.setLoading(`Opening ${name}…`);
  try {
    const unlocked = await ensureUnlocked(name, bytes);
    if (!unlocked) return getState().setLoading(null);
    bytes = unlocked;
    getState().setLoading(`Opening ${name}…`);
    const doc = await loadPdf(bytes);
    clearTextCache();
    const { info, pages } = await readDocument(doc, name, bytes.length);
    if (!pages.length) throw new Error('The PDF has no pages.');
    // Each document gets its own tab; the one that was open is kept in the background.
    beginNewTab(name);
    getState().openDocument(info, pages, bytes);
    requestAnimationFrame(() => {
      getState().fitWidth();
      requestAnimationFrame(() => getState().goToPage(0));
    });
    checkExportable(bytes);
  } catch (e: any) {
    // A document that was already open stays open and untouched.
    getState().setError(e?.message ?? 'The PDF could not be opened.');
  }
}

export async function openPdfFile(file: File) {
  const s = getState();
  s.setLoading(`Reading ${file.name}…`);
  try {
    await openPdfBytes(file.name, new Uint8Array(await file.arrayBuffer()));
  } catch {
    s.setError(`"${file.name}" could not be read from disk.`);
  }
}

/** Adds an image file to a page. Without a position it is centred on the page. */
export async function insertImageFile(file: File, pageIndex?: number, at?: { x: number; y: number }, signature = false) {
  const s = getState();
  const index = pageIndex ?? s.currentPage;
  const page = s.pages[index];
  if (!page) return;
  try {
    const asset = await importImageFile(file);
    placeAsset(asset.id, asset.width, asset.height, index, at, signature, asset);
  } catch (e: any) {
    s.toast(e?.message ?? 'The image could not be added.', 'error');
  }
}

export function placeAsset(
  assetId: string,
  pxWidth: number,
  pxHeight: number,
  pageIndex: number,
  at: { x: number; y: number } | undefined,
  signature: boolean,
  asset?: Parameters<ReturnType<typeof getState>['addAsset']>[0],
) {
  const s = getState();
  const page = s.pages[pageIndex];
  if (asset) s.addAsset(asset);
  // Fit inside the page: signatures start small, images at up to 60% of the page.
  const maxW = signature ? Math.min(180, page.width * 0.4) : page.width * 0.6;
  const maxH = signature ? 90 : page.height * 0.6;
  const scale = Math.min(maxW / pxWidth, maxH / pxHeight, signature ? Infinity : 0.75);
  const width = pxWidth * scale;
  const height = pxHeight * scale;
  const obj: ImageObject = {
    id: newId(),
    type: 'image',
    pageIndex,
    x: at ? at.x - width / 2 : (page.width - width) / 2,
    y: at ? at.y - height / 2 : (page.height - height) / 2,
    width,
    height,
    rotation: 0,
    opacity: 1,
    assetId,
    keepRatio: true,
    signature,
  };
  s.setTool('select');
  s.addObject(obj);
  s.goToPage(pageIndex);
}
