import { useRef } from 'react';
import { FileText, Plus, X } from 'lucide-react';
import { openPdfFile } from '../hooks/usePdfDocument';
import { useEditorStore } from '../store/documentStore';
import { closeTab, switchTab } from '../store/tabActions';

/** One tab per open document. */
export function TabBar() {
  const tabs = useEditorStore((s) => s.tabs);
  const active = useEditorStore((s) => s.activeTab);
  const dirty = useEditorStore((s) => s.dirty);
  const input = useRef<HTMLInputElement>(null);
  if (!tabs.length) return null;

  return (
    <div className="flex items-end gap-1 overflow-x-auto border-b border-slate-200 bg-slate-100 px-2 pt-1.5" role="tablist" aria-label="Open documents">
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <div
            key={t.id}
            className={`group flex max-w-[220px] shrink-0 items-center rounded-t-lg border border-b-0 text-xs ${
              on ? 'border-slate-200 bg-white text-slate-900' : 'border-transparent text-slate-600 hover:bg-slate-200'
            }`}
          >
            <button type="button" role="tab" aria-selected={on} title={t.name} onClick={() => switchTab(t.id)} className="flex min-w-0 items-center gap-1.5 py-1.5 pl-2.5 pr-1">
              <FileText size={13} className={on ? 'shrink-0 text-brand-500' : 'shrink-0 text-slate-400'} />
              <span className="truncate font-medium">{t.name}</span>
              {on && dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" title="Has changes that were not downloaded" />}
            </button>
            <button type="button" aria-label={`Close ${t.name}`} onClick={() => closeTab(t.id)} className="mr-1 rounded p-0.5 text-slate-400 hover:bg-slate-300 hover:text-slate-700">
              <X size={13} />
            </button>
          </div>
        );
      })}
      <button type="button" aria-label="Open another PDF" title="Open another PDF in a new tab" onClick={() => input.current?.click()} className="mb-1 rounded-md p-1 text-slate-500 hover:bg-slate-200">
        <Plus size={15} />
      </button>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          // One after another: each becomes the active tab in turn.
          for (const f of files) await openPdfFile(f);
        }}
      />
    </div>
  );
}
