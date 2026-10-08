import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import HomeRoomForm from "@/components/home/HomeRoomForm";
import { Page, PageTitle } from "@/components/ui";
import { createRoom } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { getOwnedProject, getVersion } from "@/lib/data";
import { MAX_ROOMS } from "@/lib/space/home-room";

export default async function NewRoom({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("customer", "admin");
  const project = getOwnedProject(Number((await params).id), user);
  if (!project) notFound();
  const current = getVersion(project.current_version_id);
  if (project.kind !== "home" || !current?.home || ["contracted", "closed"].includes(project.status)) redirect(`/projects/${project.id}`);
  if (current.rooms.length >= MAX_ROOMS) redirect(`/projects/${project.id}/plan`);
  return (
    <Page>
      <Link href={`/projects/${project.id}/plan`} className="text-sm text-muted hover:text-ink">
        ← 방 배치
      </Link>
      <div className="mt-2">
        <PageTitle title="방 한 칸 만들기" sub={`치수를 아는 방 하나를 넣고 가구를 직접 놓아요. 요청 하나에 ${MAX_ROOMS}개까지, 방마다 따로 관리해요.`} />
      </div>
      <HomeRoomForm action={createRoom.bind(null, project.id)} mode="new" />
    </Page>
  );
}
