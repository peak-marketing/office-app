import { overlaps, type Box } from "./check";
import type { Pt } from "./geometry";
import { OPENINGS, boxInside, r3, snapGrid, wallLines, type HouseModel, type HouseOpening, type OpeningKind, type WallLine } from "./house";
import { houseDoorZones, thicknessOf, wallPieces } from "./house-geom";
import { regionAt, type HouseRegion, type RoomDetection } from "./house-rooms";
import { footprint } from "./placement";
import type { PlacedItem } from "./types";

// 편집 화면의 맞춤 규칙: 벽 끝점은 기존 벽 끝·모서리, 기존 벽 선, 50mm 격자 순으로 맞춘다. 벽은 가로·세로로만 그린다.

type Shape = Pick<HouseModel, "outline" | "walls" | "outerT" | "width" | "depth">;

interface Targets {
  points: Pt[];
  h: { y: number; x0: number; x1: number }[];
  v: { x: number; y0: number; y1: number }[];
}

export function snapTargets(h: Shape): Targets {
  const segs: [Pt, Pt][] = [...h.outline.map((a, i) => [a, h.outline[(i + 1) % h.outline.length]] as [Pt, Pt]), ...h.walls.map((w) => [w.a, w.b] as [Pt, Pt])];
  const points = segs.flatMap(([a, b]) => [a, b]);
  const t: Targets = { points, h: [], v: [] };
  for (const [a, b] of segs) {
    if (Math.abs(a[1] - b[1]) < 1e-9) t.h.push({ y: a[1], x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]) });
    else if (Math.abs(a[0] - b[0]) < 1e-9) t.v.push({ x: a[0], y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]) });
  }
  return t;
}

const clampIn = (h: Shape, p: Pt): Pt => [r3(Math.min(h.width, Math.max(0, p[0]))), r3(Math.min(h.depth, Math.max(0, p[1])))];

/** 벽 시작점 맞춤 */
export function snapStart(h: Shape, p: Pt, tol: number): Pt {
  const t = snapTargets(h);
  let best: Pt | null = null;
  let bd = tol;
  for (const q of t.points) {
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d <= bd) {
      bd = d;
      best = q;
    }
  }
  if (best) return clampIn(h, best);
  const hl = t.h.filter((l) => Math.abs(l.y - p[1]) <= tol && p[0] >= l.x0 - tol && p[0] <= l.x1 + tol).sort((a, b) => Math.abs(a.y - p[1]) - Math.abs(b.y - p[1]))[0];
  const vl = t.v.filter((l) => Math.abs(l.x - p[0]) <= tol && p[1] >= l.y0 - tol && p[1] <= l.y1 + tol).sort((a, b) => Math.abs(a.x - p[0]) - Math.abs(b.x - p[0]))[0];
  if (hl && vl) return clampIn(h, [vl.x, hl.y]);
  if (hl) return clampIn(h, [Math.min(hl.x1, Math.max(hl.x0, snapGrid(p[0]))), hl.y]);
  if (vl) return clampIn(h, [vl.x, Math.min(vl.y1, Math.max(vl.y0, snapGrid(p[1])))]);
  return clampIn(h, [snapGrid(p[0]), snapGrid(p[1])]);
}

/** 벽 끝점 맞춤: 시작점에서 가로·세로 가운데 많이 움직인 쪽으로만. 그 줄과 만나는 벽 선·모서리에 맞추고, 바깥 벽을 넘지 않게 한다. */
export function snapEnd(h: Shape, start: Pt, p: Pt, tol: number): Pt {
  const t = snapTargets(h);
  const horizontal = Math.abs(p[0] - start[0]) >= Math.abs(p[1] - start[1]);
  const pick = (v: number, cands: number[]) => {
    let best = NaN;
    let bd = tol;
    for (const c of cands) {
      const d = Math.abs(c - v);
      if (d <= bd) {
        bd = d;
        best = c;
      }
    }
    return Number.isNaN(best) ? snapGrid(v) : best;
  };
  // 시작점에서 진행 방향으로 처음 만나는 바깥 벽(윤곽) 위치
  const edges = h.outline.map((a, i) => [a, h.outline[(i + 1) % h.outline.length]] as [Pt, Pt]);
  if (horizontal) {
    const cands = [...t.points.map((q) => q[0]), ...t.v.filter((l) => start[1] >= l.y0 - 1e-6 && start[1] <= l.y1 + 1e-6).map((l) => l.x)];
    let x = pick(p[0], cands);
    const dir = Math.sign(x - start[0]);
    const stops = edges.filter(([a, b]) => Math.abs(a[0] - b[0]) < 1e-9 && start[1] > Math.min(a[1], b[1]) - 1e-6 && start[1] < Math.max(a[1], b[1]) + 1e-6).map(([a]) => a[0]);
    const ahead = stops.filter((sx) => (dir > 0 ? sx >= start[0] - 1e-6 : sx <= start[0] + 1e-6)).sort((a, b) => Math.abs(a - start[0]) - Math.abs(b - start[0]));
    const limit = ahead.find((sx) => Math.abs(sx - start[0]) > 1e-6) ?? ahead[0];
    if (limit != null && (dir > 0 ? x > limit : x < limit)) x = limit;
    return clampIn(h, [x, start[1]]);
  }
  const cands = [...t.points.map((q) => q[1]), ...t.h.filter((l) => start[0] >= l.x0 - 1e-6 && start[0] <= l.x1 + 1e-6).map((l) => l.y)];
  let y = pick(p[1], cands);
  const dir = Math.sign(y - start[1]);
  const stops = edges.filter(([a, b]) => Math.abs(a[1] - b[1]) < 1e-9 && start[0] > Math.min(a[0], b[0]) - 1e-6 && start[0] < Math.max(a[0], b[0]) + 1e-6).map(([a]) => a[1]);
  const ahead = stops.filter((sy) => (dir > 0 ? sy >= start[1] - 1e-6 : sy <= start[1] + 1e-6)).sort((a, b) => Math.abs(a - start[1]) - Math.abs(b - start[1]));
  const limit = ahead.find((sy) => Math.abs(sy - start[1]) > 1e-6) ?? ahead[0];
  if (limit != null && (dir > 0 ? y > limit : y < limit)) y = limit;
  return clampIn(h, [start[0], y]);
}

