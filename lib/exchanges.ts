import { all, get, run, transaction } from "./db";
import { currentPg } from "./payments";
import { runRefund, shippingPolicy } from "./refund-flow";
import { CLAIM_REASONS, claimedQty, liveQty, newOrderNo, optionText, type Order, type OrderGroup, type OrderItem, type Product, type Sku } from "./shop";

export interface Exchange {
  id: number; order_id: number; group_id: number; item_id: number; user_id: number;
  qty: number; reason_code: string; reason: string; target_sku_id: number; target_unit_price: number;
  option_text: string; price_diff: number; ship_fee: number; amount_due: number;
  status: string; payment_order_id: number | null; replacement_item_id: number | null;
  seller_note: string; courier: string; tracking_no: string; created_at: string;
}
export const EXCHANGE_STATUS: Record<string, string> = { requested: "교환 요청", approved: "승인·회수 중", collected: "회수 완료·추가 결제 대기", ready: "교환 상품 발송 준비", shipped: "교환 상품 배송 중", completed: "교환 완료", rejected: "교환 거절", withdrawn: "요청 철회" };
export const activeExchange = (groupId: number) => !!get(`SELECT 1 FROM exchanges WHERE group_id = ? AND status IN ('requested','approved','collected','ready','shipped')`, groupId);
export const orderExchanges = (orderId: number) => all<Exchange>(`SELECT * FROM exchanges WHERE order_id = ? ORDER BY id`, orderId);
export const getExchange = (id: number) => get<Exchange>(`SELECT * FROM exchanges WHERE id = ?`, id);

