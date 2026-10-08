import { edgesOf, normalizeOutline, outlineErrors, outlineOf, polygonArea, rotationToFront, type Pt } from "./geometry";
import type { PillarSpec, RoomModel, Rot, Underlay, WallSide } from "./types";

// 도면 따라 그리기(F). 도면 이미지 위에 고객이 찍은 벽 모서리를 공간 좌표로 옮긴다.
// 도면을 자동으로 읽지 않는다. 축척은 고객이 길이를 아는 두 점으로 맞춘다.
// 좌표: 이미지 픽셀 (u, v)는 아래로 v가 커지고, 공간 좌표 (x, y)는 위로 y가 커진다(y = 앞벽 → 안쪽).

export type Mat = Underlay["m"];

export const applyMat = (m: Mat, [u, v]: Pt): Pt => [m[0] * u + m[2] * v + m[4], m[1] * u + m[3] * v + m[5]];

export function invertMat(m: Mat): Mat {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

/** 축척 s(미터/픽셀)로 이미지를 공간 좌표로: x = s·u, y = −s·v */
export const scaleMat = (s: number): Mat => [s, 0, 0, -s, 0, 0];

/** 두 점 사이 픽셀 거리와 실제 길이(mm)로 축척(미터/픽셀) */
export function scaleFrom(p1: Pt, p2: Pt, mm: number) {
  const px = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  if (!(px > 5) || !(mm >= 300)) return null;
  return mm / 1000 / px;
}

/**
 * 찍은 점의 정밀도(이미지 픽셀). 첫 점을 포함해 모든 꼭짓점을 같은 격자에 둔다.
 * 그래야 직각으로 맞춘 좌표가 정확히 같은 값이 되고, mm 반올림 뒤에도 벽이 기울지 않는다.
 */
export const quantize = ([u, v]: Pt): Pt => [Math.round(u * 10) / 10, Math.round(v * 10) / 10]; // 0.1px 격자
/** 닫을 때 같은 줄로 보고 맞추는 차이(이미지 픽셀). 화면 좌표 변환에서 생기는 소수 오차만 흡수한다. */
export const CLOSE_TOL = 1;

/** 직각으로 맞춘 다음 점: 앞 점에서 가로·세로 가운데 많이 움직인 쪽만 남긴다. 다른 꼭짓점과 줄이 거의 맞으면 맞춘다. */
export function snapOrtho(prev: Pt, p: Pt, others: Pt[], tol: number): Pt {
  const horizontal = Math.abs(p[0] - prev[0]) >= Math.abs(p[1] - prev[1]);
  let q: Pt = horizontal ? [p[0], prev[1]] : [prev[0], p[1]];
  if (horizontal) {
    const hit = others.find((o) => Math.abs(o[0] - q[0]) < tol);
    if (hit) q = [hit[0], q[1]];
  } else {
    const hit = others.find((o) => Math.abs(o[1] - q[1]) < tol);
    if (hit) q = [q[0], hit[1]];
  }
  return q;
}

/**
 * 찍은 꼭짓점을 닫는다. 마지막 점과 첫 점이 가로·세로 둘 다 다르면 꺾이는 모서리 하나를 넣는다.
 * 넣을 수 있는 두 자리 가운데 벽이 꼬이지 않는 쪽을 고른다.
 */
/** 화면에서 찍은 점 → 꼭짓점으로 넣을 점. 첫 점도 같은 격자로 맞추고, 둘째부터는 직각·줄 맞춤 뒤 격자로 맞춘다. */
export function nextTracePoint(pts: Pt[], raw: Pt, tol: number): Pt {
  if (!pts.length) return quantize(raw);
  return quantize(snapOrtho(pts[pts.length - 1], raw, pts.slice(0, -1), tol));
}

/**
 * 직각 외곽 바로잡기: 가로 변의 양 끝은 같은 세로 좌표, 세로 변의 양 끝은 같은 가로 좌표가 되게 묶어
 * 묶음마다 먼저 찍은 점의 값으로 맞춘다. 차이가 tol보다 큰 변(실제로 기운 변)은 건드리지 않는다.
 */
export function rectifyOrtho(pts: Pt[], tol = CLOSE_TOL): Pt[] {
  const n = pts.length;
  const parent = { x: pts.map((_, i) => i), y: pts.map((_, i) => i) };
  const find = (axis: "x" | "y", i: number): number => (parent[axis][i] === i ? i : (parent[axis][i] = find(axis, parent[axis][i])));
  const join = (axis: "x" | "y", a: number, b: number) => {
    const [ra, rb] = [find(axis, a), find(axis, b)];
    if (ra !== rb) parent[axis][Math.max(ra, rb)] = Math.min(ra, rb);
  };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = Math.abs(pts[j][0] - pts[i][0]), dy = Math.abs(pts[j][1] - pts[i][1]);
    if (dx >= dy && dy <= tol) join("y", i, j);
    else if (dy > dx && dx <= tol) join("x", i, j);
  }
  return pts.map((_, i) => [pts[find("x", i)][0], pts[find("y", i)][1]] as Pt);
}

