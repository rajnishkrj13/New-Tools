/**
 * Tiny key-value store on IndexedDB, used for auto-save. IndexedDB lives in this browser
 * profile on this device; nothing stored here is sent anywhere.
 */
const DB_NAME = 'pdf-editor';
const STORE = 'session';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('Browser storage is not available.'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Browser storage could not be opened.'));
    req.onblocked = () => reject(new Error('Browser storage is blocked by another tab.'));
  });
  dbPromise.catch(() => (dbPromise = null));
  return dbPromise;
}

function request<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = run(tx.objectStore(STORE));
        // Resolve when the transaction is durable, not merely when the request succeeded.
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error ?? req.error);
        tx.onabort = () => reject(tx.error ?? new Error('Saving was aborted (storage may be full).'));
      }),
  );
}

export const idbGet = <T>(key: string) => request<T | undefined>('readonly', (s) => s.get(key));
export const idbPut = (key: string, value: unknown) => request('readwrite', (s) => s.put(value, key));
export const idbDelete = (key: string) => request('readwrite', (s) => s.delete(key));
export const idbClear = () => request('readwrite', (s) => s.clear());

/** Deletes every key that starts with `prefix/` (everything stored for one document). */
export const idbDeleteRange = (prefix: string) =>
  request('readwrite', (s) => s.delete(IDBKeyRange.bound(`${prefix}/`, `${prefix}/${String.fromCharCode(0xffff)}`)));
