"use client";

import type { FormState } from "@/lib/actions";
import { StateForm } from "../forms";

type Action = (state: FormState, fd: FormData) => Promise<FormState>;

/** 주문 묶음 처리 버튼: 발주 확인 → 발송(택배사·송장) → 배송 완료 */
export default function GroupActions({ action, status, courier }: { action: Action; status: string; courier: string }) {
  if (status === "paid")
    return (
      <div className="flex flex-wrap gap-2">
        <StateForm action={action} submit="발주 확인(배송 준비)"><input type="hidden" name="do" value="prepare" /></StateForm>
      </div>
    );
  if (status === "preparing")
    return (
      <StateForm action={action} submit="발송 처리" className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)]">
        <input type="hidden" name="do" value="ship" />
        <input className="input" name="courier" defaultValue={courier} placeholder="택배사" aria-label="택배사" required />
        <input className="input" name="tracking_no" placeholder="송장번호" aria-label="송장번호" required data-testid="tracking-no" />
      </StateForm>
    );
  if (status === "shipped")
    return (
      <StateForm action={action} submit="배송 완료 처리">
        <input type="hidden" name="do" value="deliver" />
        <p className="text-xs text-muted">택배사 배송 조회 연동 전이라 배송 완료는 직접 눌러 주세요. 완료 7일 뒤 자동으로 구매 확정돼요.</p>
      </StateForm>
    );
  return null;
}
