import Link from "next/link";
import Icon from "@/components/Icon";
import ProductCard from "@/components/shop/ProductCard";
import { Empty } from "@/components/ui";
import { CATEGORIES, SORTS, categoryLabel, searchProducts, type ProductQuery } from "@/lib/shop";

export const metadata = { title: "상품 찾기" };

export default async function ShopSearch({ searchParams }: { searchParams: Promise<ProductQuery> }) {
  const q = await searchParams;
  const list = searchProducts(q, 120);
  const link = (patch: Partial<ProductQuery>) => {
    const next = { ...q, ...patch };
    const sp = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]);
    return `/shop/search${sp.size ? `?${sp}` : ""}`;
  };
  const heading = q.q ? `‘${q.q}’ 검색 결과` : q.cat ? categoryLabel(q.cat) : q.three === "1" ? "내 공간에 놓아 볼 수 있는 상품" : "전체 상품";
  return (
    <main className="discovery-wrap pb-16">
      <form action="/shop/search" className="home-search" role="search">
        <Icon name="search" className="size-5 text-muted" />
        <input name="q" defaultValue={q.q ?? ""} placeholder="가구, 조명, 브랜드 검색" aria-label="상품 검색" />
        {q.cat && <input type="hidden" name="cat" value={q.cat} />}
        <button>검색</button>
      </form>
      <div className="explore-head">
        <h1>{heading}</h1>
        <p>{list.length}개 상품{q.three === "1" && " · 규격이 등록되어 내 공간에 실제 크기로 놓을 수 있어요"}</p>
      </div>
      <div className="filter-scroll mt-3" aria-label="카테고리">
        <Link href={link({ cat: undefined })} className={`filter-chip ${!q.cat ? "active" : ""}`}>전체</Link>
        {CATEGORIES.map((c) => (
          <Link key={c.key} href={link({ cat: c.key })} className={`filter-chip ${q.cat === c.key ? "active" : ""}`}>{c.label}</Link>
        ))}
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
        {Object.entries(SORTS).map(([k, v]) => (
          <Link key={k} href={link({ sort: k })} className={`rounded-full px-3 py-1.5 ${(q.sort ?? "new") === k ? "bg-ink text-white" : "text-muted hover:bg-sand"}`}>{v}</Link>
        ))}
        <Link href={link({ three: q.three === "1" ? undefined : "1" })} className={`filter-chip ml-auto ${q.three === "1" ? "active" : ""}`} data-testid="filter-three">
          <Icon name="cube" className="size-4" />내 공간에 놓기 가능
        </Link>
      </div>
      {list.length ? <ul className="product-grid" data-testid="product-list">{list.map((p) => <ProductCard key={p.id} p={p} />)}</ul> : <Empty>조건에 맞는 상품이 없어요.</Empty>}
    </main>
  );
}
