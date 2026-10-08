"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleScrap } from "@/lib/shop-actions";

/** 스크랩(공간 글·상품). 고객만. 로그인하지 않았으면 로그인 화면으로 */
export default function ScrapButton({ target, id, initial, count, full = false }: { target: "post" | "product"; id: number; initial: boolean; count?: number; full?: boolean }) {
  const [on, setOn] = useState(initial);
  const [n, setN] = useState(count ?? 0);
  const [pending, start] = useTransition();
  const router = useRouter();
  const click = () =>
    start(async () => {
      const r = await toggleScrap(target, id);
      if (r.login) return router.push(`/login?next=${encodeURIComponent(location.pathname)}`);
      setN((x) => x + (r.on === on ? 0 : r.on ? 1 : -1));
      setOn(r.on);
    });
  return (
    <button type="button" onClick={click} disabled={pending} aria-pressed={on} data-testid={`scrap-${target}`} className={`btn ${full ? "" : "btn-sm"} ${on ? "border-brand bg-brand-soft text-brand" : ""}`}>
      <svg viewBox="0 0 24 24" className="size-4" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} aria-hidden>
        <path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4.2-6.5 4.2v-16a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
      </svg>
      {on ? "스크랩함" : "스크랩"}
      {count != null && <span className="tabular-nums">{n}</span>}
    </button>
  );
}
