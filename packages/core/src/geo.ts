export type LatLng = { lat: number; lng: number };

export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** 데모용 기준점: 종로5가역 인근(대략). 실제 서비스 좌표 검증 전 값. */
export const JONGNO5GA_STATION: LatLng = { lat: 37.5710, lng: 126.9987 };

/** 서비스(탐험) 지역. 데모 단계의 중심 좌표이며, approximate=true는 정확한 지점 좌표를 아직 확인하지 못한 임시값이다. */
export type ServiceArea = { id: string; name: string; center: LatLng; approximate?: boolean };

export const SERVICE_AREAS: readonly ServiceArea[] = [
  { id: "jongno5ga", name: "종로5가역", center: JONGNO5GA_STATION },
  // 난곡우체국사거리의 정확한 좌표는 미확인. 같은 동의 난곡동주민센터(OSM 노드 4881890752) 좌표를 임시 중심으로 쓴다(교차로 좌표로 교체 필요).
  { id: "nangok", name: "난곡우체국사거리", center: { lat: 37.47093, lng: 126.92164 }, approximate: true },
];

export const DEFAULT_AREA_ID = "jongno5ga";

export function getArea(id: string): ServiceArea {
  return SERVICE_AREAS.find((a) => a.id === id) ?? SERVICE_AREAS[0]!;
}

/** 좌표에서 maxMeters 이내에 있는 가장 가까운 지역. 없으면 null. */
export function nearestArea(p: LatLng, maxMeters: number): { area: ServiceArea; distanceMeters: number } | null {
  let best: { area: ServiceArea; distanceMeters: number } | null = null;
  for (const area of SERVICE_AREAS) {
    const d = haversineMeters(p, area.center);
    if (d <= maxMeters && (!best || d < best.distanceMeters)) best = { area, distanceMeters: d };
  }
  return best;
}
