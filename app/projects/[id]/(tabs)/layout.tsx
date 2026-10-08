import Link from "next/link";
import type { ReactNode } from "react";
import HideOnPath from "@/components/HideOnPath";
import ProjectTabs from "@/components/ProjectTabs";
import { Page, StatusBadge, Steps } from "@/components/ui";
import { requestQuotes, sendRequestUpdate } from "@/lib/actions";
import { getChangeRequests, getInfoRequests } from "@/lib/data";
import { lastSentRevision, pendingChanges } from "@/lib/request-snapshot";
import { countsFor, nextAction } from "@/lib/next-action";
import { loadProject } from "@/lib/project-context";
import { describeRoom } from "@/lib/space/room";
import { HOME_TYPES } from "@/lib/home";

export default async function ProjectLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { project, current, requested, quotes, assignments, finished } = await loadProject((await params).id);
  const base = `/projects/${project.id}`;
  const counts = countsFor(project, quotes, assignments);
  const next = nextAction(project, current, requested, counts);
  const openChanges = getChangeRequests(project.id).filter((c) => c.status === "open").length;
  const infoOpen = getInfoRequests(project.id).filter((r) => r.status === "open");
  // 요청을 보낸 뒤 바꿨지만 아직 업체에 보내지 않은 내용(배치를 고쳤으면 그 차이도)
  const pending = !finished && requested ? pendingChanges(project) : [];
  const sentRev = requested ? lastSentRevision(project.id) : undefined;
  const space = current.room ? describeRoom(current.room) : null;

  return (
    <Page>
      <Link href="/projects" className="text-sm text-muted hover:text-ink">
        ← 내 공간
      </Link>
      <div className="mb-5 mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{project.title}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
            {requested ? <StatusBadge status={project.status} /> : <span className="badge bg-white text-muted">공사 요청 전</span>}
            {current.home
              ? `집 · ${HOME_TYPES[current.home.homeType]} · 방 배치 ${current.rooms.length}개`
              : `${space ? `${space.size} · ${space.area}` : `${current.input.areaPyeong}평 사무실`} · 직원 ${current.input.staff}석`}
            {project.region && ` · ${project.region}`}
          </p>
        </div>
        {!finished && (
          <div className="no-print flex flex-wrap gap-2">
            {current.home ? (
              <>
                <Link href={`${base}/request`} className="btn btn-sm" data-testid="edit-home">
                  요청 내용 고치기
                </Link>
                <Link href={`${base}/plan`} className="btn btn-sm btn-primary" data-testid="open-rooms">
                  방 배치
                </Link>
              </>
            ) : current.room ? (
              <>
                <Link href={`${base}/space`} className="btn btn-sm">
                  공간 정보 고치기
                </Link>
                <Link href={`${base}/editor`} className="btn btn-sm btn-primary" data-testid="open-editor">
                  배치 수정
                </Link>
              </>
            ) : (
              <Link href={`${base}/edit`} className="btn">
                조건 변경
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="mb-5 overflow-hidden rounded-2xl border border-line bg-surface">
        {requested && (
          <div className="hidden border-b border-line px-5 py-3.5 sm:block">
            <Steps status={project.status} />
          </div>
        )}
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold tracking-widest text-clay">지금 할 일</p>
            <p className="mt-1 font-semibold" data-testid="next-title">
              {next.title}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{next.body}</p>
          </div>
          {next.kind === "compare" ? (
            <HideOnPath suffix="/quotes">
              <Link href={`${base}/quotes`} className="btn btn-primary w-full shrink-0 sm:w-auto">
                {next.cta}
              </Link>
            </HideOnPath>
          ) : next.href ? (
            <Link href={next.href} className="btn btn-primary w-full shrink-0 sm:w-auto" data-testid="next-cta">
              {next.cta}
            </Link>
          ) : next.cta ? (
            <form action={requestQuotes.bind(null, project.id)} className="shrink-0">
              <button className="btn btn-primary w-full sm:w-auto">{next.cta}</button>
            </form>
          ) : null}
        </div>
      </div>

      {infoOpen.length > 0 && (
        <div className="mb-5 rounded-2xl border border-warn/30 bg-warn-soft p-5 text-sm" data-testid="info-request-banner">
          <p className="font-semibold text-warn">운영자가 자료를 요청했습니다</p>
          {infoOpen.map((r) => (
            <p key={r.id} className="mt-1 leading-relaxed">
              {[r.items.join(", "), r.message].filter(Boolean).join(" — ")}
            </p>
          ))}
          <Link href={`${base}/info#info-requests`} className="btn btn-sm mt-3">
            자료 올리고 답하기
          </Link>
        </div>
      )}

      {pending.length > 0 && (
        <div className="mb-5 rounded-2xl border border-brand/30 bg-brand-soft/60 p-5 text-sm" data-testid="pending-changes">
          <p className="font-semibold">
            업체에 보낸 요청{sentRev ? `(r${sentRev.no})` : ""}과 달라진 내용 {pending.length}건
          </p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs leading-relaxed">
            {pending.slice(0, 8).map((c) => (
              <li key={c}>{c}</li>
            ))}
            {pending.length > 8 && <li>외 {pending.length - 8}건</li>}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <form action={sendRequestUpdate.bind(null, project.id)}>
              <button className="btn btn-primary btn-sm" data-testid="send-update">
                변경 내용 보내기
              </button>
            </form>
            <span className="text-xs text-muted">보내기 전까지 업체는 이전 요청 내용과 {current.home ? "방 배치" : "배치"}를 그대로 봅니다. 보내면 같은 업체가 새 기준으로 확인하고, 이전 기준으로 낸 제안은 따로 표시됩니다.</span>
          </div>
        </div>
      )}

      <ProjectTabs
        tabs={[
          { href: base, label: "한눈에" },
          { href: `${base}/plan`, label: current.home ? "방 배치" : current.room ? "공간·배치" : "배치안·도면", badge: openChanges },
          ...(current.home ? [{ href: `${base}/house`, label: "집 전체 평면" }] : []),
          { href: `${base}/quotes`, label: "제안 비교", badge: counts.quotes },
          { href: `${base}/info`, label: "요청 내용·자료" },
          { href: `${base}/activity`, label: "기록·공유" },
        ]}
      />
      {children}
    </Page>
  );
}
