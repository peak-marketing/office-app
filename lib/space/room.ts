import { PYEONG, type LayoutInput, type Obj, type PlanMarks } from "../layout/types";
import { cellsOf, edgesOf, isPolygon, outlineErrors, outlineOf, pointInPolygon, refSegment, roomArea, type Pt } from "./geometry";
import type { RoomModel, WallRef, WallSide } from "./types";

// 사용자가 입력한 실제 구조. 외벽·출입문·창·기둥·급배수 위치는 여기서만 그린다(자동 배치가 가정한 창·출입문을 쓰지 않는다).

export const DEFAULT_HEIGHT = 2.7;
const WALL_T = 0.15;
const WALL_COLOR = "#eeeae2";
const WINDOW_COLOR = "#abd3df";
const FIXED_COLOR = "#d6cdbd";
const DOOR_H = 2.1;

/** 직사각형 방의 네 벽을 문 자리(출입문·다른 문)만큼 비우고 세운다. 다른 문 자리가 있는 집 방에서만 쓴다. */
function rectWallsWithOpenings(room: RoomModel, box: BoxFn, H: number) {
  const { width: W, depth: D } = room;
  const open = (side: WallSide) => [
    ...(side === "front" ? [[room.entrance.at, room.entrance.at + room.entrance.width] as [number, number]] : []),
    ...(room.doors ?? []).filter((d) => d.wall === side).map((d) => [d.at, d.at + d.width] as [number, number]),
  ].sort((a, b) => a[0] - b[0]);
  const sides: { side: WallSide; name: string; t0: number; t1: number; put: (t0: number, t1: number, z: number, h: number, nm: string, plan: boolean) => void }[] = [
    { side: "front", name: "전면 벽", t0: 0, t1: W, put: (a, b, z, h, nm, plan) => box(nm, a, -WALL_T, z, b - a, WALL_T, h, WALL_COLOR, "outer", 1, plan) },
    { side: "rear", name: "후면 벽", t0: -WALL_T, t1: W + WALL_T, put: (a, b, z, h, nm, plan) => box(nm, a, D, z, b - a, WALL_T, h, WALL_COLOR, "outer", 1, plan) },
    { side: "left", name: "좌측 벽", t0: 0, t1: D, put: (a, b, z, h, nm, plan) => box(nm, -WALL_T, a, z, WALL_T, b - a, h, WALL_COLOR, "outer", 1, plan) },
    { side: "right", name: "우측 벽", t0: 0, t1: D, put: (a, b, z, h, nm, plan) => box(nm, W, a, z, WALL_T, b - a, h, WALL_COLOR, "outer", 1, plan) },
  ];
  for (const s of sides) {
    let from = s.t0;
    for (const [a, b] of open(s.side)) {
      if (a - from > 0.01) s.put(from, a, 0, H, s.name, true);
      if (H > DOOR_H + 0.05) s.put(a, b, DOOR_H, H - DOOR_H, "문 상부 벽", false);
      from = Math.max(from, b);
    }
    if (s.t1 - from > 0.01) s.put(from, s.t1, 0, H, s.name, true);
  }
}
const WATER_COLOR = "#3b82c4";
/** 현재 자동 배치 지원 범위: 가까운 모서리에서 출입문 가장자리까지. 엔진이 넓어지면 늘린다. */
export const ENTRANCE_MAX_OFFSET = 2.5;
export const ENTRANCE_RANGE_TEXT = "현재 자동 배치 지원 범위: 출입문이 가까운 모서리에서 2,500mm 이내";
export const POLYGON_RANGE_TEXT = "현재 자동 배치 지원 범위: 직사각형 공간";
/** 공간 입력(치수·도면 따라 그리기)이 지금 재현하는 것과 후속 범위 */
export const SPACE_SCOPE_TEXT = "현재 지원 범위: 실내 외곽 형태와 출입문·창·기둥 입력";
export const SPACE_LATER_TEXT = "공간 안의 벽·방문(아파트·주택의 방 구조) 재현은 후속 범위";

const r = (n: number) => Math.round(n * 1000) / 1000;
const mm = (m: number) => Math.round(m * 1000).toLocaleString("ko-KR");
export const WALL_NAME: Record<WallSide, string> = { front: "앞벽", rear: "안쪽 벽", left: "왼쪽 벽", right: "오른쪽 벽" };

