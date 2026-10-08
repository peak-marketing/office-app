import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import PlanSvg from "@/components/PlanSvg";
import { StateForm } from "@/components/forms";
import { Badge, Notice, Page } from "@/components/ui";
import { joinOpenRequest } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { joinBlocker, openForBids, participants } from "@/lib/bidding";
import { get } from "@/lib/db";
import { getProject, getVendorByUser, getVersion } from "@/lib/data";
import { homeFacts, requestFacts } from "@/lib/request-facts";
import { latestRevision, projectAsSent } from "@/lib/request-snapshot";
import { versionOption } from "@/lib/space/view";

/** 공개 요청 미리보기. 참여 전에는 요청 요약과 배치만 보여 주고, 사진·도면 파일은 참여한 뒤에 열린다. */
export default async function OpenRequest({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("vendor");
  const vendor = getVendorByUser(user.id);
  if (!vendor) redirect("/partner");
  const live = getProject(Number((await params).id));
  if (!live) notFound();
  const mine = get<{ id: number }>(`SELECT id FROM assignments WHERE project_id = ? AND vendor_id = ? ORDER BY id DESC`, live.id, vendor.id);
  if (mine) redirect(`/vendor/requests/${mine.id}`);
  if (!openForBids(live)) notFound();
  const version = getVersion(live.requested_version_id)!;
  const rev = latestRevision(live.id, version.id);
  const project = rev ? projectAsSent(live, rev.snapshot) : live;
  const home = rev?.snapshot.home ?? version.home;
  const hf = home ? homeFacts(project, home, (rev?.snapshot.rooms ?? version.rooms).length) : null;
  const facts = requestFacts(project, version);
  const option = versionOption(version);
  const blocker = joinBlocker(live, vendor);
  const n = participants(live.id, version.id);
  const fileCount = rev?.snapshot.files.length ?? 0;
  const tiles: [string, string][] = hf
    ? [["지역", hf.region], ["주거 유형·면적", `${hf.type} · ${hf.area}`], ["방·욕실", hf.counts], ["예산", hf.budget], ["희망 일정", `${hf.schedule} / ${hf.movein}`], ["공사 범위", `${hf.scope} · ${hf.rooms}`]]
    : [["지역", facts.region], ["면적·인원", facts.area], ["예산", `${facts.budget} · ${facts.furniture}`], ["희망 일정", `${facts.schedule} / ${facts.movein}`], ["요청 범위", facts.scope]];
  return (
    <Page narrow>
      <Link href="/vendor/open" className="text-sm text-muted hover:text-ink">← 참여할 수 있는 요청</Link>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{hf?.title ?? facts.title}</h1>
        <Badge tone="brand">직접 참여 · {n}/{live.bid_cap}곳</Badge>
      </div>
      <p className="mt-1 text-sm text-muted">요청 내용 r{rev?.no ?? 1} 기준 · 상세 주소와 연락처는 고객이 현장 방문을 요청하면 공개돼요.</p>
      <dl className="mt-5 grid gap-3 sm:grid-cols-2" data-testid="open-facts">
        {tiles.map(([k, v]) => (
          <div key={k} className="rounded-xl bg-sand p-3">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="mt-1 text-sm font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      {project.work_scope && (
        <section className="card mt-4 text-sm">
          <h2 className="h-section">원하는 공사 내용</h2>
          <p className="whitespace-pre-line leading-relaxed">{project.work_scope}</p>
        </section>
      )}
      {option && (
        <section className="card mt-4">
          <h2 className="h-section">고객이 보낸 배치(평면)</h2>
          <div className="overflow-hidden rounded-xl border border-line bg-white"><PlanSvg option={option} styleId={version.selected_style} /></div>
        </section>
      )}
      <p className="mt-4 text-sm text-muted">첨부 사진·도면 {fileCount}개 · 참여하면 볼 수 있어요.</p>
      <div className="card mt-5">
        {blocker ? (
          <Notice tone="warn">{blocker}</Notice>
        ) : (
          <StateForm action={joinOpenRequest.bind(null, live.id)} submit="이 요청에 참여하기">
            <p className="text-sm leading-relaxed">참여하면 바로 제안을 작성할 수 있어요. 가격·설계·자재·기간을 같은 요청 내용 기준으로 제안해 주세요. 다른 업체의 제안과 금액은 볼 수 없고, 고객이 비교해 고르며 최저가 자동 낙찰은 없어요.</p>
          </StateForm>
        )}
      </div>
    </Page>
  );
}
