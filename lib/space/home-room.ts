import type { FurnitureItem } from "../layout/types";
import { savedProduct } from "./product-snapshot";
import { bbox, josa, overlaps, type Box } from "./check";
import { ROTS, composeOption, footprint, worldParts } from "./placement";
import type { LayoutOption } from "../layout/types";
import type { CatalogTemplate, DoorSpot, Part, PillarSpec, PlacedItem, PlacementEdit, RoomModel, WallSide, WindowSpec } from "./types";

// 집 요청의 방 한 칸 배치. 치수를 아는 방 하나에 문·창·고정 구조물을 넣고 개념 가구를 직접 놓는다.
// 방마다 따로 관리하는 참고 배치이며, 여러 개를 만들어도 집 전체 도면이 되지 않는다(방끼리 잇지 않는다).
// 자동 배치는 이번 범위에서 제외했다(후속 검토). 가구는 실제 상품이 아닌 치수 검토용 개념 가구다.

export interface HomeRoom {
  /** 요청 안에서 방을 가리키는 고정 id. 지운 방의 id는 다시 쓰지 않는다. */
  id: string;
  name: string;
  /** 이 방 배치의 버전. 방 정보나 가구를 바꿔 저장할 때마다 1씩 올라간다. */
  rev: number;
  room: RoomModel;
  items: PlacedItem[];
  saved_at: string;
}

export const MAX_ROOMS = 5;
export const ROOM_SCOPE_TEXT = "방 한 칸 가구 배치: 입력한 방 하나만 그려요. 집 전체 구조와 욕실·주방 설비, 다른 방은 들어 있지 않아요.";
export const ROOM_BADGE = "방 한 칸 · 집 전체 아님";
export const ROOM_VENDOR_TEXT = "고객이 그린 방 한 칸의 가구 배치(참고)입니다. 집 전체 도면이나 실측이 아니며, 공사 범위는 요청 내용을 기준으로 합니다.";
export const ROOM_LIST_TEXT = "방마다 따로 그린 참고 배치예요. 방을 여러 개 만들어도 서로 이어지지 않고, 집 전체 도면이 되지 않아요.";
export const CONCEPT_FURNITURE_TEXT = "치수 검토용 개념 가구 · 실제 상품 아님";
export const AUTO_LATER_TEXT = "집 자동 배치는 이번 범위에서 제외했어요(후속 검토). 지금은 가구를 직접 놓아요.";

/** 지원 범위(임시) */
export const ROOM_MIN = 1.5;
export const ROOM_MAX = 15;
export const SIZE_MIN = 0.3;
export const SIZE_MAX = 3;
export const ROOM_RANGE_TEXT = "방 가로·세로 1,500~15,000mm (현재 임시 지원 범위)";
export const SIZE_RANGE_TEXT = "가구 가로·깊이 300~3,000mm (크기 조절 범위)";
const MAX_SPOTS = 3;
const MAX_FIXED = 6;
const MAX_WINDOWS = 6;

export const ROOM_NAMES = ["거실", "침실", "작은 방", "원룸 방", "서재", "아이 방", "드레스룸"] as const;
export const SPOT_LABELS = ["욕실 문", "발코니 문", "현관문", "다른 방 문", "붙박이장 문"] as const;
export const FIXED_LABELS = ["기둥", "붙박이장", "싱크대 자리", "보일러실", "신발장", "기타 구조물"] as const;
export const SIDE_LABEL: Record<WallSide, string> = { front: "앞벽(방문 벽)", rear: "안쪽 벽", left: "왼쪽 벽", right: "오른쪽 벽" };

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const mmText = (m: number) => Math.round(Math.abs(m) * 1000).toLocaleString("ko-KR");
const wallLen = (room: Pick<RoomModel, "width" | "depth">, side: WallSide) => (side === "left" || side === "right" ? room.depth : room.width);

// ── 입력 읽기·검사(서버와 화면이 같은 규칙을 쓴다)
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 1000) / 1000 : NaN);
const SIDES: WallSide[] = ["front", "rear", "left", "right"];
const side = (v: unknown): WallSide => (SIDES.includes(v as WallSide) ? (v as WallSide) : "rear");
const text = (v: unknown, max = 20) => String(v ?? "").trim().slice(0, max);

