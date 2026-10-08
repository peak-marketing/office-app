import { all, get, run, transaction } from "./db";
import { adminIds, notify } from "./notify";
import { getSeller } from "./partner";
import { refundPayment } from "./payments";
import { runRefund, shippingPolicy } from "./refund-flow";
import { liveQty, refundQuote, type Claim, type Order, type OrderGroup, type OrderItem } from "./shop";

// 주문 상태를 바꾸는 공통 처리. Server Action과 결제 승인 경로(route handler)가 함께 쓴다.

const sellerUser = (sellerId: number) => getSeller(sellerId)?.user_id;

/**
 * 결제 승인 뒤 마무리: 재고를 확인해 빼고 주문을 결제 완료로 바꾼다.
 * 재고가 모자라면 주문을 결제 실패로 두고, 이미 승인된 결제는 전액 환불한다.
 */
export async function finalizePaid(orderId: number, pg: string, paymentKey: string, method: string) {
  const order = get<Order>(`SELECT * FROM orders WHERE id = ?`, orderId)!;
  if (!order) return { ok: false as const, error: "주문이 없습니다." };
  if (order.status === "paid") return { ok: true as const };
  if (order.status !== "pending" || !Number.isSafeInteger(order.total_amount) || order.total_amount <= 0) return { ok: false as const, error: "결제할 수 없는 주문입니다." };
  if (order.purpose === "exchange") {
    const done = transaction(() => {
      const ex = get<{ id: number; status: string }>(`SELECT id,status FROM exchanges WHERE id = ? AND payment_order_id = ?`, order.exchange_id!, order.id);
      if (!ex || !["approved", "collected"].includes(ex.status)) return false;
      run(`UPDATE orders SET status = 'paid', pg = ?, payment_key = ?, payment_method = ?, paid_at = datetime('now') WHERE id = ? AND status = 'pending'`, pg, paymentKey, method, order.id);
      if (ex.status === "collected") run(`UPDATE exchanges SET status = 'ready' WHERE id = ?`, ex.id);
      return true;
    });
    return done ? { ok: true as const } : { ok: false as const, error: "교환 상태를 확인해 주세요." };
  }
  const short = transaction(() => {
    if (get<Order>(`SELECT * FROM orders WHERE id = ?`, orderId)?.status === "paid") return null;
    const items = all<OrderItem & { stock: number; active: number; pstatus: string; sstatus: string }>(
      `SELECT oi.*, k.stock, k.active, p.status AS pstatus, s.status AS sstatus FROM order_items oi
       JOIN product_skus k ON k.id = oi.sku_id JOIN products p ON p.id = oi.product_id JOIN sellers s ON s.id = p.seller_id WHERE oi.order_id = ?`,
      orderId,
    );
    const need = new Map<number, number>();
    for (const i of items) need.set(i.sku_id, (need.get(i.sku_id) ?? 0) + i.qty);
    const bad = items.find((i) => !Number.isSafeInteger(i.unit_price) || i.unit_price < 100 || i.stock < need.get(i.sku_id)! || !i.active || i.pstatus !== "on_sale" || i.sstatus !== "approved");
    if (!items.length) throw new Error("주문 상품이 없습니다.");
    if (bad) {
      run(`UPDATE orders SET status = 'failed', pg = ?, payment_key = ?, fail_reason = ? WHERE id = ?`, pg, paymentKey, `재고 부족 또는 판매 종료: ${bad.title}`, orderId);
      run(`UPDATE order_groups SET status = 'canceled' WHERE order_id = ?`, orderId);
      return bad.title;
    }
    for (const [sku, qty] of need) run(`UPDATE product_skus SET stock = stock - ? WHERE id = ?`, qty, sku);
    run(`UPDATE orders SET status = 'paid', pg = ?, payment_key = ?, payment_method = ?, paid_at = datetime('now'), fail_reason = '' WHERE id = ?`, pg, paymentKey, method, orderId);
    run(`UPDATE order_groups SET status = 'paid' WHERE order_id = ?`, orderId);
    // 산 상품은 장바구니에서 뺀다.
    run(`DELETE FROM cart_items WHERE user_id = ? AND sku_id IN (SELECT sku_id FROM order_items WHERE order_id = ?)`, order.user_id, orderId);
    return null;
  });
  if (short) {
    const r = await refundPayment(pg, paymentKey, order.total_amount, "재고 부족으로 주문 취소", `stock-${order.no}`);
    run(`UPDATE orders SET fail_reason = fail_reason || ? WHERE id = ?`, r.ok ? " (결제 금액 전액 환불)" : ` (환불 실패: ${r.error} — 운영자 확인 필요)`, orderId);
    if (!r.ok) notify(adminIds(), { title: `환불 실패 확인 필요: 주문 ${order.no}`, body: r.error ?? "", href: `/admin/orders?q=${order.no}`, email: true });
    return { ok: false as const, error: `${short}의 재고가 모자라 주문하지 못했어요.${pg === "toss" ? (r.ok ? " 결제 금액은 환불했어요." : " 환불 실패로 운영자 확인이 필요합니다.") : ""}` };
  }
  for (const g of all<OrderGroup>(`SELECT * FROM order_groups WHERE order_id = ?`, orderId))
    notify([sellerUser(g.seller_id)], { title: `새 주문: ${order.title}`, body: "결제가 완료되었습니다. 주문을 확인하고 발송을 준비해 주세요.", href: `/seller/orders?status=paid`, email: true });
  notify([order.user_id], { title: `주문이 완료되었습니다 (${order.no})`, body: order.title, href: `/orders/${order.no}` });
  return { ok: true as const };
}

