"use client";

import type { FormState } from "@/lib/actions";
import { StateForm } from "../forms";

type Action = (state: FormState, fd: FormData) => Promise<FormState>;

/** 취소·반품 처리: 승인(환불) / 반품 승인 → 회수 확인·환불 / 거절(사유 필수) */
export default function ClaimActions({ action, type, status }: { action: Action; type: "cancel" | "return"; status: string }) {
  const main =
    type === "cancel" && status === "requested" ? { do: "approve", label: "취소 승인·환불" } : type === "return" && status === "requested" ? { do: "approve", label: "반품 승인(회수 진행)" } : type === "return" && status === "approved" ? { do: "complete", label: "회수 확인·환불" } : null;
  if (!main) return null;
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <StateForm action={action} submit={main.label} className="rounded-xl border border-line p-3">
        <input type="hidden" name="do" value={main.do} />
        <input className="input" name="note" placeholder="고객에게 남길 말(선택)" aria-label="메모" />
        {main.do === "complete" && <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" name="restock" defaultChecked className="size-4" /> 회수한 상품을 재고로 되돌리기</label>}
      </StateForm>
      <StateForm action={action} submit="거절" className="rounded-xl border border-line p-3">
        <input type="hidden" name="do" value="reject" />
        <input className="input" name="note" placeholder="거절 사유(고객에게 보여요)" aria-label="거절 사유" required />
      </StateForm>
    </div>
  );
}
