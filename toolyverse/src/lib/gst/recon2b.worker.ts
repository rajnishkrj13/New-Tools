/**
 * Runs the GSTR-2B vs purchase register matching off the page, so a large register does not
 * freeze it. Takes { id, twoB, books, opt } and answers { id, result } or { id, error }.
 */
import { reconcile, type Doc, type Options } from './recon2b';

const scope = self as unknown as { onmessage: ((e: MessageEvent) => void) | null; postMessage: (m: unknown) => void };

scope.onmessage = (e: MessageEvent<{ id: number; twoB: Doc[]; books: Doc[]; opt: Options }>) => {
  const { id, twoB, books, opt } = e.data;
  try {
    scope.postMessage({ id, result: reconcile(twoB, books, opt) });
  } catch (err) {
    scope.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
