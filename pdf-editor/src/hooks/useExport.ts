import { ExportError, exportPdf } from '../engines/PdfExporter';
import { analyzeTextOps, rasterizePage } from '../engines/PdfRenderer';
import { getState, useEditorStore } from '../store/documentStore';
import { downloadBytes } from '../utils/imageUtils';

const editedName = (name: string) => `${name.replace(/\.pdf$/i, '').replace(/-edited$/i, '')}-edited.pdf`;

/** Builds the edited PDF. Returns the bytes, or null when the export failed (the error is shown). */
export async function buildPdf(showDialog: boolean): Promise<Uint8Array | null> {
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
    const result = await exportPdf({
      bytes: fresh.bytes!,
      pages: fresh.pages,
      objects: fresh.objects,
      assets: fresh.assets,
      formValues: fresh.formValues,
      sources: Object.fromEntries(Object.entries(fresh.sources).map(([id, s]) => [id, s.bytes])),
      rasterizePage: (pageIndex, redactions) => rasterizePage(fresh.pages[pageIndex], redactions),
      analyzeText: (pageIndex) => analyzeTextOps(fresh.pages[pageIndex]),
      onProgress: (done, total, label) => getState().setExportState({ progress: total ? done / total : 1, label }),
    });
    if (getState().bytes !== fresh.bytes) return null;
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
