import type { LayoutOption, Obj, RoomInfo } from "../layout/types";
import { cellsOf, zoneInward, type Box, type Pt } from "./geometry";
import { OPENINGS, fixedLabel, lineOf, openingEnds, openingName, r3, roomColor, wallLines, type HouseModel, type OpeningKind, type WallLine } from "./house";
import type { RoomDetection } from "./house-rooms";
import { footprint, furnitureOf, worldParts } from "./placement";

// 집 전체 평면의 모양: 벽 조각(문·창 자리를 비운 것), 문·창 그림, 문 앞 비워 둘 자리, 3D 장면.
// 평면(SVG)·3D·검사가 같은 함수로 같은 값을 쓴다.

export interface WallPiece extends Box {
  ref: string;
  outer: boolean;
}

const cross = (p: Pt, q: Pt) => p[0] * q[1] - p[1] * q[0];

/** 선분 [t0, t1]에서 열린 구간(문·창)을 뺀 조각들 */
function cut(t0: number, t1: number, holes: [number, number][]) {
  const out: [number, number][] = [];
  let from = t0;
  for (const [a, b] of [...holes].sort((p, q) => p[0] - q[0])) {
    if (a - from > 0.005) out.push([from, a]);
    from = Math.max(from, b);
  }
  if (t1 - from > 0.005) out.push([from, t1]);
  return out;
}

/** 벽 선 위 구간 [t0, t1]을 두께 방향으로 [o0, o1]만큼(왼쪽 법선 기준) 채운 상자 */
function slab(l: WallLine, t0: number, t1: number, o0: number, o1: number): Box {
  const xs: number[] = [], ys: number[] = [];
  for (const t of [t0, t1])
    for (const o of [o0, o1]) {
      xs.push(l.a[0] + l.dir[0] * t + l.n[0] * o);
      ys.push(l.a[1] + l.dir[1] * t + l.n[1] * o);
    }
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x: r3(x), y: r3(y), w: r3(Math.max(...xs) - x), d: r3(Math.max(...ys) - y) };
}

/** 벽 두께가 차지하는 법선 구간: 바깥 벽은 윤곽 바깥으로, 내부 벽은 중심선 양쪽으로 */
export const thicknessOf = (l: WallLine): [number, number] => (l.outer ? [-l.t, 0] : [-l.t / 2, l.t / 2]);

/** 문·창 자리를 비운 벽 조각. 바깥 벽은 볼록 모서리에서 두께만큼 늘려 틈을 메우고, 내부 벽은 양 끝을 두께 절반만큼 늘린다. */
export function wallPieces(h: Pick<HouseModel, "outline" | "walls" | "outerT" | "openings">, lines = wallLines(h)): WallPiece[] {
  const out: WallPiece[] = [];
  const outer = lines.filter((l) => l.outer);
  const n = outer.length;
  const convex = (i: number) => cross(outer[(i + n - 1) % n].dir, outer[i].dir) > 0;
  for (const l of lines) {
    const holes = h.openings.filter((o) => o.wall === l.ref).map((o) => [o.at, o.at + o.width] as [number, number]);
    let t0: number, t1: number;
    if (l.outer) {
      const i = Number(l.ref.slice(1));
      t0 = convex(i) ? -l.t : 0;
      t1 = l.len + (convex((i + 1) % n) ? l.t : 0);
    } else {
      t0 = -l.t / 2;
      t1 = l.len + l.t / 2;
    }
    const [o0, o1] = thicknessOf(l);
    for (const [a, b] of cut(t0, t1, holes)) out.push({ ...slab(l, a, b, o0, o1), ref: l.ref, outer: l.outer });
  }
  return out;
}

