"use client";

import { useState } from "react";

declare global {
  interface Window {
    TossPayments?: ((clientKey: string) => { payment: (o: { customerKey: string }) => { requestPayment: (o: Record<string, unknown>) => Promise<void> } }) & { ANONYMOUS: string };
  }
}

/** 토스페이먼츠 결제창(SDK v2). 키를 받아 실제로 확인하기 전까지 ‘실제 연동 전’이다. */
export default function TossPayButton({ clientKey, orderNo, orderName, amount }: { clientKey: string; orderNo: string; orderName: string; amount: number }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () =>
    new Promise<void>((resolve, reject) => {
      if (window.TossPayments) return resolve();
      const s = document.createElement("script");
      s.src = "https://js.tosspayments.com/v2/standard";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("결제창을 불러오지 못했어요."));
      document.head.appendChild(s);
    });
  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      await load();
      const toss = window.TossPayments!(clientKey);
      await toss.payment({ customerKey: window.TossPayments!.ANONYMOUS }).requestPayment({
        method: "CARD",
        amount: { currency: "KRW", value: amount },
        orderId: orderNo,
        orderName: orderName.slice(0, 100),
        successUrl: `${location.origin}/pay/toss/success`,
        failUrl: `${location.origin}/pay/toss/fail`,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <button type="button" className="btn btn-primary w-full" onClick={pay} disabled={busy} data-testid="toss-pay">{busy ? "결제창 여는 중…" : `${amount.toLocaleString()}원 결제하기`}</button>
      {error && <p role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
