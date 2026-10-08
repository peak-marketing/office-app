import type { CaseCard } from "./data";
import { generateLayout } from "./layout/generate";
import type { LayoutOption } from "./layout/types";
import { composeRoom, rebuildRoomItems } from "./space/home-room";

/** 3D 제안 예시 사례의 배치. 사례에 남긴 조건으로 다시 계산하므로 눈높이 이미지·입체 배치도·평면도가 같은 공간이다. */
export function caseLayout(c: CaseCard): LayoutOption | undefined {
  const s = c.spec;
  if (s.kind === "home") {
    if (!c.is_example || !s.homeRoom) return undefined;
    const built = rebuildRoomItems(s.homeRoom.edits, s.homeRoom.room);
    return "items" in built ? composeRoom({ name: s.homeRoom.name, room: s.homeRoom.room, items: built.items }) : undefined;
  }
  if (!c.is_example || !s.layout || !c.area_pyeong || !s.staff) return undefined;
  const rooms = s.rooms ?? [];
  const result = generateLayout({
    areaPyeong: c.area_pyeong,
    staff: s.staff,
    ceo: rooms.includes("ceo"),
    meeting: rooms.includes("meeting"),
    meetingSeats: s.meetingSeats ?? 6,
    pantry: rooms.includes("pantry"),
    storage: rooms.includes("storage"),
    entrance: s.entrance ?? "right",
    shape: "rect",
    pillars: 0,
    furnitureIncluded: true,
  });
  return result.options.find((o) => o.id === s.layout);
}

/** 사례 사진을 눈높이 3D와 입체 배치도로 나눈다(파일 이름의 -iso로 구분). */
export function splitCasePhotos(photos: { id: number; name: string }[]) {
  return { eye: photos.filter((p) => !/-iso\.jpg$/.test(p.name)), iso: photos.find((p) => /-iso\.jpg$/.test(p.name)) };
}
