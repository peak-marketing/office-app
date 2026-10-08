import type { FurnitureItem, GroupInfo, LayoutOption, Obj } from "../layout/types";
import { savedProduct } from "./product-snapshot";
import { runChecks, type Box, type CheckReport, type CheckScene } from "./check";
import { cellsOf } from "./geometry";
import { shellMarks, shellObjects } from "./room";
import type { CatalogTemplate, PlacedItem, Placement, PlacementEdit, RoomModel, Rot } from "./types";

// 가구 배치. 자동 배치 결과를 가구 묶음 목록으로 바꾸고, 그 목록에서 3D·평면도에 쓰는 물체를 다시 만든다.
// 평면도와 3D는 같은 목록(composeOption)으로 그리므로 편집 내용이 항상 똑같이 보인다.

const r = (n: number) => Math.round(n * 1000) / 1000;
const mm = (m: number) => Math.round(Math.abs(m) * 1000).toLocaleString("ko-KR");
export const ROTS: Rot[] = [0, 90, 180, 270];

/** 묶음 중심 기준 상자를 rot만큼(평면 반시계) 돌린다. */
export function rotateBox<T extends Box>(p: T, rot: Rot): Box {
  switch (rot) {
    case 90:
      return { x: -(p.y + p.d), y: p.x, w: p.d, d: p.w };
    case 180:
      return { x: -(p.x + p.w), y: -(p.y + p.d), w: p.w, d: p.d };
    case 270:
      return { x: p.y, y: -(p.x + p.w), w: p.d, d: p.w };
    default:
      return { x: p.x, y: p.y, w: p.w, d: p.d };
  }
}

/** 놓인 가구의 부품을 실제 위치로 */
export function worldParts(item: PlacedItem): Obj[] {
  return item.parts.map((p) => {
    const b = rotateBox(p, item.rot);
    return { name: p.n, x: r(item.x + b.x), y: r(item.y + b.y), z: p.z, w: r(b.w), d: r(b.d), h: p.h, color: p.c, kind: "furniture", opacity: 1, plan: !!p.p, g: item.id, ...(p.m ? { model: p.m, rot: item.rot } : {}) };
  });
}

/** 바닥면(평면에 보이는 부품 전체를 감싸는 사각형) */
export function footprint(item: Pick<PlacedItem, "x" | "y" | "w" | "d" | "rot">): Box {
  const turned = item.rot === 90 || item.rot === 270;
  const w = turned ? item.d : item.w;
  const d = turned ? item.w : item.d;
  return { x: item.x - w / 2, y: item.y - d / 2, w, d };
}

/** 묶음 하나를 놓인 가구로. 중심은 평면 부품을 감싸는 사각형의 가운데 */
export function itemFrom(g: GroupInfo, objs: Obj[]): PlacedItem {
  const plan = objs.filter((o) => o.plan);
  const src = plan.length ? plan : objs;
  const x1 = Math.min(...src.map((o) => o.x));
  const y1 = Math.min(...src.map((o) => o.y));
  const x2 = Math.max(...src.map((o) => o.x + o.w));
  const y2 = Math.max(...src.map((o) => o.y + o.d));
  const cx = r((x1 + x2) / 2);
  const cy = r((y1 + y2) / 2);
  return {
    id: g.id,
    type: g.type,
    label: g.label,
    x: cx,
    y: cy,
    rot: 0,
    w: r(x2 - x1),
    d: r(y2 - y1),
    parts: objs.map((o) => ({ n: o.name, x: r(o.x - cx), y: r(o.y - cy), z: o.z, w: o.w, d: o.d, h: o.h, c: o.color, p: o.plan ? 1 : 0 })),
    bom: g.bom.map((b) => ({ ...b })),
    ...(g.fixture || g.locked ? { fixture: g.fixture ?? "proposed" } : {}),
    ...(g.wall ? { wall: true } : {}),
    ...(g.seat ? { seat: true } : {}),
    origin: "auto",
  };
}

/** 예전 데이터의 ‘고정 설비’(locked)는 자동 제안 위치로 읽는다. */
export function normalizeItems(items: PlacedItem[]): PlacedItem[] {
  return items.map((it) => {
    if (!it.locked) return it;
    const { locked: _drop, ...rest } = it;
    void _drop;
    return { ...rest, fixture: it.fixture ?? "proposed" };
  });
}

/** 고객이 실제 위치로 확인해 옮기지 않는 설비 */
export const isFixed = (it: Pick<PlacedItem, "fixture" | "locked">) => it.fixture === "confirmed";

/** 자동 배치 결과를 가구 목록으로. 묶음 정보가 없는(편집 기능 이전) 배치면 null */
export function placementFromOption(option: LayoutOption): Placement | null {
  if (!option.groups) return null;
  return { items: option.groups.map((g) => itemFrom(g, option.objects.filter((o) => o.g === g.id))).filter((it) => it.parts.length) };
}

export const EMPTY_PLACEMENT: Placement = { items: [] };

