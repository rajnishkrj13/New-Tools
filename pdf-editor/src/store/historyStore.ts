/**
 * Snapshot history. Editor objects are immutable, so a snapshot is just the array of
 * object references that was current at that moment - unchanged objects are shared
 * between snapshots and cost nothing. One history covers every page of the document.
 */
export interface History<T> {
  past: T[];
  future: T[];
  /** Key and time of the last commit, used to merge rapid changes of the same control. */
  lastKey: string | null;
  lastTime: number;
}

export const HISTORY_LIMIT = 300;
const MERGE_WINDOW_MS = 700;

export const emptyHistory = <T>(): History<T> => ({ past: [], future: [], lastKey: null, lastTime: 0 });

/**
 * Records `current` as the state to return to. When `key` equals the key of the previous
 * commit and it happened a moment ago (dragging a slider, typing in a size field), the
 * commits are merged into one undo step.
 */
export function pushHistory<T>(h: History<T>, current: T, key: string | null = null, now = Date.now()): History<T> {
  if (key && key === h.lastKey && now - h.lastTime < MERGE_WINDOW_MS && h.past.length) {
    return { ...h, future: [], lastTime: now };
  }
  const past = [...h.past, current];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { past, future: [], lastKey: key, lastTime: now };
}

export function undoHistory<T>(h: History<T>, current: T): { history: History<T>; state: T } | null {
  if (!h.past.length) return null;
  const state = h.past[h.past.length - 1];
  return { state, history: { past: h.past.slice(0, -1), future: [current, ...h.future], lastKey: null, lastTime: 0 } };
}

export function redoHistory<T>(h: History<T>, current: T): { history: History<T>; state: T } | null {
  if (!h.future.length) return null;
  const state = h.future[0];
  return { state, history: { past: [...h.past, current], future: h.future.slice(1), lastKey: null, lastTime: 0 } };
}
