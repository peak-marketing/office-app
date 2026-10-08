import Link from "next/link";
import { redirect } from "next/navigation";
import PlanSvg from "@/components/PlanSvg";
import { Badge, Empty, Notice, Page, PageTitle, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { dateKo, isPast, kst, won } from "@/lib/constants";
import { getProject, getQuoteByAssignment, getQuoteDraft, getVendorByUser, getVersion, type Assignment } from "@/lib/data";
import { all } from "@/lib/db";
import { compareQuotes } from "@/lib/quotes";
import { versionOption } from "@/lib/space/view";
import { homeFacts, requestFacts } from "@/lib/request-facts";
import { latestRevision, projectAsSent } from "@/lib/request-snapshot";
import { openRequestsFor } from "@/lib/bidding";

export default async function VendorHome() {
  const user = await requireUser("vendor");
  const vendor = getVendorByUser(user.id);
  if (!vendor) redirect("/partner");
  const rows = all<Assignment & { visit: string | null }>(
    `SELECT a.*, (SELECT status FROM visit_requests v WHERE v.project_id = a.project_id AND v.vendor_id = a.vendor_id LIMIT 1) AS visit
     FROM assignments a WHERE a.vendor_id = ? ORDER BY a.id DESC`,
    vendor.id,
  );
  const items = rows.map((a) => {
    const project = getProject(a.project_id)!;
    const version = getVersion(a.version_id)!;
    const quote = getQuoteByAssignment(a.id);
    const hasDraft = !!getQuoteDraft(a.id);
    const outdated = project.requested_version_id !== a.version_id;
    const finished = ["contracted", "closed"].includes(project.status);
    const won_ = finished && project.outcome ? (JSON.parse(project.outcome) as { vendorId: number | null }).vendorId === vendor.id : false;
    // 목록도 고객이 보낸 요청 내용 기준으로 보여 준다.
    const rev = latestRevision(project.id, a.version_id);
    // 배치가 있는 요청은 업체에 보낸 배치(요청 기록) 그대로 미리보기를 그린다.
    const stale = !!quote && !!rev && quote.request_rev_id !== rev.id;
    const shownProject = rev ? projectAsSent(project, rev.snapshot) : project;
    const home = rev?.snapshot.home ?? version.home;
    const homeInfo = home ? homeFacts(shownProject, home, (rev?.snapshot.rooms ?? version.rooms).length) : null;
    return { a, project, version, quote, hasDraft, outdated, finished, won: won_, stale, rev, homeInfo, facts: requestFacts(shownProject, version) };
  });
  const todo = items.filter((x) => x.a.status === "invited" && !x.outdated && !x.finished && !x.a.withdrawn_at);
  const sent = items.filter((x) => x.a.status === "quoted");
  const past = items.filter((x) => !todo.includes(x) && !sent.includes(x));
  const visits = sent.filter((x) => x.a.visit === "requested").length;
  const openCount = openRequestsFor(vendor).filter((x) => x.left > 0).length;

  const card = (x: (typeof items)[number], footer: React.ReactNode) => {
    const option = versionOption(x.version);
    return (
      <li key={x.a.id}>
        <Link href={`/vendor/requests/${x.a.id}`} className="grid gap-4 rounded-2xl border border-line bg-surface p-4 transition hover:border-brand sm:grid-cols-[120px_minmax(0,1fr)]">
          <div className="hidden overflow-hidden rounded-xl border border-line bg-white sm:block">
            {option ? (
              <PlanSvg option={option} styleId={x.version.selected_style} />
            ) : x.homeInfo ? (
              <span className="grid aspect-[4/3] place-items-center p-2 text-center text-[11px] text-muted">
                집 · {x.homeInfo.type}
                <br />
                {x.homeInfo.rooms}
              </span>
            ) : (
              <span className="grid aspect-[4/3] place-items-center p-2 text-center text-[11px] text-muted">도면 없음 · 상담 건</span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="font-semibold">{x.homeInfo?.title ?? x.facts.title}</h3>
              {footer}
            </div>
            <dl className="mt-2 grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-sm">
              <dt className="text-muted">예산</dt>
              <dd>
                {x.homeInfo ? x.homeInfo.budget : `${x.facts.budget} · ${x.facts.furniture}`}
              </dd>
              <dt className="text-muted">일정</dt>
              <dd>
                {x.facts.schedule} / {x.facts.movein}
              </dd>
              <dt className="text-muted">범위</dt>
              <dd className="truncate">
                {x.homeInfo ? `${x.homeInfo.scope} · ${x.homeInfo.area}` : `직원 ${x.version.input.staff}석 · ${x.facts.scope}`}
              </dd>
            </dl>
            <p className="mt-2 text-xs text-muted">
              {x.a.source === "self" ? "직접 참여 · " : ""}
              {x.homeInfo ? "집 요청" : `도면 v${x.version.no}`}
              {x.rev && ` · 요청 내용 r${x.rev.no}`} · 배정 {dateKo(x.a.created_at)}
              {x.a.status === "invited" && !x.a.withdrawn_at && !x.outdated && !x.finished && (x.a.accepted_at ? x.a.quote_by : x.a.respond_by) && (
                <span className={isPast(x.a.accepted_at ? x.a.quote_by : x.a.respond_by) ? "font-semibold text-danger" : ""}>
                  {" "}
                  · {x.a.accepted_at ? "제안" : "답변"} 기한 {kst(x.a.accepted_at ? x.a.quote_by : x.a.respond_by)}
                </span>
              )}
            </p>
          </div>
        </Link>
      </li>
    );
  };

  return (
    <Page>
      <PageTitle title="요청·제안" sub={`${vendor.company} · 운영자가 배정한 요청과 직접 참여한 요청의 제안을 관리합니다.`} />
      <div className="space-y-8">
        {vendor.status === "pending" && (
          <Notice tone="warn" title="운영자 승인 대기 중">
            승인되면 업체 목록에 공개되고 요청을 배정받습니다. 그동안{" "}
            <Link href="/vendor/profile" className="underline">
              업체 소개와 시공 사례
            </Link>
            를 채워 두세요. 고객은 사례 사진부터 보고 시공사를 살펴봅니다.
          </Notice>
        )}
        {vendor.status === "suspended" && <Notice tone="warn">운영자에 의해 이용이 중지된 상태입니다.</Notice>}

        {openCount > 0 && vendor.status === "approved" && (
          <Link href="/vendor/open" className="flex items-center justify-between gap-3 rounded-2xl border border-brand/30 bg-brand-soft p-4 text-sm" data-testid="open-banner">
            <span><b>직접 참여할 수 있는 요청 {openCount}건</b><span className="mt-0.5 block text-xs text-muted">고객이 업체 직접 참여를 켠 요청이에요. 정해진 업체 수까지 먼저 참여한 순서로 받아요.</span></span>
            <span className="btn btn-sm btn-primary shrink-0">보기</span>
          </Link>
        )}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="참여 여부를 정할 요청" value={`${todo.filter((x) => !x.a.accepted_at).length}건`} />
          <Stat label="제안 작성 중" value={`${todo.filter((x) => x.a.accepted_at).length}건`} />
          <Stat label="제출한 제안" value={`${sent.length}건`} />
          <Stat label="새 방문 요청" value={`${visits}건`} sub={visits ? "고객 연락처가 공개되었습니다" : undefined} />
        </div>

        <section>
          <h2 className="mb-3 text-lg font-bold">참여할 요청 · {todo.length}건</h2>
          {todo.length === 0 ? (
            <Empty>새로 배정된 요청이 없습니다.</Empty>
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">{todo.map((x) => card(x, x.a.accepted_at ? <Badge tone="warn">{x.hasDraft ? "작성 중 · 임시 저장됨" : "제안 작성 중"}</Badge> : <Badge tone="brand">참여 여부 결정 필요</Badge>))}</ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">제출한 제안 · {sent.length}건</h2>
          {sent.length === 0 ? (
            <Empty>제출한 제안이 없습니다.</Empty>
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {sent.map((x) =>
                card(
                  x,
                  <span className="flex flex-wrap items-center justify-end gap-1.5">
                    {x.quote && <span className="text-sm font-semibold tabular-nums">{won(compareQuotes([x.quote]).cols[0].payableWithVat)}</span>}
                    {x.won ? (
                      <Badge tone="brand">계약</Badge>
                    ) : x.finished ? (
                      <Badge>요청 종료</Badge>
                    ) : x.outdated ? (
                      <Badge>도면 변경으로 마감</Badge>
                    ) : x.a.visit === "requested" ? (
                      <Badge tone="warn">방문 요청 도착</Badge>
                    ) : x.a.visit ? (
                      <Badge tone="brand">방문 확인함</Badge>
                    ) : (
                      <Badge>고객 검토 중</Badge>
                    )}
                    {x.hasDraft && !x.outdated && !x.finished && <Badge tone="warn">수정 내용 임시 저장됨</Badge>}
                    {x.stale && !x.outdated && !x.finished && <Badge tone="warn">요청 내용 변경 · 확인 필요</Badge>}
                  </span>,
                ),
              )}
            </ul>
          )}
        </section>

        {past.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-bold text-muted">지난 요청 · {past.length}건</h2>
            <ul className="grid gap-3 lg:grid-cols-2">{past.map((x) => card(x, <Badge>{x.a.withdrawn_at ? "배정 취소" : x.a.status === "declined" ? "참여 안 함" : x.outdated ? "도면 변경으로 마감" : "요청 종료"}</Badge>))}</ul>
          </section>
        )}
      </div>
    </Page>
  );
}
