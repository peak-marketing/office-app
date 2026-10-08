import { all, get, run, transaction } from "./db";
import { getSeller } from "./partner";
import { refundPayment } from "./payments";
import type { Order, OrderGroup } from "./shop";

export function shippingPolicy(group: OrderGroup) {
  if (group.shipping_policy) return JSON.parse(group.shipping_policy) as { ship_fee: number; free_ship_over: number | null; return_fee: number };
  const s = getSeller(group.seller_id)!;
  const policy = { ship_fee: s.ship_fee, free_ship_over: s.free_ship_over, return_fee: s.return_fee };
  run(`UPDATE order_groups SET shipping_policy = ? WHERE id = ? AND shipping_policy = ''`, JSON.stringify(policy), group.id);
  return policy;
}

type Payment = { id: number; pg: string; payment_key: string; amount: number };
interface Job { key: string; group_id: number; status: string; payload: string; lease_until: number }
interface Payload { amount: number; claimId: number | null; payments: Payment[]; data: unknown }
export const moneyBusy = (groupId: number) => !!get(`SELECT 1 FROM refund_jobs WHERE group_id = ? AND status != 'completed'`, groupId);

/** PG의 멱등 키와 DB의 작업 기록을 함께 쓴다. 동일 묶음은 환불 하나씩, 재시도는 같은 금액으로 처리한다. */
export async function runRefund<T>(key: string, group: OrderGroup, prepare: () => { amount: number; claimId?: number; data: T }, finish: (data: T) => void): Promise<{ ok: true; refund: number } | { ok: false; error: string }> {
  let payload: Payload;
  try {
    const reserved = transaction(() => {
      const old = get<Job>(`SELECT * FROM refund_jobs WHERE key = ?`, key);
      if (old?.status === "completed") return { done: JSON.parse(old.payload) as Payload };
      if (old?.status === "processing" && old.lease_until > Date.now()) throw new Error("환불 처리 중입니다. 잠시 뒤 결과를 확인해 주세요.");
      if (get(`SELECT 1 FROM refund_jobs WHERE group_id = ? AND key != ? AND status != 'completed'`, group.id, key)) throw new Error("이 주문의 다른 환불을 먼저 완료해야 합니다.");
      if (old) {
        run(`UPDATE refund_jobs SET status = 'processing', lease_until = ?, error = '' WHERE key = ?`, Date.now() + 120000, key);
        return { payload: JSON.parse(old.payload) as Payload };
      }
      const p = prepare();
      if (!Number.isSafeInteger(p.amount) || p.amount < 0) throw new Error("환불 금액이 올바르지 않습니다.");
      let left = p.amount;
      const payments: Payment[] = [];
      const orders = all<Order>(`SELECT o.* FROM orders o WHERE o.id = ? OR (o.status = 'paid' AND o.exchange_id IN (SELECT id FROM exchanges WHERE group_id = ?)) ORDER BY o.id`, group.order_id, group.id);
      for (const o of orders) {
        const used = get<{ n: number }>(`SELECT coalesce(sum(amount),0) AS n FROM refunds WHERE status = 'done' AND coalesce(payment_order_id,order_id) = ?`, o.id)!.n;
        const amount = Math.min(left, Math.max(0, o.total_amount - used));
        if (amount > 0) { payments.push({ id: o.id, pg: o.pg, payment_key: o.payment_key, amount }); left -= amount; }
      }
      if (left > 0) throw new Error("남은 결제 금액보다 환불이 큽니다. 운영자 확인이 필요합니다.");
      const payload: Payload = { amount: p.amount, claimId: p.claimId ?? null, payments, data: p.data };
      run(`INSERT INTO refund_jobs(key,group_id,status,payload,lease_until) VALUES (?,?,'processing',?,?)`, key, group.id, JSON.stringify(payload), Date.now() + 120000);
      return { payload };
    });
    if (reserved.done) return { ok: true, refund: reserved.done.amount };
    payload = reserved.payload!;
  } catch (e) { return { ok: false, error: (e as Error).message }; }
  const results: (Payment & { raw: string })[] = [];
  for (const p of payload.payments) {
    const result = await refundPayment(p.pg, p.payment_key, p.amount, "고객 취소·반품·교환 환불", `${key}-payment-${p.id}`);
    if (!result.ok) {
      run(`UPDATE refund_jobs SET status = 'failed', lease_until = 0, error = ? WHERE key = ? AND status != 'completed'`, result.error ?? "환불 실패", key);
      return { ok: false, error: result.error ?? "환불에 실패했습니다. 같은 요청에서 다시 시도해 주세요." };
    }
    results.push({ ...p, raw: result.raw ?? "" });
  }
  transaction(() => {
    if (get<Job>(`SELECT * FROM refund_jobs WHERE key = ?`, key)?.status === "completed") return;
    for (const p of results) run(`INSERT INTO refunds(order_id,group_id,claim_id,amount,pg,status,pg_result,job_key,payment_order_id) VALUES (?,?,?,?,?,'done',?,?,?)`, group.order_id, group.id, payload.claimId, p.amount, p.pg, p.raw, key, p.id);
    // 0원도 완료 기록을 남긴다. 동일 요청 재호출로 재고가 다시 늘지 않는다.
    if (!results.length) run(`INSERT INTO refunds(order_id,group_id,claim_id,amount,pg,status,job_key,payment_order_id) VALUES (?,?,?,0,'test','done',?,?)`, group.order_id, group.id, payload.claimId, key, group.order_id);
    finish(payload.data as T);
    run(`UPDATE refund_jobs SET status = 'completed', lease_until = 0 WHERE key = ?`, key);
  });
  return { ok: true, refund: payload.amount };
}