/** 화면이 보낸 방 정보(JSON). 숫자가 아닌 값은 NaN으로 두어 검사에서 걸러진다. */
export function parseHomeRoom(raw: string): RoomModel | null {
  try {
    const o = JSON.parse(raw);
    const windows: WindowSpec[] | null = o.windows === null ? null : Array.isArray(o.windows) ? o.windows.slice(0, MAX_WINDOWS + 1).map((w: Record<string, unknown>) => ({ wall: side(w.wall), at: num(w.at), width: num(w.width) })) : null;
    const pillars: PillarSpec[] = Array.isArray(o.pillars)
      ? o.pillars.slice(0, MAX_FIXED + 1).map((p: Record<string, unknown>) => ({ x: num(p.x), y: num(p.y), w: num(p.w), d: num(p.d), label: text(p.label) || "기둥", ...(p.h == null || p.h === "" ? {} : { h: num(p.h) }) }))
      : [];
    const doors: DoorSpot[] = Array.isArray(o.doors) ? o.doors.slice(0, MAX_SPOTS + 1).map((d: Record<string, unknown>) => ({ wall: side(d.wall), at: num(d.at), width: num(d.width), label: text(d.label) || "문" })) : [];
    return {
      shape: "rect",
      width: num(o.width),
      depth: num(o.depth),
      height: o.height == null || o.height === "" ? null : num(o.height),
      entrance: { at: num(o.entrance?.at), width: num(o.entrance?.width) },
      windows,
      pillars,
      doors,
      utilities: [],
      source: "dims",
    };
  } catch {
    return null;
  }
}

/** 방 정보 검사. 문제를 문장으로 돌려준다(빈 목록이면 통과). */
export function homeRoomErrors(room: RoomModel): string[] {
  const out: string[] = [];
  const { width: W, depth: D } = room;
  const inRange = (v: number) => Number.isFinite(v) && v >= ROOM_MIN && v <= ROOM_MAX;
  if (!inRange(W) || !inRange(D)) return [`방 가로·세로는 1,500~15,000mm로 넣어 주세요. (${ROOM_RANGE_TEXT})`];
  if (room.height != null && !(room.height >= 2 && room.height <= 5)) out.push("천장 높이는 2,000~5,000mm로 넣거나 비워 두세요.");
  const e = room.entrance;
  if (!(e.width >= 0.5 && e.width <= 2.5)) out.push("방문 폭은 500~2,500mm로 넣어 주세요.");
  else if (!(e.at >= 0 && e.at + e.width <= W + 1e-6)) out.push("방문이 앞벽 밖으로 나가요. 위치와 폭을 확인해 주세요.");
  const spans: { side: WallSide; a: number; b: number; name: string }[] = [{ side: "front", a: e.at, b: e.at + e.width, name: "방문" }];
  if ((room.doors ?? []).length > MAX_SPOTS) out.push(`다른 문 자리는 ${MAX_SPOTS}개까지 넣을 수 있어요.`);
  (room.doors ?? []).forEach((d, i) => {
    const name = `${d.label || "문"}(${i + 1})`;
    if (!(d.width >= 0.5 && d.width <= 2.5)) out.push(`${name}: 폭은 500~2,500mm로 넣어 주세요.`);
    else if (!(d.at >= 0 && d.at + d.width <= wallLen(room, d.wall) + 1e-6)) out.push(`${name}: ${SIDE_LABEL[d.wall]} 밖으로 나가요.`);
    spans.push({ side: d.wall, a: d.at, b: d.at + d.width, name });
  });
  for (let i = 0; i < spans.length; i++)
    for (let j = i + 1; j < spans.length; j++) {
      const s = spans[i], t = spans[j];
      if (s.side === t.side && s.a < t.b - 0.01 && t.a < s.b - 0.01) out.push(`${josa(s.name, "과", "와")} ${t.name} 자리가 겹쳐요.`);
    }
  if (room.windows && room.windows.length > MAX_WINDOWS) out.push(`창은 ${MAX_WINDOWS}개까지 넣을 수 있어요.`);
  (room.windows ?? []).forEach((w, i) => {
    if (!(w.width >= 0.2 && w.width <= ROOM_MAX)) out.push(`창 ${i + 1}: 폭을 확인해 주세요.`);
    else if (!(w.at >= 0 && w.at + w.width <= wallLen(room, w.wall ?? "rear") + 1e-6)) out.push(`창 ${i + 1}: ${SIDE_LABEL[w.wall ?? "rear"]} 밖으로 나가요.`);
  });
  if (room.pillars.length > MAX_FIXED) out.push(`고정 구조물은 ${MAX_FIXED}개까지 넣을 수 있어요.`);
  room.pillars.forEach((p, i) => {
    const name = `${p.label || "기둥"}(${i + 1})`;
    if (!(p.w >= 0.1 && p.d >= 0.1 && p.w <= ROOM_MAX && p.d <= ROOM_MAX)) out.push(`${name}: 가로·깊이를 100mm 이상으로 넣어 주세요.`);
    else if (!(p.x >= 0 && p.y >= 0 && p.x + p.w <= W + 1e-6 && p.y + p.d <= D + 1e-6)) out.push(`${name}: 방 밖으로 나가요. 위치와 크기를 확인해 주세요.`);
    if (p.h != null && !(p.h >= 0.1 && p.h <= 5)) out.push(`${name}: 높이는 100~5,000mm로 넣거나 비워 두세요(비우면 천장까지).`);
  });
  return out;
}

