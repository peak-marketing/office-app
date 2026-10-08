import { bbox, josa, overlaps, type Box } from "./check";
import { GAP_FACING, GAP_NOTICE, GAP_TOUCH } from "./home-room";
import { boxInside, fixedLabel, mmText, onOutline, r3, wallLines, wallName, type HouseItem, type HouseModel } from "./house";
import { houseDoorZones, openingGeoms, wallPieces, type HouseDoorZone } from "./house-geom";
import { SMALL_ROOM_AREA, nearestRegion, regionAt, type RoomDetection } from "./house-rooms";
import { footprint, worldParts } from "./placement";

// 집 전체 평면의 자동 검사. 편집 화면, 고객·업체·운영자 화면이 같은 함수를 쓴다.
// 보는 것은 아래 항목뿐이다. 걸린 곳이 없어도 시공이나 생활에 문제가 없다는 뜻이 아니다.

export type HouseCheckKey = "overlap" | "fixed" | "wall" | "outside" | "door" | "noroom";

export const HOUSE_CHECKS: { key: HouseCheckKey; label: string; desc: string }[] = [
  { key: "overlap", label: "가구끼리 겹침", desc: "평면에서 가구 바닥면이 서로 겹치는지 봅니다." },
  { key: "fixed", label: "고정 구조물과 겹침", desc: "입력한 기둥·붙박이장·설비 자리 등 고정 구조물과 가구 바닥면이 겹치는지 봅니다." },
  { key: "wall", label: "벽에 걸침", desc: "가구 바닥면이 내부 벽과 겹치는지 봅니다. 문·통로 자리는 벽으로 보지 않고 ‘문·통로 앞 장애물’에서 봅니다." },
  { key: "outside", label: "집 밖 배치", desc: "가구가 입력한 바깥 벽 안쪽(집 윤곽) 밖으로 나갔는지 봅니다." },
  {
    key: "door",
    label: "문·통로 앞 장애물",
    desc: "문·통로 앞 바닥에 가구가 놓였는지 봅니다. 비워 둘 자리는 문 폭 × 깊이(문 폭, 최대 900mm)이며, 내부 벽의 문·통로는 양쪽, 바깥 벽의 문(현관문 등)은 집 안쪽만 봅니다. 문짝 크기와 열리는 방향은 따로 보지 않습니다.",
  },
  { key: "noroom", label: "방 밖(벽 위)", desc: "가구 중심이 벽으로 나뉜 어느 방에도 들지 않는지(벽 위에 놓였는지) 봅니다." },
];
export const HOUSE_GAP_CHECK = {
  label: "통로 간격 알림 (편집 참고 · 임시값 600mm)",
  desc: "마주 보는 두 면 사이의 빈 간격을 봅니다: 가구와 가구, 가구와 벽(바깥 벽·내부 벽), 가구와 고정 구조물. 간격이 50mm보다 넓고 600mm보다 좁으면서 서로 300mm 이상 마주 보는 곳을 알려요. 50mm 이하는 붙여 놓은 것으로 보고 알리지 않아요. 편집할 때 참고하는 알림이며, 지나갈 수 있는지·안전한지는 판정하지 않습니다.",
};
export const HOUSE_NOT_CHECKED = ["통로가 안전한지·사람이 지나갈 수 있는지", "문짝 크기와 열리는 방향(그림으로만 표시)", "창 앞 가구 높이", "욕실·주방 설비와 급배수·전기·환기", "구조벽 여부와 철거 가능 여부", "발코니 확장 등 법규", "실제 제품 규격"];
export const HOUSE_CHECK_DISCLAIMER = "자동 검사는 위 항목만 봅니다. 걸린 곳이 없어도 시공이나 생활에 문제가 없다는 뜻이 아니며, 실측과 업체 확인이 필요합니다.";

export interface HouseIssue {
  key: HouseCheckKey;
  ids: string[];
  text: string;
}
export interface HouseNotice {
  ids: string[];
  text: string;
  gap: number;
}
export interface HouseReport {
  results: { key: HouseCheckKey; label: string; desc: string; issues: HouseIssue[] }[];
  issues: HouseIssue[];
  /** 통로 간격 알림(편집 참고). 확인할 것(issues)에 세지 않는다. */
  notices: HouseNotice[];
  /** 가구가 든 방(영역 번호). 방 밖이면 -1 */
  itemRoom: Record<string, number>;
  zones: HouseDoorZone[];
}

