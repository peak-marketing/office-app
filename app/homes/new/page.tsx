import { referencePost } from "@/lib/post-refs";
import Link from "next/link";
import { redirect } from "next/navigation";
import HomeForm from "@/components/home/HomeForm";
import { Page, PageTitle } from "@/components/ui";
import { createHome } from "@/lib/actions";
import { currentUser, homeFor } from "@/lib/auth";
import { getCase, getSavedCases } from "@/lib/data";
import { HOME_TYPES, type HomeInput, type HomeType } from "@/lib/home";

export default async function NewHome({ searchParams }: { searchParams: Promise<{ post?:string; postPhoto?:string; case?: string; type?: string; region?: string; area?: string }> }) {
  const q = await searchParams;
  const reference=referencePost(Number(q.post),Number(q.postPhoto) || undefined);
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/homes/new?${new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][])}`)}`);
  if (user.role !== "customer") redirect(homeFor(user));
  // 공간 탐색에서 온 사례는 참고 사례로 미리 골라 둔다.
  const start = q.case ? getCase(Number(q.case)) : undefined;
  const saved = [...(start ? [start] : []), ...getSavedCases(user.id).filter((c) => c.id !== start?.id)];
  // 주소로 찾기에서 온 값: 주거 유형·지역·전용면적(㎡, 건축물대장)
  const type = start?.spec.kind === "home" && start.spec.homeType ? start.spec.homeType : q.type && q.type in HOME_TYPES ? (q.type as HomeType) : null;
  const area = Number(q.area) > 0 && Number(q.area) < 1000 ? Math.round(Number(q.area) * 100) / 100 : null;
  const home: HomeInput | undefined = type || area ? { kind: "home", homeType: type ?? ("" as never), scope: "" as never, works: [], spaces: [], area, areaUnit: area ? "m2" : "pyeong", areaBasis: area ? "exclusive" : "unknown", rooms: null, baths: null, builtYear: null, occupancy: null, rules: "" } : undefined;
  return (
    <Page>
      <PageTitle title="집 상담 신청" sub="원룸·오피스텔·빌라·아파트. 도면이나 치수, 사진이 없어도 신청할 수 있어요." />
      <p className="mb-5 text-sm text-muted">
        사무실이라면{" "}
        <Link href="/spaces/new" className="font-semibold text-brand underline-offset-2 hover:underline">
          사무실 공간 만들기
        </Link>
        로 시작하세요.
      </p>
      <HomeForm reference={reference} action={createHome} mode="new" home={home} values={q.region ? { region: q.region.slice(0, 40) } : undefined} refs={saved.map((c) => ({ id: c.id, title: c.title, photo: c.photos[0] ?? null, checked: c.id === start?.id }))} />
    </Page>
  );
}
