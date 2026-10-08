import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProjectForm } from "@/components/forms";
import { Notice, Page, PageTitle } from "@/components/ui";
import { updateProject } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { getOwnedProject, getVersion } from "@/lib/data";

export default async function EditProject({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("customer", "admin");
  const project = getOwnedProject(Number((await params).id), user);
  if (!project) notFound();
  const version = getVersion(project.current_version_id);
  // 내 공간은 공간 정보(치수·구성)와 요청 내용(예산·일정)을 따로 고친다. 이 화면은 편집 기능 이전 요청용이다.
  if (version?.room) redirect(`/projects/${project.id}/request`);
  return (
    <Page narrow>
      <PageTitle title="조건 변경" sub={`${project.title} · 현재 v${version?.no ?? 1}`} />
      <div className="mb-4">
        <Notice>
          공간 조건(면적, 치수, 인원, 필요한 공간 등)을 바꾸면 <b>새 버전</b>이 만들어지고 이전 버전은 그대로 남습니다.
          {project.requested_version_id && " 이미 요청한 견적은 이전 버전 기준이므로, 새 버전으로 견적을 받으려면 다시 요청해야 합니다."}
        </Notice>
      </div>
      <ProjectForm
        mode="edit"
        action={updateProject.bind(null, project.id)}
        project={project}
        input={version?.input}
        cancel={
          <Link href={`/projects/${project.id}`} className="btn">
            취소
          </Link>
        }
      />
    </Page>
  );
}
