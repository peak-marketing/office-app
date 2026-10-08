"use client";

import type { CatalogTemplate } from "@/lib/space/types";

/** 편집 화면의 ‘실제 상품’ 목록. 판매자가 넣은 규격 그대로 놓는다(크기 조절 없음). */
export default function ProductPalette({ products, onAdd, disabled, compact = false, prefix = "add-product-" }: { products: CatalogTemplate[]; onAdd: (t: CatalogTemplate) => void; disabled?: boolean; compact?: boolean; prefix?: string }) {
  if (!products.length) return compact ? null : <p className="text-[11px] text-muted">규격이 등록된 판매 상품이 없어요.</p>;
  return (
    <>
      {products.map((t) => (
        <button
          key={t.type}
          type="button"
          disabled={disabled}
          onClick={() => onAdd(t)}
          data-testid={`${prefix}${t.type}`}
          className={`${compact ? "w-40 shrink-0" : ""} flex items-center gap-2 rounded-xl border border-brand/25 bg-white p-1.5 text-left text-xs hover:border-brand disabled:opacity-50`}
        >
          {t.product?.cover ? <img src={`/files/${t.product.cover}`} alt="" className="size-10 shrink-0 rounded-lg object-cover" /> : <span className="size-10 shrink-0 rounded-lg bg-sand" />}
          <span className="min-w-0">
            <b className="block truncate">＋ {t.label}</b>
            <span className="block truncate text-[10.5px] text-muted">{t.desc}</span>
            <span className="block text-[10.5px] text-brand">{t.product?.model ? "3D 모델" : "상자로 표시"} · {t.product?.price.toLocaleString()}원</span>
          </span>
        </button>
      ))}
    </>
  );
}
