import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre 6은 워커를 별도 파일로 읽는다. 번들러가 누락하지 않도록 URL을 직접 지정한다.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

maplibregl.setWorkerUrl(workerUrl);

type Props = {
  origin: { lat: number; lng: number };
  /** 위치 동의가 있을 때만 지도 위치 버튼을 붙인다(동의 게이트 우회 방지). */
  allowLocate?: boolean;
};

/** 무료 OpenFreeMap 벡터 스타일. 환경 변수로 다른 스타일(자체 호스팅 PMTiles 등)로 교체할 수 있다. */
const STYLE_URL = (import.meta.env.VITE_MAP_STYLE_URL as string | undefined) || "https://tiles.openfreemap.org/styles/liberty";
const AREA_RADIUS_M = 500;

/** 중심과 반경(m)으로 원 폴리곤을 만든다(외부 라이브러리 없이). */
function circlePolygon(lat: number, lng: number, radiusM: number, steps = 64) {
  const coords: [number, number][] = [];
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    coords.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [coords] } };
}

function pin(color: string, label: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", label);
  el.style.cssText = `width:22px;height:22px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)`;
  return el;
}

/** 지도는 직접 끌고 확대할 수 있다. 아래 텍스트 안내는 지도와 동등한 정보를 제공하는 대체 수단이다. */
export function MapView({ origin, allowLocate = false }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!box.current) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: box.current,
        style: STYLE_URL,
        center: [origin.lng, origin.lat],
        zoom: 14.7,
        // 평면 지도: 기울이기·회전을 막아 어느 방향으로 끌어도 위가 북쪽으로 유지된다.
        pitch: 0,
        maxPitch: 0,
        dragRotate: false,
        touchPitch: false,
        attributionControl: { compact: true },
      });
      map.touchZoomRotate.disableRotation();
    } catch {
      setStatus("error");
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    if (allowLocate) map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false }), "top-right");
    // 타일 일부 실패는 무시하고, 제한 시간 안에 스타일이 로드되지 않으면 텍스트 안내로 대체한다.
    const timer = window.setTimeout(() => {
      if (!map.loaded()) setStatus((s) => (s === "ready" ? s : "error"));
    }, 12000);
    // 테스트·진단용: 이동/확대가 끝날 때마다 현재 중심과 줌을 속성으로 남긴다.
    const publish = () => {
      const c = map.getCenter();
      box.current?.setAttribute("data-center", `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`);
      box.current?.setAttribute("data-zoom", map.getZoom().toFixed(2));
    };
    map.on("moveend", publish);
    map.on("load", () => {
      publish();
      window.clearTimeout(timer);
      // 3D 건물(fill-extrusion) 레이어는 제거하고 평면 건물 레이어만 남긴다.
      for (const l of map.getStyle().layers) if (l.type === "fill-extrusion") map.removeLayer(l.id);
      // 평면 건물은 배경과 구분되도록 색과 외곽선을 또렷하게 한다.
      if (map.getLayer("building")) {
        map.setPaintProperty("building", "fill-color", "#d3d9cf");
        map.setPaintProperty("building", "fill-outline-color", "#a9b5a8");
        map.setPaintProperty("building", "fill-opacity", 1);
      }
      map.addSource("area", { type: "geojson", data: circlePolygon(origin.lat, origin.lng, AREA_RADIUS_M) });
      map.addLayer({ id: "area-fill", type: "fill", source: "area", paint: { "fill-color": "#389264", "fill-opacity": 0.14 } });
      map.addLayer({ id: "area-line", type: "line", source: "area", paint: { "line-color": "#1d5e3e", "line-width": 2 } });
      new maplibregl.Marker({ element: pin("#1d5e3e", "출발점") }).setLngLat([origin.lng, origin.lat]).addTo(map);
      setStatus("ready");
    });
    return () => {
      window.clearTimeout(timer);
      map.remove();
      mapRef.current = null;
    };
  }, [origin.lat, origin.lng, allowLocate]);

  return (
    <div>
      {status !== "error" && (
        <div className="relative">
          <div
            ref={box}
            role="application"
            aria-label="탐험 지도. 끌어서 이동하고 확대·축소할 수 있습니다. 같은 내용은 아래 텍스트 안내에도 있습니다."
            data-testid="map"
            className="h-72 w-full rounded-xl bg-[#e2efe6]"
            style={{ touchAction: "none" }}
          />
          <button
            type="button"
            onClick={() => mapRef.current?.flyTo({ center: [origin.lng, origin.lat], zoom: 14.7 })}
            className="absolute bottom-2 left-2 min-h-[44px] rounded-lg bg-white px-3 text-sm font-semibold shadow"
          >
            출발점으로
          </button>
          {status === "loading" && <p className="absolute inset-0 grid place-items-center text-sm text-[#617369]">지도를 불러오는 중…</p>}
        </div>
      )}
      <ul className="mt-2 rounded-xl bg-white p-3 text-sm" aria-label="지도와 같은 내용의 텍스트 안내">
        <li>출발점: {origin.lat.toFixed(4)}, {origin.lng.toFixed(4)}</li>
        <li>탐험 영역: 출발점에서 걸어서 갈 수 있는 범위(약 {AREA_RADIUS_M}m)</li>
        <li>목적지: 비공개 — 단서를 따라가 보세요</li>
        {status === "error" && <li className="text-[#8a4b00]">지도를 불러오지 못했어요. 위 텍스트 안내를 이용하세요.</li>}
      </ul>
    </div>
  );
}
