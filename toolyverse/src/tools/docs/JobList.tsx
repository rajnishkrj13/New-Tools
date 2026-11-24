'use client';

import { useState } from 'react';
import { formatSize } from '../kit';
import type { Job } from './queue';

const COLOR: Record<Job<unknown>['status'], string> = { queued: 'var(--ink-3)', running: 'var(--warn)', done: 'var(--ok)', failed: 'var(--bad)', cancelled: 'var(--ink-3)', password: 'var(--warn)' };
const WORD: Record<Job<unknown>['status'], string> = { queued: 'Waiting', running: 'Working', done: 'Done', failed: 'Failed', cancelled: 'Stopped', password: 'Password needed' };

/** The files of a batch, each with its own status, stage and actions. */
export function JobList<T>({ jobs, selected, onSelect, onRemove, onRetry, onCancel, onPassword, summary }: { jobs: Job<T>[]; selected: number | null; onSelect: (id: number) => void; onRemove: (id: number) => void; onRetry: (id: number) => void; onCancel: (id: number) => void; onPassword: (id: number, pw: string) => void; summary?: (j: Job<T>) => string }) {
  const [pw, setPw] = useState<Record<number, string>>({});
  return (
    <ul className="divide-y divide-rule border border-rule">
      {jobs.map((j) => (
        <li key={j.id} className={`px-3 py-2 ${selected === j.id ? 'bg-paper-2' : ''}`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <button type="button" className="min-w-0 flex-1 truncate text-left font-medium" title={j.file.name} onClick={() => onSelect(j.id)} disabled={j.status !== 'done'}>
              {j.file.name} <span className="font-normal text-ink-3">· {formatSize(j.file.size)}</span>
            </button>
            <span className="text-[0.85rem]" style={{ color: COLOR[j.status] }}>
              {WORD[j.status]}
              {j.status === 'running' ? `: ${j.stage}` : j.status === 'done' && summary ? `: ${summary(j)}` : ''}
            </span>
            {j.status === 'done' && selected !== j.id && (
              <button type="button" className="text-sm underline" onClick={() => onSelect(j.id)}>
                Review
              </button>
            )}
            {(j.status === 'running' || j.status === 'queued') && (
              <button type="button" className="text-sm underline" onClick={() => onCancel(j.id)}>
                Stop
              </button>
            )}
            {(j.status === 'failed' || j.status === 'cancelled') && (
              <button type="button" className="text-sm underline" onClick={() => onRetry(j.id)}>
                Try again
              </button>
            )}
            <button type="button" className="text-sm text-ink-3 underline" onClick={() => onRemove(j.id)} aria-label={`Remove ${j.file.name}`}>
              Remove
            </button>
          </div>
          {j.status === 'running' && (
            <div className="mt-1 h-1 bg-rule" aria-hidden="true">
              <div className="h-1 bg-signal transition-[width]" style={{ width: `${Math.round(j.progress * 100)}%` }} />
            </div>
          )}
          {j.status === 'failed' && <p className="mt-1 text-[0.85rem] text-bad">{j.error}</p>}
          {j.status === 'password' && (
            <form
              className="mt-1 flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (pw[j.id]) onPassword(j.id, pw[j.id]);
              }}
            >
              <input type="password" className="field !min-h-8 max-w-xs py-0.5 text-sm" placeholder="Password that opens this PDF" autoComplete="off" value={pw[j.id] ?? ''} onChange={(e) => setPw({ ...pw, [j.id]: e.target.value })} />
              <button type="submit" className="btn !min-h-8 text-sm" disabled={!pw[j.id]}>
                Open
              </button>
              {j.wrongPassword && <span className="text-[0.85rem] text-bad">That password does not open it.</span>}
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
