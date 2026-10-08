import { PYEONG } from "../layout/types";
import { savedProduct } from "./product-snapshot";
import { josa, overlaps } from "./check";
import { cellsOf, edgesOf, normalizeOutline, outlineErrors, pointInPolygon, polygonArea, type Box, type Pt } from "./geometry";
import { SIZE_MAX, SIZE_MIN, SIZE_RANGE_TEXT, homeCatalogItems, resizeItem, resizedLines, type RoomEdit } from "./home-room";
import { detectRooms, type HouseRegion, type RoomDetection } from "./house-rooms";
import { ROTS, diffPlacement } from "./placement";
import type { CatalogTemplate, PlacedItem, Underlay } from "./types";

// 집 전체 평면. 고객이 도면(따라 그리기)이나 실측 치수로 만든 바깥 벽 안에 내부 벽·문·창을 넣고,
// 벽으로 나뉜 영역을 방으로 구분해 이름을 붙인 뒤 개념 가구를 놓는다. 실측 도면이 아니며 설비·구조는 고객이 표시한 것만 있다.
// 좌표는 미터. RoomModel과 같은 규칙: x = 왼쪽 → 오른쪽, y = 앞(아래) → 안쪽(위). 바깥 윤곽은 반시계, 왼쪽 아래가 (0, 0)이다.
// 바깥 윤곽은 바깥 벽의 안쪽 면이고, 바깥 벽은 윤곽 바깥으로 두께 OUTER_T만큼 그린다.
// 방(영역)은 저장하지 않고 벽에서 매번 같은 방법으로 다시 찾는다(house-rooms.ts). 방 이름은 그 방 안의 점(라벨)으로 저장한다.

export type RoomKind = "living" | "bed" | "kitchen" | "bath" | "entry" | "balcony" | "dress" | "utility" | "other";
export type OpeningKind = "door" | "bath" | "entry" | "balcony" | "sliding" | "passage" | "window";
export type FixedKind = "pillar" | "closet" | "sink" | "bathtub" | "toilet" | "basin" | "boiler" | "shoe";

/** 내부 벽. 가로 또는 세로 선분(중심선)과 두께. a는 왼쪽(가로 벽)·아래쪽(세로 벽) 끝이다. */
export interface HouseWall {
  id: string;
  a: Pt;
  b: Pt;
  t: number;
}

/** 벽에 낸 문·통로·창. wall은 바깥 벽 변 `o{번호}` 또는 내부 벽 id, at은 그 벽 시작점(a)에서 문 가장자리까지 */
export interface HouseOpening {
  id: string;
  kind: OpeningKind;
  wall: string;
  at: number;
  width: number;
  /** 여닫이 문의 경첩 쪽: a(벽 시작점 쪽) 또는 b */
  hinge?: "a" | "b";
  /** 여닫이 문이 열리는 쪽: 1 = 벽 진행 방향의 왼쪽(바깥 벽이면 집 안쪽), -1 = 반대쪽 */
  side?: 1 | -1;
}

/** 방 이름. 그 방 안의 한 점으로 저장한다. 벽을 고치면 그 점이 든 영역의 이름이 된다. */
export interface HouseLabel {
  id: string;
  x: number;
  y: number;
  name: string;
  kind: RoomKind;
}

/** 고정 구조물·설비 자리(개념). 실제 설비가 아니라 자리만 표시한다. x·y는 왼쪽 아래 모서리 */
export interface HouseFixed {
  id: string;
  kind: FixedKind;
  x: number;
  y: number;
  w: number;
  d: number;
  /** 높이(m). null이면 천장까지 */
  h: number | null;
}

/**
 * 집에 놓은 가구. 지금은 치수 검토용 개념 가구(catalog:종류)만 놓는다.
 * 후속: 실제 상품을 놓을 때 product에 상품 id·옵션 id와 3D 모델 주소를 담는다. 화면과 검사는 부품(parts)과 바닥면(w·d)만 쓰므로,
 * 부품이 상자 하나뿐인 상품도 같은 경로로 그리고 검사한다.
 */
export type HouseItem = PlacedItem;

export interface HouseModel {
  v: 1;
  provenance?: { kind: "ai" | "template"; label: string; warnings: string[] };
  /** dims: 치수로 만든 직사각형, trace: 도면 이미지에서 따라 그린 직각 다각형 */
  source: "dims" | "trace";
  /** 바깥 벽 안쪽 면(반시계, 왼쪽 아래 (0, 0)) */
  outline: Pt[];
  width: number;
  depth: number;
  /** 천장 높이(m) */
  height: number;
  /** 바깥 벽 두께(그림용). 윤곽 바깥으로 그린다. */
  outerT: number;
  walls: HouseWall[];
  openings: HouseOpening[];
  labels: HouseLabel[];
  fixed: HouseFixed[];
  items: HouseItem[];
  underlay?: Underlay | null;
  /** 이 평면의 버전. 저장할 때마다 1씩 올라간다. */
  rev: number;
  saved_at: string;
}

