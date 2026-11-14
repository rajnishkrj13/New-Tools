import type { EditorObject, FormValues, ImageAsset } from '../types/objects';
import type { PageInfo } from '../types/pdf';
import { listCustomFonts, registerCustomFontBytes } from '../engines/FontManager';
import { invalidateLayouts } from '../engines/TextEditLayout';
import { getState, useEditorStore } from '../store/documentStore';
import { onTabClosed, parkDocument, switchTab } from '../store/tabActions';
import { idbClear, idbDeleteRange, idbGet, idbPut } from '../utils/sessionStore';

/**
 * Auto-save: every open document and what was done to it are kept in this browser's
 * IndexedDB, so closing the tab or a crash does not lose work. Nothing is uploaded;
 * switching auto-save off erases the stored copies.
 *
 * Stored per document: the PDF, added PDFs, inserted images, the page list, all edits and
 * form values. Stored once: uploaded fonts. Not stored: the undo history.
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

interface SavedIndex {
  tabs: { id: string; name: string }[];
  active: string | null;
}

const PREF_KEY = 'pdf-editor:autosave';
const DELAY_MS = 600;
/** A session saved before documents had tabs lives at the top level of the store. */
const LEGACY = 'legacy';
const key = (tab: string, name: string) => (tab === LEGACY ? name : `${tab}/${name}`);

/** What is already in storage for each document: its PDF and the large blobs written so far. */
const records = new Map<string, { base: Uint8Array | null; blobs: Set<string> }>();
const savedFonts = new Set<string>();
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
  const tab = s.activeTab;
  if (!enabled() || !s.doc || !s.bytes || !tab) return;
  let rec = records.get(tab);
  if (!rec) records.set(tab, (rec = { base: null, blobs: new Set() }));
  if (s.bytes !== rec.base) {
    // First save of this document (or its file changed): start its stored copy from scratch.
    await idbDeleteRange(tab);
    rec.blobs.clear();
    await idbPut(key(tab, 'main'), s.bytes);
    rec.base = s.bytes;
  }
  for (const [id, src] of Object.entries(s.sources)) {
    if (rec.blobs.has(`src:${id}`)) continue;
    await idbPut(key(tab, `src:${id}`), src.bytes);
    rec.blobs.add(`src:${id}`);
  }
  // Only images that are still used; one removed long ago is not written again.
  const used = new Set(s.objects.map((o) => (o.type === 'image' ? o.assetId : '')));
  for (const asset of Object.values(s.assets)) {
    if (!used.has(asset.id) || rec.blobs.has(`asset:${asset.id}`)) continue;
    await idbPut(key(tab, `asset:${asset.id}`), asset.bytes);
    rec.blobs.add(`asset:${asset.id}`);
  }
  const fonts = listCustomFonts();
  for (const f of fonts) {
    if (savedFonts.has(f.id)) continue;
    await idbPut(`font:${f.id}`, f.custom!.bytes);
    savedFonts.add(f.id);
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
  await idbPut(key(tab, 'meta'), session);
  await idbPut('index', { tabs: getState().tabs, active: getState().activeTab } satisfies SavedIndex);
  if (getState().activeTab === tab && getState().bytes === s.bytes) getState().setAutoSave({ status: 'saved', at: session.savedAt });
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

function forgetEverything() {
  records.clear();
  savedFonts.clear();
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
    forgetEverything();
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
    if (
      s.bytes !== prev.bytes || s.objects !== prev.objects || s.pages !== prev.pages || s.sources !== prev.sources ||
      s.formValues !== prev.formValues || s.fontVersion !== prev.fontVersion || s.tabs !== prev.tabs
    ) {
      schedule();
    }
  });
  onTabClosed((id) => {
    records.delete(id);
    enqueue(async () => {
      await idbDeleteRange(id);
      await idbPut('index', { tabs: getState().tabs, active: getState().activeTab } satisfies SavedIndex);
    });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAutoSave();
  });
  window.addEventListener('pagehide', () => void flushAutoSave());
}

export interface SavedSummary {
  id: string;
  session: SavedSession;
}

