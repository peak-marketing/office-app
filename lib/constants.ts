export const PROJECT_STATUS = {
  draft: { label: "요청 준비", hint: "배치안을 확인하고 견적·제안을 요청하세요." },
  requested: { label: "운영자 검토", hint: "운영자가 자료와 배치안을 검토하고 시공사를 배정합니다." },
  matching: { label: "제안 접수", hint: "배정된 시공사가 견적·제안을 작성하고 있습니다." },
  quoted: { label: "제안 비교", hint: "도착한 제안을 비교하고 현장 방문을 요청하세요." },
  visit: { label: "상담·현장 방문", hint: "선택한 시공사와 현장 방문을 진행합니다." },
  contracted: { label: "계약 완료", hint: "계약 결과가 기록되었습니다." },
  closed: { label: "종료", hint: "요청이 종료되었습니다." },
} as const;
export type ProjectStatus = keyof typeof PROJECT_STATUS;
export const STATUS_FLOW: ProjectStatus[] = ["draft", "requested", "matching", "quoted", "visit", "contracted"];

// 업체 간 비교가 가능하도록 공사 항목을 고정한다.
export const QUOTE_CATEGORIES = [
  { key: "demolition", label: "철거·가설" },
  { key: "partition", label: "칸막이·유리" },
  { key: "floor", label: "바닥" },
  { key: "ceiling", label: "천장" },
  { key: "electric", label: "전기·조명" },
  { key: "network", label: "통신·네트워크" },
  { key: "hvac", label: "냉난방·환기" },
  { key: "fire", label: "소방" },
  { key: "finish", label: "도장·마감" },
  { key: "plumbing", label: "탕비·급배수" },
  { key: "door", label: "도어·사인" },
  { key: "furniture", label: "가구" },
  { key: "etc", label: "폐기물·관리비 등 기타" },
] as const;

// 집(주거) 요청의 공사 항목. 사무실 항목과 키가 겹치지 않아 제안 내용만 보고도 어느 항목 세트인지 알 수 있다.
export const HOME_QUOTE_CATEGORIES = [
  { key: "strip", label: "철거·보양" },
  { key: "wallpaper", label: "도배" },
  { key: "flooring", label: "바닥(장판·마루·타일)" },
  { key: "film", label: "필름·도장" },
  { key: "carpentry", label: "목공·천장·몰딩" },
  { key: "doors", label: "문·중문" },
  { key: "window", label: "샷시·창호" },
  { key: "bath", label: "욕실" },
  { key: "kitchen", label: "주방(싱크대·상판)" },
  { key: "lighting", label: "전기·조명" },
  { key: "piping", label: "설비(급배수·난방)" },
  { key: "balcony", label: "발코니 확장·단열" },
  { key: "builtin", label: "붙박이장·가구" },
  { key: "misc", label: "폐기물·관리비 등 기타" },
] as const;

export type SpaceKind = "office" | "home";
export const SPACE_KINDS: Record<SpaceKind, string> = { office: "사무실", home: "집" };
/** 업체 시공 분야 이름 */
export const FIELD_LABELS: Record<SpaceKind, string> = { office: "사무실", home: "주거" };
export type QuoteCategory = { key: string; label: string };
/** 공간 종류에 맞는 공사 항목 */
export const quoteCategories = (kind: string | null | undefined): readonly QuoteCategory[] => (kind === "home" ? HOME_QUOTE_CATEGORIES : QUOTE_CATEGORIES);
/** 제안 항목만 보고 항목 세트를 고른다. 한 제안은 늘 한 세트의 항목을 모두 갖는다. */
export const categoriesOf = (items: { key: string }[]): readonly QuoteCategory[] => (items.some((it) => HOME_QUOTE_CATEGORIES.some((c) => c.key === it.key)) ? HOME_QUOTE_CATEGORIES : QUOTE_CATEGORIES);
/** 가구 견적 포함 여부를 정하는 항목 */
export const FURNITURE_KEYS = ["furniture", "builtin"];

