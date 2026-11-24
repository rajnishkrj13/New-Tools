'use client';

import { useState } from 'react';
import { LANGUAGES } from '@/lib/lang';

/** "auto" (each scanned page's script is detected) or the chosen language codes. */
export type LangChoice = 'auto' | string[];

export function LanguagePicker({ value, onChange }: { value: LangChoice; onChange: (v: LangChoice) => void }) {
  const [open, setOpen] = useState(false);
  const chosen = value === 'auto' ? [] : value;
  const notes = LANGUAGES.filter((l) => chosen.includes(l.code) && l.note);
  return (
    <div>
      <span className="label mb-1 block">Language of scanned pages</span>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[0.92rem]">
          <input type="radio" checked={value === 'auto'} onChange={() => onChange('auto')} />
          Detect automatically
        </label>
        <label className="flex items-center gap-1.5 text-[0.92rem]">
          <input type="radio" checked={value !== 'auto'} onChange={() => (onChange(chosen.length ? chosen : ['en']), setOpen(true))} />
          Choose: {chosen.length ? LANGUAGES.filter((l) => chosen.includes(l.code)).map((l) => l.name).join(', ') : 'none yet'}
        </label>
        {value !== 'auto' && (
          <button type="button" className="text-sm underline" onClick={() => setOpen((o) => !o)}>
            {open ? 'Close list' : 'Change'}
          </button>
        )}
      </div>
      {value !== 'auto' && open && (
        <div className="mt-2 grid gap-x-3 gap-y-1 border border-rule p-2 text-[0.88rem] sm:grid-cols-3 lg:grid-cols-4">
          {LANGUAGES.map((l) => (
            <label key={l.code} className="flex items-center gap-1.5" title={l.note}>
              <input
                type="checkbox"
                checked={chosen.includes(l.code)}
                onChange={(e) => {
                  const next = e.target.checked ? [...chosen, l.code] : chosen.filter((c) => c !== l.code);
                  onChange(next.length ? next : ['en']);
                }}
              />
              <span>
                {l.name} <span className="text-ink-3">{l.native}</span>
                {!l.model && <span className="text-bad"> *</span>}
              </span>
            </label>
          ))}
        </div>
      )}
      <p className="mt-1 text-[0.78rem] text-ink-3">
        {value === 'auto'
          ? 'Each scanned page’s script is detected and read with the matching model, together with English. Pages with real text need no language: their characters are copied exactly.'
          : 'Several languages can be chosen for mixed documents; English is always included for numbers and English words.'}
      </p>
      {notes.map((l) => (
        <p key={l.code} className="mt-1 text-[0.78rem] text-warn">
          {l.name}: {l.note}
        </p>
      ))}
    </div>
  );
}
