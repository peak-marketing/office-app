import { paymentProvider } from "./external";

// 결제 제공자. 키가 없으면 테스트 결제(실제 돈이 오가지 않음). 토스페이먼츠 연동은 키를 받아 실제로 확인하기 전까지 ‘실제 연동 전’이다.
// 토스페이먼츠 결제 승인: POST https://api.tosspayments.com/v1/payments/confirm  { paymentKey, orderId, amount }
// 결제 취소(부분 취소 포함): POST https://api.tosspayments.com/v1/payments/{paymentKey}/cancel  { cancelReason, cancelAmount }
// 인증: Authorization: Basic base64(시크릿 키 + ":")

const TOSS_API = "https://api.tosspayments.com/v1/payments";

export const TEST_PAY_LABEL = "테스트 결제 · 실제 돈이 오가지 않아요";

export interface PayResult {
  ok: boolean;
  /** 결제 수단(카드·간편결제 등) */
  method?: string;
  error?: string;
  raw?: string;
}

function tossAuth() {
  const key = process.env.TOSS_SECRET_KEY?.trim();
  if (!key) throw new Error("TOSS_SECRET_KEY가 없습니다.");
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

/** 토스페이먼츠 결제 승인. 금액은 서버의 주문 금액으로 보낸다(화면에서 온 금액을 믿지 않는다). */
export async function tossConfirm(paymentKey: string, orderId: string, amount: number): Promise<PayResult> {
  try {
    const res = await fetch(`${TOSS_API}/confirm`, {
      method: "POST",
      headers: { Authorization: tossAuth(), "Content-Type": "application/json", "Idempotency-Key": `confirm-${orderId}` },
      body: JSON.stringify({ paymentKey, orderId, amount }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json().catch(() => ({}))) as { method?: string; message?: string; code?: string; status?: string };
    if (!res.ok || body.status !== "DONE") return { ok: false, error: body.message || `결제 승인 실패(${res.status})`, raw: JSON.stringify(body).slice(0, 500) };
    return { ok: true, method: body.method ?? "", raw: JSON.stringify({ status: body.status, method: body.method }) };
  } catch (e) {
    return { ok: false, error: `결제 승인 요청 실패: ${(e as Error).message}` };
  }
}

/** 환불(부분 취소). 테스트 결제는 기록만 남긴다. */
export async function refundPayment(pg: string, paymentKey: string, amount: number, reason: string, idem: string): Promise<PayResult> {
  if (amount <= 0) return { ok: true, raw: "0원" };
  if (pg !== "toss") return { ok: true, raw: "테스트 결제 환불(실제 돈이 오가지 않음)" };
  try {
    const res = await fetch(`${TOSS_API}/${encodeURIComponent(paymentKey)}/cancel`, {
      method: "POST",
      headers: { Authorization: tossAuth(), "Content-Type": "application/json", "Idempotency-Key": idem },
      body: JSON.stringify({ cancelReason: reason.slice(0, 200) || "고객 요청", cancelAmount: amount }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json().catch(() => ({}))) as { message?: string; status?: string };
    if (!res.ok) return { ok: false, error: body.message || `환불 실패(${res.status})`, raw: JSON.stringify(body).slice(0, 500) };
    return { ok: true, raw: JSON.stringify({ status: body.status }) };
  } catch (e) {
    return { ok: false, error: `환불 요청 실패: ${(e as Error).message}` };
  }
}

export const currentPg = () => paymentProvider();
export const tossClientKey = () => process.env.TOSS_CLIENT_KEY?.trim() ?? "";