/** 가구 목록 합계 */
export function furnitureOf(items: PlacedItem[], base: LayoutOption | null): FurnitureItem[] {
  const out: FurnitureItem[] = [];
  const add = (f: FurnitureItem) => {
    const found = out.find((x) => x.type === f.type && x.spec === f.spec && x.color === f.color);
    if (found) found.qty += f.qty;
    else out.push({ ...f });
  };
  for (const it of items) for (const f of it.bom) add(f);
  const doors = base?.marks.doors.length ?? 0;
  if (doors) add({ type: "슬라이딩 도어", spec: "개구부 900", qty: doors, color: "#344943" });
  return out;
}

/**
 * 실제 구조(사용자 입력) + 자동 배치의 칸막이·방(제안) + 놓인 가구를 한 배치안으로 합친다.
 * 외벽·출입문·창·기둥은 사용자가 입력한 것만 쓰고, 자동 배치가 가정한 창·출입문은 버린다.
 */
export function composeOption(room: RoomModel, base: LayoutOption | null, items: PlacedItem[]): LayoutOption {
  items = normalizeItems(items);
  const interior = (base?.objects ?? []).filter((o) => (o.kind === "floor" && o.name !== "바닥") || o.kind === "partition" || o.kind === "glass");
  const furniture = items.flatMap(worldParts);
  const seats = items.filter((it) => it.seat);
  const shell = shellMarks(room);
  const rooms = (base?.rooms ?? []).map((x) => (x.key === "work" ? { ...x, label: `업무 공간 · ${seats.length}석` } : x));
  return {
    id: base?.id ?? "empty",
    purpose: base?.purpose,
    title: base?.title ?? "빈 공간에서 시작",
    summary: base?.summary ?? "자동 배치 없이 실제 공간에 가구를 직접 놓은 배치입니다.",
    W: room.width,
    D: room.depth,
    seats: seats.length,
    deskWidth: base?.deskWidth ?? 1.4,
    objects: [...shellObjects(room), ...interior, ...furniture],
    rooms,
    zones: (base?.zones ?? []).filter((z) => z.label === "대기 공간"),
    visitorPath: null,
    furniture: furnitureOf(items, base),
    marks: {
      doors: base?.marks.doors ?? [],
      windows: shell.windows,
      entrance: shell.entrance,
      ...(shell.spots ? { spots: shell.spots } : {}),
      seats: seats.map((s, i) => ({ n: Number(s.label.match(/\d+/)?.[0] ?? i + 1), x: s.x, y: s.y })),
    },
    groups: items.map((it) => ({ id: it.id, label: it.label, type: it.type, bom: it.bom, ...(it.fixture ? { fixture: it.fixture } : {}), ...(it.wall ? { wall: true } : {}), ...(it.seat ? { seat: true } : {}) })),
    ...(room.shape === "polygon" && room.outline ? { outline: room.outline } : {}),
  };
}

/** 검사할 장면. 자동 배치 결과(엔진 검사)와 합친 배치(편집 화면) 모두에 쓴다. */
export function checkScene(option: LayoutOption, staff: number | null): CheckScene {
  const parts = (id: string) => option.objects.filter((o) => o.g === id && o.plan);
  return {
    W: option.W,
    D: option.D,
    items: (option.groups ?? []).map((g) => ({ id: g.id, label: g.label, parts: parts(g.id), locked: g.fixture === "confirmed", proposedFixture: g.fixture === "proposed" || (!g.fixture && !!g.locked), wall: g.wall, seat: g.seat })),
    partitions: option.objects.filter((o) => (o.kind === "partition" || o.kind === "glass") && o.plan),
    pillars: option.objects.filter((o) => o.kind === "pillar"),
    doors: option.marks.doors,
    entrance: option.marks.entrance,
    ...(option.outline ? { voids: cellsOf(option.outline).outside } : {}),
    water: option.objects.filter((o) => o.kind === "utility").map((o) => [o.x + o.w / 2, o.y + o.d / 2] as [number, number]),
    staff,
  };
}

export const checkOption = (option: LayoutOption, staff: number | null): CheckReport => runChecks(checkScene(option, staff));

