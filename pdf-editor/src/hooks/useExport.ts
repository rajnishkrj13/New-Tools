import { ExportError, exportPdf } from '../engines/PdfExporter';
import { analyzeTextOps, rasterizePage } from '../engines/PdfRenderer';
import { getState, useEditorStore } from '../store/documentStore';
import { compressPdfImages, lockPdf, type CompressLevel } from '../engines/PdfTools';
import { getOcrItems } from '../engines/PdfTextExtractor';
import { recodeJpeg } from '../utils/imageUtils';
import { downloadBytes } from '../utils/imageUtils';

const editedName = (name: string) => `${name.replace(/\.pdf$/i, '').replace(/-edited$/i, '')}-edited.pdf`;

/** Builds the edited PDF. Returns the bytes, or null when the export failed (the error is shown). */
export async function buildPdf(showDialog: boolean, options: { compress?: CompressLevel; pages?: number[] } = {}): Promise<Uint8Array | null> {
  const s = getState();
  if (!s.doc || !s.bytes) return null;
  if (s.exportState.status === 'running') return null;
  if (!s.doc.exportable) {
    s.setExportState({ status: 'error', dialog: true, error: s.doc.exportBlocker ?? 'This PDF cannot be saved.', details: [] });
    return null;
  }
  // Finish any text that is still being typed so it is part of the export.
  (document.activeElement as HTMLElement | null)?.blur?.();
  await new Promise((r) => setTimeout(r, 0));
  const fresh = getState();
  fresh.setExportState({ status: 'running', progress: 0, label: 'Preparing…', dialog: showDialog, error: undefined, details: undefined });
  try {
    // Extracting: only the chosen pages, with the edits that are on them.
    const chosen = options.pages ? options.pages.map((i, k) => ({ ...fresh.pages[i], index: k })) : fresh.pages;
    const placed = options.pages
      ? options.pages.flatMap((i, k) => fresh.objects.filter((o) => o.pageIndex === i).map((o) => ({ ...o, pageIndex: k })))
      : fresh.objects;
    const ocrText: Record<number, ReturnType<typeof getOcrItems>> = {};
    chosen.forEach((p, k) => {
      const words = getOcrItems(options.pages ? fresh.pages[options.pages[k]] : p);
      if (words.length) ocrText[k] = words;
    });
    const result = await exportPdf({
      bytes: fresh.bytes!,
      pages: chosen,
      objects: placed,
      ocrText,
      assets: fresh.assets,
      formValues: fresh.formValues,
      sources: Object.fromEntries(Object.entries(fresh.sources).map(([id, s]) => [id, s.bytes])),
      rasterizePage: (pageIndex, redactions) => rasterizePage(chosen[pageIndex], redactions),
      analyzeText: (pageIndex) => analyzeTextOps(chosen[pageIndex]),
      onProgress: (done, total, label) => getState().setExportState({ progress: total ? done / total : 1, label }),
    });
    if (getState().bytes !== fresh.bytes) return null;
    if (options.compress) {
      getState().setExportState({ label: 'Making pictures smaller…' });
      const before = result.bytes.length;
      const small = await compressPdfImages(result.bytes, options.compress, recodeJpeg);
      result.bytes = small.bytes;
      const saved = before - small.bytes.length;
      result.warnings.push(
        small.shrunk
          ? `${small.shrunk} picture${small.shrunk > 1 ? 's were' : ' was'} made smaller: the file is ${Math.round((saved / before) * 100)}% smaller.`
          : small.candidates
            ? 'The pictures in this PDF are already small; the file size is unchanged.'
            : 'This PDF has no photos that can be made smaller; the file size is unchanged.',
      );
    }
    if (fresh.exportPassword) {
      getState().setExportState({ label: 'Adding the password…' });
      result.bytes = await lockPdf(result.bytes, fresh.exportPassword);
      result.warnings.push('This file is protected: it only opens with the password you set.');
    }
    // An extract or a compressed copy is handed to its caller; it does not replace the normal export.
    if (options.pages || options.compress) {
      getState().setExportState({ status: 'idle', dialog: false });
      if (result.warnings.length) getState().toast(result.warnings[result.warnings.length - (fresh.exportPassword ? 2 : 1)] ?? result.warnings[0], 'info');
      return result.bytes;
    }
    getState().setLastExport({ bytes: result.bytes, fileName: editedName(fresh.doc!.fileName) });
    // Edits made while the export was running are not in it.
    if (getState().objects !== fresh.objects) useEditorStore.setState({ dirty: true });
    getState().setExportState({
      status: 'done', progress: 1, label: 'Done', warnings: result.warnings,
      pagesModified: result.pagesModified, objectsWritten: result.objectsWritten, flattenedPages: result.flattenedPages, removedGlyphs: result.removedGlyphs, structureChanged: result.structureChanged,
    });
    return result.bytes;
  } catch (e: any) {
    const err = e instanceof ExportError ? e : new ExportError(e?.message ?? String(e));
    getState().setExportState({ status: 'error', dialog: true, error: err.message, details: err.details });
    return null;
  }
}

export async function applyChanges() {
  await buildPdf(true);
}

export async function downloadPdf() {
  const s = getState();
  if (s.lastExport && !s.dirty) {
    downloadBytes(s.lastExport.bytes, s.lastExport.fileName);
    return;
  }
  const bytes = await buildPdf(false);
  const last = getState().lastExport;
  if (bytes && last) {
    downloadBytes(bytes, last.fileName);
    getState().toast(`Downloaded ${last.fileName}`, 'success');
    getState().setExportState({ status: 'idle' });
  }
}
