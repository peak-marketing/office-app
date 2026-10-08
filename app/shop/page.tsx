import Link from "next/link";
import Icon from "@/components/Icon";
import { CATEGORY_ICON } from "@/components/shop/categoryIcons";
import ProductCard from "@/components/shop/ProductCard";
import { Empty } from "@/components/ui";
import { paymentProvider } from "@/lib/external";
import { CATEGORIES, searchProducts } from "@/lib/shop";

export const metadata = { title: "쇼핑" };

/** 쇼핑 홈: 카테고리, 내 공간에 실제 크기로 놓아 볼 수 있는 상품, 인기·새 상품 */
export default async function ShopHome() {
  const popular = searchProducts({ sort: "popular" }, 8);
  const fresh = searchProducts({ sort: "new" }, 8);
  const placeable = searchProducts({ three: "1", sort: "popular" }, 4);
  return (
    <main className="discovery-wrap pb-16">
      <form action="/shop/search" className="home-search" role="search">
        <Icon name="search" className="size-5 text-muted" />
        <input name="q" placeholder="가구, 조명, 브랜드 검색" aria-label="상품 검색" />
        <button>검색</button>
      </form>
      {paymentProvider() === "test" && (
        <p className="mb-4 rounded-xl bg-warn-soft px-4 py-2.5 text-xs leading-relaxed text-warn" data-testid="test-pay-notice">
          지금 쇼핑 결제는 <b>테스트 결제</b>예요. 주문·배송·환불 흐름은 그대로 동작하지만 실제 돈이 오가지 않아요(결제 연동 전).
        </p>
      )}
      <nav className="category-rail" aria-label="카테고리">
        {CATEGORIES.map((c) => (
          <Link key={c.key} href={`/shop/search?cat=${c.key}`}>
            <span className="cat-icon"><Icon name={CATEGORY_ICON[c.key] ?? "grid"} className="size-6" /></span>
            {c.label}
          </Link>
        ))}
      </nav>

      <section className="layout-promo mt-8">
        <div>
          <p className="eyebrow">내 공간에 놓아 보기</p>
          <h2 className="mt-2">살까 말까 고민될 때,<br />내 방에 실제 크기로 놓아 보세요</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">규격이 등록된 상품은 내가 만든 공간에 실제 크기로 놓고 평면·3D로 확인할 수 있어요. 3D 모델이 없는 상품은 같은 크기의 상자로 보여요.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/shop/search?three=1" className="btn btn-primary">놓아 볼 수 있는 상품</Link>
            <Link href="/projects" className="btn">내 공간</Link>
          </div>
        </div>
        {placeable.length > 0 ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 [&_.product-title]:text-[13px]">
            {placeable.map((p) => <ProductCard key={p.id} p={p} compact />)}
          </ul>
        ) : (
          <Empty>아직 규격이 등록된 상품이 없어요.</Empty>
        )}
      </section>

      <section className="discovery-section">
        <div className="section-heading">
          <div><h2>많이 찾는 상품</h2><p>최근 주문과 스크랩이 많은 순서예요.</p></div>
          <Link href="/shop/search?sort=popular" className="more-link">더 보기<Icon name="chevron" className="size-4" /></Link>
        </div>
        {popular.length ? <ul className="product-grid" data-testid="shop-popular">{popular.map((p) => <ProductCard key={p.id} p={p} />)}</ul> : <Empty>판매 중인 상품이 없어요.</Empty>}
      </section>
      <section className="discovery-section">
        <div className="section-heading">
          <div><h2>새로 들어온 상품</h2></div>
          <Link href="/shop/search?sort=new" className="more-link">더 보기<Icon name="chevron" className="size-4" /></Link>
        </div>
        {fresh.length ? <ul className="product-grid">{fresh.map((p) => <ProductCard key={p.id} p={p} />)}</ul> : <Empty>판매 중인 상품이 없어요.</Empty>}
      </section>
      <section className="my-space-strip flex flex-wrap items-center justify-between gap-3 text-sm">
        <span><b>상품을 팔고 싶으신가요?</b> 시공 업체도 같은 계정으로 판매를 함께 할 수 있어요.</span>
        <Link href="/partners" className="btn btn-sm">판매자 입점 안내</Link>
      </section>
    </main>
  );
}
