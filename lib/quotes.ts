import { HOME_QUOTE_CATEGORIES, QUOTE_CATEGORIES, categoriesOf, quoteTotals, type ItemStatus, type QuoteItem } from "./constants";

// 견적 비교 규칙.
// 항목은 세 부류로 나눈다.
//   priced     금액이 확정됨 — '포함'(합계 안) 또는 '별도'(합계 밖에서 따로 청구)
//   unresolved 공사는 하지만 금액이 아직 없음 — '현장 확인 필요'. 나중에 금액이 더해진다.
//   excluded   이 업체의 공사 범위에 없음 — '해당 없음'
// '최저'는 모든 항목의 부류가 견적끼리 같고 금액 미정 항목이 하나도 없을 때만,
// 별도 비용까지 더한 현재 산정 금액 기준으로 붙인다. 미정 항목이 있으면 금액이 더 늘어날 수 있기 때문이다.

export type ItemClass = "priced" | "unresolved" | "excluded";

export const STATUS_MEANING: Record<ItemStatus, string> = {
  included: "견적 합계에 들어 있는 금액입니다.",
  separate: "공사는 하지만 견적 합계 밖에서 따로 청구되는 금액입니다. 실제로 내는 돈에는 더해야 합니다.",
  site_check: "공사는 하지만 현장을 봐야 금액이 정해집니다. 지금 합계에는 없고 나중에 더해집니다.",
  na: "이 업체의 공사 범위에 없습니다. 필요한 공사라면 다른 곳에 따로 맡겨야 합니다.",
};

export function classOf(it: QuoteItem | undefined): ItemClass {
  if (!it || it.status === "na") return "excluded";
  if ((it.status === "included" || it.status === "separate") && it.amount != null) return "priced";
  return "unresolved";
}

export interface ComparableQuote {
  id: number;
  items: QuoteItem[];
  vat_included: number;
}

export interface QuoteColumn<Q> {
  q: Q;
  totals: ReturnType<typeof quoteTotals>;
  /** 아래 금액은 모두 부가세 포함 기준으로 환산한 값 */
  includedWithVat: number;
  separateWithVat: number;
  /** 현재 산정 금액 = 포함 + 별도. 금액 미정 항목은 들어 있지 않다. */
  payableWithVat: number;
  /** 모든 견적에서 금액이 확정된 항목만 더한 값. 공통 항목이 없으면 null */
  commonWithVat: number | null;
  separateItems: QuoteItem[];
  unresolvedKeys: string[];
  excludedKeys: string[];
  pricedCount: number;
}

export interface ScopeDiff {
  key: string;
  label: string;
  /** 견적 순서대로, 이 항목이 어떻게 처리됐는지 */
  cells: { cls: ItemClass; status: ItemStatus; amount: number | null }[];
}

export interface QuoteComparison<Q> {
  cols: QuoteColumn<Q>[];
  /** 모든 항목의 부류(확정·미확정·제외)가 견적끼리 같은가 */
  sameScope: boolean;
  /** 모든 견적에서 금액이 확정된 항목 */
  commonKeys: string[];
  /** 부류가 갈리는 항목 */
  diffs: ScopeDiff[];
  /** 범위가 같고 금액 미정 항목이 없을 때만: 현재 산정 금액이 가장 낮은 견적 id */
  lowestId: number | null;
  /** 범위는 같지만 금액 미정 항목이 있어 최저를 표시하지 않은 경우 */
  lowestHiddenForUnresolved: boolean;
  /** 범위가 다를 때만: 공통 항목 합계가 가장 낮은 견적 id */
  commonLowestId: number | null;
}

/** 제출 시점의 제안 내용. 수정할 때마다 한 벌씩 남긴다. */
export interface QuoteSnapshot {
  items: QuoteItem[];
  vat_included: number;
  duration_days: number;
  start_available: string;
  extra_conditions: string;
  furniture_included: number;
  note: string;
  /** 이 제출본이 기준으로 삼은 요청 내용 번호 */
  request_rev?: number;
  /** 설계 제안: as_is(고객 배치대로) · proposal(수정 제안) */
  design_mode?: string;
  design_note?: string;
  design_files?: number[];
}

export const DESIGN_MODES = {
  as_is: "고객 배치대로",
  proposal: "수정 제안",
} as const;

/** 시공사가 쓰다 만 제안. 검증 전이라 빈 값이 있을 수 있다. */
export interface QuoteDraft {
  items: QuoteItem[];
  vat: string;
  durationDays: string;
  startAvailable: string;
  extraConditions: string;
  note: string;
  designMode?: string;
  designNote?: string;
}

// 사무실·집 항목은 키가 겹치지 않는다.
export const categoryLabel = (key: string) => [...QUOTE_CATEGORIES, ...HOME_QUOTE_CATEGORIES].find((c) => c.key === key)?.label ?? key;
const vat = (amount: number, included: number) => (included ? amount : Math.round(amount * 1.1));

/** 값이 하나만 가장 낮을 때 그 id. 동률이면 null. */
function uniqueMin<T>(list: T[], value: (x: T) => number | null, id: (x: T) => number): number | null {
  const valued = list.filter((x) => value(x) != null);
  if (valued.length < 2 || valued.length !== list.length) return null;
  const min = Math.min(...valued.map((x) => value(x)!));
  const winners = valued.filter((x) => value(x) === min);
  return winners.length === 1 ? id(winners[0]) : null;
}

