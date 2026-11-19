/* 앱 셸·콘텐츠 캐시. 캐시 버전을 올리면 이전 캐시는 activate에서 삭제된다. */
const CACHE_VERSION = "trace-__BUILD_ID__"; // 빌드 시 해시로 치환(vite 플러그인)
const CONTENT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 오래된 운영정보를 무기한 보여주지 않는다
const PRECACHE = "__PRECACHE__"; // 빌드 시 해시된 JS/CSS 경로 JSON으로 치환
const NAV_TIMEOUT_MS = 4000; // 신호가 약해도 캐시된 앱 셸이 있으면 이 시간 안에 보여준다
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png"].concat(PRECACHE.startsWith("__") ? [] : JSON.parse(PRECACHE));

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(SHELL)));
  // 즉시 활성화하지 않는다. 사용자가 업데이트 안내에서 적용을 선택하면 SKIP_WAITING을 받는다.
});

self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const fresh = await caches.open(CACHE_VERSION);
      // 새 캐시에 아직 없는 콘텐츠 응답(content.json 등)은 이전 캐시에서 옮겨 둔다.
      // 활성화 직후 오프라인이어도 24시간 이내 콘텐츠를 계속 쓸 수 있게 하기 위함이다.
      for (const k of keys.filter((k) => k.startsWith("trace-") && k !== CACHE_VERSION)) {
        const old = await caches.open(k);
        for (const req of await old.keys()) {
          if (!/\/content\/content(\.prev)?\.json$/.test(new URL(req.url).pathname)) continue;
          if (await fresh.match(req)) continue;
          const res = await old.match(req);
          if (res) await fresh.put(req, res);
        }
      }
      await Promise.all(keys.filter((k) => k.startsWith("trace-") && k !== CACHE_VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 지도 SDK 등 외부 요청은 건드리지 않는다

  if (/\/content\/content(\.prev)?\.json$/.test(url.pathname)) {
    e.respondWith(contentNetworkFirst(req));
    return;
  }
  if (req.mode === "navigate") {
    // index.html은 network-first: 새 배포가 재방문자에게 전달되도록 한다. 느리거나 실패(5xx 포함)하면 캐시로 폴백한다.
    e.respondWith(navigate(req));
    return;
  }
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          // 해시된 에셋·앱 셸 파일만 런타임 캐시에 저장한다(임의 경로 응답 캐시 오염 방지).
          if (res.ok && res.type === "basic" && /\/(assets\/|manifest\.webmanifest$|icon\.svg$|icon-[\w-]+\.png$|apple-touch-icon\.png$)/.test(url.pathname)) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});

async function contentNetworkFirst(req) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const res = await fetch(req, { cache: "no-cache" });
    if (res.ok) {
      const headers = new Headers(res.headers);
      headers.set("x-cached-at", String(Date.now()));
      const body = await res.clone().blob();
      await cache.put(req, new Response(body, { status: res.status, headers }));
      return res;
    }
  } catch {
    /* 네트워크 예외: 캐시로 폴백 */
  }
  // 네트워크 예외 또는 5xx/4xx일 때도 24시간 이내 캐시가 있으면 그것을 쓴다.
  const hit = await cache.match(req);
  const at = hit ? Number(hit.headers.get("x-cached-at") || 0) : 0;
  if (hit && Date.now() - at < CONTENT_MAX_AGE_MS) return hit;
  return new Response("stale-or-offline", { status: 503 });
}

async function navigate(req) {
  const cached = () => caches.match("./index.html").then((h) => h || caches.match("./"));
  const network = fetch(req).then(async (res) => {
    // 정상 HTML 문서 응답만 index.html로 캐시한다(리다이렉트·타 Content-Type·오류 응답 제외).
    const isHtml = (res.headers.get("content-type") || "").includes("text/html");
    if (res.ok && res.type === "basic" && !res.redirected && isHtml) {
      const copy = res.clone();
      caches.open(CACHE_VERSION).then((c) => c.put("./index.html", copy));
      return res;
    }
    if (res.ok) return res; // 문서가 아닌 정상 응답(예: 다른 형식)은 그대로 전달
    const hit = await cached();
    return hit || res; // 5xx·4xx면 캐시된 셸을 우선
  });
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NAV_TIMEOUT_MS)).then(async () => (await cached()) || network);
  // 네트워크가 먼저 끝나면 그것을, 느리면(타임아웃) 캐시된 셸을 쓰되 캐시가 없으면 네트워크를 계속 기다린다.
  return Promise.race([network.catch(async () => (await cached()) || Response.error()), timeout]);
}
