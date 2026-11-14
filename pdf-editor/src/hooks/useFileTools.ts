import { recognizePage, OCR_LANGUAGES, type OcrLanguage } from '../engines/Ocr';
import { extractPdfText, getPdfPage, renderPdfToImages } from '../engines/PdfRenderer';
import { COMPRESS_LEVELS, imagesToPdf, parsePageRanges, zipStore, type PictureInput } from '../engines/PdfTools';
import { getOcrItems, loadTextModel, setOcrItems } from '../engines/PdfTextExtractor';
import { getState, useEditorStore } from '../store/documentStore';
import { askText } from '../store/promptActions';
import { downloadBytes, importImageFile } from '../utils/imageUtils';
import { buildPdf } from './useExport';
import { openPdfBytes } from './usePdfDocument';

/** File menu actions: extract pages, export as pictures or text, smaller file, password, OCR, PDF from pictures. */

const baseName = () => (getState().doc?.fileName ?? 'document').replace(/\.pdf$/i, '').replace(/-edited$/i, '');
const fail = (e: any, what: string) => getState().toast(`${what}: ${e?.message ?? 'unknown error'}`, 'error');

export async function extractPages() {
  const s = getState();
  const count = s.pages.length;
  const answer = await askText({
    title: 'Extract pages',
    message: 'Saves the pages you choose, with their edits, as a new PDF. This document is not changed.',
    label: 'Pages (for example 1-3, 5)',
    initial: String(s.currentPage + 1),
    okLabel: 'Save as new PDF',
    validate: (v) => (parsePageRanges(v, count) ? null : `Enter page numbers between 1 and ${count}, for example 1-3, 5.`),
  });
  if (answer === null) return;
  const pages = parsePageRanges(answer, count)!;
  const bytes = await buildPdf(false, { pages });
  if (!bytes) return;
  downloadBytes(bytes, `${baseName()}-pages-${answer.replace(/[^\d-]+/g, '_')}.pdf`);
  getState().toast(`Saved ${pages.length} page${pages.length > 1 ? 's' : ''} as a new PDF.`, 'success');
}

export async function exportImages(format: 'png' | 'jpeg') {
  const bytes = await buildPdf(false);
  if (!bytes) return;
  const s = getState();
  s.setExportState({ status: 'idle' });
  s.setLoading('Drawing pages…');
  try {
    const ext = format === 'png' ? 'png' : 'jpg';
    const images = await renderPdfToImages(bytes, `image/${format}`, 150, (done, total) => getState().setLoading(`Drawing page ${done + 1} of ${total}…`));
    const digits = String(images.length).length;
    if (images.length === 1) downloadBytes(images[0], `${baseName()}.${ext}`, `image/${format}`);
    else {
      const files = images.map((b, i) => ({ name: `${baseName()}-page-${String(i + 1).padStart(digits, '0')}.${ext}`, bytes: b }));
      downloadBytes(zipStore(files), `${baseName()}-pages.zip`, 'application/zip');
    }
    getState().toast(images.length === 1 ? 'The page was saved as a picture.' : `${images.length} pictures were saved in one ZIP file.`, 'success');
  } catch (e) {
    fail(e, 'The pages could not be exported as pictures');
  } finally {
    getState().setLoading(null);
  }
}

export async function exportText() {
  const bytes = await buildPdf(false);
  if (!bytes) return;
  getState().setExportState({ status: 'idle' });
  getState().setLoading('Reading text…');
  try {
    const pages = await extractPdfText(bytes);
    const text = pages.map((t, i) => (pages.length > 1 ? `--- Page ${i + 1} ---\r\n` : '') + t.replace(/\n/g, '\r\n')).join('\r\n\r\n');
    if (!pages.some((t) => t.trim())) getState().toast('This document has no text to export. For a scan, run "Recognise text (OCR)" first.', 'warning');
    else {
      // A byte-order mark makes Notepad and Excel read non-English text correctly.
      downloadBytes(new TextEncoder().encode(`﻿${text}`), `${baseName()}.txt`, 'text/plain;charset=utf-8');
      getState().toast('The text was saved as a .txt file.', 'success');
    }
  } catch (e) {
    fail(e, 'The text could not be exported');
  } finally {
    getState().setLoading(null);
  }
}

