import { referencePost } from "@/lib/post-refs";
import Link from "next/link";
import { redirect } from "next/navigation";
import TraceTool from "@/components/space/TraceTool";
import { Page } from "@/components/ui";
import { createSpace } from "@/lib/actions";
import { currentUser, homeFor } from "@/lib/auth";
import { getCase } from "@/lib/data";

export default async function TraceSpace({ searchParams }: { searchParams: Promise<{ post?:string; postPhoto?:string; case?: string; photo?: string }> }) {
  const q = await searchParams;
  const reference=referencePost(Number(q.post),Number(q.postPhoto) || undefined);
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/spaces/trace?${new URLSearchParams(q as Record<string, string>)}`)}`);
  if (user.role !== "customer") redirect(homeFor(user));
  const ref = q.case ? getCase(Number(q.case)) : undefined;
  const photo = ref && ref.photos.includes(Number(q.photo)) ? Number(q.photo) : ref?.photos[0];
  return (
    <Page>
      <header className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight">도면 따라 그려 내 공간 만들기</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          도면을 밑그림으로 띄우고 바깥 벽 모서리를 차례로 찍어 실내 외곽 형태대로 공간을 만들고, 출입문·창·기둥을 놓아요. ㄱ자처럼 꺾인 공간도 그대로 만들어요. 도면을 자동으로 읽지는 않으며, 공간 안의 벽·방문은 아직 그리지 않아요.
        </p>
      </header>
      <TraceTool
        reference={reference}
        action={createSpace}
        mode="new"
        refCase={ref?.id}
        refPhoto={photo}
        cancel={
          <Link href={reference ? `/spaces/new?post=${reference.postId}&postPhoto=${reference.photoId}` : "/spaces/new"} className="btn btn-sm">
            치수 입력으로 만들기
          </Link>
        }
      />
    </Page>
  );
}
