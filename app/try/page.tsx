import Link from "next/link";
import HomeDemo from "@/components/HomeDemo";
import { Page } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { getCase } from "@/lib/data";
import { DEMO_DEFAULT, type DemoState } from "@/lib/demo";
import { STYLES } from "@/lib/styles";

export const metadata = { title: "내 공간 배치 제안" };

type Query = Partial<Record<"area" | "staff" | "ceo" | "meeting" | "seats" | "pantry" | "storage" | "style" | "option" | "entrance" | "priority" | "case", string>>;

function demoFromQuery(q: Query): DemoState {
  const s = { ...DEMO_DEFAULT };
  const area = Number(q.area);
  const staff = Number(q.staff);
  const seats = Number(q.seats);
  if (Number.isInteger(area) && area >= 20 && area <= 50) s.area = area;
  if (Number.isInteger(staff) && staff >= 1 && staff <= 60) s.staff = staff;
  if ([4, 6, 8, 10, 12].includes(seats)) s.meetingSeats = seats;
  for (const key of ["ceo", "meeting", "pantry", "storage"] as const) if (q[key] === "1" || q[key] === "0") s[key] = q[key] === "1";
  if (STYLES.some((st) => st.id === q.style)) s.style = q.style!;
  if (q.entrance === "left") s.entrance = "left";
  if (q.priority === "visitor" || q.priority === "collab" || q.priority === "focus") s.priority = q.priority;
  if (q.option === "visitor" || q.option === "collab" || q.option === "focus") s.option = q.option;
  return s;
}

export default async function TryPage({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await currentUser();
  const query = await searchParams;
  const ref = query.case ? getCase(Number(query.case)) : undefined;
  return (
    <Page>
      <section className="pb-6 pt-2">
        <p className="eyebrow">내 공간 배치 제안</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">같은 공간, 목적이 다른 배치를 비교해 보세요</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          평수, 인원, 필요한 방을 넣으면 방문객 응대·직원 협업·집중 업무 가운데 이 공간에서 가능한 배치를 만들어 드립니다. 고른 배치는 시공사에 보내는 <b className="text-ink">요청의 기준 자료</b>가 됩니다.
        </p>
        {ref && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-xs text-muted">
            참고 사례 <b className="text-ink">{ref.title}</b>의 평수와 스타일을 불러왔습니다
          </p>
        )}
      </section>
      <HomeDemo initial={demoFromQuery(query)} loggedIn={!!user} canStart={user?.role === "customer"} refCase={ref ? { id: ref.id, title: ref.title } : undefined} />
      <p className="mt-8 text-center text-sm text-muted">
        배치 없이 바로 요청하고 싶다면{" "}
        <Link href={user ? "/spaces/new" : `/signup?next=${encodeURIComponent("/spaces/new")}`} className="text-brand underline">
          공사 요청 등록
        </Link>
        으로 가세요. 자동 배치가 어려운 공간도 접수할 수 있습니다.
      </p>
    </Page>
  );
}
