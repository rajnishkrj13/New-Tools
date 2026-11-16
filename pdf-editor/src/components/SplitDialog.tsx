import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { splitGroups, type SplitSpec } from '../engines/PdfTools';
import { splitDocument } from '../hooks/useFileTools';
import { getState, useEditorStore } from '../store/documentStore';

type Mode = 'every' | 'ranges' | 'single';

const describe = (pages: number[]) => {
  if (pages.length === 1) return `${pages[0] + 1}`;
  const runs = pages.every((p, k) => k === 0 || p === pages[k - 1] + 1);
  return runs ? `${pages[0] + 1}–${pages[pages.length - 1] + 1}` : `${pages.length} pages`;
};

/** Split the document into several PDFs: every N pages, by ranges, or one file per page. */
export function SplitDialog() {
  const open = useEditorStore((s) => s.splitOpen);
  const count = useEditorStore((s) => s.pages.length);
  const [mode, setMode] = useState<Mode>('every');
  const [size, setSize] = useState('2');
  const [ranges, setRanges] = useState('');
  const [rest, setRest] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open && !ranges) setRanges(count > 2 ? `1-${Math.ceil(count / 2)}, ${Math.ceil(count / 2) + 1}-${count}` : '1');
  }, [open]);
  if (!open) return null;
  const close = () => getState().setSplitOpen(false);

  const spec: SplitSpec = mode === 'ranges' ? { mode: 'ranges', text: ranges, rest } : { mode: 'every', size: mode === 'single' ? 1 : Number(size) };
  const groups = splitGroups(spec, count);
  const error = groups
    ? null
    : mode === 'ranges'
      ? `Use page numbers between 1 and ${count}; commas separate the files, for example 1-3, 4-8, 9-${count}.`
      : 'Enter a whole number of pages.';
  const field = 'h-8 rounded-md border border-slate-200 px-2 text-sm text-slate-800';
  const radio = (value: Mode, label: React.ReactNode) => (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="radio" name="split-mode" checked={mode === value} onChange={() => setMode(value)} />
      {label}
    </label>
  );

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label="Split into several files" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="w-full max-w-[480px] rounded-2xl bg-white p-5 shadow-float" onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), close())}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Split into several files</h2>
          <button type="button" aria-label="Close" onClick={close} className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        <p className="mb-3 text-xs text-slate-500">Saves parts of this {count}-page document as separate PDFs, with your edits. Several files come together in one ZIP. This document is not changed.</p>
        <div className="space-y-2.5">
          {radio(
            'every',
            <span className="flex items-center gap-1.5">
              Every
              <input aria-label="Pages per file" type="number" min={1} max={count} value={size} onFocus={() => setMode('every')} onChange={(e) => setSize(e.target.value)} className={`${field} w-16`} />
              pages
            </span>,
          )}
          {radio('single', 'Every page as its own file')}
          {radio('ranges', 'By page ranges')}
          {mode === 'ranges' && (
            <div className="ml-6 space-y-1.5">
              <input aria-label="Page ranges" value={ranges} onChange={(e) => setRanges(e.target.value)} placeholder={`1-3, 4-8, 9-${count}`} className={`${field} w-full`} />
              <p className="text-[11px] text-slate-500">Commas separate the files. "9-" means page 9 to the end.</p>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={rest} onChange={(e) => setRest(e.target.checked)} /> Put the pages not listed in one more file
              </label>
            </div>
          )}
        </div>
        <div className={`mt-4 rounded-lg px-3 py-2 text-xs ${error ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-600'}`} aria-live="polite">
          {error ??
            `Makes ${groups!.length} file${groups!.length > 1 ? 's' : ''}: ${groups!
              .slice(0, 8)
              .map((g) => describe(g))
              .join(' · ')}${groups!.length > 8 ? ` · … ${groups!.length - 8} more` : ''}`}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={close} className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            disabled={!groups || busy}
            onClick={async () => {
              setBusy(true);
              const made = await splitDocument(groups!);
              setBusy(false);
              if (made) close();
            }}
            className="h-9 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
          >
            {busy ? 'Splitting…' : 'Split and download'}
          </button>
        </div>
      </div>
    </div>
  );
}