/** 방 정보 문장(고객·업체·운영자 화면) */
export function describeHomeRoom(room: RoomModel) {
  return {
    size: `${mmText(room.width)} × ${mmText(room.depth)} mm`,
    area: `${(room.width * room.depth).toFixed(1)}㎡ · 약 ${((room.width * room.depth) / 3.305785).toFixed(1)}평`,
    entrance: `앞벽 · 왼쪽 벽에서 ${mmText(room.entrance.at)} · 폭 ${mmText(room.entrance.width)}`,
    doors: (room.doors ?? []).length ? room.doors!.map((d) => `${d.label}: ${SIDE_LABEL[d.wall]} ${mmText(d.at)}부터 폭 ${mmText(d.width)}`).join(" · ") : "없음",
    windows: room.windows == null ? "위치 모름(창을 그리지 않음)" : room.windows.length ? room.windows.map((w) => `${SIDE_LABEL[w.wall ?? "rear"]} ${mmText(w.at)}부터 폭 ${mmText(w.width)}`).join(" · ") : "없음",
    fixed: room.pillars.length ? room.pillars.map((p) => `${p.label || "기둥"} ${mmText(p.w)}×${mmText(p.d)}${p.h != null ? ` 높이 ${mmText(p.h)}` : " (천장까지)"}`).join(" · ") : "없음",
    height: room.height != null ? `${mmText(room.height)} mm` : "모름 (2,700 mm로 그림)",
  };
}

// ── 검사
/** 통로 간격 알림(편집 참고)의 기준. 확정 전 임시값이다. */
export const GAP_NOTICE = 0.6;
/** 이 간격 이하는 붙여 놓은 것으로 보고 알리지 않는다. */
export const GAP_TOUCH = 0.05;
/** 두 면이 서로 이만큼 이상 마주 볼 때만 간격으로 본다. */
export const GAP_FACING = 0.3;

export type RoomCheckKey = "overlap" | "fixed" | "bounds" | "door";

