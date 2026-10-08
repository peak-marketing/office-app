"use client";
import { StateForm } from "../forms";
import type { FormState } from "@/lib/actions";
export default function ExchangeActions({action,status}: { action:(s:FormState,f:FormData)=>Promise<FormState>;status:string }) {
  if (!["requested","approved","ready"].includes(status)) return null;
  const actionName = status === "requested" ? "approve" : status === "approved" ? "collect" : "ship";
  return <div className="mt-3 grid gap-3 sm:grid-cols-2">
    <StateForm action={action} submit={status === "requested" ? "교환 승인" : status === "approved" ? "회수 확인·차액 처리" : "교환 상품 발송"} className="rounded-xl border border-line p-3">
      <input type="hidden" name="do" value={actionName}/>
      {status === "requested" && <input name="note" className="input" placeholder="고객 안내(선택)"/>}
      {status === "approved" && <label className="text-sm"><input type="checkbox" name="restock" defaultChecked/> 회수 상품을 판매 가능한 재고로 복구</label>}
      {status === "ready" && <div className="space-y-2"><input name="courier" className="input" placeholder="택배사" required/><input name="tracking_no" className="input" placeholder="송장번호" required/></div>}
    </StateForm>
    {status === "requested" && <StateForm action={action} submit="교환 거절" className="rounded-xl border border-line p-3"><input type="hidden" name="do" value="reject"/><input name="note" className="input" placeholder="거절 사유" required/></StateForm>}
  </div>;
}
