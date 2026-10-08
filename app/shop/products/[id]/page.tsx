import Link from "next/link";
import { notFound } from "next/navigation";
import BuyBox from "@/components/shop/BuyBox";
import ProductCard from "@/components/shop/ProductCard";
import ScrapButton from "@/components/shop/ScrapButton";
import { Badge, Notice } from "@/components/ui";
import ReportButton from "@/components/community/ReportButton";
import { currentUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { bizNoText, getSeller } from "@/lib/partner";
import { categoryLabel, dimsText, discountRate, getVisibleProduct, isScrapped, productDims, productImages, productSkus, searchProducts, shipPolicyText } from "@/lib/shop";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const p = getVisibleProduct(Number((await params).id));
  return { title: p?.title ?? "상품" };
}

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ project?: string }> }) {
  const product = getVisibleProduct(Number((await params).id));
  if (!product) notFound();
  const user = await currentUser();
  const project = Number((await searchParams).project) || undefined;
  const seller = getSeller(product.seller_id)!;
  const images = productImages(product.id);
  const skus = productSkus(product.id);
  const dims = productDims(product);
  const sizeOptions = skus.filter((s) => s.width_mm && s.depth_mm && s.height_mm);
  const rate = discountRate(product);
  const posts = all<{ id: number; title: string; cover: number | null }>(
    `SELECT DISTINCT p.id, p.title, (SELECT file_id FROM post_photos f WHERE f.post_id = p.id ORDER BY position LIMIT 1) AS cover
     FROM post_tags t JOIN post_photos ph ON ph.id = t.photo_id JOIN posts p ON p.id = ph.post_id WHERE t.product_id = ? AND p.status = 'published' ORDER BY p.id DESC LIMIT 6`,
    product.id,
  );
  const more = searchProducts({ seller: String(product.seller_id) }, 9).filter((p) => p.id !== product.id).slice(0, 4);
  return (
    <main className="page-shell has-buy-bar">
      <nav className="mb-3 text-xs text-muted"><Link href="/shop">쇼핑</Link> › <Link href={`/shop/search?cat=${product.category}`}>{categoryLabel(product.category)}</Link></nav>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section>
          <ul className="space-gallery" aria-label="상품 사진">
            {images.length ? images.map((id, i) => (
              <li key={id}><img src={`/files/${id}`} alt={`${product.title} 사진 ${i + 1}`} className="!aspect-square" /></li>
            )) : <li className="grid aspect-square place-items-center text-sm text-muted">사진 없음</li>}
          </ul>
          {images.length > 1 && <p className="mt-2 text-center text-xs text-muted">사진 {images.length}장 · 옆으로 넘겨 보세요</p>}
        </section>
        <section className="detail-panel space-y-4">
          <div>
            <Link href={`/shop/search?seller=${seller.id}`} className="text-sm text-muted underline-offset-2 hover:underline">{product.brand || seller.name}</Link>
            <h1 className="detail-title mt-1">{product.title}</h1>
            {product.is_example ? <p className="mt-2"><Badge tone="warn">예시 상품 · 실제 판매 아님(시연용)</Badge></p> : null}
            <div className="mt-3 flex items-baseline gap-2">
              {rate > 0 && <b className="text-2xl text-brand">{rate}%</b>}
              <b className="text-2xl tabular-nums">{product.min_price.toLocaleString()}원</b>
              {product.list_price && rate > 0 && <s className="text-sm text-muted tabular-nums">{product.list_price.toLocaleString()}원</s>}
            </div>
            <p className="mt-2 text-sm text-muted">{shipPolicyText(seller)} · 판매자 {seller.name}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ScrapButton target="product" id={product.id} initial={isScrapped(user?.id, "product", product.id)} count={product.scraps} />
            {dims && (
              <Link href={`/place/${product.id}${project ? `?project=${project}` : ""}`} className="btn btn-sm border-brand/40 text-brand" data-testid="place-product">
                내 공간에 놓아 보기
              </Link>
            )}
          </div>
          <div className="card">
            <BuyBox productId={product.id} price={product.price} option1={product.option1_name} option2={product.option2_name} skus={skus.map((s) => ({ id: s.id, opt1: s.opt1, opt2: s.opt2, add_price: s.add_price, stock: s.stock }))} project={project} canBuy={!user || user.role === "customer"} />
          </div>
        </section>
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="space-y-8">
          <section>
            <h2 className="text-lg font-bold">규격과 3D</h2>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[120px_minmax(0,1fr)]">
              <dt className="text-muted">규격</dt>
              <dd data-testid="dims">{dimsText(dims)}</dd>
              {sizeOptions.length > 0 && (
                <>
                  <dt className="text-muted">옵션별 규격</dt>
                  <dd>{sizeOptions.map((s) => `${[s.opt1, s.opt2].filter(Boolean).join(" / ")}: ${s.width_mm}×${s.depth_mm}×${s.height_mm}mm`).join(" · ")}</dd>
                </>
              )}
              <dt className="text-muted">내 공간에 놓기</dt>
              <dd>{dims ? (product.model_file_id ? "판매자가 올린 3D 모델로 실제 크기에 맞춰 보여요." : "3D 모델이 없어 같은 크기의 상자로 보여요.") : "규격이 없어 내 공간에 놓을 수 없어요. 사진으로 확인해 주세요."}</dd>
            </dl>
            <p className="mt-2 text-xs text-muted">규격은 판매자가 입력한 값이에요. 실제 배치 전 현장 치수를 확인해 주세요.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold">상품 설명</h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">{product.description || "판매자가 설명을 입력하지 않았어요."}</p>
          </section>
          {posts.length > 0 && (
            <section>
              <h2 className="text-lg font-bold">이 상품이 쓰인 공간</h2>
              <ul className="mt-3 grid grid-cols-3 gap-2">
                {posts.map((p) => (
                  <li key={p.id}><Link href={`/community/${p.id}`} className="block overflow-hidden rounded-xl bg-sand">{p.cover && <img src={`/files/${p.cover}`} alt={p.title} className="aspect-square w-full object-cover" />}</Link></li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <aside className="space-y-4 text-sm">
          <section className="card">
            <h2 className="h-section">배송·교환·반품</h2>
            <ul className="space-y-1.5 leading-relaxed text-muted">
              <li>{shipPolicyText(seller)}{seller.courier && ` · ${seller.courier}`}</li>
              <li>반품 배송비 편도 {seller.return_fee.toLocaleString()}원(단순 변심, 무료 배송이었다면 왕복)</li>
              <li>발송 전에는 주문 내역에서 바로 취소할 수 있어요. 받은 뒤에는 구매 확정 전까지 반품을 신청할 수 있어요.</li>
              <li>상품 불량·오배송은 판매자가 반품 배송비를 부담해요.</li>
            </ul>
          </section>
          <section className="card" data-testid="seller-info">
            <h2 className="h-section">판매자 정보</h2>
            <dl className="grid grid-cols-[100px_minmax(0,1fr)] gap-y-1.5 text-muted">
              <dt>상호</dt><dd className="text-ink">{seller.name}</dd>
              <dt>대표자</dt><dd>{seller.ceo || "—"}</dd>
              <dt>사업자번호</dt><dd>{seller.biz_no ? bizNoText(seller.biz_no) : "—"}</dd>
              <dt>통신판매업</dt><dd>{seller.mail_order_no || "—"}</dd>
              <dt>사업장</dt><dd>{seller.biz_address || "—"}</dd>
              <dt>고객센터</dt><dd>{[seller.cs_phone, seller.cs_email].filter(Boolean).join(" · ") || "—"}</dd>
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-muted">이 상품의 판매자는 {seller.name}이며, 플랫폼은 통신판매중개자로서 거래 당사자가 아닙니다.</p>
          </section>
          {user?.role === "customer" && <ReportButton target="product" id={product.id} />}
        </aside>
      </div>
      {!product.stock && <div className="mt-6"><Notice tone="warn">모든 옵션이 품절이에요.</Notice></div>}
      {more.length > 0 && (
        <section className="discovery-section">
          <div className="section-heading"><div><h2>{seller.name}의 다른 상품</h2></div></div>
          <ul className="product-grid">{more.map((p) => <ProductCard key={p.id} p={p} />)}</ul>
        </section>
      )}
    </main>
  );
}
