// 배치 체험의 상태. 서버(쿼리 해석)와 클라이언트(화면)가 함께 쓴다.
export interface DemoState {
  area: number;
  staff: number;
  ceo: boolean;
  meeting: boolean;
  meetingSeats: number;
  pantry: boolean;
  storage: boolean;
  entrance: "right" | "left";
  priority: "visitor" | "collab" | "focus" | "unknown";
  style: string;
  /** 고른 배치안. 비어 있으면 우선순위에 맞는 배치를 보여 준다. */
  option: string;
}

export const DEMO_DEFAULT: DemoState = { area: 30, staff: 8, ceo: true, meeting: true, meetingSeats: 6, pantry: true, storage: false, entrance: "right", priority: "unknown", style: "natural", option: "" };

/** 체험한 조건을 요청 등록 화면으로 넘기는 쿼리스트링 */
export function demoQuery(s: DemoState, extra: Record<string, string> = {}) {
  const mood = s.style === "chic" ? "pro" : s.style === "lovely" ? "soft" : "warm";
  return new URLSearchParams({
    area: String(s.area),
    staff: String(s.staff),
    ceo: s.ceo ? "1" : "0",
    meeting: s.meeting ? "1" : "0",
    seats: String(s.meetingSeats),
    pantry: s.pantry ? "1" : "0",
    storage: s.storage ? "1" : "0",
    entrance: s.entrance,
    priority: s.priority,
    mood,
    option: s.option,
    ...extra,
  }).toString();
}