/** 평면에 보이는 부품. 부품이 없는 가구(후속: 규격만 있는 상품)는 바닥면 상자 하나로 본다. */
export function planBoxes(it: HouseItem): Box[] {
  const ps = worldParts(it).filter((o) => o.plan);
  return ps.length ? ps : [footprint(it)];
}

export function runHouseChecks(h: HouseModel, det: RoomDetection): HouseReport {
  const issues: HouseIssue[] = [];
  const add = (key: HouseCheckKey, ids: string[], t: string) => issues.push({ key, ids, text: t });
  const lines = wallLines(h);
  const pieces = wallPieces(h, lines);
  const inner = pieces.filter((p) => !p.outer);
  const zones = houseDoorZones(h, openingGeoms(h, lines));
  const fixed = h.fixed.map((f) => ({ box: { x: f.x, y: f.y, w: f.w, d: f.d }, label: fixedLabel(f) }));
  const parts = h.items.map(planBoxes);
  const boxes = parts.map(bbox);
  const hits = (ps: Box[], b: Box, eps?: number) => ps.some((p) => overlaps(p, b, eps));
  const itemRoom: Record<string, number> = {};
  h.items.forEach((it, i) => {
    const f = boxes[i];
    const cx = f.x + f.w / 2, cy = f.y + f.d / 2;
    const room = regionAt(det.raster, cx, cy);
    itemRoom[it.id] = room >= 0 ? room : -1;
    const outside = !boxInside(h, f, 0.01);
    if (outside) add("outside", [it.id], `${josa(it.label, "이", "가")} 집 밖으로 나갔어요`);
    const fx = fixed.find((s) => hits(parts[i], s.box));
    if (fx) add("fixed", [it.id], `${josa(it.label, "이", "가")} 고정 구조물(${fx.label})과 겹쳐요`);
    const wall = inner.find((p) => hits(parts[i], p, 0.02));
    if (wall) add("wall", [it.id], `${josa(it.label, "이", "가")} ${wallName({ id: wall.ref })}에 걸쳐 있어요`);
    const z = zones.find((zone) => hits(parts[i], zone));
    if (z) add("door", [it.id], `${josa(it.label, "이", "가")} ${z.label} 앞 바닥(폭 ${mmText(z.width)} × 깊이 ${mmText(z.depth)}mm)에 있어요`);
    if (!outside && room < 0) add("noroom", [it.id], `${it.label} 중심이 어느 방에도 들지 않아요(벽 위)`);
    for (let j = i + 1; j < h.items.length; j++) {
      if (!overlaps(f, boxes[j])) continue;
      if (parts[i].some((p) => hits(parts[j], p))) add("overlap", [it.id, h.items[j].id], `${josa(it.label, "과", "와")} ${josa(h.items[j].label, "이", "가")} 겹쳐요`);
    }
  });
  const notices = gapNotices(h, boxes, fixed, pieces);
  return { results: HOUSE_CHECKS.map((c) => ({ ...c, issues: issues.filter((x) => x.key === c.key) })), issues, notices, itemRoom, zones };
}

/**
 * 통로 간격 알림. 가구마다 네 방향에서 가장 가까이 마주 보는 면(다른 가구·고정 구조물·벽)까지의 빈 간격을 잰다.
 * 50mm < 간격 < 600mm이고 마주 보는 길이가 300mm 이상이면 알린다. 같은 둘은 한 번만 알린다.
 */
