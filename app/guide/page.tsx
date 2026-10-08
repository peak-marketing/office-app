import Link from "next/link";
import { CoverageTable } from "@/components/project";
import { ProposalCard, StatusLegend } from "@/components/proposals";
import { Page } from "@/components/ui";
import { currentUser, homeFor } from "@/lib/auth";
import { EXAMPLE_QUOTES, exampleItems } from "@/lib/example-quotes";
import { inputCoverage } from "@/lib/layout/coverage";
import { generateLayout } from "@/lib/layout/generate";
import type { LayoutInput } from "@/lib/layout/types";
import { compareQuotes } from "@/lib/quotes";

export const metadata = { title: "이용 방법" };

const FLOW: [string, string, string][] = [
  ["고객", "사례를 둘러보고 저장", "평수·스타일·지역으로 사례를 찾고, 마음에 드는 공간을 책갈피로 저장합니다. 시공사는 하트로 관심 업체에 담습니다."],
  ["고객", "내 공간 정보 입력", "사례 상세의 ‘이런 공간으로 제안받기’에서 시작하면 그 사례가 요청서에 연결됩니다. 평수, 인원, 필요한 방, 예산, 사진을 단계별로 입력합니다."],
  ["고객", "배치와 스타일 선택", "같은 조건에서 목적이 다른 배치를 비교해 고르고, 스타일(내추럴·시크·러블리)은 따로 고릅니다. 이 선택이 요청의 기준 자료가 됩니다."],
  ["운영자", "검토·시공사 배정", "자료를 확인하고 지역과 조건에 맞는 시공사를 배정합니다. 관심 업체와 참고 사례의 시공사를 참고합니다."],
  ["시공사", "견적·제안 제출", "같은 도면과 참고 사례를 보고 13개 공사 항목으로 견적과 시공 제안을 냅니다."],
  ["고객", "비교·상담·현장 방문", "제안을 나란히 비교하고 마음에 드는 곳에만 현장 방문을 요청합니다. 계약과 대금은 시공사와 직접 진행합니다."],
];

const FAQ: [string, string][] = [
  ["시공사를 직접 고를 수 있나요?", "운영자가 자료를 검토해 여러 시공사를 선정합니다. 관심 업체로 담아 둔 곳과 참고 사례의 시공사는 선정할 때 참고합니다. 운영자가 선정한 여러 업체가 비공개로 가격·설계·자재·기간을 제안하고, 고객이 비교해 선택합니다. 최저가 자동 낙찰은 하지 않습니다."],
  ["내 주소와 연락처는 누구에게 보이나요?", "시공사에는 지역(시·구), 공간 조건, 배치안, 사진·도면, 참고 사례만 공유됩니다. 상세 주소와 연락처는 현장 방문을 요청한 시공사에만 공개됩니다."],
  ["사례 저장과 관심 업체는 무엇이 다른가요?", "사례 저장은 ‘이런 분위기를 원한다’는 참고 자료로 요청서에 연결하는 것이고, 관심 업체는 ‘이 시공사의 제안을 받고 싶다’는 뜻으로 운영자에게 전달됩니다. 따로 관리됩니다."],
  ["배치안 그대로 시공하나요?", "아닙니다. 배치안은 현장 실측과 설비·법규 검토 전의 상담용 개념안입니다. 시공사가 실측한 뒤 도면을 다시 그립니다."],
  ["도면을 바꾸면 받은 견적은 어떻게 되나요?", "견적은 요청한 도면 버전에 묶입니다. 조건이나 배치를 바꾸면 새 버전이 만들어지고, 새 버전으로 다시 요청해야 같은 선에서 비교할 수 있습니다. 이전 견적은 그대로 남습니다."],
];

const SAMPLE: LayoutInput = { areaPyeong: 30, staff: 8, ceo: true, meeting: true, meetingSeats: 6, pantry: true, storage: false, entrance: "right", shape: "rect", pillars: 0, furnitureIncluded: true, windowWall: "unknown", priority: "visitor", siteNotes: "창문은 안쪽 벽 3개, 기둥 없음", reuseFurniture: "책상 6개" };

