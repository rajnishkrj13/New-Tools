import { useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { FileText, FileUp, History, Images, ShieldCheck, TriangleAlert } from 'lucide-react';
import { discardSavedSessions, getSavedSessions, resumeSavedSessions, type SavedSummary } from '../hooks/useAutoSave';
import { createFromImages } from '../hooks/useFileTools';
import { openPdfFile } from '../hooks/usePdfDocument';
import { getState, useEditorStore } from '../store/documentStore';

const isImage = (f: File) => /^image\/(png|jpeg|webp)$/.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name);

/** Start screen: choose or drop a PDF (or pictures to make one), or continue saved work. */
export function UploadDropzone() {
  const error = useEditorStore((s) => s.error);
  const [saved, setSaved] = useState<SavedSummary[]>([]);
  const images = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let dead = false;
    getSavedSessions().then((s) => !dead && setSaved(s.list));
    return () => {
      dead = true;
    };
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: { 'application/pdf': ['.pdf'], 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/webp': ['.webp'] },
    multiple: true,
    noClick: true,
    onDropAccepted: async (files) => {
      const pictures = files.filter(isImage);
      const pdfs = files.filter((f) => !isImage(f));
      for (const f of pdfs) await openPdfFile(f);
      if (pictures.length) await createFromImages(pictures);
    },
    onDropRejected: () => getState().setError('Only PDF files, or PNG, JPG and WebP pictures, can be opened.'),
  });
  const newest = saved.reduce<SavedSummary | null>((a, b) => (!a || b.session.savedAt > a.session.savedAt ? b : a), null);
  const edits = saved.reduce((n, x) => n + x.session.objects.length, 0);

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
            <p className="mt-3 text-sm text-slate-500">or drop PDFs here (each opens in its own tab)</p>
            <button type="button" onClick={() => images.current?.click()} className="mt-4 flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
              <Images size={15} /> Make a PDF from pictures
            </button>
            <input
              ref={images}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              hidden
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = '';
                createFromImages(files);
              }}
            />
          </div>
          {newest && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-brand-500/30 bg-brand-50 px-4 py-3">
              <History size={20} className="shrink-0 text-brand-600" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-900">
                  Continue where you left off: {saved[0].session.fileName}
                  {saved.length > 1 ? ` and ${saved.length - 1} more` : ''}
                </div>
                <div className="text-xs text-slate-600">
                  {saved.length} document{saved.length === 1 ? '' : 's'} · {edits} edit{edits === 1 ? '' : 's'} · saved{' '}
                  {new Date(newest.session.savedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} in this browser
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await discardSavedSessions();
                  setSaved([]);
                }}
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Discard
              </button>
              <button type="button" onClick={() => resumeSavedSessions()} className="h-9 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600">
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
