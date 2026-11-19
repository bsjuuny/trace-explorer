import { useEffect, useState } from "react";

/** 서비스 워커를 등록하고, 새 버전이 대기 중이면 적용 함수를 돌려준다. */
export function useServiceWorkerUpdate(): { updateReady: boolean; apply: () => void } {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || import.meta.env.DEV) return;
    let reloading = false;
    // 첫 방문의 최초 활성화(controller가 없던 상태)에서는 새로고침하지 않는다. 입력 중인 화면이 사라지기 때문이다.
    // 이미 서비스 워커가 있던 상태에서 새 버전으로 교체될 때만(사용자가 '업데이트'를 눌렀을 때) 새로고침한다.
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloading) return;
      reloading = true;
      location.reload();
    });
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const w = reg.installing;
          w?.addEventListener("statechange", () => {
            if (w.state === "installed" && navigator.serviceWorker.controller) setWaiting(w);
          });
        });
      })
      .catch(() => undefined);
  }, []);

  return { updateReady: !!waiting, apply: () => waiting?.postMessage("SKIP_WAITING") };
}