/** 화면에서 서버로 보내는 편집 내용(윤곽·밑그림은 만들 때 정하고 저장할 때 바꾸지 않는다) */
export interface HouseEdit {
  height: number;
  walls: HouseWall[];
  openings: HouseOpening[];
  labels: HouseLabel[];
  fixed: HouseFixed[];
}

// ── 표시 문구
export const HOUSE_TITLE = "집 전체 평면";
export const HOUSE_BADGE = "고객이 입력한 집 평면 · 실측 도면 아님";
export const HOUSE_LABEL = "고객이 입력한 집 평면 · 실측 도면 아님 · 설비·구조는 표시한 것만";
export const HOUSE_SCOPE_TEXT = "도면이나 실측 치수로 고객이 직접 입력한 집 평면이에요. 실측 도면이 아니며, 설비·구조는 고객이 표시한 것만 들어 있어요. 벽 두께와 면적은 입력값으로 계산한 추정이에요.";
export const HOUSE_VENDOR_TEXT = "고객이 입력한 집 평면(참고)입니다. 실측 도면이 아니며, 설비·구조는 고객이 표시한 것만 있습니다. 벽 두께·면적은 입력값으로 계산한 추정이고, 공사 범위는 요청 내용을 기준으로 합니다.";
export const HOUSE_AREA_NOTE = "방 면적은 벽 안쪽을 50mm 격자로 센 추정값이에요(내부 치수 기준). 실측·공부상 면적과 다를 수 있어요.";
export const HOUSE_FIXED_NOTE = "고정 구조물은 자리 표시예요. 실제 설비·제품이 아니며 크기는 고객이 넣은 값이에요.";
export const HOUSE_INDEPENDENT_TEXT = "공사 요청 없이도 만들고 저장할 수 있어요. 요청을 보내면 그때의 평면이 함께 전달돼요.";

/** 지원 범위(임시) */
export const HOUSE_MIN = 2;
export const HOUSE_MAX = 40;
export const HOUSE_RANGE_TEXT = "집 바깥 가로·세로 2,000~40,000mm (현재 임시 지원 범위)";
export const HEIGHT_DEFAULT = 2.4;
export const HEIGHT_MIN = 2;
export const HEIGHT_MAX = 5;
export const OUTER_T = 0.2;
export const WALL_T_DEFAULT = 0.1;
export const WALL_T_MIN = 0.05;
export const WALL_T_MAX = 0.4;
export const WALL_MIN_LEN = 0.1;
/** 벽을 그릴 때 맞추는 격자(m) */
export const SNAP = 0.05;
export const MAX_WALLS = 150;
export const MAX_OPENINGS = 80;
export const MAX_LABELS = 40;
export const MAX_FIXED = 40;
export const MAX_HOUSE_ITEMS = 200;

export const ROOM_KINDS: { kind: RoomKind; label: string; color: string }[] = [
  { kind: "living", label: "거실", color: "#e8dcc2" },
  { kind: "bed", label: "침실", color: "#ece3cf" },
  { kind: "kitchen", label: "주방", color: "#e2dccf" },
  { kind: "bath", label: "욕실", color: "#d5e3e7" },
  { kind: "entry", label: "현관", color: "#dddad3" },
  { kind: "balcony", label: "발코니", color: "#dfdcd3" },
  { kind: "dress", label: "드레스룸", color: "#e9e0cd" },
  { kind: "utility", label: "다용도실", color: "#dedcd5" },
  { kind: "other", label: "기타", color: "#e6e2d9" },
];
export const UNNAMED_COLOR = "#f1eee8";
export const roomColor = (kind: RoomKind | null) => ROOM_KINDS.find((k) => k.kind === kind)?.color ?? UNNAMED_COLOR;