export { roomArea };
export const toPyeong = (m2: number) => m2 / PYEONG;
export const wallLength = (room: Pick<RoomModel, "width" | "depth">, wall: WallSide) => (wall === "front" || wall === "rear" ? room.width : room.depth);

/** 벽 위치를 사람이 읽는 말로 */
export function refText(room: RoomModel, ref: WallRef) {
  if (isPolygon(room) || ref.wall == null) return `벽 ${(ref.edge ?? 0) + 1}의 시작점에서 ${mm(ref.at)}`;
  return `${WALL_NAME[ref.wall]} ${mm(ref.at)}부터`;
}

/** 입력 오류. 빈 목록이면 공간을 만들 수 있다. */
export function validateRoom(room: RoomModel): string[] {
  const errs: string[] = [];
  const { width: W, depth: D } = room;
  if (!(W >= 2 && W <= 60) || !(D >= 2 && D <= 60)) errs.push("실내 가로·세로는 2,000~60,000mm 사이로 넣어 주세요.");
  if (errs.length) return errs;
  if (room.shape === "polygon") {
    if (!isPolygon(room)) return ["도면에서 따라 그린 벽 모서리를 읽지 못했어요. 다시 그려 주세요."];
    const oe = outlineErrors(room.outline!);
    if (oe.length) return oe;
  }
  if (room.height != null && !(room.height >= 2 && room.height <= 6)) errs.push("천장 높이는 2,000~6,000mm 사이로 넣거나 비워 두세요.");
  const poly = isPolygon(room);
  const pts = outlineOf(room);
  const edges = edgesOf(room);
  const e = room.entrance;
  if (!(e.width >= 0.7 && e.width <= 3)) errs.push("출입문 폭은 700~3,000mm 사이로 넣어 주세요.");
  else if (poly) {
    const seg = refSegment(room, { edge: e.edge ?? 0, at: e.at }, e.width);
    if (!seg || !seg.fits) errs.push("출입문이 벽 밖으로 나갑니다. 위치와 폭을 확인해 주세요.");
  } else if (!(e.at >= 0 && e.at + e.width <= W + 1e-6)) errs.push(`출입문이 앞벽(${mm(W)}mm) 밖으로 나갑니다. 위치와 폭을 확인해 주세요.`);
  const entranceSeg = refSegment(room, poly ? { edge: e.edge ?? 0, at: e.at } : { wall: "front", at: e.at }, e.width);
  (room.windows ?? []).forEach((w, i) => {
    const seg = refSegment(room, w, w.width);
    const len = poly ? (edges[w.edge ?? 0]?.len ?? 0) : wallLength(room, w.wall ?? "rear");
    if (!(w.width >= 0.3)) errs.push(`창 ${i + 1}: 폭을 300mm 이상으로 넣어 주세요.`);
    else if (!seg || !seg.fits) errs.push(`창 ${i + 1}: 벽 길이(${mm(len)}mm) 밖으로 나갑니다.`);
    else if (entranceSeg && seg.edge.i === entranceSeg.edge.i) {
      const along = (p: Pt) => (p[0] - seg.edge.a[0]) * seg.edge.dir[0] + (p[1] - seg.edge.a[1]) * seg.edge.dir[1];
      const [w1, w2] = [along(seg.a), along(seg.b)].sort((a, b) => a - b);
      const [e1, e2] = [along(entranceSeg.a), along(entranceSeg.b)].sort((a, b) => a - b);
      if (w1 < e2 - 1e-6 && e1 < w2 - 1e-6) errs.push(`창 ${i + 1}: 출입문과 겹칩니다.`);
    }
  });
  (room.utilities ?? []).forEach((u, i) => {
    const seg = refSegment(room, u, 0);
    if (!seg || !seg.fits) errs.push(`급배수 위치 ${i + 1}: 벽 밖으로 나갑니다.`);
  });
  const inside = (x: number, y: number) => pointInPolygon(x, y, pts);
  room.pillars.forEach((p, i) => {
    if (!(p.w >= 0.2 && p.w <= 3 && p.d >= 0.2 && p.d <= 3)) errs.push(`기둥 ${i + 1}: 크기는 200~3,000mm 사이로 넣어 주세요.`);
    else if (!(p.x >= 0 && p.y >= 0 && p.x + p.w <= W + 1e-6 && p.y + p.d <= D + 1e-6) || (poly && !inside(p.x + p.w / 2, p.y + p.d / 2))) errs.push(`기둥 ${i + 1}: 실내 치수 밖으로 나갑니다. 위치를 확인해 주세요.`);
  });
  if (room.pillars.length > 12) errs.push("기둥은 12개까지 넣을 수 있습니다.");
  if ((room.windows?.length ?? 0) > 20) errs.push("창은 20개까지 넣을 수 있습니다.");
  if ((room.utilities?.length ?? 0) > 6) errs.push("급배수 위치는 6곳까지 넣을 수 있습니다.");
  return errs;
}

