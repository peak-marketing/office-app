// 화면(클라이언트)에서도 쓰는 쇼핑 상수. DB를 부르지 않는다.

export const CATEGORIES = [
  { key: "furniture", label: "가구" },
  { key: "office", label: "사무 가구" },
  { key: "storage", label: "수납·정리" },
  { key: "lighting", label: "조명" },
  { key: "fabric", label: "패브릭" },
  { key: "deco", label: "데코·식물" },
  { key: "kitchen", label: "주방" },
  { key: "material", label: "인테리어 자재" },
] as const;
export type CategoryKey = (typeof CATEGORIES)[number]["key"];
export const categoryLabel = (k: string) => CATEGORIES.find((c) => c.key === k)?.label ?? "기타";

export const SORTS = { new: "최신순", popular: "인기순", low: "낮은 가격순", high: "높은 가격순" } as const;

export const CLAIM_REASONS: Record<string, { label: string; buyerFault: boolean }> = {
  change_mind: { label: "단순 변심", buyerFault: true },
  wrong_order: { label: "주문 실수(옵션·수량)", buyerFault: true },
  delay: { label: "배송 지연", buyerFault: false },
  defect: { label: "상품 불량·파손", buyerFault: false },
  wrong_item: { label: "다른 상품이 왔어요", buyerFault: false },
  etc: { label: "기타", buyerFault: true },
};

