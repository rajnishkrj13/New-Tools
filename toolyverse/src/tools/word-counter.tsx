'use client';

import { useState } from 'react';
import { countText } from '@/lib/calc/text';
import { Bench } from './kit';

const mins = (m: number) => (m < 1 ? `${Math.max(0, Math.round(m * 60))} sec` : `${Math.floor(m)} min ${Math.round((m % 1) * 60)} sec`);

export default function WordCounter() {
  const [text, setText] = useState('');
  const c = countText(text);
  const n = new Intl.NumberFormat('en-IN');
  const stats: [string, string][] = [
    ['Words', n.format(c.words)],
    ['Characters', n.format(c.characters)],
    ['Without spaces', n.format(c.charactersNoSpaces)],
    ['Sentences', n.format(c.sentences)],
    ['Paragraphs', n.format(c.paragraphs)],
    ['Reading time', mins(c.readingMinutes)],
  ];
  return (
    <Bench>
      <dl className="grid grid-cols-2 border-l border-t border-ink sm:grid-cols-3 lg:grid-cols-6" aria-live="polite">
        {stats.map(([k, v]) => (
          <div key={k} className="border-b border-r border-ink px-3 py-2.5">
            <dt className="label">{k}</dt>
            <dd className="display text-[1.7rem] tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <label htmlFor="wc-text" className="sr-only">
        Text to count
      </label>
      <textarea id="wc-text" className="field mt-4" rows={12} placeholder="Type or paste your text here…" value={text} onChange={(e) => setText(e.target.value)} />
      {text.length > 0 && (
        <p className="mt-2 text-[0.85rem] text-ink-3">
          Meta descriptions show about 155 characters; X (Twitter) allows 280; an SMS is 160.
        </p>
      )}
    </Bench>
  );
}
