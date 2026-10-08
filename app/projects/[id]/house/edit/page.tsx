import { notFound, redirect } from "next/navigation";
import HouseEditor from "@/components/house/HouseEditor";
import { requireUser } from "@/lib/auth";
import { placeableTemplates } from "@/lib/shop-place";
import { getOwnedProject, getVersion } from "@/lib/data";
import { lastSentRevision } from "@/lib/request-snapshot";
import { homeCatalogItems } from "@/lib/space/home-room";

export default async function HouseEditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; add?: string }> }) {
  const user = await requireUser("customer", "admin");
  const project = getOwnedProject(Number((await params).id), user);
  if (!project) notFound();
  const current = getVersion(project.current_version_id);
  if (project.kind !== "home" || !current?.home) redirect(`/projects/${project.id}`);
  const house = current.house;
  if (!house) redirect(`/projects/${project.id}/house`);
  const sent = project.requested_version_id ? lastSentRevision(project.id) : undefined;
  const q = await searchParams;
  return (
    <HouseEditor
      key={house.rev}
      projectId={project.id}
      house={house}
      catalog={homeCatalogItems()}
      products={placeableTemplates()}
      initialAdd={q.add?.startsWith("product:") ? q.add : null}
      underlayUrl={house.underlay?.fileId ? `/files/${house.underlay.fileId}` : null}
      sentRev={sent?.snapshot.house?.rev ?? null}
      requested={!!project.requested_version_id}
      readOnly={project.status === "contracted" || project.status === "closed"}
      justSaved={q.saved ? `평면 ${q.saved}로 저장했어요. 다시 열어도 이 평면 그대로예요.` : null}
    />
  );
}
