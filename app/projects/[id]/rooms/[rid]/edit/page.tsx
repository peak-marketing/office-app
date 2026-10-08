import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import HomeRoomForm from "@/components/home/HomeRoomForm";
import { Page, PageTitle } from "@/components/ui";
import { updateRoom } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { getOwnedProject, getVersion } from "@/lib/data";

export default async function EditRoom({ params }: { params: Promise<{ id: string; rid: string }> }) {
  const { id, rid } = await params;
  const user = await requireUser("customer", "admin");
  const project = getOwnedProject(Number(id), user);
  if (!project) notFound();
  const current = getVersion(project.current_version_id);
  const target = current?.rooms.find((x) => x.id === rid);
  if (!target || ["contracted", "closed"].includes(project.status)) redirect(`/projects/${project.id}/plan`);
  return (
    <Page>
      <Link href={`/projects/${project.id}/rooms/${rid}`} className="text-sm text-muted hover:text-ink">
        ← {target.name} 가구 배치
      </Link>
      <div className="mt-2">
        <PageTitle title={`${target.name} · 방 정보 고치기`} sub="이름·치수·문·창·고정 구조물을 고쳐요. 놓은 가구는 그대로 남아요." />
      </div>
      <HomeRoomForm action={updateRoom.bind(null, project.id, rid)} mode="edit" initial={{ name: target.name, room: target.room }} />
    </Page>
  );
}
