import Link from "next/link";
import { notFound } from "next/navigation";
import CaseDetail from "@/components/CaseDetail";
import { caseTags, styleName } from "@/components/cases";
import SpaceCard from "@/components/explore/SpaceCard";
import Icon from "@/components/Icon";
import PlanSvg from "@/components/PlanSvg";
import StructureView from "@/components/StructureView";
import { currentUser } from "@/lib/auth";
import { caseLayout, splitCasePhotos } from "@/lib/case-layout";
import { HOME_TYPES } from "@/lib/home";
import { ROOM_BADGE } from "@/lib/space/home-room";
import { caseRegion, getCase, getCases, getFavoriteVendorIds, getFilesByIds, getSavedCaseIds, getVendor, getVendorCases } from "@/lib/data";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const c = getCase(Number((await params).id));
  return { title: c ? c.title : "공간" };
}

/**
 * 공간 상세. 3D 제안 예시는 같은 배치 데이터로 그린 세 화면을 차례로 보여 준다.
 *   1 눈높이 3D(맨 위 이미지) → 2 입체 배치도 → 3 치수 평면도
 * 실제 시공 사례는 사진만 보여 준다.
 */
export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const c = getCase(Number((await params).id));
  if (!c) notFound();
  const user = await currentUser();
  const canAct = !user || user.role === "customer";
  const saved = new Set(user?.role === "customer" ? getSavedCaseIds(user.id) : []);
  const favorite = user?.role === "customer" && getFavoriteVendorIds(user.id).includes(c.vendor_id);
  const vendor = getVendor(c.vendor_id)!;
  const vendorCases = getVendorCases(c.vendor_id);
  const files = getFilesByIds(c.photos);
  const named = c.photos.map((id) => ({ id, name: files.find((f) => f.id === id)?.original_name ?? "" }));
  const { eye, iso } = c.is_example ? splitCasePhotos(named) : { eye: named, iso: undefined };
  const option = caseLayout(c);
  const similar = getCases()
    .filter((o) => o.id !== c.id && ((c.style && o.style === c.style) || (c.spec.category && o.spec.category === c.spec.category)))
    .slice(0, 3);
  const rooms = c.spec.rooms ?? [];
  const area = c.area_pyeong != null ? Math.min(50, Math.max(20, Math.round(c.area_pyeong))) : 30;
  const tryQuery = new URLSearchParams({
    case: String(c.id),
    area: String(area),
    ...(c.spec.staff ? { staff: String(c.spec.staff) } : {}),
    ...(c.spec.rooms ? { ceo: rooms.includes("ceo") ? "1" : "0", meeting: rooms.includes("meeting") ? "1" : "0", pantry: rooms.includes("pantry") ? "1" : "0", storage: rooms.includes("storage") ? "1" : "0" } : {}),
    ...(c.spec.meetingSeats ? { seats: String(c.spec.meetingSeats) } : {}),
    ...(c.style ? { style: c.style } : {}),
  }).toString();
  const home = c.spec.kind === "home";
  const facts = home
    ? [
        { label: "평수", value: c.area_pyeong != null ? `${c.area_pyeong}평` : "—" },
        { label: "주거 유형", value: c.spec.homeType ? HOME_TYPES[c.spec.homeType] : "—" },
        { label: "보여 주는 곳", value: c.spec.homeRoom ? `${c.spec.homeRoom.name} 한 칸` : "—" },
        { label: "지역", value: caseRegion(c).split(" ").slice(0, 2).join(" ") || "—" },
      ]
    : [
    { label: "평수", value: c.area_pyeong != null ? `${c.area_pyeong}평` : "—" },
    { label: "인원", value: c.spec.staff ? `${c.spec.staff}명` : "—" },
    { label: "스타일", value: styleName(c.style) || "—" },
    { label: "지역", value: caseRegion(c).split(" ").slice(0, 2).join(" ") || "—" },
      ];

  return (
    <main className="page-shell detail-has-cta">
      <Link href="/cases" className="mb-3 hidden items-center gap-1 text-sm text-muted hover:text-ink md:inline-flex">
        <Icon name="back" className="size-4" />
        공간 탐색
      </Link>
      <CaseDetail
        caseId={c.id}
        title={c.title}
        category={home ? `집 · ${c.spec.homeType ? HOME_TYPES[c.spec.homeType] : "주거"} · ${ROOM_BADGE}` : c.spec.category}
        home={home}
        photos={eye.map((p) => p.id)}
        example={!!c.is_example}
        facts={facts}
        saved={saved.has(c.id)}
        favorite={!!favorite}
        vendorId={c.vendor_id}
        canAct={canAct}
        loggedIn={!!user}
        tryQuery={tryQuery}
      />

      {option && (
        <>
          <section className="view-section" data-testid="structure-3d">
            <h2>
              <span className="view-step">2</span>
              {home ? "방 한 칸 입체로 보기" : "전체 구조 보기"}
            </h2>
            <p>{home ? `${ROOM_BADGE}. 이 방에 가구가 어떻게 놓였는지 위에서 비스듬히 본 모습이에요. 집 전체 구조와 욕실·주방 설비, 다른 방은 들어 있지 않아요.` : "방과 자리가 어떻게 놓였는지 위에서 비스듬히 본 입체 배치도예요. 위의 눈높이 이미지와 같은 공간입니다."}</p>
            <StructureView option={option} styleId={c.style || "natural"} image={iso?.id ?? null} />
          </section>
          <section className="view-section" data-testid="structure-plan">
            <h2>
              <span className="view-step">3</span>
              {home ? "크기 확인" : "크기와 동선 확인"}
            </h2>
            <p>{home ? "방 크기와 가구 크기를 mm 단위로 적은 방 한 칸 평면도예요. 가구는 치수 검토용 개념 가구이며 실제 상품이 아니에요." : "방 크기와 통로를 mm 단위로 적은 치수 평면도예요. 주황 점선은 손님이 출입구에서 회의실까지 걷는 길입니다."}</p>
            <div className="overflow-x-auto rounded-2xl border border-line bg-white p-2">
              <div className="sm:min-w-[560px]">
                <PlanSvg option={option} styleId={c.style || "natural"} space={home} />
              </div>
            </div>
          </section>
        </>
      )}

      <section className="view-section grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10">
        <div>
          <h2>이 공간 이야기</h2>
          <p className="!mb-3 !text-[15px] !leading-relaxed !text-ink">{c.summary}</p>
          {option && !home && (
            <p className="mb-3 rounded-2xl bg-sand px-4 py-3 text-sm leading-relaxed">
              <b>{option.title} 배치</b> · {option.summary}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {caseTags(c).map((t) => (
              <span key={t} className="badge bg-white text-muted">
                {t}
              </span>
            ))}
          </div>
        </div>
        <Link href={`/vendors/${vendor.id}`} className="card block h-fit transition hover:border-brand">
          <p className="text-xs font-semibold text-brand">이 공간을 만든 시공사</p>
          <b className="mt-1 block text-lg">{vendor.company}</b>
          <span className="mt-0.5 block text-xs text-muted">
            {vendor.regions || "지역 미입력"} · 경력 {vendor.years}년 · 공간 {vendorCases.length}곳
          </span>
          <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand">
            시공사 둘러보기
            <Icon name="chevron" className="size-4" />
          </span>
        </Link>
      </section>

      {similar.length > 0 && (
        <section className="view-section pb-6">
          <h2>비슷한 공간</h2>
          <ul className="space-feed mt-4">
            {similar.map((o) => (
              <SpaceCard key={o.id} c={o} saved={saved.has(o.id)} canSave={canAct} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