export const OPENINGS: Record<OpeningKind, { label: string; width: number; min: number; max: number; hinged: boolean; outerOnly: boolean; side: 1 | -1 }> = {
  door: { label: "방문", width: 0.9, min: 0.5, max: 2.5, hinged: true, outerOnly: false, side: 1 },
  bath: { label: "욕실 문", width: 0.8, min: 0.5, max: 2.5, hinged: true, outerOnly: false, side: 1 },
  entry: { label: "현관문", width: 1.0, min: 0.5, max: 2.5, hinged: true, outerOnly: true, side: -1 },
  balcony: { label: "발코니 문", width: 0.9, min: 0.5, max: 2.5, hinged: true, outerOnly: false, side: 1 },
  sliding: { label: "미닫이", width: 1.2, min: 0.5, max: 8.0, hinged: false, outerOnly: false, side: 1 },
  passage: { label: "통로(문 없음)", width: 1.0, min: 0.5, max: 5.0, hinged: false, outerOnly: false, side: 1 },
  window: { label: "창", width: 1.5, min: 0.3, max: 8.0, hinged: false, outerOnly: true, side: 1 },
};
export const DOOR_KINDS: OpeningKind[] = ["door", "bath", "entry", "balcony", "sliding", "passage"];

/** 고정 구조물 기본 크기. 자리를 놓을 때 쓰는 시작값이며 고객이 고쳐 넣는다. */
export const FIXED_KINDS: Record<FixedKind, { label: string; w: number; d: number; h: number | null }> = {
  pillar: { label: "기둥", w: 0.4, d: 0.4, h: null },
  closet: { label: "붙박이장", w: 1.2, d: 0.6, h: 2.2 },
  sink: { label: "싱크대 자리", w: 2.4, d: 0.6, h: 0.85 },
  bathtub: { label: "욕조·샤워 자리", w: 1.5, d: 0.75, h: 0.55 },
  toilet: { label: "변기 자리", w: 0.45, d: 0.7, h: 0.75 },
  basin: { label: "세면대 자리", w: 0.6, d: 0.45, h: 0.85 },
  boiler: { label: "보일러실", w: 0.9, d: 0.9, h: null },
  shoe: { label: "신발장", w: 1.0, d: 0.35, h: 1.2 },
};
export const FIXED_ORDER = Object.keys(FIXED_KINDS) as FixedKind[];

export const r3 = (n: number) => Math.round(n * 1000) / 1000;
export const mmText = (m: number) => Math.round(Math.abs(m) * 1000).toLocaleString("ko-KR");
export const areaText = (m2: number) => `${m2.toFixed(1)}㎡ · 약 ${(m2 / PYEONG).toFixed(1)}평`;
export const snapGrid = (v: number, step = SNAP) => r3(Math.round(v / step) * step);
export const fixedLabel = (f: Pick<HouseFixed, "kind">) => FIXED_KINDS[f.kind]?.label ?? "고정 구조물";
export const idNum = (id: string) => Number(id.match(/(\d+)$/)?.[1] ?? 0);
/** 다음 id: 같은 머리글자 가운데 가장 큰 번호 + 1 */
export const nextId = (prefix: string, ids: string[]) => `${prefix}${Math.max(0, ...ids.filter((x) => x.startsWith(prefix)).map(idNum)) + 1}`;
export const wallName = (w: Pick<HouseWall, "id">) => `벽 ${idNum(w.id)}`;

// ── 벽 선(바깥 벽 변과 내부 벽을 같은 방식으로)
export interface WallLine {
  ref: string;
  a: Pt;
  b: Pt;
  len: number;
  dir: Pt;
  /** 진행 방향의 왼쪽. 바깥 벽이면 집 안쪽 */
  n: Pt;
  t: number;
  outer: boolean;
  name: string;
}

const outlineEdges = (outline: Pt[]) => edgesOf({ shape: "polygon", outline, width: 0, depth: 0 });

export function wallLines(h: Pick<HouseModel, "outline" | "walls" | "outerT">): WallLine[] {
  const outer: WallLine[] = outlineEdges(h.outline).map((e) => ({ ref: `o${e.i}`, a: e.a, b: e.b, len: e.len, dir: e.dir, n: e.inward, t: h.outerT, outer: true, name: `바깥벽 ${e.i + 1}` }));
  const inner: WallLine[] = h.walls.map((w) => {
    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    const dir: Pt = [(w.b[0] - w.a[0]) / (len || 1), (w.b[1] - w.a[1]) / (len || 1)];
    return { ref: w.id, a: w.a, b: w.b, len, dir, n: [-dir[1], dir[0]], t: w.t, outer: false, name: wallName(w) };
  });
  return [...outer, ...inner];
}

export const lineOf = (lines: WallLine[], ref: string) => lines.find((l) => l.ref === ref);

/** 문·창의 양 끝점 */
export function openingEnds(line: WallLine, o: Pick<HouseOpening, "at" | "width">): [Pt, Pt] {
  const a: Pt = [line.a[0] + line.dir[0] * o.at, line.a[1] + line.dir[1] * o.at];
  return [a, [a[0] + line.dir[0] * o.width, a[1] + line.dir[1] * o.width]];
}

