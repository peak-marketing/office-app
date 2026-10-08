import { josa } from "./check";
import type { RoomModel, Rot, WallSide } from "./types";

// 실제 구조의 모양. 직사각형(rect)과 도면에서 따라 그린 직각 다각형(polygon)을 같은 방식으로 다룬다.
// 꼭짓점은 반시계 방향(안쪽이 진행 방향의 왼쪽), 바깥 사각형의 왼쪽 아래가 (0, 0)이다.
// 직사각형의 변 번호: 0 앞벽(출입문 벽), 1 오른쪽 벽, 2 안쪽 벽, 3 왼쪽 벽.

export type Pt = [number, number];
export interface Box {
  x: number;
  y: number;
  w: number;
  d: number;
}
export interface Edge {
  i: number;
  a: Pt;
  b: Pt;
  len: number;
  /** 진행 방향(단위 벡터) */
  dir: Pt;
  /** 안쪽을 향하는 방향(단위 벡터) */
  inward: Pt;
  /** 직사각형일 때 벽 이름 */
  wall?: WallSide;
}

const r = (n: number) => Math.round(n * 1000) / 1000;
const RECT_WALLS: WallSide[] = ["front", "right", "rear", "left"];

export const isPolygon = (room: Pick<RoomModel, "shape" | "outline">) => room.shape === "polygon" && !!room.outline && room.outline.length >= 4;

export function outlineOf(room: Pick<RoomModel, "shape" | "outline" | "width" | "depth">): Pt[] {
  if (isPolygon(room)) return room.outline!;
  const { width: W, depth: D } = room;
  return [
    [0, 0],
    [W, 0],
    [W, D],
    [0, D],
  ];
}

export function edgesOf(room: Pick<RoomModel, "shape" | "outline" | "width" | "depth">): Edge[] {
  const pts = outlineOf(room);
  const rect = !isPolygon(room);
  return pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dir: Pt = [(b[0] - a[0]) / (len || 1), (b[1] - a[1]) / (len || 1)];
    return { i, a, b, len, dir, inward: [-dir[1], dir[0]], ...(rect ? { wall: RECT_WALLS[i] } : {}) };
  });
}

export function polygonArea(pts: Pt[]) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

export function pointInPolygon(x: number, y: number, pts: Pt[]) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 바깥 사각형을 꼭짓점 좌표로 칸을 나눠, 안쪽 칸(바닥)과 바깥 칸(공간 밖)으로 가른다. 같은 줄의 이웃 칸은 합친다. */
export function cellsOf(pts: Pt[]): { inside: Box[]; outside: Box[] } {
  const xs = [...new Set(pts.map((p) => r(p[0])))].sort((a, b) => a - b);
  const ys = [...new Set(pts.map((p) => r(p[1])))].sort((a, b) => a - b);
  const inside: Box[] = [];
  const outside: Box[] = [];
  for (let j = 0; j < ys.length - 1; j++) {
    let run: { in: boolean; x0: number; x1: number } | null = null;
    const flush = () => {
      if (!run) return;
      (run.in ? inside : outside).push({ x: run.x0, y: ys[j], w: r(run.x1 - run.x0), d: r(ys[j + 1] - ys[j]) });
    };
    for (let i = 0; i < xs.length - 1; i++) {
      const isIn = pointInPolygon((xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2, pts);
      if (run && run.in === isIn) run.x1 = xs[i + 1];
      else {
        flush();
        run = { in: isIn, x0: xs[i], x1: xs[i + 1] };
      }
    }
    flush();
  }
  return { inside, outside };
}

export const roomArea = (room: Pick<RoomModel, "shape" | "outline" | "width" | "depth">) => (isPolygon(room) ? Math.abs(polygonArea(room.outline!)) : room.width * room.depth);

/** 벽(직사각형) 또는 변(다각형) 위의 구간. 직사각형의 at은 기존 규칙(앞·안쪽 벽은 왼쪽 벽에서, 옆 벽은 앞벽에서)을 따른다. */
export function refSegment(room: RoomModel, ref: { wall?: WallSide; edge?: number; at: number }, width: number) {
  const edges = edgesOf(room);
  if (isPolygon(room) || ref.wall == null) {
    const e = edges[ref.edge ?? 0];
    if (!e) return null;
    const a: Pt = [r(e.a[0] + e.dir[0] * ref.at), r(e.a[1] + e.dir[1] * ref.at)];
    const b: Pt = [r(a[0] + e.dir[0] * width), r(a[1] + e.dir[1] * width)];
    return { a, b, edge: e, fits: ref.at >= -1e-6 && ref.at + width <= e.len + 1e-6 };
  }
  const { width: W, depth: D } = room;
  const e = edges[RECT_WALLS.indexOf(ref.wall)];
  const seg: [Pt, Pt] =
    ref.wall === "front"
      ? [[ref.at, 0], [ref.at + width, 0]]
      : ref.wall === "rear"
        ? [[ref.at, D], [ref.at + width, D]]
        : ref.wall === "left"
          ? [[0, ref.at], [0, ref.at + width]]
          : [[W, ref.at], [W, ref.at + width]];
  const len = ref.wall === "front" || ref.wall === "rear" ? W : D;
  return { a: [r(seg[0][0]), r(seg[0][1])] as Pt, b: [r(seg[1][0]), r(seg[1][1])] as Pt, edge: e, fits: ref.at >= -1e-6 && ref.at + width <= len + 1e-6 };
}

/** 구간 앞(안쪽)으로 depth만큼 나온 사각형 */
export function zoneInward(a: Pt, b: Pt, inward: Pt, depth: number): Box {
  const x1 = Math.min(a[0], b[0], a[0] + inward[0] * depth, b[0] + inward[0] * depth);
  const x2 = Math.max(a[0], b[0], a[0] + inward[0] * depth, b[0] + inward[0] * depth);
  const y1 = Math.min(a[1], b[1], a[1] + inward[1] * depth, b[1] + inward[1] * depth);
  const y2 = Math.max(a[1], b[1], a[1] + inward[1] * depth, b[1] + inward[1] * depth);
  return { x: x1, y: y1, w: x2 - x1, d: y2 - y1 };
}

/** 따라 그린 꼭짓점 정리: 반시계 방향으로 돌리고, 같은 점·일직선 위의 점을 빼고, 왼쪽 아래를 (0, 0)으로 옮긴다. */
export function normalizeOutline(input: Pt[]): Pt[] {
  let pts = input.map(([x, y]) => [r(x), r(y)] as Pt);
  pts = pts.filter((p, i) => {
    const q = pts[(i + pts.length - 1) % pts.length];
    return Math.abs(p[0] - q[0]) > 1e-6 || Math.abs(p[1] - q[1]) > 1e-6;
  });
  // 일직선 위의 가운데 점 제거
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[(i + pts.length - 1) % pts.length];
      const q = pts[i];
      const s = pts[(i + 1) % pts.length];
      if (Math.abs((q[0] - p[0]) * (s[1] - q[1]) - (q[1] - p[1]) * (s[0] - q[0])) < 1e-9) {
        pts.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  if (polygonArea(pts) < 0) pts.reverse();
  const minX = Math.min(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1]));
  pts = pts.map(([x, y]) => [r(x - minX), r(y - minY)] as Pt);
  // 시작점: 가장 아래쪽 변의 왼쪽 끝
  const start = pts.reduce((best, p, i) => (p[1] < pts[best][1] - 1e-9 || (Math.abs(p[1] - pts[best][1]) < 1e-9 && p[0] < pts[best][0]) ? i : best), 0);
  return [...pts.slice(start), ...pts.slice(0, start)];
}

