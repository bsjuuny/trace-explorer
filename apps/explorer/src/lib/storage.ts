/**
 * IndexedDB 키-값 저장소. 버전 마이그레이션을 지원하고, IndexedDB를 쓸 수 없으면 메모리로 대체한다.
 * 저장 항목은 동의 상태·도감/XP·진행 중 탐험·설정뿐이며, 이동 경로(좌표 이력)는 저장하지 않는다.
 *
 * 견고성: DB를 열지 못한 동안의 쓰기는 `pending`에 모아 두었다가 다음에 DB가 열리면 한 트랜잭션으로 반영한다.
 * 모든 트랜잭션은 예외·abort를 흡수해 호출부가 멈추지 않게 한다(저장 실패는 메모리 값으로 계속 동작).
 */
const DB_NAME = "trace-explorer";
export const DB_VERSION = 2;
const STORE = "kv";
/** 다른 탭이 구버전 연결을 붙잡고 있을 때 업그레이드를 기다리는 시간 */
const OPEN_WAIT_MS = 3000;

const memory = new Map<string, unknown>();
/** DB에 아직 반영되지 않은 변경(값 또는 삭제 표시) */
const DELETED = Symbol("deleted");
const pending = new Map<string, unknown>();
let dbPromise: Promise<IDBDatabase | null> | null = null;
/** wipeAll 진행 중이면 그동안의 쓰기는 끝난 뒤에 처리한다(삭제된 데이터가 되살아나지 않게) */
let wipeInFlight: Promise<unknown> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    let settled = false;
    const settle = (db: IDBDatabase | null) => {
      if (settled) {
        // 대기 시간이 지난 뒤 늦게 열린 연결은 쓰지 않으므로 닫아 deleteDatabase·업그레이드를 막지 않게 한다.
        db?.close();
        return;
      }
      settled = true;
      if (!db) dbPromise = null; // 실패는 영구 메모리 모드로 굳지 않고 다음 접근에서 재시도한다.
      resolve(db);
    };
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
        settle(db);
      };
      req.onerror = () => settle(null);
      // blocked: 다른 탭이 닫히면 곧 success가 올 수 있으므로 바로 포기하지 않고 잠시 기다린다.
      req.onblocked = () => {
        setTimeout(() => settle(null), OPEN_WAIT_MS);
      };
    } catch {
      settle(null);
    }
  });
  return dbPromise;
}

/** 트랜잭션을 실행하고 완료·오류·abort·예외 모두에서 resolve한다. 성공했을 때만 true. */
function runTx(db: IDBDatabase, mode: IDBTransactionMode, fn: (os: IDBObjectStore) => void): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/** DB가 열려 있으면 밀린 변경을 먼저 반영한다. */
async function flushPending(db: IDBDatabase): Promise<void> {
  if (pending.size === 0) return;
  const batch = [...pending.entries()];
  const ok = await runTx(db, "readwrite", (os) => {
    for (const [k, v] of batch) {
      if (v === DELETED) os.delete(k);
      else os.put(v, k);
    }
  });
  if (ok) for (const [k, v] of batch) if (pending.get(k) === v) pending.delete(k);
}

async function ready(): Promise<IDBDatabase | null> {
  if (wipeInFlight) await wipeInFlight;
  const db = await open();
  if (db) await flushPending(db);
  return db;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await ready();
  if (!db) return memory.get(key) as T | undefined;
  return new Promise((resolve) => {
    try {
      const r = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result as T | undefined);
      r.onerror = () => resolve(memory.get(key) as T | undefined);
    } catch {
      resolve(memory.get(key) as T | undefined);
    }
  });
}

/** 여러 키를 한 트랜잭션으로 저장한다(진행도와 세션이 어긋나지 않게). null 값은 삭제. */
export async function kvSetMany(entries: Record<string, unknown>): Promise<void> {
  for (const [k, v] of Object.entries(entries)) {
    if (v === null) memory.delete(k);
    else memory.set(k, v);
    pending.set(k, v === null ? DELETED : v);
  }
  const db = await ready();
  if (!db) return; // DB를 못 열었으면 pending에 남아 다음에 DB가 열릴 때 반영된다.
  // ready()의 flush가 방금 넣은 항목까지 이미 처리했을 수 있다.
  await flushPending(db);
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await kvSetMany({ [key]: value });
}

export async function kvDelete(key: string): Promise<void> {
  await kvSetMany({ [key]: null });
}

/**
 * 모든 로컬 데이터를 실제로 삭제한다(도감·XP·동의 기록·진행 중 탐험 포함).
 * 다른 탭이 DB를 붙잡고 있어 삭제가 끝나지 않으면 blocked=true를 돌려준다. 이 경우 호출부는 상태를 지우거나
 * "삭제 완료"로 안내하지 않아야 한다. 삭제가 성공하면(늦게라도 대기 시간 안에) blocked=false.
 */
export function wipeAll(): Promise<{ blocked: boolean }> {
  const run = async (): Promise<{ blocked: boolean }> => {
    const db = await open();
    if (db) db.close();
    dbPromise = null;
    return new Promise((resolve) => {
      if (typeof indexedDB === "undefined") {
        memory.clear();
        pending.clear();
        return resolve({ blocked: false });
      }
      let done = false;
      const finish = (blocked: boolean) => {
        if (done) return;
        done = true;
        // 메모리·보류 변경은 실제로 삭제가 끝난 뒤에만 비운다(막힌 경우 화면 상태와 저장 상태가 어긋나지 않게).
        if (!blocked) {
          memory.clear();
          pending.clear();
        }
        resolve({ blocked });
      };
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => finish(false);
      req.onerror = () => finish(true);
      // blocked 이후 다른 탭이 닫히면 success가 이어서 올 수 있다. 대기 시간 안에 성공하면 blocked=false.
      req.onblocked = () => {
        setTimeout(() => finish(true), 1500);
      };
    });
  };
  wipeInFlight = run().finally(() => {
    wipeInFlight = null;
  });
  return wipeInFlight as Promise<{ blocked: boolean }>;
}