/** 자동 배치 엔진이 출입문 위치를 따라갈 수 있는지. 못 따라가면 자동 배치 없이 빈 공간에서 시작한다. */
export function entranceSupport(room: RoomModel) {
  const { width: W } = room;
  const { at, width } = room.entrance;
  if (isPolygon(room)) return { side: "right" as const, offset: 0, supported: false, reason: `도면에서 따라 그린 꺾인 공간입니다. ${POLYGON_RANGE_TEXT}이라 자동 배치를 만들지 않습니다.` };
  const side: "left" | "right" = at + width / 2 < W / 2 ? "left" : "right";
  const offset = side === "left" ? at : W - at - width;
  const supported = offset <= ENTRANCE_MAX_OFFSET + 1e-6;
  return {
    side,
    offset: r(Math.max(0, offset)),
    supported,
    reason: supported ? null : `출입문이 ${side === "left" ? "왼쪽" : "오른쪽"} 모서리에서 ${mm(offset)}mm 떨어져 있어 ${ENTRANCE_RANGE_TEXT}를 벗어납니다.`,
  };
}

/** 자동 배치에 넘길 조건. 기둥은 엔진에 넘기지 않고(엔진이 기둥을 피하지 못함) 검사에서 겹침을 알린다. */
export function roomToInput(room: RoomModel, needs: Pick<LayoutInput, "staff" | "ceo" | "meeting" | "meetingSeats" | "pantry" | "storage" | "priority" | "furnitureIncluded" | "mood" | "siteNotes" | "reuseFurniture">, intake: "dims" | "drawing" = "dims"): LayoutInput {
  const ent = entranceSupport(room);
  const poly = isPolygon(room);
  const rear = !poly && (room.windows ?? []).some((w) => w.wall === "rear");
  return {
    ...needs,
    intake,
    areaPyeong: Math.round(toPyeong(roomArea(room)) * 10) / 10,
    widthM: r(room.width),
    depthM: r(room.depth),
    entrance: ent.supported ? ent.side : "other",
    entranceOffset: ent.offset,
    entranceWidth: r(room.entrance.width),
    shape: poly ? "other" : "rect",
    pillars: 0,
    // 안쪽 벽에 창이 있을 때만 창가 좌석을 센다. 위치를 모르면 창이 있다고 가정하지 않는다.
    windowWall: rear ? "rear" : "other",
  };
}

type BoxFn = (name: string, x: number, y: number, z: number, w: number, d: number, h: number, color: string, kind: Obj["kind"], opacity?: number, plan?: boolean) => void;

