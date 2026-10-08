import { HOME_QUOTE_CATEGORIES, budgetText } from "./constants";
import type { LayoutResult } from "./layout/types";

// 집(주거) 상담 요청의 입력. 사무실 배치 조건(LayoutInput)과 섞지 않고 버전 입력에 kind: "home"으로 저장한다.
// 필수는 주거 유형·지역·공사 범위뿐이다. 입력하지 않은 값은 null로 두고, 화면에서는 ‘입력하지 않음’으로 보여 준다(추정값으로 채우지 않는다).

export const HOME_TYPES = { oneroom: "원룸", officetel: "오피스텔", villa: "빌라(다세대·연립)", apartment: "아파트" } as const;
export type HomeType = keyof typeof HOME_TYPES;

export const HOME_SCOPES = { full: "전체 리모델링", partial: "부분 공사", undecided: "아직 모름(상담 후 결정)" } as const;
export type HomeScope = keyof typeof HOME_SCOPES;

/** 부분 공사에서 고르는 공사. 견적 항목과 같은 키를 쓴다(철거·기타는 업체가 필요에 따라 적는다). */
export const HOME_WORKS = HOME_QUOTE_CATEGORIES.filter((c) => c.key !== "strip" && c.key !== "misc");
export type HomeWork = (typeof HOME_WORKS)[number]["key"];

export const HOME_SPACES = { living: "거실", bedroom: "침실", kitchen: "주방", bath: "욕실", entry: "현관", balcony: "발코니" } as const;
export type HomeSpace = keyof typeof HOME_SPACES;

export const OCCUPANCY = { vacant: "빈 집(이사 전)", occupied: "거주 중 공사", unknown: "아직 모름" } as const;
export type Occupancy = keyof typeof OCCUPANCY;

export const AREA_BASIS = { exclusive: "전용", supply: "공급", unknown: "기준 모름" } as const;
export type AreaBasis = keyof typeof AREA_BASIS;

export interface HomeInput {
  kind: "home";
  homeType: HomeType;
  scope: HomeScope;
  /** 부분 공사일 때 원하는 공사 */
  works: HomeWork[];
  spaces: HomeSpace[];
  area: number | null;
  areaUnit: "pyeong" | "m2";
  areaBasis: AreaBasis;
  rooms: number | null;
  baths: number | null;
  /** 준공 연도. "unknown"은 고객이 ‘모름’을 고른 것, null은 입력하지 않은 것 */
  builtYear: number | "unknown" | null;
  occupancy: Occupancy | null;
  /** 관리 규약·공사 가능 시간 */
  rules: string;
}

export const isHomeInput = (v: unknown): v is HomeInput => !!v && typeof v === "object" && (v as { kind?: unknown }).kind === "home";

/** 집 버전의 배치 결과 자리. 집은 자동 배치를 하지 않는다. */
export const HOME_RESULT: LayoutResult = { status: "needs_review", reasons: [], assumptions: [], advisories: [], options: [], recommended: null, W: null, D: null, assumedDims: false };

const NOT_ENTERED = "입력하지 않음";

const pick = <T extends string>(v: FormDataEntryValue | null, table: Record<T, string>): T | null => (typeof v === "string" && v in table ? (v as T) : null);
const numOrNull = (v: FormDataEntryValue | null) => {
  if (typeof v !== "string" || !v.trim()) return null;
  const n = Number(v.replaceAll(",", ""));
  return Number.isFinite(n) ? n : NaN;
};