export const ROOM_CHECKS: { key: RoomCheckKey; label: string; desc: string }[] = [
  { key: "overlap", label: "가구끼리 겹침", desc: "평면에서 가구 바닥면이 서로 겹치는지 봅니다." },
  { key: "fixed", label: "고정 구조물과 겹침", desc: "입력한 기둥·붙박이장·싱크대 자리 등 고정 구조물과 가구 바닥면이 겹치는지 봅니다." },
  { key: "bounds", label: "방 밖 배치", desc: "가구가 입력한 방 가로·세로 밖으로 나갔는지 봅니다." },
  { key: "door", label: "문 앞 장애물", desc: "방문과 다른 문 자리 앞 바닥에 가구가 놓였는지 봅니다. 비워 둘 자리는 문 폭 × 깊이(문 폭, 최대 900mm)로 방 안쪽입니다. 문 종류와 열리는 방향은 보지 않습니다." },
];
export const GAP_CHECK = {
  label: "통로 간격 알림 (편집 참고 · 임시값 600mm)",
  desc: "마주 보는 두 면 사이의 빈 간격을 봅니다: 가구와 가구, 가구와 벽, 가구와 고정 구조물. 간격이 50mm보다 넓고 600mm보다 좁으면서 서로 300mm 이상 마주 보는 곳을 알려요. 50mm 이하는 붙여 놓은 것으로 보고 알리지 않아요. 편집할 때 참고하는 알림이며, 지나갈 수 있는지·안전한지는 판정하지 않습니다.",
};
export const ROOM_NOT_CHECKED = ["통로가 안전한지·사람이 지나갈 수 있는지", "문 종류와 열리는 방향", "창 앞 가구 높이", "욕실·주방 설비와 급배수·전기", "실제 제품 규격", "다른 방과의 동선(집 전체)"];
export const ROOM_CHECK_DISCLAIMER = "자동 검사는 위 항목만 봅니다. 걸린 곳이 없어도 시공이나 생활에 문제가 없다는 뜻이 아니며, 실측과 업체 확인이 필요합니다.";

export interface RoomIssue {
  key: RoomCheckKey;
  ids: string[];
  text: string;
}
export interface RoomNotice {
  ids: string[];
  text: string;
  gap: number;
}
export interface RoomReport {
  results: { key: RoomCheckKey; label: string; desc: string; issues: RoomIssue[] }[];
  issues: RoomIssue[];
  /** 통로 간격 알림(편집 참고). 확인할 것(issues)에 세지 않는다. */
  notices: RoomNotice[];
}

/** 문 앞 비워 둘 자리의 최대 깊이(넓은 미닫이·발코니 문이 방을 다 차지하지 않게) */
export const DOOR_DEPTH_MAX = 0.9;

/** 문 앞 비워 둘 자리: 문 폭 × 깊이(문 폭, 최대 900mm) 방 안쪽 */
export function roomDoorZones(room: RoomModel): (Box & { label: string; width: number; depth: number })[] {
  const { width: W, depth: D } = room;
  const zone = (s: WallSide, at: number, w: number, label: string): Box & { label: string; width: number; depth: number } => {
    const c = Math.min(w, DOOR_DEPTH_MAX, s === "left" || s === "right" ? W : D);
    if (s === "front") return { x: at, y: 0, w, d: c, label, width: w, depth: c };
    if (s === "rear") return { x: at, y: D - c, w, d: c, label, width: w, depth: c };
    if (s === "left") return { x: 0, y: at, w: c, d: w, label, width: w, depth: c };
    return { x: W - c, y: at, w: c, d: w, label, width: w, depth: c };
  };
  return [zone("front", room.entrance.at, room.entrance.width, "방문"), ...(room.doors ?? []).map((d) => zone(d.wall, d.at, d.width, d.label || "문"))];
}

const planParts = (it: PlacedItem): Box[] => worldParts(it).filter((o) => o.plan);

