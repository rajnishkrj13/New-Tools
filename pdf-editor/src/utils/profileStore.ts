/**
 * Storage for things you reuse (saved signatures, your details). It is a separate browser
 * database from auto-save, so switching auto-save off or discarding a saved document never
 * erases them. Everything stays in this browser profile on this device.
 */
const DB_NAME = 'pdf-editor-profile';
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('Browser storage is not available.'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Browser storage could not be opened.'));
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
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error ?? req.error);
        tx.onabort = () => reject(tx.error ?? new Error('Saving was aborted (storage may be full).'));
      }),
  );
}

export const profileGet = <T>(key: string) => request<T | undefined>('readonly', (s) => s.get(key));
export const profilePut = (key: string, value: unknown) => request('readwrite', (s) => s.put(value, key));
export const profileClear = () => request('readwrite', (s) => s.clear());
