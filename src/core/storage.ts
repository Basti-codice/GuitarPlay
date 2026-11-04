// Tiny IndexedDB wrapper (no dependencies) + localStorage JSON helpers.
const DB_NAME = 'guitarplay';
const DB_VER = 1;
export type StoreName = 'songs' | 'sheets' | 'recordings';

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const d = req.result;
        for (const s of ['songs', 'sheets', 'recordings']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(store, mode);
        const r = fn(t.objectStore(store));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }),
  );
}

export const idbAll = <T,>(store: StoreName) => tx<T[]>(store, 'readonly', (s) => s.getAll());
export const idbGet = <T,>(store: StoreName, id: string) => tx<T | undefined>(store, 'readonly', (s) => s.get(id));
export const idbPut = <T extends { id: string }>(store: StoreName, v: T) => tx(store, 'readwrite', (s) => s.put(v)).then(() => v);
export const idbDelete = (store: StoreName, id: string) => tx(store, 'readwrite', (s) => s.delete(id)).then(() => undefined);

export function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    /* ignore */
  }
  return fallback;
}
export function lsSet(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}