export function runRoomChecks(room: RoomModel, items: PlacedItem[]): RoomReport {
  const issues: RoomIssue[] = [];
  const add = (key: RoomCheckKey, ids: string[], t: string) => issues.push({ key, ids, text: t });
  const { width: W, depth: D } = room;
  const parts = items.map(planParts);
  const boxes = parts.map((ps) => (ps.length ? bbox(ps) : null));
  const fixed = room.pillars.map((p) => ({ box: { x: p.x, y: p.y, w: p.w, d: p.d }, label: p.label || "기둥" }));
  const zones = roomDoorZones(room);
  const hits = (ps: Box[], b: Box) => ps.some((p) => overlaps(p, b));
  items.forEach((it, i) => {
    const f = boxes[i];
    if (!f) return;
    if (f.x < -0.01 || f.y < -0.01 || f.x + f.w > W + 0.01 || f.y + f.d > D + 0.01) add("bounds", [it.id], `${josa(it.label, "이", "가")} 방 밖으로 나갔어요`);
    const fx = fixed.find((s) => hits(parts[i], s.box));
    if (fx) add("fixed", [it.id], `${josa(it.label, "이", "가")} 고정 구조물(${fx.label})과 겹쳐요`);
    const z = zones.find((zone) => hits(parts[i], zone));
    if (z) add("door", [it.id], `${josa(it.label, "이", "가")} ${z.label} 앞 바닥(폭 ${mmText(z.width)} × 깊이 ${mmText(z.depth)}mm)에 있어요`);
    for (let j = i + 1; j < items.length; j++) {
      const g = boxes[j];
      if (!g || !overlaps(f, g)) continue;
      if (parts[i].some((p) => hits(parts[j], p))) add("overlap", [it.id, items[j].id], `${josa(it.label, "과", "와")} ${josa(items[j].label, "이", "가")} 겹쳐요`);
    }
  });
  return {
    results: ROOM_CHECKS.map((c) => ({ ...c, issues: issues.filter((x) => x.key === c.key) })),
    issues,
    notices: gapNotices(room, items, boxes),
  };
}

/**
 * 통로 간격 알림. 가구마다 네 방향에서 가장 가까이 마주 보는 면(다른 가구·고정 구조물, 없으면 벽)까지의 빈 간격을 잰다.
 * 50mm < 간격 < 600mm이고 마주 보는 길이가 300mm 이상이면 알린다. 같은 두 가구는 한 번만 알린다.
 */