export function openingName(h: Pick<HouseModel, "openings">, o: HouseOpening) {
  const same = h.openings.filter((x) => x.kind === o.kind);
  const label = OPENINGS[o.kind]?.label ?? "문";
  return same.length > 1 ? `${label} ${same.indexOf(o) + 1}` : label;
}

// ── 안쪽 판정
const onSegment = (p: Pt, a: Pt, b: Pt, tol = 1e-3) => {
  const minX = Math.min(a[0], b[0]) - tol, maxX = Math.max(a[0], b[0]) + tol, minY = Math.min(a[1], b[1]) - tol, maxY = Math.max(a[1], b[1]) + tol;
  if (p[0] < minX || p[0] > maxX || p[1] < minY || p[1] > maxY) return false;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / len <= tol;
};
export const onOutline = (outline: Pt[], p: Pt, tol = 1e-3) => outline.some((a, i) => onSegment(p, a, outline[(i + 1) % outline.length], tol));
export const insideOrOn = (outline: Pt[], p: Pt) => onOutline(outline, p) || pointInPolygon(p[0], p[1], outline);

/** 축에 나란한 선분이 집 안에 있는지. 바깥 벽 위를 따라가면 "edge" */
export function segmentPlace(outline: Pt[], a: Pt, b: Pt): "inside" | "outside" | "edge" {
  if (!insideOrOn(outline, a) || !insideOrOn(outline, b)) return "outside";
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(2, Math.ceil(len / 0.025));
  let edge = 0;
  for (let k = 1; k < n; k++) {
    const p: Pt = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
    if (onOutline(outline, p)) edge++;
    else if (!pointInPolygon(p[0], p[1], outline)) return "outside";
  }
  return edge > (n - 1) / 2 ? "edge" : "inside";
}

/** 상자가 집 윤곽 안에 있는지(직각 다각형이라 바깥 칸과 겹치는지로 본다) */
export function boxInside(h: Pick<HouseModel, "outline" | "width" | "depth">, b: Box, eps = 0.001) {
  if (b.x < -eps || b.y < -eps || b.x + b.w > h.width + eps || b.y + b.d > h.depth + eps) return false;
  return !cellsOf(h.outline).outside.some((c) => overlaps(b, c, eps));
}

// ── 만들기·입력 읽기
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? r3(v) : NaN);
const text = (v: unknown, max = 20) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const ID = /^[a-z]{1,2}\d{1,6}$/;
const pt = (v: unknown): Pt => (Array.isArray(v) ? [num(v[0]), num(v[1])] : [NaN, NaN]);

export const rectOutline = (W: number, D: number): Pt[] => [
  [0, 0],
  [r3(W), 0],
  [r3(W), r3(D)],
  [0, r3(D)],
];

export function newHouse(outline: Pt[], source: HouseModel["source"], height: number, underlay: Underlay | null): HouseModel {
  return {
    v: 1,
    source,
    outline,
    width: r3(Math.max(...outline.map((p) => p[0]))),
    depth: r3(Math.max(...outline.map((p) => p[1]))),
    height,
    outerT: OUTER_T,
    walls: [],
    openings: [],
    labels: [],
    fixed: [],
    items: [],
    ...(underlay ? { underlay } : {}),
    rev: 0,
    saved_at: "",
  };
}

