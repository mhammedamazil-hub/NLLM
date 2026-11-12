/**
 * persistence — IndexedDB-backed persistence for the SQLite database.
 * On startup, load the serialized DB blob from IndexedDB.
 * On mutations, save the exported blob back to IndexedDB.
 *
 * This gives us durable local-first storage without OPFS complexity.
 * The DB stays in memory for fast queries; IndexedDB is the snapshot.
 */

const DB_NAME = 'notebook-studio';
const DB_STORE = 'databases';
const DB_KEY = 'main';

interface StoredDb {
  blob: Uint8Array;
  savedAt: number;
}

let idbPromise: Promise<IDBDatabase | null> | null = null;

function openIdb(): Promise<IDBDatabase | null> {
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return idbPromise;
}

/** Load the persisted DB blob from IndexedDB. Returns null if none. */
export async function loadPersistedDb(): Promise<Uint8Array | null> {
  const idb = await openIdb();
  if (!idb) return null;
  return new Promise((resolve) => {
    try {
      const tx = idb.transaction(DB_STORE, 'readonly');
      const store = tx.objectStore(DB_STORE);
      const req = store.get(DB_KEY);
      req.onsuccess = () => {
        const result = req.result as StoredDb | undefined;
        if (!result) {
          resolve(null);
        } else {
          // Copy to a fresh Uint8Array to avoid shared buffer issues
          resolve(new Uint8Array(result.blob));
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Save a DB blob to IndexedDB. */
export async function savePersistedDb(blob: Uint8Array): Promise<void> {
  const idb = await openIdb();
  if (!idb) return;
  return new Promise((resolve) => {
    try {
      const tx = idb.transaction(DB_STORE, 'readwrite');
      const store = tx.objectStore(DB_STORE);
      const record: StoredDb = { blob, savedAt: Date.now() };
      const req = store.put(record, DB_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Delete the persisted DB (for reset/debug). */
export async function clearPersistedDb(): Promise<void> {
  const idb = await openIdb();
  if (!idb) return;
  return new Promise((resolve) => {
    try {
      const tx = idb.transaction(DB_STORE, 'readwrite');
      const store = tx.objectStore(DB_STORE);
      store.delete(DB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
