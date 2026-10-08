import { notFound } from "next/navigation";
import ShotRender from "@/components/scene/ShotRender";
import { generateLayout } from "@/lib/layout/generate";
import type { LayoutInput } from "@/lib/layout/types";
import { HOME_SEED_CASES, seedEdits } from "@/lib/seed-home-cases";
import { composeRoom, rebuildRoomItems } from "@/lib/space/home-room";

// 개발용: 사례 예시 이미지를 만들 때 한 장면만 그리는 화면. 운영에서는 열지 않는다.
type Q = Partial<Record<"area" | "staff" | "rooms" | "seats" | "entrance" | "layout" | "style" | "shot" | "w" | "h" | "home", string>>;

export default async function RenderPage({ searchParams }: { searchParams: Promise<Q> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const q = await searchParams;
  // 집 예시(방 한 칸): seed-home-cases의 code로 그린다.
  const homeCase = q.home ? HOME_SEED_CASES.find((c) => c.code === q.home) : undefined;
  if (homeCase) {
    const built = rebuildRoomItems(seedEdits(homeCase), homeCase.room);
    if ("error" in built) return <p>{built.error}</p>;
    return <ShotRender option={composeRoom({ name: homeCase.name, room: homeCase.room, items: built.items })} styleId={q.style ?? "natural"} shot={q.shot ?? "0"} width={Number(q.w) || 1500} height={Number(q.h) || 1000} />;
  }
  const rooms = (q.rooms ?? "").split(",");
  const input: LayoutInput = {
    areaPyeong: Number(q.area) || 30,
    staff: Number(q.staff) || 8,
    ceo: rooms.includes("ceo"),
    meeting: rooms.includes("meeting"),
    meetingSeats: Number(q.seats) || 6,
    pantry: rooms.includes("pantry"),
    storage: rooms.includes("storage"),
    entrance: q.entrance === "left" ? "left" : "right",
    shape: "rect",
    pillars: 0,
    furnitureIncluded: true,
  };
  const result = generateLayout(input);
  const option = result.options.find((o) => o.id === q.layout) ?? result.options[0];
  if (!option) return <p>배치안 없음</p>;
  return <ShotRender option={option} styleId={q.style ?? "natural"} shot={q.shot ?? "0"} width={Number(q.w) || 1500} height={Number(q.h) || 1000} />;
}
