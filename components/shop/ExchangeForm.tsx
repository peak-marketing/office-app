"use client";
import { useState } from "react";
import { StateForm } from "../forms";
import { CLAIM_REASONS } from "@/lib/shop-constants";
import type { FormState } from "@/lib/actions";

export default function ExchangeForm({ action, max, options }: { action: (s: FormState,f: FormData) => Promise<FormState>; max: number; options: { id: number; label: string; price: number; stock: number }[] }) {
  const [open,setOpen] = useState(false);
  if (!open) return <button type="button" className="btn btn-sm" data-testid="exchange-open" onClick={() => setOpen(true)}>교환 신청</button>;
  return <StateForm action={action} submit="교환 요청 보내기" className="w-full rounded-xl border border-line bg-sand p-3" secondary={<button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>닫기</button>}>
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="block"><span className="label">교환받을 옵션</span><select className="input" name="sku" required data-testid="exchange-sku">{options.map((o) => <option key={o.id} value={o.id} disabled={o.stock < 1}>{o.label || "기본"} · {o.price.toLocaleString()}원{o.stock < 1 ? " · 품절" : ""}</option>)}</select></label>
      <label className="block"><span className="label">수량</span><select className="input" name="qty">{Array.from({length:max},(_,i) => <option key={i} value={i+1}>{i+1}개</option>)}</select></label>
      <label className="block"><span className="label">교환 사유</span><select className="input" name="reason_code" required defaultValue="" data-testid="exchange-reason"><option value="" disabled>골라 주세요</option>{Object.entries(CLAIM_REASONS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
      <label className="block"><span className="label">자세한 내용</span><input name="reason" className="input" maxLength={300}/></label>
    </div>
    <p className="mt-2 text-xs text-muted">같은 상품의 옵션이나 같은 옵션의 새 상품으로 교환해요. 옵션 가격 차이와 고객 사유 왕복 배송비는 승인 후 주문 상세에 표시돼요. 불량·오배송 배송비는 판매자가 부담해요.</p>
  </StateForm>;
}
