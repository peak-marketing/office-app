import PostReferences from "@/components/community/PostReferences";
import { all } from "@/lib/db";
import {projectPostRefs} from "@/lib/post-refs";
import Link from "next/link";
import PlanSvg from "@/components/PlanSvg";
import SpaceProducts from "@/components/shop/SpaceProducts";
import { BriefTable } from "@/components/project";
import { Badge, Stat } from "@/components/ui";
import { buildBrief, homeBrief } from "@/lib/brief";
import { HOME_TYPES, scopeText } from "@/lib/home";
import { ROOM_BADGE } from "@/lib/space/home-room";
import { describeRoom } from "@/lib/space/room";
import { PROJECT_STATUS, STATUS_FLOW, won } from "@/lib/constants";
import { getFiles, getProjectRefs, getProposalVendor } from "@/lib/data";
import { countsFor, pendingText } from "@/lib/next-action";
import { loadProject } from "@/lib/project-context";
import { compareQuotes } from "@/lib/quotes";
import { getStyle } from "@/lib/styles";
import { lastSentRevision } from "@/lib/request-snapshot";
import { sourceLabel, versionChecks, versionOption } from "@/lib/space/view";

export default async function OverviewTab({ params }: { params: Promise<{ id: string }> }) {
  const { project, current, requested, quotes, assignments } = await loadProject((await params).id);
  const base = `/projects/${project.id}`;
  const counts = countsFor(project, quotes, assignments);
  // 기준 자료는 제안을 요청한 버전이 있으면 그 버전, 없으면 지금 버전이다.
  const basis = requested ?? current;
  const option = versionOption(basis);
  const currentOption = requested && requested.id !== current.id ? versionOption(current) : undefined;
  const report = current.room ? versionChecks(current) : null;
  const refs = getProjectRefs(project.id);
  const referenceCount=refs.length + projectPostRefs(project.id).length;
  const brief = basis.home ? homeBrief(project, basis.home, basis.rooms.length) : buildBrief(project, basis.input, basis.result, basis.room);
  const files = getFiles(project.id);
  const mine = assignments.filter((a) => a.version_id === project.requested_version_id && !a.withdrawn_at);
  // 최신 요청 내용 기준 제안끼리만 비교한다.
  const latestRev = lastSentRevision(project.id);
  const inVersion = quotes.filter((q) => q.version_id === project.requested_version_id);
  const cmp = compareQuotes(inVersion.filter((q) => !latestRev || q.request_rev_id === latestRev.id || q.request_rev_id == null));
  const olderRev = inVersion.length - cmp.cols.length;
  const stage = Math.min(STATUS_FLOW.indexOf(project.status === "closed" ? "contracted" : project.status) + 1, STATUS_FLOW.length);
  const checks: [string, boolean, string][] = [
    ...((current.home
      ? [
          ["집 정보", true, `${HOME_TYPES[current.home.homeType]} · ${scopeText(current.home)}`],
          ["방 배치", current.rooms.length > 0, current.rooms.length ? `${current.rooms.length}개 · 방 한 칸씩 그린 참고 배치` : "선택 · 치수를 아는 방이 있으면 가구 배치를 그려 함께 보낼 수 있어요"],
        ]
      : [
          current.room
      ? ["배치 저장", true, `버전 ${current.no} · ${sourceLabel(current.source)}${report ? ` · 자동 검사 ${report.issues.length ? `확인할 것 ${report.issues.length}` : "걸린 곳 없음"}` : ""}`]
            : ["배치안·스타일 확인", basis.layout_status === "ok", basis.layout_status === "ok" ? `${option?.title} · ${getStyle(basis.selected_style).name}` : "자동 배치 없음 — 운영자 검토"],
        ]) as [string, boolean, string][]),
    ["참고 공간", referenceCount > 0, referenceCount ? `${referenceCount}건 연결 (운영자와 배정된 시공사가 함께 봅니다)` : "저장한 사례를 연결하면 원하는 분위기를 전하기 쉽습니다"],
    ["현장 사진·도면", files.length > 0, files.length ? `${files.length}개 등록` : "없어도 요청할 수 있지만, 있으면 견적이 정확해집니다"],
    ["예산 범위", project.budget_min != null || project.budget_max != null, project.budget_min != null || project.budget_max != null ? "입력됨" : "미정"],
    ["상세 주소", !!project.address, project.address ? "입력됨 (방문 요청한 시공사에만 공개)" : "현장 방문 요청 전까지 입력해 주세요"],
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="진행 단계" value={PROJECT_STATUS[project.status].label} sub={`${stage}/${STATUS_FLOW.length} 단계`} />
        <Stat label="참여 시공사" value={`${counts.assigned}곳`} sub={counts.assigned ? `참여 확정 ${counts.accepted}곳` : "운영자가 배정합니다"} />
        <Stat label={counts.latestRev && counts.latestRev > 1 ? `최신 요청 r${counts.latestRev} 제안` : "도착한 제안"} value={`${counts.quotes}건`} sub={[pendingText(counts), counts.reconfirming ? `이전 요청 기준 ${counts.reconfirming}건 업체 확인 중` : ""].filter(Boolean).join(" · ") || (counts.quotes ? "모두 도착" : "아직 없음")} />
        {current.home ? (
          <Stat label="방 배치" value={`${current.rooms.length}개`} sub={requested ? `업체에 보낸 방 ${requested.rooms.length}개` : "선택 · 방 한 칸씩"} />
        ) : current.room ? (
          <Stat label="업체에 보낸 배치" value={requested ? `버전 ${requested.no}` : "아직 없음"} sub={requested ? (latestRev ? `요청 r${latestRev.no}` : "") : `지금 배치 버전 ${current.no}`} />
        ) : (
          <Stat label="기준 도면" value={`v${basis.no}`} sub={requested ? "제안 요청한 버전" : "아직 요청 전"} />
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <section className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="h-section !mb-0">도착한 제안</h2>
              {cmp.cols.length > 0 && (
                <Link href={`${base}/quotes`} className="btn btn-sm">
                  자세히 비교하기
                </Link>
              )}
            </div>
            {cmp.cols.length === 0 ? (
              <p className="text-sm text-muted">{requested ? "아직 도착한 제안이 없습니다. 도착하면 금액, 공사 범위, 기간을 여기에서 바로 볼 수 있습니다." : "제안을 요청하면 운영자가 검토한 뒤 시공사를 배정합니다."}</p>
            ) : (
              <ul className="divide-y divide-line">
                {cmp.cols.map((col) => {
                  const vendor = getProposalVendor(col.q.vendor_id);
                  return (
                    <li key={col.q.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-sm">{vendor.company}</b>
                        <span className="text-xs text-muted">
                          약 {col.q.duration_days}일 · 확정 {col.pricedCount}항목
                          {col.unresolvedKeys.length > 0 && ` · 금액 미정 ${col.unresolvedKeys.length}`}
                          {col.excludedKeys.length > 0 && ` · 범위 제외 ${col.excludedKeys.length}`}
                        </span>
                      </span>
                      <span className="text-right">
                        <b className="block tabular-nums">{won(col.payableWithVat)}</b>
                        <span className="text-[11px] text-muted">현재 산정 금액 · 부가세 포함</span>
                      </span>
                      {cmp.lowestId === col.q.id && <Badge tone="brand">최저</Badge>}
                    </li>
                  );
                })}
              </ul>
            )}
            {olderRev > 0 && <p className="mt-3 text-xs text-muted">이전 요청 내용 기준 제안 {olderRev}건은 업체가 바뀐 내용을 확인하는 중입니다.</p>}
            {cmp.cols.length > 1 && !cmp.sameScope && <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-xs leading-relaxed text-warn">시공사마다 공사 범위가 달라 금액만으로 비교하기 어렵습니다. 자세히 비교하기에서 범위 차이를 확인하세요.</p>}
          </section>

          <section className="card">
            <h2 className="h-section">참여 시공사</h2>
            {mine.length === 0 ? (
              <p className="text-sm text-muted">{requested ? "운영자가 자료를 검토하고 조건에 맞는 시공사를 배정하는 중입니다." : "요청 후 운영자가 지역과 조건에 맞는 시공사를 배정합니다. 관심 업체로 담아 둔 곳이 있으면 참고합니다."}</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {mine.map((a) => {
                  const vendor = getProposalVendor(a.vendor_id);
                  return (
                    <li key={a.id}>
                      <Link href={`/vendors/${vendor.id}`} className="flex items-center gap-3 rounded-xl border border-line bg-white p-3 transition hover:border-brand">
                        {vendor.photos[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element -- 업로드 파일
                          <img src={`/files/${vendor.photos[0].id}`} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <span className="size-12 shrink-0 rounded-lg bg-sand" />
                        )}
                        <span className="min-w-0 flex-1">
                          <b className="block truncate text-sm">{vendor.company}</b>
                          <span className="text-xs text-muted">사례 {vendor.caseCount}건</span>
                        </span>
                        {a.status === "quoted" ? <Badge tone="brand">제안 도착</Badge> : a.status === "declined" ? <Badge>참여 안 함</Badge> : a.accepted_at ? <Badge tone="warn">작성 중</Badge> : <Badge>요청 확인 중</Badge>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {!requested && (
            <section className="card">
              <h2 className="h-section">요청 전 확인</h2>
              <ul className="space-y-2 text-sm">
                {checks.map(([label, done, note]) => (
                  <li key={label} className="flex items-start gap-2.5">
                    <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-[10px] ${done ? "bg-brand text-white" : "border border-line bg-white text-muted"}`}>{done ? "✓" : ""}</span>
                    <span>
                      <b>{label}</b>
                      <span className="block text-xs text-muted">{note}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-5">
          {basis.home ? (
            <section className="card" data-testid="overview-rooms">
              <h2 className="h-section">{requested ? "업체에 보낸 방 배치" : "방 배치"}</h2>
              {basis.rooms.length ? (
                <ul className="space-y-1.5 text-sm">
                  {basis.rooms.map((r) => (
                    <li key={r.id} className="flex items-baseline justify-between gap-2">
                      <b className="truncate">{r.name}</b>
                      <span className="shrink-0 text-xs text-muted">
                        {describeRoom(r.room).size} · 배치 {r.rev}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">아직 없어요. 방 배치는 선택이에요.</p>
              )}
              <p className="mt-2 text-xs leading-relaxed text-muted">{ROOM_BADGE}. 방마다 따로 그린 참고 배치예요.</p>
              {requested && requested.id !== current.id && current.rooms.length !== requested.rooms.length && <p className="mt-1 text-xs text-warn">지금 방 배치 {current.rooms.length}개 · 아직 업체에 안 보냄</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`${base}/plan`} className="btn btn-sm">
                  방 배치 보기
                </Link>
                <Link href={`${base}/print`} className="btn btn-sm" data-testid="home-print-link">
                  PDF
                </Link>
              </div>
            </section>
          ) : (
          <section className="card">
            <h2 className="h-section">{current.room ? (requested ? "업체에 보낸 배치" : "지금 저장한 배치") : "요청의 기준 자료"}</h2>
            {option ? (
              <Link href={`${base}/plan?v=${basis.id}`} className="block overflow-hidden rounded-xl border border-line bg-white transition hover:border-brand" data-testid="basis-plan">
                <PlanSvg option={option} styleId={basis.selected_style} space={!!basis.room} />
              </Link>
            ) : (
              <p className="rounded-xl bg-warn-soft p-3 text-xs leading-relaxed text-warn">자동 배치안이 없습니다. 사진과 도면, 입력한 조건이 기준 자료가 됩니다.</p>
            )}
            <p className="mt-3 text-sm">
              {basis.room ? `버전 ${basis.no} · ${sourceLabel(basis.source)} · ${getStyle(basis.selected_style).name}${requested && latestRev ? ` · 요청 r${latestRev.no}` : ""}` : `도면 v${basis.no}${option ? ` · ${option.title} · ${getStyle(basis.selected_style).name}` : ""}`}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {requested ? "모든 시공사가 이 배치와 가구 목록, 참고 사례를 같은 기준으로 받아 제안합니다." : "시공 제안을 요청하면 이 배치가 업체에 보내는 기준으로 고정됩니다."}
            </p>
            {currentOption && (
              <div className="mt-3 border-t border-line pt-3" data-testid="current-plan">
                <p className="mb-2 text-xs font-semibold">지금 저장한 배치 · 버전 {current.no} (아직 업체에 안 보냄)</p>
                <Link href={`${base}/plan?v=${current.id}`} className="block overflow-hidden rounded-xl border border-line bg-white">
                  <PlanSvg option={currentOption} styleId={current.selected_style} thumb />
                </Link>
              </div>
            )}
            {refs.length > 0 && (
              <div className="mt-3 border-t border-line pt-3" data-testid="overview-refs">
                <p className="mb-2 text-xs font-semibold">참고 사례 {refs.length}건</p>
                <ul className="flex gap-1.5 overflow-x-auto">
                  {refs.map((x) => (
                    <li key={x.id} className="w-20 shrink-0">
                      <Link href={`/cases/${x.c.id}`} title={x.c.title}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- 업로드 파일 */}
                        <img src={`/files/${x.file_id ?? x.c.photos[0]}`} alt={x.c.title} className="aspect-[4/3] w-full rounded-lg object-cover" />
                        <span className="mt-1 line-clamp-1 block text-[11px] text-muted">{x.c.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`${base}/plan?v=${basis.id}`} className="btn btn-sm">
                3D·도면 보기
              </Link>
              {current.room && (
                <Link href={`${base}/editor`} className="btn btn-sm">
                  배치 수정
                </Link>
              )}
              {option && (
                <Link href={`${base}/print?v=${basis.id}`} className="btn btn-sm">
                  PDF
                </Link>
              )}
            </div>
          </section>
          )}
          <section className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="h-section !mb-0">요청 내용</h2>
              <Link href={`${base}/info`} className="text-xs text-muted underline">
                전체 보기
              </Link>
            </div>
            <BriefTable brief={{ ...brief, rows: brief.rows.slice(0, 7) }} />
            <p className="mt-3 text-xs text-muted">
              사진·도면 {files.length}개 · 참고 사례 {refs.length}건
            </p>
          </section>
        </aside>
      </div>
      <PostReferences refs={projectPostRefs(project.id)}/>
      <section className="card" data-testid="project-posts"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="h-section !mb-0">내 공간 이야기</h2><Link href={`/community/new?project=${project.id}`} className="btn btn-sm">이 공간 자랑하기</Link></div><ul className="mt-3 space-y-2">{all<{id:number;title:string}>(`SELECT id,title FROM posts WHERE project_id=? AND user_id=? AND status='published' ORDER BY id DESC`,project.id,project.customer_id).map(p => <li key={p.id}><Link className="text-sm text-brand underline" href={`/community/${p.id}`}>{p.title}</Link></li>)}</ul><p className="mt-2 text-xs text-muted">사진과 이야기만 공개돼요. 도면·주소·연락처는 공개하지 않아요.</p></section>
      <SpaceProducts projectId={project.id} version={current} />
    </div>
  );
}
