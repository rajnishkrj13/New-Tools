'use client';

import { useMemo, useState } from 'react';
import { combine, deleteCol, deleteRow, insertCol, insertRow, merge, setText, split, splitTable } from '@/lib/tables/edit';
import { checkTable, type Finding } from '@/lib/tables/check';
import { isRtl } from '@/lib/lang';
import type { Box, Table } from '@/lib/tables/types';
import { Notice } from '../kit';

export interface TableState {
  table: Table;
  include: boolean;
  sheet: string;
}

const methodName: Record<Table['method'], string> = { ruled: 'Ruled grid', 'ruled-partial': 'Column lines + text rows', aligned: 'Aligned text, no lines', 'scan-ruled': 'Scan with lines', 'scan-aligned': 'Scan, aligned text', word: 'Word table' };

/** A score shown as a coloured figure: what the extraction measured, not a guess. */
function Score({ label, v }: { label: string; v: number }) {
  return (
    <span className="whitespace-nowrap text-[0.78rem]" title="Measured by the extraction: white space or lines separating columns and rows, and OCR scores">
      {label} <b style={{ color: v >= 90 ? 'var(--ok)' : v >= 70 ? 'var(--warn)' : 'var(--bad)' }}>{v}%</b>
    </span>
  );
}

/**
 * The extracted tables: choose which to keep, rename their sheets, check them, and correct
 * cells, rows, columns and merges before downloading. `onFocus` reports the source position of
 * the cell clicked, so the page view can show where it came from.
 */
