import PostReferences from "@/components/community/PostReferences";
import {projectPostRefs} from "@/lib/post-refs";
import {latestRevision} from "@/lib/request-snapshot";
import Link from "next/link";
import { notFound } from "next/navigation";
import PlanSvg from "@/components/PlanSvg";
import PrintViewer from "@/components/PrintViewer";
import HousePrint from "@/components/house/HousePrint";
import { PrintButton } from "@/components/client";
import { BriefTable, BulletList } from "@/components/project";
import { BRAND } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { buildBrief, homeBrief } from "@/lib/brief";
import { HOME_TYPES } from "@/lib/home";
import { CONCEPT_FURNITURE_TEXT, ROOM_BADGE, ROOM_VENDOR_TEXT, composeRoom, describeHomeRoom } from "@/lib/space/home-room";
import type { Project, Version } from "@/lib/data";
import { dateKo } from "@/lib/constants";
import { getOwnedProject, getVersions } from "@/lib/data";
import { getStyle, styleColor } from "@/lib/styles";
import { sourceLabel, versionOption } from "@/lib/space/view";

export default async function PrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const user = await requireUser("customer", "admin");
  const project = getOwnedProject(Number((await params).id), user);
  if (!project) notFound();
  const versions = getVersions(project.id);
  const wanted = Number((await searchParams).v);
  const version = versions.find((v) => v.id === wanted) ?? versions.find((v) => v.id === project.current_version_id);
  if (version?.home) return <HomePrint project={project} version={version} />;
  if (!version || version.layout_status !== "ok") notFound();
  const option = versionOption(version)!;
  const space = !!version.room;
  const style = getStyle(version.selected_style);
  const brief = buildBrief(project, version.input, version.result, version.room);
  const half = Math.ceil(option.furniture.length / 2);
  const head = (page: string) => (
    <header className="mb-4 flex items-end justify-between border-b border-ink pb-2">
      <div>
        <p className="text-[10px] tracking-[0.25em] text-muted">OFFICE LAYOUT STUDY · 업체 전달용</p>
        <h1 className="text-xl font-bold">{project.region} 사무실 배치 검토안</h1>
      </div>
      <p className="text-right text-xs text-muted">
        {space ? `버전 ${version.no} · ${sourceLabel(version.source)}` : `v${version.no} · ${option.title}`} · {style.name}
        <br />
        {dateKo(version.created_at)} · {BRAND} · {page}
      </p>
    </header>
  );

  return (
    <div className="mx-auto w-full max-w-[1500px] p-4 print:max-w-none print:p-0">
      <style>{`@page { size: A3 landscape; margin: 12mm; } @media print { footer { display: none; } }`}</style>
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <PrintButton />
        <Link href={`/projects/${project.id}/plan?v=${version.id}`} className="btn">
          돌아가기
        </Link>
        <span className="text-sm text-muted">3D는 드래그로 돌린 시점 그대로 인쇄됩니다. 인쇄 창에서 대상을 ‘PDF로 저장’, 용지를 A3 가로로 선택하세요. 저장한 선택({option.title} · {style.name}) 기준입니다.</span>
      </div>

      <section className="break-after-page bg-white p-6 print:p-0">
        {head("1 / 2")}
        <div className="grid grid-cols-[minmax(0,1fr)_330px] gap-6">
          <PlanSvg option={option} styleId={style.id} space={space} />
          <div className="space-y-5">
            <div>
              <h2 className="h-section">요구사항</h2>
              <BriefTable brief={brief} />
            </div>
            <div>
              <h2 className="h-section">마감 방향 · {style.name}</h2>
              <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
                {style.specs.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-[11px] text-muted">색상은 분위기 제안이며 자재 지정이 아닙니다.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 bg-white p-6 print:mt-0 print:p-0">
        {head("2 / 2")}
        <div className="grid grid-cols-[minmax(0,1fr)_400px] gap-6">
          <PrintViewer option={option} styleId={style.id} />
          <div className="space-y-4 text-xs">
            <div>
              <h2 className="h-section">설계 가정</h2>
              <BulletList items={version.result.assumptions} />
            </div>
            <div>
              <h2 className="h-section">시공업체 확인 사항</h2>
              <BulletList items={brief.vendorChecks} />
            </div>
          </div>
        </div>
        <h2 className="h-section mt-5">가구 목록</h2>
        <div className="grid grid-cols-2 gap-6">
          {[option.furniture.slice(0, half), option.furniture.slice(half)].map((list, i) => (
            <table key={i} className="table-base h-fit text-xs">
              <thead>
                <tr>
                  <th>종류</th>
                  <th>규격 (mm)</th>
                  <th>수량</th>
                  <th>색상</th>
                </tr>
              </thead>
              <tbody>
                {list.map((f) => (
                  <tr key={`${f.type}${f.spec}${f.color}`}>
                    <td className="!py-1">{f.type}</td>
                    <td className="!py-1">{f.spec}</td>
                    <td className="!py-1">{f.qty}</td>
                    <td className="!py-1">
                      <i className="mr-1.5 inline-block size-3 rounded border border-black/10 align-middle" style={{ background: styleColor(style, f.color), printColorAdjust: "exact" }} />
                      {styleColor(style, f.color)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      </section>
      <PostReferences refs={latestRevision(project.id,version.id)?.snapshot.postRefs ?? projectPostRefs(project.id)}/>
    </div>
  );
}

/** 집 요청 인쇄·PDF. 집 정보와 방 한 칸 배치들(방마다 따로 그린 참고 배치)을 싣는다. */
function HomePrint({ project, version }: { project: Project; version: Version }) {
  const home = version.home!;
  const brief = homeBrief(project, home, version.rooms.length);
  return (
    <div className="mx-auto w-full max-w-[1100px] p-4 print:max-w-none print:p-0" data-testid="home-print">
      <style>{`@page { size: A4 portrait; margin: 12mm; } @media print { footer { display: none; } }`}</style>
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <PrintButton />
        <Link href={`/projects/${project.id}`} className="btn">
          돌아가기
        </Link>
        <span className="text-sm text-muted">인쇄 창에서 대상을 ‘PDF로 저장’으로 고르세요.</span>
      </div>
      <section className="bg-white p-6 print:p-0">
        <header className="mb-4 flex items-end justify-between border-b border-ink pb-2">
          <div>
            <p className="text-[10px] tracking-[0.25em] text-muted">HOME REQUEST · 업체 전달용</p>
            <h1 className="text-xl font-bold">
              {project.region} {HOME_TYPES[home.homeType]} 상담 요청서
            </h1>
          </div>
          <p className="text-right text-xs text-muted">
            {dateKo(version.created_at)} · {BRAND}
          </p>
        </header>
        <div className="grid gap-6 sm:grid-cols-2 print:grid-cols-2">
          <div>
            <h2 className="h-section">요청 내용</h2>
            <BriefTable brief={brief} />
          </div>
          <div>
            <h2 className="h-section">시공업체 확인 사항</h2>
            <BulletList items={brief.vendorChecks} />
          </div>
        </div>
        <h2 className="h-section mt-6">방 배치 · {version.rooms.length}개</h2>
        {version.rooms.length ? (
          <>
            <p className="mb-3 text-xs text-muted">{ROOM_VENDOR_TEXT}</p>
            <div className="grid gap-5 sm:grid-cols-2 print:grid-cols-2">
              {version.rooms.map((r) => (
                <figure key={r.id} className="break-inside-avoid rounded-lg border border-line p-3" data-testid={`print-room-${r.id}`}>
                  <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <b>
                      {r.name} · 배치 {r.rev}
                    </b>
                    <span className="text-[11px] text-warn">{ROOM_BADGE}</span>
                  </figcaption>
                  <PlanSvg option={composeRoom(r)} styleId="natural" space />
                  <p className="mt-2 text-[11px] text-muted">
                    {describeHomeRoom(r.room).size} · 가구 {r.items.length}점 · {CONCEPT_FURNITURE_TEXT}
                  </p>
                </figure>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">방 배치 없음(선택 항목)</p>
        )}
        {version.house && (
          <>
            <h2 className="h-section mt-6">집 전체 평면</h2>
            <HousePrint house={version.house} />
          </>
        )}
      </section>
      <PostReferences refs={latestRevision(project.id,version.id)?.snapshot.postRefs ?? projectPostRefs(project.id)}/>
    </div>
  );
}
