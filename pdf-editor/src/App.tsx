import { useDropzone } from 'react-dropzone';
import { CircleCheck, CircleX, Info, Loader2, TriangleAlert, X } from 'lucide-react';
import { ExportDialog } from './components/ExportDialog';
import { PdfViewer } from './components/PdfViewer';
import { SearchPanel } from './components/SearchPanel';
import { TabBar } from './components/TabBar';
import { PromptDialog } from './components/PromptDialog';
import { PageElementsDialog } from './components/PageElementsDialog';
import { PropertiesPanel } from './components/PropertiesPanel';
import { Sidebar } from './components/Sidebar';
import { SignatureEditor } from './components/SignatureEditor';
import { Toolbar } from './components/Toolbar';
import { UploadDropzone } from './components/UploadDropzone';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { insertImageFile, openPdfFile } from './hooks/usePdfDocument';
import { getState, useEditorStore } from './store/documentStore';

const TOAST_STYLE = {
  info: { cls: 'bg-slate-900 text-white', icon: <Info size={15} /> },
  success: { cls: 'bg-emerald-700 text-white', icon: <CircleCheck size={15} /> },
  warning: { cls: 'bg-amber-100 text-amber-900 ring-1 ring-amber-300', icon: <TriangleAlert size={15} /> },
  error: { cls: 'bg-red-600 text-white', icon: <CircleX size={15} /> },
};

function Toasts() {
  const toasts = useEditorStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`pointer-events-auto flex max-w-lg items-start gap-2 rounded-lg px-3 py-2 text-sm shadow-float ${TOAST_STYLE[t.kind].cls}`}>
          <span className="mt-0.5 shrink-0">{TOAST_STYLE[t.kind].icon}</span>
          <span>{t.message}</span>
          <button type="button" aria-label="Dismiss" onClick={() => getState().dismissToast(t.id)} className="ml-1 mt-0.5 shrink-0 opacity-70 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function Editor() {
  const docKey = useEditorStore((s) => s.docKey);
  const error = useEditorStore((s) => s.error);
  // Files dropped outside a page: a PDF replaces the document, images go to the current page.
  const { getRootProps, isDragActive } = useDropzone({
    noClick: true,
    noKeyboard: true,
    onDrop: (files) => {
      const pdf = files.find((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
      if (pdf) return void openPdfFile(pdf);
      const images = files.filter((f) => /^image\/(png|jpeg|webp)$/.test(f.type));
      if (!images.length) return getState().toast('Drop a PDF, or a PNG, JPG or WebP image.', 'warning');
      images.forEach((f) => insertImageFile(f));
    },
  });

  return (
    <div {...getRootProps()} className="flex h-screen flex-col overflow-hidden bg-workspace outline-none">
      <Toolbar />
      <TabBar />
      {error && (
        <div role="alert" className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <TriangleAlert size={15} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" aria-label="Dismiss" onClick={() => getState().setError(null)}>
            <X size={15} />
          </button>
        </div>
      )}
      <div className="relative flex min-h-0 flex-1">
        <Sidebar key={`s${docKey}`} />
        <PdfViewer key={`v${docKey}`} />
        <SearchPanel />
        <PropertiesPanel />
        {isDragActive && (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-brand-500/10 ring-4 ring-inset ring-brand-500">
            <span className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow-float">Drop a PDF to open it, or an image to place it</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const hasDoc = useEditorStore((s) => !!s.doc);
  const loading = useEditorStore((s) => s.loading);
  useKeyboardShortcuts();
  return (
    <>
      {hasDoc ? <Editor /> : <UploadDropzone />}
      <SignatureEditor />
      <PromptDialog />
      <PageElementsDialog />
      <ExportDialog />
      <Toasts />
      {loading && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-white/70" role="status">
          <div className="flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-medium text-slate-700 shadow-float">
            <Loader2 size={18} className="animate-spin text-brand-500" /> {loading}
          </div>
        </div>
      )}
    </>
  );
}
