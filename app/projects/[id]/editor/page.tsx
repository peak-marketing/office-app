import { notFound, redirect } from "next/navigation";
import LayoutEditor from "@/components/space/LayoutEditor";
import { requireUser } from "@/lib/auth";
import { placeableTemplates } from "@/lib/shop-place";
import { getOwnedProject, getVersions } from "@/lib/data";
import { catalogItems } from "@/lib/layout/generate";
import { lastSentRevision } from "@/lib/request-snapshot";
import { isPolygon } from "@/lib/space/geometry";
import { ENTRANCE_RANGE_TEXT, entranceSupport } from "@/lib/space/room";

export default async function EditorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string; saved?: string; add?: string }> }) {
  const user = await requireUser("customer", "admin");
  const project = getOwnedProject(Number((await params).id), user);
  if (!project) notFound();
  const q = await searchParams;
  const versions = getVersions(project.id);
  const version = versions.find((v) => v.id === Number(q.v)) ?? versions.find((v) => v.id === project.current_version_id) ?? versions[0];
  // 편집 기능 이전에 만든 버전(실제 구조 없음)은 편집할 수 없다.
  if (!version?.room || !version.placement) redirect(`/projects/${project.id}/plan`);
  const sentRev = lastSentRevision(project.id);
  const sent = versions.find((v) => v.id === project.requested_version_id);
  const finished = project.status === "contracted" || project.status === "closed";
  return (
    <LayoutEditor
      key={version.id}
      projectId={project.id}
      version={{ id: version.id, no: version.no, source: version.source }}
      title={project.title}
      room={version.room}
      staff={version.input.staff}
      start={version.selected_option}
      options={version.result.options}
      recommended={version.result.recommended ?? null}
      skipped={(version.result.skipped ?? []).map((s) => ({ title: s.title, reason: s.reason }))}
      noAuto={
        version.result.options.length
          ? []
          : isPolygon(version.room)
            ? [entranceSupport(version.room).reason!, "꺾인 공간의 자동 배치는 이번 개발 범위에 들어 있지 않습니다."]
            : entranceSupport(version.room).supported
              ? version.result.reasons
              : [entranceSupport(version.room).reason!, `${ENTRANCE_RANGE_TEXT}이며, 넓히는 일은 테스트 결과를 보고 정합니다.`]
      }
      items={version.placement.items}
      catalog={catalogItems()}
      products={placeableTemplates()}
      initialAdd={q.add?.startsWith("product:") ? q.add : null}
      styleId={version.selected_style}
      sent={sent && sentRev ? { no: sent.no, rev: sentRev.no } : null}
      readOnly={finished}
      justSaved={q.saved ? `버전 ${q.saved}로 저장했어요. 다시 열어도 이 배치 그대로예요.` : null}
      underlayUrl={version.room.underlay?.fileId ? `/files/${version.room.underlay.fileId}` : null}
    />
  );
}
