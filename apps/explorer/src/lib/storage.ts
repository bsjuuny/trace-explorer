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
      req.onsuccess = () => {
        const db = req.result;
        // 다른 탭이 삭제·업그레이드를 요청하면 연결을 닫아 막히지 않게 하고, 다음 접근에서 다시 연다.
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        db.onclose = () => {
          dbPromise = null;
        };
        resolve(db);
      };
      // 일시적 실패(탭 경합·차단)가 영구 메모리 모드로 고정되지 않도록 다음 접근에서 재시도한다.
      req.onerror = () => {
        dbPromise = null;
        resolve(null);
      };
      req.onblocked = () => {
        dbPromise = null;
        resolve(null);
      };
    } catch {
      dbPromise = null;
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

/** 여러 키를 한 트랜잭션으로 저장한다(진행도와 세션이 어긋나지 않게). null 값은 삭제. */
export async function kvSetMany(entries: Record<string, unknown>): Promise<void> {
  for (const [k, v] of Object.entries(entries)) {
    if (v === null) memory.delete(k);
    else memory.set(k, v);
  }
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      const os = tx.objectStore(STORE);
      for (const [k, v] of Object.entries(entries)) {
        if (v === null) os.delete(k);
        else os.put(v, k);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * 모든 로컬 데이터를 실제로 삭제한다(도감·XP·동의 기록·진행 중 탐험 포함).
 * 다른 탭이 DB를 붙잡고 있어 삭제가 막히면 blocked=true를 돌려주므로, 호출부는 "삭제 완료"로 안내하지 않아야 한다.
 */
export async function wipeAll(): Promise<{ blocked: boolean }> {
  memory.clear();
  const db = await open();
  if (db) db.close();
  dbPromise = null;
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve({ blocked: false });
    let blocked = false;
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve({ blocked });
    req.onerror = () => resolve({ blocked: true });
    // blocked 이후에도 다른 탭이 닫히면 삭제가 이어서 완료될 수 있으므로 success를 잠시 기다린다.
    req.onblocked = () => {
      blocked = true;
      setTimeout(() => resolve({ blocked: true }), 1500);
    };
  });
}
