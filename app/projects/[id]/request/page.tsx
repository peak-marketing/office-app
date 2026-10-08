import PostReferences from "@/components/community/PostReferences";
import {projectPostRefs} from "@/lib/post-refs";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import HomeForm from "@/components/home/HomeForm";
import PlanSvg from "@/components/PlanSvg";
import RequestForm from "@/components/space/RequestForm";
import { Page, PageTitle } from "@/components/ui";
import { saveHomeRequest, saveRequest } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { dateKo } from "@/lib/constants";
import { getOwnedProject, getProjectRefs, getSavedCases, getVersion, getVersions, type Project } from "@/lib/data";
import { getRequestRevisions } from "@/lib/request-snapshot";
import { sourceLabel, versionOption } from "@/lib/space/view";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("customer", "admin");
  const project = getOwnedProject(Number((await params).id), user);
  if (!project) notFound();
  if (project.status === "contracted" || project.status === "closed") redirect(`/projects/${project.id}`);
  if (project.kind === "home") return <HomeRequestPage project={project} savedFor={user.role === "customer" ? user.id : null} />;
  const versions = getVersions(project.id).filter((v) => v.room && v.placement);
  // 편집 기능 이전 요청은 기존 흐름(조건 변경·견적 요청)을 쓴다.
  if (!versions.length) redirect(`/projects/${project.id}`);
  const sentIds = new Set(getRequestRevisions(project.id).map((r) => r.version_id));
  const requested = !!project.requested_version_id;
  const refs = getProjectRefs(project.id);
  const saved = user.role === "customer" ? getSavedCases(user.id) : [];
  const refOptions = [...refs.map((r) => ({ id: r.c.id, title: r.c.title, photo: r.file_id ?? r.c.photos[0] ?? null, checked: true })), ...saved.filter((c) => !refs.some((r) => r.case_id === c.id)).map((c) => ({ id: c.id, title: c.title, photo: c.photos[0] ?? null, checked: false }))];
  return (
    <Page>
      <Link href={`/projects/${project.id}`} className="text-sm text-muted hover:text-ink">
        ← {project.title}
      </Link>
      <div className="mt-2">
        <PageTitle title={requested ? "요청 내용 고치기" : "시공 제안 요청"} sub={requested ? "고친 내용은 ‘변경 내용 보내기’를 눌러야 업체에 전달돼요." : "저장한 배치를 골라 여러 업체의 비공개 견적·설계 제안을 받아 비교해요."} />
      </div>
      <RequestForm
        bid={{ mode: project.bid_mode, cap: project.bid_cap }}
        action={saveRequest.bind(null, project.id)}
        requested={requested}
        basisId={project.current_version_id ?? versions[0].id}
        bases={versions.slice(0, 9).map((v) => {
          const option = versionOption(v);
          return {
            id: v.id,
            no: v.no,
            label: sourceLabel(v.source) || "배치",
            note: v.note,
            date: dateKo(v.created_at),
            furniture: v.input.furnitureIncluded,
            sent: sentIds.has(v.id),
            thumb: option ? <PlanSvg option={option} styleId="natural" thumb /> : null,
          };
        })}
        values={project}
        refs={refOptions}
      />
      <PostReferences refs={projectPostRefs(project.id)}/>
    </Page>
  );
}

/** 집 요청 내용 고치기. 요청 전이면 여기서 상담 요청을 보낼 수 있다. */
function HomeRequestPage({ project, savedFor }: { project: Project; savedFor: number | null }) {
  const current = getVersion(project.current_version_id);
  if (!current?.home) redirect(`/projects/${project.id}`);
  const requested = !!project.requested_version_id;
  const refs = getProjectRefs(project.id);
  const saved = savedFor ? getSavedCases(savedFor) : [];
  const refOptions = [...refs.map((r) => ({ id: r.c.id, title: r.c.title, photo: r.file_id ?? r.c.photos[0] ?? null, checked: true })), ...saved.filter((c) => !refs.some((r) => r.case_id === c.id)).map((c) => ({ id: c.id, title: c.title, photo: c.photos[0] ?? null, checked: false }))];
  return (
    <Page>
      <Link href={`/projects/${project.id}`} className="text-sm text-muted hover:text-ink">
        ← {project.title}
      </Link>
      <div className="mt-2">
        <PageTitle title={requested ? "요청 내용 고치기" : "집 상담 요청"} sub={requested ? "고친 내용은 ‘변경 내용 보내기’를 눌러야 업체에 전달돼요." : "확인하고 상담 요청을 보내면 운영자가 주거 시공이 가능한 업체를 골라 같은 요청을 보내요."} />
      </div>
      <HomeForm action={saveHomeRequest.bind(null, project.id)} mode="edit" requested={requested} bid={{ mode: project.bid_mode, cap: project.bid_cap }} home={current.home} values={project} refs={refOptions} roomCount={current.rooms.length} />
      <PostReferences refs={projectPostRefs(project.id)}/>
    </Page>
  );
}
