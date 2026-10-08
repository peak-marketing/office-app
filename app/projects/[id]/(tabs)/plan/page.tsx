import Link from "next/link";
import LayoutStudio from "@/components/LayoutStudio";
import HomeRoomsTab from "@/components/home/HomeRoomsTab";
import { Advisories, CoverageTable, NeedsReview } from "@/components/project";
import SpaceView from "@/components/space/SpaceView";
import StylePicker from "@/components/space/StylePicker";
import { CheckList, FurnitureTable, SpaceFacts } from "@/components/space/SpaceParts";
import { Badge } from "@/components/ui";
import { addChangeRequest, setCurrentVersion } from "@/lib/actions";
import { buildBrief } from "@/lib/brief";
import { dateKo } from "@/lib/constants";
import { getChangeRequests, getFiles, getProjectRefs } from "@/lib/data";
import { inputCoverage } from "@/lib/layout/coverage";
import { loadProject } from "@/lib/project-context";
import { getRequestRevisions } from "@/lib/request-snapshot";
import { spaceCoverage } from "@/lib/space/coverage";
import { diffPlacement } from "@/lib/space/placement";
import { baseOptionOf, sourceLabel, versionChecks, versionItems, versionOption } from "@/lib/space/view";

export default async function PlanTab({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const { project, versions, current, requested, finished } = await loadProject((await params).id);
  if (current.home) return <HomeRoomsTab project={project} current={current} finished={finished} />;
  const wanted = Number((await searchParams).v);
  const version = versions.find((v) => v.id === wanted) ?? current;
  const brief = buildBrief(project, version.input, version.result, version.room);
  const changes = getChangeRequests(project.id);
  const ok = version.layout_status === "ok";
  const isCurrent = version.id === current.id;
  const revs = getRequestRevisions(project.id);
  const sentIn = (id: number) => revs.filter((r) => r.version_id === id).map((r) => r.no);
  const space = !!(version.room && version.placement);
  const option = space ? versionOption(version) : undefined;
  const report = space ? versionChecks(version) : null;
  const prev = version.base_version_id ? versions.find((v) => v.id === version.base_version_id) : undefined;
  const changed = space && prev?.placement && prev.selected_option === version.selected_option ? diffPlacement(prev.placement.items, version.placement!.items) : null;
  const base = `/projects/${project.id}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="version-chips">
        <span className="text-muted">버전</span>
        {versions.map((v) => {
          const sent = sentIn(v.id);
          return (
            <Link key={v.id} href={`${base}/plan?v=${v.id}`} className={`badge ${v.id === version.id ? "border-ink bg-ink text-white" : "bg-white text-muted hover:text-ink"}`} title={v.note || undefined}>
              {v.room ? "버전 " : "v"}
              {v.no}
              {v.id === current.id && " · 지금"}
              {sent.length > 0 && ` · 업체에 보냄 r${sent.at(-1)}`}
              {v.layout_status === "needs_review" && " · 검토 필요"}
            </Link>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>
          {dateKo(version.created_at)} 저장{sourceLabel(version.source) && ` · ${sourceLabel(version.source)}`}
          {version.note && ` · ${version.note}`}
        </span>
        <span className="ml-auto flex flex-wrap gap-2">
          {space && !finished && (
            <Link href={`${base}/editor?v=${version.id}`} className="btn btn-sm btn-primary" data-testid="edit-this-version">
              {isCurrent ? "배치 수정" : "이 버전에서 이어서 수정"}
            </Link>
          )}
          {!isCurrent && !finished && (
            <form action={setCurrentVersion.bind(null, project.id, version.id)}>
              <button className="btn btn-sm">이 버전을 지금 배치로</button>
            </form>
          )}
          {ok && (
            <Link href={`${base}/print?v=${version.id}`} className="btn btn-sm">
              PDF · 인쇄
            </Link>
          )}
        </span>
      </div>
      {requested && version.id !== requested.id && isCurrent && <p className="rounded-lg bg-brand-soft px-3 py-2 text-xs text-brand">지금 배치는 업체에 보낸 배치(버전 {requested.no})와 다릅니다. 위의 ‘변경 내용 보내기’를 눌러야 업체에 전달됩니다.</p>}

      {space && option ? (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <SpaceView option={option} styleId={version.selected_style} highlight={changed ? [...changed.moved, ...changed.rotated, ...changed.added].map((it) => it.id) : undefined} label={`${baseOptionOf(version)?.title ?? "빈 공간"}에서 시작 · ${sourceLabel(version.source)}`} />
            <div className="space-y-4">
              {changed && changed.lines.length > 0 && (
                <section className="card text-xs leading-relaxed" data-testid="version-diff">
                  <h3 className="text-sm font-bold">버전 {prev!.no}에서 바꾼 점 · {changed.summary}</h3>
                  <ul className="mt-2 list-disc space-y-0.5 pl-4">
                    {changed.lines.slice(0, 10).map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-muted">파란 테두리가 바뀐 가구입니다.</p>
                </section>
              )}
              {report && <CheckList report={report} staff={version.input.staff} />}
            </div>
          </div>
          <StylePicker projectId={project.id} versionId={version.id} option={version.selected_option} styleId={version.selected_style} locked={revs.some((r) => r.version_id === version.id)} readOnly={finished} />
          <section className="card">
            <h2 className="h-section">실제 내 공간과 가정·제안</h2>
            <p className="mb-3 text-xs leading-relaxed text-muted">입력한 벽·출입문·창·기둥이 어디까지 반영됐는지입니다. 실제 벽(진한 선)과 자동 배치가 제안한 칸막이(회색)는 평면도 범례로도 나눠 보여 드려요.</p>
            <SpaceFacts rows={spaceCoverage(version.room!, version.input, baseOptionOf(version), versionItems(version))} />
          </section>
          <details className="card">
            <summary className="cursor-pointer text-sm font-semibold">가구 목록 · {option.furniture.reduce((s, f) => s + f.qty, 0)}점</summary>
            <div className="mt-3">
              <FurnitureTable furniture={option.furniture} styleId={version.selected_style} />
            </div>
          </details>
        </>
      ) : ok ? (
        <>
          <p className="rounded-xl bg-sand px-4 py-3 text-xs leading-relaxed text-muted">
            이 버전은 배치 편집 기능 이전에 만들어져 실제 구조(출입문·창·기둥 위치)가 없습니다.{" "}
            {!finished && (
              <Link href={`${base}/space`} className="text-brand underline">
                치수로 내 공간 만들기
              </Link>
            )}
            를 하면 가구를 직접 옮길 수 있어요.
          </p>
          <LayoutStudio
            key={version.id}
            options={version.result.options}
            savedOption={version.selected_option}
            savedStyle={version.selected_style}
            recommendedOption={version.result.recommended}
            skipped={version.result.skipped}
            recommended={brief.style}
            save={finished ? undefined : { projectId: project.id, versionId: version.id, locked: version.id === requested?.id }}
          />
          <Advisories result={version.result} />
          <section className="card">
            <h2 className="h-section">입력한 정보가 배치에 쓰인 방식</h2>
            <CoverageTable rows={inputCoverage(version.input, version.result, { files: getFiles(project.id).length, refs: getProjectRefs(project.id).length })} />
          </section>
        </>
      ) : (
        <NeedsReview result={version.result}>
          {!finished && (
            <Link href={`${base}/space`} className="underline">
              치수를 넣어 내 공간 만들기
            </Link>
          )}
          를 하거나, 이대로 상담을 접수하면 운영자가 사진과 도면을 보고 검토합니다.
        </NeedsReview>
      )}

      <section className="card">
        <h2 className="h-section">운영자에게 수정 요청</h2>
        <p className="mb-3 text-xs leading-relaxed text-muted">가구는 ‘배치 수정’에서 직접 옮길 수 있어요. 칸막이·방 크기처럼 아직 직접 바꿀 수 없는 것은 글로 남기면 운영자가 확인합니다. 예: “회의실을 입구 옆으로 옮기고 싶어요.”</p>
        {!finished && (
          <form action={addChangeRequest.bind(null, project.id)} className="flex gap-2">
            <input className="input" name="body" placeholder="수정하고 싶은 내용을 적어 주세요" required aria-label="수정 요청 내용" />
            <button className="btn shrink-0">남기기</button>
          </form>
        )}
        <ul className="mt-4 space-y-3 text-sm empty:hidden">
          {changes.map((c) => (
            <li key={c.id} className="rounded-lg border border-line bg-white p-3">
              <div className="mb-1 flex items-center gap-2 text-xs text-muted">
                <Badge tone={c.status === "open" ? "warn" : "brand"}>{c.status === "open" ? "확인 대기" : "답변 완료"}</Badge>
                {dateKo(c.created_at)} · {versions.find((v) => v.id === c.version_id)?.room ? "버전 " : "v"}
                {versions.find((v) => v.id === c.version_id)?.no}
              </div>
              {c.body}
              {c.reply && <p className="mt-2 border-t border-line pt-2 text-muted">운영자: {c.reply}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
