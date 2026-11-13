import { useState } from 'react';
import { X } from 'lucide-react';
import { getState, useEditorStore } from '../store/documentStore';
import { STAMPS, addHeaderFooter, addStamp, addWatermark, type Corner } from '../store/pageElementActions';

type Tab = 'header' | 'watermark' | 'stamp';

const field = 'h-8 w-full rounded-md border border-slate-200 px-2 text-sm';
const label = 'flex flex-col gap-1 text-xs font-medium text-slate-600';

/** Header and footer, page numbers, watermark and stamps. */
export function PageElementsDialog() {
  const open = useEditorStore((s) => s.pageElementsOpen);
  const pageCount = useEditorStore((s) => s.pages.length);
  const current = useEditorStore((s) => s.currentPage);
  const [tab, setTab] = useState<Tab>('header');
  const [text, setText] = useState('Page {page} of {pages}');
  const [position, setPosition] = useState<Corner>('bottom-center');
  const [fontSize, setFontSize] = useState(10);
  const [margin, setMargin] = useState(28);
  const [color, setColor] = useState('#374151');
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(0);
  const [mark, setMark] = useState('CONFIDENTIAL');
  const [markSize, setMarkSize] = useState(64);
  const [markColor, setMarkColor] = useState('#dc2626');
  const [markOpacity, setMarkOpacity] = useState(0.18);
  const [markAngle, setMarkAngle] = useState(-45);
  const [stamp, setStamp] = useState('APPROVED');
  const [stampColor, setStampColor] = useState('#dc2626');
  const [stampAll, setStampAll] = useState(false);

  if (!open) return null;
  const close = () => getState().setPageElementsOpen(false);
  const lastPage = to || pageCount;
  const range = (
    <div className="grid grid-cols-2 gap-3">
      <label className={label}>
        From page
        <input type="number" min={1} max={pageCount} value={from} onChange={(e) => setFrom(Number(e.target.value) || 1)} className={field} />
      </label>
      <label className={label}>
        To page
        <input type="number" min={1} max={pageCount} value={lastPage} onChange={(e) => setTo(Number(e.target.value) || 0)} className={field} />
      </label>
    </div>
  );
  const apply = () => {
    if (tab === 'header') addHeaderFooter({ text, position, fontSize, margin, color, from, to: lastPage });
    else if (tab === 'watermark') addWatermark({ text: mark, fontSize: markSize, color: markColor, opacity: markOpacity, angle: markAngle, from, to: lastPage });
    else addStamp({ text: stamp, color: stampColor, allPages: stampAll });
    close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label="Page elements" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="w-full max-w-[520px] rounded-2xl bg-white p-5 shadow-float">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Add to pages</h2>
          <button type="button" aria-label="Close" onClick={close} className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        <div className="mb-4 flex rounded-lg bg-slate-100 p-0.5" role="tablist">
          {(
            [
              ['header', 'Header, footer, page numbers'],
              ['watermark', 'Watermark'],
              ['stamp', 'Stamp'],
            ] as [Tab, string][]
          ).map(([id, name]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium ${tab === id ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {name}
            </button>
          ))}
        </div>

        {tab === 'header' && (
          <div className="space-y-3">
            <label className={label}>
              Text
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm" />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {['Page {page} of {pages}', '{page}', '{file}', '{date}'].map((t) => (
                <button key={t} type="button" onClick={() => setText(t.startsWith('Page') || t === '{page}' ? t : `${text} ${t}`.trim())} className="rounded-md border border-slate-200 px-2 py-1 font-mono text-[11px] text-slate-600 hover:bg-slate-50">
                  {t}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">{'{page}'}, {'{pages}'}, {'{date}'} and {'{file}'} are filled in on each page.</p>
            <div className="grid grid-cols-2 gap-3">
              <label className={label}>
                Position
                <select value={position} onChange={(e) => setPosition(e.target.value as Corner)} className={field}>
                  <option value="top-left">Top left (header)</option>
                  <option value="top-center">Top centre (header)</option>
                  <option value="top-right">Top right (header)</option>
                  <option value="bottom-left">Bottom left (footer)</option>
                  <option value="bottom-center">Bottom centre (footer)</option>
                  <option value="bottom-right">Bottom right (footer)</option>
                </select>
              </label>
              <label className={label}>
                Text colour
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-full cursor-pointer rounded-md border border-slate-200 bg-white p-0.5" />
              </label>
              <label className={label}>
                Font size (pt)
                <input type="number" min={5} max={48} value={fontSize} onChange={(e) => setFontSize(Math.max(5, Number(e.target.value) || 10))} className={field} />
              </label>
              <label className={label}>
                Distance from edge (pt)
                <input type="number" min={0} max={200} value={margin} onChange={(e) => setMargin(Math.max(0, Number(e.target.value) || 0))} className={field} />
              </label>
            </div>
            {range}
          </div>
        )}

        {tab === 'watermark' && (
          <div className="space-y-3">
            <label className={label}>
              Text
              <input value={mark} onChange={(e) => setMark(e.target.value)} className={field} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className={label}>
                Font size (pt)
                <input type="number" min={12} max={200} value={markSize} onChange={(e) => setMarkSize(Math.max(12, Number(e.target.value) || 64))} className={field} />
              </label>
              <label className={label}>
                Angle (degrees)
                <input type="number" min={-90} max={90} value={markAngle} onChange={(e) => setMarkAngle(Number(e.target.value) || 0)} className={field} />
              </label>
              <label className={label}>
                Colour
                <input type="color" value={markColor} onChange={(e) => setMarkColor(e.target.value)} className="h-8 w-full cursor-pointer rounded-md border border-slate-200 bg-white p-0.5" />
              </label>
              <label className={label}>
                Opacity {Math.round(markOpacity * 100)}%
                <input type="range" min={0.05} max={0.6} step={0.01} value={markOpacity} onChange={(e) => setMarkOpacity(Number(e.target.value))} />
              </label>
            </div>
            {range}
          </div>
        )}

        {tab === 'stamp' && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {STAMPS.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={stamp === s}
                  onClick={() => setStamp(s)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${stamp === s ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className={label}>
                Stamp text
                <input value={stamp} onChange={(e) => setStamp(e.target.value.toUpperCase())} className={field} />
              </label>
              <label className={label}>
                Colour
                <input type="color" value={stampColor} onChange={(e) => setStampColor(e.target.value)} className="h-8 w-full cursor-pointer rounded-md border border-slate-200 bg-white p-0.5" />
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={stampAll} onChange={(e) => setStampAll(e.target.checked)} />
              Put it on every page (otherwise only page {current + 1})
            </label>
          </div>
        )}

        <p className="mt-4 text-[11px] leading-snug text-slate-500">
          Each one is added as a normal text box on its pages: you can still move, restyle or delete it, on one page or on all of them.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={close} className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button type="button" onClick={apply} className="h-9 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600">
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
