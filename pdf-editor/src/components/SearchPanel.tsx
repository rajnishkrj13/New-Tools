import { useEffect } from 'react';
import { ChevronDown, ChevronUp, Loader2, X } from 'lucide-react';
import type { PageInfo } from '../types/pdf';
import { getState, useEditorStore } from '../store/documentStore';
import { closeSearch, replaceAll, replaceCurrent, runSearch, stepSearch } from '../store/searchActions';

/** Find and replace bar, shown over the top-right corner of the document. */
export function SearchPanel() {
  const search = useEditorStore((s) => s.search);
  const set = getState().setSearch;

  // Search again shortly after the query or its options change.
  useEffect(() => {
    if (!search.open) return;
    const t = setTimeout(() => runSearch(), 250);
    return () => clearTimeout(t);
  }, [search.open, search.query, search.matchCase]);

  if (!search.open) return null;
  const count = search.hits.length;
  const input = 'h-8 min-w-0 flex-1 rounded-md border border-slate-200 px-2 text-sm';
  const button = 'h-8 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40';
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      stepSearch(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeSearch();
    }
  };

  return (
    <div className="absolute right-4 top-3 z-30 w-[340px] lg:right-[280px] rounded-xl bg-white p-2.5 shadow-float" role="search" aria-label="Find and replace">
      <div className="flex items-center gap-1.5">
        <input
          id="search-query"
          autoFocus
          aria-label="Find"
          placeholder="Find in document"
          value={search.query}
          onChange={(e) => set({ query: e.target.value })}
          onKeyDown={onKey}
          className={input}
        />
        <span className="w-[62px] shrink-0 text-center text-[11px] tabular-nums text-slate-500" aria-live="polite">
          {search.busy ? <Loader2 size={14} className="mx-auto animate-spin" /> : !search.query ? '' : count ? `${search.index + 1} of ${count}` : 'No results'}
        </span>
        <button type="button" aria-label="Previous result" disabled={!count} onClick={() => stepSearch(-1)} className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30">
          <ChevronUp size={16} />
        </button>
        <button type="button" aria-label="Next result" disabled={!count} onClick={() => stepSearch(1)} className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30">
          <ChevronDown size={16} />
        </button>
        <button type="button" aria-label="Close search" onClick={closeSearch} className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100">
          <X size={16} />
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <input aria-label="Replace with" placeholder="Replace with" value={search.replace} onChange={(e) => set({ replace: e.target.value })} onKeyDown={onKey} className={input} />
        <button type="button" disabled={!count} onClick={() => replaceCurrent()} className={button}>
          Replace
        </button>
        <button type="button" disabled={!count} onClick={() => replaceAll()} className={button}>
          All
        </button>
      </div>
      <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-600">
        <input type="checkbox" checked={search.matchCase} onChange={(e) => set({ matchCase: e.target.checked })} />
        Match case
        <span className="ml-auto text-slate-400">Enter: next · Shift+Enter: previous</span>
      </label>
    </div>
  );
}

/** Marks the search results of one page; the current one is stronger. */
export function SearchHighlights({ page }: { page: PageInfo }) {
  const zoom = useEditorStore((s) => s.zoom);
  const hits = useEditorStore((s) => s.search.hits);
  const index = useEditorStore((s) => s.search.index);
  const open = useEditorStore((s) => s.search.open);
  if (!open) return null;
  return (
    <>
      {hits.map((h, i) =>
        h.pageIndex !== page.index ? null : (
          <div
            key={i}
            className={`pointer-events-none absolute z-10 rounded-sm ${i === index ? 'bg-orange-400/50 outline outline-2 outline-orange-500' : 'bg-yellow-300/50'}`}
            style={{ left: h.x * zoom - 1, top: h.y * zoom, width: h.width * zoom + 2, height: h.height * zoom }}
          />
        ),
      )}
    </>
  );
}
