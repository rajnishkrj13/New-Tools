'use client';

import { useState } from 'react';
import { groupIndian, numberToWords } from '@/lib/calc/words';
import { Bench, Field, Segmented, useCopy } from './kit';

export default function NumberToWords() {
  const [value, setValue] = useState('1234567.50');
  const [style, setStyle] = useState<'indian' | 'international'>('indian');
  const [currency, setCurrency] = useState<'inr' | 'none'>('inr');
  const [letter, setLetter] = useState<'title' | 'upper' | 'lower'>('title');
  const { copied, copy } = useCopy();
  let words = '';
  let error = '';
  try {
    words = value.trim() ? numberToWords(value, { style, currency }) : '';
  } catch (e) {
    error = (e as Error).message;
  }
  const shown = letter === 'upper' ? words.toUpperCase() : letter === 'lower' ? words.toLowerCase() : words;
  const digits = value.replace(/[^\d.]/g, '');

  return (
    <Bench>
      <Field label="Number or amount">
        <input className="field !text-[1.3rem] tabular-nums" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
      {digits && !error && style === 'indian' && <p className="mt-1 font-mono text-sm text-ink-3">{groupIndian(digits)}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <Segmented label="Style" value={style} onChange={setStyle} options={[{ value: 'indian', label: 'Lakh / crore' }, { value: 'international', label: 'Million' }]} />
        <Segmented label="Currency" value={currency} onChange={setCurrency} options={[{ value: 'inr', label: 'Rupees' }, { value: 'none', label: 'Plain number' }]} />
        <Segmented label="Letters" value={letter} onChange={setLetter} options={[{ value: 'title', label: 'Title' }, { value: 'upper', label: 'CAPS' }, { value: 'lower', label: 'lower' }]} />
      </div>
      <div className="mt-6 border-t border-ink pt-4" aria-live="polite">
        {error ? (
          <p className="text-bad">{error}</p>
        ) : (
          <>
            <p className="display text-[1.55rem] leading-snug">{shown || '—'}</p>
            {shown && (
              <button type="button" className="btn btn-ghost mt-4" onClick={() => copy(shown)}>
                {copied ? 'Copied' : 'Copy words'}
              </button>
            )}
          </>
        )}
      </div>
    </Bench>
  );
}