/** 만들기 화면이 보낸 바깥 윤곽·천장 높이·밑그림. 숫자가 아닌 값은 NaN으로 두어 검사에서 걸러진다. */
export function parseHouseCreate(raw: string): HouseModel | null {
  try {
    const o = JSON.parse(raw);
    const source = o.source === "trace" ? "trace" : "dims";
    let outline: Pt[];
    if (source === "dims") outline = rectOutline(num(o.width), num(o.depth));
    else {
      if (!Array.isArray(o.outline) || o.outline.length < 4 || o.outline.length > 64) return null;
      const pts = (o.outline as unknown[]).map(pt);
      if (pts.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return null;
      outline = normalizeOutline(pts);
    }
    if (outline.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return null;
    const m = o.underlay?.m;
    const underlay: Underlay | null =
      source === "trace" && Array.isArray(m) && m.length === 6 && m.every((v: unknown) => typeof v === "number" && Number.isFinite(v)) && Number.isInteger(o.underlay.iw) && Number.isInteger(o.underlay.ih)
        ? { fileId: 0, iw: o.underlay.iw, ih: o.underlay.ih, m: m as Underlay["m"] }
        : null;
    const height = o.height == null || o.height === "" ? HEIGHT_DEFAULT : num(o.height);
    return newHouse(outline, source, height, underlay);
  } catch {
    return null;
  }
}

/** 편집 화면이 보낸 벽·문·창·방 이름·고정 구조물 */
export function parseHouseEdit(o: unknown): HouseEdit | null {
  if (!o || typeof o !== "object") return null;
  const e = o as Record<string, unknown>;
  const list = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max + 1) : []);
  const id = (v: unknown) => (typeof v === "string" && ID.test(v) ? v : "");
  const walls: HouseWall[] = list(e.walls, MAX_WALLS).map((x: Record<string, unknown>) => {
    let a = pt(x?.a), b = pt(x?.b);
    if (a[0] > b[0] + 1e-9 || a[1] > b[1] + 1e-9) [a, b] = [b, a];
    return { id: id(x?.id), a, b, t: num(x?.t) };
  });
  const kinds = Object.keys(OPENINGS);
  const openings: HouseOpening[] = list(e.openings, MAX_OPENINGS).map((x: Record<string, unknown>) => {
    const kind = (kinds.includes(x?.kind as string) ? x.kind : "door") as OpeningKind;
    return {
      id: id(x?.id),
      kind,
      wall: typeof x?.wall === "string" ? x.wall.slice(0, 12) : "",
      at: num(x?.at),
      width: num(x?.width),
      ...(OPENINGS[kind].hinged ? { hinge: x?.hinge === "b" ? ("b" as const) : ("a" as const), side: x?.side === -1 ? (-1 as const) : x?.side === 1 ? (1 as const) : OPENINGS[kind].side } : {}),
    };
  });
  const roomKinds = ROOM_KINDS.map((k) => k.kind as string);
  const labels: HouseLabel[] = list(e.labels, MAX_LABELS).map((x: Record<string, unknown>) => ({
    id: id(x?.id),
    x: num(x?.x),
    y: num(x?.y),
    name: text(x?.name),
    kind: (roomKinds.includes(x?.kind as string) ? x.kind : "other") as RoomKind,
  }));
  const fixed: HouseFixed[] = list(e.fixed, MAX_FIXED).map((x: Record<string, unknown>) => ({
    id: id(x?.id),
    kind: (FIXED_ORDER.includes(x?.kind as FixedKind) ? x.kind : "pillar") as FixedKind,
    x: num(x?.x),
    y: num(x?.y),
    w: num(x?.w),
    d: num(x?.d),
    h: x?.h == null || x?.h === "" ? null : num(x.h),
  }));
  return { height: num(e.height), walls, openings, labels, fixed };
}

// ── 검사(저장을 막는 오류). 서버와 화면이 같은 규칙을 쓴다.
export function outlineRangeErrors(outline: Pt[]): string[] {
  const oe = outlineErrors(outline);
  if (oe.length) return oe;
  const W = Math.max(...outline.map((p) => p[0])) - Math.min(...outline.map((p) => p[0]));
  const D = Math.max(...outline.map((p) => p[1])) - Math.min(...outline.map((p) => p[1]));
  if (!(W >= HOUSE_MIN - 1e-6 && W <= HOUSE_MAX + 1e-6 && D >= HOUSE_MIN - 1e-6 && D <= HOUSE_MAX + 1e-6)) return [`${HOUSE_RANGE_TEXT}를 벗어나요. 치수나 축척을 확인해 주세요.`];
  return [];
}

/** 벽 하나의 오류(새로 그릴 때 화면이 먼저 확인한다) */
export function wallErrors(h: Pick<HouseModel, "outline" | "walls">, w: HouseWall): string[] {
  const name = wallName(w);
  const [a, b] = [w.a, w.b];
  if (![a[0], a[1], b[0], b[1], w.t].every(Number.isFinite)) return [`${name}: 위치를 읽지 못했어요.`];
  const dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]);
  if (dx > 1e-6 && dy > 1e-6) return [`${name}: 가로나 세로로만 그릴 수 있어요(직각 벽).`];
  if (dx + dy < WALL_MIN_LEN - 1e-6) return [`${name}: 100mm보다 짧아요.`];
  if (!(w.t >= WALL_T_MIN - 1e-6 && w.t <= WALL_T_MAX + 1e-6)) return [`${name}: 두께는 50~400mm로 넣어 주세요.`];
  const place = segmentPlace(h.outline, a, b);
  if (place === "outside") return [`${name}: 집 바깥 벽 밖으로 나가요. 벽은 바깥 벽 안쪽에만 그려요.`];
  if (place === "edge") return [`${name}: 바깥 벽 위에 겹쳐 그렸어요. 바깥 벽은 이미 있어요.`];
  const horizontal = dy <= 1e-6;
  for (const o of h.walls) {
    if (o.id === w.id) continue;
    const oh = Math.abs(o.b[1] - o.a[1]) <= 1e-6;
    if (oh !== horizontal) continue;
    if (horizontal ? Math.abs(o.a[1] - a[1]) > 1e-3 : Math.abs(o.a[0] - a[0]) > 1e-3) continue;
    const [s0, s1] = horizontal ? [a[0], b[0]] : [a[1], b[1]];
    const [t0, t1] = horizontal ? [o.a[0], o.b[0]] : [o.a[1], o.b[1]];
    if (Math.min(s1, t1) - Math.max(s0, t0) > 1e-3) return [`${josa(name, "이", "가")} ${wallName(o)}과 겹쳐요.`];
  }
  return [];
}

