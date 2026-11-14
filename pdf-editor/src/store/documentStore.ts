import { create } from 'zustand';
import type { EditorObject, FormValues, ImageAsset, TextObject } from '../types/objects';
import type { DocumentInfo, PageInfo } from '../types/pdf';
import type { ExportState, SearchHit, Toast, Tool, ToolStyle } from '../types/editor';
import type { EditLevel, TextSelection } from '../types/text';
import { emptyHistory, pushHistory, redoHistory, undoHistory, type History } from './historyStore';
import { newId } from '../utils/imageUtils';
import { clearTextCache } from '../engines/PdfTextExtractor';
import type { PromptRequest } from './promptActions';

/** What one undo step restores: the edits and the page structure (order, rotation, added/deleted pages). */
export interface Snapshot {
  objects: EditorObject[];
  pages: PageInfo[];
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

interface EditorState {
  doc: DocumentInfo | null;
  pages: PageInfo[];
  bytes: Uint8Array | null;
  /** Changes whenever another document is opened; used as React key. */
  docKey: number;
  loading: string | null;
  error: string | null;

  objects: EditorObject[];
  history: History<Snapshot>;
  assets: Record<string, ImageAsset>;
  /** Auto-save to this browser's storage: whether it is on, and how the last save went. */
  autoSave: { enabled: boolean; status: 'idle' | 'saved' | 'error'; at: number | null };
  setAutoSave: (patch: Partial<EditorState['autoSave']>) => void;
  /** Puts back the edits, images and added PDFs of a saved session (no undo step). */
  restoreSession: (objects: EditorObject[], assets: Record<string, ImageAsset>, sources: EditorState['sources'], formValues?: FormValues) => void;
  /** Other PDFs whose pages were added to this document (bytes are needed again on export). */
  sources: Record<string, { name: string; bytes: Uint8Array }>;
  addSource: (id: string, name: string, bytes: Uint8Array) => void;
  /** Commits a change of the page structure together with the remapped edits, as one undo step. */
  commitDoc: (objects: EditorObject[], pages: PageInfo[]) => void;
  /** True when there are edits that the last export does not contain. */
  dirty: boolean;
  lastExport: { bytes: Uint8Array; fileName: string } | null;
  exportState: ExportState;

  selectedId: string | null;
  /** Further selected objects (Shift+click), all on the page of `selectedId`. */
  extraSelected: string[];
  /** Adds an object to the selection or takes it out again. */
  toggleSelect: (id: string) => void;
  selectMany: (ids: string[]) => void;
  /** Find and replace: the panel, what is searched and where it was found. */
  search: { open: boolean; query: string; replace: string; matchCase: boolean; hits: SearchHit[]; index: number; busy: boolean };
  setSearch: (patch: Partial<EditorState['search']>) => void;
  /** Values typed into the form fields the PDF already has. */
  formValues: FormValues;
  setFormValue: (name: string, value: string | boolean) => void;
  /** Open documents, one per tab; the editor shows `activeTab`. */
  tabs: { id: string; name: string }[];
  activeTab: string | null;
  /** A question waiting for the user's answer (page range, password ...). */
  prompt: PromptRequest | null;
  setPrompt: (prompt: PromptRequest | null) => void;
  /** When set, downloads of this document are protected with this password. Never stored. */
  exportPassword: string | null;
  setExportPassword: (password: string | null) => void;
  pageElementsOpen: boolean;
  setPageElementsOpen: (open: boolean) => void;
  editingTextId: string | null;
  /** A new text box that is being typed and is not part of the document yet. */
  draftText: TextObject | null;
  setDraftText: (o: TextObject | null) => void;
  /** The table cell that is being typed. */
  editingCell: { id: string; row: number; col: number } | null;
  setEditingCell: (cell: { id: string; row: number; col: number } | null) => void;
  textSel: TextSelection | null;
  tool: Tool;
  lastShape: Tool;
  editLevel: EditLevel;
  toolStyle: ToolStyle;
  zoom: number;
  currentPage: number;
  /** Set to ask the viewer to scroll to a page. */
  scrollRequest: { page: number; n: number } | null;
  viewerSize: { width: number; height: number };
  fontVersion: number;
  signatureOpen: boolean;
  toasts: Toast[];

