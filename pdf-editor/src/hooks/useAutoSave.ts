import type { EditorObject, FormValues, ImageAsset } from '../types/objects';
import type { PageInfo } from '../types/pdf';
import { listCustomFonts, registerCustomFontBytes } from '../engines/FontManager';
import { loadPdf, openSource, readDocument } from '../engines/PdfRenderer';
import { clearTextCache } from '../engines/PdfTextExtractor';
import { invalidateLayouts } from '../engines/TextEditLayout';
import { getState, useEditorStore } from '../store/documentStore';
import { idbClear, idbGet, idbPut } from '../utils/sessionStore';
import { checkExportable } from './usePdfDocument';

/**
 * Auto-save: the open document and everything done to it are kept in this browser's
 * IndexedDB, so closing the tab or a crash does not lose work. One document is kept (the
 * last one opened). Nothing is uploaded; switching auto-save off erases the stored copy.
 *
 * Stored: the PDF, added PDFs, inserted images, uploaded fonts, the page list and all
 * edits. Not stored: the undo history.
 */

export interface SavedSession {
  version: 1;
  fileName: string;
  fileSize: number;
  savedAt: number;
  pages: PageInfo[];
  objects: EditorObject[];
  assets: Omit<ImageAsset, 'bytes' | 'url'>[];
  sources: { id: string; name: string }[];
  fonts: { id: string; name: string }[];
  /** Values typed into the PDF's own form fields. */
  formValues?: FormValues;
}

const PREF_KEY = 'pdf-editor:autosave';
const DELAY_MS = 600;

/** Bytes of the document whose base copy is in storage. */
let baseSaved: Uint8Array | null = null;
/** Keys of large blobs (images, added PDFs, fonts) already written for this document. */
const savedBlobs = new Set<string>();
let chain: Promise<unknown> = Promise.resolve();
let timer: ReturnType<typeof setTimeout> | null = null;
let warned = false;

const enabled = () => getState().autoSave.enabled;

/** Runs storage work strictly one after another. */
function enqueue(work: () => Promise<void>) {
  chain = chain.then(work).catch((e) => {
    getState().setAutoSave({ status: 'error' });
    if (!warned) {
      warned = true;
      const full = e?.name === 'QuotaExceededError' || /quota|full/i.test(e?.message ?? '');
      getState().toast(
        full
          ? 'Auto-save is not working: this browser has no storage space left for the document. Download your PDF to keep your work.'
          : 'Auto-save is not working in this browser window. Download your PDF to keep your work.',
        'warning',
      );
    }
  });
  return chain;
}

async function writeState() {
  const s = getState();
  if (!enabled() || !s.doc || !s.bytes) return;
  if (s.bytes !== baseSaved) {
    // A different document: start its stored copy from scratch.
    await idbClear();
    savedBlobs.clear();
    await idbPut('main', s.bytes);
    baseSaved = s.bytes;
  }
  for (const [id, src] of Object.entries(s.sources)) {
    if (savedBlobs.has(`src:${id}`)) continue;
    await idbPut(`src:${id}`, src.bytes);
    savedBlobs.add(`src:${id}`);
  }
  // Only images that are still used; one removed long ago is not written again.
  const used = new Set(s.objects.map((o) => (o.type === 'image' ? o.assetId : '')));
  for (const asset of Object.values(s.assets)) {
    if (!used.has(asset.id) || savedBlobs.has(`asset:${asset.id}`)) continue;
    await idbPut(`asset:${asset.id}`, asset.bytes);
    savedBlobs.add(`asset:${asset.id}`);
  }
  const fonts = listCustomFonts();
  for (const f of fonts) {
    if (savedBlobs.has(`font:${f.id}`)) continue;
    await idbPut(`font:${f.id}`, f.custom!.bytes);
    savedBlobs.add(`font:${f.id}`);
  }
  const session: SavedSession = {
    version: 1,
    fileName: s.doc.fileName,
    fileSize: s.doc.fileSize,
    savedAt: Date.now(),
    pages: s.pages,
    objects: s.objects,
    assets: Object.values(s.assets)
      .filter((a) => used.has(a.id))
      .map(({ id, name, mime, width, height }) => ({ id, name, mime, width, height })),
    sources: Object.entries(s.sources).map(([id, src]) => ({ id, name: src.name })),
    fonts: fonts.map((f) => ({ id: f.id, name: f.custom!.name })),
    formValues: s.formValues,
  };
  // Written last: a session is only valid once everything it refers to is stored.
  await idbPut('meta', session);
  if (getState().bytes === s.bytes) getState().setAutoSave({ status: 'saved', at: session.savedAt });
}

function schedule(delay = DELAY_MS) {
  if (!enabled()) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    enqueue(writeState);
  }, delay);
}

/** Saves right now (used when the tab is being hidden or closed). */
export function flushAutoSave() {
  if (!timer) return chain;
  clearTimeout(timer);
  timer = null;
  return enqueue(writeState);
}