export interface OpeningGeom {
  id: string;
  kind: OpeningKind;
  name: string;
  wall: string;
  outer: boolean;
  a: Pt;
  b: Pt;
  dir: Pt;
  /** 벽 진행 방향의 왼쪽(바깥 벽이면 집 안쪽) */
  n: Pt;
  /** 벽 두께 구간(법선 방향) */
  o0: number;
  o1: number;
  width: number;
  /** 여닫이: 경첩 자리(벽 면 위)와 문이 열리는 방향 */
  hinge?: Pt;
  swing?: Pt;
  /** 문이 닫혔을 때 반대쪽 문설주(벽 면 위) */
  latch?: Pt;
  /** 벽 상자(문·창 자리) */
  box: Box;
}

export function openingGeoms(h: Pick<HouseModel, "outline" | "walls" | "outerT" | "openings">, lines = wallLines(h)): OpeningGeom[] {
  return h.openings.flatMap((o) => {
    const l = lineOf(lines, o.wall);
    if (!l) return [];
    const [a, b] = openingEnds(l, o);
    const [o0, o1] = thicknessOf(l);
    const g: OpeningGeom = { id: o.id, kind: o.kind, name: openingName(h, o), wall: o.wall, outer: l.outer, a, b, dir: l.dir, n: l.n, o0, o1, width: o.width, box: slab(l, o.at, o.at + o.width, o0, o1) };
    if (OPENINGS[o.kind]?.hinged) {
      const side = o.side ?? OPENINGS[o.kind].side;
      // 문은 열리는 쪽 벽 면에 붙어 돈다.
      const face = side > 0 ? o1 : o0;
      const at = (p: Pt): Pt => [p[0] + l.n[0] * face, p[1] + l.n[1] * face];
      const [hp, lp] = o.hinge === "b" ? [b, a] : [a, b];
      g.hinge = at(hp);
      g.latch = at(lp);
      g.swing = [l.n[0] * side, l.n[1] * side];
    }
    return [g];
  });
}

/** 문 앞 비워 둘 자리의 최대 깊이(1차 방 한 칸과 같은 임시값) */
export const HOUSE_DOOR_DEPTH = 0.9;

export interface HouseDoorZone extends Box {
  id: string;
  label: string;
  width: number;
  depth: number;
}

/** 문·통로 앞 비워 둘 자리: 문 폭 × 깊이(문 폭, 최대 900mm). 내부 벽은 양쪽, 바깥 벽은 집 안쪽만. 창은 없음 */
export function houseDoorZones(h: Pick<HouseModel, "outline" | "walls" | "outerT" | "openings">, geoms = openingGeoms(h)): HouseDoorZone[] {
  return geoms
    .filter((g) => g.kind !== "window")
    .flatMap((g) => {
      const c = r3(Math.min(g.width, HOUSE_DOOR_DEPTH));
      const sides: [number, number][] = g.outer ? [[1, g.o1]] : [[1, g.o1], [-1, g.o0]];
      return sides.map(([s, off]) => {
        const nn: Pt = [g.n[0] * s, g.n[1] * s];
        const shift = (p: Pt): Pt => [p[0] + g.n[0] * off, p[1] + g.n[1] * off];
        const z = zoneInward(shift(g.a), shift(g.b), nn, c);
        return { x: r3(z.x), y: r3(z.y), w: r3(z.w), d: r3(z.d), id: g.id, label: g.name, width: r3(g.width), depth: c };
      });
    });
}

// ── 3D(기존 3D 화면 Viewer3D가 그리는 배치안 형식으로 만든다)
const WALL_COLOR = "#eeeae2";
const INNER_COLOR = "#f2efe8";
const FIXED_COLOR = "#d6cdbd";
const PILLAR_COLOR = "#e4e0d7";
const GLASS = "#abd3df";
export const DOOR_H = 2.1;
const SILL = 0.9;

