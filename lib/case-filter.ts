import { CASE_CATEGORIES, caseRegion, type CaseCard } from "./data";
import { STYLES } from "./styles";
import { HOME_TYPES } from "./home";

/** 공간 필터: 사무실, 집 전체, 집의 주거 유형 */
export const SPACES: [string, string][] = [["office", "사무실"], ["home", "집 전체"], ...Object.entries(HOME_TYPES).map(([k, v]) => [`home-${k}`, `집 · ${v}`] as [string, string])];
const spaceOk = (c: CaseCard, space?: string) => {
  if (!space) return true;
  const home = c.spec.kind === "home";
  if (space === "office") return !home;
  if (space === "home") return home;
  return home && `home-${c.spec.homeType}` === space;
};

// 사례 탐색의 필터. 메인과 사례 목록이 같은 규칙을 쓴다.
export const SIZES: [string, string, number, number][] = [
  ["20", "20평대", 20, 30],
  ["30", "30평대", 30, 40],
  ["40", "40평 이상", 40, 1000],
];

export interface CaseQuery {
  q?: string;
  /** 공간 종류(업종) */
  type?: string;
  /** 사무실/집(주거 유형) */
  space?: string;
  size?: string;
  style?: string;
  region?: string;
  saved?: string;
}

/** 지역의 첫 단어(시·도). "서울 성동구" → "서울" */
export const regionOf = (c: Pick<CaseCard, "region" | "vendor_regions">) => caseRegion(c).split(/[\s,]+/)[0] ?? "";

export function filterCases(cases: CaseCard[], query: CaseQuery, savedIds: Set<number> = new Set()) {
  const q = (query.q ?? "").trim();
  const size = SIZES.find((s) => s[0] === query.size);
  const style = STYLES.find((s) => s.id === query.style)?.id;
  const region = (query.region ?? "").trim();
  return cases.filter(
    (c) =>
      (!q || `${c.title} ${c.summary} ${c.company} ${caseRegion(c)} ${c.spec.category ?? ""}`.includes(q)) &&
      (!query.type || c.spec.category === query.type) &&
      spaceOk(c, query.space) &&
      (!size || (c.area_pyeong != null && c.area_pyeong >= size[2] && c.area_pyeong < size[3])) &&
      (!style || c.style === style) &&
      (!region || regionOf(c) === region) &&
      (query.saved !== "1" || savedIds.has(c.id)),
  );
}

export function caseHref(query: CaseQuery, patch: CaseQuery = {}) {
  const next = { ...query, ...patch };
  const params = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]);
  const s = params.toString();
  return s ? `/cases?${s}` : "/cases";
}

/** 탐색 화면의 필터 묶음: 공간 종류·평수·스타일(+지역) */
export function filterGroups(cases: CaseCard[], withRegion = false) {
  const groups = [
    { key: "space", label: "사무실·집", options: SPACES.map(([value, label]) => ({ value, label })) },
    { key: "type", label: "공간 종류", options: CASE_CATEGORIES.map((c) => ({ value: c, label: c })) },
    { key: "size", label: "평수", options: SIZES.map(([value, label]) => ({ value, label })) },
    { key: "style", label: "스타일", options: STYLES.map((s) => ({ value: s.id, label: s.name })) },
  ];
  if (withRegion) groups.push({ key: "region", label: "지역", options: [...new Set(cases.map(regionOf).filter(Boolean))].sort().map((r) => ({ value: r, label: r })) });
  return groups;
}