/** 누른 점에서 가장 가까운 벽(벽 두께 안이면 거리 0). outerOnly면 바깥 벽만 */
export function pickWall(h: Pick<HouseModel, "outline" | "walls" | "outerT">, p: Pt, tol: number, which: "any" | "outer" | "inner" = "any"): (WallLine & { t0: number; dist: number }) | null {
  let best: (WallLine & { t0: number; dist: number }) | null = null;
  for (const l of wallLines(h)) {
    if ((which === "outer" && !l.outer) || (which === "inner" && l.outer)) continue;
    const t0 = (p[0] - l.a[0]) * l.dir[0] + (p[1] - l.a[1]) * l.dir[1];
    if (t0 < -tol || t0 > l.len + tol) continue;
    const o = (p[0] - l.a[0]) * l.n[0] + (p[1] - l.a[1]) * l.n[1];
    const [o0, o1] = thicknessOf(l);
    const dist = o < o0 ? o0 - o : o > o1 ? o - o1 : 0;
    if (dist <= tol && (!best || dist < best.dist)) best = { ...l, t0: Math.min(l.len, Math.max(0, t0)), dist };
  }
  return best;
}

/** 벽 위 누른 자리에 문·창을 놓는다(누른 곳이 가운데, 벽 끝을 넘지 않게). 겹치면 오류 문장 */
export function placeOpening(h: Pick<HouseModel, "openings">, kind: OpeningKind, line: WallLine, t: number, id: string): HouseOpening | { error: string } {
  const spec = OPENINGS[kind];
  if (spec.outerOnly && !line.outer) return { error: `${kind === "window" ? "창은" : "현관문은"} 바깥 벽에만 놓을 수 있어요. 바깥 벽(진한 테두리)을 눌러 주세요.` };
  const width = r3(Math.min(spec.width, line.len));
  if (width < spec.min) return { error: `이 벽은 ${spec.label}을 놓기에 짧아요.` };
  const at = snapGrid(Math.min(line.len - width, Math.max(0, t - width / 2)));
  const o: HouseOpening = { id, kind, wall: line.ref, at: r3(Math.min(at, line.len - width)), width, ...(spec.hinged ? { hinge: "a" as const, side: spec.side } : {}) };
  const hit = h.openings.find((x) => x.wall === o.wall && o.at < x.at + x.width - 0.001 && x.at < o.at + o.width - 0.001);
  if (hit) return { error: "그 자리에는 이미 문·창이 있어요. 다른 자리를 누르거나 놓인 것을 눌러 고쳐 주세요." };
  return o;
}

/** 가구를 놓을 빈자리: 고른 방 안에서 다른 가구·고정 구조물·벽·문 앞 자리와 겹치지 않는, 방 이름 자리에서 가까운 곳 */
export function findHouseSpot(h: HouseModel, det: RoomDetection, it: PlacedItem, room: HouseRegion | null): { x: number; y: number } {
  const target = room ?? [...det.regions].filter((r) => !r.sliver).sort((a, b) => b.area - a.area)[0] ?? null;
  const near: Pt = target ? target.anchor : [h.width / 2, h.depth / 2];
  const obstacles: Box[] = [...h.items.filter((x) => x.id !== it.id).map(footprint), ...h.fixed, ...wallPieces(h).filter((p) => !p.outer), ...houseDoorZones(h)];
  const box = target?.box ?? { x: 0, y: 0, w: h.width, d: h.depth };
  const cands: Pt[] = [];
  for (let y = box.y + 0.1; y <= box.y + box.d - 0.1 + 1e-9; y += 0.1) for (let x = box.x + 0.1; x <= box.x + box.w - 0.1 + 1e-9; x += 0.1) cands.push([r3(x), r3(y)]);
  cands.sort((a, b) => Math.hypot(a[0] - near[0], a[1] - near[1]) - Math.hypot(b[0] - near[0], b[1] - near[1]));
  for (const [x, y] of cands) {
    if (target && regionAt(det.raster, x, y) !== target.idx) continue;
    const f = footprint({ ...it, x, y });
    if (!boxInside(h, f, 0)) continue;
    if (target && [[f.x + 0.01, f.y + 0.01], [f.x + f.w - 0.01, f.y + 0.01], [f.x + 0.01, f.y + f.d - 0.01], [f.x + f.w - 0.01, f.y + f.d - 0.01]].some(([px, py]) => regionAt(det.raster, px, py) !== target.idx)) continue;
    if (obstacles.some((o) => overlaps(f, o, -0.05))) continue;
    return { x, y };
  }
  return { x: r3(near[0]), y: r3(near[1]) };
}