export function composeHouse(h: HouseModel, det: RoomDetection, title = "집 전체 평면"): LayoutOption {
  const H = h.height;
  const objects: Obj[] = [];
  const box = (name: string, b: Box, z: number, height: number, color: string, kind: Obj["kind"], opacity = 1, plan = true) =>
    objects.push({ name, x: r3(b.x), y: r3(b.y), z: r3(z), w: r3(b.w), d: r3(b.d), h: r3(height), color, kind, opacity, plan });
  // 바닥: 집 전체(벽 아래 포함)를 조금 낮게 깔고, 방마다 색을 달리한 바닥을 위에 둔다.
  for (const c of cellsOf(h.outline).inside) box("바닥", c, -0.2, 0.19, "#ddd8cd", "floor");
  for (const r of det.regions) for (const rc of r.rects) box(`바닥 · ${r.display}`, rc, -0.16, 0.16, roomColor(r.kind), "floor");
  const lines = wallLines(h);
  // 벽은 모두 ‘외벽’ 종류로 넣어 3D 화면의 낮춰 보기(기본)·전체 높이 보기를 함께 쓴다.
  for (const p of wallPieces(h, lines)) box(p.outer ? "바깥 벽" : "내부 벽", p, 0, H, p.outer ? WALL_COLOR : INNER_COLOR, "outer");
  for (const g of openingGeoms(h, lines)) {
    if (g.kind === "window") {
      box("창 아래 벽", g.box, 0, Math.min(SILL, H), WALL_COLOR, "outer");
      if (H > DOOR_H + 0.05) box("창 위 벽", g.box, DOOR_H, H - DOOR_H, WALL_COLOR, "outer", 1, false);
      const mid = (g.o0 + g.o1) / 2;
      const glass = { x: g.box.x, y: g.box.y, w: g.box.w, d: g.box.d };
      if (Math.abs(g.dir[0]) > 0.5) {
        glass.y = r3(Math.min(g.a[1], g.b[1]) + g.n[1] * mid - 0.0125);
        glass.d = 0.025;
      } else {
        glass.x = r3(Math.min(g.a[0], g.b[0]) + g.n[0] * mid - 0.0125);
        glass.w = 0.025;
      }
      box("창호", glass, SILL, Math.min(DOOR_H, H) - SILL, GLASS, "window", 0.6, false);
    } else if (H > DOOR_H + 0.05) box(g.kind === "passage" ? "통로 위 벽" : "문 위 벽", g.box, DOOR_H, H - DOOR_H, g.outer ? WALL_COLOR : INNER_COLOR, "outer", 1, false);
  }
  for (const f of h.fixed) box(fixedLabel(f), f, 0, f.h ?? H, f.h == null ? PILLAR_COLOR : FIXED_COLOR, "pillar");
  // 부품이 있는 가구는 부품대로, 부품이 없는 가구(후속: 규격만 있는 상품)는 바닥면 크기의 상자로 그린다.
  for (const it of h.items) {
    if (it.parts.length) objects.push(...worldParts(it));
    else {
      const f = footprint(it);
      objects.push({ name: it.label, x: r3(f.x), y: r3(f.y), z: 0, w: r3(f.w), d: r3(f.d), h: r3(it.product?.h ?? 0.8), color: "#c9c3b6", kind: "furniture", opacity: 1, plan: true, g: it.id });
    }
  }
  const rooms: RoomInfo[] = det.regions
    .filter((r) => !r.sliver)
    .map((r) => {
      const w = Math.min(3, r.box.w);
      return { key: "spare", label: `${r.display} ${r.area.toFixed(1)}㎡`, x: r3(r.anchor[0] - w / 2), y: r3(r.anchor[1] - 0.75), w, d: 1 };
    });
  return {
    id: "house",
    title,
    summary: "고객이 입력한 집 평면 · 실측 도면 아님",
    W: h.width,
    D: h.depth,
    seats: 0,
    deskWidth: 0,
    objects,
    rooms,
    furniture: furnitureOf(h.items, null),
    marks: { doors: [], windows: [], entrance: { x1: 0, x2: 0 }, seats: [] },
    groups: h.items.map((it) => ({ id: it.id, label: it.label, type: it.type, bom: it.bom })),
    ...(h.outline.length > 4 ? { outline: h.outline } : {}),
  };
}

