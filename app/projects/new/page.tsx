import { referencePost } from "@/lib/post-refs";
import Link from "next/link";
import { caseMeta, styleName } from "@/components/cases";
import { KindBadge } from "@/components/explore/KindBadge";
import ProjectWizard, { type RefCandidate } from "@/components/ProjectWizard";
import { Page } from "@/components/ui";
import { createProject } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { getCase, getSavedCases, type CaseCard } from "@/lib/data";
import type { LayoutInput } from "@/lib/layout/types";

type Query = Partial<Record<"area" | "staff" | "ceo" | "meeting" | "seats" | "pantry" | "storage" | "mood" | "option" | "entrance" | "priority" | "post" | "postPhoto" | "case" | "photo" | "intake", string>>;

const STYLE_MOOD: Record<string, LayoutInput["mood"]> = { natural: "warm", chic: "pro", lovely: "soft" };

/** 사례에서 시작하면 그 사례의 평수·인원·방 구성·스타일을 처음 값으로 쓴다. 자동 배치 범위를 벗어난 값은 그대로 두고 고객이 고친다. */
function fromCase(c: CaseCard): Partial<LayoutInput> {
  const out: Partial<LayoutInput> = {};
  if (c.area_pyeong) out.areaPyeong = c.area_pyeong;
  if (c.spec.staff) out.staff = c.spec.staff;
  if (c.spec.rooms) {
    out.ceo = c.spec.rooms.includes("ceo");
    out.meeting = c.spec.rooms.includes("meeting");
    out.pantry = c.spec.rooms.includes("pantry");
    out.storage = c.spec.rooms.includes("storage");
  }
  if (c.spec.meetingSeats) out.meetingSeats = c.spec.meetingSeats;
  if (STYLE_MOOD[c.style]) out.mood = STYLE_MOOD[c.style];
  return out;
}

/** 배치 체험에서 넘어온 조건을 읽는다. 범위를 벗어난 값은 버린다. */
function fromQuery(q: Query): Partial<LayoutInput> {
  const out: Partial<LayoutInput> = {};
  const area = Number(q.area);
  const staff = Number(q.staff);
  const seats = Number(q.seats);
  if (area > 0 && area <= 1000) out.areaPyeong = area;
  if (Number.isInteger(staff) && staff >= 1 && staff <= 200) out.staff = staff;
  if ([4, 6, 8, 10, 12].includes(seats)) out.meetingSeats = seats;
  for (const key of ["ceo", "meeting", "pantry", "storage"] as const) if (q[key] === "1" || q[key] === "0") out[key] = q[key] === "1";
  if (q.mood === "warm" || q.mood === "pro" || q.mood === "soft") out.mood = q.mood;
  if (q.entrance === "left" || q.entrance === "right") out.entrance = q.entrance;
  if (q.priority === "visitor" || q.priority === "collab" || q.priority === "focus") out.priority = q.priority;
  if (q.intake === "photos" || q.intake === "none" || q.intake === "drawing") out.intake = q.intake;
  return out;
}

const candidate = (c: CaseCard): RefCandidate => ({ id: c.id, title: c.title, meta: `${caseMeta(c)} · ${c.company}`, photo: c.photos[0] ?? null, example: !!c.is_example });

export default async function NewProject({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await requireUser("customer");
  const query = await searchParams;
  const reference=referencePost(Number(query.post),Number(query.postPhoto) || undefined);
  const start = query.case ? getCase(Number(query.case)) : undefined;
  const fromDemo = fromQuery(query);
  const initial = { ...(start ? fromCase(start) : {}), ...fromDemo };
  const saved = getSavedCases(user.id);
  const refs = [...(start ? [start] : []), ...saved.filter((c) => c.id !== start?.id)].map(candidate);
  const photo = start && start.photos.includes(Number(query.photo)) ? Number(query.photo) : undefined;
  return (
    <Page>
      <header className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight">{start ? "이 공간을 참고해 요청을 시작해요" : "자료로 상담 요청하기"}</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          {start
            ? "고른 공간과 이미지가 요청서에 함께 붙어요. 평수와 구성은 이 공간 기준으로 미리 채워 두었으니 우리 공간에 맞게 고쳐 주세요."
            : Object.keys(fromDemo).length
              ? "체험한 조건을 불러왔어요. 단계마다 확인하고 필요한 부분만 고쳐 주세요."
              : "가진 자료, 공간 정보, 예산, 참고할 공간을 차례로 알려 주세요. 여러 시공사의 제안을 받아 비교할 수 있어요."}
        </p>
      </header>
      {start && (
        <div className="ref-hero mb-6" data-testid="start-case">
          {(photo ?? start.photos[0]) ? (
            // eslint-disable-next-line @next/next/no-img-element -- 업로드 파일
            <img src={`/files/${photo ?? start.photos[0]}`} alt={start.title} />
          ) : (
            <span className="aspect-[4/3] rounded-xl bg-white" />
          )}
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-brand">
              참고하는 공간
              <KindBadge example={start.is_example} />
            </p>
            <p className="mt-1.5 line-clamp-2 text-[15px] font-bold leading-snug sm:text-lg">{start.title}</p>
            <p className="mt-1 truncate text-xs text-muted sm:text-sm">
              {[start.area_pyeong != null && `${start.area_pyeong}평`, start.spec.staff && `${start.spec.staff}명`, styleName(start.style)].filter(Boolean).join(" · ")} · {start.company}
            </p>
          </div>
        </div>
      )}
      <ProjectWizard
        reference={reference}
        action={createProject}
        initial={initial}
        preferredOption={query.option ?? ""}
        refs={refs}
        startCase={start?.id}
        startPhoto={photo}
        cancel={
          <Link href={start ? `/cases/${start.id}` : "/projects"} className="btn btn-sm">
            취소
          </Link>
        }
      />
    </Page>
  );
}
