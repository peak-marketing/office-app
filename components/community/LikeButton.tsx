"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleLike } from "@/lib/community-actions";

export default function LikeButton({ postId, initial, count }: { postId: number; initial: boolean; count: number }) {
  const [on, setOn] = useState(initial);
  const [n, setN] = useState(count);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={on}
      data-testid="like"
      className={`btn btn-sm ${on ? "border-brand bg-brand-soft text-brand" : ""}`}
      onClick={() =>
        start(async () => {
          const r = await toggleLike(postId);
          if (r.login) return router.push(`/login?next=${encodeURIComponent(location.pathname)}`);
          setN((x) => x + (r.on ? 1 : -1));
          setOn(r.on);
        })
      }
    >
      <svg viewBox="0 0 24 24" className="size-4" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} aria-hidden>
        <path d="M12 20s-7.5-4.6-9-9.5C2 7 4.2 4.5 7 4.5c2 0 3.6 1.2 5 3 1.4-1.8 3-3 5-3 2.8 0 5 2.5 4 6C19.5 15.4 12 20 12 20Z" strokeLinejoin="round" />
      </svg>
      좋아요 <span className="tabular-nums">{n}</span>
    </button>
  );
}
