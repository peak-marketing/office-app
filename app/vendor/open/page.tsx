import Link from "next/link";
import { redirect } from "next/navigation";
import PlanSvg from "@/components/PlanSvg";
import { Badge, Empty, Notice, Page, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { openRequestsFor } from "@/lib/bidding";
import { dateKo } from "@/lib/constants";
import { getVendorByUser, getVersion } from "@/lib/data";
import { homeFacts, requestFacts } from "@/lib/request-facts";
import { latestRevision, projectAsSent } from "@/lib/request-snapshot";
import { versionOption } from "@/lib/space/view";

export const metadata = { title: "참여할 수 있는 요청" };

/** 업체 직접 참여를 켠 공개 요청. 요청 이름·상세 주소·연락처 없이 고객이 보낸 요청 내용으로 보여 준다. */
export default async function OpenRequests() {
  const user = await requireUser("vendor");
  const vendor = getVendorByUser(user.id);
  if (!vendor) redirect("/partner");
  const list = openRequestsFor(vendor).map((x) => {
    const version = getVersion(x.project.requested_version_id)!;
    const rev = latestRevision(x.project.id, version.id);
    const shown = rev ? projectAsSent(x.project, rev.snapshot) : x.project;
    const home = rev?.snapshot.home ?? version.home;
    return { ...x, version, rev, home: home ? homeFacts(shown, home, (rev?.snapshot.rooms ?? version.rooms).length) : null, facts: requestFacts(shown, version) };
  });
  return (
    <Page>
      <PageTitle title="참여할 수 있는 요청" sub="고객이 ‘업체 직접 참여’를 켠 요청이에요. 정해진 업체 수까지 먼저 참여한 순서로 받아요. 업체끼리는 서로의 제안을 볼 수 없어요." actions={<Link href="/vendor" className="btn btn-sm">요청·제안</Link>} />
      {vendor.status !== "approved" && <div className="mb-5"><Notice tone="warn">운영자 승인 뒤 참여할 수 있어요. 지금은 목록만 볼 수 있어요.</Notice></div>}
      {list.length === 0 ? (
        <Empty>지금 참여할 수 있는 요청이 없어요. 업체 시공 분야({vendor.fields.split(",").map((f) => (f === "home" ? "주거" : "사무실")).join("·")})에 맞는 요청만 보여요.</Empty>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2" data-testid="open-list">
          {list.map((x) => {
            const option = versionOption(x.version);
            return (
              <li key={x.project.id}>
                <Link href={`/vendor/open/${x.project.id}`} className="grid gap-4 rounded-2xl border border-line bg-surface p-4 transition hover:border-brand sm:grid-cols-[120px_minmax(0,1fr)]">
                  <div className="hidden overflow-hidden rounded-xl border border-line bg-white sm:block">
                    {option ? <PlanSvg option={option} styleId={x.version.selected_style} /> : <span className="grid aspect-[4/3] place-items-center p-2 text-center text-[11px] text-muted">{x.home ? `집 · ${x.home.type}` : "도면 없음 · 상담 건"}</span>}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="font-semibold">{x.home?.title ?? x.facts.title}</h3>
                      <Badge tone={x.left ? "brand" : "plain"}>{x.left ? `${x.left}곳 남음` : "마감"}</Badge>
                    </div>
                    <dl className="mt-2 grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-sm">
                      <dt className="text-muted">예산</dt>
                      <dd>{x.home ? x.home.budget : `${x.facts.budget} · ${x.facts.furniture}`}</dd>
                      <dt className="text-muted">일정</dt>
                      <dd>{x.facts.schedule} / {x.facts.movein}</dd>
                      <dt className="text-muted">범위</dt>
                      <dd className="truncate">{x.home ? `${x.home.scope} · ${x.home.area}` : `직원 ${x.version.input.staff}석 · ${x.facts.scope}`}</dd>
                    </dl>
                    <p className="mt-2 text-xs text-muted">참여 {x.joined}/{x.project.bid_cap}곳 · 요청 {dateKo(x.project.updated_at)}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
