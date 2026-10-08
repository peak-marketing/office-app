import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import HouseCreate from "@/components/house/HouseCreate";
import { Page, PageTitle } from "@/components/ui";
import { createHouse } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { getOwnedProject, getVersion } from "@/lib/data";

export default async function NewHouse({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const user = await requireUser("customer", "admin");
  const project = getOwnedProject(Number((await params).id), user);
  if (!project) notFound();
  const current = getVersion(project.current_version_id);
  if (project.kind !== "home" || !current?.home || ["contracted", "closed"].includes(project.status)) redirect(`/projects/${project.id}`);
  if (current.house) redirect(`/projects/${project.id}/house/edit`);
  const from = (await searchParams).from === "trace" ? "trace" : "dims";
  return (
    <Page>
      <Link href={`/projects/${project.id}/house`} className="text-sm text-muted hover:text-ink">
        ← 집 전체 평면
      </Link>
      <div className="mt-2">
        <PageTitle title="집 전체 평면 만들기" sub="도면이나 실측 치수로 바깥 벽을 만들고, 다음 화면에서 내부 벽·문·창·방 이름·가구를 넣어요." />
      </div>
      <HouseCreate action={createHouse.bind(null, project.id)} initial={from} />
    </Page>
  );
}
