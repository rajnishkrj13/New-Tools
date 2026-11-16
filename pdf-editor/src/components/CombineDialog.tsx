import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, FileImage, FileText, Plus, Trash2, X } from 'lucide-react';
import { imagesToPdf, mergePdfs } from '../engines/PdfTools';
import { ensureUnlocked, openPdfBytes } from '../hooks/usePdfDocument';
import { getState, useEditorStore } from '../store/documentStore';
import { importImageFile } from '../utils/imageUtils';
import { validatePdfFile } from '../utils/validationUtils';

const isImage = (f: File) => /^image\/(png|jpeg|webp)$/.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name);
const size = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Puts several PDFs (and pictures) together into one new document, in the order shown. */
export async function combineFiles(files: File[]): Promise<boolean> {
  const s = getState();
  const parts: Uint8Array[] = [];
  try {
    for (const [i, f] of files.entries()) {
      s.setLoading(`Reading ${f.name} (${i + 1} of ${files.length})…`);
      if (isImage(f)) {
        const a = await importImageFile(f);
        URL.revokeObjectURL(a.url);
        parts.push(await imagesToPdf([{ bytes: a.bytes, mime: a.mime, width: a.width, height: a.height }]));
        continue;
      }
      const raw = new Uint8Array(await f.arrayBuffer());
      const problem = validatePdfFile(f.name, raw);
      if (problem) throw new Error(problem);
      const plain = await ensureUnlocked(f.name, raw);
      if (!plain) {
        getState().setLoading(null);
        getState().toast(`Combining was stopped: "${f.name}" needs its password.`, 'info');
        return false;
      }
      parts.push(plain);
    }
    getState().setLoading('Combining…');
    const { bytes, counts } = await mergePdfs(parts);
    await openPdfBytes(files.length === 1 ? files[0].name : 'combined.pdf', bytes);
    const total = counts.reduce((a, b) => a + b, 0);
    getState().toast(`Combined ${files.length} files into one document of ${total} page${total === 1 ? '' : 's'}, opened in a new tab.`, 'success');
    return true;
  } catch (e: any) {
    getState().setLoading(null);
    getState().toast(`The files could not be combined: ${e?.message ?? 'unknown error'}`, 'error');
    return false;
  }
}

export function CombineDialog() {
  const files = useEditorStore((s) => s.combine);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  if (!files) return null;
  const set = (next: File[]) => getState().setCombine(next);
  const close = () => getState().setCombine(null);
  const move = (i: number, d: -1 | 1) => {
    const next = [...files];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    set(next);
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label="Combine files" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        className="flex max-h-[88vh] w-full max-w-[520px] flex-col rounded-2xl bg-white p-5 shadow-float"
        onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), close())}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const dropped = Array.from(e.dataTransfer.files).filter((f) => isImage(f) || /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
          if (dropped.length) set([...files, ...dropped]);
        }}
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Combine files</h2>
          <button type="button" aria-label="Close" onClick={close} className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        <p className="mb-3 text-xs text-slate-500">Add PDFs or pictures and put them in order. They are joined into one new document in a new tab; the originals are not changed.</p>
        <ol className="min-h-[80px] flex-1 space-y-1.5 overflow-y-auto rounded-lg border border-dashed border-slate-300 p-2" aria-label="Files to combine">
          {!files.length && <li className="py-6 text-center text-sm text-slate-400">Add files, or drop them here</li>}
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5">
              <span className="w-5 text-right text-xs tabular-nums text-slate-400">{i + 1}</span>
              {isImage(f) ? <FileImage size={15} className="shrink-0 text-emerald-600" /> : <FileText size={15} className="shrink-0 text-brand-500" />}
              <span className="min-w-0 flex-1 truncate text-sm text-slate-800" title={f.name}>
                {f.name}
              </span>
              <span className="text-[11px] tabular-nums text-slate-400">{size(f.size)}</span>
              <button type="button" aria-label={`Move ${f.name} up`} disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-slate-500 hover:bg-slate-200 disabled:opacity-25">
                <ArrowUp size={14} />
              </button>
              <button type="button" aria-label={`Move ${f.name} down`} disabled={i === files.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-slate-500 hover:bg-slate-200 disabled:opacity-25">
                <ArrowDown size={14} />
              </button>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => set(files.filter((_, k) => k !== i))} className="rounded p-1 text-slate-500 hover:bg-red-100 hover:text-red-600">
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={() => input.current?.click()} className="mr-auto flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Plus size={15} /> Add files
          </button>
          <button type="button" onClick={close} className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            disabled={files.length < 2 || busy}
            onClick={async () => {
              setBusy(true);
              const list = files;
              close();
              await combineFiles(list);
              setBusy(false);
            }}
            className="h-9 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
          >
            Combine {files.length > 1 ? `${files.length} files` : ''}
          </button>
        </div>
        <input
          ref={input}
          type="file"
          multiple
          accept="application/pdf,.pdf,image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            const added = Array.from(e.target.files ?? []);
            e.target.value = '';
            set([...files, ...added]);
          }}
        />
      </div>
    </div>
  );
}
