'use client';

import { useRef, useState, type ReactNode } from 'react';
import { GST, checksOf, fmt, level, type Ret } from '@/lib/gst/helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */

const TONE = { ok: 'var(--ok)', warn: 'var(--warn)', err: 'var(--bad)' } as const;
const typeName = (t: string) => (t === 'GSTR1' ? 'GSTR-1' : 'GSTR-3B');

export function Chip({ tone, children }: { tone?: 'ok' | 'warn' | 'err' | 'g1' | 'g3' | 'mut'; children: ReactNode }) {
  const color = tone === 'g1' ? '#6d28d9' : tone === 'g3' ? '#0e7490' : tone === 'mut' ? 'var(--ink-3)' : tone ? TONE[tone] : 'var(--ink-2)';
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap border px-1.5 py-px font-mono text-[0.72rem] font-semibold uppercase tracking-wide" style={{ color, borderColor: color }}>
      {children}
    </span>
  );
}

/** Drop zone for many files at once. */
export function Drop({ accept, title, hint, onFiles, extra }: { accept: string; title: string; hint: string; onFiles: (f: File[]) => void; extra?: ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className="tray flex flex-wrap items-center gap-4 px-5 py-6"
      data-over={over}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <div className="min-w-[240px] flex-1">
        <p className="display text-[1.2rem]">{title}</p>
        <p className="text-[0.88rem] text-ink-3">{hint}</p>
      </div>
      <button type="button" className="btn" onClick={() => input.current?.click()}>
        Choose files
      </button>
      {extra}
      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept={accept}
        onChange={(e) => {
          if (e.target.files?.length) onFiles(Array.from(e.target.files));
          e.target.value = '';
        }}
      />
    </div>
  );
}

