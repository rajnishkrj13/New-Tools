/**
 * Storage for things you reuse (saved signatures, your details). It is a separate browser
 * database from auto-save, so switching auto-save off or discarding a saved document never
 * erases them. Everything stays in this browser profile on this device.
 */
import { syncsToAccount } from './embed';

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

const localGet = <T>(key: string) => request<T | undefined>('readonly', (s) => s.get(key));
const localPut = (key: string, value: unknown) => request('readwrite', (s) => s.put(value, key));

// ---- the member's account on Toolyverse ---------------------------------------------------------
// Signed-in members keep these on their account too, so they follow them to other devices.
// Pictures (Uint8Array) are sent as base64 inside the JSON.

const KEYS = ['marks', 'details', 'dateFormat'];
const url = (key: string) => `/api/me/data/pdf-profile-${key}`;

function toBase64(u8: Uint8Array) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}
const encode = (v: unknown) => JSON.stringify({ value: v }, (_, x) => (x instanceof Uint8Array ? { __u8: toBase64(x) } : x));
const decode = (text: string) =>
  JSON.parse(text, (_, x) => (x && typeof x === 'object' && typeof x.__u8 === 'string' ? Uint8Array.from(atob(x.__u8), (c) => c.charCodeAt(0)) : x)).value;

async function remoteGet<T>(key: string): Promise<T | undefined> {
  const res = await fetch(url(key), { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const v = decode(await res.text());
  return v === null ? undefined : (v as T);
}

async function remotePut(key: string, value: unknown) {
  const res = await fetch(url(key), { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: encode(value ?? null) });
  if (!res.ok) throw new Error(res.status === 413 ? 'Too many saved signatures to keep on your account; delete some.' : `HTTP ${res.status}`);
}

export async function profileGet<T>(key: string): Promise<T | undefined> {
  if (syncsToAccount()) {
    try {
      const remote = await remoteGet<T>(key);
      if (remote !== undefined) {
        await localPut(key, remote).catch(() => undefined);
        return remote;
      }
      // Nothing on the account yet: what this browser has becomes the account's copy.
      const local = await localGet<T>(key).catch(() => undefined);
      if (local !== undefined) await remotePut(key, local).catch(() => undefined);
      return local;
    } catch {
      /* offline: fall back to this browser */
    }
  }
  return localGet<T>(key);
}

export async function profilePut(key: string, value: unknown) {
  await localPut(key, value);
  if (syncsToAccount()) await remotePut(key, value);
}

export async function profileClear() {
  await request('readwrite', (s) => s.clear());
  if (syncsToAccount()) await Promise.all(KEYS.map((k) => remotePut(k, null)));
}
