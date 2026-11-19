import type { CheckInReason } from "@trace/core";

export const checkInMessage: Record<CheckInReason, string> = {
  ok: "현장에 도착했어요!",
  "no-fix": "위치를 확인하지 못했어요. 다시 시도하거나 아래 '기록만 저장'을 이용할 수 있어요.",
  "stale-fix": "위치 정보가 오래되었어요. 다시 시도해 주세요.",
  "low-accuracy": "위치 정확도가 낮아요(건물 사이·지하일 수 있어요). 하늘이 트인 곳에서 다시 시도하거나 기록만 저장할 수 있어요.",
  "too-far": "아직 장소에서 멀어요. 단서를 더 따라가 보세요.",
  "no-coordinates": "이 장소는 좌표가 없어 현장 인증을 할 수 없어요.",
};

export const suggestionMessage: Record<string, string> = {
  "extend-duration": "탐험 시간을 30분 또는 60분으로 늘려 보세요.",
  "allow-paid": "유료 입장 장소도 포함해 보세요.",
  "allow-reservation": "예약이 필요한 장소도 포함해 보세요.",
  "any-theme": "테마를 '무작위'로 바꿔 보세요.",
  "wider-area": "더 넓은 지역을 선택해 보세요.",
  "content-expired": "콘텐츠가 오래되어 새 탐험을 만들 수 없어요. 업데이트 후 다시 시도해 주세요.",
  "try-later": "조건을 바꾸거나 시간을 두고 다시 시도해 보세요.",
};

export const exclusionLabel: Record<string, string> = {
  "closed-day": "정기 휴관일",
  "outside-hours": "운영시간 외",
  "last-entry-passed": "입장 마감",
  "guided-only": "해설 동행 전용",
  "reservation-required": "예약 필요",
  "fee-exceeds-limit": "입장료 초과",
  "exceeds-duration": "시간 초과",
  "route-unknown": "경로 불명",
  "night-outdoor": "야간 야외",
  "no-mission": "미션 없음",
  "theme-mismatch": "테마 불일치",
};
