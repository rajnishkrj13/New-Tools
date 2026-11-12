import { CircleCheck, CircleX, Download, Loader2, TriangleAlert } from 'lucide-react';
import { getState, useEditorStore } from '../store/documentStore';
import { downloadBytes } from '../utils/imageUtils';

/** Progress, result and errors of building the edited PDF. */
export function ExportDialog() {
  const st = useEditorStore((s) => s.exportState);
  const last = useEditorStore((s) => s.lastExport);
  const visible = st.status === 'running' || (st.dialog && (st.status === 'done' || st.status === 'error'));
  if (!visible) return null;
  const close = () => getState().setExportState({ status: 'idle', dialog: false });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label="Export">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-float">
        {st.status === 'running' && (
          <>
            <div className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <Loader2 size={18} className="animate-spin text-brand-500" /> Applying changes…
            </div>
            <p className="mt-1 text-sm text-slate-500">{st.label}</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.round(st.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${Math.max(4, st.progress * 100)}%` }} />
            </div>
          </>
        )}
        {st.status === 'done' && (
          <>
            <div className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <CircleCheck size={20} className="text-emerald-600" /> Changes applied
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {st.objectsWritten
                ? `${st.objectsWritten} edit${st.objectsWritten === 1 ? '' : 's'} written to ${st.pagesModified} page${st.pagesModified === 1 ? '' : 's'}. The file was checked and is ready.`
                : st.structureChanged
                  ? 'The file was checked and is ready.'
                  : 'There were no edits to apply. The file is unchanged and ready.'}
            </p>
            {st.structureChanged && <p className="mt-2 text-sm text-slate-600">Page changes (order, rotation, added or deleted pages) were applied.</p>}
            {!!st.removedGlyphs && (
              <p className="mt-2 text-sm text-slate-600">
                The original text you replaced was deleted from the file ({st.removedGlyphs} characters), not just covered.
              </p>
            )}
            {!!st.flattenedPages?.length && (
              <p className="mt-2 text-sm text-slate-600">
                Securely redacted (converted to an image): page {st.flattenedPages.map((p) => p + 1).join(', ')}.
              </p>
            )}
            {!!st.warnings?.length && (
              <ul className="mt-3 space-y-1 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                {st.warnings.map((w) => (
                  <li key={w} className="flex gap-1.5">
                    <TriangleAlert size={13} className="mt-0.5 shrink-0" /> {w}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={close} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Keep editing
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => {
                  if (last) downloadBytes(last.bytes, last.fileName);
                  close();
                }}
                className="flex h-10 items-center gap-1.5 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"
              >
                <Download size={16} /> Download PDF
              </button>
            </div>
          </>
        )}
        {st.status === 'error' && (
          <>
            <div className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <CircleX size={20} className="text-red-600" /> The PDF was not exported
            </div>
            <p className="mt-2 text-sm text-slate-700">{st.error}</p>
            {!!st.details?.length && (
              <ul className="mt-3 max-h-48 list-disc space-y-1 overflow-y-auto rounded-lg bg-red-50 p-3 pl-7 text-xs text-red-800">
                {st.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-slate-500">Your edits are still in the editor. Nothing was lost.</p>
            <div className="mt-5 flex justify-end">
              <button type="button" autoFocus onClick={close} className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700">
                Back to the editor
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
