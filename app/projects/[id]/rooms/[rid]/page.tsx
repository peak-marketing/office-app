import { notFound, redirect } from "next/navigation";
import HomeRoomEditor from "@/components/home/HomeRoomEditor";
import { requireUser } from "@/lib/auth";
import { placeableTemplates } from "@/lib/shop-place";
import { getOwnedProject, getVersion } from "@/lib/data";
import { lastSentRevision } from "@/lib/request-snapshot";
import { homeCatalogItems } from "@/lib/space/home-room";

export default async function RoomEditorPage({ params, searchParams }: { params: Promise<{ id: string; rid: string }>; searchParams: Promise<{ saved?: string; add?: string }> }) {
  const { id, rid } = await params;
  const user = await requireUser("customer", "admin");
  const project = getOwnedProject(Number(id), user);
  if (!project) notFound();
  const current = getVersion(project.current_version_id);
  const target = current?.rooms.find((x) => x.id === rid);
  if (!target) redirect(`/projects/${project.id}/plan`);
  const sent = project.requested_version_id ? lastSentRevision(project.id) : undefined;
  const sentRoom = sent?.snapshot.rooms?.find((x) => x.id === rid);
  const q = await searchParams;
  return (
    <HomeRoomEditor
      key={`${target.id}-${target.rev}`}
      projectId={project.id}
      roomId={target.id}
      name={target.name}
      rev={target.rev}
      room={target.room}
      items={target.items}
      catalog={homeCatalogItems()}
      products={placeableTemplates()}
      initialAdd={q.add?.startsWith("product:") ? q.add : null}
      sentRev={sentRoom?.rev ?? null}
      requested={!!project.requested_version_id}
      readOnly={project.status === "contracted" || project.status === "closed"}
      justSaved={q.saved ? `배치 ${q.saved}로 저장했어요. 다시 열어도 이 배치와 크기 그대로예요.` : null}
    />
  );
}
