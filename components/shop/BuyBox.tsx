"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import { addToCart } from "@/lib/shop-actions";

interface SkuOption {
  id: number;
  opt1: string;
  opt2: string;
  add_price: number;
  stock: number;
}

/** 옵션 고르기·수량·장바구니·바로 구매. 휴대폰에서는 화면 아래 구매 막대가 같은 폼을 보낸다. */
export default function BuyBox({ productId, price, option1, option2, skus, project, canBuy }: { productId: number; price: number; option1: string; option2: string; skus: SkuOption[]; project?: number; canBuy: boolean }) {
  const [state, dispatch, pending] = useActionState(addToCart, {});
  const single = !option1;
  const values1 = useMemo(() => [...new Set(skus.map((s) => s.opt1))], [skus]);
  const [v1, setV1] = useState(single ? "" : values1.length === 1 ? values1[0] : "");
  const values2 = useMemo(() => skus.filter((s) => s.opt1 === v1).map((s) => s.opt2), [skus, v1]);
  const [v2, setV2] = useState("");
  const [qty, setQty] = useState(1);
  const sku = single ? skus[0] : skus.find((s) => s.opt1 === v1 && (!option2 || s.opt2 === v2));
  const unit = price + (sku?.add_price ?? 0);
  const max = Math.min(99, sku?.stock ?? 99);
  const soldOut = skus.every((s) => s.stock <= 0);
  return (
    <form
      id="buy-form"
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => dispatch(fd));
      }}
    >
      <input type="hidden" name="product" value={productId} />
      <input type="hidden" name="sku" value={sku?.id ?? ""} />
      <input type="hidden" name="qty" value={qty} />
      {project && <input type="hidden" name="project" value={project} />}
      {!single && (
        <label className="block">
          <span className="label">{option1}</span>
          <select className="input" value={v1} onChange={(e) => (setV1(e.target.value), setV2(""), setQty(1))} data-testid="opt1">
            <option value="">{option1} 선택</option>
            {values1.map((v) => {
              const left = skus.filter((s) => s.opt1 === v).reduce((n, s) => n + s.stock, 0);
              const add = !option2 ? skus.find((s) => s.opt1 === v)!.add_price : 0;
              return (
                <option key={v} value={v} disabled={left <= 0}>
                  {v}
                  {add ? ` (${add > 0 ? "+" : ""}${add.toLocaleString()}원)` : ""}
                  {left <= 0 ? " · 품절" : ""}
                </option>
              );
            })}
          </select>
        </label>
      )}
      {option2 && (
        <label className="block">
          <span className="label">{option2}</span>
          <select className="input" value={v2} onChange={(e) => (setV2(e.target.value), setQty(1))} disabled={!v1} data-testid="opt2">
            <option value="">{option2} 선택</option>
            {values2.map((v) => {
              const s = skus.find((x) => x.opt1 === v1 && x.opt2 === v)!;
              return (
                <option key={v} value={v} disabled={s.stock <= 0}>
                  {v}
                  {s.add_price ? ` (${s.add_price > 0 ? "+" : ""}${s.add_price.toLocaleString()}원)` : ""}
                  {s.stock <= 0 ? " · 품절" : ""}
                </option>
              );
            })}
          </select>
        </label>
      )}
      {sku && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-sand p-3 text-sm" data-testid="picked">
          <span className="min-w-0">
            <span className="block truncate">{[sku.opt1, sku.opt2].filter(Boolean).join(" / ") || "기본"}</span>
            <span className="text-xs text-muted">{sku.stock > 0 ? (sku.stock <= 5 ? `${sku.stock}개 남음` : "구매 가능") : "품절"}</span>
          </span>
          <span className="qty-step">
            <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="수량 빼기">−</button>
            <span data-testid="qty">{qty}</span>
            <button type="button" onClick={() => setQty((q) => Math.min(max, q + 1))} disabled={qty >= max} aria-label="수량 더하기">+</button>
          </span>
        </div>
      )}
      <div className="flex items-baseline justify-between border-t border-line pt-3">
        <span className="text-sm text-muted">주문 금액</span>
        <b className="text-xl tabular-nums" data-testid="buy-total">{sku ? (unit * qty).toLocaleString() : "—"}원</b>
      </div>
      {state.error && <p role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state.ok && (
        <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand" data-testid="cart-ok">
          {state.ok} <a href="/cart" className="underline">장바구니 보기</a>
        </p>
      )}
      {!canBuy ? (
        <p className="rounded-lg bg-sand p-3 text-sm text-muted">파트너·운영자 계정으로는 구매할 수 없어요.</p>
      ) : soldOut ? (
        <p className="rounded-lg bg-sand p-3 text-center text-sm font-semibold text-muted">품절</p>
      ) : (
        <div className="hidden gap-2 lg:flex">
          <button className="btn flex-1" name="intent" value="cart" disabled={pending} data-testid="add-cart">장바구니</button>
          <button className="btn btn-primary flex-1" name="intent" value="buy" disabled={pending} data-testid="buy-now">바로 구매</button>
        </div>
      )}
      {canBuy && !soldOut && (
        <div className="buy-bar no-print">
          <button form="buy-form" className="btn flex-1" name="intent" value="cart" disabled={pending} data-testid="add-cart-m">장바구니</button>
          <button form="buy-form" className="btn btn-primary flex-1" name="intent" value="buy" disabled={pending} data-testid="buy-now-m">바로 구매</button>
        </div>
      )}
    </form>
  );
}