export function openExchange(itemId: number, userId: number, skuId: number, qty: number, reason: string, detail: string) {
  return transaction(() => {
    const item = get<OrderItem>(`SELECT * FROM order_items WHERE id = ?`, itemId);
    const order = item && get<Order>(`SELECT * FROM orders WHERE id = ? AND user_id = ? AND status = 'paid'`, item.order_id, userId);
    const group = item && get<OrderGroup>(`SELECT * FROM order_groups WHERE id = ?`, item.group_id);
    if (!item || !order || !group || !["shipped", "delivered"].includes(group.status)) throw new Error("배송 이후 구매 확정 전인 내 주문에서 교환할 수 있습니다.");
    if (!Number.isInteger(qty) || qty < 1 || qty > liveQty(item) - claimedQty(item.id)) throw new Error("교환 수량을 확인해 주세요.");
    if (!CLAIM_REASONS[reason]) throw new Error("교환 사유를 골라 주세요.");
    const p = get<Product>(`SELECT * FROM products WHERE id = ? AND status = 'on_sale'`, item.product_id);
    const sku = get<Sku>(`SELECT * FROM product_skus WHERE id = ? AND product_id = ? AND active = 1`, skuId, item.product_id);
    if (!p || !sku || sku.stock < qty) throw new Error("선택한 교환 옵션을 판매 중이 아니거나 재고가 부족합니다.");
    const unit = p.price + sku.add_price;
    if (!Number.isSafeInteger(unit) || unit < 100 || unit > 100_000_000) throw new Error("교환 옵션 가격을 확인해야 합니다.");
    const fee = CLAIM_REASONS[reason].buyerFault ? shippingPolicy(group).return_fee * 2 : 0;
    const diff = (unit - item.unit_price) * qty;
    if (!Number.isSafeInteger(diff + fee) || Math.abs(diff + fee) > 1_000_000_000) throw new Error("교환 차액은 10억 원 이하로 신청해 주세요.");
    return run(`INSERT INTO exchanges(order_id,group_id,item_id,user_id,qty,reason_code,reason,target_sku_id,target_unit_price,option_text,price_diff,ship_fee,amount_due) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, order.id, group.id, item.id, userId, qty, reason, detail, skuId, unit, optionText(p,sku), diff, fee, diff + fee);
  });
}

/** 승인 시 교환 재고를 예약한다. 반복 승인으로 재고를 두 번 빼지 않는다. */
export function approveExchange(id: number, note: string) {
  transaction(() => {
    const e = getExchange(id)!;
    if (e.status !== "requested") throw new Error("이미 처리된 교환 요청입니다.");
    const item = get<OrderItem>(`SELECT * FROM order_items WHERE id = ?`, e.item_id)!;
    const group = get<OrderGroup>(`SELECT * FROM order_groups WHERE id = ?`, e.group_id)!;
    if (!["shipped","delivered"].includes(group.status) || e.qty > liveQty(item)) throw new Error("주문 상태 또는 남은 수량을 확인해 주세요.");
    const sku = get<Sku>(`SELECT * FROM product_skus WHERE id = ? AND active = 1`, e.target_sku_id);
    if (!sku || sku.stock < e.qty) throw new Error("교환 상품의 재고가 부족합니다.");
    run(`UPDATE product_skus SET stock = stock - ? WHERE id = ?`, e.qty, sku.id);
    let invoice: number | null = null;
    if (e.amount_due > 0) {
      const o = get<Order>(`SELECT * FROM orders WHERE id = ?`, e.order_id)!;
      invoice = run(`INSERT INTO orders(no,user_id,title,items_amount,ship_amount,total_amount,recipient,phone,zipcode,address1,address2,pg,purpose,exchange_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'exchange',?)`, newOrderNo(),e.user_id,`교환 추가 금액 · ${item.title}`.slice(0,80),Math.max(0,e.price_diff),e.ship_fee,e.amount_due,o.recipient,o.phone,o.zipcode,o.address1,o.address2,currentPg(),e.id);
    }
    run(`UPDATE exchanges SET status = 'approved', payment_order_id = ?, seller_note = ? WHERE id = ?`, invoice,note,id);
  });
}

/** 회수 확인과 차액 환불. 재시도해도 환불·회수 재고·상태를 한 번만 바꾼다. */
export async function collectExchange(id: number, restock: boolean) {
  const e = getExchange(id)!;
  const group = get<OrderGroup>(`SELECT * FROM order_groups WHERE id = ?`,e.group_id)!;
  return runRefund(`exchange-${id}`,group,() => {
    const current = getExchange(id)!;
    if (current.status !== "approved") throw new Error("회수 확인할 교환이 아닙니다.");
    return { amount: Math.max(0,-current.amount_due), data: { e: current, restock } };
  },({ e, restock: restore }) => {
    if (restore) {
      const item = get<OrderItem>(`SELECT * FROM order_items WHERE id = ?`,e.item_id)!;
      run(`UPDATE product_skus SET stock = stock + ? WHERE id = ?`,e.qty,item.sku_id);
    }
    const paid = e.payment_order_id && get<Order>(`SELECT * FROM orders WHERE id = ?`,e.payment_order_id)?.status === "paid";
    run(`UPDATE exchanges SET status = ? WHERE id = ?`,e.amount_due <= 0 || paid ? "ready" : "collected",e.id);
  });
}

export function shipExchange(id: number, courier: string, tracking: string) {
  if (!courier || !tracking) throw new Error("택배사와 송장번호를 입력해 주세요.");
  transaction(() => {
    const e = getExchange(id)!;
    if (e.status !== "ready") throw new Error("회수·차액 처리가 완료된 교환만 발송할 수 있습니다.");
    const item = get<OrderItem>(`SELECT * FROM order_items WHERE id = ?`,e.item_id)!;
    if (liveQty(item) < e.qty) throw new Error("교환 수량을 확인해 주세요.");
    const replacement = run(`INSERT INTO order_items(order_id,group_id,product_id,sku_id,title,option_text,unit_price,qty,amount,project_id,exchange_source_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,e.order_id,e.group_id,item.product_id,e.target_sku_id,item.title,e.option_text,e.target_unit_price,e.qty,e.target_unit_price*e.qty,item.project_id,e.id);
    run(`UPDATE order_items SET exchanged_qty = exchanged_qty + ? WHERE id = ?`,e.qty,item.id);
    run(`UPDATE exchanges SET status = 'shipped', replacement_item_id = ?, courier = ?, tracking_no = ? WHERE id = ?`,replacement,courier,tracking,id);
    run(`UPDATE order_groups SET status = 'shipped', courier = ?, tracking_no = ?, shipped_at = datetime('now'), delivered_at = NULL WHERE id = ?`,courier,tracking,e.group_id);
  });
}

export function receiveExchange(id: number, userId: number) {
  transaction(() => {
    const e = getExchange(id);
    if (!e || e.user_id !== userId || e.status !== "shipped") return;
    run(`UPDATE exchanges SET status = 'completed', resolved_at = datetime('now') WHERE id = ?`,id);
    if (!activeExchange(e.group_id)) run(`UPDATE order_groups SET status = 'delivered', delivered_at = datetime('now') WHERE id = ?`,e.group_id);
  });
}