export function closeOutline(pts: Pt[], tol = 0): Pt[] | null {
  if (pts.length < 3) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const same = (a: number, b: number) => Math.abs(a - b) <= Math.max(tol, 1e-9);
  if (same(first[0], last[0]) || same(first[1], last[1])) return pts;
  for (const corner of [
    [first[0], last[1]],
    [last[0], first[1]],
  ] as Pt[]) {
    const cand = [...pts, corner];
    if (!outlineErrors(normalizeOutline(cand)).some((e) => e.includes("꼬였") || e.includes("기울"))) return cand;
  }
  return null;
}

export interface EdgeRef {
  edge: number;
  at: number;
}

/** 따라 그리는 중인 공간(도면 좌표). 확정하면 RoomModel로 바꾼다. */
export interface TraceDraft {
  /** 정리된 꼭짓점(반시계, 왼쪽 아래 (0, 0)) */
  outline: Pt[];
  /** 이미지 픽셀 → 이 좌표 */
  m: Mat;
  iw: number;
  ih: number;
  entrance: (EdgeRef & { width: number }) | null;
  /** null이면 창 위치를 모름 */
  windows: (EdgeRef & { width: number })[] | null;
  pillars: PillarSpec[];
  utilities: EdgeRef[];
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

function rotExact([x, y]: Pt, rot: Rot, W: number, D: number): Pt {
  if (rot === 90) return [D - y, x];
  if (rot === 180) return [W - x, D - y];
  if (rot === 270) return [y, W - x];
  return [x, y];
}

const edgesOfOutline = (outline: Pt[]) => edgesOf({ shape: "polygon", outline, width: 0, depth: 0 });

/** 변 위의 구간 → 양 끝 좌표 */
function refPoints(outline: Pt[], ref: EdgeRef, width: number): [Pt, Pt] | null {
  const e = edgesOfOutline(outline)[ref.edge];
  if (!e) return null;
  const a: Pt = [e.a[0] + e.dir[0] * ref.at, e.a[1] + e.dir[1] * ref.at];
  return [a, [a[0] + e.dir[0] * width, a[1] + e.dir[1] * width]];
}

/** 좌표 → 그 점을 지나는 변과 변 시작점에서의 거리 */
function refOf(outline: Pt[], p: Pt): EdgeRef | null {
  let best: { ref: EdgeRef; dist: number } | null = null;
  for (const e of edgesOfOutline(outline)) {
    const t = (p[0] - e.a[0]) * e.dir[0] + (p[1] - e.a[1]) * e.dir[1];
    if (t < -1e-6 || t > e.len + 1e-6) continue;
    const dist = Math.abs((p[0] - e.a[0]) * e.inward[0] + (p[1] - e.a[1]) * e.inward[1]);
    if (!best || dist < best.dist) best = { ref: { edge: e.i, at: Math.max(0, t) }, dist };
  }
  return best && best.dist < 1e-3 ? best.ref : null;
}

/** 화면에서 누른 점 → 가장 가까운 변과 위치(픽셀 거리 tol 안) */
export function pickEdge(outline: Pt[], p: Pt, tol: number) {
  let best: { edge: number; at: number; dist: number } | null = null;
  for (const e of edgesOfOutline(outline)) {
    const t = (p[0] - e.a[0]) * e.dir[0] + (p[1] - e.a[1]) * e.dir[1];
    if (t < -tol || t > e.len + tol) continue;
    const dist = Math.abs((p[0] - e.a[0]) * e.inward[0] + (p[1] - e.a[1]) * e.inward[1]);
    if (dist <= tol && (!best || dist < best.dist)) best = { edge: e.i, at: Math.min(e.len, Math.max(0, t)), dist };
  }
  return best;
}

/**
 * 도면 좌표를 돌리고 다시 정리한다(출입문 변을 앞쪽으로). 창·출입문·급배수·기둥과 밑그림 행렬도 같이 옮긴다.
 * 변 번호는 정리하면서 바뀌므로 위치는 좌표로 다시 찾는다.
 */
export function rotateDraft(d: TraceDraft, rot: Rot): TraceDraft {
  if (rot === 0) return d;
  const W = Math.max(...d.outline.map((p) => p[0]));
  const D = Math.max(...d.outline.map((p) => p[1]));
  const R = (p: Pt) => rotExact(p, rot, W, D);
  const outline = normalizeOutline(d.outline.map(R));
  const move = <T extends EdgeRef>(ref: T, width: number): T | null => {
    const pts = refPoints(d.outline, ref, width);
    if (!pts) return null;
    const a = R(pts[0]);
    const nr = refOf(outline, a);
    return nr ? { ...ref, edge: nr.edge, at: r3(nr.at) } : null;
  };
  const o = R(applyMat(d.m, [0, 0]));
  const ux = R(applyMat(d.m, [1, 0]));
  const vy = R(applyMat(d.m, [0, 1]));
  // R은 평행 이동이 섞인 회전이라 기준점 세 개로 행렬을 다시 만든다.
  const m: Mat = [ux[0] - o[0], ux[1] - o[1], vy[0] - o[0], vy[1] - o[1], o[0], o[1]];
  return {
    ...d,
    outline,
    m,
    entrance: d.entrance ? move(d.entrance, d.entrance.width) : null,
    windows: d.windows ? d.windows.flatMap((w) => move(w, w.width) ?? []) : null,
    utilities: d.utilities.flatMap((u) => move(u, 0) ?? []),
    pillars: d.pillars.map((p) => {
      const a = R([p.x, p.y]);
      const b = R([p.x + p.w, p.y + p.d]);
      return { x: r3(Math.min(a[0], b[0])), y: r3(Math.min(a[1], b[1])), w: r3(Math.abs(b[0] - a[0])), d: r3(Math.abs(b[1] - a[1])) };
    }),
  };
}

/** 출입문이 있는 변이 앞쪽(안쪽이 위)을 보게 돌린다. */
export function orientDraft(d: TraceDraft): TraceDraft {
  if (!d.entrance) return d;
  const e = edgesOfOutline(d.outline)[d.entrance.edge];
  return e ? rotateDraft(d, rotationToFront(e.dir)) : d;
}

/**
 * 벽 길이를 숫자로 맞춘다: 변 i의 끝 쪽 벽(변 i+1)을 변 i 방향으로 민다. 변 i+2의 길이가 그만큼 바뀐다.
 * 변 i+2 위에 둔 창·급배수는 실제 위치가 그대로 있게 거리를 고친다.
 */
export function setEdgeLength(d: TraceDraft, i: number, len: number): TraceDraft | { error: string } {
  const n = d.outline.length;
  const edges = edgesOfOutline(d.outline);
  const e = edges[i];
  if (!e) return { error: "벽을 찾을 수 없어요." };
  if (!(len >= 0.1 && len <= 60)) return { error: "벽 길이는 100~60,000mm 사이로 넣어 주세요." };
  const delta = len - e.len;
  if (Math.abs(delta) < 1e-6) return d;
  const j1 = (i + 1) % n, j2 = (i + 2) % n;
  const dot = e.dir[0] * edges[j2].dir[0] + e.dir[1] * edges[j2].dir[1];
  const raw = d.outline.map((p, k) => (k === j1 || k === j2 ? ([r3(p[0] + e.dir[0] * delta), r3(p[1] + e.dir[1] * delta)] as Pt) : p));
  const errs = outlineErrors(raw);
  if (errs.length) return { error: `${errs[0]} 다른 벽 길이를 먼저 맞춰 보세요.` };
  if (JSON.stringify(normalizeOutline(raw)) !== JSON.stringify(raw)) return { error: "이 길이로 바꾸면 벽 순서가 달라져요. 다시 그려 주세요." };
  const fix = <T extends EdgeRef>(ref: T): T => (ref.edge === j2 ? { ...ref, at: r3(ref.at - delta * dot) } : ref);
  return { ...d, outline: raw, entrance: d.entrance ? fix(d.entrance) : null, windows: d.windows?.map(fix) ?? null, utilities: d.utilities.map(fix) };
}

const RECT: WallSide[] = ["front", "right", "rear", "left"];

/** 따라 그린 공간 → 내 공간 구조. 꼭짓점이 4개면 직사각형(출입문 벽이 앞벽), 아니면 다각형 */
export function draftToRoom(d0: TraceDraft, extra: { height: number | null; areaHint: number | null; fileId?: number }): RoomModel | { error: string } {
  const oe = outlineErrors(d0.outline);
  if (oe.length) return { error: oe[0] };
  if (!d0.entrance) return { error: "출입문 위치를 정해 주세요." };
  const d = orientDraft(d0);
  if (!d.entrance) return { error: "출입문 위치를 다시 정해 주세요." };
  const W = Math.max(...d.outline.map((p) => p[0]));
  const D = Math.max(...d.outline.map((p) => p[1]));
  const underlay: Underlay = { fileId: extra.fileId ?? 0, iw: d.iw, ih: d.ih, m: d.m };
  const base = { width: r3(W), depth: r3(D), height: extra.height, pillars: d.pillars, source: "trace" as const, areaHint: extra.areaHint, underlay };
  if (d.outline.length === 4) {
    const len = [W, D, W, D];
    // 직사각형 벽의 거리 규칙: 앞·안쪽 벽은 왼쪽 벽에서, 옆 벽은 앞벽에서
    const wallRef = (ref: EdgeRef, width: number) => ({ wall: RECT[ref.edge], at: r3(ref.edge >= 2 ? len[ref.edge] - ref.at - width : ref.at) });
    return {
      ...base,
      shape: "rect",
      entrance: { at: r3(d.entrance.at), width: r3(d.entrance.width) },
      windows: d.windows ? d.windows.map((w) => ({ ...wallRef(w, w.width), width: r3(w.width) })) : null,
      utilities: d.utilities.map((u) => ({ kind: "water" as const, ...wallRef(u, 0) })),
    };
  }
  return {
    ...base,
    shape: "polygon",
    outline: d.outline,
    entrance: { edge: d.entrance.edge, at: r3(d.entrance.at), width: r3(d.entrance.width) },
    windows: d.windows ? d.windows.map((w) => ({ edge: w.edge, at: r3(w.at), width: r3(w.width) })) : null,
    utilities: d.utilities.map((u) => ({ kind: "water" as const, edge: u.edge, at: r3(u.at) })),
  };
}

/** 저장된 공간(따라 그린 것) → 다시 고치기 위한 초안 */
export function roomToDraft(room: RoomModel): TraceDraft | null {
  if (!room.underlay) return null;
  const outline = outlineOf(room);
  const len = [room.width, room.depth, room.width, room.depth];
  const edgeRef = (ref: { wall?: WallSide; edge?: number; at: number }, width: number): EdgeRef => {
    if (room.shape === "polygon" || ref.wall == null) return { edge: ref.edge ?? 0, at: ref.at };
    const i = RECT.indexOf(ref.wall);
    return { edge: i, at: r3(i >= 2 ? len[i] - ref.at - width : ref.at) };
  };
  return {
    outline,
    m: room.underlay.m,
    iw: room.underlay.iw,
    ih: room.underlay.ih,
    entrance: room.shape === "polygon" ? { edge: room.entrance.edge ?? 0, at: room.entrance.at, width: room.entrance.width } : { edge: 0, at: room.entrance.at, width: room.entrance.width },
    windows: room.windows ? room.windows.map((w) => ({ ...edgeRef(w, w.width), width: w.width })) : null,
    pillars: room.pillars,
    utilities: (room.utilities ?? []).map((u) => edgeRef(u, 0)),
  };
}

/** 픽셀로 찍은 꼭짓점 → 정리된 초안 */
export function draftFromPixels(px: Pt[], s: number, iw: number, ih: number): TraceDraft | { error: string } {
  // 모든 점을 같은 격자로 맞추고(예전 방식으로 찍힌 첫 점 포함), 1px 안의 차이는 같은 줄로 본다.
  const closed = closeOutline(px.map(quantize), CLOSE_TOL);
  if (!closed) return { error: "벽 모서리를 3개 이상 찍어 주세요. 닫을 수 없는 모양이면 다시 그려 주세요." };
  const meters = rectifyOrtho(closed, CLOSE_TOL).map(([u, v]) => [u * s, -v * s] as Pt);
  const outline = normalizeOutline(meters);
  const errs = outlineErrors(outline);
  if (errs.length) return { error: errs[0] };
  const minX = Math.min(...meters.map((p) => p[0]));
  const minY = Math.min(...meters.map((p) => p[1]));
  // normalizeOutline은 좌표를 mm로 반올림한다. 밑그림은 같은 평행 이동만 반영한다.
  return { outline, m: [s, 0, 0, -s, -minX, -minY], iw, ih, entrance: null, windows: null, pillars: [], utilities: [] };
}

export const outlineArea = (outline: Pt[]) => Math.abs(polygonArea(outline));
