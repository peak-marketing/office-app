"use client";

import Link from "next/link";
import { startTransition, useActionState } from "react";
import { addToCart } from "@/lib/shop-actions";
import type { ProductRef } from "@/lib/space/types";

const mm = (m: number) => Math.round(m * 1000).toLocaleString("ko-KR");

/** 내 공간에 놓은 실제 상품: 상품 보기·장바구니 담기. 크기는 판매자 규격 그대로 */
export default function PlacedProductCard({ product, w, d, projectId }: { product: ProductRef; w: number; d: number; projectId: number }) {
  const [state, dispatch, pending] = useActionState(addToCart, {});
  return (
    <div className="rounded-xl border border-brand/30 bg-brand-soft/40 p-2.5 text-xs" data-testid="placed-product">
      <div className="flex gap-2">
        {product.cover ? <img src={`/files/${product.cover}`} alt="" className="size-12 shrink-0 rounded-lg object-cover" /> : <span className="size-12 shrink-0 rounded-lg bg-sand" />}
        <div className="min-w-0">
          <p className="font-semibold">실제 상품{product.option && ` · ${product.option}`}</p>
          <p className="tabular-nums text-muted">
            {mm(w)} × {mm(d)} × {mm(product.h)}mm · 저장 당시 {product.price.toLocaleString()}원
          </p>
          <p className="text-[11px] text-muted">배치에 저장한 상품 규격이에요(크기 조절 없음). {product.model ? "3D는 저장 당시 모델" : "3D 모델이 없어 같은 크기의 상자"}로 보여요. 구매 가격·재고는 상품과 장바구니에서 다시 확인해요.</p>
        </div>
      </div>
      <form
        className="mt-2 flex flex-wrap items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => dispatch(fd));
        }}
      >
        <input type="hidden" name="product" value={product.id} />
        <input type="hidden" name="sku" value={product.skuId ?? ""} />
        <input type="hidden" name="qty" value={1} />
        <input type="hidden" name="project" value={projectId} />
        <input type="hidden" name="intent" value="cart" />
        <Link href={`/shop/products/${product.id}?project=${projectId}`} className="btn btn-sm" data-testid="placed-product-link">상품 보기</Link>
        <button className="btn btn-sm btn-primary" disabled={pending || !product.skuId} data-testid="placed-product-cart">장바구니 담기</button>
        {state.ok && <span className="text-brand" data-testid="placed-cart-ok">{state.ok}</span>}
        {state.error && <span className="text-danger">{state.error}</span>}
      </form>
    </div>
  );
}
