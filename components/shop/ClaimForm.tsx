"use client";

import { useState } from "react";
import type { FormState } from "@/lib/actions";
import { CLAIM_REASONS } from "@/lib/shop-constants";
import { StateForm } from "../forms";

type Action = (state: FormState, fd: FormData) => Promise<FormState>;

/** 취소·반품 신청(수량·사유). 버튼을 누르면 펼쳐진다. */
export default function ClaimForm({ action, type, max, note }: { action: Action; type: "cancel" | "return"; max: number; note: string }) {
  const [open, setOpen] = useState(false);
  const label = type === "cancel" ? "주문 취소" : "반품 신청";
  if (!open) return <button type="button" className="btn btn-sm" onClick={() => setOpen(true)} data-testid={`${type}-open`}>{label}</button>;
  return (
    <StateForm action={action} submit={label} className="mt-2 w-full rounded-xl border border-line bg-sand p-3 text-sm" secondary={<button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>닫기</button>}>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block"><span className="label">수량</span>
          <select name="qty" className="input" defaultValue={max}>{Array.from({ length: max }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}개</option>)}</select>
        </label>
        <label className="block"><span className="label">사유</span>
          <select name="reason_code" className="input" required defaultValue="" data-testid={`${type}-reason`}>
            <option value="" disabled>골라 주세요</option>
            {Object.entries(CLAIM_REASONS).filter(([k]) => type === "return" || k !== "wrong_item").map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label className="block sm:col-span-2"><span className="label">자세한 내용(선택)</span><input name="reason" className="input" maxLength={300} /></label>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">{note}</p>
    </StateForm>
  );
}