// ── 편집 결과 다시 만들기(서버)
/** 화면이 보낸 편집 목록을 원본(시작 배치의 묶음·카탈로그)에서 다시 채운다. 고정 설비는 원래 자리로 되돌린다. */
export function rebuildPlacement(edits: PlacementEdit[], start: LayoutOption | null, catalog: CatalogTemplate[], room: RoomModel, existing: PlacedItem[] = []): { items: PlacedItem[] } | { error: string } {
  if (!Array.isArray(edits) || edits.length > 300) return { error: "가구는 300개까지 놓을 수 있습니다." };
  const auto = new Map((start ? (placementFromOption(start)?.items ?? []) : []).map((it) => [it.id, it]));
  const ids = new Set<string>();
  const items: PlacedItem[] = [];
  for (const e of edits) {
    if (!e || typeof e.id !== "string" || !/^[\w-]{1,40}$/.test(e.id) || ids.has(e.id)) return { error: "가구 목록을 확인할 수 없습니다. 화면을 새로 고쳐 주세요." };
    ids.add(e.id);
    if (![e.x, e.y].every((v) => typeof v === "number" && Number.isFinite(v)) || e.x < -2 || e.y < -2 || e.x > room.width + 2 || e.y > room.depth + 2) return { error: "가구 위치를 확인할 수 없습니다." };
    if (!ROTS.includes(e.rot)) return { error: "가구 방향을 확인할 수 없습니다." };
    const label = String(e.label ?? "").trim().slice(0, 40);
    let tpl: Omit<PlacedItem, "id" | "x" | "y" | "rot" | "origin">;
    if (typeof e.src === "string" && e.src.startsWith("catalog:")) {
      const c = savedProduct(e, existing, catalog.find((x) => x.type === e.src.slice(8)));
      if (!c) return { error: "추가한 가구 종류를 찾을 수 없습니다." };
      tpl = { type: c.type, label: c.label, w: c.w, d: c.d, parts: c.parts, bom: c.bom, ...(c.seat ? { seat: true } : {}), ...(c.product ? { product: c.product } : {}) };
    } else {
      const a = auto.get(e.src);
      if (!a) return { error: "시작 배치에 없는 가구가 있습니다. 화면을 새로 고쳐 주세요." };
      tpl = a;
    }
    const own = auto.has(e.id) && e.src === e.id;
    // 설비는 자동 제안 위치(proposed)와 고객이 확인한 위치(confirmed)만 받는다.
    const fixture = tpl.fixture ? (e.fixture === "confirmed" ? "confirmed" : "proposed") : undefined;
    const { locked: _locked, ...base } = tpl as PlacedItem;
    void _locked;
    items.push({ ...base, id: e.id, label: label || tpl.label, x: r(e.x), y: r(e.y), rot: e.rot, origin: own ? "auto" : "added", ...(own ? {} : { src: e.src }), ...(fixture ? { fixture } : {}) });
  }
  return { items };
}

/** 화면에서 서버로 보낼 편집 목록 */
export const toEdits = (items: PlacedItem[]): PlacementEdit[] => items.map((it) => ({ id: it.id, src: it.src ?? it.id, label: it.label, x: it.x, y: it.y, rot: it.rot, ...(it.fixture ? { fixture: it.fixture } : {}) }));

// ── 바뀐 점
export interface PlacementDiff {
  moved: PlacedItem[];
  rotated: PlacedItem[];
  added: PlacedItem[];
  removed: PlacedItem[];
  /** 설비 위치 확인 상태가 바뀐 것 */
  fixtures: PlacedItem[];
  /** "이동 2 · 회전 1" */
  summary: string;
  /** 업체가 읽을 문장 */
  lines: string[];
}

function moveText(dx: number, dy: number) {
  const parts: string[] = [];
  if (Math.abs(dx) >= 0.005) parts.push(`${dx > 0 ? "오른쪽" : "왼쪽"}으로 ${mm(dx)}`);
  if (Math.abs(dy) >= 0.005) parts.push(`${dy > 0 ? "안쪽" : "앞쪽"}으로 ${mm(dy)}`);
  return parts.join(", ") + "mm";
}

export function diffPlacement(a: PlacedItem[], b: PlacedItem[]): PlacementDiff {
  const before = new Map(a.map((it) => [it.id, it]));
  const after = new Map(b.map((it) => [it.id, it]));
  const moved: PlacedItem[] = [];
  const rotated: PlacedItem[] = [];
  const added: PlacedItem[] = [];
  const removed: PlacedItem[] = [];
  const fixtures: PlacedItem[] = [];
  const lines: string[] = [];
  for (const it of b) {
    const p = before.get(it.id);
    if (!p) {
      added.push(it);
      lines.push(`${it.label} 추가`);
      continue;
    }
    const dx = it.x - p.x;
    const dy = it.y - p.y;
    const mv = Math.abs(dx) >= 0.005 || Math.abs(dy) >= 0.005;
    const rt = it.rot !== p.rot;
    if (mv) moved.push(it);
    if (rt) rotated.push(it);
    if (mv || rt) lines.push(`${it.label} ${[mv && `${moveText(dx, dy)} 이동`, rt && `${(it.rot - p.rot + 360) % 360}° 회전`].filter(Boolean).join(", ")}`);
    const fa = p.fixture ?? (p.locked ? "proposed" : undefined), fb = it.fixture;
    if (fa && fb && fa !== fb) fixtures.push(it);
    if (fa && fb && fa !== fb) lines.push(`${it.label}: ${fb === "confirmed" ? "자동 제안 위치 → 고객이 확인한 설비 위치" : "고객이 확인한 설비 위치 → 자동 제안 위치(확인 풀림)"}`);
  }
  for (const it of a) if (!after.has(it.id)) {
    removed.push(it);
    lines.push(`${it.label} 삭제`);
  }
  const summary = [moved.length && `이동 ${moved.length}`, rotated.length && `회전 ${rotated.length}`, added.length && `추가 ${added.length}`, removed.length && `삭제 ${removed.length}`, fixtures.length && `설비 위치 확인 변경 ${fixtures.length}`].filter(Boolean).join(" · ");
  return { moved, rotated, added, removed, fixtures, summary, lines };
}
