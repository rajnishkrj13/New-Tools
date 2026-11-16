'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

type Item = { slug: string; name: string; short: string; category: string; keywords: string[] };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9₹%]+/g, ' ').trim();

/** Type what you need to do ("reduce photo to 50kb") and jump straight to the tool. */
export function ToolSearch({ items }: { items: Item[] }) {
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const words = norm(q).split(' ').filter(Boolean);
    if (!words.length) return [];
    return items
      .map((t) => {
        const hay = norm([t.name, t.short, ...t.keywords].join(' '));
        const name = norm(t.name);
        const score = words.reduce((s, w) => s + (name.includes(w) ? 3 : hay.includes(w) ? 1 : -2), 0);
        return { t, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [q, items]);

  return (
    <div className="relative">
      <label htmlFor="tool-search" className="label mb-1.5 block">
        What do you need to do?
      </label>
      <input
        id="tool-search"
        type="search"
        autoComplete="off"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="e.g. compress pdf, photo under 50 kb, gst 18%"
        className="field !min-h-[3.25rem] !border-ink !text-[1.05rem]"
        aria-controls="tool-search-results"
      />
      {q.trim() && (
        <ul id="tool-search-results" className="absolute inset-x-0 top-full z-20 mt-1 border border-ink bg-card shadow-[4px_4px_0_var(--ink)]">
          {results.length ? (
            results.map(({ t }) => (
              <li key={t.slug} className="border-b border-rule last:border-0">
                <Link href={`/${t.slug}`} className="flex items-baseline gap-3 px-3 py-2.5 hover:bg-paper-2">
                  <span className="font-semibold">{t.name}</span>
                  <span className="truncate text-sm text-ink-3">{t.short}</span>
                </Link>
              </li>
            ))
          ) : (
            <li className="px-3 py-3 text-sm text-ink-3">No tool matches “{q.trim()}” yet. Try other words, or browse the drawers below.</li>
          )}
        </ul>
      )}
    </div>
  );
}
