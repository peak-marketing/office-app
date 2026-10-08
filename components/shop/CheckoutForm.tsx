"use client";

import { startTransition, useActionState } from "react";
import { createOrder } from "@/lib/shop-actions";

/** 배송지 입력과 주문 확인. 결제는 다음 화면(테스트 결제 또는 토스페이먼츠)에서 한다. */
export default function CheckoutForm({ skus, name, phone, total, testPay }: { skus: number[]; name: string; phone: string; total: number; testPay: boolean }) {
  const [state, dispatch, pending] = useActionState(createOrder, {});
  return (
    <form
      className="space-y-4"
      data-testid="checkout-form"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => dispatch(fd));
      }}
    >
      {skus.map((id) => <input key={id} type="hidden" name="sku" value={id} />)}
      <section className="card space-y-3">
        <h2 className="h-section">배송지</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="label">받는 분</span><input className="input" name="recipient" defaultValue={name} required autoComplete="name" /></label>
          <label className="block"><span className="label">연락처</span><input className="input" name="phone" defaultValue={phone} required type="tel" autoComplete="tel" placeholder="010-0000-0000" /></label>
          <label className="block"><span className="label">우편번호</span><input className="input" name="zipcode" inputMode="numeric" autoComplete="postal-code" /></label>
          <label className="block sm:col-span-2"><span className="label">주소</span><input className="input" name="address1" required autoComplete="address-line1" placeholder="도로명 주소" /></label>
          <label className="block sm:col-span-2"><span className="label">상세 주소</span><input className="input" name="address2" autoComplete="address-line2" /></label>
          <label className="block sm:col-span-2"><span className="label">배송 메모</span><input className="input" name="memo" maxLength={100} placeholder="예: 문 앞에 두어 주세요" /></label>
        </div>
        <p className="text-xs text-muted">배송지는 이 주문의 판매자에게만 전달돼요.</p>
      </section>
      <label className="flex items-start gap-2 rounded-xl bg-sand p-3 text-sm">
        <input type="checkbox" name="agree" required className="mt-0.5 size-4 accent-brand" />
        <span>주문 상품과 금액, 판매자별 배송·반품 조건을 확인했고 결제 진행에 동의합니다.{testPay && <b className="text-warn"> 지금은 테스트 결제라 실제 돈이 오가지 않아요.</b>}</span>
      </label>
      {state.error && <p role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
      <button className="btn btn-primary w-full" disabled={pending} data-testid="place-order">{pending ? "주문서 만드는 중…" : `${total.toLocaleString()}원 결제하기`}</button>
    </form>
  );
}