export default async function Guide() {
  const user = await currentUser();
  const startHref = user ? (user.role === "customer" ? "/spaces/new" : homeFor(user)) : `/signup?next=${encodeURIComponent("/spaces/new")}`;
  const cmp = compareQuotes(EXAMPLE_QUOTES.map((q, i) => ({ id: i + 1, items: exampleItems(q), vat_included: q.vat, duration_days: q.days, start_available: q.start, extra_conditions: q.extra, note: q.note })));
  const names = ["시공사 A", "시공사 B"];
  const coverage = inputCoverage(SAMPLE, generateLayout(SAMPLE), { files: 3, refs: 1 });
  return (
    <Page>
      <header className="max-w-3xl pb-2 pt-2">
        <p className="eyebrow">이용 방법</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">사례에서 시작해 시공사 제안 비교까지</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          마음에 드는 사례를 찾아 저장하고, 내 공간 정보를 넣어 배치를 고른 뒤, 그 배치와 참고 사례를 기준으로 여러 시공사의 견적과 제안을 비교하는 서비스입니다. 사무실은 20~50평 자동 배치를 지원하고, 집(원룸·오피스텔·빌라·아파트)은 상담 신청과 방 한 칸 가구 배치를 지원합니다.
        </p>
      </header>

      <section className="section !pb-8" id="home">
        <h2 className="section-title">집 인테리어</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="card text-sm leading-relaxed">
            <h3 className="font-semibold">할 수 있는 것</h3>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted">
              <li>원룸·오피스텔·빌라·아파트 상담 신청. 주거 유형·지역·공사 범위만 있으면 되고, 도면·치수·사진은 선택이에요.</li>
              <li>주거용 공사 항목 14개로 여러 업체의 비공개 제안을 같은 기준에서 비교해요.</li>
              <li>치수를 아는 방 한 칸에 문·창·고정 구조물을 넣고 개념 가구를 직접 놓아 3D로 봐요(요청 하나에 최대 5개).</li>
              <li>집 전체 평면: 도면 이미지나 실측 치수로 바깥 벽을 만들고 내부 벽·방문·창을 넣으면 벽으로 나뉜 곳을 방으로 구분해요. 방 이름·면적(추정)을 붙이고 개념 가구를 놓아 평면과 3D로 봐요. 고객이 입력한 평면이며 실측 도면이 아니에요.</li>
            </ul>
          </div>
          <div className="card text-sm leading-relaxed">
            <h3 className="font-semibold">아직 하지 않는 것</h3>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted">
              <li>도면 자동 인식과 아파트 평형 도면 템플릿. 평면은 고객이 도면을 직접 따라 그리거나 치수로 넣어요. 사선·곡선 벽은 아직 그리지 않아요.</li>
              <li>욕실·주방 설비 3D와 급배수·전기 연결 판단, 발코니 확장 등 법규 판정</li>
              <li>집 자동 배치(이번 범위 제외 · 후속 검토). 지금은 가구를 직접 놓아요.</li>
            </ul>
          </div>
        </div>
        <Link href={user ? (user.role === "customer" ? "/homes/new" : homeFor(user)) : `/signup?next=${encodeURIComponent("/homes/new")}`} className="btn btn-primary mt-4" data-testid="guide-home-start">
          집 상담 신청
        </Link>
      </section>

      <section className="section !pb-8">
        <h2 className="section-title">진행 순서</h2>
        <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FLOW.map(([who, title, body], i) => (
            <li key={title} className="card">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold tabular-nums text-line">0{i + 1}</span>
                <span className={`badge ${who === "고객" ? "border-brand/30 bg-brand-soft text-brand" : who === "시공사" ? "border-clay/30 bg-warn-soft text-clay" : "bg-white text-muted"}`}>{who}</span>
              </div>
              <h3 className="mt-3 text-sm font-semibold">{title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section border-t border-line !pb-8 scroll-mt-24" id="measure">
        <h2 className="section-title">내 공간 치수 재는 법</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">줄자나 레이저 거리계로 아래만 재면 ‘내 공간 만들기’에서 실제 공간을 3D로 만들 수 있어요. 도면이 있으면 도면에 적힌 실내 치수를 옮겨 적으면 됩니다.</p>
        <ol className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["출입문 벽 길이(가로)", "출입문이 있는 벽의 실내 쪽 끝에서 끝까지. 벽 몰딩이나 걸레받이 위가 아닌 벽면 사이로 재요."],
            ["안쪽까지 거리(세로)", "출입문 벽에서 맞은편 벽까지. 가운데와 양쪽 끝 두세 곳을 재서 다르면 가장 짧은 값을 넣어요."],
            ["출입문 위치와 폭", "가까운 쪽 모서리에서 문틀 가장자리까지, 그리고 문틀 안쪽 폭."],
            ["창 위치", "창이 있는 벽마다, 그 벽 시작 모서리에서 창 가장자리까지와 창 폭. 모르면 ‘잘 모름’으로 두면 창을 가정하지 않아요."],
            ["기둥", "왼쪽 벽과 출입문 벽에서 기둥 모서리까지 거리, 그리고 기둥 가로·세로."],
            ["대조용 전용면적", "계약서나 건축물대장의 전용면적(평)을 넣으면 잰 치수와 크게 다를 때 알려 드려요."],
          ].map(([title, body]) => (
            <li key={title} className="card">
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section border-t border-line !pb-8">
        <h2 className="section-title">배치 제안은 이렇게 만듭니다</h2>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div className="space-y-3 text-sm leading-relaxed">
            <p>
              같은 조건으로 설계 목적이 다른 세 가지 골격을 시도합니다. 골격마다 <b>방 위치, 좌석 구성, 통로</b>가 다릅니다. 색상만 다른 결과를 다른 배치안으로 보여 주지 않으며, 스타일은 배치와 따로 고릅니다.
            </p>
            <ul className="space-y-2">
              <li className="rounded-xl border border-line bg-surface p-3">
                <b>방문객 응대 중심</b>
                <span className="mt-0.5 block text-xs text-muted">출입구 옆 전면에 회의실·대표실과 대기 공간. 직원석은 통로 건너 안쪽 창가.</span>
              </li>
              <li className="rounded-xl border border-line bg-surface p-3">
                <b>직원 협업 중심</b>
                <span className="mt-0.5 block text-xs text-muted">개별실을 안쪽 벽에 모으고, 가운데에 스크린 없는 팀 묶음과 스탠딩 협업 테이블.</span>
              </li>
              <li className="rounded-xl border border-line bg-surface p-3">
                <b>집중 업무 중심</b>
                <span className="mt-0.5 block text-xs text-muted">회의실·탕비실을 출입구 쪽 벽에 세로로 모으고, 직원석은 칸막이를 세워 모두 한 방향.</span>
              </li>
            </ul>
            <p className="text-xs text-muted">
              어떤 골격이든 요청한 좌석 수와 방을 모두 넣을 수 있을 때만 배치안으로 보여 줍니다. 들어가지 않는 골격은 만들지 않고 이유를 알려 드립니다. 그래서 배치안이 한두 개만 나올 수도 있습니다. 하나도 나오지 않으면 억지로 그리지 않고 운영자 검토로 넘깁니다.
            </p>
          </div>
          <div className="card h-fit">
            <h3 className="h-section">입력한 정보가 쓰이는 방식 (예시)</h3>
            <CoverageTable rows={coverage} />
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface p-4 text-sm">
            <b>자동 배치가 되는 공간</b>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-muted marker:text-line">
              <li>20~50평, 직사각형, 가로·세로 비율 2.2:1 이하</li>
              <li>출입구가 전면 벽의 왼쪽이나 오른쪽</li>
              <li>실내 기둥 없음</li>
              <li>대표실·회의실 각 1개 이하, 회의실 4~12인</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-4 text-sm">
            <b>상담·검토로 이어지는 공간</b>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-muted marker:text-line">
              <li>ㄱ자·다각형, 기둥이 있는 공간, 20평 미만·50평 초과</li>
              <li>출입구가 가운데나 옆 벽에 있는 공간</li>
              <li>면적에 비해 좌석이나 방이 많은 조건</li>
              <li>그대로 접수하면 운영자가 사진과 도면을 보고 검토합니다.</li>
            </ul>
          </div>
        </div>
        <Link href="/try" className="btn mt-5">
          내 공간 배치 보기
        </Link>
      </section>

      <section className="section border-t border-line !pb-8">
        <h2 className="section-title">견적은 금액만이 아니라 범위까지 비교합니다</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          합계가 낮아 보여도 빠진 공사가 있으면 실제 비용은 달라집니다. 그래서 현재 산정 금액, 별도 비용, 금액이 아직 없는 항목, 공사 범위에 없는 항목을 나눠 보여 줍니다. 범위가 다르거나 금액 미정 항목이 있는 제안에는 ‘최저’를 붙이지 않습니다.
        </p>
        <p className="mt-4 inline-block rounded-full border border-line bg-white px-3 py-1 text-xs text-muted">아래는 화면 설명용 예시 데이터입니다. 실제 업체의 견적이 아닙니다.</p>
        <ul className="mt-4 grid gap-4 md:grid-cols-2">
          {cmp.cols.map((col, i) => (
            <ProposalCard key={col.q.id} col={col} cmp={cmp} vendor={{ id: 0, company: `${names[i]} (예시)`, years: 0, caseCount: 0, photos: [] }} linkVendor={false} hideVendorMeta />
          ))}
        </ul>
        <div className="mt-4">
          <StatusLegend />
        </div>
      </section>

      <section className="section border-t border-line !pb-8">
        <h2 className="section-title">자주 묻는 질문</h2>
        <dl className="mt-5 divide-y divide-line border-y border-line">
          {FAQ.map(([q, a]) => (
            <div key={q} className="grid gap-1 py-4 sm:grid-cols-[18rem_minmax(0,1fr)] sm:gap-6">
              <dt className="text-sm font-semibold">{q}</dt>
              <dd className="text-sm leading-relaxed text-muted">{a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-2xl bg-ink p-6 text-white sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight">사례부터 둘러보거나, 바로 요청을 등록하세요</h2>
            <p className="mt-1.5 text-sm text-white/70">설계·시공사라면 파트너로 입점해 조건이 정리된 요청을 받아 보세요.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/cases" className="btn border-white bg-white text-ink hover:bg-sand">
              사례 둘러보기
            </Link>
            <Link href={startHref} className="btn border-white/40 bg-transparent text-white hover:bg-white/10">
              견적·제안 받기
            </Link>
            <Link href="/partners" className="btn border-white/40 bg-transparent text-white hover:bg-white/10">
              파트너 입점
            </Link>
          </div>
        </div>
      </section>
    </Page>
  );
}
