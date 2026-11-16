import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Check, Circle, ClipboardList, PenLine, Plus, X } from 'lucide-react';
import { DATE_FORMATS, detailEntries, formatDate, type DateFormat, type SavedMark } from '../engines/Profile';
import { getState, useEditorStore } from '../store/documentStore';
import { deleteMark, fillFormFromDetails, placeDetail, placeMark, placeSavedMark, placeToday, setDateFormat } from '../store/profileActions';

function MarkThumb({ mark, onUse }: { mark: SavedMark; onUse: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const u = URL.createObjectURL(new Blob([mark.png.slice().buffer], { type: mark.mime ?? 'image/png' }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [mark]);
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onUse}
        title={`Place this ${mark.kind}`}
        aria-label={`Place saved ${mark.kind}`}
        className="flex h-14 w-full items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 hover:border-brand-500 hover:bg-brand-50"
      >
        {url && <img src={url} alt="" className="max-h-full max-w-full object-contain" />}
      </button>
      <button
        type="button"
        aria-label={`Delete saved ${mark.kind}`}
        title="Delete"
        onClick={() => window.confirm(`Delete this saved ${mark.kind}?`) && deleteMark(mark.id)}
        className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-white text-slate-500 shadow ring-1 ring-slate-200 hover:text-red-600 group-hover:flex"
      >
        <X size={11} />
      </button>
    </div>
  );
}

/** The Sign button: saved signatures and initials, date, tick marks and your saved details. */
export function SignMenu({ button }: { button: (open: () => void, active: boolean) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const profile = useEditorStore((s) => s.profile);
  const placing = useEditorStore((s) => s.tool === 'place');

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && !pop.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const act = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  const signatures = profile.marks.filter((m) => m.kind === 'signature');
  const initials = profile.marks.filter((m) => m.kind === 'initials');
  const details = detailEntries(profile.details);
  const today = new Date();
  const head = 'mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-400';
  const pill = 'flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2 text-xs font-medium text-slate-700 hover:border-brand-500 hover:bg-brand-50';
  const newBtn = 'flex h-14 items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-xs font-medium text-slate-500 hover:border-brand-500 hover:text-brand-700';

  return (
    <div ref={ref} className="relative shrink-0">
      {button(() => setOpen(!open), open || placing)}
      {open && createPortal(
        <div ref={pop} role="dialog" aria-label="Sign and fill" className="fixed left-1/2 top-[64px] z-50 max-h-[80vh] w-[380px] -translate-x-1/2 overflow-y-auto rounded-xl bg-white p-3 shadow-float">
          <section>
            <div className={head}>Signature</div>
            <div className="grid grid-cols-3 gap-2">
              {signatures.map((m) => (
                <MarkThumb key={m.id} mark={m} onUse={act(() => placeSavedMark(m))} />
              ))}
              <button type="button" onClick={act(() => getState().setSignatureOpen(true, 'signature'))} className={newBtn}>
                <Plus size={14} /> New
              </button>
            </div>
          </section>
          <section className="mt-3">
            <div className={head}>Initials</div>
            <div className="grid grid-cols-4 gap-2">
              {initials.map((m) => (
                <MarkThumb key={m.id} mark={m} onUse={act(() => placeSavedMark(m))} />
              ))}
              <button type="button" onClick={act(() => getState().setSignatureOpen(true, 'initials'))} className={newBtn}>
                <Plus size={14} /> New
              </button>
            </div>
          </section>
          <section className="mt-3">
            <div className={head}>Date and marks</div>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={act(placeToday)} className={`${pill} flex-1`} title="Click on the page to put today's date there">
                <CalendarDays size={14} /> {formatDate(today, profile.dateFormat)}
              </button>
              <select
                aria-label="Date format"
                value={profile.dateFormat}
                onChange={(e) => setDateFormat(e.target.value as DateFormat)}
                className="h-8 w-[118px] rounded-lg border border-slate-200 bg-white px-1 text-xs text-slate-600"
              >
                {DATE_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {formatDate(today, f)}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              <button type="button" onClick={act(() => placeMark('check'))} className={pill}>
                <Check size={15} /> Tick
              </button>
              <button type="button" onClick={act(() => placeMark('cross'))} className={pill}>
                <X size={15} className="text-red-700" /> Cross
              </button>
              <button type="button" onClick={act(() => placeMark('dot'))} className={pill}>
                <Circle size={10} className="fill-slate-800" /> Dot
              </button>
            </div>
          </section>
          <section className="mt-3">
            <div className={head}>
              My details
              <button type="button" onClick={act(() => getState().setProfileOpen(true))} className="flex items-center gap-1 normal-case tracking-normal text-brand-700 hover:underline">
                <PenLine size={11} /> Edit
              </button>
            </div>
            {details.length ? (
              <div className="space-y-1">
                {details.map((d) => (
                  <button
                    key={d.label}
                    type="button"
                    onClick={act(() => placeDetail(d.label, d.value))}
                    className="flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left hover:bg-slate-100"
                    title="Click, then click on the page where it should go"
                  >
                    <span className="w-20 shrink-0 text-[11px] text-slate-500">{d.label}</span>
                    <span className="truncate text-xs text-slate-800">{d.value.replace(/\n/g, ', ')}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">Save your name, email, phone and address once, then drop them into any form.</p>
            )}
            <button
              type="button"
              disabled={!details.length}
              onClick={act(() => void fillFormFromDetails())}
              className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-brand-500 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
            >
              <ClipboardList size={14} /> Fill this form's fields from my details
            </button>
          </section>
          <p className="mt-3 text-[10.5px] leading-snug text-slate-500">
            Saved signatures and details stay in this browser on this device.
          </p>
        </div>,
        document.body,
      )}
    </div>
  );
}

