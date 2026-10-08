import Link from "next/link";
import { notFound } from "next/navigation";
import { CaseTile } from "@/components/cases";
import { EXAMPLE_LABEL } from "@/components/proposals";
import { FavoriteButton } from "@/components/vendor-client";
import { Empty, Page } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { getFavoriteVendorIds, getSavedCaseIds, getVendor, getVendorCases } from "@/lib/data";
import PostCard from "@/components/community/PostCard";
import ProductCard from "@/components/shop/ProductCard";
import { listPosts } from "@/lib/community";
import { searchProducts } from "@/lib/shop";
import { get } from "@/lib/db";

export default async function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  const vendor = getVendor(Number((await params).id));
  if (!vendor || vendor.status !== "approved") notFound();
  const user = await currentUser();
  const canAct = !user || user.role === "customer";
  const cases = getVendorCases(vendor.id);
  const coverCase = cases.find((c) => c.photos.length);
  const cover = coverCase?.photos[0];
  const photoCount = cases.reduce((s, c) => s + c.photos.length, 0);
  const favorite = user?.role === "customer" && getFavoriteVendorIds(user.id).includes(vendor.id);
  const saved = new Set(user?.role === "customer" ? getSavedCaseIds(user.id) : []);
  // 고객이 올린 글: 계약 확인된 시공 후기와, 작성자가 이 업체를 연결한 공간 소개를 나눠 보여 준다.
  const posts = listPosts({ vendor: String(vendor.id) }, 24);
  const reviews = posts.filter((p) => p.type === "review" && p.verified);
  const linked = posts.filter((p) => !(p.type === "review" && p.verified));
  const sellerId = get<{ id: number }>(`SELECT id FROM sellers WHERE user_id = ? AND status = 'approved'`, vendor.user_id)?.id;
  const products = sellerId ? searchProducts({ seller: String(sellerId) }, 8) : [];
  return (
    <Page>
      <Link href="/vendors" className="text-sm text-muted hover:text-ink">
        ← 설계·시공사
      </Link>
      <header className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface">
        {cover && (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- 업로드 파일 */}
            <img src={`/files/${cover}`} alt={`${vendor.company} 대표 시공 사례`} className="h-44 w-full object-cover sm:h-64" />
            {!!coverCase?.is_example && <span className="absolute bottom-2 left-2 rounded bg-black/55 px-2 py-1 text-xs text-white">{EXAMPLE_LABEL}</span>}
          </div>
        )}
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-bold tracking-tight">{vendor.company}</h1>
            <p className="mt-1 text-sm text-muted">
              {vendor.regions || "지역 미입력"} · 경력 {vendor.years}년 · 사례 {cases.length}건 · 사진 {photoCount}장
            </p>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">{vendor.intro || "소개가 아직 없습니다."}</p>
            <div className="mt-3 flex flex-wrap gap-1">
              {vendor.specialties
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
                .map((s) => (
                  <span key={s} className="badge bg-white text-muted">
                    {s}
                  </span>
                ))}
            </div>
          </div>
          {canAct && (
            <div className="sm:text-right">
              <FavoriteButton vendorId={vendor.id} initial={!!favorite} variant="full" />
              <p className="mt-2 max-w-52 text-[11px] leading-relaxed text-muted">견적 업체는 운영자가 배정합니다. 관심 업체는 배정할 때 참고합니다.</p>
            </div>
          )}
        </div>
      </header>

      <h2 className="mb-3 mt-8 text-xl font-bold tracking-tight">시공 사례 {cases.length}건</h2>
      {cases.length === 0 ? (
        <Empty>등록된 시공 사례가 없습니다.</Empty>
      ) : (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 lg:grid-cols-4">
          {cases.map((c) => (
            <CaseTile key={c.id} c={c} saved={saved.has(c.id)} canSave={canAct} />
          ))}
        </ul>
      )}

      <h2 className="mb-1 mt-10 text-xl font-bold tracking-tight">시공 후기 {reviews.length}건</h2>
      <p className="mb-3 text-xs text-muted">이 플랫폼에서 이 업체와의 계약 결과가 기록된 고객만 쓸 수 있는 후기예요.</p>
      {reviews.length === 0 ? <Empty>아직 계약 확인된 시공 후기가 없어요.</Empty> : <ul className="post-grid" data-testid="vendor-reviews">{reviews.map((p) => <PostCard key={p.id} p={p} />)}</ul>}
      {linked.length > 0 && (
        <>
          <h2 className="mb-1 mt-10 text-xl font-bold tracking-tight">고객이 연결한 공간 {linked.length}건</h2>
          <p className="mb-3 text-xs text-muted">작성자가 이 업체를 시공사로 연결한 공간 소개예요. 계약 여부는 확인되지 않았어요.</p>
          <ul className="post-grid">{linked.map((p) => <PostCard key={p.id} p={p} />)}</ul>
        </>
      )}
      {products.length > 0 && (
        <>
          <h2 className="mb-3 mt-10 text-xl font-bold tracking-tight">이 업체가 파는 상품</h2>
          <ul className="product-grid">{products.map((p) => <ProductCard key={p.id} p={p} />)}</ul>
        </>
      )}
    </Page>
  );
}
