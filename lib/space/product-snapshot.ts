import type { CatalogTemplate, PlacedItem } from "./types";

/** 기존 버전의 상품 규격은 판매자의 나중 수정과 별개다. 서버가 읽은 배치만 신뢰한다. */
export function savedProduct(edit: { id: string; src: string }, existing: PlacedItem[], live?: CatalogTemplate): CatalogTemplate | undefined {
  const sameSource = (i: PlacedItem) => !!i.product && (i.src ?? `catalog:${i.type}`) === edit.src;
  const item = existing.find((i) => i.id === edit.id && sameSource(i))
    ?? (!live ? existing.find(sameSource) : undefined);
  if (!item) return live;
  return { type: item.type, label: item.label, desc: "저장 당시 상품 규격", w: item.w, d: item.d, parts: item.parts, bom: item.bom, product: item.product };
}
