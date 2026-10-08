import Link from "next/link";
import { styleName } from "@/components/cases";
import { EXAMPLE_LABEL } from "@/components/proposals";
import { FavoriteButton } from "@/components/vendor-client";
import { Empty, Page } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { getFavoriteVendorIds, getVendorCards } from "@/lib/data";

export const metadata = { title: "설계·시공사" };

type Query = { q?: string; fav?: string };

export default async function Vendors({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const user = await currentUser();
  const canFavorite = !user || user.role === "customer";
  const favorites = new Set(user?.role === "customer" ? getFavoriteVendorIds(user.id) : []);
  const q = (query.q ?? "").trim();
  const onlyFav = query.fav === "1" && favorites.size > 0;
  const vendors = getVendorCards().filter((v) => (!q || `${v.company} ${v.regions} ${v.specialties}`.includes(q)) && (!onlyFav || favorites.has(v.id)));
  const chip = (active: boolean) => `badge cursor-pointer px-3 py-1.5 ${active ? "border-ink bg-ink text-white" : "bg-white text-muted hover:text-ink"}`;

  return (
    <Page>
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">설계·시공사</h1>
        <p className="mt-1.5 text-sm text-muted">운영자가 확인한 시공사입니다. 관심 업체로 담아 두면 운영자가 시공사를 배정할 때 참고합니다.</p>
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <form action="/vendors" className="flex flex-1 gap-2">
          <input className="input max-w-sm" name="q" defaultValue={q} placeholder="지역이나 업체명 (예: 서울, 경기 남부)" aria-label="지역 또는 업체명 검색" />
          <button className="btn shrink-0">검색</button>
        </form>
        {favorites.size > 0 && (
          <Link href={onlyFav ? "/vendors" : "/vendors?fav=1"} className={chip(onlyFav)}>
            ♥ 관심 업체 {favorites.size}
          </Link>
        )}
        <Link href="/cases" className={chip(false)}>
          사례로 보기
        </Link>
      </div>

      {vendors.length === 0 ? (
        <Empty>조건에 맞는 업체가 없습니다.</Empty>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vendors.map((v) => (
            <li key={v.id} className="relative overflow-hidden rounded-2xl border border-line bg-surface transition hover:border-brand" data-vendor={v.id}>
              <Link href={`/vendors/${v.id}`} className="block">
                <span className="grid grid-cols-3 gap-0.5 bg-line">
                  {v.photos[0] ? (
                    <span className="relative col-span-3 block">
                      {/* eslint-disable-next-line @next/next/no-img-element -- 업로드 파일 */}
                      <img src={`/files/${v.photos[0].id}`} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover" />
                      {v.photos[0].example && <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">{EXAMPLE_LABEL}</span>}
                    </span>
                  ) : (
                    <span className="col-span-3 grid aspect-[16/9] place-items-center bg-sand text-xs text-muted">등록된 사진이 없습니다</span>
                  )}
                  {v.photos.slice(1, 4).map((p) => (
                    // eslint-disable-next-line @next/next/no-img-element -- 업로드 파일
                    <img key={p.id} src={`/files/${p.id}`} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
                  ))}
                </span>
                <span className="block p-4">
                  <b className="block">{v.company}</b>
                  <span className="mt-1 block text-xs text-muted">
                    {v.regions || "지역 미입력"} · 경력 {v.years}년 · 사례 {v.cases}건
                  </span>
                  <span className="mt-2 line-clamp-2 block text-sm leading-relaxed text-muted">{v.intro}</span>
                  <span className="mt-3 flex flex-wrap gap-1">
                    {[...v.styles.map(styleName), ...v.specialties.split(",").map((s) => s.trim())]
                      .filter(Boolean)
                      .slice(0, 5)
                      .map((s) => (
                        <span key={s} className="badge bg-white text-muted">
                          {s}
                        </span>
                      ))}
                  </span>
                </span>
              </Link>
              {canFavorite && (
                <span className="absolute right-2 top-2">
                  <FavoriteButton key={`${v.id}-${favorites.has(v.id)}`} vendorId={v.id} initial={favorites.has(v.id)} />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
