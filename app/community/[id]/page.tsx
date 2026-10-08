import Link from "next/link";
import { notFound } from "next/navigation";
import Comments from "@/components/community/Comments";
import LikeButton from "@/components/community/LikeButton";
import PhotoWithTags from "@/components/community/PhotoWithTags";
import ReportButton from "@/components/community/ReportButton";
import { CopyButton } from "@/components/client";
import ScrapButton from "@/components/shop/ScrapButton";
import ProductCard from "@/components/shop/ProductCard";
import { Badge, Notice } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { HOME_TYPE_LABEL, POST_TYPE, STYLE_LABEL, getPostCard, isLiked, postComments, postPhotos } from "@/lib/community";
import { deletePost } from "@/lib/community-actions";
import { dateKo } from "@/lib/constants";
import { run } from "@/lib/db";
import { getProductCards, isScrapped } from "@/lib/shop";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const p = getPostCard(Number((await params).id));
  return { title: p?.status === "published" ? p.title : "커뮤니티" };
}

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const post = getPostCard(Number((await params).id));
  const user = await currentUser();
  if (!post) notFound();
  const mine = user?.id === post.user_id;
  if (post.status !== "published" && !mine && user?.role !== "admin") notFound();
  if (!mine && post.status === "published") run(`UPDATE posts SET views = views + 1 WHERE id = ?`, post.id);
  const photos = postPhotos(post.id);
  const tagged = getProductCards([...new Set(photos.flatMap((p) => p.tags.map((t) => t.product_id)))]);
  const comments = postComments(post.id);
  const facts = [post.space_kind === "office" ? "사무실" : HOME_TYPE_LABEL[post.home_type] || "집", post.area_pyeong ? `${post.area_pyeong}평` : "", STYLE_LABEL[post.style] ?? "", post.region].filter(Boolean);
  return (
    <main className="page-shell narrow">
      <Link href={post.type === "review" ? "/community/reviews" : "/community"} className="text-sm text-muted">← 커뮤니티</Link>
      {post.status === "hidden" && <div className="mt-3"><Notice tone="warn" title="운영자가 가린 글이에요">{post.hidden_reason || "운영 정책 위반"} — 다른 사람에게는 보이지 않아요.</Notice></div>}
      <header className="mt-3 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={post.type === "review" ? "brand" : "plain"}>{POST_TYPE[post.type]}</Badge>
          {post.verified ? <Badge tone="brand">계약 확인</Badge> : null}
          {post.is_example ? <Badge tone="warn">예시 게시물</Badge> : null}
        </div>
        <h1 className="detail-title">{post.title}</h1>
        <p className="text-sm text-muted">{post.author} · {dateKo(post.created_at)}{facts.length > 0 && ` · ${facts.join(" · ")}`}</p>
        {post.type === "review" && post.rating && <p className="text-sm" aria-label={`별점 ${post.rating}점`}><span className="text-brand">{"★".repeat(post.rating)}</span><span className="text-line">{"★".repeat(5 - post.rating)}</span> {post.rating}/5</p>}
      </header>
      {post.vendor_id && (
        <Link href={`/vendors/${post.vendor_id}`} className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4 text-sm hover:border-brand" data-testid="post-vendor">
          <span>
            <span className="block text-xs text-muted">{post.verified ? "계약한 시공사 · 플랫폼에 기록된 계약 결과로 확인" : "작성자가 연결한 시공사 · 계약 확인 전"}</span>
            <b>{post.vendor}</b>
          </span>
          <span className="btn btn-sm">업체 보기</span>
        </Link>
      )}
      <div className="mt-6 space-y-6">
        {photos.map((p, i) => <div key={p.id}><PhotoWithTags fileId={p.file_id} alt={`${post.title} 사진 ${i + 1}`} tags={p.tags} caption={p.caption} /><Link href={`${post.space_kind === "home" ? "/homes/new" : "/spaces/new"}?post=${post.id}&postPhoto=${p.id}`} className="btn btn-sm mt-2" data-testid="reference-photo">이 사진 참고해 내 공간 만들기</Link></div>)}
      </div>
      {mine && post.project_id && <Link href={`/projects/${post.project_id}`} className="btn btn-sm mt-4" data-testid="post-own-space">연결한 내 공간 보기</Link>}
      {post.body && <p className="mt-6 whitespace-pre-line leading-relaxed">{post.body}</p>}
      <div className="mt-6 flex flex-wrap items-center gap-2 border-y border-line py-3">
        <LikeButton postId={post.id} initial={isLiked(user?.id, post.id)} count={post.likes} />
        <ScrapButton target="post" id={post.id} initial={isScrapped(user?.id, "post", post.id)} count={post.scraps} />
        <CopyButton text={`/community/${post.id}`} />
        <span className="ml-auto flex items-center gap-3">
          {mine && <Link href={`/community/${post.id}/edit`} className="text-sm text-muted underline">고치기</Link>}
          {(mine || user?.role === "admin") && <form action={deletePost.bind(null, post.id)}><button className="text-sm text-danger underline">지우기</button></form>}
          {user && !mine && <ReportButton target="post" id={post.id} />}
        </span>
      </div>
      {tagged.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold">사진 속 상품</h2>
          <ul className="product-grid mt-3 !grid-cols-2 sm:!grid-cols-4">{tagged.map((p) => <ProductCard key={p.id} p={p} compact />)}</ul>
        </section>
      )}
      <section className="my-space-strip mt-8 flex flex-wrap items-center justify-between gap-3 text-sm">
        <span>이런 공간을 만들고 싶다면, 내 공간을 만들어 가구를 놓아 보거나 시공 견적을 받아 보세요.</span>
        <span className="flex gap-2">
          <Link href={`${post.space_kind === "home" ? "/homes/new" : "/spaces/new"}?post=${post.id}&postPhoto=${photos[0]?.id ?? ""}`} className="btn btn-sm">내 공간 만들기</Link>
          <Link href={`/request?post=${post.id}&postPhoto=${photos[0]?.id ?? ""}`} className="btn btn-sm btn-primary">견적 요청</Link>
        </span>
      </section>
      <div className="mt-10">
        <Comments postId={post.id} comments={comments} me={user?.id ?? null} canWrite={!!user && user.role !== "admin" && post.status === "published"} />
      </div>
    </main>
  );
}
