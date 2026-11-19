/**
 * IndexedDB 키-값 저장소. 버전 마이그레이션을 지원하고, IndexedDB를 쓸 수 없으면 메모리로 대체한다.
 * 저장 항목은 동의 상태·도감/XP·진행 중 탐험·설정뿐이며, 이동 경로(좌표 이력)는 저장하지 않는다.
 */
const DB_NAME = "trace-explorer";
export const DB_VERSION = 2;
const STORE = "kv";

const memory = new Map<string, unknown>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (ev) => {
        const db = req.result;
        const old = ev.oldVersion;
        if (old < 1) db.createObjectStore(STORE);
        // v1 -> v2: 진행 상태 키를 progress로 통일. 구조가 바뀌면 여기서 변환한다.
        if (old === 1) {
          const tx = req.transaction;
          if (tx) {
            const s = tx.objectStore(STORE);
            const g = s.get("state");
            g.onsuccess = () => {
              if (g.result !== undefined) {
                s.put(g.result, "progress");
                s.delete("state");
              }
            };
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await open();
  if (!db) return memory.get(key) as T | undefined;
  return new Promise((resolve) => {
    const r = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result as T | undefined);
    r.onerror = () => resolve(memory.get(key) as T | undefined);
  });
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  memory.set(key, value);
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

export async function kvDelete(key: string): Promise<void> {
  memory.delete(key);
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/** 모든 로컬 데이터를 실제로 삭제한다(도감·XP·동의 기록·진행 중 탐험 포함). */
export async function wipeAll(): Promise<void> {
  memory.clear();
  const db = await open();
  if (db) db.close();
  dbPromise = null;
  await new Promise<void>((resolve) => {
    if (typeof indexedDB === "undefined") return resolve();
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}