/** 문·통로·창 하나의 오류 */
export function openingErrors(h: Pick<HouseModel, "outline" | "walls" | "outerT" | "openings">, o: HouseOpening, lines = wallLines(h)): string[] {
  const spec = OPENINGS[o.kind];
  const name = openingName(h, o);
  const line = lineOf(lines, o.wall);
  if (!spec || !line) return [`${name}: 놓인 벽을 찾을 수 없어요. 다시 놓아 주세요.`];
  if (spec.outerOnly && !line.outer) return [`${name}: ${o.kind === "window" ? "창은" : "현관문은"} 바깥 벽에만 놓을 수 있어요.`];
  if (!(o.width >= spec.min - 1e-6 && o.width <= spec.max + 1e-6)) return [`${name}: 폭은 ${mmText(spec.min)}~${mmText(spec.max)}mm로 넣어 주세요.`];
  if (!(o.at >= -1e-6 && o.at + o.width <= line.len + 1e-6)) return [`${name}: ${line.name}(${mmText(line.len)}mm) 밖으로 나가요. 위치와 폭을 확인해 주세요.`];
  for (const x of h.openings) {
    if (x.id === o.id || x.wall !== o.wall) continue;
    if (o.at < x.at + x.width - 0.001 && x.at < o.at + o.width - 0.001) return [`${josa(name, "과", "와")} ${openingName(h, x)} 자리가 겹쳐요.`];
  }
  return [];
}

export function fixedErrors(h: Pick<HouseModel, "outline" | "width" | "depth">, f: HouseFixed, i: number): string[] {
  const name = `${fixedLabel(f)}(${i + 1})`;
  if (![f.x, f.y, f.w, f.d].every(Number.isFinite)) return [`${name}: 위치·크기를 읽지 못했어요.`];
  if (!(f.w >= 0.1 && f.d >= 0.1 && f.w <= 6 && f.d <= 6)) return [`${name}: 가로·깊이는 100~6,000mm로 넣어 주세요.`];
  if (f.h != null && !(f.h >= 0.1 && f.h <= HEIGHT_MAX)) return [`${name}: 높이는 100~5,000mm로 넣거나 비워 두세요(비우면 천장까지).`];
  if (!boxInside(h, f)) return [`${name}: 집 밖으로 나가요. 위치와 크기를 확인해 주세요.`];
  return [];
}

/** 저장을 막는 오류. 빈 목록이면 저장할 수 있다. 방이 덜 닫힌 것 같은 알림은 houseWarnings(house-check.ts)에 있다. */
export function houseErrors(h: HouseModel): string[] {
  const out = outlineRangeErrors(h.outline);
  if (out.length) return out;
  if (!(h.height >= HEIGHT_MIN - 1e-6 && h.height <= HEIGHT_MAX + 1e-6)) out.push("천장 높이는 2,000~5,000mm로 넣어 주세요.");
  if (h.walls.length > MAX_WALLS) out.push(`내부 벽은 ${MAX_WALLS}개까지 그릴 수 있어요.`);
  if (h.openings.length > MAX_OPENINGS) out.push(`문·통로·창은 ${MAX_OPENINGS}개까지 넣을 수 있어요.`);
  if (h.labels.length > MAX_LABELS) out.push(`방 이름은 ${MAX_LABELS}개까지 붙일 수 있어요.`);
  if (h.fixed.length > MAX_FIXED) out.push(`고정 구조물은 ${MAX_FIXED}개까지 넣을 수 있어요.`);
  if (out.length) return out;
  const ids = [...h.walls, ...h.openings, ...h.labels, ...h.fixed].map((x) => x.id);
  if (ids.some((x) => !x) || new Set(ids).size !== ids.length) return ["평면 데이터를 확인할 수 없어요. 화면을 새로 고쳐 주세요."];
  for (const w of h.walls) out.push(...wallErrors(h, w));
  const lines = wallLines(h);
  for (const o of h.openings) out.push(...openingErrors(h, o, lines));
  h.labels.forEach((l) => {
    if (!l.name) out.push("방 이름이 비어 있어요.");
    else if (!Number.isFinite(l.x) || !Number.isFinite(l.y) || !insideOrOn(h.outline, [l.x, l.y])) out.push(`방 이름 ‘${l.name}’의 위치가 집 밖이에요.`);
  });
  h.fixed.forEach((f, i) => out.push(...fixedErrors(h, f, i)));
  return [...new Set(out)];
}