function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt) {
  // 직각 다각형의 변끼리 교차(끝점을 공유하는 이웃 변은 제외하고 호출한다)
  const minX1 = Math.min(a[0], b[0]), maxX1 = Math.max(a[0], b[0]), minY1 = Math.min(a[1], b[1]), maxY1 = Math.max(a[1], b[1]);
  const minX2 = Math.min(c[0], d[0]), maxX2 = Math.max(c[0], d[0]), minY2 = Math.min(c[1], d[1]), maxY2 = Math.max(c[1], d[1]);
  return minX1 <= maxX2 + 1e-9 && minX2 <= maxX1 + 1e-9 && minY1 <= maxY2 + 1e-9 && minY2 <= maxY1 + 1e-9;
}

/** 따라 그린 외곽 검사: 닫힌 직각 다각형인지, 벽끼리 겹치거나 꼬이지 않는지 */
export function outlineErrors(pts: Pt[]): string[] {
  const errs: string[] = [];
  if (pts.length < 4) return ["벽 모서리를 4개 이상 찍어 닫힌 도형을 만들어 주세요."];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = Math.abs(b[0] - a[0]);
    const dy = Math.abs(b[1] - a[1]);
    if (dx > 1e-6 && dy > 1e-6) {
      errs.push(`${josa(`벽 ${i + 1}`, "이", "가")} 기울어져 있어요. 지금은 직각으로 만나는 벽만 그릴 수 있어요.`);
      break;
    }
    if (dx + dy < 0.1) {
      errs.push(`${josa(`벽 ${i + 1}`, "이", "가")} 100mm보다 짧아요. 모서리를 다시 찍어 주세요.`);
      break;
    }
  }
  if (errs.length) return errs;
  const n = pts.length;
  for (let i = 0; i < n && !errs.length; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) {
        errs.push(`${josa(`벽 ${i + 1}`, "과", "와")} ${josa(`벽 ${j + 1}`, "이", "가")} 겹치거나 꼬였어요. 모서리 순서를 확인해 주세요.`);
        break;
      }
    }
  const area = Math.abs(polygonArea(pts));
  if (!errs.length && area < 4) errs.push("공간 면적이 4㎡보다 작아요. 축척과 모서리를 확인해 주세요.");
  const W = Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]));
  const D = Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]));
  if (W > 60 || D > 60) errs.push("바깥 치수가 60,000mm를 넘어요. 축척을 확인해 주세요.");
  return errs;
}

/** 점을 rot만큼(반시계) 돌린다. 바깥 사각형 W × D 기준이며, 돌린 뒤 다시 왼쪽 아래가 (0, 0)이 되게 옮긴다. */
export function rotatePoint([x, y]: Pt, rot: Rot, W: number, D: number): Pt {
  switch (rot) {
    case 90:
      return [r(D - y), r(x)];
    case 180:
      return [r(W - x), r(D - y)];
    case 270:
      return [r(y), r(W - x)];
    default:
      return [x, y];
  }
}

/** 출입문이 있는 변을 앞벽(아래)으로 오게 하는 회전 */
export function rotationToFront(dir: Pt): Rot {
  // 앞벽은 +x 방향으로 진행한다.
  if (dir[0] > 0.5) return 0;
  if (dir[1] > 0.5) return 270;
  if (dir[0] < -0.5) return 180;
  return 90;
}
