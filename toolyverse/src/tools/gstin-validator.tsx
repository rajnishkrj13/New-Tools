'use client';

import { useMemo, useState } from 'react';
import { checkGstin } from '@/lib/calc/gst';
import { Bench, useCopy } from './kit';

export default function GstinValidator() {
  const [text, setText] = useState('27AAPFU0939F1ZV');
  const { copied, copy } = useCopy();
  const results = useMemo(
    () =>
      text
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 500)
        .map(checkGstin),
    [text],
  );
  const valid = results.filter((r) => r.valid);

  return (
    <Bench>
      <label htmlFor="gstins" className="label mb-1 block">
        GSTIN, or several (one per line)
      </label>
      <textarea id="gstins" className="field font-mono uppercase" rows={4} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      {results.length > 0 && (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="label">
              {valid.length} of {results.length} valid
            </p>
            {valid.length > 0 && results.length > 1 && (
              <button type="button" className="btn btn-ghost !min-h-9" onClick={() => copy(valid.map((r) => r.gstin).join('\n'))}>
                {copied ? 'Copied' : 'Copy valid ones'}
              </button>
            )}
          </div>
          <ul className="mt-2 border-t border-ink">
            {results.map((r, i) => (
              <li key={`${r.gstin}-${i}`} className="grid gap-x-6 gap-y-1 border-b border-rule py-3 sm:grid-cols-[12rem_1fr]">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center text-[0.75rem] font-bold text-white"
                    style={{ background: r.valid ? 'var(--ok)' : 'var(--bad)' }}
                    aria-label={r.valid ? 'Valid' : 'Not valid'}
                  >
                    {r.valid ? '✓' : '!'}
                  </span>
                  <span className="font-mono">{r.gstin || r.input}</span>
                </div>
                {r.valid ? (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-[0.92rem]">
                    <dt className="text-ink-3">State</dt>
                    <dd>
                      {r.state} ({r.gstin.slice(0, 2)})
                    </dd>
                    <dt className="text-ink-3">PAN</dt>
                    <dd className="font-mono">
                      {r.pan} {r.panHolder ? <span className="font-sans text-ink-3">· {r.panHolder}</span> : null}
                    </dd>
                    <dt className="text-ink-3">Registration</dt>
                    <dd>No. {r.entity} under this PAN</dd>
                  </dl>
                ) : (
                  <ul className="text-[0.92rem] text-bad">
                    {r.problems.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[0.85rem] text-ink-3">
            A valid result means the number is correctly formed. To see if it is active and whose it is, use “Search Taxpayer” on the official GST portal.
          </p>
        </>
      )}
    </Bench>
  );
}
