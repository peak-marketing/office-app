import Link from "next/link";
import { CaseTile } from "@/components/cases";
import { FavoriteButton } from "@/components/vendor-client";
import { Empty, Page } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getFavoriteVendorIds, getSavedCases, getVendorCards } from "@/lib/data";
import PostCard from "@/components/community/PostCard";
import ProductCard from "@/components/shop/ProductCard";
import { all } from "@/lib/db";
import { getPostCard } from "@/lib/community";
import { getProductCards } from "@/lib/shop";

export const metadata = { title: "저장" };

export default async function Saved() {
  const user = await requireUser("customer");
  const cases = getSavedCases(user.id);
  const favorites = new Set(getFavoriteVendorIds(user.id));
  const vendors = getVendorCards().filter((v) => favorites.has(v.id));
  const scrapIds = (target: string) => all<{ target_id: number }>(`SELECT target_id FROM scraps WHERE user_id = ? AND target = ? ORDER BY created_at DESC`, user.id, target).map((r) => r.target_id);
  const posts = scrapIds("post").map((id) => getPostCard(id)).filter((p) => p && p.status === "published") as NonNullable<ReturnType<typeof getPostCard>>[];
  const productIds = scrapIds("product");
  const products = getProductCards(productIds).sort((a, b) => productIds.indexOf(a.id) - productIds.indexOf(b.id));
  return (
    <Page>
      <h1 className="text-2xl font-bold tracking-tight">저장</h1>
      <p className="mt-1.5 text-sm text-muted">스크랩한 공간·상품, 저장한 시공 사례, 관심 업체를 모았어요. 저장한 사례는 요청서에 참고 자료로 연결하고, 관심 업체는 운영자가 시공사를 배정할 때 참고해요.</p>
      <nav className="filter-scroll mt-4" aria-label="저장 종류">
        <a href="#posts" className="filter-chip">공간 {posts.length}</a>
        <a href="#products" className="filter-chip">상품 {products.length}</a>
        <a href="#cases" className="filter-chip">시공 사례 {cases.length}</a>
        <a href="#vendors" className="filter-chip">업체 {vendors.length}</a>
      </nav>

      <section className="mt-6 scroll-mt-28" id="posts">
        <h2 className="mb-3 text-lg font-bold tracking-tight">스크랩한 공간 <span className="text-muted">{posts.length}</span></h2>
        {posts.length === 0 ? <Empty>스크랩한 공간이 없어요. <Link href="/community" className="text-brand underline">커뮤니티 둘러보기</Link></Empty> : <ul className="post-grid" data-testid="saved-posts">{posts.map((p) => <PostCard key={p.id} p={p} />)}</ul>}
      </section>
      <section className="mt-10 scroll-mt-28" id="products">
        <h2 className="mb-3 text-lg font-bold tracking-tight">스크랩한 상품 <span className="text-muted">{products.length}</span></h2>
        {products.length === 0 ? <Empty>스크랩한 상품이 없어요. <Link href="/shop" className="text-brand underline">쇼핑 둘러보기</Link></Empty> : <ul className="product-grid" data-testid="saved-products">{products.map((p) => <ProductCard key={p.id} p={p} />)}</ul>}
      </section>

      <section className="mt-10 scroll-mt-28" id="cases">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 className="text-lg font-bold tracking-tight">
            저장한 사례 <span className="text-muted">{cases.length}</span>
          </h2>
          {cases.length > 0 && (
            <Link href="/spaces/new" className="btn btn-sm btn-primary">
              내 공간 만들기
            </Link>
          )}
        </div>
        {cases.length === 0 ? (
          <Empty>
            저장한 사례가 없습니다.{" "}
            <Link href="/cases" className="text-brand underline">
              사례를 둘러보고 마음에 드는 공간을 저장해 보세요.
            </Link>
          </Empty>
        ) : (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 lg:grid-cols-4" data-testid="saved-cases">
            {cases.map((c) => (
              <CaseTile key={c.id} c={c} saved>
                <Link href={`/spaces/new?case=${c.id}`} className="mt-2 block text-xs text-brand underline">
                  이런 공간으로 제안받기
                </Link>
              </CaseTile>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10 scroll-mt-28" id="vendors">
        <h2 className="mb-3 text-lg font-bold tracking-tight">
          관심 업체 <span className="text-muted">{vendors.length}</span>
        </h2>
        {vendors.length === 0 ? (
          <Empty>
            관심 업체가 없습니다.{" "}
            <Link href="/vendors" className="text-brand underline">
              시공사를 살펴보세요.
            </Link>
          </Empty>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="saved-vendors">
            {vendors.map((v) => (
              <li key={v.id} className="relative flex gap-4 rounded-2xl border border-line bg-surface p-4">
                {v.photos[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 업로드 파일
                  <img src={`/files/${v.photos[0].id}`} alt="" loading="lazy" className="size-20 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span className="size-20 shrink-0 rounded-xl bg-sand" />
                )}
                <Link href={`/vendors/${v.id}`} className="min-w-0 flex-1">
                  <b className="block truncate">{v.company}</b>
                  <span className="mt-0.5 block text-xs text-muted">
                    {v.regions || "지역 미입력"} · 사례 {v.cases}건
                  </span>
                  <span className="mt-2 line-clamp-2 block text-xs leading-relaxed text-muted">{v.intro}</span>
                </Link>
                <span className="shrink-0">
                  <FavoriteButton vendorId={v.id} initial />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  );
}