/** True when leaving now could lose work: auto-save is off, failed, or has not caught up yet. */
export function hasUnsavedWork(): boolean {
  const s = getState();
  if (!s.doc || !s.dirty) return false;
  return !s.autoSave.enabled || s.autoSave.status !== 'saved' || timer !== null;
}

export function setAutoSaveEnabled(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
  } catch {
    /* the choice then only lasts for this visit */
  }
  getState().setAutoSave({ enabled: on, status: 'idle', at: null });
  if (timer) clearTimeout(timer);
  timer = null;
  if (on) {
    warned = false;
    schedule(0);
  } else {
    // Off means no copy is left behind.
    baseSaved = null;
    savedBlobs.clear();
    enqueue(idbClear);
  }
}

/** Starts watching the editor. Call once at startup. */
export function initAutoSave() {
  let on = true;
  try {
    on = localStorage.getItem(PREF_KEY) !== 'off';
  } catch {
    /* default: on */
  }
  getState().setAutoSave({ enabled: on });
  useEditorStore.subscribe((s, prev) => {
    if (!s.doc) return;
    if (s.bytes !== prev.bytes && s.autoSave.status !== 'idle') s.setAutoSave({ status: 'idle', at: null });
    if (s.bytes !== prev.bytes || s.objects !== prev.objects || s.pages !== prev.pages || s.sources !== prev.sources || s.formValues !== prev.formValues || s.fontVersion !== prev.fontVersion) {
      schedule();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAutoSave();
  });
  window.addEventListener('pagehide', () => void flushAutoSave());
}

/** The session waiting in storage, if there is one. */
export async function getSavedSession(): Promise<SavedSession | null> {
  try {
    const meta = await idbGet<SavedSession>('meta');
    return meta?.version === 1 && Array.isArray(meta.pages) && Array.isArray(meta.objects) ? meta : null;
  } catch {
    return null;
  }
}

export async function discardSavedSession() {
  baseSaved = null;
  savedBlobs.clear();
  await enqueue(idbClear);
}

/** Reopens the saved document exactly as it was left. Returns false if it could not be restored. */
export async function resumeSavedSession(): Promise<boolean> {
  const s = getState();
  s.setLoading('Restoring your document…');
  try {
    const meta = await getSavedSession();
    const bytes = await idbGet<Uint8Array>('main');
    if (!meta || !bytes) throw new Error('The saved copy is incomplete.');

    const doc = await loadPdf(bytes);
    clearTextCache();
    const { info, pages: fresh } = await readDocument(doc, meta.fileName, bytes.length);

    const sources: Record<string, { name: string; bytes: Uint8Array }> = {};
    for (const src of meta.sources) {
      const b = await idbGet<Uint8Array>(`src:${src.id}`);
      if (!b) continue;
      await openSource(src.id, b);
      sources[src.id] = { name: src.name, bytes: b };
      savedBlobs.add(`src:${src.id}`);
    }
    const assets: Record<string, ImageAsset> = {};
    for (const a of meta.assets) {
      const b = await idbGet<Uint8Array>(`asset:${a.id}`);
      if (!b) continue;
      assets[a.id] = { ...a, bytes: b, url: URL.createObjectURL(new Blob([b.slice().buffer], { type: a.mime })) };
      savedBlobs.add(`asset:${a.id}`);
    }
    for (const f of meta.fonts) {
      const b = await idbGet<Uint8Array>(`font:${f.id}`);
      if (!b) continue;
      await registerCustomFontBytes(f.name, b).catch(() => undefined);
      savedBlobs.add(`font:${f.id}`);
    }

    // Use the saved page list only if every page it names can still be shown.
    const valid = meta.pages.length > 0 && meta.pages.every((p) =>
      p.source === 'blank' || (p.source === 'main' ? p.srcIndex < fresh.length : !!sources[p.source]),
    );
    const pages = valid ? meta.pages : fresh;
    let lost = 0;
    const objects = meta.objects.filter((o) => {
      const ok = o.pageIndex < pages.length && (valid || o.pageIndex < fresh.length) && (o.type !== 'image' || !!assets[o.assetId]);
      if (!ok) lost++;
      return ok;
    });

    baseSaved = bytes;
    invalidateLayouts();
    getState().openDocument(info, pages, bytes);
    getState().restoreSession(objects, assets, sources, meta.formValues ?? {});
    getState().bumpFonts();
    getState().setAutoSave({ status: 'saved', at: meta.savedAt });
    requestAnimationFrame(() => {
      getState().fitWidth();
      requestAnimationFrame(() => getState().goToPage(0));
    });
    checkExportable(bytes);
    if (!valid || lost) {
      getState().toast(`The document was restored, but ${lost || 'some'} saved change${lost === 1 ? '' : 's'} could not be brought back.`, 'warning');
    }
    return true;
  } catch (e: any) {
    getState().setLoading(null);
    getState().setError(`Your saved document could not be restored: ${e?.message ?? 'unknown error'}`);
    return false;
  }
}
