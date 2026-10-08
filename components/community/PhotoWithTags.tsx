"use client";

import Link from "next/link";
import { useState } from "react";
import type { PhotoTag } from "@/lib/community";

/** 게시물 사진과 상품 태그. 점을 누르면 상품 카드가 열리고 상품 상세로 간다. */
export default function PhotoWithTags({ fileId, alt, tags, caption }: { fileId: number; alt: string; tags: PhotoTag[]; caption: string }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <figure className="space-y-2">
      <div className="relative overflow-hidden rounded-2xl bg-sand">
        <img src={`/files/${fileId}`} alt={alt} className="block w-full" />
        {tags.map((t) => (
          <div key={t.id} className="absolute" style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%` }}>
            <button type="button" className="tag-dot" aria-label={`상품: ${t.title}`} onClick={() => setOpen(open === t.id ? null : t.id)} data-testid="tag-dot">
              +
            </button>
            {open === t.id && (
              <div className={`tag-card ${t.x > 0.6 ? "right-0" : "left-0"} ${t.y > 0.6 ? "bottom-8" : "top-8"}`}>
                {t.cover && <img src={`/files/${t.cover}`} alt="" className="size-12 shrink-0 rounded-lg object-cover" />}
                <span className="min-w-0">
                  <span className="line-clamp-2 text-xs font-semibold">{t.title}</span>
                  {t.on_sale ? (
                    <Link href={`/shop/products/${t.product_id}`} className="text-xs text-brand underline" data-testid="tag-link">{t.price.toLocaleString()}원 · 상품 보기</Link>
                  ) : (
                    <span className="text-xs text-muted">판매 종료</span>
                  )}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
      {caption && <figcaption className="text-sm leading-relaxed">{caption}</figcaption>}
    </figure>
  );
}