/** 취소·반품 확정: 환불하고 수량·재고·묶음 상태를 고친다. 환불이 실패하면 아무것도 바꾸지 않고 오류를 돌려준다. */
export async function completeClaim(claimId: number, restock: boolean, actorNote = ""): Promise<{ ok: true; refund: number } | { ok: false; error: string }> {
  const first = get<Claim>(`SELECT * FROM claims WHERE id = ?`, claimId);
  if (!first) return { ok: false, error: "요청을 찾을 수 없습니다." };
  const group = get<OrderGroup>(`SELECT * FROM order_groups WHERE id = ?`, first.group_id)!;
  const result = await runRefund(`claim-${claimId}`, group, () => {
    const claim = get<Claim>(`SELECT * FROM claims WHERE id = ?`, claimId)!;
    const item = get<OrderItem>(`SELECT * FROM order_items WHERE id = ?`, claim.item_id)!;
    if (!["requested", "approved"].includes(claim.status) || claim.qty > liveQty(item)) throw new Error("처리할 수 없는 요청입니다.");
    const freshGroup = get<OrderGroup>(`SELECT * FROM order_groups WHERE id = ?`, group.id)!;
    const remainingAfter = all<OrderItem>(`SELECT * FROM order_items WHERE group_id = ?`, group.id).reduce((s, i) => s + i.unit_price * (liveQty(i) - (i.id === item.id ? claim.qty : 0)), 0);
    const quote = refundQuote({ type: claim.type, reason: claim.reason_code, item, qty: claim.qty, group: freshGroup, seller: shippingPolicy(freshGroup), remainingAfter });
    return { amount: quote.refund, claimId, data: { claim, item, quote, remainingAfter, restock, actorNote } };
  }, ({ claim, item, quote, remainingAfter, restock: restore, actorNote: note }) => {
    run(`UPDATE claims SET status = 'completed', deduction = ?, refund_amount = ?, seller_note = CASE WHEN ? != '' THEN ? ELSE seller_note END, resolved_at = datetime('now') WHERE id = ?`, quote.deduction, quote.refund, note, note, claim.id);
    run(`UPDATE order_items SET ${claim.type === "cancel" ? "canceled_qty = canceled_qty" : "returned_qty = returned_qty"} + ? WHERE id = ?`, claim.qty, item.id);
    if (restore) run(`UPDATE product_skus SET stock = stock + ? WHERE id = ?`, claim.qty, item.sku_id);
    run(`UPDATE order_groups SET ship_deducted = ?, ship_refunded = CASE WHEN ? THEN 1 ELSE ship_refunded END WHERE id = ?`, quote.nextShipDeducted, quote.refundOriginalShipping ? 1 : 0, group.id);
    if (remainingAfter === 0) run(`UPDATE order_groups SET status = 'canceled' WHERE id = ?`, group.id);
  });
  if (result.ok) {
    const order = get<Order>(`SELECT * FROM orders WHERE id = ?`, first.order_id)!;
    notify([first.user_id], { title: `${first.type === "cancel" ? "취소" : "반품"} 환불이 완료되었습니다`, body: `환불 ${result.refund.toLocaleString()}원${order.pg === "test" ? " (테스트 결제라 실제 돈은 오가지 않아요)" : ""}`, href: `/orders/${order.no}` });
  } else if (!result.error.includes("처리 중")) notify(adminIds(), { title: "환불 확인 필요", body: result.error, href: "/admin/orders" });
  return result;
}