export function parseHomeInput(fd: FormData): HomeInput {
  const unknownYear = fd.get("builtUnknown") === "on" || fd.get("builtUnknown") === "1";
  const year = numOrNull(fd.get("builtYear"));
  const scope = pick(fd.get("scope"), HOME_SCOPES) ?? ("" as HomeScope);
  return {
    kind: "home",
    homeType: pick(fd.get("homeType"), HOME_TYPES) ?? ("" as HomeType),
    scope,
    works: scope === "partial" ? [...new Set(fd.getAll("works").map(String))].filter((k): k is HomeWork => HOME_WORKS.some((w) => w.key === k)) : [],
    spaces: [...new Set(fd.getAll("spaces").map(String))].filter((k): k is HomeSpace => k in HOME_SPACES),
    area: numOrNull(fd.get("area")),
    areaUnit: fd.get("areaUnit") === "m2" ? "m2" : "pyeong",
    areaBasis: pick(fd.get("areaBasis"), AREA_BASIS) ?? "unknown",
    rooms: numOrNull(fd.get("rooms")),
    baths: numOrNull(fd.get("baths")),
    builtYear: unknownYear ? "unknown" : year,
    occupancy: pick(fd.get("occupancy"), OCCUPANCY),
    rules: String(fd.get("rules") ?? "").trim().slice(0, 500),
  };
}

const intIn = (v: number | null, lo: number, hi: number) => v == null || (Number.isInteger(v) && v >= lo && v <= hi);

export function validateHome(h: HomeInput, region: string): string | null {
  if (!h.homeType) return "주거 유형을 골라 주세요.";
  if (!region) return "지역(시·구)을 입력해 주세요. 참여 업체에 공개됩니다.";
  if (!h.scope) return "공사 범위를 골라 주세요. 정하지 못했으면 ‘아직 모름’을 고르세요.";
  if (h.scope === "partial" && !h.works.length) return "부분 공사는 원하는 공사를 하나 이상 골라 주세요.";
  if (h.area != null && !(h.area > 0 && h.area <= (h.areaUnit === "m2" ? 1000 : 300))) return h.areaUnit === "m2" ? "면적은 1~1,000㎡로 넣거나 비워 두세요." : "면적은 1~300평으로 넣거나 비워 두세요.";
  if (!intIn(h.rooms, 0, 20)) return "방 수는 0~20 사이 숫자로 넣거나 비워 두세요.";
  if (!intIn(h.baths, 0, 10)) return "욕실 수는 0~10 사이 숫자로 넣거나 비워 두세요.";
  const thisYear = new Date().getFullYear();
  if (typeof h.builtYear === "number" && !intIn(h.builtYear, 1900, thisYear + 3)) return `준공 연도는 1900~${thisYear + 3} 사이로 넣거나 ‘모름’을 고르세요.`;
  if (typeof h.builtYear === "number" && Number.isNaN(h.builtYear)) return "준공 연도를 숫자로 넣어 주세요.";
  return null;
}

export const areaText = (h: HomeInput) => (h.area == null ? NOT_ENTERED : `${h.area.toLocaleString("ko-KR")}${h.areaUnit === "m2" ? "㎡" : "평"} (${AREA_BASIS[h.areaBasis]})`);

export function scopeText(h: HomeInput) {
  if (h.scope === "partial") return `부분 공사: ${h.works.map((k) => HOME_WORKS.find((w) => w.key === k)?.label ?? k).join(", ")}`;
  return HOME_SCOPES[h.scope] ?? NOT_ENTERED;
}

const countText = (h: HomeInput) => {
  if (h.rooms == null && h.baths == null) return NOT_ENTERED;
  return [`방 ${h.rooms ?? "입력 안 함"}`, `욕실 ${h.baths ?? "입력 안 함"}`].join(" · ");
};
const yearText = (h: HomeInput) => (h.builtYear === "unknown" ? "모름" : h.builtYear == null ? NOT_ENTERED : `${h.builtYear}년`);
const rulesAsked = (h: HomeInput) => h.homeType === "apartment" || h.homeType === "officetel";

export interface HomeBriefProject {
  region: string;
  budget_min: number | null;
  budget_max: number | null;
  desired_start: string;
  desired_movein: string;
  notes: string;
  work_scope: string;
}

