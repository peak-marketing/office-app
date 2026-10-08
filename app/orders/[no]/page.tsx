import Link from "next/link";
import { notFound } from "next/navigation";
import ExchangeForm from "@/components/shop/ExchangeForm";
import { activeExchange, EXCHANGE_STATUS, orderExchanges } from "@/lib/exchanges";
import { requestExchange, withdrawExchange, confirmExchangeReceived, retryExchangePayment } from "@/lib/exchange-actions";
import { shippingPolicy } from "@/lib/refund-flow";
import ClaimForm from "@/components/shop/ClaimForm";
import { Badge, Notice, Page } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { dateKo, kst } from "@/lib/constants";
import { all, get } from "@/lib/db";
import { getSeller } from "@/lib/partner";
import { cancelItem, confirmPurchase, requestReturn, withdrawClaim } from "@/lib/shop-actions";
import { AUTO_CONFIRM_DAYS, CLAIM_REASONS, CLAIM_STATUS, CLAIM_TYPE, GROUP_STATUS, ORDER_STATUS, claimedQty, getOrderByNo, housekeeping, liveQty, orderClaims, orderGroups, orderItems, trackingUrl } from "@/lib/shop";

const getOrderById = (id:number) => get<import("@/lib/shop").Order>(`SELECT * FROM orders WHERE id=?`,id);

export const metadata = { title: "주문 상세" };

