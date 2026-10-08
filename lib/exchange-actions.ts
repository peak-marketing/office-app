"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "./auth";
import type { FormState } from "./actions";
import { get, run, transaction } from "./db";
import { approveExchange, collectExchange, getExchange, openExchange, receiveExchange, shipExchange } from "./exchanges";
import { moneyBusy } from "./refund-flow";
import { getSellerByUser, getSeller } from "./partner";
import { notify } from "./notify";
import { newOrderNo, type Order, type OrderGroup, type OrderItem } from "./shop";
const refresh = () => revalidatePath("/","layout");
const str = (fd: FormData,k: string) => String(fd.get(k) ?? "").trim().slice(0,300);

export async function requestExchange(itemId: number, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser("customer");
  try {
    openExchange(itemId,user.id,Number(fd.get("sku")),Number(fd.get("qty")),str(fd,"reason_code"),str(fd,"reason"));
    const item = get<OrderItem>(`SELECT * FROM order_items WHERE id = ?`,itemId)!;
    const group = get<OrderGroup>(`SELECT * FROM order_groups WHERE id = ?`,item.group_id)!;
    notify([getSeller(group.seller_id)?.user_id],{title:"교환 요청이 도착했습니다",body:item.title,href:"/seller/exchanges",email:true});
    refresh(); return { ok: "교환을 요청했어요. 판매자가 확인하면 차액과 회수 방법을 안내해요." };
  } catch(e) { return { error: (e as Error).message }; }
}
export async function resolveExchange(id: number, _: FormState,fd: FormData): Promise<FormState> {
  const user = await requireUser("vendor","admin");
  const e = getExchange(id);
  const group = e && get<OrderGroup>(`SELECT * FROM order_groups WHERE id = ?`,e.group_id);
  if (!e || !group || (user.role === "vendor" && getSellerByUser(user.id)?.id !== group.seller_id)) return { error: "교환 처리 권한이 없습니다." };
  try {
    const action = str(fd,"do");
    if (action === "approve") approveExchange(id,str(fd,"note"));
    else if (action === "collect") { const r = await collectExchange(id,!!fd.get("restock")); if (!r.ok) return { error: r.error }; }
    else if (action === "ship") shipExchange(id,str(fd,"courier"),str(fd,"tracking_no"));
    else if (action === "reject") {
      if (e.status !== "requested" || moneyBusy(e.group_id)) throw new Error("승인 전 요청만 거절할 수 있습니다.");
      if (!str(fd,"note")) throw new Error("거절 사유를 입력해 주세요.");
      run(`UPDATE exchanges SET status = 'rejected', seller_note = ?, resolved_at = datetime('now') WHERE id = ?`,str(fd,"note"),id);
    } else throw new Error("처리할 방법을 확인해 주세요.");
    const order = get<Order>(`SELECT * FROM orders WHERE id = ?`,e.order_id)!;
    notify([e.user_id],{title:"교환 진행 상황이 바뀌었습니다",body:"주문 상세에서 교환 상태와 추가 결제 여부를 확인해 주세요.",href:`/orders/${order.no}`,email:true});
    refresh(); return { ok: "처리했습니다." };
  } catch(e) { return { error: (e as Error).message }; }
}
export async function withdrawExchange(id: number) {
  const u = await requireUser("customer");
  run(`UPDATE exchanges SET status = 'withdrawn', resolved_at = datetime('now') WHERE id = ? AND user_id = ? AND status = 'requested'`,id,u.id); refresh();
}
export async function confirmExchangeReceived(id: number) {
  const u = await requireUser("customer"); receiveExchange(id,u.id); refresh();
}
export async function retryExchangePayment(id: number) {
  const user=await requireUser("customer");
  transaction(() => {
    const e=getExchange(id);
    if (!e || e.user_id !== user.id || !["approved","collected"].includes(e.status) || !e.payment_order_id) return;
    const old=get<Order>(`SELECT * FROM orders WHERE id=?`,e.payment_order_id)!;
    if (!["failed","expired"].includes(old.status)) return;
    const invoice=run(`INSERT INTO orders(no,user_id,title,items_amount,ship_amount,total_amount,recipient,phone,zipcode,address1,address2,pg,purpose,exchange_id) SELECT ?,user_id,title,items_amount,ship_amount,total_amount,recipient,phone,zipcode,address1,address2,pg,purpose,exchange_id FROM orders WHERE id=?`,newOrderNo(),old.id);
    run(`UPDATE exchanges SET payment_order_id=? WHERE id=?`,invoice,id);
  }); refresh();
}