export function TableEditor({ items, onChange, onFocus, nextId }: { items: TableState[]; onChange: (items: TableState[]) => void; onFocus?: (t: Table, box: Box | undefined, page: number) => void; nextId: () => string }) {
  const [active, setActive] = useState(0);
  const [sel, setSel] = useState<{ r: number; c: number } | null>(null);
  const [end, setEnd] = useState<{ r: number; c: number } | null>(null);
  const [editing, setEditing] = useState<{ r: number; c: number; text: string } | null>(null);
  const [limit, setLimit] = useState(150);
  const [msg, setMsg] = useState<string | null>(null);
  const cur = items[Math.min(active, items.length - 1)];
  const t = cur?.table;
  const checks = useMemo(() => (t ? checkTable(t) : null), [t]);
  const flagged = useMemo(() => {
    const m = new Map<string, Finding>();
    for (const f of checks?.findings ?? []) if (f.row !== undefined && f.level !== 'ok') m.set(`${f.row}:${f.col ?? -1}`, f);
    return m;
  }, [checks]);
  if (!t) return <Notice tone="warn">No tables were found in this file.</Notice>;

  const put = (table: Table) => onChange(items.map((x, i) => (i === active ? { ...x, table } : x)));
  const range = sel && end ? { r0: Math.min(sel.r, end.r), r1: Math.max(sel.r, end.r), c0: Math.min(sel.c, end.c), c1: Math.max(sel.c, end.c) } : sel ? { r0: sel.r, r1: sel.r, c0: sel.c, c1: sel.c } : null;
  const inRange = (r: number, c: number) => !!range && r >= range.r0 && r <= range.r1 && c >= range.c0 && c <= range.c1;
  const rtl = isRtl(t.rows.flat().map((c) => c.text).join(' '));
  const act = (fn: () => Table | string) => {
    const r = fn();
    if (typeof r === 'string') setMsg(r);
    else {
      setMsg(null);
      put(r);
    }
  };
  const btn = 'border border-rule px-2 py-1 text-[0.82rem] hover:border-ink disabled:opacity-40';

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it, i) => (
          <button
            key={it.table.id}
            type="button"
            onClick={() => (setActive(i), setSel(null), setEnd(null), setEditing(null), setLimit(150))}
            className={`border px-2.5 py-1 text-left text-[0.82rem] ${i === active ? 'border-ink bg-ink text-paper' : 'border-rule'} ${it.include ? '' : 'opacity-50'}`}
          >
            {it.table.name}
            <span className="ml-1 opacity-70">
              {it.table.rows.length}×{it.table.rows[0]?.length ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-2 border border-rule p-2 sm:grid-cols-[auto_1fr_auto] sm:items-center">
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={cur.include} onChange={(e) => onChange(items.map((x, i) => (i === active ? { ...x, include: e.target.checked } : x)))} />
          Include
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="label">Sheet</span>
          <input className="field !min-h-8 py-0.5 text-sm" maxLength={31} value={cur.sheet} onChange={(e) => onChange(items.map((x, i) => (i === active ? { ...x, sheet: e.target.value } : x)))} />
        </label>
        <span className="flex flex-wrap gap-x-3">
          <Score label="Table" v={t.confidence.table} />
          <Score label="Rows" v={t.confidence.rows} />
          <Score label="Columns" v={t.confidence.cols} />
          <Score label="Cells" v={t.confidence.cells} />
        </span>
      </div>
      <p className="mt-1 text-[0.78rem] text-ink-3">
        {methodName[t.method]} · pages {t.pages.map((p) => p + 1).join(', ')} · {t.rows.length} rows × {t.rows[0]?.length ?? 0} columns · heading rows{' '}
        <input
          type="number"
          min={0}
          max={Math.min(6, t.rows.length)}
          value={t.headerRows}
          onChange={(e) => put({ ...t, headerRows: Math.max(0, Math.min(t.rows.length, Number(e.target.value) || 0)) })}
          className="w-12 border border-rule bg-card px-1"
          aria-label="Number of heading rows"
        />
        {t.notes.length ? ` · ${t.notes.join(' ')}` : ''}
      </p>

      <div className="mt-2 flex flex-wrap gap-1">
        <button type="button" className={btn} disabled={!sel} onClick={() => act(() => insertRow(t, sel!.r))}>
          Row above
        </button>
        <button type="button" className={btn} disabled={!sel} onClick={() => act(() => insertRow(t, sel!.r + 1))}>
          Row below
        </button>
        <button type="button" className={btn} disabled={!range} onClick={() => act(() => { let n = t; for (let r = range!.r1; r >= range!.r0; r--) n = deleteRow(n, r); return n; })}>
          Delete row{range && range.r1 > range.r0 ? 's' : ''}
        </button>
        <button type="button" className={btn} disabled={!sel} onClick={() => act(() => insertCol(t, sel!.c))}>
          Column left
        </button>
        <button type="button" className={btn} disabled={!sel} onClick={() => act(() => insertCol(t, sel!.c + 1))}>
          Column right
        </button>
        <button type="button" className={btn} disabled={!range} onClick={() => act(() => { let n = t; for (let c = range!.c1; c >= range!.c0; c--) n = deleteCol(n, c); return n; })}>
          Delete column{range && range.c1 > range.c0 ? 's' : ''}
        </button>
        <button type="button" className={btn} disabled={!range || (range.r0 === range.r1 && range.c0 === range.c1)} onClick={() => act(() => merge(t, range!.r0, range!.c0, range!.r1, range!.c1))}>
          Merge cells
        </button>
        <button type="button" className={btn} disabled={!sel} onClick={() => act(() => split(t, sel!.r, sel!.c))}>
          Split cell
        </button>
        <button
          type="button"
          className={btn}
          disabled={!sel || sel.r === 0}
          onClick={() => {
            const [a, b] = splitTable(t, sel!.r, nextId());
            onChange([...items.slice(0, active), { ...cur, table: a }, { include: true, sheet: `${cur.sheet} 2`.slice(0, 31), table: b }, ...items.slice(active + 1)]);
            setSel(null);
          }}
        >
          Split table here
        </button>
        <button
          type="button"
          className={btn}
          disabled={active >= items.length - 1}
          onClick={() => {
            const next = items[active + 1];
            onChange([...items.slice(0, active), { ...cur, table: combine(t, next.table) }, ...items.slice(active + 2)]);
          }}
        >
          Add next table below
        </button>
      </div>
      <p className="mt-1 text-[0.75rem] text-ink-3">Click a cell to select it (Shift+click for a range), double-click to edit. Yellow: read with low certainty. Red outline: flagged by the checks.</p>
      {msg && <Notice tone="warn">{msg}</Notice>}

      <div className="mt-2 max-h-[34rem] overflow-auto border border-ink" dir={rtl ? 'rtl' : undefined}>
        <table className="border-collapse text-[0.82rem]">
          <tbody>
            {t.rows.slice(0, limit).map((row, r) => (
              <tr key={r}>
                <th className="sticky left-0 z-[1] border border-rule bg-paper-2 px-1.5 text-right font-mono text-[0.7rem] font-normal text-ink-3">{r + 1}</th>
                {row.map((c, k) => {
                  if (c.hidden) return null;
                  const low = c.text && (c.conf ?? 100) < 80;
                  const flag = flagged.get(`${r}:${k}`) ?? flagged.get(`${r}:-1`);
                  const isEdit = editing && editing.r === r && editing.c === k;
                  return (
                    <td
                      key={k}
                      rowSpan={c.rowSpan}
                      colSpan={c.colSpan}
                      title={[low ? `Low certainty (${c.conf}%)` : '', flag?.message ?? ''].filter(Boolean).join('\n') || undefined}
                      dir="auto"
                      onClick={(e) => {
                        if (e.shiftKey && sel) setEnd({ r, c: k });
                        else {
                          setSel({ r, c: k });
                          setEnd(null);
                        }
                        onFocus?.(t, c.box, t.rowPages?.[r] ?? t.pages[0]);
                      }}
                      onDoubleClick={() => setEditing({ r, c: k, text: c.text })}
                      className={`min-w-[4rem] max-w-[22rem] whitespace-pre-wrap border px-1.5 py-1 align-top ${r < t.headerRows ? 'font-semibold' : ''} ${inRange(r, k) ? 'outline outline-2 -outline-offset-2 outline-signal' : ''}`}
                      style={{ borderColor: flag && flag.level === 'error' ? 'var(--bad)' : 'var(--rule)', boxShadow: flag ? 'inset 0 0 0 1px var(--bad)' : undefined, background: low ? '#fff2b3' : r < t.headerRows ? 'var(--paper-2)' : undefined, color: low ? '#1a1a1a' : undefined }}
                    >
                      {isEdit ? (
                        <textarea
                          autoFocus
                          className="block w-full min-w-[8rem] border border-ink bg-card p-0.5 text-[0.82rem]"
                          rows={Math.max(1, editing.text.split('\n').length)}
                          value={editing.text}
                          onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                          onBlur={() => {
                            put(setText(t, r, k, editing.text));
                            setEditing(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              (e.target as HTMLTextAreaElement).blur();
                            }
                            if (e.key === 'Escape') setEditing(null);
                          }}
                        />
                      ) : (
                        c.text || ' '
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {t.rows.length > limit && (
        <button type="button" className="mt-1 text-sm underline" onClick={() => setLimit((l) => l + 500)}>
          Show more rows ({t.rows.length - limit} not shown; all are in the download)
        </button>
      )}

      {checks && (
        <div className="mt-3">
          <p className="label">Checks</p>
          <ul className="mt-1 max-h-48 divide-y divide-rule overflow-y-auto border border-rule text-[0.85rem]">
            {checks.findings.length === 0 && <li className="px-2 py-1 text-ink-3">No totals or balances to check, and nothing out of place.</li>}
            {checks.findings.map((f, i) => (
              <li key={i} className="flex gap-2 px-2 py-1">
                <span className="label w-14 shrink-0" style={{ color: f.level === 'error' ? 'var(--bad)' : f.level === 'warning' ? 'var(--warn)' : 'var(--ok)' }}>
                  {f.level === 'error' ? 'mismatch' : f.level === 'warning' ? 'check' : 'ok'}
                </span>
                <button
                  type="button"
                  className="text-left"
                  onClick={() => {
                    if (f.row === undefined) return;
                    const a = { r: f.row, c: Math.max(0, f.col ?? 0) };
                    setSel(a);
                    setEnd(null);
                    if (f.row >= limit) setLimit(f.row + 50);
                    onFocus?.(t, t.rows[a.r]?.[a.c]?.box, t.rowPages?.[a.r] ?? t.pages[0]);
                  }}
                >
                  {f.message}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[0.75rem] text-ink-3">
            {checks.stats.dataRows} data rows · {checks.stats.emptyCells} empty cells · {checks.stats.lowConfidence} uncertain cells. Values are never changed to make totals agree.
          </p>
        </div>
      )}
    </div>
  );
}
