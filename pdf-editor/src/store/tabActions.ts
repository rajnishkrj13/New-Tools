import type { EditorObject, FormValues, ImageAsset } from '../types/objects';
import type { DocumentInfo, PageInfo } from '../types/pdf';
import { closeAllPdfs, loadPdf, openSource } from '../engines/PdfRenderer';
import { clearTextCache } from '../engines/PdfTextExtractor';
import { newId } from '../utils/imageUtils';
import { getState, useEditorStore, type Snapshot } from './documentStore';
import { emptyHistory, type History } from './historyStore';

/**
 * Several documents, as tabs. The editor works on one document at a time; the others are
 * "parked": their whole state (file, pages, edits, undo history) is kept in memory and put
 * back when their tab is chosen. Switching re-reads the PDF, which takes a moment for big files.
 */

export interface ParkedDocument {
  doc: DocumentInfo;
  pages: PageInfo[];
  bytes: Uint8Array;
  objects: EditorObject[];
  history: History<Snapshot>;
  assets: Record<string, ImageAsset>;
  sources: Record<string, { name: string; bytes: Uint8Array }>;
  formValues: FormValues;
  dirty: boolean;
  lastExport: { bytes: Uint8Array; fileName: string } | null;
  exportPassword: string | null;
  zoom: number;
  currentPage: number;
}

const parked = new Map<string, ParkedDocument>();
const closeListeners: ((id: string) => void)[] = [];
/** Lets auto-save forget a document when its tab is closed. */
export const onTabClosed = (fn: (id: string) => void) => closeListeners.push(fn);
export const isParked = (id: string) => parked.has(id);

/** Puts a document straight into a background tab (used when restoring a saved session). */
export function parkDocument(id: string, data: Omit<ParkedDocument, 'history' | 'lastExport' | 'exportPassword' | 'zoom' | 'currentPage'>) {
  parked.set(id, { ...data, history: emptyHistory(), lastExport: null, exportPassword: null, zoom: 1, currentPage: 0 });
}

/** Moves the document that is open now into the background. */
function parkCurrent() {
  const s = getState();
  if (!s.doc || !s.bytes || !s.activeTab) return;
  parked.set(s.activeTab, {
    doc: s.doc, pages: s.pages, bytes: s.bytes, objects: s.objects, history: s.history, assets: s.assets, sources: s.sources,
    formValues: s.formValues, dirty: s.dirty, lastExport: s.lastExport, exportPassword: s.exportPassword, zoom: s.zoom, currentPage: s.currentPage,
  });
  // Its pictures stay alive with it: the next document must not release them.
  useEditorStore.setState({ assets: {} });
}

/** Call just before a newly loaded document is put into the editor: it gets a tab of its own. */
export function beginNewTab(name: string): string {
  parkCurrent();
  const id = `doc-${newId()}`;
  const s = getState();
  useEditorStore.setState({ tabs: [...s.tabs, { id, name }], activeTab: id });
  return id;
}

async function activate(id: string): Promise<boolean> {
  const data = parked.get(id);
  if (!data) return false;
  const s = getState();
  s.setLoading(`Opening ${data.doc.fileName}…`);
  try {
    await loadPdf(data.bytes);
    for (const [sourceId, src] of Object.entries(data.sources)) await openSource(sourceId, src.bytes);
    clearTextCache();
    parked.delete(id);
    useEditorStore.setState((st) => ({
      ...data,
      docKey: st.docKey + 1,
      activeTab: id,
      loading: null,
      error: null,
      selectedId: null,
      extraSelected: [],
      editingTextId: null,
      editingCell: null,
      draftText: null,
      textSel: null,
      tool: 'select',
      scrollRequest: null,
      search: { ...st.search, hits: [], index: -1 },
      exportState: { status: 'idle', progress: 0, label: '', dialog: false },
    }));
    requestAnimationFrame(() => getState().goToPage(Math.min(data.currentPage, data.pages.length - 1)));
    return true;
  } catch (e: any) {
    getState().setLoading(null);
    getState().toast(`"${data.doc.fileName}" could not be opened: ${e?.message ?? 'unknown error'}`, 'error');
    return false;
  }
}

export async function switchTab(id: string) {
  const s = getState();
  if (id === s.activeTab || !parked.has(id)) return;
  // Finish any text that is being typed in the document we are leaving.
  (document.activeElement as HTMLElement | null)?.blur?.();
  parkCurrent();
  await activate(id);
}

export async function closeTab(id: string) {
  const s = getState();
  const tab = s.tabs.find((t) => t.id === id);
  if (!tab) return;
  const isActive = id === s.activeTab;
  const dirty = isActive ? s.dirty : parked.get(id)?.dirty;
  if (dirty && !window.confirm(`Close "${tab.name}"? Changes that were not downloaded will be lost.`)) return;

  const assets = isActive ? s.assets : parked.get(id)?.assets ?? {};
  Object.values(assets).forEach((a) => URL.revokeObjectURL(a.url));
  parked.delete(id);
  const tabs = s.tabs.filter((t) => t.id !== id);
  closeListeners.forEach((fn) => fn(id));
  if (!isActive) return useEditorStore.setState({ tabs });

  // The neighbouring tab takes over; with none left the start screen is shown.
  const at = s.tabs.findIndex((t) => t.id === id);
  const next = tabs[Math.min(at, tabs.length - 1)];
  useEditorStore.setState({ tabs, activeTab: null, assets: {} });
  if (next && (await activate(next.id))) return;
  getState().closeDocument();
  await closeAllPdfs();
}

/** Keeps the tab's label in step with the document's file name. */
export function renameActiveTab(name: string) {
  const s = getState();
  useEditorStore.setState({ tabs: s.tabs.map((t) => (t.id === s.activeTab ? { ...t, name } : t)) });
}