// ── 가구(개념 가구). 화면이 보낸 편집 목록을 개념 가구 목록에서 다시 채운다(크기 조절 포함).
export function rebuildHouseItems(edits: RoomEdit[], h: Pick<HouseModel, "width" | "depth">, products: CatalogTemplate[] = [], existing: HouseItem[] = []): { items: HouseItem[] } | { error: string } {
  if (!Array.isArray(edits) || edits.length > MAX_HOUSE_ITEMS) return { error: `가구는 집 하나에 ${MAX_HOUSE_ITEMS}개까지 놓을 수 있어요.` };
  const catalog = [...homeCatalogItems(), ...products];
  const ids = new Set<string>();
  const items: HouseItem[] = [];
  for (const e of edits) {
    if (!e || typeof e.id !== "string" || !/^[\w-]{1,40}$/.test(e.id) || ids.has(e.id)) return { error: "가구 목록을 확인할 수 없습니다. 화면을 새로 고쳐 주세요." };
    ids.add(e.id);
    if (![e.x, e.y].every((v) => typeof v === "number" && Number.isFinite(v)) || e.x < -2 || e.y < -2 || e.x > h.width + 2 || e.y > h.depth + 2) return { error: "가구 위치를 확인할 수 없습니다." };
    if (!ROTS.includes(e.rot)) return { error: "가구 방향을 확인할 수 없습니다." };
    // 실제 상품은 catalog:product:<상품>:<옵션>. 상품 규격(w·d·h)과 모델로 채우고 크기는 바꾸지 않는다.
    const c = typeof e.src === "string" && e.src.startsWith("catalog:") ? savedProduct(e, existing, catalog.find((x) => x.type === e.src.slice(8))) : undefined;
    if (!c) return { error: "가구 종류를 찾을 수 없습니다. 화면을 새로 고쳐 주세요." };
    if (c.product) {
      items.push({ id: e.id, type: c.type, label: c.label, x: r3(e.x), y: r3(e.y), rot: e.rot, w: c.w, d: c.d, parts: c.parts, bom: c.bom, origin: "added", src: e.src, product: c.product });
      continue;
    }
    const w = e.w ?? c.w, d = e.d ?? c.d;
    if (![w, d].every((v) => typeof v === "number" && Number.isFinite(v) && v >= SIZE_MIN - 1e-6 && v <= SIZE_MAX + 1e-6)) return { error: `가구 크기는 ${SIZE_RANGE_TEXT}예요.` };
    const label = String(e.label ?? "").trim().slice(0, 40) || c.label;
    const sized = resizeItem({ w: c.w, d: c.d, parts: c.parts, bom: c.bom }, w, d);
    items.push({ id: e.id, type: c.type, label, x: r3(e.x), y: r3(e.y), rot: e.rot, w: sized.w, d: sized.d, parts: sized.parts, bom: sized.bom, origin: "added", src: e.src });
  }
  return { items };
}

/** 저장해 비교할 때 쓰는 열쇠(가구는 위치·크기만) */
export function houseKey(h: Pick<HouseModel, "height" | "walls" | "openings" | "labels" | "fixed" | "items">) {
  return JSON.stringify([h.height, h.walls, h.openings, h.labels, h.fixed, h.items.map((it) => [it.id, it.type, it.label, it.x, it.y, it.rot, it.w, it.d])]);
}

// ── 문장(고객·업체·운영자 화면, 바뀐 점)
export const roomsOf = (det: RoomDetection) => det.regions.filter((r) => !r.sliver);

function countText(entries: string[]) {
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e, (counts.get(e) ?? 0) + 1);
  return counts.size ? [...counts].map(([k, n]) => `${k} ${n}`).join(" · ") : "없음";
}

