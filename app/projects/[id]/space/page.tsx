import Link from "next/link";
import { notFound } from "next/navigation";
import SpaceWizard from "@/components/space/SpaceWizard";
import TraceTool from "@/components/space/TraceTool";
import { Page, PageTitle } from "@/components/ui";
import { updateSpace } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { getOwnedProject, getVersion } from "@/lib/data";
import { roomToDraft } from "@/lib/space/trace";

export default async function EditSpace({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ trace?: string }> }) {
  const user = await requireUser("customer", "admin");
  const project = getOwnedProject(Number((await params).id), user);
  if (!project) notFound();
  const version = getVersion(project.current_version_id);
  if (!version) notFound();
  const q = await searchParams;
  const i = version.input;
  const needs = { staff: i.staff, ceo: i.ceo, meeting: i.meeting, meetingSeats: i.meetingSeats, pantry: i.pantry, storage: i.storage, priority: i.priority ?? "unknown" };
  const cancel = (
    <Link href={`/projects/${project.id}/plan`} className="btn btn-sm">
      취소
    </Link>
  );
  // 도면에서 따라 그린 공간은 같은 도면 위에서 고친다. 치수로 만든 공간도 ?trace=1이면 도면 따라 그리기로 새로 그릴 수 있다.
  const draft = version.room?.source === "trace" ? roomToDraft(version.room) : null;
  if (draft || q.trace === "1") {
    return (
      <Page>
        <PageTitle title="도면 따라 그리기로 공간 고치기" sub={`${project.title} · 지금 버전 ${version.no}${draft ? " · 저장된 도면 위에서 고쳐요" : " · 도면을 올려 새로 그려요"}`} />
        <TraceTool
          action={updateSpace.bind(null, project.id)}
          mode="edit"
          title={project.title}
          initialDraft={draft}
          initialRoom={version.room ?? undefined}
          underlayUrl={draft && version.room?.underlay?.fileId ? `/files/${version.room.underlay.fileId}` : null}
          initialNeeds={needs}
          cancel={cancel}
        />
      </Page>
    );
  }
  return (
    <Page>
      <PageTitle title={version.room ? "공간 정보 고치기" : "치수로 내 공간 만들기"} sub={version.room ? `${project.title} · 지금 버전 ${version.no}` : `${project.title} · 실제 치수를 넣으면 3D 공간을 만들고 가구를 직접 옮길 수 있어요.`} />
      <p className="mb-4 text-xs text-muted">
        도면이 있으면{" "}
        <Link href="?trace=1" className="text-brand underline" data-testid="edit-trace">
          도면 따라 그리기
        </Link>
        로 실제 모양대로 다시 그릴 수 있어요(PC 권장).
      </p>
      <SpaceWizard action={updateSpace.bind(null, project.id)} mode="edit" title={project.title} initialRoom={version.room ?? undefined} initialNeeds={needs} cancel={cancel} />
    </Page>
  );
}