  openDocument: (doc: DocumentInfo, pages: PageInfo[], bytes: Uint8Array) => void;
  closeDocument: () => void;
  setLoading: (message: string | null) => void;
  setError: (message: string | null) => void;
  patchDoc: (patch: Partial<DocumentInfo>) => void;

  commit: (objects: EditorObject[], key?: string | null) => void;
  addObject: (o: EditorObject, select?: boolean) => void;
  updateObject: (id: string, patch: Partial<EditorObject>, key?: string | null) => void;
  removeObject: (id: string) => void;
  duplicateObject: (id: string) => void;
  reorderObject: (id: string, direction: 'forward' | 'backward') => void;
  undo: () => void;
  redo: () => void;
  addAsset: (asset: ImageAsset) => void;

  select: (id: string | null) => void;
  setEditingText: (id: string | null) => void;
  setTextSel: (sel: TextSelection | null) => void;
  setTool: (tool: Tool) => void;
  setEditLevel: (level: EditLevel) => void;
  setToolStyle: (patch: Partial<ToolStyle>) => void;
  setZoom: (zoom: number) => void;
  zoomBy: (factor: number) => void;
  fitWidth: () => void;
  fitPage: () => void;
  setCurrentPage: (page: number) => void;
  goToPage: (page: number) => void;
  setViewerSize: (width: number, height: number) => void;
  bumpFonts: () => void;
  setSignatureOpen: (open: boolean) => void;
  setExportState: (patch: Partial<ExportState>) => void;
  setLastExport: (value: EditorState['lastExport']) => void;
  toast: (message: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
}

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));
const idleExport: ExportState = { status: 'idle', progress: 0, label: '', dialog: false };
let toastId = 0;

const defaultToolStyle: ToolStyle = {
  drawColor: '#1d4ed8',
  drawWidth: 2,
  shapeFill: null,
  shapeStroke: '#dc2626',
  shapeStrokeWidth: 2,
  markMode: 'highlight',
  markColor: '#ffe14d',
  text: { fontFamily: 'Helvetica', fontSize: 14, bold: false, italic: false, underline: false, color: '#111827', align: 'left', opacity: 1 },
};

/** State to apply when undo/redo brings back a snapshot. */
function restore(s: EditorState, snap: Snapshot): Partial<EditorState> {
  const pagesChanged = snap.pages !== s.pages;
  if (pagesChanged) clearTextCache();
  return {
    objects: snap.objects,
    pages: snap.pages,
    doc: s.doc && pagesChanged ? { ...s.doc, numPages: snap.pages.length } : s.doc,
    currentPage: Math.min(s.currentPage, snap.pages.length - 1),
    dirty: true,
    editingTextId: null,
    draftText: null,
    textSel: pagesChanged || !s.textSel ? null : { ...s.textSel, editing: false },
    selectedId: s.selectedId && snap.objects.some((o) => o.id === s.selectedId) ? s.selectedId : null,
    extraSelected: [],
  };
}

