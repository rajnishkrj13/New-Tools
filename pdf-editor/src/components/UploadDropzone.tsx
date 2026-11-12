import { useDropzone } from 'react-dropzone';
import { useEffect, useState } from 'react';
import { FileText, FileUp, History, ShieldCheck, TriangleAlert } from 'lucide-react';
import { discardSavedSession, getSavedSession, resumeSavedSession, type SavedSession } from '../hooks/useAutoSave';
import { openPdfFile } from '../hooks/usePdfDocument';
import { getState, useEditorStore } from '../store/documentStore';

/** Start screen: choose or drop a PDF. */
export function UploadDropzone() {
  const error = useEditorStore((s) => s.error);
  const [saved, setSaved] = useState<SavedSession | null>(null);
  useEffect(() => {
    let dead = false;
    getSavedSession().then((s) => !dead && setSaved(s));
    return () => {
      dead = true;
    };
  }, []);
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
    noClick: true,
    onDropAccepted: ([file]) => openPdfFile(file),
    onDropRejected: () => getState().setError('Only a single PDF file can be opened.'),
  });

  return (
    <div className="flex min-h-screen flex-col bg-workspace">
      <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-5 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white">
          <FileText size={17} />
        </span>
        <span className="text-sm font-semibold text-slate-900">PDF Editor</span>
      </header>
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-xl">
          <h1 className="text-center text-2xl font-semibold tracking-tight text-slate-900">Edit a PDF in your browser</h1>
          <p className="mt-2 text-center text-sm text-slate-600">
            Change existing text, add text and images, white out, sign, draw and download the result.
          </p>
          <div
            {...getRootProps()}
            className={`mt-6 flex flex-col items-center rounded-2xl border-2 border-dashed bg-white px-6 py-12 text-center transition-colors ${
              isDragActive ? 'border-brand-500 bg-brand-50' : 'border-slate-300'
            }`}
          >
            <input {...getInputProps()} aria-label="Choose PDF file" />
            <FileUp size={40} className="text-brand-500" />
            <button type="button" onClick={open} className="mt-4 h-11 rounded-lg bg-brand-500 px-6 text-sm font-semibold text-white shadow-sm hover:bg-brand-600">
              Upload PDF file
            </button>
            <p className="mt-3 text-sm text-slate-500">or drop a PDF here</p>
          </div>
          {saved && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-brand-500/30 bg-brand-50 px-4 py-3">
              <History size={20} className="shrink-0 text-brand-600" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-900">Continue where you left off: {saved.fileName}</div>
                <div className="text-xs text-slate-600">
                  {saved.pages.length} page{saved.pages.length === 1 ? '' : 's'} · {saved.objects.length} edit{saved.objects.length === 1 ? '' : 's'} · saved{' '}
                  {new Date(saved.savedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} in this browser
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await discardSavedSession();
                  setSaved(null);
                }}
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Discard
              </button>
              <button type="button" onClick={() => resumeSavedSession()} className="h-9 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600">
                Continue
              </button>
            </div>
          )}
          {error && (
            <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-emerald-700">
            <ShieldCheck size={14} />
            Files are processed on this device only. Nothing is uploaded to a server.
          </p>
        </div>
      </main>
    </div>
  );
}
