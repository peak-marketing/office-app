"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { removeCartItems, setCartQty } from "@/lib/shop-actions";

export interface CartRow {
  sku_id: number;
  qty: number;
  product_id: number;
  title: string;
  option: string;
  unit: number;
  stock: number;
  problem: string | null;
  seller_id: number;
  seller_name: string;
  ship_fee: number;
  free_ship_over: number | null;
  cover: number | null;
  example: boolean;
}

const shipFor = (r: CartRow, subtotal: number) => (r.free_ship_over != null && subtotal >= r.free_ship_over ? 0 : r.ship_fee);

/** 장바구니: 판매자별 묶음, 고른 상품만 주문. 배송비는 판매자마다 한 번 */
export default function CartView({ rows }: { rows: CartRow[] }) {
  const [picked, setPicked] = useState<Set<number>>(() => new Set(rows.filter((r) => !r.problem).map((r) => r.sku_id)));
  const [pending, start] = useTransition();
  const router = useRouter();
  const groups = useMemo(() => {
    const m = new Map<number, CartRow[]>();
    for (const r of rows) m.set(r.seller_id, [...(m.get(r.seller_id) ?? []), r]);
    return [...m.values()];
  }, [rows]);
  const sum = groups.reduce(
    (acc, g) => {
      const sel = g.filter((r) => picked.has(r.sku_id));
      const sub = sel.reduce((s, r) => s + r.unit * r.qty, 0);
      return { items: acc.items + sub, ship: acc.ship + (sel.length ? shipFor(g[0], sub) : 0) };
    },
    { items: 0, ship: 0 },
  );
  const toggle = (id: number) => setPicked((s) => (s.has(id) ? (s.delete(id), new Set(s)) : new Set(s).add(id)));
  const order = [...picked].filter((id) => !rows.find((r) => r.sku_id === id)?.problem);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4 accent-brand" checked={picked.size === rows.length} onChange={(e) => setPicked(new Set(e.target.checked ? rows.map((r) => r.sku_id) : []))} /> 모두 고르기
          </label>
          <button type="button" className="text-muted underline" disabled={pending || !picked.size} onClick={() => start(async () => { await removeCartItems([...picked]); setPicked(new Set()); router.refresh(); })}>
            고른 상품 빼기
          </button>
        </div>
        {groups.map((g) => {
          const sel = g.filter((r) => picked.has(r.sku_id));
          const sub = sel.reduce((s, r) => s + r.unit * r.qty, 0);
          const ship = sel.length ? shipFor(g[0], sub) : 0;
          return (
            <section key={g[0].seller_id} className="card !p-4" data-testid="cart-group">
              <h2 className="mb-3 text-sm font-bold">{g[0].seller_name}</h2>
              <ul className="space-y-4">
                {g.map((r) => (
                  <li key={r.sku_id} className="flex gap-3" data-testid="cart-line">
                    <input type="checkbox" className="mt-1 size-4 shrink-0 accent-brand" checked={picked.has(r.sku_id)} onChange={() => toggle(r.sku_id)} aria-label={`${r.title} 고르기`} />
                    <Link href={`/shop/products/${r.product_id}`} className="size-20 shrink-0 overflow-hidden rounded-xl bg-sand">{r.cover && <img src={`/files/${r.cover}`} alt="" className="size-full object-cover" />}</Link>
                    <div className="min-w-0 flex-1">
                      <Link href={`/shop/products/${r.product_id}`} className="line-clamp-2 text-sm font-semibold">{r.title}</Link>
                      {r.option && <p className="mt-0.5 text-xs text-muted">{r.option}</p>}
                      {r.example && <p className="mt-0.5 text-[11px] text-warn">예시 상품 · 실제 판매 아님</p>}
                      {r.problem && <p className="mt-1 text-xs font-semibold text-danger">{r.problem}</p>}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="qty-step">
                          <button type="button" disabled={pending || r.qty <= 1} onClick={() => start(async () => { await setCartQty(r.sku_id, r.qty - 1); router.refresh(); })} aria-label="수량 빼기">−</button>
                          <span>{r.qty}</span>
                          <button type="button" disabled={pending || r.qty >= Math.min(99, r.stock)} onClick={() => start(async () => { await setCartQty(r.sku_id, r.qty + 1); router.refresh(); })} aria-label="수량 더하기">+</button>
                        </span>
                        <b className="tabular-nums">{(r.unit * r.qty).toLocaleString()}원</b>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-line pt-3 text-right text-xs text-muted">
                배송비 {ship ? `${ship.toLocaleString()}원` : sel.length ? "무료" : "—"}
                {g[0].free_ship_over != null && g[0].ship_fee > 0 && ` · ${g[0].free_ship_over.toLocaleString()}원 이상 무료`}
              </p>
            </section>
          );
        })}
      </div>
      <aside className="h-fit space-y-3 rounded-2xl border border-line bg-white p-5 lg:sticky lg:top-24">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-muted">상품 금액</dt><dd className="tabular-nums">{sum.items.toLocaleString()}원</dd></div>
          <div className="flex justify-between"><dt className="text-muted">배송비</dt><dd className="tabular-nums">{sum.ship.toLocaleString()}원</dd></div>
          <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><dt>결제 예정</dt><dd className="tabular-nums" data-testid="cart-total">{(sum.items + sum.ship).toLocaleString()}원</dd></div>
        </dl>
        <Link href={order.length ? `/checkout?${order.map((id) => `sku=${id}`).join("&")}` : "#"} aria-disabled={!order.length} className={`btn btn-primary w-full ${order.length ? "" : "pointer-events-none opacity-50"}`} data-testid="cart-order">
          {order.length}개 상품 주문하기
        </Link>
      </aside>
    </div>
  );
}
