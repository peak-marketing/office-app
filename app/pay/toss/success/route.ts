import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { run } from "@/lib/db";
import { finalizePaid } from "@/lib/order-flow";
import { tossConfirm } from "@/lib/payments";
import { getOrderByNo } from "@/lib/shop";

// 토스페이먼츠 결제창이 성공 뒤 돌려보내는 주소. 금액을 주문과 맞춰 본 뒤 결제 승인 API를 부른다(실제 키로 확인 전).
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const orderNo = q.get("orderId") ?? "";
  const paymentKey = q.get("paymentKey") ?? "";
  const amount = Number(q.get("amount"));
  const order = getOrderByNo(orderNo);
  const user = await currentUser();
  const back = (path: string) => NextResponse.redirect(new URL(path, req.nextUrl.origin));
  if (!order || !user || order.user_id !== user.id) return back("/orders");
  if (order.status === "paid") return back(`/orders/${order.no}`);
  if (order.status !== "pending" || order.pg !== "toss") return back(`/orders/${order.no}`);
  if (amount !== order.total_amount) return back(`/pay/${order.no}?error=${encodeURIComponent("결제 금액이 주문 금액과 달라 승인하지 않았어요.")}`);
  const r = await tossConfirm(paymentKey, order.no, order.total_amount);
  if (!r.ok) {
    run(`UPDATE orders SET fail_reason = ? WHERE id = ?`, r.error ?? "", order.id);
    return back(`/pay/${order.no}?error=${encodeURIComponent(r.error ?? "결제 승인 실패")}`);
  }
  const done = await finalizePaid(order.id, "toss", paymentKey, r.method ?? "");
  return back(done.ok ? `/orders/${order.no}?paid=1` : `/orders/${order.no}?error=${encodeURIComponent(done.error)}`);
}