function gapNotices(room: RoomModel, items: PlacedItem[], boxes: (Box | null)[]): RoomNotice[] {
  const { width: W, depth: D } = room;
  const others: { id: string | null; label: string; box: Box }[] = [
    ...items.flatMap((it, i) => (boxes[i] ? [{ id: it.id, label: it.label, box: boxes[i]! }] : [])),
    ...room.pillars.map((p) => ({ id: null, label: p.label || "기둥", box: { x: p.x, y: p.y, w: p.w, d: p.d } })),
  ];
  const seen = new Set<string>();
  const out: RoomNotice[] = [];
  const facing = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);
  items.forEach((it, i) => {
    const a = boxes[i];
    if (!a) return;
    const dirs = [
      { wall: SIDE_LABEL.left, wallGap: a.x, along: "y" as const, near: (b: Box) => b.x + b.w <= a.x + 1e-6, gap: (b: Box) => a.x - (b.x + b.w) },
      { wall: SIDE_LABEL.right, wallGap: W - (a.x + a.w), along: "y" as const, near: (b: Box) => b.x >= a.x + a.w - 1e-6, gap: (b: Box) => b.x - (a.x + a.w) },
      { wall: SIDE_LABEL.front, wallGap: a.y, along: "x" as const, near: (b: Box) => b.y + b.d <= a.y + 1e-6, gap: (b: Box) => a.y - (b.y + b.d) },
      { wall: SIDE_LABEL.rear, wallGap: D - (a.y + a.d), along: "x" as const, near: (b: Box) => b.y >= a.y + a.d - 1e-6, gap: (b: Box) => b.y - (a.y + a.d) },
    ];
    for (const dir of dirs) {
      const cands = others.filter((o) => o.id !== it.id && dir.near(o.box) && (dir.along === "y" ? facing(a.y, a.y + a.d, o.box.y, o.box.y + o.box.d) : facing(a.x, a.x + a.w, o.box.x, o.box.x + o.box.w)) >= GAP_FACING);
      const nearest = cands.sort((p, q) => dir.gap(p.box) - dir.gap(q.box))[0];
      const gap = nearest ? dir.gap(nearest.box) : dir.wallGap;
      const length = nearest ? null : dir.along === "y" ? a.d : a.w;
      if (length != null && length < GAP_FACING) continue;
      // 경계값(50mm·600mm)은 소수 계산 오차를 감안해 1mm 미만 차이를 같은 값으로 본다.
      if (!(gap > GAP_TOUCH + 0.0005 && gap < GAP_NOTICE - 0.0005)) continue;
      const other = nearest ? nearest.label : dir.wall;
      const key = nearest?.id ? [it.id, nearest.id].sort().join("|") : `${it.id}|${other}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ids: nearest?.id ? [it.id, nearest.id] : [it.id], gap: r3(gap), text: `${josa(it.label, "과", "와")} ${other} 사이 빈 간격 ${mmText(gap)}mm` });
    }
  });
  return out;
}

// ── 개념 가구(대표 규격). 실제 상품이 아니다.
type P = [n: string, x: number, y: number, z: number, w: number, d: number, h: number, c: string, plan?: 0 | 1];
const COL = { oak: "#c7a477", leg: "#404d48", fabric: "#819385", white: "#f6f2e8", cab: "#b9a385", pillow: "#eeeae2", chair: "#455c54", appliance: "#dddeda", dark: "#34433e" };

function make(type: string, label: string, desc: string, w: number, d: number, parts: P[], bom: FurnitureItem[]): CatalogTemplate {
  // 부품 좌표는 가구 왼쪽 앞 모서리 기준으로 적고, 가구 중심 기준으로 바꾼다.
  const ps: Part[] = parts.map(([n, x, y, z, pw, pd, h, c, plan]) => ({ n, x: r3(x - w / 2), y: r3(y - d / 2), z, w: pw, d: pd, h, c, p: plan ?? 1 }));
  return { type, label, desc, w, d, parts: ps, bom };
}
const spec = (w: number, d: number, h?: number) => `${mmText(w)} × ${mmText(d)}${h ? ` × H${mmText(h)}` : ""}`;

function bed(type: string, label: string, w: number) {
  const d = 2;
  return make(type, label, `${spec(w, d)} · 매트리스 포함`, w, d, [
    ["침대 프레임", 0, 0, 0, w, d, 0.3, COL.oak],
    ["매트리스", 0.03, 0.03, 0.3, w - 0.06, d - 0.14, 0.2, COL.white, 0],
    ["헤드보드", 0, d - 0.08, 0, w, 0.08, 0.95, COL.oak, 0],
    ["베개", 0.12, d - 0.5, 0.5, w - 0.24, 0.32, 0.1, COL.pillow, 0],
  ], [{ type: label, spec: spec(w, d), qty: 1, color: COL.oak }]);
}
const boxItem = (type: string, label: string, w: number, d: number, h: number, c: string, extra = "") =>
  make(type, label, `${spec(w, d, h)}${extra}`, w, d, [[label, 0, 0, 0, w, d, h, c]], [{ type: label, spec: spec(w, d, h), qty: 1, color: c }]);

export function homeCatalogItems(): CatalogTemplate[] {
  return [
    bed("h-bed-single", "싱글 침대", 1),
    bed("h-bed-ss", "슈퍼싱글 침대", 1.1),
    bed("h-bed-queen", "퀸 침대", 1.5),
    bed("h-bed-king", "킹 침대", 1.6),
    boxItem("h-wardrobe", "옷장", 1.2, 0.6, 2.1, COL.cab),
    make("h-hanger", "행거", spec(1.2, 0.5, 1.6), 1.2, 0.5, [
      ["행거 받침", 0, 0, 0, 1.2, 0.5, 0.05, COL.leg],
      ["행거 기둥", 0, 0.22, 0.05, 0.04, 0.06, 1.55, COL.leg, 0],
      ["행거 기둥", 1.16, 0.22, 0.05, 0.04, 0.06, 1.55, COL.leg, 0],
      ["행거 봉", 0, 0.23, 1.55, 1.2, 0.04, 0.04, COL.leg, 0],
    ], [{ type: "행거", spec: spec(1.2, 0.5, 1.6), qty: 1, color: COL.leg }]),
    boxItem("h-drawer", "서랍장", 0.8, 0.45, 0.8, COL.cab),
    boxItem("h-bookcase", "책장", 0.8, 0.3, 1.8, COL.oak),
    boxItem("h-cabinet", "수납장", 1.2, 0.45, 1.1, COL.cab),
    make("h-desk", "책상", `${spec(1.2, 0.6, 0.72)} · 의자는 따로 추가`, 1.2, 0.6, [
      ["책상 상판", 0, 0, 0.7, 1.2, 0.6, 0.03, COL.oak],
      ["책상 옆판", 0, 0, 0, 0.03, 0.6, 0.7, COL.oak, 0],
      ["책상 옆판", 1.17, 0, 0, 0.03, 0.6, 0.7, COL.oak, 0],
    ], [{ type: "책상", spec: spec(1.2, 0.6, 0.72), qty: 1, color: COL.oak }]),
    make("h-chair", "의자", spec(0.5, 0.5), 0.5, 0.5, [
      ["의자 좌판", 0, 0, 0.42, 0.5, 0.5, 0.05, COL.chair],
      ["의자 등받이", 0, 0.44, 0.47, 0.5, 0.06, 0.45, COL.chair, 0],
      ["의자 다리", 0.22, 0.22, 0, 0.06, 0.06, 0.42, COL.leg, 0],
    ], [{ type: "의자", spec: spec(0.5, 0.5), qty: 1, color: COL.chair }]),
    boxItem("h-vanity", "화장대", 0.8, 0.4, 0.75, COL.oak),
    boxItem("h-nightstand", "협탁", 0.45, 0.4, 0.5, COL.oak),
    ...[
      ["h-sofa2", "소파 2인", 1.6, 0.85],
      ["h-sofa3", "소파 3인", 2.1, 0.9],
    ].map(([type, label, w, d]) =>
      make(type as string, label as string, spec(w as number, d as number), w as number, d as number, [
        ["소파 좌석", 0, 0, 0, w as number, d as number, 0.42, COL.fabric],
        ["소파 등받이", 0, (d as number) - 0.2, 0.42, w as number, 0.2, 0.4, COL.fabric, 0],
        ["소파 팔걸이", 0, 0, 0.42, 0.18, d as number, 0.2, COL.fabric, 0],
        ["소파 팔걸이", (w as number) - 0.18, 0, 0.42, 0.18, d as number, 0.2, COL.fabric, 0],
      ], [{ type: label as string, spec: spec(w as number, d as number), qty: 1, color: COL.fabric }]),
    ),
    boxItem("h-tvstand", "거실장", 1.8, 0.4, 0.45, COL.oak),
    ...[
      ["h-table2", "식탁 2인", 0.8, 0.8],
      ["h-table4", "식탁 4인", 1.2, 0.8],
    ].map(([type, label, w, d]) =>
      make(type as string, label as string, `${spec(w as number, d as number, 0.72)} · 의자는 따로 추가`, w as number, d as number, [
        ["식탁 상판", 0, 0, 0.7, w as number, d as number, 0.03, COL.oak],
        ["식탁 다리", 0.05, 0.05, 0, 0.05, 0.05, 0.7, COL.leg, 0],
        ["식탁 다리", (w as number) - 0.1, 0.05, 0, 0.05, 0.05, 0.7, COL.leg, 0],
        ["식탁 다리", 0.05, (d as number) - 0.1, 0, 0.05, 0.05, 0.7, COL.leg, 0],
        ["식탁 다리", (w as number) - 0.1, (d as number) - 0.1, 0, 0.05, 0.05, 0.7, COL.leg, 0],
      ], [{ type: label as string, spec: spec(w as number, d as number, 0.72), qty: 1, color: COL.oak }]),
    ),
    boxItem("h-fridge", "냉장고 자리", 0.7, 0.75, 1.8, COL.appliance, " · 가전 자리(연결은 보지 않음)"),
    boxItem("h-washer", "세탁기 자리", 0.6, 0.65, 0.85, COL.appliance, " · 가전 자리(연결은 보지 않음)"),
  ];
}

/** 가구 크기 바꾸기: 부품을 가로·깊이 비율대로 늘리거나 줄인다(높이는 그대로). 목록의 규격도 바꾼 크기로 적는다. */
export function resizeItem<T extends Pick<PlacedItem, "w" | "d" | "parts" | "bom">>(base: T, w: number, d: number): T {
  const sx = w / base.w, sy = d / base.d;
  if (Math.abs(sx - 1) < 1e-6 && Math.abs(sy - 1) < 1e-6) return base;
  return {
    ...base,
    w: r3(w),
    d: r3(d),
    parts: base.parts.map((p) => ({ ...p, x: r3(p.x * sx), y: r3(p.y * sy), w: r3(p.w * sx), d: r3(p.d * sy) })),
    bom: base.bom.map((b) => ({ ...b, spec: `${spec(w, d)} (크기 조절)` })),
  };
}

export interface RoomEdit extends PlacementEdit {
  /** 바꾼 크기(m). 없으면 대표 규격 */
  w?: number;
  d?: number;
}

/** 화면이 보낸 편집 목록을 개념 가구 목록에서 다시 채운다(크기 조절 포함). */
export function rebuildRoomItems(edits: RoomEdit[], room: RoomModel, products: CatalogTemplate[] = [], existing: PlacedItem[] = []): { items: PlacedItem[] } | { error: string } {
  if (!Array.isArray(edits) || edits.length > 80) return { error: "가구는 한 방에 80개까지 놓을 수 있어요." };
  const catalog = [...homeCatalogItems(), ...products];
  const ids = new Set<string>();
  const items: PlacedItem[] = [];
  for (const e of edits) {
    if (!e || typeof e.id !== "string" || !/^[\w-]{1,40}$/.test(e.id) || ids.has(e.id)) return { error: "가구 목록을 확인할 수 없습니다. 화면을 새로 고쳐 주세요." };
    ids.add(e.id);
    if (![e.x, e.y].every((v) => typeof v === "number" && Number.isFinite(v)) || e.x < -2 || e.y < -2 || e.x > room.width + 2 || e.y > room.depth + 2) return { error: "가구 위치를 확인할 수 없습니다." };
    if (!ROTS.includes(e.rot)) return { error: "가구 방향을 확인할 수 없습니다." };
    const c = typeof e.src === "string" && e.src.startsWith("catalog:") ? savedProduct(e, existing, catalog.find((x) => x.type === e.src.slice(8))) : undefined;
    if (!c) return { error: "가구 종류를 찾을 수 없습니다. 화면을 새로 고쳐 주세요." };
    // 실제 상품은 판매자 규격 그대로 둔다(크기 조절 없음).
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

/** 화면에서 서버로 보낼 편집 목록(크기 포함) */
export const toRoomEdits = (items: PlacedItem[]): RoomEdit[] => items.map((it) => ({ id: it.id, src: it.src ?? `catalog:${it.type}`, label: it.label, x: it.x, y: it.y, rot: it.rot, w: it.w, d: it.d }));

/** 크기까지 비교하는 바뀐 점(업체 문장). 이동·회전·추가·삭제는 diffPlacement와 같고 크기 변경을 더한다. */
export function resizedLines(a: PlacedItem[], b: PlacedItem[]): string[] {
  const before = new Map(a.map((it) => [it.id, it]));
  return b.flatMap((it) => {
    const p = before.get(it.id);
    if (!p || (Math.abs(p.w - it.w) < 0.0005 && Math.abs(p.d - it.d) < 0.0005)) return [];
    return [`${it.label} 크기 ${mmText(p.w)}×${mmText(p.d)} → ${mmText(it.w)}×${mmText(it.d)}mm`];
  });
}

/** 바닥면(평면) 크기. 돌린 상태 그대로 */
export const sizeOf = (it: PlacedItem) => footprint(it);

/** 다음 방 id. 지운 방을 포함해 이 요청에서 쓴 적 없는 번호 */
export function nextRoomId(used: string[]) {
  const n = Math.max(0, ...used.map((id) => Number(id.match(/^room-(\d+)$/)?.[1] ?? 0)));
  return `room-${n + 1}`;
}

/** 방 한 칸 배치를 평면·3D로 그릴 배치안. 자동 배치 없이 입력한 방과 놓은 가구만 쓴다. */
export function composeRoom(r: Pick<HomeRoom, "room" | "items" | "name">): LayoutOption {
  return { ...composeOption(r.room, null, r.items), title: r.name, summary: ROOM_BADGE, entranceLabel: "방문", roomOnly: true };
}
