"use client";

import { useState } from "react";

/** 요청 참여 방식: 운영자 배정만 / 업체 직접 참여도 받기(참여 업체 수 상한). 업체끼리는 제안을 볼 수 없고, 최저가 자동 낙찰은 없다. */
export default function BidModeField({ mode = "operator", cap = 5 }: { mode?: string; cap?: number }) {
  const [open, setOpen] = useState(mode === "open");
  return (
    <fieldset className="rounded-2xl border border-line bg-white p-4" data-testid="bid-mode">
      <legend className="px-1 text-sm font-semibold">업체를 어떻게 받을까요?</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-line p-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
          <input type="radio" name="bidMode" value="operator" checked={!open} onChange={() => setOpen(false)} className="mt-0.5 size-4 accent-brand" />
          <span><b>운영자 배정</b><span className="mt-0.5 block text-xs leading-relaxed text-muted">운영자가 조건에 맞는 업체를 골라 보내요.</span></span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-line p-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
          <input type="radio" name="bidMode" value="open" checked={open} onChange={() => setOpen(true)} className="mt-0.5 size-4 accent-brand" data-testid="bid-open" />
          <span><b>업체 직접 참여도 받기</b><span className="mt-0.5 block text-xs leading-relaxed text-muted">운영자 배정과 함께, 승인된 시공사가 요청을 보고 직접 참여해요.</span></span>
        </label>
      </div>
      {open && (
        <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          참여 업체 최대
          <select name="bidCap" defaultValue={cap} className="input !min-h-10 w-auto" data-testid="bid-cap">
            {[2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>{n}곳</option>
            ))}
          </select>
          <span className="text-xs text-muted">운영자 배정 업체를 포함해요. 다 차면 더 받지 않아요.</span>
        </label>
      )}
      <p className="mt-3 text-xs leading-relaxed text-muted">어느 방식이든 업체끼리는 서로의 금액과 제안을 볼 수 없고, 가장 싼 곳이 자동으로 정해지지 않아요. 직접 참여하는 업체에도 요청 이름·상세 주소·연락처는 보이지 않아요.</p>
    </fieldset>
  );
}
