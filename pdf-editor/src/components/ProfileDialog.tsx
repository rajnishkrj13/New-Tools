import { useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { DETAIL_FIELDS, type Details } from '../engines/Profile';
import { getState, useEditorStore } from '../store/documentStore';
import { forgetEverything, saveDetails } from '../store/profileActions';

/** Your details for forms: saved once, used in the Sign menu and to fill form fields. */
export function ProfileDialog() {
  const open = useEditorStore((s) => s.profileOpen);
  const saved = useEditorStore((s) => s.profile.details);
  const count = useEditorStore((s) => s.profile.marks.length);
  const [d, setD] = useState<Details>(saved);
  useEffect(() => {
    if (open) setD(saved);
  }, [open]);
  if (!open) return null;
  const close = () => getState().setProfileOpen(false);
  const field = 'mt-1 w-full rounded-md border border-slate-200 px-2 text-sm text-slate-800';

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label="My details" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-2xl bg-white p-5 shadow-float" onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), close())}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">My details</h2>
          <button type="button" aria-label="Close" onClick={close} className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        <p className="mb-3 text-xs leading-snug text-slate-500">
          Fill in what you type into forms often. They are kept in this browser on this device only, and appear in the Sign menu. Leave out anything you would not want saved here.
        </p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {DETAIL_FIELDS.map((f) => (
            <label key={f.key} className={`block text-xs font-medium text-slate-600 ${f.multiline ? 'sm:col-span-2' : ''}`}>
              {f.label}
              {f.multiline ? (
                <textarea rows={2} value={d[f.key]} onChange={(e) => setD({ ...d, [f.key]: e.target.value })} className={`${field} py-1.5`} />
              ) : (
                <input value={d[f.key]} onChange={(e) => setD({ ...d, [f.key]: e.target.value })} className={`${field} h-9`} />
              )}
            </label>
          ))}
        </div>
        <div className="mt-3">
          <div className="mb-1 text-xs font-medium text-slate-600">Other details</div>
          {d.custom.map((c, i) => (
            <div key={i} className="mb-1.5 flex gap-1.5">
              <input aria-label="Label" placeholder="Label, e.g. Customer ID" value={c.label} onChange={(e) => setD({ ...d, custom: d.custom.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} className={`${field} mt-0 h-9 w-2/5`} />
              <input aria-label="Value" placeholder="Value" value={c.value} onChange={(e) => setD({ ...d, custom: d.custom.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)) })} className={`${field} mt-0 h-9 flex-1`} />
              <button type="button" aria-label="Remove" onClick={() => setD({ ...d, custom: d.custom.filter((_, k) => k !== i) })} className="rounded-md px-2 text-slate-500 hover:bg-slate-100 hover:text-red-600">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setD({ ...d, custom: [...d.custom, { label: '', value: '' }] })} className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
            <Plus size={13} /> Add a detail
          </button>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(`Delete your saved details${count ? ` and ${count} saved signature${count > 1 ? 's' : ''} and initials` : ''} from this browser?`)) return;
              forgetEverything();
              close();
            }}
            className="mr-auto h-9 rounded-lg border border-red-200 px-3 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Delete everything saved
          </button>
          <button type="button" onClick={close} className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              saveDetails({ ...d, custom: d.custom.filter((c) => c.label.trim() || c.value.trim()) });
              close();
              getState().toast('Your details are saved in this browser.', 'success');
            }}
            className="h-9 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
