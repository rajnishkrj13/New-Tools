import { useEffect } from 'react';
import { ChevronDown, ChevronUp, Loader2, ShieldAlert, X } from 'lucide-react';
import type { PageInfo } from '../types/pdf';
import { needsQuery, patternError, SEARCH_MODES, type SearchMode } from '../engines/TextSearch';
import { getState, useEditorStore } from '../store/documentStore';
import { closeSearch, redactMatches, replaceAll, replaceCurrent, runSearch, stepSearch } from '../store/searchActions';
import { feature } from '../utils/embed';

/** Find, replace and redact bar, shown over the top-right corner of the document. */
export function SearchPanel() {
  const search = useEditorStore((s) => s.search);
  const set = getState().setSearch;

  // Search again shortly after the query or its options change.
  useEffect(() => {
    if (!search.open) return;
    const t = setTimeout(() => runSearch(), 250);
    return () => clearTimeout(t);
  }, [search.open, search.query, search.matchCase, search.mode]);

  if (!search.open) return null;
  const count = search.hits.length;
  const typed = needsQuery(search.mode);
  const problem = patternError(search);
  const input = 'h-8 min-w-0 flex-1 rounded-md border border-slate-200 px-2 text-sm disabled:bg-slate-50 disabled:text-slate-400';
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
  const status = search.busy ? (
    <Loader2 size={14} className="mx-auto animate-spin" />
  ) : problem ? (
    ''
  ) : typed && !search.query ? (
    ''
  ) : count ? (
    `${search.index + 1} of ${count}`
  ) : (
    'No results'
  );

  return (
    <div className="absolute right-4 top-3 z-30 w-[360px] rounded-xl bg-white p-2.5 shadow-float lg:right-[280px]" role="search" aria-label="Find, replace and redact">
      <div className="flex items-center gap-1.5">
        <select
          id="search-mode"
          aria-label="What to look for"
          value={search.mode}
          onChange={(e) => set({ mode: e.target.value as SearchMode })}
          className="h-8 w-[132px] shrink-0 rounded-md border border-slate-200 bg-white px-1 text-xs text-slate-700"
        >
          {SEARCH_MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <input
          id="search-query"
          autoFocus
          aria-label="Find"
          aria-invalid={!!problem}
          disabled={!typed}
          placeholder={typed ? (search.mode === 'regex' ? 'Pattern, e.g. INV-\\d+' : 'Find in document') : 'Every match in the document'}
          value={typed ? search.query : ''}
          onChange={(e) => set({ query: e.target.value })}
          onKeyDown={onKey}
          className={input}
        />
        <button type="button" aria-label="Close search" onClick={closeSearch} className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100">
          <X size={16} />
        </button>
      </div>
      {problem && (
        <p role="alert" className="mt-1.5 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700">
          That is not a valid pattern: {problem}
        </p>
      )}
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="w-[74px] shrink-0 text-[11px] tabular-nums text-slate-500" aria-live="polite">
          {status}
        </span>
        <button type="button" aria-label="Previous result" disabled={!count} onClick={() => stepSearch(-1)} className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30">
          <ChevronUp size={16} />
        </button>
        <button type="button" aria-label="Next result" disabled={!count} onClick={() => stepSearch(1)} className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30">
          <ChevronDown size={16} />
        </button>
        <label className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-600">
          <input type="checkbox" checked={search.matchCase} onChange={(e) => set({ matchCase: e.target.checked })} />
          Match case
        </label>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <input aria-label="Replace with" placeholder="Replace with" value={search.replace} onChange={(e) => set({ replace: e.target.value })} onKeyDown={onKey} className={input} />
        <button type="button" disabled={!count} onClick={() => replaceCurrent()} className={button}>
          Replace
        </button>
        <button type="button" disabled={!count} onClick={() => replaceAll()} className={button}>
          All
        </button>
      </div>
      {feature('redact') && <div className="mt-2 rounded-lg border border-red-200 bg-red-50/60 p-2">
        <div className="flex items-center gap-1.5">
          <ShieldAlert size={14} className="shrink-0 text-red-600" />
          <span className="text-[11px] font-semibold text-red-800">Redact</span>
          <button type="button" disabled={!count} onClick={() => redactMatches('current')} className="ml-auto h-7 rounded-md border border-red-200 bg-white px-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-40">
            This match
          </button>
          <button type="button" disabled={!count} onClick={() => redactMatches('all')} className="h-7 rounded-md bg-red-600 px-2.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40">
            All {count || ''} match{count === 1 ? '' : 'es'}
          </button>
        </div>
        <p className="mt-1 text-[10.5px] leading-snug text-slate-600">
          Covers the matches in black. Pages with redactions become pictures when you download, and the text under the boxes is removed from the file. Check the highlighted matches first: patterns can miss or over-match.
        </p>
      </div>}
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
