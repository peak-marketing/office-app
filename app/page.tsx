import Link from "next/link";
import PlanSvg from "@/components/PlanSvg";
import FilterBar from "@/components/explore/FilterBar";
import SpaceCard from "@/components/explore/SpaceCard";
import Icon from "@/components/Icon";
import { currentUser, homeFor } from "@/lib/auth";
import { filterCases, filterGroups, type CaseQuery } from "@/lib/case-filter";
import { getAssignments, getCases, getQuotes, getSavedCaseIds, getVendorCards, getVersions, type Project } from "@/lib/data";
import { all } from "@/lib/db";
import { generateLayout } from "@/lib/layout/generate";
import { countsFor, nextAction } from "@/lib/next-action";
import { DEMO_PASSWORD } from "@/lib/seed";
import PostCard from "@/components/community/PostCard";
import ProductCard from "@/components/shop/ProductCard";
import { listPosts } from "@/lib/community";
import { searchProducts } from "@/lib/shop";
import type { IconName } from "@/components/Icon";

/** 메인: 공간 사진이 주인공. 검색과 필터 아래로 큰 공간 카드를 바로 보여 주고, 중간에 ‘우리 공간에 적용해보기’와 시공사로 잇는다. */
export default async function Home({ searchParams }: { searchParams: Promise<CaseQuery> }) {
  const raw = await searchParams;
  const user = await currentUser();
  const customer = user?.role === "customer" ? user : null;
  const canSave = !user || !!customer;
  const all_ = getCases();
  const current = { space: raw.space ?? "", type: raw.type ?? "", size: raw.size ?? "", style: raw.style ?? "" };
  const cases = filterCases(all_, current);
  const filtered = !!(current.space || current.type || current.size || current.style);
  const saved = new Set(customer ? getSavedCaseIds(customer.id) : []);
  const vendors = getVendorCards().slice(0, 3);
  const startHref = user ? (customer ? "/spaces/new" : homeFor(user)) : `/signup?next=${encodeURIComponent("/spaces/new")}`;
  const homeHref = user ? (customer ? "/homes/new" : homeFor(user)) : `/signup?next=${encodeURIComponent("/homes/new")}`;

  const projects = customer
    ? all<Project>(`SELECT * FROM projects WHERE customer_id = ? AND status NOT IN ('contracted','closed') ORDER BY updated_at DESC`, customer.id).map((p) => {
        const versions = getVersions(p.id);
        const cur = versions.find((v) => v.id === p.current_version_id) ?? versions[0];
        const requested = versions.find((v) => v.id === p.requested_version_id);
        const counts = countsFor(p, getQuotes(p.id), getAssignments(p.id));
        return { p, counts, next: nextAction(p, cur, requested, counts) };
      })
    : [];
  const proposals = projects.reduce((s, x) => s + x.counts.quotes, 0);
  // 2차: 커뮤니티 공간·인기 상품·바로 가기
  const todaySpaces = filtered ? [] : listPosts({ sort: "popular" }, 8);
  const hotProducts = filtered ? [] : searchProducts({ sort: "popular" }, 4);
  const quick: { href: string; label: string; icon: IconName; tone: string }[] = [
    { href: "/community", label: "공간 둘러보기", icon: "chat", tone: "#eef7fd" },
    { href: "/shop", label: "쇼핑", icon: "bag", tone: "#fff4ea" },
    { href: startHref, label: "내 공간 3D", icon: "cube", tone: "#eef8f1" },
    { href: "/request", label: "시공 견적", icon: "briefcase", tone: "#f3f0fb" },
    { href: "/vendors", label: "시공사 찾기", icon: "user", tone: "#f4f6f8" },
    { href: "/shop/search?three=1", label: "내 방에 놓아 보기", icon: "sofa", tone: "#fff7e8" },
    { href: "/spaces/address", label: "주소로 도면 찾기", icon: "pin", tone: "#eef7fd" },
    { href: "/community/new", label: "내 공간 자랑", icon: "camera", tone: "#fdf0f2" },
  ];
  const sample = generateLayout({ areaPyeong: 30, staff: 8, ceo: true, meeting: true, meetingSeats: 6, pantry: true, storage: false, entrance: "right", shape: "rect", pillars: 0, furnitureIncluded: true });

  const applyBanner = (
    <li className="feed-insert" key="apply">
      <section className="apply-banner" aria-label="우리 공간에 적용해보기">
        <div>
          <h2>마음에 든 분위기,<br />우리 공간에 적용해보기</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">평수와 인원, 필요한 방만 넣으면 우리 공간에 맞는 배치를 바로 그려 드려요. 손님맞이·협업·집중 중 어떤 배치가 맞는지도 비교할 수 있어요.</p>
          <Link href="/try" className="btn btn-primary mt-5">
            우리 공간에 적용해보기
            <Icon name="arrow" className="size-4" />
          </Link>
        </div>
        <ul className="grid grid-cols-3 gap-2">
          {sample.options.map((o) => (
            <li key={o.id} className="overflow-hidden rounded-xl border border-line bg-white">
              <PlanSvg option={o} styleId="natural" thumb />
              <p className="border-t border-line px-1 py-2 text-center text-[11px] font-semibold sm:text-xs">{o.title}</p>
            </li>
          ))}
        </ul>
      </section>
    </li>
  );
  const vendorStrip = vendors.length > 0 && (
    <li className="feed-insert" key="vendors">
      <section aria-label="시공사 둘러보기">
        <div className="section-heading">
          <div>
            <h2>이런 공간을 만드는 시공사</h2>
            <p>사례와 전문 분야를 보고 마음에 드는 곳을 관심 업체로 담아 두세요.</p>
          </div>
          <Link href="/vendors" className="more-link">
            시공사 둘러보기
            <Icon name="chevron" className="size-4" />
          </Link>
        </div>
        <ul className="vendor-strip">
          {vendors.map((v) => (
            <li key={v.id}>
              <Link href={`/vendors/${v.id}`} className="flex h-full items-center gap-4 rounded-2xl border border-line bg-white p-4 transition hover:border-brand">
                {v.photos[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 업로드 파일
                  <img src={`/files/${v.photos[0].id}`} alt="" loading="lazy" className="size-[72px] shrink-0 rounded-xl object-cover" />
                ) : (
                  <span className="grid size-[72px] shrink-0 place-items-center rounded-xl bg-sand">
                    <Icon name="user" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <b className="block truncate">{v.company}</b>
                  <span className="mt-1 block truncate text-xs text-muted">{v.regions || "지역 미입력"}</span>
                  <span className="mt-2 inline-block rounded-md bg-sand px-2 py-1 text-[11px]">공간 {v.cases}곳</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </li>
  );
  const feed: React.ReactNode[] = cases.map((c, i) => <SpaceCard key={c.id} c={c} saved={saved.has(c.id)} canSave={canSave} priority={i < 2} />);
  // 3열·2열·1열 어느 화면에서도 줄이 꽉 찬 뒤에 끼워 넣도록 6장 단위로 둔다.
  if (!filtered && feed.length > 6) feed.splice(6, 0, applyBanner);
  if (!filtered && feed.length > 13 && vendorStrip) feed.splice(13, 0, vendorStrip);

  return (
    <main className="min-w-0 flex-1">
      <div className="discovery-wrap">
        <form action="/search" className="home-search" role="search">
          <Icon name="search" className="size-5 shrink-0 text-muted" />
          <input name="q" placeholder="공간, 상품, 시공사를 찾아보세요" aria-label="통합 검색" />
          <button type="submit">검색</button>
        </form>
        {!filtered && (
          <nav className="quick-grid" aria-label="바로 가기" data-testid="quick-actions">
            {quick.map((x) => (
              <Link key={x.label} href={x.href}>
                <span className="quick-icon" style={{ background: x.tone }}><Icon name={x.icon} className="size-6 text-brand" /></span>
                {x.label}
              </Link>
            ))}
          </nav>
        )}

        {customer && (projects.length > 0 || saved.size > 0) && (
          <Link href={proposals ? "/projects" : "/saved"} className="mt-3 flex items-center gap-3 rounded-2xl border border-[#cfe6f5] bg-[#f5fbff] px-4 py-3 text-sm" data-testid="my-status">
            <span className="min-w-0 flex-1">
              <b>{customer.name}님</b>
              <span className="text-muted">
                {" "}
                · 진행 중인 요청 {projects.length} · 도착한 제안 <b className="text-brand">{proposals}</b> · 저장한 공간 {saved.size}
              </span>
            </span>
            <Icon name="chevron" className="size-4 shrink-0" />
          </Link>
        )}

        {!filtered && (
          <section className="discovery-section" data-testid="today-spaces">
            <div className="section-heading">
              <div>
                <h2>오늘의 공간</h2>
                <p>고객이 직접 올린 공간 소개와 계약이 확인된 시공 후기예요.</p>
              </div>
              <Link href="/community" className="more-link">커뮤니티<Icon name="chevron" className="size-4" /></Link>
            </div>
            {todaySpaces.length ? (
              <ul className="post-grid">{todaySpaces.map((p) => <PostCard key={p.id} p={p} />)}</ul>
            ) : (
              <Link href="/community/new" className="flex items-center justify-between gap-3 rounded-2xl bg-sand p-5 text-sm">
                <span>아직 올라온 공간이 없어요. 내 공간을 처음으로 소개해 보세요.</span>
                <span className="btn btn-sm">글쓰기</span>
              </Link>
            )}
          </section>
        )}
        {!filtered && (
          <section className="layout-promo" data-testid="space3d-promo">
            <div>
              <p className="eyebrow">내 공간 3D</p>
              <h2 className="mt-2">도면이나 실측 치수로<br />내 공간을 만들어 보세요</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">만든 공간에 가구와 실제 상품을 실제 크기로 놓아 보고, 그대로 시공 견적을 요청할 수 있어요. 도면이 없으면 주소로 받을 수 있는 자료를 안내해 드려요.</p>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {[
                { href: user ? (customer ? "/homes/new" : homeFor(user)) : `/signup?next=${encodeURIComponent("/homes/new")}`, t: "집", d: "방 한 칸 배치부터 내부 벽·방문·방 구분까지" },
                { href: startHref, t: "사무실", d: "치수·도면으로 공간을 만들고 자동 배치 비교" },
                { href: "/shop/search?three=1", t: "실제 상품 놓아 보기", d: "규격·3D 모델이 있는 상품을 내 공간에" },
                { href: "/spaces/address", t: "주소로 도면 찾기", d: "건축물대장 정보와 도면 받는 방법 안내" },
              ].map((x) => (
                <li key={x.t}>
                  <Link href={x.href} className="block h-full rounded-2xl border border-line bg-white p-4 hover:border-brand">
                    <b className="text-sm">{x.t}</b>
                    <span className="mt-1 block text-xs leading-relaxed text-muted">{x.d}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {hotProducts.length > 0 && (
          <section className="discovery-section" data-testid="home-products">
            <div className="section-heading">
              <div><h2>많이 찾는 상품</h2><p>규격이 있는 상품은 내 공간에 실제 크기로 놓아 볼 수 있어요.</p></div>
              <Link href="/shop" className="more-link">쇼핑<Icon name="chevron" className="size-4" /></Link>
            </div>
            <ul className="product-grid">{hotProducts.map((p) => <ProductCard key={p.id} p={p} />)}</ul>
          </section>
        )}
        <FilterBar basePath="/" groups={filterGroups(all_)} current={current} />

        <div className="explore-head">
          <h1>{filtered ? `조건에 맞는 공간 ${cases.length}곳` : "이런 공간 어때요?"}</h1>
          <p>시공사가 올린 사무실과 집(원룸·오피스텔·빌라·아파트) 사례예요. 마음에 드는 공간을 저장해 두면 시공 제안을 요청할 때 함께 보낼 수 있어요.</p>
        </div>

        {cases.length === 0 ? (
          <div className="mt-4 rounded-2xl bg-sand p-10 text-center text-sm leading-relaxed text-muted">
            {all_.length === 0 ? "공간 사례를 준비하고 있어요. 사례가 없어도 공간 정보만으로 시공 제안을 받을 수 있어요." : "조건에 맞는 공간이 없어요. 필터를 바꿔 보세요."}
            <div className="mt-4">
              <Link href={all_.length === 0 ? startHref : "/"} className="btn btn-primary">
                {all_.length === 0 ? "시공 제안 받기" : "전체 공간 보기"}
              </Link>
            </div>
          </div>
        ) : (
          <ul className="space-feed mt-4" data-testid="home-cases">
            {feed}
          </ul>
        )}

        <section className="my-12 flex flex-wrap items-center justify-between gap-5 rounded-2xl bg-brand-soft px-6 py-6">
          <div>
            <h2 className="text-lg font-bold">원하는 분위기를 찾으셨나요?</h2>
            <p className="mt-1 text-sm text-muted">저장한 공간과 우리 공간 정보로 여러 시공사의 제안을 받아보세요. 원룸·오피스텔·빌라·아파트 같은 집도 상담받을 수 있어요.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={startHref} className="btn btn-primary">
              {!user || customer ? "시공 제안 받기" : "내 화면으로 가기"}
              <Icon name="arrow" className="size-4" />
            </Link>
            {(!user || customer) && (
              <Link href={homeHref} className="btn" data-testid="home-start">
                집 상담 신청
              </Link>
            )}
          </div>
        </section>
        {process.env.NODE_ENV !== "production" && (
          <details className="mb-8 text-xs text-muted">
            <summary className="cursor-pointer py-2">시연용 계정 안내</summary>
            <p className="pb-3 leading-relaxed">
              비밀번호 {DEMO_PASSWORD} · 고객 customer@demo.kr · 시공사 vendor1@demo.kr(판매도 함) · 판매자 seller@demo.kr · 운영자 admin@demo.kr
            </p>
          </details>
        )}
      </div>
    </main>
  );
}
