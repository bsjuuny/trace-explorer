export const ENGINE_VERSION = "1.1.0";
export const SCORE_WEIGHTS_VERSION = "w2";

export const ENGINE_CONFIG = {
  clueMinutes: 4,
  recordMinutes: 2,
  safetyMarginMinutes: 2,
  /** approximate 보행 ETA: 직선거리 x 보수 계수 / 보행속도 */
  approxDetourFactor: 1.4,
  walkMetersPerMinute: 70,
  /** approximate 허용 최대 직선거리(m). 초과하면 unknown 처리해 제외 */
  approxMaxStraightMeters: 700,
  /** 기준 출발점 반경(m) 안이면 사전 측정 walkEstimate 사용 */
  referenceOriginRadiusMeters: 150,
  /** 야외 미션 허용 시간대(KST 분). 야간은 보수적으로 제외 */
  outdoorStartMinutes: 6 * 60,
  outdoorEndMinutes: 19 * 60,
  /** 점수 상위 N곳 중 가중 무작위로 고른다. 점수 차가 작아 5에서 자르면 후보 15곳 중 일부만 영원히 나오므로 8로 넓힘 */
  topN: 8,
} as const;
