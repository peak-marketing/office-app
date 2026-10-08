import Link from "next/link";
import Icon from "@/components/Icon";
import PostCard from "@/components/community/PostCard";
import SpaceCard from "@/components/explore/SpaceCard";
import ProductCard from "@/components/shop/ProductCard";
import { Empty } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { filterCases } from "@/lib/case-filter";
import { listPosts } from "@/lib/community";
import { getCases, getSavedCaseIds, getVendorCards } from "@/lib/data";
import { searchProducts } from "@/lib/shop";

export const metadata = { title: "검색" };

/** 통합 검색: 공간(커뮤니티)·시공 사례·상품·시공사 */
export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim().slice(0, 40);
  const user = await currentUser();
  const saved = new Set(user?.role === "customer" ? getSavedCaseIds(user.id) : []);
  const posts = q ? listPosts({ q }, 8) : [];
  const cases = q ? filterCases(getCases(), { q }).slice(0, 6) : [];
  const products = q ? searchProducts({ q }, 8) : [];
  const vendors = q ? getVendorCards().filter((v) => [v.company, v.intro, v.specialties, v.regions].some((t) => t.includes(q))).slice(0, 6) : [];
  const total = posts.length + cases.length + products.length + vendors.length;
  const head = (id: string, title: string, n: number, more: string) => (
    <div className="section-heading" id={id}>
      <div><h2>{title} <span className="text-muted">{n}</span></h2></div>
      {n > 0 && <Link href={more} className="more-link">더 보기<Icon name="chevron" className="size-4" /></Link>}
    </div>
  );
  return (
    <main className="discovery-wrap pb-16">
      <form action="/search" className="home-search" role="search">
        <Icon name="search" className="size-5 shrink-0 text-muted" />
        <input name="q" defaultValue={q} placeholder="공간, 상품, 시공사를 찾아보세요" aria-label="통합 검색" autoFocus={!q} />
        <button>검색</button>
      </form>
      {!q ? (
        <p className="py-10 text-center text-sm text-muted">찾고 싶은 공간·상품·시공사를 입력해 주세요. 예: 원룸, 소파, 성수동</p>
      ) : (
        <>
          <div className="explore-head"><h1>‘{q}’ 검색 결과 {total}건</h1></div>
          <nav className="filter-scroll mt-2" aria-label="검색 결과 종류">
            <a href="#r-posts" className="filter-chip">공간 {posts.length}</a>
            <a href="#r-cases" className="filter-chip">시공 사례 {cases.length}</a>
            <a href="#r-products" className="filter-chip">상품 {products.length}</a>
            <a href="#r-vendors" className="filter-chip">시공사 {vendors.length}</a>
          </nav>
          <section className="discovery-section" data-testid="search-posts">
            {head("r-posts", "공간", posts.length, `/community?q=${encodeURIComponent(q)}`)}
            {posts.length ? <ul className="post-grid">{posts.map((p) => <PostCard key={p.id} p={p} />)}</ul> : <Empty>맞는 공간 글이 없어요.</Empty>}
          </section>
          <section className="discovery-section" data-testid="search-cases">
            {head("r-cases", "시공 사례", cases.length, `/cases?q=${encodeURIComponent(q)}`)}
            {cases.length ? <ul className="space-feed">{cases.map((c) => <SpaceCard key={c.id} c={c} saved={saved.has(c.id)} canSave={!user || user.role === "customer"} />)}</ul> : <Empty>맞는 시공 사례가 없어요.</Empty>}
          </section>
          <section className="discovery-section" data-testid="search-products">
            {head("r-products", "상품", products.length, `/shop/search?q=${encodeURIComponent(q)}`)}
            {products.length ? <ul className="product-grid">{products.map((p) => <ProductCard key={p.id} p={p} />)}</ul> : <Empty>맞는 상품이 없어요.</Empty>}
          </section>
          <section className="discovery-section" data-testid="search-vendors">
            {head("r-vendors", "시공사", vendors.length, "/vendors")}
            {vendors.length ? (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {vendors.map((v) => (
                  <li key={v.id}>
                    <Link href={`/vendors/${v.id}`} className="block rounded-2xl border border-line bg-white p-4 hover:border-brand">
                      <b>{v.company}</b>
                      <span className="mt-1 block text-xs text-muted">{v.regions || "지역 미입력"} · 사례 {v.cases}건</span>
                      <span className="mt-2 line-clamp-2 block text-xs leading-relaxed text-muted">{v.intro}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>맞는 시공사가 없어요.</Empty>
            )}
          </section>
        </>
      )}
    </main>
  );
}
