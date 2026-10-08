import Link from "next/link";
import PlanSvg from "@/components/PlanSvg";
import { Badge, Empty, Page, PageTitle, StageBar } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { dateKo } from "@/lib/constants";
import { getAssignments, getQuotes, getVersions, type Project } from "@/lib/data";
import { all } from "@/lib/db";
import { countsFor, nextAction } from "@/lib/next-action";
import { pendingChanges } from "@/lib/request-snapshot";
import { describeRoom } from "@/lib/space/room";
import { HOME_TYPES, scopeText } from "@/lib/home";
import { sourceLabel, versionOption } from "@/lib/space/view";

export default async function Projects() {
  const user = await requireUser("customer");
  const projects = all<Project>(`SELECT * FROM projects WHERE customer_id = ? ORDER BY updated_at DESC`, user.id);
  return (
    <Page>
      <PageTitle
        title="내 공간"
        sub="실제 치수로 만든 공간과 저장한 배치, 시공 제안 요청을 한곳에서 봐요. 공사 요청은 원할 때만 하면 돼요."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/projects/new?intake=photos" className="btn btn-sm">
              사진으로 상담 요청
            </Link>
            <Link href="/homes/new" className="btn btn-sm" data-testid="new-home">
              집 상담 신청
            </Link>
            <Link href="/spaces/new" className="btn btn-primary" data-testid="new-space">
              내 공간 만들기
            </Link>
          </div>
        }
      />
      {projects.length === 0 ? (
        <Empty>
          아직 만든 공간이 없어요.{" "}
          <Link href="/spaces/new" className="text-brand underline">
            실제 치수로 내 공간을 만들고 가구를 직접 놓아 보세요.
          </Link>
        </Empty>
      ) : (
        <ul className="space-y-4" data-testid="space-list">
          {projects.map((p) => {
            const versions = getVersions(p.id);
            const current = versions.find((v) => v.id === p.current_version_id) ?? versions[0];
            const requested = versions.find((v) => v.id === p.requested_version_id);
            const counts = countsFor(p, getQuotes(p.id), getAssignments(p.id));
            const next = nextAction(p, current, requested, counts);
            const option = versionOption(current);
            const room = current.room ? describeRoom(current.room) : null;
            const pending = requested ? pendingChanges(p).length : 0;
            return (
              <li key={p.id} className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_4px_24px_#182e4605] transition hover:border-brand">
                <Link href={`/projects/${p.id}`} className="grid gap-5 p-5 md:grid-cols-[180px_minmax(0,1fr)_minmax(0,280px)] md:items-center">
                  <div className="overflow-hidden rounded-xl border border-line bg-white">
                    {option ? (
                      <PlanSvg option={option} styleId={current.selected_style} thumb />
                    ) : current.home ? (
                      <span className="grid aspect-[4/3] place-items-center p-2 text-center text-[11px] text-muted">
                        집 · {HOME_TYPES[current.home.homeType]}
                        <br />방 배치 {current.rooms.length}개
                      </span>
                    ) : (
                      <span className="grid aspect-[4/3] place-items-center p-2 text-center text-[11px] text-muted">치수가 없어 3D 공간을 만들지 않았어요</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2 className="flex items-center gap-2 truncate text-lg font-semibold">
                      <Badge tone={current.home ? "brand" : "plain"}>{current.home ? "집" : "사무실"}</Badge>
                      <span className="truncate">{p.title}</span>
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      {current.home ? `${HOME_TYPES[current.home.homeType]} · ${scopeText(current.home)}` : `${room ? `${room.size} · ${room.area}` : `${current.input.areaPyeong}평`} · 직원 ${current.input.staff}석`}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {current.home ? `방 배치 ${current.rooms.length}개` : current.room ? `버전 ${current.no} · ${sourceLabel(current.source)}` : `도면 v${current.no}`}
                      {p.region && ` · ${p.region}`}
                    </p>
                    {requested && (
                      <div className="mt-3 max-w-sm">
                        <StageBar status={p.status} />
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {requested ? (
                        <>
                          <Badge>참여 시공사 {counts.assigned}곳</Badge>
                          <Badge tone={counts.quotes ? "brand" : "plain"}>도착한 제안 {counts.quotes}건{counts.reconfirming ? ` · 업체 확인 중 ${counts.reconfirming}` : ""}</Badge>
                          {pending > 0 && <Badge tone="warn">업체에 안 보낸 변경 {pending}건</Badge>}
                        </>
                      ) : (
                        <Badge>공사 요청 전</Badge>
                      )}
                      {current.layout_status === "needs_review" && <Badge tone="warn">배치 검토 필요</Badge>}
                    </div>
                  </div>
                  <div className="rounded-xl bg-brand-soft p-4">
                    <p className="text-[11px] font-semibold tracking-widest text-clay">지금 할 일</p>
                    <p className="mt-1 text-sm font-semibold leading-snug">{next.title}</p>
                    <p className="mt-2 text-xs text-muted">최근 변경 {dateKo(p.updated_at)}</p>
                  </div>
                </Link>
                <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-white px-5 py-3">
                  {current.room && !["contracted", "closed"].includes(p.status) && (
                    <Link href={`/projects/${p.id}/editor`} className="btn btn-sm">
                      배치 수정
                    </Link>
                  )}
                  {next.kind === "compare" ? (
                    <Link href={`/projects/${p.id}/quotes`} className="btn btn-sm btn-primary">
                      {next.cta}
                    </Link>
                  ) : next.href ? (
                    <Link href={next.href} className="btn btn-sm btn-primary">
                      {next.cta}
                    </Link>
                  ) : (
                    <Link href={`/projects/${p.id}`} className="btn btn-sm btn-primary">
                      열기
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
