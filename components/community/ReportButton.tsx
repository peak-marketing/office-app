"use client";

import { useState } from "react";
import { REPORT_REASONS } from "@/lib/community-constants";
import { reportContent } from "@/lib/community-actions";
import { StateForm } from "../forms";

/** 신고 버튼: 누르면 사유를 고르는 작은 양식이 열린다. */
export default function ReportButton({ target, id, small = false }: { target: "post" | "comment" | "product"; id: number; small?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${small ? "text-xs" : "text-sm"} text-muted underline-offset-2 hover:underline`} data-testid={`report-${target}`}>
        신고
      </button>
    );
  return (
    <StateForm action={reportContent.bind(null, target, id)} submit="신고하기" className="rounded-xl border border-line bg-white p-3 text-sm" secondary={<button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>닫기</button>}>
      <fieldset className="grid gap-1.5">
        <legend className="mb-1 font-semibold">신고 사유</legend>
        {Object.entries(REPORT_REASONS).map(([k, v]) => (
          <label key={k} className="flex items-center gap-2">
            <input type="radio" name="reason" value={k} className="size-4 accent-brand" /> {v}
          </label>
        ))}
      </fieldset>
      <textarea name="detail" className="input mt-2" rows={2} maxLength={500} placeholder="자세한 내용(선택)" aria-label="신고 내용" />
    </StateForm>
  );
}