/** 집 요청 요약. 고객·공유·인쇄·업체·운영자가 같은 줄을 본다. 입력하지 않은 값은 ‘입력하지 않음’. */
export function homeRows(project: HomeBriefProject, h: HomeInput, roomCount = 0): [string, string][] {
  const rows: [string, string][] = [
    ["공간", `집 · ${HOME_TYPES[h.homeType] ?? NOT_ENTERED}`],
    ["지역", project.region || NOT_ENTERED],
    ["면적", areaText(h)],
    ["방·욕실", countText(h)],
    ["준공 연도", yearText(h)],
    ["거주 상태", h.occupancy ? OCCUPANCY[h.occupancy] : NOT_ENTERED],
    ["공사 범위", scopeText(h)],
    ["공사할 공간", h.spaces.length ? h.spaces.map((k) => HOME_SPACES[k]).join(", ") : NOT_ENTERED],
  ];
  if (rulesAsked(h) || h.rules) rows.push(["관리 규약·공사 가능 시간", h.rules || NOT_ENTERED]);
  rows.push(["예산", budgetText(project.budget_min, project.budget_max)]);
  rows.push(["희망 일정", `착공 ${project.desired_start || "미정"} / 입주 ${project.desired_movein || "미정"}`]);
  rows.push(["방 배치", roomCount ? `방 ${roomCount}개 (방 한 칸씩 따로 그린 참고 배치 · 집 전체 도면 아님)` : "없음"]);
  if (project.work_scope.trim()) rows.push(["원하는 공사 내용", project.work_scope.trim()]);
  if (project.notes.trim()) rows.push(["기타 요청", project.notes.trim()]);
  return rows;
}

/** 업체 확인 사항. 법규·설비 연결 가능 여부는 판정하지 않고 확인할 일로만 안내한다. */
export function homeVendorChecks(h: HomeInput, roomCount = 0): string[] {
  const out = ["면적·방 구성은 고객이 입력한 값이거나 입력하지 않은 값입니다. 현장 실측 뒤 수량과 금액을 정해 주세요."];
  if (h.occupancy === "occupied") out.push("거주 중 공사입니다. 공사 순서, 짐 이동, 생활 동선과 소음 시간을 고객과 협의해 주세요.");
  if (rulesAsked(h)) out.push("관리사무소 공사 신고, 공사 가능 시간, 엘리베이터 사용 등 관리 규약을 확인해 주세요.");
  if (h.scope === "full" || h.works.includes("balcony")) out.push("발코니 확장은 관련 법규와 관리 규약 확인이 필요합니다. 이 서비스는 확장 가능 여부를 판정하지 않습니다.");
  if (h.scope === "full" || h.works.some((w) => w === "bath" || w === "kitchen" || w === "piping")) out.push("욕실·주방의 급배수·방수·배관 상태는 현장에서 확인해 주세요.");
  if (roomCount) out.push("방 배치는 고객이 방 한 칸씩 따로 그린 참고 배치입니다. 집 전체 도면이나 실측이 아니며, 공사 범위는 요청 내용을 기준으로 합니다.");
  out.push("이 자료로 수량·공사비를 확정하지 말고, 현장 확인 뒤 제안을 확정해 주세요.");
  return out;
}

/** 두 집 입력의 차이. 업체가 읽는 문장 */
export function diffHome(a: HomeInput, b: HomeInput): string[] {
  const out: string[] = [];
  const line = (label: string, x: string, y: string) => x !== y && out.push(`${label}: ${x} → ${y}`);
  line("주거 유형", HOME_TYPES[a.homeType] ?? "—", HOME_TYPES[b.homeType] ?? "—");
  line("공사 범위", scopeText(a), scopeText(b));
  line("공사할 공간", a.spaces.map((k) => HOME_SPACES[k]).join(", ") || NOT_ENTERED, b.spaces.map((k) => HOME_SPACES[k]).join(", ") || NOT_ENTERED);
  line("면적", areaText(a), areaText(b));
  line("방·욕실", countText(a), countText(b));
  line("준공 연도", yearText(a), yearText(b));
  line("거주 상태", a.occupancy ? OCCUPANCY[a.occupancy] : NOT_ENTERED, b.occupancy ? OCCUPANCY[b.occupancy] : NOT_ENTERED);
  line("관리 규약·공사 가능 시간", a.rules || NOT_ENTERED, b.rules || NOT_ENTERED);
  return out;
}

/** 프로젝트 이름을 비워 두면 쓰는 이름 */
export const homeTitle = (h: HomeInput, region: string) => `${HOME_TYPES[h.homeType] ?? "집"}${region ? ` · ${region}` : ""}`;
