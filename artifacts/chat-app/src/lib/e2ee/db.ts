// Tiny promise wrapper around IndexedDB for the E2EE stores.
// One database per logged-in user so multiple accounts on the same browser
// never mix key material.
//
// Object stores:
//   signal    — Signal protocol state (identity keypair, prekeys, sessions…)
//   plaintext — decrypt-once cache: messageId -> decrypted payload JSON

const DB_VERSION = 1;

export function openE2eeDb(userId: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(`skytalk-e2ee-${userId}`, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("signal")) db.createObjectStore("signal");
      if (!db.objectStoreNames.contains("plaintext")) db.createObjectStore("plaintext");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function idbGet<T>(db: IDBDatabase, store: string, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export function idbPut(db: IDBDatabase, store: string, key: IDBValidKey, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function idbDelete(db: IDBDatabase, store: string, key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function idbGetAllKeys(db: IDBDatabase, store: string): Promise<IDBValidKey[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** All key/value pairs in a store (used by the history backup export). */
export function idbGetAllEntries<T>(
  db: IDBDatabase,
  store: string,
): Promise<[IDBValidKey, T][]> {
  return new Promise((resolve, reject) => {
    const os = db.transaction(store, "readonly").objectStore(store);
    const keysReq = os.getAllKeys();
    const valsReq = os.getAll();
    let keys: IDBValidKey[] | null = null;
    let vals: T[] | null = null;
    const done = () => {
      if (keys && vals) resolve(keys.map((k, i) => [k, vals![i] as T]));
    };
    keysReq.onsuccess = () => {
      keys = keysReq.result;
      done();
    };
    valsReq.onsuccess = () => {
      vals = valsReq.result as T[];
      done();
    };
    keysReq.onerror = () => reject(keysReq.error);
    valsReq.onerror = () => reject(valsReq.error);
  });
}