function addCommon(room: RoomModel, box: BoxFn, H: number) {
  for (const w of room.windows ?? []) {
    const seg = refSegment(room, w, w.width);
    if (!seg) continue;
    const { a, b, edge } = seg;
    // 안쪽 면에 얇게 붙인다.
    const ox = edge.inward[0] * 0.01, oy = edge.inward[1] * 0.01;
    const x1 = Math.min(a[0], b[0]) + ox + (edge.inward[0] < 0 ? -0.025 : 0);
    const y1 = Math.min(a[1], b[1]) + oy + (edge.inward[1] < 0 ? -0.025 : 0);
    const horizontal = Math.abs(edge.dir[0]) > 0.5;
    box("창호", x1, y1, 1.0, horizontal ? Math.abs(b[0] - a[0]) : 0.025, horizontal ? 0.025 : Math.abs(b[1] - a[1]), 1.3, WINDOW_COLOR, "window", 0.75);
  }
  // 집 방의 고정 구조물(붙박이장·싱크대 자리 등)은 이름과 높이를 쓴다. 이름이 없으면 천장까지 닿는 기둥이다.
  room.pillars.forEach((p, i) => box(p.label || `기둥 ${i + 1}`, p.x, p.y, 0, p.w, p.d, p.h ?? H, p.label ? FIXED_COLOR : "#e4e0d7", "pillar"));
  (room.utilities ?? []).forEach((u, i) => {
    const seg = refSegment(room, u, 0);
    if (!seg) return;
    const [x, y] = seg.a;
    const nx = seg.edge.inward[0], ny = seg.edge.inward[1];
    // 벽 안쪽에 붙은 작은 표시(지름 200mm)
    box(`급배수 ${i + 1}`, x + nx * 0.1 - 0.1, y + ny * 0.1 - 0.1, 0, 0.2, 0.2, 0.3, WATER_COLOR, "utility");
  });
}

/** 외벽·출입문·창·기둥·급배수 위치 */
export function shellObjects(room: RoomModel): Obj[] {
  const { width: W, depth: D } = room;
  const H = room.height ?? DEFAULT_HEIGHT;
  const out: Obj[] = [];
  const box: BoxFn = (name, x, y, z, w, d, h, color, kind, opacity = 1, plan = true) => out.push({ name, x: r(x), y: r(y), z: r(z), w: r(w), d: r(d), h: r(h), color, kind, opacity, plan });
  if (!isPolygon(room)) {
    box("바닥", 0, 0, -0.16, W, D, 0.16, "#d9d4c9", "floor");
    if (room.doors?.length) {
      rectWallsWithOpenings(room, box, H);
      addCommon(room, box, H);
      return out;
    }
    box("후면 벽", -WALL_T, D, 0, W + WALL_T * 2, WALL_T, H, WALL_COLOR, "outer");
    box("좌측 벽", -WALL_T, 0, 0, WALL_T, D, H, WALL_COLOR, "outer");
    box("우측 벽", W, 0, 0, WALL_T, D, H, WALL_COLOR, "outer");
    const { at, width } = room.entrance;
    if (at > 0.01) box("전면 벽 A", 0, -WALL_T, 0, at, WALL_T, H, WALL_COLOR, "outer");
    if (W - at - width > 0.01) box("전면 벽 B", at + width, -WALL_T, 0, W - at - width, WALL_T, H, WALL_COLOR, "outer");
    // 출입문 위 벽(문 높이 2.1m 위)
    if (H > 2.15) box("출입문 상부 벽", at, -WALL_T, 2.1, width, WALL_T, H - 2.1, WALL_COLOR, "outer", 1, false);
    addCommon(room, box, H);
    return out;
  }
  const pts = outlineOf(room);
  for (const c of cellsOf(pts).inside) box("바닥", c.x, c.y, -0.16, c.w, c.d, 0.16, "#d9d4c9", "floor");
  const edges = edgesOf(room);
  const n = edges.length;
  // 반시계 다각형에서 왼쪽으로 꺾이는 꼭짓점이 바깥 모서리다. 바깥 모서리에서만 벽을 두께만큼 늘려 틈을 메운다.
  const convex = (i: number) => {
    const p = edges[(i + n - 1) % n].dir, q = edges[i].dir;
    return p[0] * q[1] - p[1] * q[0] > 0;
  };
  const ent = room.entrance;
  edges.forEach((e, i) => {
    const s0 = convex(i) ? -WALL_T : 0;
    const s1 = e.len + (convex((i + 1) % n) ? WALL_T : 0);
    const parts: [number, number][] = [];
    if ((ent.edge ?? 0) === i) {
      if (ent.at - s0 > 0.01) parts.push([s0, ent.at]);
      if (s1 - (ent.at + ent.width) > 0.01) parts.push([ent.at + ent.width, s1]);
    } else parts.push([s0, s1]);
    const outward: Pt = [-e.inward[0], -e.inward[1]];
    const name = outward[1] > 0.5 ? "후면 벽" : `벽 ${i + 1}`;
    const seg = (t0: number, t1: number, z: number, h: number, nm: string, plan = true) => {
      const ax = e.a[0] + e.dir[0] * t0, ay = e.a[1] + e.dir[1] * t0;
      const bx = e.a[0] + e.dir[0] * t1, by = e.a[1] + e.dir[1] * t1;
      const x1 = Math.min(ax, bx, ax + outward[0] * WALL_T, bx + outward[0] * WALL_T);
      const x2 = Math.max(ax, bx, ax + outward[0] * WALL_T, bx + outward[0] * WALL_T);
      const y1 = Math.min(ay, by, ay + outward[1] * WALL_T, by + outward[1] * WALL_T);
      const y2 = Math.max(ay, by, ay + outward[1] * WALL_T, by + outward[1] * WALL_T);
      box(nm, x1, y1, z, x2 - x1, y2 - y1, h, WALL_COLOR, "outer", 1, plan);
    };
    for (const [t0, t1] of parts) seg(t0, t1, 0, H, name);
    if ((ent.edge ?? 0) === i && H > 2.15) seg(ent.at, ent.at + ent.width, 2.1, H - 2.1, "출입문 상부 벽", false);
  });
  addCommon(room, box, H);
  return out;
}

