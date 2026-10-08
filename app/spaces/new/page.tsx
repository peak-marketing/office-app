import { referencePost } from "@/lib/post-refs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { KindBadge } from "@/components/explore/KindBadge";
import { styleName } from "@/components/cases";
import SpaceWizard, { type SpaceNeeds } from "@/components/space/SpaceWizard";
import { Page } from "@/components/ui";
import { createSpace } from "@/lib/actions";
import { currentUser, homeFor } from "@/lib/auth";
import { getCase } from "@/lib/data";

type Query = Partial<Record<"post" | "postPhoto" | "case" | "photo" | "area" | "staff" | "ceo" | "meeting" | "seats" | "pantry" | "storage" | "priority" | "option", string>>;

/** 사례·배치 체험에서 넘어온 조건. 범위를 벗어난 값은 버린다. */
function needsFrom(q: Query, c?: ReturnType<typeof getCase>): SpaceNeeds | undefined {
  const flag = (v: string | undefined, fallback: boolean) => (v === "1" ? true : v === "0" ? false : fallback);
  const staff = Number(q.staff) || c?.spec.staff;
  const seats = Number(q.seats) || c?.spec.meetingSeats;
  const rooms = c?.spec.rooms;
  const purpose = [q.priority, q.option].find((v) => v === "visitor" || v === "collab" || v === "focus");
  if (!staff && !rooms && !purpose) return undefined;
  return {
    staff: staff && staff >= 1 && staff <= 200 ? Math.round(staff) : 8,
    ceo: flag(q.ceo, rooms ? rooms.includes("ceo") : true),
    meeting: flag(q.meeting, rooms ? rooms.includes("meeting") : true),
    meetingSeats: [4, 6, 8, 10, 12].includes(Number(seats)) ? Number(seats) : 6,
    pantry: flag(q.pantry, rooms ? rooms.includes("pantry") : true),
    storage: flag(q.storage, rooms ? rooms.includes("storage") : false),
    priority: purpose ?? "unknown",
  };
}

export default async function NewSpace({ searchParams }: { searchParams: Promise<Query> }) {
  const q = await searchParams;
  const reference=referencePost(Number(q.post),Number(q.postPhoto) || undefined);
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/spaces/new?${new URLSearchParams(q as Record<string, string>)}`)}`);
  if (user.role !== "customer") redirect(homeFor(user));
  const ref = q.case ? getCase(Number(q.case)) : undefined;
  const photo = ref && ref.photos.includes(Number(q.photo)) ? Number(q.photo) : ref?.photos[0];
  const area = Number(q.area) || ref?.area_pyeong || undefined;
  return (
    <Page>
      <header className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight">{ref ? "이 공간을 참고해 내 공간을 만들어요" : "내 공간 만들기"}</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          실제 치수로 우리 사무실을 3D로 만들고, 가구를 직접 옮겨 저장해요. 공사 요청은 하지 않아도 되고, 원할 때 저장한 배치로 시공 제안을 받을 수 있어요.
        </p>
      </header>
      {ref && (
        <div className="ref-hero mb-6" data-testid="start-case">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- 업로드 파일
            <img src={`/files/${photo}`} alt={ref.title} />
          ) : (
            <span className="aspect-[4/3] rounded-xl bg-white" />
          )}
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-brand">
              참고하는 공간 · 내 공간에 함께 붙여 둘게요
              <KindBadge example={ref.is_example} />
            </p>
            <p className="mt-1.5 line-clamp-2 text-[15px] font-bold leading-snug sm:text-lg">{ref.title}</p>
            <p className="mt-1 truncate text-xs text-muted sm:text-sm">
              {[ref.area_pyeong != null && `${ref.area_pyeong}평`, ref.spec.staff && `${ref.spec.staff}명`, styleName(ref.style)].filter(Boolean).join(" · ")} · {ref.company}
            </p>
          </div>
        </div>
      )}
      <div className="mb-5 flex flex-wrap gap-2"><Link href="/spaces/recognize" className="btn btn-sm">주거 도면 AI로 읽기</Link><Link href="/spaces/templates" className="btn btn-sm">아파트 등록 도면 찾기</Link></div>
      <SpaceWizard
        reference={reference}
        action={createSpace}
        mode="new"
        refCase={ref?.id}
        refPhoto={photo}
        areaHint={area}
        initialNeeds={needsFrom(q, ref)}
        cancel={
          <Link href={ref ? `/cases/${ref.id}` : "/projects"} className="btn btn-sm">
            취소
          </Link>
        }
      />
    </Page>
  );
}