export const ITEM_STATUS = {
  included: "포함",
  separate: "별도",
  na: "해당 없음",
  site_check: "현장 확인 필요",
} as const;
export type ItemStatus = keyof typeof ITEM_STATUS;

export interface QuoteItem {
  key: string;
  status: ItemStatus;
  /** 원 단위. 미확정이면 null — 0원으로 계산하지 않는다. */
  amount: number | null;
  spec: string;
}

export function quoteTotals(items: QuoteItem[]) {
  let included = 0;
  let separate = 0;
  let unresolved = 0;
  for (const it of items) {
    if (it.status === "site_check") unresolved++;
    else if (it.status === "included") {
      if (it.amount == null) unresolved++;
      else included += it.amount;
    } else if (it.status === "separate") {
      if (it.amount == null) unresolved++;
      else separate += it.amount;
    }
  }
  return { included, separate, unresolved };
}

export const MOODS = {
  warm: "편안하고 따뜻한 분위기",
  pro: "차분하고 전문적인 분위기",
  soft: "밝고 부드러운 분위기",
  unknown: "아직 잘 모르겠음",
} as const;

/** 운영자가 고객에게 요청할 수 있는 자료 */
export const INFO_ITEMS = ["도면", "실내 가로·세로", "현장 사진", "출입구·창·기둥 위치", "원하는 공사 내용", "희망 일정·예산"] as const;

/** 집 요청에서 운영자가 고객에게 요청할 수 있는 자료 */
export const HOME_INFO_ITEMS = ["도면", "현장 사진", "면적·방 구성", "원하는 공사 내용", "관리 규약·공사 가능 시간", "희망 일정·예산"] as const;

/** 요청을 시작할 때 가진 자료 */
export const INTAKE_MODES = {
  drawing: { label: "도면이 있어요", hint: "도면과 현장 사진을 올려 주세요. 도면에 적힌 가로·세로를 넣으면 배치안을 바로 그려 드려요." },
  dims: { label: "도면은 없지만 치수는 알아요", hint: "실내 가로·세로를 넣고, 손으로 그린 평면이 있으면 사진으로 찍어 올려 주세요." },
  photos: { label: "사진만 있어요", hint: "현장 사진과 원하는 공사 내용으로 상담을 받아요. 치수를 모르니 배치안은 그리지 않고, 운영자가 필요한 자료를 알려 드려요." },
  none: { label: "아직 자료가 없어요", hint: "조건만 먼저 저장해 두고 도면·치수·사진은 나중에 더해요." },
} as const;
export type IntakeKey = keyof typeof INTAKE_MODES;

/** 고객이 가장 중요하게 보는 것. 배치안 가운데 무엇을 먼저 권할지 정한다. */
export const PRIORITIES = {
  visitor: "방문객 응대",
  collab: "직원 협업",
  focus: "집중 업무",
  unknown: "아직 모르겠음",
} as const;

export const WINDOW_WALLS = {
  rear: "출입구 맞은편(안쪽) 벽",
  other: "옆 벽이나 여러 면",
  unknown: "잘 모르겠음",
} as const;

export const won = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n).toLocaleString("ko-KR")}원`);
export const manwon = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("ko-KR")}만원`);
export const mm = (m: number) => Math.round(m * 1000).toLocaleString("ko-KR");
/** DB 시각(UTC)을 한국 시간 "10. 3. 18:00" 꼴로 */
export const kst = (s: string | null | undefined) =>
  s ? new Date(s.replace(" ", "T") + "Z").toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
export const isPast = (s: string | null | undefined) => !!s && new Date(s.replace(" ", "T") + "Z").getTime() < Date.now();

export const dateKo = (s: string | null | undefined) => (s ? s.slice(0, 10).replaceAll("-", ".") : "—");

export function budgetText(min: number | null, max: number | null) {
  if (min == null && max == null) return "미정";
  if (min != null && max != null) return `${manwon(min)} ~ ${manwon(max)}`;
  return min != null ? `${manwon(min)} 이상` : `${manwon(max)} 이하`;
}
