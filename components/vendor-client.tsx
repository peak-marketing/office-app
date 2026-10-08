"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toggleFavorite, toggleSavedCase } from "@/lib/actions";

/** 참고 사례 저장. 관심 업체(하트)와 구분되도록 책갈피 모양을 쓴다. 로그인하지 않았으면 서버에서 로그인 화면으로 보낸다. */
export function SaveCaseButton({ caseId, initial, variant = "icon" }: { caseId: number; initial: boolean; variant?: "icon" | "full" | "square" }) {
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();
  const click = () =>
    startTransition(async () => {
      setOn((v) => !v);
      const res = await toggleSavedCase(caseId);
      setOn(res.on);
    });
  const mark = (
    <svg viewBox="0 0 24 24" className={variant === "square" ? "size-5" : "size-4"} fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4.2-6.5 4.2v-16a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
    </svg>
  );
  if (variant === "full")
    return (
      <button type="button" onClick={click} disabled={pending} aria-pressed={on} data-save-case={caseId} className={`btn ${on ? "border-brand bg-brand-soft text-brand" : ""}`}>
        {mark}
        {on ? "저장한 공간" : "공간 저장"}
      </button>
    );
  if (variant === "square")
    return (
      <button type="button" onClick={click} disabled={pending} aria-pressed={on} data-save-case={caseId} aria-label={on ? "저장한 공간에서 빼기" : "공간 저장"} className={`btn shrink-0 !min-h-12 !px-3 ${on ? "border-brand bg-brand-soft text-brand" : ""}`}>
        {mark}
      </button>
    );
  return (
    <button
      type="button"
      onClick={click}
      disabled={pending}
      aria-pressed={on}
      data-save-case={caseId}
      aria-label={on ? "저장한 공간에서 빼기" : "공간 저장"}
      title={on ? "저장한 공간" : "공간 저장"}
      className={`grid size-10 cursor-pointer place-items-center rounded-full shadow-sm backdrop-blur transition ${on ? "bg-brand text-white" : "bg-white/90 text-ink hover:bg-white"}`}
    >
      {mark}
    </button>
  );
}

/** 관심 업체 담기. 로그인하지 않았으면 서버에서 로그인 화면으로 보낸다. */
export function FavoriteButton({ vendorId, initial, variant = "icon" }: { vendorId: number; initial: boolean; variant?: "icon" | "full" }) {
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();
  const click = () =>
    startTransition(async () => {
      setOn((v) => !v);
      const res = await toggleFavorite(vendorId);
      setOn(res.on);
    });
  const heart = (
    <svg viewBox="0 0 24 24" className="size-4" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z" strokeLinejoin="round" />
    </svg>
  );
  if (variant === "full")
    return (
      <button type="button" onClick={click} disabled={pending} aria-pressed={on} className={`btn ${on ? "border-danger/40 text-danger" : ""}`}>
        {heart}
        {on ? "관심 업체에 담김" : "관심 업체로 담기"}
      </button>
    );
  return (
    <button
      type="button"
      onClick={click}
      disabled={pending}
      aria-pressed={on}
      aria-label={on ? "관심 업체에서 빼기" : "관심 업체로 담기"}
      className={`grid size-11 cursor-pointer place-items-center rounded-full bg-white/95 shadow-sm backdrop-blur transition hover:bg-white ${on ? "text-danger" : "text-ink"}`}
    >
      {heart}
    </button>
  );
}

/** 사례 사진 묶음. 누르면 크게 보고 좌우로 넘긴다. */
export function PhotoGallery({ photos, title, note }: { photos: number[]; title: string; note?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState<number | null>(null);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (index != null && !d.open) d.showModal();
    if (index == null && d.open) d.close();
  }, [index]);
  const move = (step: number) => setIndex((i) => (i == null ? i : (i + step + photos.length) % photos.length));
  if (!photos.length) return null;
  return (
    <>
      <ul className={`grid gap-1.5 ${photos.length === 1 ? "" : "grid-cols-2 sm:grid-cols-3"}`}>
        {photos.map((id, i) => (
          <li key={id} className={photos.length > 1 && i === 0 ? "col-span-2 sm:col-span-2 sm:row-span-2" : ""}>
            <button type="button" onClick={() => setIndex(i)} className="block h-full w-full cursor-zoom-in overflow-hidden rounded-lg bg-sand" aria-label={`${title} 사진 ${i + 1} 크게 보기`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- 업로드 파일 */}
              <img src={`/files/${id}`} alt={`${title} ${i + 1}`} loading="lazy" className="aspect-[4/3] h-full w-full object-cover transition duration-300 hover:scale-[1.02]" />
            </button>
          </li>
        ))}
      </ul>
      <dialog
        ref={dialog}
        onClose={() => setIndex(null)}
        onClick={(e) => e.target === dialog.current && setIndex(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") move(1);
          if (e.key === "ArrowLeft") move(-1);
        }}
        className="m-auto max-h-[92vh] w-[min(1100px,94vw)] rounded-xl bg-ink p-0 text-white backdrop:bg-black/70"
      >
        {index != null && (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- 업로드 파일 */}
            <img src={`/files/${photos[index]}`} alt={`${title} ${index + 1}`} className="max-h-[84vh] w-full object-contain" />
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="truncate">
                {title} · {index + 1}/{photos.length}
                {note && <span className="ml-2 text-xs opacity-70">{note}</span>}
              </span>
              <span className="flex gap-2">
                {photos.length > 1 && (
                  <>
                    <button type="button" className="cursor-pointer rounded-md border border-white/30 px-3 py-1" onClick={() => move(-1)}>
                      이전
                    </button>
                    <button type="button" className="cursor-pointer rounded-md border border-white/30 px-3 py-1" onClick={() => move(1)}>
                      다음
                    </button>
                  </>
                )}
                <button type="button" className="cursor-pointer rounded-md bg-white px-3 py-1 text-ink" onClick={() => setIndex(null)}>
                  닫기
                </button>
              </span>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