export function compareQuotes<Q extends ComparableQuote>(quotes: Q[]): QuoteComparison<Q> {
  const byKey = (q: Q, key: string) => q.items.find((it) => it.key === key);
  // 한 비교의 제안은 모두 같은 요청(같은 공간 종류)에서 왔다.
  const cats = categoriesOf(quotes.flatMap((q) => q.items));
  const keys = cats.map((c) => c.key as string);
  const commonKeys = keys.filter((key) => quotes.length > 0 && quotes.every((q) => classOf(byKey(q, key)) === "priced"));
  const diffs: ScopeDiff[] = [];
  for (const c of cats) {
    const classes = quotes.map((q) => classOf(byKey(q, c.key)));
    if (classes.every((cls) => cls === classes[0])) continue;
    diffs.push({
      key: c.key,
      label: c.label,
      cells: quotes.map((q, i) => {
        const it = byKey(q, c.key);
        return { cls: classes[i], status: it?.status ?? "na", amount: it?.amount ?? null };
      }),
    });
  }
  const sameScope = diffs.length === 0;
  const cols = quotes.map((q) => {
    const totals = quoteTotals(q.items);
    const common = commonKeys.reduce((s, key) => s + (byKey(q, key)!.amount ?? 0), 0);
    const includedWithVat = vat(totals.included, q.vat_included);
    const separateWithVat = vat(totals.separate, q.vat_included);
    return {
      q,
      totals,
      includedWithVat,
      separateWithVat,
      payableWithVat: includedWithVat + separateWithVat,
      commonWithVat: commonKeys.length ? vat(common, q.vat_included) : null,
      separateItems: q.items.filter((it) => it.status === "separate" && it.amount != null),
      unresolvedKeys: keys.filter((key) => classOf(byKey(q, key)) === "unresolved"),
      excludedKeys: keys.filter((key) => classOf(byKey(q, key)) === "excluded"),
      pricedCount: keys.filter((key) => classOf(byKey(q, key)) === "priced").length,
    };
  });
  const anyUnresolved = cols.some((c) => c.unresolvedKeys.length > 0);
  const lowestIfComplete = sameScope ? uniqueMin(cols, (c) => c.payableWithVat, (c) => c.q.id) : null;
  return {
    cols,
    sameScope,
    commonKeys,
    diffs,
    lowestId: anyUnresolved ? null : lowestIfComplete,
    lowestHiddenForUnresolved: anyUnresolved && lowestIfComplete != null,
    commonLowestId: sameScope ? null : uniqueMin(cols, (c) => c.commonWithVat, (c) => c.q.id),
  };
}

/** 제출본 하나의 현재 산정 금액(부가세 포함) */
export const snapshotAmount = (s: Pick<QuoteSnapshot, "items" | "vat_included">) => compareQuotes([{ id: 0, items: s.items, vat_included: s.vat_included }]).cols[0].payableWithVat;

const itemText = (it: QuoteItem | undefined) => {
  if (!it) return "없음";
  const label = { included: "포함", separate: "별도", na: "해당 없음", site_check: "현장 확인 필요" }[it.status];
  return (it.status === "included" || it.status === "separate") && it.amount != null ? `${label} ${it.amount.toLocaleString("ko-KR")}원` : label;
};

/** 두 제출본 사이에 무엇이 달라졌는지 고객이 읽을 수 있는 문장으로 돌려준다. */
export function diffSnapshots(prev: QuoteSnapshot, next: QuoteSnapshot): string[] {
  const out: string[] = [];
  for (const c of categoriesOf([...prev.items, ...next.items])) {
    const a = prev.items.find((it) => it.key === c.key);
    const b = next.items.find((it) => it.key === c.key);
    if (itemText(a) !== itemText(b)) out.push(`${c.label}: ${itemText(a)} → ${itemText(b)}`);
    if ((a?.spec ?? "") !== (b?.spec ?? "")) out.push(`${c.label} 자재·사양: ${a?.spec || "없음"} → ${b?.spec || "없음"}`);
  }
  if (prev.request_rev != null && next.request_rev != null && prev.request_rev !== next.request_rev) out.push(`기준 요청 내용: r${prev.request_rev} → r${next.request_rev}`);
  if (prev.vat_included !== next.vat_included) out.push(`부가세: ${prev.vat_included ? "포함" : "별도"} → ${next.vat_included ? "포함" : "별도"}`);
  if (prev.duration_days !== next.duration_days) out.push(`공사 기간: ${prev.duration_days}일 → ${next.duration_days}일`);
  if (prev.start_available !== next.start_available) out.push(`착공 가능일: ${prev.start_available} → ${next.start_available}`);
  if (prev.extra_conditions !== next.extra_conditions) out.push("추가비용 조건을 고쳤습니다");
  if (prev.note !== next.note) out.push("제안 요약을 고쳤습니다");
  if ((prev.design_mode ?? "") !== (next.design_mode ?? "") && next.design_mode)
    out.push(`설계 제안: ${DESIGN_MODES[prev.design_mode as keyof typeof DESIGN_MODES] ?? "없음"} → ${DESIGN_MODES[next.design_mode as keyof typeof DESIGN_MODES]}`);
  else if ((prev.design_note ?? "") !== (next.design_note ?? "")) out.push("설계 제안 설명을 고쳤습니다");
  if ((next.design_files?.length ?? 0) > (prev.design_files?.length ?? 0)) out.push(`설계 제안 첨부 ${(next.design_files?.length ?? 0) - (prev.design_files?.length ?? 0)}개 추가`);
  return out;
}
