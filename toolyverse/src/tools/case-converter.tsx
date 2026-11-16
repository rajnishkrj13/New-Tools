'use client';

import { useState } from 'react';
import { changeCase, type CaseMode } from '@/lib/calc/text';
import { Bench, useCopy } from './kit';

const MODES: { mode: CaseMode; label: string }[] = [
  { mode: 'sentence', label: 'Sentence case' },
  { mode: 'lower', label: 'lower case' },
  { mode: 'upper', label: 'UPPER CASE' },
  { mode: 'title', label: 'Title Case' },
  { mode: 'camel', label: 'camelCase' },
  { mode: 'snake', label: 'snake_case' },
  { mode: 'kebab', label: 'kebab-case' },
  { mode: 'toggle', label: 'tOGGLE cASE' },
];

export default function CaseConverter() {
  const [text, setText] = useState('THIS TEXT WAS COPIED FROM A PDF IN CAPITALS. the quick brown fox jumps over the lazy dog.');
  const { copied, copy } = useCopy();
  return (
    <Bench>
      <label htmlFor="case-text" className="label mb-1 block">
        Your text
      </label>
      <textarea id="case-text" className="field" rows={7} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="mt-4 flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button key={m.mode} type="button" className="btn btn-ghost !min-h-10" onClick={() => setText(changeCase(text, m.mode))}>
            {m.label}
          </button>
        ))}
        <button type="button" className="btn btn-ghost !min-h-10" onClick={() => setText(text.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim())}>
          Remove extra spaces
        </button>
      </div>
      <div className="mt-4 flex gap-2">
        <button type="button" className="btn" onClick={() => copy(text)}>
          {copied ? 'Copied' : 'Copy text'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setText('')}>
          Clear
        </button>
      </div>
    </Bench>
  );
}