function gapNotices(h: HouseModel, boxes: Box[], fixed: { box: Box; label: string }[], pieces: ReturnType<typeof wallPieces>): HouseNotice[] {
  const others: { id: string | null; label: string; box: Box }[] = [
    ...h.items.map((it, i) => ({ id: it.id, label: it.label, box: boxes[i] })),
    ...fixed.map((f) => ({ id: null, label: f.label, box: f.box })),
    ...pieces.map((p) => ({ id: null, label: p.outer ? "바깥 벽" : wallName({ id: p.ref }), box: p as Box })),
  ];
  const seen = new Set<string>();
  const out: HouseNotice[] = [];
  const facing = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);
  h.items.forEach((it, i) => {
    const a = boxes[i];
    const dirs = [
      { along: "y" as const, near: (b: Box) => b.x + b.w <= a.x + 1e-6, gap: (b: Box) => a.x - (b.x + b.w) },
      { along: "y" as const, near: (b: Box) => b.x >= a.x + a.w - 1e-6, gap: (b: Box) => b.x - (a.x + a.w) },
      { along: "x" as const, near: (b: Box) => b.y + b.d <= a.y + 1e-6, gap: (b: Box) => a.y - (b.y + b.d) },
      { along: "x" as const, near: (b: Box) => b.y >= a.y + a.d - 1e-6, gap: (b: Box) => b.y - (a.y + a.d) },
    ];
    for (const dir of dirs) {
      const cands = others.filter((o) => o.id !== it.id && dir.near(o.box) && (dir.along === "y" ? facing(a.y, a.y + a.d, o.box.y, o.box.y + o.box.d) : facing(a.x, a.x + a.w, o.box.x, o.box.x + o.box.w)) >= GAP_FACING);
      const nearest = cands.sort((p, q) => dir.gap(p.box) - dir.gap(q.box))[0];
      if (!nearest) continue;
      const gap = dir.gap(nearest.box);
      // 경계값(50mm·600mm)은 소수 계산 오차를 감안해 1mm 미만 차이를 같은 값으로 본다.
      if (!(gap > GAP_TOUCH + 0.0005 && gap < GAP_NOTICE - 0.0005)) continue;
      const key = nearest.id ? [it.id, nearest.id].sort().join("|") : `${it.id}|${nearest.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ids: nearest.id ? [it.id, nearest.id] : [it.id], gap: r3(gap), text: `${josa(it.label, "과", "와")} ${nearest.label} 사이 빈 간격 ${mmText(gap)}mm` });
    }
  });
  return out;
}

/** 벽 끝이 다른 벽이나 바깥 벽에 닿는지 */
function touches(h: Pick<HouseModel, "outline" | "walls">, wallId: string, p: [number, number]) {
  if (onOutline(h.outline, p, 0.002)) return true;
  return h.walls.some((o) => {
    if (o.id === wallId) return false;
    const horizontal = Math.abs(o.b[1] - o.a[1]) < 1e-6;
    const half = o.t / 2 + 0.002;
    return horizontal
      ? Math.abs(p[1] - o.a[1]) <= half && p[0] >= Math.min(o.a[0], o.b[0]) - half && p[0] <= Math.max(o.a[0], o.b[0]) + half
      : Math.abs(p[0] - o.a[0]) <= half && p[1] >= Math.min(o.a[1], o.b[1]) - half && p[1] <= Math.max(o.a[1], o.b[1]) + half;
  });
}

/** 벽 끝이 닿지 않은 곳(방이 닫히지 않았을 수 있는 곳) */
export function danglingEnds(h: Pick<HouseModel, "outline" | "walls">) {
  return h.walls.flatMap((w) => [w.a, w.b].filter((p) => !touches(h, w.id, p)).map((p) => ({ id: w.id, p })));
}

/** 저장은 되지만 확인을 권하는 것: 닫히지 않은 방, 아주 작은 방·틈, 같은 방의 이름 두 개 */
export function houseWarnings(h: HouseModel, det: RoomDetection): string[] {
  const out: string[] = [];
  const loose = [...new Set(danglingEnds(h).map((d) => d.id))];
  for (const id of loose) out.push(`${wallName({ id })} 끝이 다른 벽에 닿지 않았어요. 방이 닫히지 않으면 옆 방과 한 방으로 잡혀요.`);
  for (const r of det.regions) {
    if (r.sliver) out.push(`벽 사이 좁은 틈(폭 300mm 이하 또는 0.25㎡ 미만, 약 ${r.area.toFixed(2)}㎡)이 있어요. 방으로 세지 않아요. 벽을 겹치거나 너무 붙여 그렸는지 확인해 주세요.`);
    else if (r.area < SMALL_ROOM_AREA) out.push(`${josa(r.display, "이", "가")} 1㎡보다 작아요(약 ${r.area.toFixed(1)}㎡). 벽 위치를 확인해 주세요.`);
  }
  for (const d of det.dupLabels) out.push(`‘${d.name}’과 ‘${d.with}’이 한 방에 있어요. 벽이 빠졌는지 확인하거나 이름 하나를 지워 주세요.`);
  for (const l of det.lostLabels) out.push(`방 이름 ‘${l.name}’이 벽 위나 집 밖에 있어요. 다시 붙여 주세요.`);
  return out;
}

/** 이 점에 있는 방(벽 위면 가까운 방) */
export const roomAtPoint = (det: RoomDetection, x: number, y: number) => {
  const id = nearestRegion(det.raster, x, y, 2);
  return id >= 0 ? det.regions[id] : null;
};
