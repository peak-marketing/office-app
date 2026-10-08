import { PRIORITIES } from "../constants";
import type { LayoutInput, LayoutOption } from "../layout/types";
import { DOOR_CLEARANCE_NOTE, WATER_REACH_NOTE } from "./check";
import { isPolygon } from "./geometry";
import { normalizeItems } from "./placement";
import { DEFAULT_HEIGHT, ENTRANCE_RANGE_TEXT, POLYGON_RANGE_TEXT, SPACE_LATER_TEXT, SPACE_SCOPE_TEXT, describeRoom, entranceSupport } from "./room";
import type { PlacedItem, RoomModel } from "./types";

// ‘실제 내 공간’과 ‘가정·제안’을 나눠 보여 준다. 사용자가 입력한 벽·문·창·기둥이 어디까지 반영되는지.
export type SpaceKind = "real" | "proposed" | "assumed" | "limited" | "later";

export const SPACE_KIND: Record<SpaceKind, { label: string; hint: string }> = {
  real: { label: "실제(입력)", hint: "입력한 값 그대로 공간·3D·평면도·검사에 썼습니다." },
  proposed: { label: "자동 제안", hint: "입력하지 않은 것을 자동 배치가 제안했습니다. 실제 벽이 아니며 공사 범위에 들어갑니다." },
  assumed: { label: "가정", hint: "입력이 없어 정해 둔 값으로 그렸습니다. 실제와 다를 수 있습니다." },
  limited: { label: "반영 제한", hint: "입력은 받았지만 자동 배치가 따라가지 못하는 부분이 있습니다. 검사와 업체 확인으로 보완합니다." },
  later: { label: "후속 범위", hint: "지금은 받지 않고 그리지 않습니다. 후속 개발 범위입니다." },
};

export interface SpaceRow {
  label: string;
  value: string;
  kind: SpaceKind;
  note: string;
}

