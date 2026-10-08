import Link from "next/link";
import type { PostCard as Card } from "@/lib/community";
import { HOME_TYPE_LABEL } from "@/lib/community-constants";

/** 커뮤니티 카드: 사진 중심. 시공 후기(계약 확인)와 공간 소개를 구분해 표시한다. */
export default function PostCard({ p }: { p: Card }) {
  return (
    <li className="post-card min-w-0" data-post={p.id}>
      <Link href={`/community/${p.id}`} className="block">
        <span className="post-media">
          {p.cover && <img src={`/files/${p.cover}`} alt={p.title} loading="lazy" />}
          <span className={`post-kind ${p.type === "review" ? "is-review" : ""}`}>{p.type === "review" ? (p.verified ? "시공 후기 · 계약 확인" : "시공 후기") : "공간 소개"}</span>
          {p.is_example ? <span className="product-flag !top-auto bottom-2">예시 게시물</span> : null}
          {p.photos > 1 && <span className="post-count">{p.photos}</span>}
        </span>
        <span className="mt-2 block truncate text-[14px] font-semibold">{p.title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted">
          {p.author}
          {[p.space_kind === "office" ? "사무실" : HOME_TYPE_LABEL[p.home_type], p.area_pyeong ? `${p.area_pyeong}평` : ""].filter(Boolean).map((x) => ` · ${x}`)}
        </span>
        <span className="mt-1 flex gap-2.5 text-[11px] text-muted">
          <span>좋아요 {p.likes}</span>
          <span>스크랩 {p.scraps}</span>
          <span>댓글 {p.comments}</span>
        </span>
      </Link>
    </li>
  );
}
