import Link from "next/link";
import PostCard from "./PostCard";
import { Empty } from "../ui";
import { HOME_TYPE_LABEL, STYLE_LABEL } from "@/lib/community-constants";
import { listPosts, type PostQuery } from "@/lib/community";

/** 커뮤니티 피드: 공간 종류·주거 형태·스타일·정렬 필터와 사진 카드 */
export default async function Feed({ base, query, fixedType, intro }: { base: string; query: PostQuery; fixedType?: "space" | "review"; intro: string }) {
  const q = { ...query, type: fixedType ?? query.type };
  const posts = listPosts(q, 120);
  const link = (patch: Partial<PostQuery>) => {
    const next = { ...query, ...patch };
    const sp = new URLSearchParams(Object.entries(next).filter(([k, v]) => v && k !== "type") as [string, string][]);
    return `${base}${sp.size ? `?${sp}` : ""}`;
  };
  return (
    <>
      <div className="explore-head flex flex-wrap items-end justify-between gap-3">
        <div>
          <p>{intro}</p>
        </div>
        <Link href="/community/new" className="btn btn-primary btn-sm" data-testid="write-post">글쓰기</Link>
      </div>
      <div className="filter-scroll mt-3">
        <Link href={link({ kind: undefined, home: undefined })} className={`filter-chip ${!query.kind ? "active" : ""}`}>전체</Link>
        <Link href={link({ kind: "home" })} className={`filter-chip ${query.kind === "home" && !query.home ? "active" : ""}`}>집</Link>
        {Object.entries(HOME_TYPE_LABEL).filter(([k]) => k !== "office" && k !== "etc").map(([k, v]) => (
          <Link key={k} href={link({ kind: "home", home: k })} className={`filter-chip ${query.home === k ? "active" : ""}`}>{v}</Link>
        ))}
        <Link href={link({ kind: "office", home: undefined })} className={`filter-chip ${query.kind === "office" ? "active" : ""}`}>사무실</Link>
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
        <Link href={link({ sort: undefined })} className={`rounded-full px-3 py-1.5 ${query.sort !== "popular" ? "bg-ink text-white" : "text-muted hover:bg-sand"}`}>최신순</Link>
        <Link href={link({ sort: "popular" })} className={`rounded-full px-3 py-1.5 ${query.sort === "popular" ? "bg-ink text-white" : "text-muted hover:bg-sand"}`}>인기순</Link>
        <span className="mx-1 text-line">|</span>
        {Object.entries(STYLE_LABEL).filter(([k]) => k !== "etc").map(([k, v]) => (
          <Link key={k} href={link({ style: query.style === k ? undefined : k })} className={`rounded-full px-2.5 py-1 text-xs ${query.style === k ? "bg-brand-soft text-brand" : "text-muted hover:bg-sand"}`}>{v}</Link>
        ))}
      </div>
      {posts.length ? (
        <ul className="post-grid" data-testid="post-list">{posts.map((p) => <PostCard key={p.id} p={p} />)}</ul>
      ) : (
        <Empty>아직 올라온 글이 없어요. 내 공간을 처음으로 소개해 보세요.</Empty>
      )}
    </>
  );
}