export async function downloadSmaller(level: keyof typeof COMPRESS_LEVELS) {
  const bytes = await buildPdf(false, { compress: COMPRESS_LEVELS[level] });
  if (bytes) downloadBytes(bytes, `${baseName()}-small.pdf`);
}

export async function setPassword() {
  const s = getState();
  if (s.exportPassword) {
    s.setExportPassword(null);
    return s.toast('Downloads of this document are no longer password-protected.', 'info');
  }
  const password = await askText({
    title: 'Protect with a password',
    message: 'Downloads of this document will only open with this password. It is used on this device only and is not saved: if you forget it, the file cannot be opened.',
    label: 'Password',
    password: true,
    confirm: true,
    okLabel: 'Set password',
    validate: (v) => (v.length < 4 ? 'Use at least 4 characters.' : null),
  });
  if (password === null) return;
  getState().setExportPassword(password);
  getState().toast('Password set. It applies to every download of this document until you remove it.', 'success');
}

/** Builds a new PDF with one page per picture and opens it in its own tab. */
export async function createFromImages(files: File[]) {
  if (!files.length) return;
  getState().setLoading('Building a PDF from your pictures…');
  try {
    const pictures: PictureInput[] = [];
    for (const f of files) {
      const a = await importImageFile(f);
      URL.revokeObjectURL(a.url);
      pictures.push({ bytes: a.bytes, mime: a.mime, width: a.width, height: a.height });
    }
    const bytes = await imagesToPdf(pictures);
    await openPdfBytes(files.length === 1 ? files[0].name.replace(/\.[^.]+$/, '.pdf') : 'pictures.pdf', bytes);
  } catch (e) {
    getState().setLoading(null);
    fail(e, 'The pictures could not be turned into a PDF');
  }
}

/**
 * Recognises the text of scanned pages. `scope` is this page or every page without text
 * of its own. Afterwards the text can be found, highlighted and edited, and the exported
 * PDF carries it as a hidden, searchable layer.
 */
export async function recognizeText(scope: 'page' | 'all') {
  const s = getState();
  const lang = (await askText({
    title: 'Recognise text (OCR)',
    message:
      scope === 'page'
        ? `Reads the text in the picture of page ${s.currentPage + 1}. The first run loads the recognition engine (a few megabytes, from this app) and takes a few seconds per page.`
        : 'Reads the text of every scanned page (pages that have no text of their own). This takes a few seconds per page.',
    label: 'Language of the document',
    options: OCR_LANGUAGES.map((l) => ({ value: l.id, label: l.label })),
    okLabel: 'Recognise',
  })) as OcrLanguage | null;
  if (!lang) return;
  const pages = scope === 'page' ? [s.pages[s.currentPage]] : s.pages;
  let words = 0;
  let done = 0;
  try {
    for (const page of pages) {
      if (page.source === 'blank') continue;
      if (scope === 'all') {
        // Pages that already have text are left alone.
        const model = await loadTextModel(await getPdfPage(page), page);
        if (model.lines.length && !getOcrItems(page).length) continue;
      }
      getState().setLoading(`Recognising text on page ${page.index + 1}…`);
      const items = await recognizePage(page, lang, (f) => getState().setLoading(`Recognising text on page ${page.index + 1}… ${Math.round(f * 100)}%`));
      setOcrItems(page, items);
      words += items.length;
      done++;
    }
    getState().setLoading(null);
    // The pages' text changed: anything showing it reads it again.
    getState().bumpFonts();
    if (!done) getState().toast('Every page already has text; there was nothing to recognise.', 'info');
    else if (!words) getState().toast('No text was found. Check the language, or the scan may be too faint.', 'warning');
    else {
      getState().toast(`Recognised ${words} words on ${done} page${done > 1 ? 's' : ''}. Use Edit Text, Highlight or Find on them; the downloaded PDF will be searchable.`, 'success');
      // The document changed (it now has a text layer), so it is saved and exported again.
      useEditorStore.setState({ dirty: true });
    }
  } catch (e) {
    getState().setLoading(null);
    fail(e, 'Text recognition did not work');
  }
}
