'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * A value remembered for the visitor: in this browser always, and on the account (so it
 * follows them to other devices) when they are signed in.
 */
export function useSaved<T>(key: string, initial: T, opts: { signedIn: boolean; enabled?: boolean }) {
  const enabled = opts.enabled ?? true;
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(!enabled);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      let found: T | undefined;
      try {
        const raw = localStorage.getItem(`tv:${key}`);
        if (raw) found = JSON.parse(raw) as T;
      } catch {
        /* storage blocked: start empty */
      }
      if (opts.signedIn) {
        try {
          const res = await fetch(`/api/me/data/${encodeURIComponent(key)}`, { cache: 'no-store' });
          if (res.ok) {
            const body = (await res.json()) as { value: T | null };
            if (body.value !== null) found = body.value;
          }
        } catch {
          /* offline: keep the local copy */
        }
      }
      if (!cancelled) {
        if (found !== undefined) setValue(found);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, opts.signedIn, enabled]);

  const save = useCallback(
    async (next: T) => {
      setValue(next);
      if (!enabled) return;
      try {
        localStorage.setItem(`tv:${key}`, JSON.stringify(next));
      } catch {
        /* storage blocked */
      }
      if (opts.signedIn) {
        await fetch(`/api/me/data/${encodeURIComponent(key)}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ value: next }),
        }).catch(() => undefined);
      }
    },
    [key, opts.signedIn, enabled],
  );

  return { value, setValue, save, loaded };
}
