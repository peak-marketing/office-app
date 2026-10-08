import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import TossPayButton from "@/components/shop/TossPayButton";
import { Notice, Page } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { TEST_PAY_LABEL, tossClientKey } from "@/lib/payments";
import { payTest } from "@/lib/shop-actions";
import { getOrderByNo, housekeeping, orderItems } from "@/lib/shop";

export const metadata = { title: "결제" };

export default async function Pay({ params, searchParams }: { params: Promise<{ no: string }>; searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser("customer");
  housekeeping();
  const order = getOrderByNo((await params).no);
  if (!order || order.user_id !== user.id) notFound();
  if (order.status !== "pending") redirect(`/orders/${order.no}`);
  const items = orderItems(order.id);
  const error = (await searchParams).error;
  return (
    <Page narrow>
      <h1 className="text-2xl font-bold tracking-tight">결제</h1>
      <p className="mt-1 text-sm text-muted">주문번호 {order.no} · 30분 안에 결제하지 않으면 주문이 취소돼요.</p>
      {error && <div className="mt-4"><Notice tone="warn" title="결제를 마치지 못했어요">{error}</Notice></div>}
      <section className="card mt-5 text-sm">
        <ul className="space-y-1.5">
          {order.purpose === "exchange" && <li>{order.title}</li>}
          {items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3"><span className="min-w-0">{i.title}{i.option_text && <span className="text-muted"> · {i.option_text}</span>} × {i.qty}</span><span className="tabular-nums">{i.amount.toLocaleString()}원</span></li>
          ))}
          <li className="flex justify-between text-muted"><span>배송비</span><span className="tabular-nums">{order.ship_amount.toLocaleString()}원</span></li>
        </ul>
        <p className="mt-3 flex justify-between border-t border-line pt-3 text-base font-bold"><span>결제 금액</span><span className="tabular-nums">{order.total_amount.toLocaleString()}원</span></p>
      </section>
      <section className="card mt-4" data-testid="pay-box">
        {order.pg === "toss" ? (
          <>
            <p className="mb-3 text-xs text-warn">토스페이먼츠 결제(실제 키로 연동 확인 전)</p>
            <TossPayButton clientKey={tossClientKey()} orderNo={order.no} orderName={order.title} amount={order.total_amount} />
          </>
        ) : (
          <>
            <p className="mb-1 font-semibold text-warn">{TEST_PAY_LABEL}</p>
            <p className="mb-4 text-xs leading-relaxed text-muted">결제 연동 전이라 실제 카드 결제 대신 결과를 직접 골라요. ‘결제 완료’를 누르면 재고가 빠지고 판매자에게 주문이 가요.</p>
            <div className="flex flex-wrap gap-2">
              <form action={payTest.bind(null, order.no, "ok")} className="flex-1"><button className="btn btn-primary w-full" data-testid="test-pay-ok">결제 완료(테스트)</button></form>
              <form action={payTest.bind(null, order.no, "fail")}><button className="btn" data-testid="test-pay-fail">결제 실패(테스트)</button></form>
            </div>
          </>
        )}
      </section>
      <p className="mt-4 text-center text-sm"><Link href="/cart" className="text-muted underline">장바구니로 돌아가기</Link></p>
    </Page>
  );
}
