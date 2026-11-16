'use client';

import { formatSize } from './kit';

/** An ordered list of chosen files with up / down / remove, shared by the joining tools. */
export function FileOrder({ files, onChange }: { files: File[]; onChange: (f: File[]) => void }) {
  const move = (i: number, d: -1 | 1) => {
    const next = [...files];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <ol className="border-t border-ink" aria-label="Files, in order">
      {files.map((f, i) => (
        <li key={`${f.name}-${f.size}-${i}`} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 border-b border-rule py-2">
          <span className="label tabular-nums">{String(i + 1).padStart(2, '0')}</span>
          <span className="min-w-0">
            <span className="block truncate text-[0.95rem] font-medium" title={f.name}>
              {f.name}
            </span>
            <span className="font-mono text-[0.78rem] text-ink-3">{formatSize(f.size)}</span>
          </span>
          <span className="flex gap-1">
            <button type="button" className="btn btn-ghost !min-h-8 !px-2" aria-label={`Move ${f.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
              ↑
            </button>
            <button type="button" className="btn btn-ghost !min-h-8 !px-2" aria-label={`Move ${f.name} down`} disabled={i === files.length - 1} onClick={() => move(i, 1)}>
              ↓
            </button>
            <button type="button" className="btn btn-ghost !min-h-8 !px-2" aria-label={`Remove ${f.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))}>
              ✕
            </button>
          </span>
        </li>
      ))}
    </ol>
  );
}