/** One row per file: what was read, and whether its own figures add up. */
export function ReturnFiles({ rets, expected, onRemove }: { rets: Ret[]; expected?: string; onRemove: (i: number) => void }) {
  return (
    <div className="max-h-[360px] overflow-auto border-t border-ink">
      <table className="w-full min-w-[860px] border-collapse text-[0.88rem]">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b border-ink text-left">
            {['File', 'GSTIN', 'FY', 'Period', 'ARN date', 'Checks', ''].map((h) => (
              <th key={h} className="label py-2 pr-3 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rets.map((r, i) => {
            const lv = level(r);
            const wrong = !r.error && expected && r.type !== expected;
            return (
              <tr key={`${r.file}-${i}`} className="border-b border-rule align-top">
                <td className="max-w-[260px] py-2 pr-3">
                  <span className="break-all font-medium">{r.file}</span> {r.type && <Chip tone={r.type === 'GSTR1' ? 'g1' : 'g3'}>{typeName(r.type)}</Chip>}
                </td>
                <td className="pr-3">
                  {r.gstin && (
                    <>
                      <span className="font-mono">{r.gstin}</span>
                      <span className="block text-[0.78rem] text-ink-3">{r.state}</span>
                    </>
                  )}
                </td>
                <td className="whitespace-nowrap pr-3">{r.fy}</td>
                <td className="pr-3">{r.periodText}</td>
                <td className="whitespace-nowrap pr-3">{r.arnDate}</td>
                <td className="min-w-[250px] pr-3">
                  {r.error ? (
                    <span className="text-bad">{r.error}</span>
                  ) : wrong ? (
                    <Chip tone="mut">{typeName(r.type)} · not used here</Chip>
                  ) : (
                    <>
                      <Chip tone={lv}>{lv === 'ok' ? '✓ Checked' : lv === 'warn' ? 'Check notes' : 'Problem'}</Chip>
                      <ul className="mt-1 space-y-0.5 text-[0.8rem] text-ink-2">
                        {checksOf(r).map((c) => (
                          <li key={c.msg} className="flex gap-1.5">
                            <span className="mt-[0.45rem] h-1.5 w-1.5 shrink-0" style={{ background: TONE[c.lvl] }} aria-hidden="true" />
                            {c.msg}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </td>
                <td>
                  <button type="button" className="text-ink-3 hover:text-bad" aria-label={`Remove ${r.file}`} onClick={() => onRemove(i)}>
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const CELL = 'inline-flex min-w-[2.2rem] justify-center px-1 py-0.5 font-mono text-[0.78rem] font-semibold';

/** GSTIN × month grid of which returns are loaded. */
export function Coverage({ groups, dups, render }: { groups: any[]; dups: Ret[]; render?: (g: any, m: number) => ReactNode }) {
  const fys: Record<string, any[]> = {};
  groups.forEach((g) => (fys[g.fy] = fys[g.fy] || []).push(g));
  return (
    <div className="space-y-4">
      {Object.keys(fys)
        .sort()
        .map((fy) => (
          <div key={fy} className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-[0.85rem]">
              <thead>
                <tr className="border-b border-ink text-left">
                  <th className="label py-2 pr-3 font-normal">GSTIN · FY {fy}</th>
                  {GST.FY_MONTHS.map((m: number) => (
                    <th key={m} className="label px-1 text-center font-normal">
                      {GST.monName(m)}
                    </th>
                  ))}
                  <th className="label px-2 text-center font-normal">Filed</th>
                </tr>
              </thead>
              <tbody>
                {fys[fy].map((g) => {
                  let n = 0;
                  return (
                    <tr key={g.gstin} className="border-b border-rule">
                      <td className="py-1.5 pr-3">
                        <span className="font-mono">{g.gstin}</span> <span className="text-[0.78rem] text-ink-3">{g.state}</span>
                      </td>
                      {GST.FY_MONTHS.map((m: number) => {
                        if (render) return <td key={m} className="px-1 text-center">{render(g, m)}</td>;
                        const r = g.months[m];
                        if (!r)
                          return (
                            <td key={m} className="px-1 text-center">
                              <span className={`${CELL} text-ink-3`}>–</span>
                            </td>
                          );
                        n++;
                        const lv = level(r);
                        const d = dups.filter((x) => x.gstin === g.gstin && x.fy === g.fy && x.month === m).length;
                        return (
                          <td key={m} className="px-1 text-center" title={r.file}>
                            <span className={CELL} style={{ color: '#fff', background: TONE[lv] }}>
                              {lv === 'ok' ? '✓' : '!'}
                              {d ? ` ×${d + 1}` : ''}
                            </span>
                          </td>
                        );
                      })}
                      <td className="px-2 text-center font-semibold">{render ? '' : `${n}/12`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}

export const MonthCell = ({ bg, children, title }: { bg: string; children: ReactNode; title?: string }) => (
  <span className={CELL} style={{ color: '#fff', background: bg }} title={title}>
    {children}
  </span>
);

/** Form-layout table: rows = field × head, columns = FY months + total. */
export function MonthTable({ rows }: { rows: any[] }) {
  return (
    <div className="max-h-[560px] overflow-auto border-t border-ink">
      <table className="w-full min-w-[1100px] border-collapse text-[0.82rem]">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b border-ink">
            <th className="label py-2 pr-2 text-left font-normal">Table</th>
            <th className="label pr-2 text-left font-normal">Particulars</th>
            <th className="label pr-2 text-left font-normal">Head</th>
            {GST.FY_MONTHS.map((m: number) => (
              <th key={m} className="label px-1.5 text-right font-normal">
                {GST.monName(m)}
              </th>
            ))}
            <th className="label px-1.5 text-right font-normal">Total</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {rows.map((r, i) => {
            const cnt = r.head === 'rec';
            return (
              <tr key={i} className={`border-b border-rule ${r.key === 'TL' ? 'bg-paper-2 font-semibold' : ''} ${r.first ? 'border-t border-t-rule-2' : ''}`}>
                <td className="py-1 pr-2 font-sans text-ink-3">{r.first ? r.tbl : ''}</td>
                <td className="min-w-[260px] whitespace-pre pr-2 font-sans">{r.first ? r.label : ''}</td>
                <td className="pr-2 font-sans text-[0.75rem] text-ink-3">{GST.HEADS[r.head]}</td>
                {r.vals.map((v: number | null, k: number) => (
                  <td key={k} className={`px-1.5 text-right ${v == null || v === 0 ? 'text-ink-3' : v < 0 ? 'text-bad' : ''}`}>
                    {v == null ? '–' : cnt ? fmt(v, 0) : fmt(v)}
                  </td>
                ))}
                <td className="px-1.5 text-right font-semibold">{cnt ? fmt(r.total, 0) : fmt(r.total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="border border-ink bg-card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="display text-[1.35rem]">{title}</h2>
        <div className="ml-auto flex flex-wrap items-center gap-3">{aside}</div>
      </div>
      {children}
    </section>
  );
}