export function shellMarks(room: RoomModel): Pick<PlanMarks, "entrance" | "windows" | "spots"> {
  const poly = isPolygon(room);
  const e = room.entrance;
  const es = refSegment(room, poly ? { edge: e.edge ?? 0, at: e.at } : { wall: "front", at: e.at }, e.width)!;
  return {
    entrance: { x1: r(e.at), x2: r(e.at + e.width), seg: [es.a[0], es.a[1], es.b[0], es.b[1]], inward: [es.edge.inward[0], es.edge.inward[1]] },
    windows: (room.windows ?? []).map((w) => {
      const s = refSegment(room, w, w.width);
      return { x1: r(w.at), x2: r(w.at + w.width), ...(poly ? {} : { wall: w.wall }), ...(s ? { seg: [s.a[0], s.a[1], s.b[0], s.b[1]] as [number, number, number, number] } : {}) };
    }),
    ...(room.doors?.length
      ? {
          spots: room.doors.flatMap((d) => {
            const s = refSegment(room, { wall: d.wall, at: d.at }, d.width);
            return s ? [{ seg: [s.a[0], s.a[1], s.b[0], s.b[1]] as [number, number, number, number], inward: [s.edge.inward[0], s.edge.inward[1]] as [number, number], label: d.label }] : [];
          }),
        }
      : {}),
  };
}

/** 사용자 입력 문장 요약(화면·업체 전달용) */
export function describeRoom(room: RoomModel) {
  const poly = isPolygon(room);
  const ent = entranceSupport(room);
  const { at, width } = room.entrance;
  const area = roomArea(room);
  return {
    size: poly ? `바깥 ${mm(room.width)} × ${mm(room.depth)} mm · 벽 ${room.outline!.length}개` : `${mm(room.width)} × ${mm(room.depth)} mm`,
    area: `${area.toFixed(1)}㎡ · 약 ${toPyeong(area).toFixed(1)}평`,
    entrance: poly ? `벽 ${(room.entrance.edge ?? 0) + 1}의 시작점에서 ${mm(at)} · 폭 ${mm(width)} mm` : `앞벽 · ${ent.side === "left" ? `왼쪽 벽에서 ${mm(at)}` : `오른쪽 벽에서 ${mm(room.width - at - width)}`} · 폭 ${mm(width)} mm`,
    windows: room.windows == null ? "위치 모름" : room.windows.length ? room.windows.map((w) => `${refText(room, w)} 폭 ${mm(w.width)}`).join(" · ") : "없음",
    pillars: room.pillars.length ? room.pillars.map((p, i) => `기둥 ${i + 1}: 왼쪽 벽 ${mm(p.x)} · 앞벽 ${mm(p.y)} · ${mm(p.w)}×${mm(p.d)}`).join(" / ") : "없음",
    height: room.height != null ? `${mm(room.height)} mm` : `모름 (${mm(DEFAULT_HEIGHT)} mm로 그림)`,
    utilities: (room.utilities ?? []).length ? room.utilities!.map((u) => refText(room, u)).join(" · ") : "모름",
    shape: poly ? `도면에서 따라 그린 모양 (벽 ${room.outline!.length}개)` : "직사각형",
  };
}
