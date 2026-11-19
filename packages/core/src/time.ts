/** Asia/Seoul(UTC+9, DST 없음) 기준 시각 분해. 입력 ISO의 오프셋과 무관하게 같은 순간이면 같은 결과. */
export type SeoulTime = { date: string; dow: number; month: number; minutes: number; epochMs: number };

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function toSeoul(iso: string): SeoulTime {
  const epochMs = Date.parse(iso);
  if (Number.isNaN(epochMs)) throw new Error(`invalid datetime: ${iso}`);
  const k = new Date(epochMs + KST_OFFSET_MS);
  const y = k.getUTCFullYear();
  const mo = k.getUTCMonth() + 1;
  const d = k.getUTCDate();
  return {
    date: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    dow: k.getUTCDay(),
    month: mo,
    minutes: k.getUTCHours() * 60 + k.getUTCMinutes(),
    epochMs,
  };
}

export function hhmmToMinutes(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function addMinutesIso(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60000).toISOString();
}