export function spaceCoverage(room: RoomModel, input: LayoutInput, base: LayoutOption | null, placed: PlacedItem[] = []): SpaceRow[] {
  const t = describeRoom(room);
  const ent = entranceSupport(room);
  const poly = isPolygon(room);
  const rearWindows = poly ? 0 : (room.windows ?? []).filter((w) => w.wall === "rear").length;
  const otherWindows = (room.windows ?? []).length - rearWindows;
  const water = room.utilities ?? [];
  const fixtures = normalizeItems(placed).filter((it) => it.fixture);
  const proposedFx = fixtures.filter((it) => it.fixture === "proposed");
  const rooms = base ? base.rooms.filter((x) => x.key !== "work" && x.key !== "spare").map((x) => x.label.split(" · ")[0]) : [];
  const rows: SpaceRow[] = [
    poly
      ? { label: "실내 크기", value: `${t.size} (${t.area})`, kind: "real", note: "도면 위에 따라 그린 벽 모서리와 고객이 맞춘 축척으로 그렸습니다. 도면 자체의 오차와 벽 두께·몰딩은 반영하지 않습니다." }
      : { label: "실내 가로·세로", value: `${t.size} (${t.area})`, kind: "real", note: room.source === "trace" ? "도면 위에 따라 그린 직사각형입니다. 출입문이 있는 벽을 앞벽으로 돌려 그렸습니다." : "입력한 치수로 바닥과 외벽을 그렸습니다. 벽 두께, 굴곡, 몰딩은 반영하지 않습니다." },
    poly
      ? { label: "공간 모양", value: t.shape, kind: "real", note: "따라 그린 모양 그대로 바닥·벽·3D·검사에 썼습니다. 직사각형으로 바꾸지 않았습니다." }
      : { label: "공간 모양", value: "직사각형", kind: "real", note: "직사각형만 치수로 만듭니다. 다른 모양은 직사각형으로 바꾸지 않고 도면 따라 그리기로 만듭니다." },
    poly
      ? { label: "출입문", value: t.entrance, kind: "limited", note: `평면·3D·검사에는 그린 위치로 반영했습니다. ${POLYGON_RANGE_TEXT}이라 자동 배치는 만들지 않고 빈 공간에서 시작합니다.` }
      : ent.supported
      ? { label: "출입문", value: t.entrance, kind: "real", note: `평면·3D·검사와 자동 배치의 동선 계산에 모두 썼습니다(${ENTRANCE_RANGE_TEXT}).` }
      : { label: "출입문", value: t.entrance, kind: "limited", note: `평면·3D·검사에는 입력한 위치로 그렸습니다. ${ent.reason} 빈 공간에서 직접 놓아 주세요.` },
    room.windows == null
      ? { label: "창", value: "위치 모름", kind: "assumed", note: "창을 그리지 않았고, 창이 있다고 가정하지도 않았습니다. 창가 좌석은 계산하지 않습니다." }
      : room.windows.length === 0
        ? { label: "창", value: "없음", kind: "real", note: "창이 없는 공간으로 그렸습니다." }
        : {
            label: "창",
            value: t.windows,
            kind: otherWindows ? "limited" : "real",
            note: `위치대로 평면·3D에 그렸습니다. 자동 배치는 ${rearWindows ? "안쪽 벽에 창이 있다는 것만" : "창 위치를"} 반영${rearWindows ? "합니다" : "하지 못합니다"}${otherWindows ? " (옆 벽·앞벽 창은 배치 계산에 쓰지 않음)" : ""}.`,
          },
    room.pillars.length
      ? { label: "실내 기둥", value: `${room.pillars.length}개 · ${t.pillars}`, kind: "limited", note: "위치대로 평면·3D에 그렸고, 가구·칸막이와 겹치면 검사에서 알려 드립니다. 자동 배치는 아직 기둥을 피하지 못합니다." }
      : { label: "실내 기둥", value: "없음", kind: "real", note: "기둥이 없는 공간으로 그렸습니다." },
    { label: "공간 안의 벽·방문", value: "그리지 않음", kind: "later", note: `${SPACE_SCOPE_TEXT}입니다. ${SPACE_LATER_TEXT}라 도면에 방이 나뉘어 있어도 그리지 않습니다. 아래 ‘칸막이·방’은 자동 배치가 제안한 것입니다.` },
    { label: "천장 높이", value: t.height, kind: room.height != null ? "real" : "assumed", note: "3D 높이에만 씁니다." },
    base
      ? { label: "칸막이·방", value: rooms.length ? rooms.join(", ") : "없음(개방형)", kind: "proposed", note: "자동 배치가 제안한 칸막이입니다. 실제 벽이 아니며 업체가 시공할 대상입니다. 위치·크기 편집은 다음 단계입니다." }
      : { label: "칸막이·방", value: "없음", kind: "real", note: "빈 공간에서 시작해 제안 칸막이가 없습니다." },
    { label: "가구", value: "개념 가구", kind: "assumed", note: "크기와 위치를 보여 주는 개념 가구이며 실제 제품 지정이 아닙니다." },
    { label: "문 앞 여유 검사", value: DOOR_CLEARANCE_NOTE, kind: "assumed", note: "확정 전 임시 검사값이라 바뀔 수 있습니다. 문 열림 방향은 보지 않습니다." },
    water.length
      ? { label: "급배수 위치(고객 확인)", value: `${water.length}곳 · ${t.utilities}`, kind: "real", note: `고객이 현장에서 확인했다고 입력한 위치입니다(업체 확인 전). 자동 제안 위치의 탕비 설비가 여기서 멀면 거리만 알립니다(${WATER_REACH_NOTE}). 연결 가능 여부는 판정하지 않습니다.` }
      : { label: "급배수 위치(고객 확인)", value: "모름", kind: "assumed", note: "입력하지 않았습니다. 탕비 설비 위치는 배관과 무관한 자동 제안이며, 업체가 현장에서 확인합니다." },
    ...(fixtures.length
      ? [
          proposedFx.length
            ? { label: "탕비 설비 위치", value: `자동 제안 위치 ${proposedFx.length}곳${fixtures.length > proposedFx.length ? ` · 고객 확인 위치 ${fixtures.length - proposedFx.length}곳` : ""}`, kind: "proposed" as const, note: "자동 배치가 놓은 위치이며 실제 급배수 위치를 확인하지 않았습니다. 평면에서 점선으로 표시합니다." }
            : { label: "탕비 설비 위치", value: `고객 확인 위치 ${fixtures.length}곳`, kind: "real" as const, note: "고객이 실제 설비 위치라고 확인한 자리입니다(업체 확인 전). 평면에서 실선으로 표시하고 편집에서 옮기지 않습니다. 급배수 연결은 업체가 현장에서 확인합니다." },
        ]
      : []),
    { label: "벽 마감·기타 설비", value: "받지 않음", kind: "assumed", note: "분전반·냉난방기 위치와 마감은 업체가 현장에서 확인합니다." },
  ];
  if (input.priority && input.priority !== "unknown") rows.push({ label: "중요하게 보는 것", value: PRIORITIES[input.priority], kind: "real", note: "자동 배치 가운데 무엇을 먼저 권할지에만 씁니다." });
  return rows;
}

export const HEIGHT_DEFAULT_TEXT = `${Math.round(DEFAULT_HEIGHT * 1000).toLocaleString("ko-KR")}mm`;