/** The documents waiting in storage, in tab order. */
export async function getSavedSessions(): Promise<{ list: SavedSummary[]; active: string | null }> {
  const valid = (m: SavedSession | undefined): m is SavedSession => m?.version === 1 && Array.isArray(m.pages) && Array.isArray(m.objects);
  try {
    const index = await idbGet<SavedIndex>('index');
    if (!index) {
      const old = await idbGet<SavedSession>('meta');
      return valid(old) ? { list: [{ id: LEGACY, session: old }], active: LEGACY } : { list: [], active: null };
    }
    const list: SavedSummary[] = [];
    for (const tab of index.tabs) {
      const meta = await idbGet<SavedSession>(key(tab.id, 'meta'));
      if (valid(meta)) list.push({ id: tab.id, session: meta });
    }
    return { list, active: list.some((x) => x.id === index.active) ? index.active : list[0]?.id ?? null };
  } catch {
    return { list: [], active: null };
  }
}

export async function discardSavedSessions() {
  forgetEverything();
  await enqueue(idbClear);
}

/** Reopens every saved document as it was left, each in its tab. Returns false if nothing could be restored. */
export async function resumeSavedSessions(): Promise<boolean> {
  const s = getState();
  s.setLoading('Restoring your documents…');
  try {
    const saved = await getSavedSessions();
    const tabs: { id: string; name: string }[] = [];
    for (const { id, session: meta } of saved.list) {
      const bytes = await idbGet<Uint8Array>(key(id, 'main'));
      if (!bytes) continue;
      const blobs = new Set<string>();
      const sources: Record<string, { name: string; bytes: Uint8Array }> = {};
      for (const src of meta.sources) {
        const b = await idbGet<Uint8Array>(key(id, `src:${src.id}`));
        if (!b) continue;
        sources[src.id] = { name: src.name, bytes: b };
        blobs.add(`src:${src.id}`);
      }
      const assets: Record<string, ImageAsset> = {};
      for (const a of meta.assets) {
        const b = await idbGet<Uint8Array>(key(id, `asset:${a.id}`));
        if (!b) continue;
        assets[a.id] = { ...a, bytes: b, url: URL.createObjectURL(new Blob([b.slice().buffer], { type: a.mime })) };
        blobs.add(`asset:${a.id}`);
      }
      for (const f of meta.fonts) {
        if (savedFonts.has(f.id)) continue;
        const b = (await idbGet<Uint8Array>(`font:${f.id}`)) ?? (await idbGet<Uint8Array>(key(id, `font:${f.id}`)));
        if (b && (await registerCustomFontBytes(f.name, b).catch(() => null))) savedFonts.add(f.id);
      }
      // Edits can only come back when their page and picture did.
      const pages = meta.pages.filter((p) => p.source === 'main' || p.source === 'blank' || !!sources[p.source]).map((p, i) => ({ ...p, index: i }));
      const kept = new Map(pages.map((p) => [p.id, p.index]));
      const objects = meta.objects
        .filter((o) => kept.has(meta.pages[o.pageIndex]?.id) && (o.type !== 'image' || !!assets[o.assetId]))
        .map((o) => ({ ...o, pageIndex: kept.get(meta.pages[o.pageIndex].id)! }));
      if (!pages.length) continue;
      // A session from before tabs existed is saved again under its own tab.
      const tabId = id === LEGACY ? `doc-${Date.now().toString(36)}` : id;
      parkDocument(tabId, {
        doc: { fileName: meta.fileName, fileSize: bytes.length, numPages: pages.length, exportable: true },
        pages, bytes, objects, assets, sources, formValues: meta.formValues ?? {},
        dirty: objects.length > 0 || Object.keys(meta.formValues ?? {}).length > 0,
      });
      records.set(tabId, { base: id === LEGACY ? null : bytes, blobs: id === LEGACY ? new Set() : blobs });
      tabs.push({ id: tabId, name: meta.fileName });
    }
    if (!tabs.length) throw new Error('The saved copy is incomplete.');
    if (saved.list.some((x) => x.id === LEGACY)) await enqueue(idbClear).then(() => savedFonts.clear());
    invalidateLayouts();
    useEditorStore.setState({ tabs, activeTab: null });
    const first = tabs.find((t) => t.id === saved.active) ?? tabs[0];
    await switchTab(first.id);
    getState().bumpFonts();
    requestAnimationFrame(() => getState().fitWidth());
    return !!getState().doc;
  } catch (e: any) {
    getState().setLoading(null);
    getState().setError(`Your saved documents could not be restored: ${e?.message ?? 'unknown error'}`);
    return false;
  }
}