export function describeHouse(h: HouseModel, det: RoomDetection = detectRooms(h)) {
  const rooms = roomsOf(det);
  const area = Math.abs(polygonArea(h.outline));
  return {
    size: `${mmText(h.width)} × ${mmText(h.depth)} mm${h.outline.length > 4 ? ` · 꺾인 모양(벽 ${h.outline.length}개)` : ""}`,
    area: `${areaText(area)} (바깥 벽 안쪽, 입력값 기준)`,
    height: `${mmText(h.height)} mm`,
    source: h.provenance?.label ?? (h.source === "trace" ? "도면 이미지에서 따라 그림" : "치수로 만듦"),
    rooms: rooms.map((r) => `${r.display} 약 ${r.area.toFixed(1)}㎡`).join(" · ") || "없음",
    roomCount: rooms.length,
    walls: `${h.walls.length}개`,
    doors: countText(h.openings.filter((o) => o.kind !== "window").map((o) => OPENINGS[o.kind].label)),
    windows: `${h.openings.filter((o) => o.kind === "window").length}개`,
    fixed: countText(h.fixed.map(fixedLabel)),
    items: h.items.length ? h.items.map((it) => `${it.label} ${mmText(it.w)}×${mmText(it.d)}`).join(", ") : "없음",
    summary: `방 ${rooms.length}개 · 내부 벽 ${h.walls.length} · 문·통로 ${h.openings.filter((o) => o.kind !== "window").length} · 창 ${h.openings.filter((o) => o.kind === "window").length} · 가구 ${h.items.length}`,
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** 집 전체 평면이 바뀐 점(업체가 읽는 문장). 방은 이름 라벨로 짝을 짓는다. */
export function diffHouse(a: HouseModel | null | undefined, b: HouseModel | null | undefined): string[] {
  if (!a && !b) return [];
  if (!a) return [`집 전체 평면 추가: 평면 ${b!.rev} · ${describeHouse(b!).summary}`];
  if (!b) return [`집 전체 평면 삭제 (평면 ${a.rev})`];
  if (a.rev === b.rev && a.saved_at === b.saved_at && same(a.outline, b.outline)) return [];
  const out: string[] = [`집 전체 평면 수정 (평면 ${a.rev} → ${b.rev})`];
  const line = (t: string) => out.push(`  ${t}`);
  const ra = detectRooms(a), rb = detectRooms(b);
  const da = describeHouse(a, ra), db = describeHouse(b, rb);
  if (!same(a.outline, b.outline)) line(`바깥 크기: ${da.size} → ${db.size}`);
  if (Math.abs(a.height - b.height) > 0.0005) line(`천장 높이: ${da.height} → ${db.height}`);
  if (a.walls.length !== b.walls.length) line(`내부 벽: ${a.walls.length}개 → ${b.walls.length}개`);
  else if (!same(a.walls, b.walls)) line("내부 벽 위치·두께 변경");
  if (da.doors !== db.doors) line(`문·통로: ${da.doors} → ${db.doors}`);
  if (da.windows !== db.windows) line(`창: ${da.windows} → ${db.windows}`);
  if (da.doors === db.doors && da.windows === db.windows && !same(a.openings, b.openings)) line("문·통로·창 위치·폭 변경");
  const roomsA = roomsOf(ra), roomsB = roomsOf(rb);
  if (roomsA.length !== roomsB.length) line(`방(벽으로 나뉜 영역): ${roomsA.length}개 → ${roomsB.length}개`);
  const named = (rs: HouseRegion[]) => new Map(rs.filter((r) => r.labelId).map((r) => [r.labelId!, r]));
  const na = named(roomsA), nb = named(roomsB);
  for (const [id, r] of nb) {
    const p = na.get(id);
    if (!p) line(`방 이름 추가: ${r.name} (약 ${r.area.toFixed(1)}㎡)`);
    else {
      if (p.name !== r.name) line(`방 이름: ${p.name} → ${r.name}`);
      if (Math.abs(p.area - r.area) >= 0.05) line(`${r.name} 면적: 약 ${p.area.toFixed(1)}㎡ → ${r.area.toFixed(1)}㎡`);
    }
  }
  for (const [id, r] of na) if (!nb.has(id)) line(`방 이름 삭제: ${r.name}`);
  if (da.fixed !== db.fixed) line(`고정 구조물: ${da.fixed} → ${db.fixed}`);
  else if (!same(a.fixed, b.fixed)) line("고정 구조물 위치·크기 변경");
  const d = diffPlacement(a.items, b.items);
  const sized = resizedLines(a.items, b.items);
  if (d.lines.length || sized.length) line(`가구: ${[d.summary, sized.length ? `크기 조절 ${sized.length}` : ""].filter(Boolean).join(" · ")}`);
  return out;
}

/** 저장할 때 쓰는 시각 문자열 */
export const savedNow = () => new Date().toISOString().slice(0, 19).replace("T", " ");
