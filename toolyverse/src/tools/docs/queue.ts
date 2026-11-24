'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled' | 'password';

export interface Job<T> {
  id: number;
  file: File;
  status: JobStatus;
  stage: string;
  progress: number;
  result?: T;
  error?: string;
  password?: string;
  /** The password given was wrong. */
  wrongPassword?: boolean;
}

export class NeedsPassword extends Error {
  constructor(public wrong: boolean) {
    super(wrong ? 'That password does not open this file.' : 'This file has a password.');
  }
}

/**
 * Files converted one after another, each on its own: a failure, a wrong password or a cancel
 * affects only that file. `work` reports its real stage and progress through `report`.
 */
export function useQueue<T>(work: (job: Job<T>, report: (stage: string, progress?: number) => void, signal: AbortSignal) => Promise<T>) {
  const [jobs, setJobs] = useState<Job<T>[]>([]);
  const seq = useRef(0);
  const running = useRef<{ id: number; ctrl: AbortController } | null>(null);
  const workRef = useRef(work);
  useEffect(() => {
    workRef.current = work;
  });

  const patch = useCallback((id: number, p: Partial<Job<T>>) => setJobs((cur) => cur.map((j) => (j.id === id ? { ...j, ...p } : j))), []);

  useEffect(() => {
    if (running.current) return;
    const next = jobs.find((j) => j.status === 'queued');
    if (!next) return;
    const ctrl = new AbortController();
    running.current = { id: next.id, ctrl };
    // Starting the next file is the job of this effect: it hands the file to the converter.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    patch(next.id, { status: 'running', stage: 'Reading the file', progress: 0, error: undefined });
    workRef
      .current(next, (stage, progress) => patch(next.id, { stage, ...(progress !== undefined ? { progress } : {}) }), ctrl.signal)
      .then((result) => patch(next.id, { status: 'done', result, stage: 'Done', progress: 1 }))
      .catch((e: Error) => {
        if (ctrl.signal.aborted) patch(next.id, { status: 'cancelled', stage: 'Stopped' });
        else if (e instanceof NeedsPassword) patch(next.id, { status: 'password', wrongPassword: e.wrong, stage: e.message });
        else patch(next.id, { status: 'failed', error: e.message || 'The conversion failed.', stage: 'Failed' });
      })
      .finally(() => {
        running.current = null;
        setJobs((cur) => [...cur]);
      });
  }, [jobs, patch]);

  return {
    jobs,
    add: (files: File[]) => setJobs((cur) => [...cur, ...files.map((file) => ({ id: ++seq.current, file, status: 'queued' as const, stage: 'Waiting', progress: 0 }))]),
    remove: (id: number) => {
      if (running.current?.id === id) running.current.ctrl.abort();
      setJobs((cur) => cur.filter((j) => j.id !== id));
    },
    cancel: (id: number) => {
      if (running.current?.id === id) running.current.ctrl.abort();
      else patch(id, { status: 'cancelled', stage: 'Stopped' });
    },
    retry: (id: number) => patch(id, { status: 'queued', stage: 'Waiting', error: undefined, result: undefined }),
    retryAll: () => setJobs((cur) => cur.map((j) => (j.status === 'running' ? j : { ...j, status: 'queued', stage: 'Waiting', error: undefined, result: undefined }))),
    setPassword: (id: number, password: string) => patch(id, { password, status: 'queued', stage: 'Waiting', wrongPassword: false }),
    update: (id: number, result: T) => patch(id, { result }),
    clear: () => {
      running.current?.ctrl.abort();
      setJobs([]);
    },
  };
}
