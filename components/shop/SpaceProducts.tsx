import Link from "next/link";
import { addPlacedToCart } from "@/lib/shop-actions";
import { all } from "@/lib/db";
import { placedProducts } from "@/lib/shop-place";
import type { Version } from "@/lib/data";

/** 내 공간 한눈에: 이 공간에 놓은 실제 상품과, 이 공간에서 담아 주문한 상품 */
export default function SpaceProducts({ projectId, version }: { projectId: number; version: Version }) {
  const items = [...(version.placement?.items ?? []), ...version.rooms.flatMap((r) => r.items), ...(version.house?.items ?? [])];
  const placed = placedProducts(items);
  const ordered = all<{ no: string; title: string; qty: number; status: string }>(
    `SELECT o.no, oi.title, oi.qty - oi.canceled_qty - oi.returned_qty - oi.exchanged_qty AS qty, o.status FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.project_id = ? AND o.status = 'paid' AND oi.qty - oi.canceled_qty - oi.returned_qty - oi.exchanged_qty > 0 ORDER BY oi.id DESC LIMIT 20`,
    projectId,
  );
  if (!placed.length && !ordered.length) return null;
  const total = placed.reduce((s, x) => s + x.ref.price * x.qty, 0);
  return (
    <section className="card" data-testid="space-products">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="h-section !mb-0">이 공간의 상품</h2>
        {placed.length > 0 && (
          <form action={addPlacedToCart.bind(null, projectId)}>
            <button className="btn btn-sm btn-primary" data-testid="space-products-cart">놓은 상품 모두 장바구니에</button>
          </form>
        )}
      </div>
      {placed.length > 0 && (
        <>
          <ul className="space-y-2 text-sm">
            {placed.map(({ ref, qty }) => (
              <li key={`${ref.id}:${ref.skuId}`} className="flex items-center gap-3">
                {ref.cover ? <img src={`/files/${ref.cover}`} alt="" className="size-10 shrink-0 rounded-lg object-cover" /> : <span className="size-10 shrink-0 rounded-lg bg-sand" />}
                <Link href={`/shop/products/${ref.id}?project=${projectId}`} className="min-w-0 flex-1 truncate">{ref.title}{ref.option && <span className="text-muted"> · {ref.option}</span>}</Link>
                <span className="shrink-0 tabular-nums">{qty}개 · {(ref.price * qty).toLocaleString()}원</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">배치에 놓은 실제 상품 {placed.reduce((s, x) => s + x.qty, 0)}개 · 배치 저장 당시 가격 합계 {total.toLocaleString()}원(배송비 별도). 지금 가격·재고는 장바구니에서 확인해요. 품절·판매 중지 상품은 담기지 않아요.</p>
        </>
      )}
      {ordered.length > 0 && (
        <div className="mt-4 border-t border-line pt-3 text-sm">
          <p className="mb-1 text-xs font-semibold text-muted">이 공간에서 담아 주문한 상품</p>
          <ul className="space-y-1">
            {ordered.map((o, i) => (
              <li key={i}><Link href={`/orders/${o.no}`} className="underline-offset-2 hover:underline">{o.title}</Link> <span className="text-muted">× {o.qty}</span></li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