export default async function OrderDetail({ params, searchParams }: { params: Promise<{ no: string }>; searchParams: Promise<{ paid?: string; error?: string; done?: string; refund?: string }> }) {
  const user = await requireUser("customer");
  housekeeping();
  const order = getOrderByNo((await params).no);
  if (!order || order.user_id !== user.id) notFound();
  const q = await searchParams;
  const groups = orderGroups(order.id);
  const items = orderItems(order.id);
  const claims = orderClaims(order.id);
  const exchanges = orderExchanges(order.id);
  const parent = order.exchange_id ? get<{ no: string }>(`SELECT o.no FROM exchanges e JOIN orders o ON o.id = e.order_id WHERE e.id = ?`,order.exchange_id) : undefined;
  const refunds = all<{ amount: number; status: string; created_at: string }>(`SELECT amount, status, created_at FROM refunds WHERE order_id = ? ORDER BY id`, order.id);
  return (
    <Page narrow>
      <Link href="/orders" className="text-sm text-muted">← 주문 내역</Link>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">주문 상세</h1>
        <Badge tone={order.status === "paid" ? "brand" : "warn"}>{ORDER_STATUS[order.status]}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted">{order.no} · {kst(order.created_at)}{order.pg === "test" && " · 테스트 결제(실제 돈이 오가지 않음)"}</p>
      {parent && <Link href={`/orders/${parent.no}`} className="btn mt-4" data-testid="exchange-parent">교환 요청 원주문으로 돌아가기</Link>}
      {q.paid && <div className="mt-4"><Notice title="주문이 완료되었어요">판매자가 확인하고 발송을 준비해요. 발송되면 알려 드릴게요.</Notice></div>}
      {q.done && (
        <div className="mt-4" data-testid="done-notice">
          <Notice title={q.done === "canceled" ? "취소했어요" : q.done === "cancel-requested" ? "판매자에게 취소를 요청했어요" : "반품을 신청했어요"}>
            {q.done === "canceled" ? `${Number(q.refund || 0).toLocaleString()}원을 환불했어요.${order.pg === "test" ? " (테스트 결제라 실제 돈은 오가지 않아요)" : ""}` : q.done === "cancel-requested" ? "배송 준비 중이라 판매자가 확인한 뒤 취소·환불돼요." : "판매자가 승인하면 회수가 진행되고, 회수 확인 뒤 환불돼요."}
          </Notice>
        </div>
      )}
      {(q.error || order.fail_reason) && order.status !== "paid" && <div className="mt-4"><Notice tone="warn">{q.error || order.fail_reason}</Notice></div>}
      {order.status === "pending" && <Link href={`/pay/${order.no}`} className="btn btn-primary mt-4">결제하기</Link>}

      <div className="mt-6 space-y-4">
        {groups.map((g) => {
          const seller = getSeller(g.seller_id)!;
          const mine = items.filter((i) => i.group_id === g.id);
          const openClaims = claims.some((c) => c.group_id === g.id && ["requested", "approved"].includes(c.status)) || activeExchange(g.id);
          const policy = shippingPolicy(g);
          return (
            <section key={g.id} className="card !p-4" data-testid="order-group">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold">{seller.name}</h2>
                <Badge tone={g.status === "canceled" ? "plain" : "brand"}>{GROUP_STATUS[g.status]}</Badge>
              </div>
              {g.tracking_no && (
                <p className="mt-2 text-sm">
                  {g.courier} {g.tracking_no} <a href={trackingUrl(g.courier, g.tracking_no)} target="_blank" rel="noreferrer" className="text-brand underline">배송 조회</a>
                  <span className="ml-1 text-xs text-muted">(택배사 조회 연동 전 · 검색으로 열려요)</span>
                </p>
              )}
              <ul className="mt-3 space-y-4">
                {mine.map((i) => {
                  const left = liveQty(i) - claimedQty(i.id);
                  return (
                    <li key={i.id} className="text-sm" data-testid="order-item">
                      <div className="flex justify-between gap-3">
                        <Link href={`/shop/products/${i.product_id}`} className="min-w-0 font-semibold">{i.title}</Link>
                        <span className="shrink-0 tabular-nums">{i.amount.toLocaleString()}원</span>
                      </div>
                      <p className="text-xs text-muted">{i.option_text || "기본"} · {i.qty}개{i.canceled_qty ? ` · 취소 ${i.canceled_qty}` : ""}{i.returned_qty ? ` · 반품 ${i.returned_qty}` : ""}{i.exchanged_qty ? ` · 교환 ${i.exchanged_qty}` : ""}{i.exchange_source_id ? " · 교환받은 상품" : ""}{i.project_id && <> · <Link href={`/projects/${i.project_id}`} className="underline">내 공간에서 담음</Link></>}</p>
                      {order.status === "paid" && left > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {["paid", "preparing"].includes(g.status) && <ClaimForm action={cancelItem.bind(null, i.id)} type="cancel" max={left} note={g.status === "paid" ? "판매자가 확인하기 전이라 바로 취소되고 환불돼요." : "배송 준비 중이라 판매자가 확인한 뒤 취소돼요."} />}
                          {["shipped", "delivered"].includes(g.status) && <ClaimForm action={requestReturn.bind(null, i.id)} type="return" max={left} note={`단순 변심은 반품 배송비 ${policy.return_fee.toLocaleString()}원(무료 배송이었다면 왕복 ${(policy.return_fee * 2).toLocaleString()}원)을 빼고 환불해요. 불량·오배송은 빼지 않아요.`} />}
                          {["shipped", "delivered"].includes(g.status) && <ExchangeForm action={requestExchange.bind(null,i.id)} max={left} options={all<{ id:number;label:string;price:number;stock:number }>(`SELECT k.id, trim(k.opt1 || ' ' || k.opt2) AS label,p.price+k.add_price AS price,k.stock FROM product_skus k JOIN products p ON p.id=k.product_id WHERE k.product_id=? AND k.active=1 AND p.status='on_sale'`,i.product_id)}/>}

                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 border-t border-line pt-2 text-xs text-muted">배송비 {g.ship_fee ? `${g.ship_fee.toLocaleString()}원` : "무료"}{g.ship_refunded ? " (환불됨)" : ""}</p>
              {["shipped", "delivered"].includes(g.status) && !openClaims && (
                <form action={confirmPurchase.bind(null, g.id)} className="mt-3">
                  <button className="btn btn-sm btn-primary" data-testid="confirm-purchase">구매 확정</button>
                  <span className="ml-2 text-xs text-muted">{g.status === "delivered" ? `배송 완료 ${AUTO_CONFIRM_DAYS}일 뒤 자동으로 확정돼요.` : "받으셨다면 확정해 주세요."} 확정 뒤에는 반품을 신청할 수 없어요.</span>
                </form>
              )}
              {g.status === "confirmed" && <p className="mt-2 text-xs text-muted">구매 확정 {dateKo(g.confirmed_at)}{g.confirm_auto ? " (자동)" : ""}</p>}
            </section>
          );
        })}
      </div>

      {exchanges.length > 0 && <section className="card mt-4" data-testid="exchanges"><h2 className="h-section">교환 진행</h2><ul className="space-y-3">{exchanges.map(e => {
        const invoice = e.payment_order_id ? getOrderById(e.payment_order_id) : undefined;
        return <li key={e.id} className="rounded-xl border border-line p-3 text-sm" data-exchange={e.id}>
          <Badge>{EXCHANGE_STATUS[e.status]}</Badge><p className="mt-2">{e.qty}개 → {e.option_text || "기본"}</p>
          <p>옵션 차액 {e.price_diff.toLocaleString()}원 · 교환 배송비 {e.ship_fee.toLocaleString()}원</p>
          <p>{e.amount_due > 0 ? `추가 결제 ${e.amount_due.toLocaleString()}원` : e.amount_due < 0 ? `회수 후 환불 ${(-e.amount_due).toLocaleString()}원` : "차액 없음"}</p>
          {e.seller_note && <p className="text-muted">판매자: {e.seller_note}</p>}
          {invoice?.status === "pending" && <Link href={`/pay/${invoice.no}`} className="btn btn-sm btn-primary mt-2" data-testid="exchange-pay">교환 추가 금액 결제</Link>}
          {invoice?.status === "paid" && <p className="text-brand">추가 결제 완료</p>}
          {invoice && ["failed","expired"].includes(invoice.status) && ["approved","collected"].includes(e.status) && <form action={retryExchangePayment.bind(null,e.id)} className="mt-2"><button className="btn btn-sm">추가 결제 다시 준비하기</button></form>}
          {e.tracking_no && <p>{e.courier} {e.tracking_no}</p>}
          {e.status === "requested" && <form action={withdrawExchange.bind(null,e.id)} className="mt-2"><button className="btn btn-sm">교환 요청 철회</button></form>}
          {e.status === "shipped" && <form action={confirmExchangeReceived.bind(null,e.id)} className="mt-2"><button className="btn btn-sm btn-primary" data-testid="exchange-received">교환 상품 수령 확인</button></form>}
        </li>;
      })}</ul></section>}
      {claims.length > 0 && (
        <section className="card mt-4" data-testid="claims">
          <h2 className="h-section">취소·반품</h2>
          <ul className="space-y-2 text-sm">
            {claims.map((c) => {
              const item = items.find((i) => i.id === c.item_id)!;
              return (
                <li key={c.id} className="rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-center gap-2"><b>{CLAIM_TYPE[c.type]}</b><Badge tone={c.status === "completed" ? "brand" : c.status === "rejected" ? "plain" : "warn"}>{CLAIM_STATUS[c.status]}</Badge><span className="text-xs text-muted">{kst(c.created_at)}</span></div>
                  <p className="mt-1">{item.title} {c.qty}개 · {CLAIM_REASONS[c.reason_code]?.label}{c.reason && ` — ${c.reason}`}</p>
                  {c.status === "completed" && <p className="mt-1 text-brand">환불 {c.refund_amount.toLocaleString()}원{c.deduction ? ` (배송비 ${c.deduction.toLocaleString()}원 차감)` : ""}</p>}
                  {c.seller_note && <p className="mt-1 text-muted">판매자: {c.seller_note}</p>}
                  {c.status === "requested" && <form action={withdrawClaim.bind(null, c.id)} className="mt-2"><button className="btn btn-sm">요청 철회</button></form>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card mt-4 text-sm">
        <h2 className="h-section">결제·배송지</h2>
        <dl className="grid grid-cols-[90px_minmax(0,1fr)] gap-y-1.5">
          <dt className="text-muted">상품</dt><dd className="tabular-nums">{order.items_amount.toLocaleString()}원</dd>
          <dt className="text-muted">배송비</dt><dd className="tabular-nums">{order.ship_amount.toLocaleString()}원</dd>
          <dt className="text-muted">결제</dt><dd className="tabular-nums font-semibold">{order.total_amount.toLocaleString()}원 {order.payment_method && `· ${order.payment_method}`}</dd>
          {refunds.length > 0 && <><dt className="text-muted">환불</dt><dd className="tabular-nums">{refunds.filter((r) => r.status === "done").reduce((s, r) => s + r.amount, 0).toLocaleString()}원{refunds.some((r) => r.status === "failed") && <span className="text-danger"> · 실패 건 운영자 확인 중</span>}</dd></>}
          <dt className="text-muted">받는 분</dt><dd>{order.recipient} · {order.phone}</dd>
          <dt className="text-muted">주소</dt><dd>{[order.zipcode && `(${order.zipcode})`, order.address1, order.address2].filter(Boolean).join(" ")}</dd>
          {order.memo && <><dt className="text-muted">메모</dt><dd>{order.memo}</dd></>}
        </dl>
      </section>
    </Page>
  );
}