export const useEditorStore = create<EditorState>((set, get) => ({
  doc: null,
  pages: [],
  bytes: null,
  docKey: 0,
  loading: null,
  error: null,
  objects: [],
  history: emptyHistory(),
  assets: {},
  dirty: false,
  lastExport: null,
  exportState: idleExport,
  selectedId: null,
  extraSelected: [],
  toggleSelect: (id) =>
    set((s) => {
      const target = s.objects.find((o) => o.id === id);
      const first = s.objects.find((o) => o.id === s.selectedId);
      if (!target) return {};
      if (!first || first.pageIndex !== target.pageIndex) return { selectedId: id, extraSelected: [] };
      if (id === s.selectedId) return { selectedId: s.extraSelected[0] ?? null, extraSelected: s.extraSelected.slice(1) };
      return { extraSelected: s.extraSelected.includes(id) ? s.extraSelected.filter((x) => x !== id) : [...s.extraSelected, id] };
    }),
  selectMany: (ids) => set({ selectedId: ids[0] ?? null, extraSelected: ids.slice(1), editingTextId: null }),
  search: { open: false, query: '', replace: '', matchCase: false, hits: [], index: -1, busy: false },
  setSearch: (patch) => set((s) => ({ search: { ...s.search, ...patch } })),
  formValues: {},
  setFormValue: (name, value) => set((s) => ({ formValues: { ...s.formValues, [name]: value }, dirty: true })),
  tabs: [],
  activeTab: null,
  prompt: null,
  setPrompt: (prompt) => set({ prompt }),
  exportPassword: null,
  setExportPassword: (exportPassword) => set({ exportPassword, dirty: true }),
  pageElementsOpen: false,
  setPageElementsOpen: (pageElementsOpen) => set({ pageElementsOpen }),
  editingTextId: null,
  draftText: null,
  setDraftText: (draftText) => set({ draftText }),
  editingCell: null,
  setEditingCell: (editingCell) => set({ editingCell }),
  textSel: null,
  tool: 'select',
  lastShape: 'rect',
  editLevel: 'word',
  toolStyle: defaultToolStyle,
  zoom: 1,
  currentPage: 0,
  scrollRequest: null,
  viewerSize: { width: 0, height: 0 },
  fontVersion: 0,
  signatureOpen: false,
  toasts: [],

  openDocument: (doc, pages, bytes) => {
    Object.values(get().assets).forEach((a) => URL.revokeObjectURL(a.url));
    set((s) => ({
      doc, pages, bytes, docKey: s.docKey + 1, loading: null, error: null,
      objects: [], history: emptyHistory(), assets: {}, sources: {}, dirty: false, lastExport: null, exportState: idleExport, exportPassword: null,
      selectedId: null, extraSelected: [], formValues: {}, editingTextId: null, editingCell: null, draftText: null, textSel: null, tool: 'select', currentPage: 0, scrollRequest: null,
      search: { ...s.search, hits: [], index: -1 },
    }));
  },
  closeDocument: () => {
    Object.values(get().assets).forEach((a) => URL.revokeObjectURL(a.url));
    set({
      doc: null, pages: [], bytes: null, objects: [], history: emptyHistory(), assets: {}, sources: {}, dirty: false,
      lastExport: null, selectedId: null, extraSelected: [], formValues: {}, editingTextId: null, editingCell: null, textSel: null, tool: 'select',
    });
  },
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: null }),
  patchDoc: (patch) => set((s) => (s.doc ? { doc: { ...s.doc, ...patch } } : {})),

  autoSave: { enabled: true, status: 'idle', at: null },
  setAutoSave: (patch) => set((s) => ({ autoSave: { ...s.autoSave, ...patch } })),
  restoreSession: (objects, assets, sources, formValues = {}) =>
    set({ objects, assets, sources, formValues, dirty: objects.length > 0 || Object.keys(formValues).length > 0 }),
  sources: {},
  addSource: (id, name, bytes) => set((s) => ({ sources: { ...s.sources, [id]: { name, bytes } } })),
  commitDoc: (objects, pages) => {
    clearTextCache();
    set((s) => ({
      history: pushHistory(s.history, { objects: s.objects, pages: s.pages }),
      objects,
      pages,
      doc: s.doc ? { ...s.doc, numPages: pages.length } : s.doc,
      dirty: true,
      selectedId: null,
      extraSelected: [],
      editingTextId: null,
      draftText: null,
      textSel: null,
      currentPage: Math.min(s.currentPage, pages.length - 1),
    }));
  },
  commit: (objects, key = null) =>
    set((s) => ({
      history: pushHistory(s.history, { objects: s.objects, pages: s.pages }, key),
      objects,
      dirty: true,
      selectedId: s.selectedId && objects.some((o) => o.id === s.selectedId) ? s.selectedId : null,
      extraSelected: s.extraSelected.length ? s.extraSelected.filter((id) => objects.some((o) => o.id === id)) : s.extraSelected,
    })),
  addObject: (o, select = true) => {
    get().commit([...get().objects, o]);
    if (select) set({ selectedId: o.id, extraSelected: [] });
  },
  updateObject: (id, patch, key = null) => {
    const { objects, commit } = get();
    if (!objects.some((o) => o.id === id)) return;
    commit(objects.map((o) => (o.id === id ? ({ ...o, ...patch } as EditorObject) : o)), key ? `${id}:${key}` : null);
  },
  removeObject: (id) => {
    const { objects, commit } = get();
    if (objects.some((o) => o.id === id)) commit(objects.filter((o) => o.id !== id));
    set((s) => ({ editingTextId: s.editingTextId === id ? null : s.editingTextId }));
  },
  duplicateObject: (id) => {
    const src = get().objects.find((o) => o.id === id);
    if (!src || src.type === 'textedit' || src.type === 'highlight') return;
    const copy = { ...src, id: newId() } as EditorObject;
    if ('points' in copy) {
      (copy as { points: number[] }).points = copy.points.map((v) => v + 12);
    } else if ('x' in copy) {
      copy.x += 12;
      copy.y += 12;
    }
    get().addObject(copy);
  },
  reorderObject: (id, direction) => {
    const { objects, commit } = get();
    const i = objects.findIndex((o) => o.id === id);
    if (i < 0) return;
    // Move past the nearest neighbour on the same page.
    const step = direction === 'forward' ? 1 : -1;
    let j = i + step;
    while (j >= 0 && j < objects.length && objects[j].pageIndex !== objects[i].pageIndex) j += step;
    if (j < 0 || j >= objects.length) return;
    const next = [...objects];
    const [item] = next.splice(i, 1);
    next.splice(j, 0, item);
    commit(next);
  },
  undo: () =>
    set((s) => {
      const r = undoHistory(s.history, { objects: s.objects, pages: s.pages });
      return r ? { history: r.history, ...restore(s, r.state) } : {};
    }),
  redo: () =>
    set((s) => {
      const r = redoHistory(s.history, { objects: s.objects, pages: s.pages });
      return r ? { history: r.history, ...restore(s, r.state) } : {};
    }),
  addAsset: (asset) => set((s) => ({ assets: { ...s.assets, [asset.id]: asset } })),

  select: (selectedId) => set((s) => ({ selectedId, extraSelected: [], editingTextId: s.editingTextId && s.editingTextId !== selectedId ? null : s.editingTextId })),
  setEditingText: (editingTextId) => set({ editingTextId }),
  setTextSel: (textSel) => set({ textSel }),
  setTool: (tool) =>
    set((s) => ({
      tool,
      lastShape: ['rect', 'ellipse', 'line', 'arrow'].includes(tool) ? tool : s.lastShape,
      selectedId: tool === 'select' ? s.selectedId : null,
      extraSelected: tool === 'select' ? s.extraSelected : [],
      editingTextId: null,
      textSel: tool === 'edittext' ? s.textSel : null,
    })),
  setEditLevel: (editLevel) => set({ editLevel, textSel: null }),
  setToolStyle: (patch) => set((s) => ({ toolStyle: { ...s.toolStyle, ...patch } })),
  setZoom: (zoom) => set({ zoom: clampZoom(zoom) }),
  zoomBy: (factor) => set((s) => ({ zoom: clampZoom(s.zoom * factor) })),
  fitWidth: () => {
    const { pages, currentPage, viewerSize } = get();
    const page = pages[currentPage];
    if (page && viewerSize.width) {
      set({ zoom: clampZoom((viewerSize.width - 64) / page.width) });
      get().goToPage(currentPage);
    }
  },
  fitPage: () => {
    const { pages, currentPage, viewerSize } = get();
    const page = pages[currentPage];
    if (page && viewerSize.width) {
      set({ zoom: clampZoom(Math.min((viewerSize.width - 64) / page.width, (viewerSize.height - 48) / page.height)) });
      get().goToPage(currentPage);
    }
  },
  setCurrentPage: (currentPage) => set({ currentPage }),
  goToPage: (page) => set((s) => ({ currentPage: page, scrollRequest: { page, n: (s.scrollRequest?.n ?? 0) + 1 } })),
  setViewerSize: (width, height) => set({ viewerSize: { width, height } }),
  bumpFonts: () => set((s) => ({ fontVersion: s.fontVersion + 1 })),
  setSignatureOpen: (signatureOpen) => set({ signatureOpen }),
  setExportState: (patch) => set((s) => ({ exportState: { ...s.exportState, ...patch } })),
  setLastExport: (lastExport) => set({ lastExport, dirty: false }),
  toast: (message, kind = 'info') => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, message }] }));
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 9000 : 4500);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const getState = () => useEditorStore.getState();
