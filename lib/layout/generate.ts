import {
  PURPOSES,
  PYEONG,
  type FurnitureItem,
  type GroupInfo,
  type Kind,
  type LayoutInput,
  type LayoutMetrics,
  type LayoutOption,
  type LayoutResult,
  type Obj,
  type PlanMarks,
  type Purpose,
  type RoomInfo,
} from "./types";
import { checkOption, itemFrom } from "../space/placement";
import type { CatalogTemplate } from "../space/types";

// 규칙·템플릿 기반 배치 계산. AI 요약·스타일 추천(lib/brief.ts)과 분리되어 있다.
// 같은 조건에서 설계 목적이 다른 세 가지 골격을 시도한다.
//   방문객 응대 중심: 출입구 옆 전면에 회의실·대기 공간, 직원석은 안쪽
//   직원 협업 중심:   개별실을 안쪽 벽에 모으고 가운데에 팀 묶음과 협업 테이블
//   집중 업무 중심:   출입구 쪽 벽을 따라 개별실을 세로로 세우고 직원석은 한 방향
// 골격마다 방 위치·좌석 구성·통로가 다르다. 조건에 맞지 않는 골격은 만들지 않고 이유를 돌려준다.

export const AUTO_MIN_PYEONG = 20;
export const AUTO_MAX_PYEONG = 50;
const CEILING = 2.7;
const WALL_T = 0.15;
const PART_T = 0.1;
const DOOR_W = 0.9;
const ENTRANCE_W = 1.2;
/** 창가 좌석으로 세는 거리 */
const WINDOW_REACH = 3.2;
/** 방문객 동선 옆 좌석으로 세는 거리 */
const PASS_BY = 1.5;
/** 문 앞에 비워 둘 거리. 편집 화면 검사(lib/space/check.ts)와 같은 임시 기준이다. */
const DOOR_CLEARANCE = 0.75;

// 내추럴 기준 색상. 다른 스타일은 styles.json의 colors 매핑으로 바꾼다.
const C = {
  floor: "#d9d4c9",
  ceoFloor: "#c8b593",
  meetFloor: "#b8c1bb",
  pantryFloor: "#ddd5c6",
  wall: "#eeeae2",
  glass: "#b0d3d8",
  frame: "#344943",
  window: "#abd3df",
  oak: "#c7a477",
  leg: "#404d48",
  chair: "#455c54",
  chairBase: "#59615f",
  monitor: "#2c3c3b",
  monStand: "#4c5753",
  keyboard: "#5f6862",
  screen: "#819385",
  tv: "#263b3c",
  cabinet: "#b9a385",
  counter: "#f6f2e8",
  sink: "#879797",
  faucet: "#768787",
  coffee: "#34433e",
  fridge: "#dddeda",
  pot: "#aa8063",
  plant: "#61785a",
};

const r = (n: number) => Math.round(n * 1000) / 1000;
const snap = (n: number, step = 0.05) => Math.round(n / step) * step;
const mm = (m: number) => Math.round(m * 1000).toLocaleString("ko-KR");
const EPS = 1e-6;

type Side = "front" | "rear" | "left" | "right";
type Dir = "N" | "S" | "E" | "W";
type LDir = "+v" | "-v" | "+u" | "-u";
interface Rect {
  x: number;
  y: number;
  w: number;
  d: number;
}

class Builder {
  objects: Obj[] = [];
  private items = new Map<string, FurnitureItem>();
  /** 가구 묶음. 편집 화면에서 이 단위로 옮기고 돌린다. */
  groups: GroupInfo[] = [];
  private cur: GroupInfo | null = null;

  /** fn 안에서 그린 가구를 한 묶음으로 묶는다. 같은 id가 이미 있으면 뒤에 번호를 붙인다. */
  group<T>(id: string, label: string, type: string, fn: () => T, opts: Pick<GroupInfo, "fixture" | "wall" | "seat"> = {}): T {
    let gid = id;
    for (let k = 2; this.groups.some((g) => g.id === gid); k++) gid = `${id}-${k}`;
    const g: GroupInfo = { id: gid, label, type, bom: [], ...opts };
    this.groups.push(g);
    const prev = this.cur;
    this.cur = g;
    try {
      return fn();
    } finally {
      this.cur = prev;
      if (!this.objects.some((o) => o.g === gid)) this.groups = this.groups.filter((x) => x !== g);
    }
  }

  box(name: string, x: number, y: number, z: number, w: number, d: number, h: number, color: string, kind: Kind = "furniture", opacity = 1, plan = true) {
    const o: Obj = { name, x: r(x), y: r(y), z: r(z), w: r(w), d: r(d), h: r(h), color, kind, opacity, plan };
    if (kind === "furniture" && this.cur) o.g = this.cur.id;
    this.objects.push(o);
  }

  item(type: string, spec: string, color: string, qty = 1) {
    const add = (list: Map<string, FurnitureItem> | FurnitureItem[]) => {
      const key = `${type}|${spec}|${color}`;
      if (Array.isArray(list)) {
        const found = list.find((f) => `${f.type}|${f.spec}|${f.color}` === key);
        if (found) found.qty += qty;
        else list.push({ type, spec, qty, color });
        return;
      }
      const found = list.get(key);
      if (found) found.qty += qty;
      else list.set(key, { type, spec, qty, color });
    };
    add(this.items);
    if (this.cur) add(this.cur.bom);
  }

  get furniture() {
    return [...this.items.values()];
  }

  desk(name: string, x: number, y: number, w: number, d: number) {
    this.box(name, x, y, 0.715, w, d, 0.035, C.oak);
    for (const xx of [x + 0.06, x + w - 0.1]) for (const yy of [y + 0.06, y + d - 0.1]) this.box(name + " 다리", xx, yy, 0.02, 0.04, 0.04, 0.695, C.leg, "furniture", 1, false);
  }

  /** face: 앉은 사람이 바라보는 방향. N = 후면(+y), S = 전면, E = +x, W = -x */
  chair(name: string, cx: number, cy: number, face: Dir) {
    this.box(name + " 좌판", cx - 0.235, cy - 0.235, 0.44, 0.47, 0.47, 0.09, C.chair);
    if (face === "N") this.box(name + " 등받이", cx - 0.235, cy - 0.27, 0.5, 0.47, 0.06, 0.39, C.chair);
    else if (face === "S") this.box(name + " 등받이", cx - 0.235, cy + 0.21, 0.5, 0.47, 0.06, 0.39, C.chair);
    else if (face === "E") this.box(name + " 등받이", cx - 0.27, cy - 0.235, 0.5, 0.06, 0.47, 0.39, C.chair);
    else this.box(name + " 등받이", cx + 0.21, cy - 0.235, 0.5, 0.06, 0.47, 0.39, C.chair);
    this.box(name + " 기둥", cx - 0.035, cy - 0.035, 0.1, 0.07, 0.07, 0.34, C.chairBase, "furniture", 1, false);
    this.box(name + " 베이스", cx - 0.22, cy - 0.22, 0.07, 0.44, 0.44, 0.04, C.chairBase, "furniture", 1, false);
  }
}

/**
 * 사각형 안의 지역 좌표. side 쪽 변이 v = 0(문·시작 쪽)이고, u는 그 변을 따라간다.
 * 방과 책상 열을 어느 방향으로 놓든 같은 코드로 그리기 위해 쓴다.
 */
class Frame {
  constructor(
    readonly b: Builder,
    readonly rc: Rect,
    readonly side: Side,
    readonly flipU = false,
  ) {}
  get U() {
    return this.side === "front" || this.side === "rear" ? this.rc.w : this.rc.d;
  }
  get V() {
    return this.side === "front" || this.side === "rear" ? this.rc.d : this.rc.w;
  }
  rect(u: number, v: number, wu: number, dv: number): Rect {
    if (this.flipU) u = this.U - u - wu;
    const { x, y, w, d } = this.rc;
    switch (this.side) {
      case "front":
        return { x: x + u, y: y + v, w: wu, d: dv };
      case "rear":
        return { x: x + u, y: y + d - v - dv, w: wu, d: dv };
      case "left":
        return { x: x + v, y: y + u, w: dv, d: wu };
      default:
        return { x: x + w - v - dv, y: y + u, w: dv, d: wu };
    }
  }
  dir(l: LDir): Dir {
    if (this.flipU && (l === "+u" || l === "-u")) l = l === "+u" ? "-u" : "+u";
    const table: Record<Side, Record<LDir, Dir>> = {
      front: { "+v": "N", "-v": "S", "+u": "E", "-u": "W" },
      rear: { "+v": "S", "-v": "N", "+u": "E", "-u": "W" },
      left: { "+v": "E", "-v": "W", "+u": "N", "-u": "S" },
      right: { "+v": "W", "-v": "E", "+u": "N", "-u": "S" },
    };
    return table[this.side][l];
  }
  box(name: string, u: number, v: number, z: number, wu: number, dv: number, h: number, color: string, kind: Kind = "furniture", opacity = 1, plan = true) {
    const q = this.rect(u, v, wu, dv);
    this.b.box(name, q.x, q.y, z, q.w, q.d, h, color, kind, opacity, plan);
    return q;
  }
  desk(name: string, u: number, v: number, wu: number, dv: number) {
    const q = this.rect(u, v, wu, dv);
    this.b.desk(name, q.x, q.y, q.w, q.d);
    return q;
  }
  chair(name: string, cu: number, cv: number, l: LDir) {
    const q = this.rect(cu, cv, 0, 0);
    this.b.chair(name, q.x, q.y, this.dir(l));
  }
}

interface RoomDef {
  key: "ceo" | "meeting" | "pantry" | "storage";
  label: string;
  /** 방이 늘어서는 방향의 길이 */
  min: number;
  pref: number;
  max: number;
  tableLen?: number;
}

/** 시도하는 여유 수준. 앞의 것부터 맞춰 보고, 안 되면 통로·책상·방 깊이를 줄인다. */
interface Try {
  deskW: number;
  corridor: number;
  roomDepth: number;
  /** 안쪽 벽에 방을 둘 때 첫 책상 열의 시작 y */
  start: number;
  lobbyW: number;
  lobbyD: number;
  tight: boolean;
}

const TRIES: Try[] = [
  { deskW: 1.4, corridor: 1.2, roomDepth: 3.35, start: 2.0, lobbyW: 3.0, lobbyD: 1.8, tight: false },
  { deskW: 1.4, corridor: 1.1, roomDepth: 3.35, start: 1.2, lobbyW: 2.8, lobbyD: 1.6, tight: true },
  { deskW: 1.4, corridor: 1.2, roomDepth: 3.0, start: 2.0, lobbyW: 3.0, lobbyD: 1.8, tight: true },
  { deskW: 1.4, corridor: 1.1, roomDepth: 3.0, start: 1.2, lobbyW: 2.8, lobbyD: 1.6, tight: true },
  { deskW: 1.4, corridor: 1.0, roomDepth: 2.95, start: 1.0, lobbyW: 2.6, lobbyD: 1.5, tight: true },
  { deskW: 1.2, corridor: 1.1, roomDepth: 3.35, start: 1.2, lobbyW: 2.8, lobbyD: 1.6, tight: true },
  { deskW: 1.2, corridor: 1.1, roomDepth: 3.0, start: 1.2, lobbyW: 2.8, lobbyD: 1.6, tight: true },
  { deskW: 1.2, corridor: 1.0, roomDepth: 2.95, start: 1.0, lobbyW: 2.6, lobbyD: 1.5, tight: true },
];

class Infeasible extends Error {
  constructor(
    message: string,
    public capacity?: number,
  ) {
    super(message);
  }
}

function roomDefs(input: LayoutInput): RoomDef[] {
  const defs: RoomDef[] = [];
  if (input.ceo) defs.push({ key: "ceo", label: "대표실", min: 2.7, pref: 3.3, max: 4.2 });
  if (input.meeting) {
    const tableLen = Math.max(1.6, Math.ceil(input.meetingSeats / 2) * 0.8);
    defs.push({ key: "meeting", label: `회의실 · ${input.meetingSeats}인`, min: tableLen + 1.2, pref: tableLen + 1.8, max: tableLen + 2.8, tableLen });
  }
  if (input.pantry) defs.push({ key: "pantry", label: "탕비실", min: 2.4, pref: 3.3, max: 3.6 });
  if (input.storage) defs.push({ key: "storage", label: "창고", min: 1.8, pref: 2.2, max: 3.0 });
  return defs;
}

const names = (defs: RoomDef[]) => defs.map((d) => d.label.split(" · ")[0]).join(", ");
const minLength = (defs: RoomDef[]) => defs.reduce((s, d) => s + d.min, 0) + PART_T * Math.max(0, defs.length - 1);

/** 방들을 한 줄로 놓을 때 각 방의 길이. 남는 길이가 크면 leftover로 돌려준다. 안 들어가면 null. */
function distribute(defs: RoomDef[], avail: number, minLeftover = 1.5): { sizes: number[]; leftover: number } | null {
  const n = defs.length;
  if (!n) return { sizes: [], leftover: avail };
  const net = avail - PART_T * (n - 1);
  const sum = (k: "min" | "pref" | "max") => defs.reduce((s, d) => s + d[k], 0);
  if (sum("min") > net + EPS) return null;
  if (sum("pref") >= net) {
    const t = (net - sum("min")) / Math.max(sum("pref") - sum("min"), 1e-9);
    return { sizes: defs.map((d) => d.min + t * (d.pref - d.min)), leftover: 0 };
  }
  if (sum("max") >= net) {
    const t = (net - sum("pref")) / Math.max(sum("max") - sum("pref"), 1e-9);
    return { sizes: defs.map((d) => d.pref + t * (d.max - d.pref)), leftover: 0 };
  }
  const leftover = net - sum("max") - PART_T;
  // 쓸모없는 자투리는 방에 나눠 준다.
  if (leftover < minLeftover) return { sizes: defs.map((d) => d.max + (net - sum("max")) / n), leftover: 0 };
  return { sizes: defs.map((d) => d.max), leftover };
}

interface Wall {
  o: "h" | "v";
  /** 벽의 낮은 쪽 면 위치(h면 y, v면 x) */
  p: number;
  a: number;
  b: number;
  solid: boolean;
  doors: [number, number][];
}

/** 아직 그리지 않은 좌석 자리. 직원 수만큼만 앞에서부터 실제로 그린다. */
interface Slot {
  draw(n: number): void;
  cx: number;
  cy: number;
  /** 마주 보는 짝 자리의 id */
  pair?: number;
  id: number;
  /** 같은 묶음(팀 묶음·줄) */
  group: number;
}

let slotSeq = 0;

class Plan {
  b = new Builder();
  walls: Wall[] = [];
  posts = new Map<string, [number, number]>();
  rooms: RoomInfo[] = [];
  zones: { label: string; x: number; y: number }[] = [];
  marks: PlanMarks;
  doorAt = new Map<string, { x: number; y: number }>();
  placed: Slot[] = [];
  capacity = 0;
  /** 출입구 중심 x */
  ex: number;

  constructor(
    readonly input: LayoutInput,
    readonly W: number,
    readonly D: number,
    readonly p: Try,
  ) {
    const { b } = this;
    // 출입문은 오른쪽 모서리 기준으로 그리고, 왼쪽이면 다 그린 뒤 좌우를 뒤집는다.
    const ew = input.entranceWidth ?? ENTRANCE_W;
    const x1 = W - (input.entranceOffset ?? 0.8) - ew;
    this.marks = { doors: [], windows: [], entrance: { x1: r(x1), x2: r(x1 + ew) }, seats: [] };
    this.ex = x1 + ew / 2;
    b.box("바닥", 0, 0, -0.16, W, D, 0.16, C.floor, "floor");
    b.box("후면 벽", -WALL_T, D, 0, W + WALL_T * 2, WALL_T, CEILING, C.wall, "outer");
    b.box("좌측 벽", -WALL_T, 0, 0, WALL_T, D, CEILING, C.wall, "outer");
    b.box("우측 벽", W, 0, 0, WALL_T, D, CEILING, C.wall, "outer");
    b.box("전면 벽 A", 0, -WALL_T, 0, this.marks.entrance.x1, WALL_T, CEILING, C.wall, "outer");
    b.box("전면 벽 B", this.marks.entrance.x2, -WALL_T, 0, W - this.marks.entrance.x2, WALL_T, CEILING, C.wall, "outer");
  }

  private addWall(o: "h" | "v", p: number, a: number, b: number, solid: boolean, door?: [number, number]) {
    // 두 방이 함께 쓰는 벽은 한 번만, 불투명 벽으로 세운다.
    const found = this.walls.find((w) => w.o === o && Math.abs(w.p - p) < 1e-4 && Math.min(w.b, b) - Math.max(w.a, a) > 0.05);
    if (found) {
      found.a = Math.min(found.a, a);
      found.b = Math.max(found.b, b);
      found.solid = true;
      if (door) found.doors.push(door);
    } else this.walls.push({ o, p, a, b, solid, doors: door ? [door] : [] });
  }

  /**
   * 방 하나를 놓는다. 외벽에 닿지 않는 변에는 칸막이를 세우고, doorSide 변에 문을 낸다.
   * doorAt: 문을 그 변의 낮은 좌표 쪽 끝에 낼지 높은 쪽 끝에 낼지. glass: 문이 없어도 유리로 할 변.
   */
  addRoom(def: RoomDef, rect: Rect, doorSide: Side, doorAt: "low" | "high", glass: Side[] = []) {
    const { W, D } = this;
    const onEdge: Record<Side, boolean> = {
      front: rect.y < EPS,
      rear: rect.y + rect.d > D - 1e-4,
      left: rect.x < EPS,
      right: rect.x + rect.w > W - 1e-4,
    };
    for (const s of ["front", "rear", "left", "right"] as Side[]) {
      if (onEdge[s]) continue;
      const horizontal = s === "front" || s === "rear";
      const pos = s === "front" ? rect.y - PART_T : s === "rear" ? rect.y + rect.d : s === "left" ? rect.x - PART_T : rect.x + rect.w;
      const a = horizontal ? rect.x : rect.y;
      const len = horizontal ? rect.w : rect.d;
      let door: [number, number] | undefined;
      if (s === doorSide) {
        const da = doorAt === "low" ? a + 0.3 : a + len - 0.3 - DOOR_W;
        door = [da, da + DOOR_W];
        this.marks.doors.push(horizontal ? { x: r(da), y: r(pos), w: DOOR_W } : { x: r(pos), y: r(da), w: DOOR_W, vertical: true });
        const mid = da + DOOR_W / 2;
        const out = s === "front" || s === "left" ? pos : pos + PART_T;
        this.doorAt.set(def.key, horizontal ? { x: mid, y: out } : { x: out, y: mid });
      }
      const solid = def.key === "storage" || !(s === doorSide || glass.includes(s));
      this.addWall(horizontal ? "h" : "v", pos, a, a + len, solid, door);
    }
    for (const sx of ["left", "right"] as const)
      for (const sy of ["front", "rear"] as const)
        if (!onEdge[sx] && !onEdge[sy]) {
          const px = sx === "left" ? rect.x - PART_T : rect.x + rect.w;
          const py = sy === "front" ? rect.y - PART_T : rect.y + rect.d;
          this.posts.set(`${r(px)}|${r(py)}`, [px, py]);
        }
    this.rooms.push({ key: def.key, label: def.label, x: r(rect.x), y: r(rect.y), w: r(rect.w), d: r(rect.d) });
    furnish(this.b, def, rect, doorSide, doorAt);
  }

  private emitWalls() {
    const { b } = this;
    for (const w of this.walls) {
      const rect = (a: number, c: number): Rect => (w.o === "h" ? { x: a, y: w.p, w: c - a, d: PART_T } : { x: w.p, y: a, w: PART_T, d: c - a });
      const seg = (a: number, c: number) => {
        if (c - a < 0.05) return;
        const q = rect(a, c);
        if (w.solid) {
          b.box("칸막이", q.x, q.y, 0, q.w, q.d, CEILING, C.wall, "partition");
          return;
        }
        b.box("유리 칸막이", q.x, q.y, 0.12, q.w, q.d, 2.38, C.glass, "glass", 0.24);
        b.box("유리 상부 프레임", q.x, q.y, 2.5, q.w, q.d, 0.07, C.frame, "partition", 1, false);
        b.box("유리 하부 프레임", q.x, q.y, 0.02, q.w, q.d, 0.05, C.frame, "partition", 1, false);
        for (const e of [a, c - 0.035]) {
          const m = rect(e, e + 0.035);
          b.box("유리 세로 프레임", m.x, m.y, 0, m.w, m.d, 2.55, C.frame, "partition", 1, false);
        }
      };
      let from = w.a;
      for (const [da, db] of [...w.doors].sort((p, q) => p[0] - q[0])) {
        seg(from, da);
        if (w.o === "h") b.box("도어 상부 레일", da, w.p - 0.03, 2.5, DOOR_W, 0.16, 0.08, C.frame, "partition", 1, false);
        else b.box("도어 상부 레일", w.p - 0.03, da, 2.5, 0.16, DOOR_W, 0.08, C.frame, "partition", 1, false);
        b.item("슬라이딩 도어", "개구부 900", C.frame);
        from = db;
      }
      seg(from, w.b);
    }
    for (const [px, py] of this.posts.values()) b.box("칸막이 모서리", px, py, 0, PART_T, PART_T, CEILING, C.wall, "partition");
  }

  /** 창은 출입구 맞은편 벽에 있다고 가정한다. 칸막이가 닿는 자리와 창고는 피한다. */
  private emitWindows() {
    const { b, W, D } = this;
    if (this.input.windowWall === "other") return;
    const cuts = this.walls
      .filter((w) => w.o === "v" && w.b > D - 1e-4)
      .map((w) => w.p)
      .sort((p, q) => p - q);
    const edges = [0, ...cuts.flatMap((p) => [p, p + PART_T]), W];
    for (let i = 0; i < edges.length; i += 2) {
      const [a, c] = [edges[i], edges[i + 1]];
      if (c - a <= 1.6) continue;
      const mid = (a + c) / 2;
      if (this.rooms.some((room) => room.key === "storage" && room.y + room.d > D - 1e-4 && mid > room.x && mid < room.x + room.w)) continue;
      const n = Math.max(1, Math.round((c - a) / 3.7));
      for (let k = 0; k < n; k++) {
        const x1 = a + ((c - a) / n) * k + 0.45;
        const x2 = a + ((c - a) / n) * (k + 1) - 0.45;
        b.box("가정 창호", x1, D - 0.035, 1.05, x2 - x1, 0.025, 1.25, C.window, "window");
        b.box("창 하부", x1, D - 0.09, 1, x2 - x1, 0.12, 0.06, "#ffffff", "window");
        this.marks.windows.push({ x1: r(x1), x2: r(x2) });
      }
    }
  }

  /** 자리 중 앞에서부터 직원 수만큼 실제로 그린다. 모자라면 이 골격으로는 만들 수 없다. */
  assign(slots: Slot[]) {
    this.capacity = slots.length;
    if (slots.length < this.input.staff) throw new Infeasible(`직원 ${this.input.staff}석 중 ${slots.length}석까지만 놓을 수 있습니다.`, slots.length);
    this.placed = slots.slice(0, this.input.staff);
    this.placed.forEach((s, i) => {
      s.draw(i + 1);
      this.marks.seats.push({ n: i + 1, x: r(s.cx), y: r(s.cy) });
    });
    return this.placed;
  }

  /** 화분. 출입문 앞 여유 구역에 걸리면 안쪽으로 물린다. */
  plant(x: number, y: number) {
    const { x1, x2 } = this.marks.entrance;
    if (x < x2 + 0.05 && x + 0.35 > x1 - 0.05 && y < DOOR_CLEARANCE) y = DOOR_CLEARANCE + 0.1;
    this.b.group("plant", "화분", "plant", () => {
      this.b.box("화분", x, y, 0, 0.35, 0.35, 0.42, C.pot);
      this.b.box("식재", x - 0.06, y - 0.06, 0.42, 0.47, 0.47, 0.62, C.plant, "furniture", 1, false);
      this.b.item("화분", "중형", C.pot);
    });
  }

  /** 벽에 붙이는 공용 수납장과 복합기. rect는 수납장이 차지할 자리 */
  cabinet(rect: Rect) {
    const { b } = this;
    b.group("cabinet", "수납장·복합기", "cabinet", () => {
      b.box("공용 수납장", rect.x, rect.y, 0, rect.w, rect.d, 1.1, C.oak);
      const long = Math.max(rect.w, rect.d);
      if (rect.w >= rect.d) b.box("복합기", rect.x + rect.w - 0.6, rect.y, 1.1, 0.55, rect.d, 0.37, C.wall);
      else b.box("복합기", rect.x, rect.y + rect.d - 0.6, 1.1, rect.w, 0.55, 0.37, C.wall);
      b.item("공용 수납장", `${mm(long)} × 450 × H1,100`, C.oak);
      b.item("복합기", "수납장 상부 설치", C.wall);
    });
  }

  finish(purpose: Purpose, meta: SchemeMeta): LayoutOption {
    const { input, W, D, p } = this;
    this.emitWalls();
    this.emitWindows();
    this.rooms.push({ key: "work", label: `업무 공간 · ${input.staff}석`, x: r(meta.work.x), y: r(meta.work.y), w: r(meta.work.w), d: r(meta.work.d) });

    const solidRooms = this.rooms.filter((room) => room.key !== "work" && room.key !== "spare");
    const inRoom = (x: number, y: number) => solidRooms.some((room) => x > room.x && x < room.x + room.w && y > room.y && y < room.y + room.d);
    const windowsKnown = input.windowWall !== "other";
    const path = meta.path;
    const length = path ? path.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - path[i][0], q[1] - path[i][1]), 0) : null;
    const placedIds = new Set(this.placed.map((s) => s.id));
    const metrics: LayoutMetrics = {
      seating: meta.seating,
      capacity: this.capacity,
      spare: this.capacity - input.staff,
      facing: this.placed.filter((s) => s.pair != null && placedIds.has(s.pair)).length,
      windowSeats: windowsKnown ? this.placed.filter((s) => s.cy >= D - WINDOW_REACH && !inRoom(s.cx, D - 0.05)).length : null,
      visitorDistance: length == null ? null : Math.round(length * 10) / 10,
      visitorPassBy: path ? this.placed.filter((s) => distToPath(s.cx, s.cy, path) <= PASS_BY).length : null,
      aisle: meta.aisle,
      collabTable: meta.collabTable,
      windowRooms: windowsKnown ? solidRooms.filter((room) => room.key !== "storage" && room.y + room.d > D - 1e-4).map((room) => room.label.split(" · ")[0]) : [],
    };
    const text = meta.describe(metrics);
    const notes: string[] = [];
    if (p.tight) {
      const parts = [];
      if (p.deskW < 1.4) parts.push(`책상 폭 ${mm(p.deskW)} mm`);
      if (p.corridor < 1.2) parts.push(`통로 ${mm(p.corridor)} mm`);
      if (solidRooms.length && p.roomDepth < 3.35) parts.push(`개별실 깊이 ${mm(p.roomDepth)} mm`);
      notes.push(`요청한 구성을 맞추기 위해 기본보다 촘촘하게 배치했습니다${parts.length ? ` (${parts.join(", ")})` : ""}.`);
    }
    return {
      id: purpose,
      purpose,
      title: PURPOSES[purpose].title,
      summary: text.summary,
      reasons: text.reasons,
      pros: text.pros,
      cons: text.cons,
      notes,
      metrics,
      W,
      D,
      seats: input.staff,
      deskWidth: p.deskW,
      objects: this.b.objects,
      rooms: this.rooms,
      zones: this.zones.map((z) => ({ label: z.label, x: r(z.x), y: r(z.y) })),
      visitorPath: path ? path.map(([x, y]) => [r(x), r(y)] as [number, number]) : null,
      furniture: this.b.furniture,
      marks: this.marks,
      groups: this.b.groups,
    };
  }
}

interface SchemeText {
  summary: string;
  reasons: string[];
  pros: string[];
  cons: string[];
}
interface SchemeMeta {
  work: Rect;
  path: [number, number][] | null;
  seating: string;
  aisle: number;
  collabTable: boolean;
  describe(m: LayoutMetrics): SchemeText;
}

function distToPath(x: number, y: number, path: [number, number][]) {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1];
    const [bx, by] = path[i];
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / len2)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))));
  }
  return best;
}

// ── 방 안 가구. 지역 좌표에서 v = 0이 문 있는 변, v = V가 안쪽 벽이다.
function furnish(b: Builder, def: RoomDef, rect: Rect, doorSide: Side, doorAt: "low" | "high") {
  // 가구는 문이 u가 큰 쪽 끝에 있다고 보고 놓는다(탕비실만 반대). 실제 문이 반대쪽이면 좌우를 뒤집는다.
  const flip = def.key === "pantry" ? doorAt === "high" : doorAt === "low";
  const f = new Frame(b, rect, doorSide, flip);
  const { U, V } = f;
  if (def.key === "ceo") {
    b.box("대표실 바닥", rect.x, rect.y, 0.005, rect.w, rect.d, 0.025, C.ceoFloor, "floor");
    const du = (U - 1.8) / 2;
    const dv = V - 1.95;
    b.group("ceo-desk", "대표석", "ceo", () => {
      f.desk("대표 책상", du, dv, 1.8, 0.8);
      f.chair("대표 의자", du + 0.9, V - 0.7, "-v");
      f.box("대표 모니터", du + 0.59, dv + 0.5, 0.89, 0.6, 0.06, 0.36, C.monitor);
      b.item("대표 책상", "1,800 × 800", C.oak);
      b.item("사무용 의자", "회전형", C.chair);
    });
    if (V >= 3.3)
      b.group("ceo-visitor", "대표실 방문 의자", "chair", () => {
        // 문 앞 여유(750mm)를 넘겨 책상 쪽에 둔다.
        const cv = Math.max(0.85, DOOR_CLEARANCE + 0.26);
        for (const off of [-0.52, 0.52]) f.chair("대표실 방문 의자", du + 0.9 + off, cv, "+v");
        b.item("사무용 의자", "회전형", C.chair, 2);
      });
    // 방이 좁아 책상이 옆벽 가까이 오면 수납장을 책상 앞까지만 둔다.
    const cabLen = du < 0.65 ? Math.max(0.6, dv - 0.35) : Math.min(1.7, V - 1.4);
    b.group("ceo-cabinet", "대표실 수납장", "cabinet", () => {
      f.box("대표 수납장", 0.15, 0.25, 0, 0.4, cabLen, 1.1, C.oak);
      b.item("대표 수납장", `400 × ${mm(cabLen)} × H1,100`, C.oak);
    });
  } else if (def.key === "meeting") {
    b.box("회의실 바닥", rect.x, rect.y, 0.005, rect.w, rect.d, 0.025, C.meetFloor, "floor");
    const tl = def.tableLen!;
    const perSide = Math.round(tl / 0.8);
    const pitch = tl / perSide;
    // 문은 u가 큰 쪽 끝 [U-1.2, U-0.3]에 있다. 문 쪽 줄의 끝 의자가 문 앞 여유(750mm)에 들어가지 않게 한다.
    const doorStart = U - 1.2 - 0.05;
    const clear = doorStart - (tl - pitch / 2 + 0.235);
    // 테이블을 안쪽으로 길게 둘 때 첫 의자가 문 앞 여유를 넘는 테이블 시작 위치
    const tvPerp = Math.max((V - tl) / 2, Math.min(0.9, V - tl - 0.3), DOOR_CLEARANCE + 0.03 + 0.235 - pitch / 2);
    const perpFits = U >= 2.66 - 1e-4 && tvPerp + tl <= V - 0.2 + 1e-4;
    const parallel = U >= tl + 1.2 - 1e-4 && (clear >= 0.3 - 0.27 || !perpFits);
    b.group("meeting-table", `회의 테이블 ${perSide * 2}인`, "meeting", () => {
      if (parallel) {
        // 문 있는 변과 나란하게 테이블을 둔다. 문에서 먼 쪽으로 밀되 화면 벽과 0.3m는 남긴다.
        const tu = Math.max(0.3, Math.min((U - tl) / 2, clear));
        // 그래도 모자라면 문 쪽 줄 의자만 문에서 먼 쪽으로 당긴다(첫 의자가 테이블 끝을 0.1m 넘지 않는 만큼).
        const shift = Math.max(Math.min(0, doorStart - (tu + tl - pitch / 2 + 0.235)), -(pitch / 2 - 0.235 + 0.1));
        // 문 쪽을 넓게 비우도록 테이블을 안쪽 벽으로 붙인다.
        const tv = Math.max((V - 1.05) / 2, V - 1.05 - 0.86);
        f.desk("회의 테이블", tu, tv, tl, 1.05);
        for (let i = 0; i < perSide; i++) {
          const cu = tu + (i + 0.5) * pitch;
          f.chair("회의 의자", cu + shift, tv - 0.57, "+v");
          f.chair("회의 의자", cu, tv + 1.05 + 0.55, "-v");
        }
      } else {
        // 방이 안쪽으로 길거나 나란히 두면 문을 막을 때: 테이블을 안쪽으로 길게 두고, 첫 의자가 문 앞 여유를 넘게 한다.
        const tu = (U - 1.05) / 2;
        const tv = tvPerp;
        f.desk("회의 테이블", tu, tv, 1.05, tl);
        for (let i = 0; i < perSide; i++) {
          const cv = tv + (i + 0.5) * pitch;
          f.chair("회의 의자", tu - 0.57, cv, "+u");
          f.chair("회의 의자", tu + 1.05 + 0.55, cv, "-u");
        }
      }
      b.item("회의 테이블", `${mm(tl)} × 1,050`, C.oak);
      b.item("사무용 의자", "회전형", C.chair, perSide * 2);
    });
    b.group(
      "meeting-tv",
      "회의실 화면",
      "tv",
      () => {
        if (parallel) f.box("회의실 화면", 0.015, V / 2 - 0.575, 1.1, 0.06, 1.15, 0.7, C.tv);
        else f.box("회의실 화면", U / 2 - 0.575, V - 0.075, 1.1, 1.15, 0.06, 0.7, C.tv);
        b.item("회의실 화면", "벽걸이형", C.tv);
      },
      { wall: true },
    );
  } else if (def.key === "pantry") {
    b.box("탕비실 바닥", rect.x, rect.y, 0.005, rect.w, rect.d, 0.025, C.pantryFloor, "floor");
    const cw = Math.min(2.1, U - 1.2);
    b.group(
      "pantry-fixed",
      "탕비 설비",
      "pantry",
      () => {
        f.box("냉장고", 0.2, V - 0.75, 0, 0.6, 0.7, 1.85, C.fridge);
        f.box("탕비 하부장", 0.9, V - 0.65, 0, cw, 0.6, 0.87, C.cabinet);
        f.box("탕비 상판", 0.9, V - 0.7, 0.87, cw, 0.65, 0.04, C.counter, "furniture", 1, false);
        f.box("싱크볼", 1.1, V - 0.61, 0.916, 0.55, 0.42, 0.015, C.sink);
        f.box("수전", 1.55, V - 0.23, 0.93, 0.035, 0.035, 0.25, C.faucet, "furniture", 1, false);
        if (cw >= 1.5) f.box("커피 머신", 0.9 + cw - 0.85, V - 0.59, 0.915, 0.34, 0.34, 0.4, C.coffee);
        f.box("탕비 상부장", 0.9, V - 0.38, 1.55, cw, 0.33, 0.6, C.wall, "furniture", 1, false);
        b.item("탕비 하부장·상판", `${mm(cw)} × 600`, C.cabinet);
        b.item("탕비 상부장", `${mm(cw)} × 330`, C.wall);
        b.item("냉장고", "폭 600", C.fridge);
      },
      // 급배수 위치를 모르는 자동 제안 위치다. 고객이 실제 위치로 확인하면 고정된다.
      { fixture: "proposed" },
    );
    if (U >= 3 && V >= 2.9)
      b.group("pantry-table", "탕비실 테이블", "table", () => {
        f.box("탕비 보조 테이블", U - 1.5, 0.57, 0.72, 1.15, 0.6, 0.05, C.oak);
        for (const off of [0.28, 0.85]) f.chair("탕비 의자", U - 1.5 + off, 1.65, "-v");
        b.item("탕비 보조 테이블", "1,150 × 600", C.oak);
        b.item("사무용 의자", "회전형", C.chair, 2);
      });
  } else {
    b.box("창고 바닥", rect.x, rect.y, 0.005, rect.w, rect.d, 0.025, C.pantryFloor, "floor");
    b.group("storage-shelf", "창고 선반", "shelf", () => {
      f.box("창고 선반", 0.1, 0.3, 0, 0.45, V - 0.9, 2, C.oak);
      b.item("창고 선반", "깊이 450 × H2,000", C.oak);
    });
    b.group("storage-shelf", "창고 선반", "shelf", () => {
      f.box("창고 선반", 0.1, V - 0.5, 0, U - 0.2, 0.45, 2, C.oak);
      b.item("창고 선반", "깊이 450 × H2,000", C.oak);
    });
  }
}

// ── 좌석 자리
interface Pod {
  group: number;
  /** 지역 좌표의 책상 자리(u, v, 폭, 깊이) */
  u: number;
  v: number;
  wu: number;
  dv: number;
  seats: number;
}

/**
 * 마주 보는 책상 열. u 방향으로 책상을 잇고, v 방향으로 [의자 0.9][책상 1.4][의자 0.9] 묶음을 반복한다.
 * pods면 책상 2개마다 1.2m 통로를 두어 4인 묶음으로 나눈다.
 */
function benchSlots(plan: Plan, f: Frame, o: { screen: boolean; pods: boolean; vAlign: "start" | "end"; uAlign: "start" | "end"; noSingle?: boolean }) {
  const dw = plan.p.deskW;
  const b = plan.b;
  const L = f.U;
  const A = f.V;
  const cols: number[] = [];
  if (o.pods) {
    let cu = 0;
    while (cu + 2 * dw <= L + EPS) {
      cols.push(cu, cu + dw);
      cu += 2 * dw + 1.2;
    }
    if (cu + dw <= L + EPS) cols.push(cu);
    // 묶음이 하나뿐이고 책상 세 개가 이어 들어가면 6인 묶음으로 만든다.
    if (cols.length === 2 && 3 * dw <= L + EPS) cols.push(2 * dw);
  } else {
    const n = Math.floor((L + EPS) / dw);
    for (let i = 0; i < n; i++) cols.push(i * dw);
  }
  const slots: Slot[] = [];
  const pods: Pod[] = [];
  if (!cols.length) return { slots, pods, usedV: 0 };
  const shiftU = o.uAlign === "start" ? 0 : L - (cols[cols.length - 1] + dw);
  const doubles = A >= 3.2 - EPS ? Math.floor((A - 3.2 + EPS) / 3.4) + 1 : 0;
  const single = !o.noSingle && A - doubles * 3.4 >= 1.6 - EPS;
  const usedV = single ? doubles * 3.4 + 1.6 : doubles ? doubles * 3.4 - 0.2 : 0;
  const shiftV = o.vAlign === "start" ? 0 : A - usedV;
  const deskSpec = `${mm(dw)} × 700`;
  const bands = [...Array.from({ length: doubles }, (_, k) => ({ v: shiftV + 0.9 + 3.4 * k, double: true })), ...(single ? [{ v: shiftV + doubles * 3.4 + 0.9, double: false }] : [])];
  bands.forEach((band, bi) => {
    cols.forEach((c, ci) => {
      const u = c + shiftU;
      const group = o.pods ? bi * 1000 + (cols.length === 3 && cols[2] === 2 * dw ? 0 : Math.floor(ci / 2)) : bi;
      if (o.pods && band.double) {
        const pod = pods.find((q) => q.group === group);
        if (pod) {
          pod.wu += dw;
          pod.seats += 2;
        } else pods.push({ group, u, v: band.v, wu: dw, dv: 1.4, seats: 2 });
      }
      const ids = [++slotSeq, ++slotSeq];
      for (let row = 0; row < (band.double ? 2 : 1); row++) {
        const dv = band.v + row * 0.7;
        const c0 = f.rect(u, dv, dw, 0.7);
        slots.push({
          id: ids[row],
          pair: band.double ? ids[1 - row] : undefined,
          group,
          cx: c0.x + c0.w / 2,
          cy: c0.y + c0.d / 2,
          draw(n) {
            b.group(`desk-${n}`, `업무석 ${n}`, "desk", () => drawDesk(n), { seat: true });
          },
        });
        const drawDesk = (n: number) => {
            f.desk(`직원 책상 ${n}`, u, dv, dw, 0.7);
            f.chair(`직원 의자 ${n}`, u + dw / 2, row === 0 ? dv - 0.57 : dv + 0.7 + 0.57, row === 0 ? "+v" : "-v");
            const mv = row === 0 ? dv + 0.5 : dv + 0.11;
            f.box(`모니터 ${n}`, u + dw / 2 - 0.28, mv, 0.88, 0.56, 0.05, 0.34, C.monitor);
            f.box(`모니터 받침 ${n}`, u + dw / 2 - 0.05, mv - 0.035, 0.75, 0.1, 0.12, 0.15, C.monStand, "furniture", 1, false);
            f.box(`키보드 ${n}`, u + dw / 2 - 0.23, dv + (row === 0 ? 0.19 : 0.43), 0.753, 0.46, 0.16, 0.012, C.keyboard);
            b.item("직원 책상", deskSpec, C.oak);
            b.item("사무용 의자", "회전형", C.chair);
            if (o.screen && row === 0 && band.double) {
              f.box("데스크 스크린", u, band.v + 0.675, 0.75, dw, 0.05, 0.3, C.screen);
              b.item("데스크 스크린", `${mm(dw)} × H300`, C.screen);
            }
        };
      }
    });
  });
  return { slots, pods, usedV };
}

/** 모두 +v 방향을 보는 한 줄 책상. 줄마다 높은 칸막이를 세워 앞사람과 시선이 닿지 않는다. 먼 줄부터 돌려준다. */
function focusSlots(plan: Plan, f: Frame) {
  const dw = plan.p.deskW;
  const b = plan.b;
  const n = Math.floor((f.U + EPS) / dw);
  const slots: Slot[] = [];
  const rows = n && f.V >= 1.7 - EPS ? Math.floor((f.V - 1.7 + EPS) / 1.8) + 1 : 0;
  const deskSpec = `${mm(dw)} × 700`;
  for (let k = 0; k < rows; k++) {
    const v = f.V - 0.75 - 1.8 * k;
    const group = ++slotSeq;
    for (let i = n - 1; i >= 0; i--) {
      const u = f.U - (n - i) * dw;
      const c0 = f.rect(u, v, dw, 0.7);
      slots.push({
        id: ++slotSeq,
        group,
        cx: c0.x + c0.w / 2,
        cy: c0.y + c0.d / 2,
        draw(no) {
          b.group(`desk-${no}`, `업무석 ${no}`, "desk", () => drawFocus(no), { seat: true });
        },
      });
      const drawFocus = (no: number) => {
          f.desk(`직원 책상 ${no}`, u, v, dw, 0.7);
          f.chair(`직원 의자 ${no}`, u + dw / 2, v - 0.57, "+v");
          f.box(`모니터 ${no}`, u + dw / 2 - 0.28, v + 0.5, 0.88, 0.56, 0.05, 0.34, C.monitor);
          f.box(`모니터 받침 ${no}`, u + dw / 2 - 0.05, v + 0.465, 0.75, 0.1, 0.12, 0.15, C.monStand, "furniture", 1, false);
          f.box(`키보드 ${no}`, u + dw / 2 - 0.23, v + 0.19, 0.753, 0.46, 0.16, 0.012, C.keyboard);
          f.box("집중석 칸막이", u, v + 0.7, 0.05, dw, 0.04, 1.15, C.screen);
          f.box("집중석 옆 가림", u, v + 0.25, 0.75, 0.03, 0.45, 0.4, C.screen, "furniture", 1, false);
          b.item("직원 책상", deskSpec, C.oak);
          b.item("사무용 의자", "회전형", C.chair);
          b.item("집중석 칸막이", `${mm(dw)} × H1,200`, C.screen);
      };
    }
  }
  return slots;
}

const josa = (word: string, withFinal: string, without: string) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return word + (code >= 0 && code <= 11171 && code % 28 !== 0 ? withFinal : without);
};

// ── 골격 1: 개별실을 안쪽 벽에 모은다. collab이면 팀 묶음과 협업 테이블, 아니면 좌석 수를 우선한 단일안.
function schemeRear(plan: Plan, collab: boolean): SchemeMeta {
  const { input, W, D, p, b } = plan;
  const order: RoomDef["key"][] = collab ? ["storage", "ceo", "meeting", "pantry"] : ["ceo", "meeting", "pantry", "storage"];
  const defs = roomDefs(input).sort((x, y) => order.indexOf(x.key) - order.indexOf(y.key));
  const hasRooms = defs.length > 0;
  const rd = hasRooms ? p.roomDepth : 0;
  const frontY = hasRooms ? D - rd - PART_T : D;
  const dist = distribute(defs, W);
  if (!dist) throw new Infeasible(`${names(defs)}을(를) 안쪽 벽에 나란히 두려면 가로가 최소 ${mm(minLength(defs))}mm 필요합니다 (현재 ${mm(W)}mm).`);

  let x = 0;
  defs.forEach((def, i) => {
    plan.addRoom(def, { x, y: D - rd, w: dist.sizes[i], d: rd }, "front", def.key === "pantry" ? "low" : "high");
    x += dist.sizes[i] + PART_T;
  });
  const niche: Rect | null = hasRooms && dist.leftover > 0 ? { x, y: D - rd, w: W - x, d: rd } : null;

  const zone: Rect = { x: 0.9, y: p.start - 0.9, w: W - 2.5, d: frontY - (hasRooms ? p.corridor : 0.5) - (p.start - 0.9) };
  const none = { slots: [] as Slot[], pods: [] as Pod[], usedV: 0 };
  const frameH = new Frame(b, zone, "front");
  const benchH = zone.d > 0 && zone.w > 0 ? benchSlots(plan, frameH, { screen: !collab, pods: true, vAlign: "start", uAlign: "start" }) : none;
  let slots = benchH.slots;
  let rotated = false;

  if (collab) {
    // 협업 테이블 자리: 묶음 옆에 남는 띠가 있으면 거기에, 없으면 묶음 하나를 비운다.
    // 묶음을 출입구 벽과 나란히 놓는 방법과 직각으로 놓는 방법을 모두 해 보고 좌석이 더 많이 나오는 쪽을 쓴다.
    const target = plan.rooms.find((room) => room.key === "meeting");
    const tx = target ? target.x + target.w / 2 : W / 2;
    const ys = Math.max(1.0, p.start - 0.9);
    const zoneV: Rect = { x: 0.3, y: ys, w: W - 1.6 - 0.3, d: frontY - (hasRooms ? p.corridor : 0.5) - ys };
    const frameV = new Frame(b, zoneV, "left");
    const benchV = zoneV.d > 0 && zoneV.w > 0 ? benchSlots(plan, frameV, { screen: false, pods: true, vAlign: "start", uAlign: "start", noSingle: true }) : none;
    const plans = [
      { f: frameH, bench: benchH, rot: false },
      { f: frameV, bench: benchV, rot: true },
    ].map(({ f, bench, rot }) => {
      const strip = f.V - bench.usedV;
      if (bench.slots.length && strip >= 2.3 - EPS && f.U >= 2.6) {
        // 남는 띠에 둔다. 직각 배치면 출입구 쪽, 나란한 배치면 회의실 앞.
        const cu = rot ? 1.3 : Math.min(Math.max(tx - zone.x, 1.3), f.U - 1.3);
        return { f, rot, slots: bench.slots, cu, cv: bench.usedV + 0.2 + (strip - 0.2) / 2, free: true };
      }
      const full = bench.pods.filter((q) => q.seats >= 4).sort((a, c) => (rot ? c.v - a.v || a.u - c.u : c.v - a.v || Math.abs(a.u + zone.x + a.wu / 2 - tx) - Math.abs(c.u + zone.x + c.wu / 2 - tx)));
      const pod = full[0];
      if (!pod) return null;
      return { f, rot, slots: bench.slots.filter((q) => q.group !== pod.group), cu: pod.u + pod.wu / 2, cv: pod.v + 0.7, free: false };
    });
    const best = plans.filter((q): q is NonNullable<typeof q> => !!q).sort((a, c) => c.slots.length - a.slots.length || Number(a.rot) - Number(c.rot))[0];
    if (!best) throw new Infeasible("협업 테이블을 둘 자리가 나오지 않습니다.");
    if (best.slots.length < input.staff) throw new Infeasible(`협업 테이블을 두면 직원 ${input.staff}석 중 ${best.slots.length}석까지만 놓을 수 있습니다.`, best.slots.length);
    slots = best.slots;
    rotated = best.rot;
    const { f, cu, cv } = best;
    b.group("collab-table", "협업 테이블", "table", () => {
      f.box("협업 테이블", cu - 1.2, cv - 0.5, 0.98, 2.4, 1.0, 0.04, C.oak);
      for (const off of [-0.85, 0.75]) f.box("협업 테이블 다리", cu + off, cv - 0.3, 0, 0.1, 0.6, 0.98, C.leg, "furniture", 1, false);
      for (const su of [-0.8, 0, 0.8]) for (const sv of [-0.5 - 0.42, 0.5 + 0.08]) f.box("스툴", cu + su - 0.17, cv + sv, 0, 0.34, 0.34, 0.65, C.chair);
      b.item("협업 테이블", "2,400 × 1,000 × H1,000 (스탠딩)", C.oak);
      b.item("스툴", "H650", C.chair, 6);
    });
    const boardU = cu + 1.2 + 0.32 + 0.06 <= f.U + 0.4 ? cu + 1.2 + 0.32 : cu - 1.2 - 0.38 >= -0.4 ? cu - 1.2 - 0.38 : null;
    if (boardU != null)
      b.group("whiteboard", "이동식 화이트보드", "board", () => {
        f.box("이동식 화이트보드", boardU, cv - 0.6, 0.2, 0.06, 1.2, 1.5, C.counter);
        b.item("이동식 화이트보드", "1,200 × H1,500", C.counter);
      });
    const c0 = f.rect(cu, cv, 0, 0);
    plan.zones.push({ label: "협업 테이블", x: c0.x, y: c0.y });
  }

  if (niche) {
    if (collab) {
      // 방이 다 차지하지 않은 창가 자리는 라운지로 쓴다.
      plan.rooms.push({ key: "spare", label: "창가 라운지", x: r(niche.x), y: r(niche.y), w: r(niche.w), d: r(niche.d) });
      const sw = Math.min(1.8, niche.w - 0.6);
      b.group("lounge-sofa", "라운지 소파", "sofa", () => {
        b.box("라운지 소파", niche.x + (niche.w - sw) / 2, D - 0.95, 0, sw, 0.8, 0.42, C.screen);
        b.box("라운지 소파 등받이", niche.x + (niche.w - sw) / 2, D - 0.3, 0.42, sw, 0.15, 0.4, C.screen, "furniture", 1, false);
        b.item("라운지 소파", `${mm(sw)} × 800`, C.screen);
      });
      b.group("lounge-table", "라운지 테이블", "table", () => {
        b.box("라운지 테이블", niche.x + niche.w / 2 - 0.45, D - 1.9, 0, 0.9, 0.5, 0.4, C.oak);
        b.item("라운지 테이블", "900 × 500", C.oak);
      });
    } else {
      plan.rooms.push({ key: "spare", label: "창가 업무 공간", x: r(niche.x), y: r(niche.y), w: r(niche.w), d: r(niche.d) });
      const nz: Rect = { x: Math.max(niche.x + 0.5, 0.5), y: Math.min(frontY + (rd + PART_T - 3.2) / 2, D - 3.15), w: Math.min(niche.x + niche.w - 0.5, W - 1.6) - Math.max(niche.x + 0.5, 0.5), d: 3.2 };
      if (nz.w > 0) slots = [...slots, ...benchSlots(plan, new Frame(b, nz, "front"), { screen: true, pods: true, vAlign: "start", uAlign: "start" }).slots];
    }
  }
  const pods = new Set(plan.assign(slots).map((q) => q.group)).size;

  // 공용 수납장은 오른쪽 벽에 둔다. 안쪽 방 문 앞 여유(750mm)에 들어가지 않을 만큼만 길게.
  const cabD = Math.min(2.1, frontY - DOOR_CLEARANCE - 0.05 - 2);
  if (cabD >= 1.2 - 1e-6) plan.cabinet({ x: W - 0.5, y: 2, w: 0.45, d: cabD });
  // 입구 벤치는 출입문 옆(문에서 0.45m 떨어진 자리)에 둔다.
  const benchX = plan.marks.entrance.x1 - 0.45 - 1.45;
  if (p.start >= 1.9 && W >= 7 && benchX >= 1.0)
    b.group("entry-bench", "입구 벤치", "bench", () => {
      b.box("입구 벤치", benchX, 0.35, 0, 1.45, 0.52, 0.44, C.screen);
      b.item("입구 벤치", "1,450 × 520", C.screen);
    });
  plan.plant(0.3, 0.4);
  plan.plant(W - 0.55, 0.4);

  const guest = defs.find((d) => d.key === "meeting") ?? defs.find((d) => d.key === "ceo");
  const door = guest ? plan.doorAt.get(guest.key)! : null;
  const xa = W - 1.05;
  const yc = frontY - p.corridor / 2;
  const path: [number, number][] | null = door
    ? [
        [plan.ex, 0],
        [plan.ex, 0.6],
        [xa, 0.6],
        [xa, yc],
        [door.x, yc],
        [door.x, door.y],
      ]
    : null;
  const guestName = guest ? guest.label.split(" · ")[0] : "";

  return {
    work: { x: 0, y: 0, w: W, d: frontY },
    path,
    seating: collab ? "마주 보는 팀 묶음 (스크린 없음)" : "4인 묶음 대면형 (낮은 스크린)",
    aisle: hasRooms ? p.corridor : 1.1,
    collabTable: collab,
    describe(m) {
      const roomLine = hasRooms
        ? `${josa(names(defs), "을", "를")} 안쪽 벽 ${mm(W)}mm에 나란히 두어(깊이 ${mm(rd)}mm) 모든 방의 문이 업무 공간을 향합니다.`
        : "개별실이 없어 전체를 하나의 열린 업무 공간으로 구성했습니다.";
      const visitorCon =
        m.visitorDistance != null
          ? `방문객이 출입구에서 ${guestName}까지 ${m.visitorDistance}m를 걸으며${m.visitorPassBy ? ` 직원 좌석 ${m.visitorPassBy}석 옆을 지나고,` : ""} 업무 공간을 가로지릅니다.`
          : null;
      const lightCon = m.windowRooms.length && m.windowSeats === 0 ? `${josa(m.windowRooms.join("·"), "이", "가")} 창이 있는 벽을 차지해, 직원 좌석은 유리 칸막이 너머로만 빛을 받습니다.` : null;
      if (!collab)
        return {
          summary: "공간이 빠듯해 목적별 대안 대신, 개별실을 안쪽 벽에 모으고 좌석 수를 먼저 확보한 단일안입니다.",
          reasons: [roomLine, `직원 ${input.staff}석을 출입구 쪽 열린 공간에 4인 묶음 대면형으로 놓았습니다 (책상 ${mm(p.deskW)} × 700mm).`],
          pros: ["같은 면적에서 좌석을 가장 많이 놓을 수 있는 구성입니다.", ...(m.spare > 0 ? [`${m.spare}석을 더 놓을 수 있습니다.`] : [])],
          cons: [visitorCon, lightCon, "대기 공간, 협업 테이블, 집중석 칸막이 같은 목적별 요소를 둘 자리가 없습니다."].filter((t): t is string => !!t),
        };
      return {
        summary: "개별실을 안쪽 벽에 모으고, 가운데를 4인 팀 묶음과 협업 테이블이 있는 열린 업무 공간으로 쓰는 배치입니다.",
        reasons: [
          roomLine,
          `직원 ${input.staff}석을 마주 보는 팀 묶음 ${pods}개로 나누어 ${rotated ? "출입구 벽과 직각으로" : "출입구 벽과 나란히"} 놓았습니다 (책상 ${mm(p.deskW)} × 700mm, 스크린 없음).`,
          `6인 스탠딩 협업 테이블을 ${rotated ? "출입구와 가까운 묶음 옆에" : hasRooms ? "방 앞 묶음 자리에" : "묶음 사이에"} 두었습니다.`,
        ],
        pros: [
          "자리에서 일어나 몇 걸음이면 협업 테이블에 모일 수 있습니다.",
          "책상 사이에 스크린이 없어 같은 묶음의 팀원과 바로 이야기할 수 있습니다.",
          ...(hasRooms ? [`${names(defs).replaceAll(", ", "·")} 문이 모두 업무 공간에 면해 오가기 쉽습니다.`] : []),
          ...(m.spare > 0 ? [`${m.spare}석을 더 놓을 수 있습니다.`] : []),
        ],
        cons: [visitorCon, lightCon, `${m.facing}석이 스크린 없이 마주 보아 통화나 집중 업무에는 불리합니다.`].filter((t): t is string => !!t),
      };
    },
  };
}

// ── 골격 2: 방문객 응대 중심. 출입구 옆 전면에 회의실·대표실, 그 옆이 대기 공간, 직원석은 통로 건너 안쪽.
function schemeVisitor(plan: Plan): SchemeMeta {
  const { input, W, D, p, b } = plan;
  const all = roomDefs(input);
  const get = (k: RoomDef["key"]) => all.find((d) => d.key === k);
  const guests = [get("meeting"), get("ceo")].filter((d): d is RoomDef => !!d);
  if (!guests.length) throw new Infeasible("방문객을 맞을 회의실이나 대표실이 없어 만들지 않았습니다.");
  const FW = W - p.lobbyW - PART_T;
  if (plan.marks.entrance.x1 < FW + PART_T + 0.05) throw new Infeasible("출입문이 출입구 옆 방 자리와 겹쳐 대기 공간을 둘 수 없습니다.");
  const front = [...guests];
  for (const k of ["pantry", "storage"] as const) {
    const d = get(k);
    if (d && minLength([...front, d]) <= FW + EPS) front.push(d);
  }
  const dist = distribute(front, FW);
  if (!dist)
    throw new Infeasible(`출입구 옆 전면에 ${josa(names(guests), "과", "와")} 대기 공간을 두려면 가로가 최소 ${mm(minLength(guests) + p.lobbyW + PART_T)}mm 필요합니다 (현재 ${mm(W)}mm).`);
  const rear = (["storage", "pantry"] as const).map(get).filter((d): d is RoomDef => !!d && !front.includes(d));
  const rdF = p.roomDepth;

  let x = FW;
  front.forEach((def, i) => {
    const w = dist.sizes[i];
    x -= w;
    if (i === 0) plan.addRoom(def, { x, y: 0, w, d: rdF }, "right", "low", ["rear"]);
    else plan.addRoom(def, { x, y: 0, w, d: rdF }, "rear", "high");
    x -= PART_T;
  });
  const nicheW = dist.leftover > 0 ? x : 0;

  // 대기 공간
  b.group("lobby-bench", "대기 벤치", "bench", () => {
    b.box("대기 벤치", W - 0.57, 0.8, 0, 0.52, 1.45, 0.44, C.screen);
    b.item("대기 벤치", "1,450 × 520", C.screen);
  });
  plan.plant(W - 0.5, 2.4);
  plan.zones.push({ label: "대기 공간", x: W - p.lobbyW / 2, y: rdF - 0.5 });

  const yw0 = rdF + PART_T + p.corridor;
  const rdR = 2.6;
  const gap = D - rdR - PART_T - yw0;
  let sw = 0;
  if (rear.length) {
    if (gap < -EPS) throw new Infeasible(`전면 개별실과 통로, 안쪽 ${names(rear)}을(를) 모두 두려면 세로가 최소 ${mm(yw0 + rdR + PART_T)}mm 필요합니다 (현재 ${mm(D)}mm).`);
    for (const def of rear) {
      const w = def.key === "pantry" ? 2.8 : 2.0;
      plan.addRoom(def, { x: sw, y: D - rdR, w, d: rdR }, "front", "high");
      sw += w + PART_T;
    }
  }

  const x1 = rear.length ? sw + 0.1 : 0.1;
  const r1: Rect = { x: x1, y: yw0, w: W - 0.55 - x1, d: D - 0.3 - yw0 };
  const opt = { screen: true, pods: false, uAlign: "end" as const };
  const vertical = r1.w > 0 && r1.d > 0 ? benchSlots(plan, new Frame(b, r1, "left"), { ...opt, vAlign: "start" }).slots : [];
  const horizontal = r1.w > 1 && r1.d > 0 ? benchSlots(plan, new Frame(b, { ...r1, w: r1.w - 1.0 }, "front"), { ...opt, vAlign: "end" }).slots : [];
  const useVertical = vertical.length >= horizontal.length;
  let slots = useVertical ? vertical : horizontal;
  if (rear.length && gap >= 1.0 + p.deskW) slots = [...slots, ...benchSlots(plan, new Frame(b, { x: 0.1, y: yw0, w: sw - 0.2, d: gap - 1.0 }, "left"), { ...opt, vAlign: "start" }).slots];
  plan.assign(slots);

  if (nicheW >= 1.5) {
    const cw = Math.min(2.1, nicheW - 0.6);
    plan.cabinet({ x: 0.3, y: 0.05, w: cw, d: 0.45 });
    plan.zones.push({ label: "OA·수납", x: nicheW / 2, y: rdF - 0.5 });
  } else if (D - yw0 >= 3) plan.cabinet({ x: W - 0.5, y: yw0 + 0.4, w: 0.45, d: 2.1 });

  const door = plan.doorAt.get(guests[0].key)!;
  const guestName = guests[0].label.split(" · ")[0];
  const frontNames = names(front);
  return {
    work: { x: 0, y: yw0, w: W, d: D - yw0 },
    path: [
      [plan.ex, 0],
      [plan.ex, door.y],
      [door.x, door.y],
    ],
    seating: "대면형 긴 책상 (낮은 스크린)",
    aisle: p.corridor,
    collabTable: false,
    describe(m) {
      return {
        summary: `출입구 바로 옆에 ${josa(guestName, "과", "와")} 대기 공간을 두어, 방문객이 업무 공간을 지나지 않는 배치입니다.`,
        reasons: [
          `출입구 옆 폭 ${mm(p.lobbyW)}mm를 대기 공간으로 비우고, ${guestName} 문을 대기 공간 쪽으로 냈습니다.`,
          `${josa(frontNames, "을", "를")} 전면 벽을 따라 나란히 두었습니다 (깊이 ${mm(rdF)}mm).`,
          ...(rear.length ? [`${josa(names(rear), "은", "는")} 전면에 들어갈 폭이 모자라 안쪽 모서리에 두었습니다.`] : []),
          `직원 ${input.staff}석은 폭 ${mm(p.corridor)}mm 통로 건너 안쪽에, 대면형 긴 책상을 ${useVertical ? "창과 직각으로" : "창과 나란히"} 놓았습니다 (책상 ${mm(p.deskW)} × 700mm).`,
        ],
        pros: [
          `방문객은 출입구에서 ${m.visitorDistance}m 만에 ${guestName}에 들어가고, 직원 좌석 옆을 지나지 않습니다.`,
          ...(m.windowSeats ? [`직원 ${input.staff}석 중 ${m.windowSeats}석이 창가(창에서 ${WINDOW_REACH}m 이내)에 있습니다.`] : []),
          "출입구에서 직원 자리와 모니터가 바로 보이지 않습니다.",
          ...(m.spare > 0 ? [`${m.spare}석을 더 놓을 수 있습니다.`] : []),
        ],
        cons: [
          ...(input.windowWall !== "other" ? [`${frontNames}에는 창이 없습니다.`] : []),
          `${m.facing}석이 마주 보고 앉습니다. 높이 300mm 스크린으로만 시선을 가립니다.`,
          `여럿이 서서 모일 자리는 ${get("meeting") ? "회의실뿐입니다" : "따로 없습니다"}.`,
          ...(m.spare === 0 ? ["남는 자리가 없어 인원이 늘면 배치를 다시 짜야 합니다."] : []),
        ],
      };
    },
  };
}

// ── 골격 3: 집중 업무 중심. 출입구 쪽 벽을 따라 방을 세로로 세우고, 그 앞 곧은 통로 건너에 한 방향 좌석.
function schemeFocus(plan: Plan): SchemeMeta {
  const { input, W, D, p, b } = plan;
  const all = roomDefs(input);
  const get = (k: RoomDef["key"]) => all.find((d) => d.key === k);
  const bw = p.roomDepth;
  const y0 = p.lobbyD + PART_T;
  const avail = D - y0;
  const must = (["meeting", "pantry"] as const).map(get).filter((d): d is RoomDef => !!d);
  if (minLength(must) > avail + EPS)
    throw new Infeasible(`${josa(names(must), "을", "를")} 출입구 쪽 벽에 세로로 두려면 세로가 최소 ${mm(minLength(must) + y0)}mm 필요합니다 (현재 ${mm(D)}mm).`);
  const band = [...must];
  for (const k of ["storage", "ceo"] as const) {
    const d = get(k);
    if (d && minLength([...band, d]) <= avail + EPS) band.push(d);
  }
  const cluster = (["ceo", "storage"] as const).map(get).filter((d): d is RoomDef => !!d && !band.includes(d));
  const dist = distribute(band, avail, 1.4)!;

  let y = y0;
  band.forEach((def, i) => {
    plan.addRoom(def, { x: W - bw, y, w: bw, d: dist.sizes[i] }, "left", "low", i === 0 ? ["front"] : []);
    y += dist.sizes[i] + PART_T;
  });
  if (band.length && dist.leftover > 0) {
    // 방이 끝난 안쪽 모서리는 창가 휴게 자리로 둔다.
    const lounge: Rect = { x: W - bw, y, w: bw, d: D - y };
    const deep = lounge.d >= 2.2;
    plan.rooms.push({ key: "spare", label: deep ? "창가 휴게" : "창가 수납", x: r(lounge.x), y: r(lounge.y), w: r(lounge.w), d: r(lounge.d) });
    const sw = Math.min(1.8, bw - 0.6);
    if (deep)
      b.group("lounge-sofa", "라운지 소파", "sofa", () => {
        b.box("라운지 소파", lounge.x + (bw - sw) / 2, D - 0.95, 0, sw, 0.8, 0.42, C.screen);
        b.box("라운지 소파 등받이", lounge.x + (bw - sw) / 2, D - 0.3, 0.42, sw, 0.15, 0.4, C.screen, "furniture", 1, false);
        b.item("라운지 소파", `${mm(sw)} × 800`, C.screen);
      });
    else
      b.group("window-cabinet", "창가 수납장", "cabinet", () => {
        b.box("창가 수납장", lounge.x + 0.3, D - 0.5, 0, bw - 0.6, 0.45, 0.8, C.oak);
        b.item("창가 수납장", `${mm(bw - 0.6)} × 450 × H800`, C.oak);
      });
  }

  const aisle = p.corridor;
  const ax1 = band.length ? W - bw - PART_T : W;
  const ax0 = ax1 - aisle;
  const xr = ax0 - 0.5;

  const rdR = cluster.some((d) => d.key === "ceo") ? 3.0 : 2.6;
  const cy0 = D - rdR - PART_T;
  let sw = 0;
  for (const def of cluster) {
    const w = def.key === "ceo" ? 3.3 : 2.0;
    if (sw + w + PART_T > ax0 + EPS) throw new Infeasible(`${names(cluster)}을(를) 안쪽 모서리에 둘 가로가 모자랍니다.`);
    plan.addRoom(def, { x: sw, y: D - rdR, w, d: rdR }, "front", "high");
    sw += w + PART_T;
  }

  const dw = p.deskW;
  const n = Math.max(Math.floor((xr - 0.9 + EPS) / dw) === Math.floor((xr - 0.3 + EPS) / dw) ? Math.floor((xr - 0.9 + EPS) / dw) : Math.floor((xr - 0.3 + EPS) / dw), 0);
  const zones: Rect[] = [];
  if (cluster.length) {
    const n2 = Math.max(Math.floor((xr - sw - 0.9 + EPS) / dw), 0);
    if (n2) zones.push({ x: xr - n2 * dw, y: cy0 - 0.55, w: n2 * dw, d: D - 0.3 - (cy0 - 0.55) });
    if (n) zones.push({ x: xr - n * dw, y: 0.35, w: n * dw, d: cy0 - aisle - 0.35 });
  } else if (n) zones.push({ x: xr - n * dw, y: 0.35, w: n * dw, d: D - 0.3 - 0.35 });
  // 출입구에서 먼 줄부터 채운다.
  const slots = zones.flatMap((z) => (z.d > 0 ? focusSlots(plan, new Frame(b, z, "front")) : []));
  const placed = plan.assign(slots);

  // 통로와 좌석 사이 수납장: 사람이 앉은 줄마다 세운다.
  const rowYs = [...new Set(placed.map((s) => r(s.cy - 0.35)))].sort((a, c) => a - c);
  rowYs.forEach((ry, i) =>
    b.group("aisle-cabinet", i === 0 ? "통로 수납장·복합기" : "통로 수납장", "cabinet", () => {
      b.box("통로 수납장", xr + 0.05, ry, 0, 0.45, 0.75, 1.1, C.oak);
      b.item("통로 수납장", "450 × 750 × H1,100", C.oak);
      if (i === 0) {
        b.box("복합기", xr + 0.05, ry + 0.1, 1.1, 0.45, 0.55, 0.37, C.wall);
        b.item("복합기", "수납장 상부 설치", C.wall);
      }
    }),
  );
  plan.plant(W - 0.5, 0.3);

  const guest = get("meeting") ?? get("ceo");
  const door = guest ? plan.doorAt.get(guest.key)! : null;
  const ac = ax0 + aisle / 2;
  let path: [number, number][] | null = null;
  if (door && guest) {
    path = [
      [plan.ex, 0],
      [plan.ex, 0.8],
      [ac, 0.8],
    ];
    if (band.includes(guest)) path.push([ac, door.y], [door.x, door.y]);
    else path.push([ac, cy0 - aisle / 2], [door.x, cy0 - aisle / 2], [door.x, door.y]);
  }
  const guestName = guest ? guest.label.split(" · ")[0] : "";
  const rows = rowYs.length;
  return {
    work: { x: 0, y: 0, w: ax0, d: D },
    path,
    seating: "한 방향 개인석 (칸막이 H1,200)",
    aisle,
    collabTable: false,
    describe(m) {
      return {
        summary: band.length
          ? `${josa(names(band), "을", "를")} 출입구 쪽 벽에 세로로 모으고, 직원석은 모두 한 방향을 보게 한 배치입니다.`
          : "통로를 출입구 쪽 벽에 붙이고, 직원석은 모두 한 방향을 보게 한 배치입니다.",
        reasons: [
          ...(band.length ? [`소리가 나는 ${josa(names(band), "을", "를")} 출입구 쪽 벽을 따라 세로로 두고(폭 ${mm(bw)}mm), 그 앞에 폭 ${mm(aisle)}mm 통로를 곧게 냈습니다.`] : [`폭 ${mm(aisle)}mm 통로를 출입구 쪽 벽을 따라 곧게 냈습니다.`]),
          ...(cluster.length ? [`${josa(names(cluster), "은", "는")} 세로로 놓을 깊이가 모자라 출입구에서 가장 먼 안쪽 모서리에 두었습니다.`] : []),
          `직원 ${input.staff}석은 서로 마주 보지 않도록 모두 안쪽 벽을 향해 ${rows}줄로 놓고, 자리마다 높이 1,200mm 칸막이를 세웠습니다 (책상 ${mm(dw)} × 700mm).`,
          "통로와 좌석 사이에는 높이 1,100mm 수납장을 줄마다 세웠습니다.",
        ],
        pros: [
          "마주 보는 좌석이 없고, 앞사람과는 칸막이로 시선이 끊깁니다.",
          ...(m.visitorPassBy === 0 && m.visitorDistance != null ? [`방문객은 통로로만 ${m.visitorDistance}m 이동해 ${guestName}에 들어가며, 좌석 사이를 지나지 않습니다.`] : []),
          ...(band.length ? [`${josa(names(band).replaceAll(", ", "·"), "을", "를")} 드나드는 사람이 좌석 구역 안으로 들어오지 않습니다.`] : []),
          ...(m.windowSeats ? [`직원 ${input.staff}석 중 ${m.windowSeats}석이 창가(창에서 ${WINDOW_REACH}m 이내)에 있습니다.`] : []),
          ...(m.spare > 0 ? [`${m.spare}석을 더 놓을 수 있습니다.`] : []),
        ],
        cons: [
          `팀원과 이야기하려면 자리에서 일어나야 하고, 함께 모일 자리는 ${get("meeting") ? "회의실뿐입니다" : "따로 없습니다"}.`,
          ...(m.visitorPassBy ? [`방문객이 ${guestName}까지 가며 직원 좌석 ${m.visitorPassBy}석 옆을 지납니다.`] : []),
          ...(band.length && input.windowWall !== "other" ? [`출입구 쪽 벽의 방 가운데 ${m.windowRooms.length ? `${m.windowRooms.join("·")}만 창이 있습니다` : "창이 있는 방이 없습니다"}.`] : []),
          ...(m.spare === 0 ? ["남는 자리가 없어 인원이 늘면 배치를 다시 짜야 합니다."] : []),
        ],
      };
    },
  };
}

function mirror(option: LayoutOption): LayoutOption {
  const { W } = option;
  const mx = (x: number, w = 0) => r(W - x - w);
  return {
    ...option,
    objects: option.objects.map((o) => ({ ...o, x: mx(o.x, o.w) })),
    rooms: option.rooms.map((room) => ({ ...room, x: mx(room.x, room.w) })),
    zones: option.zones?.map((z) => ({ ...z, x: mx(z.x) })),
    visitorPath: option.visitorPath?.map(([x, y]) => [mx(x), y] as [number, number]),
    marks: {
      doors: option.marks.doors.map((d) => ({ ...d, x: mx(d.x, d.vertical ? PART_T : d.w) })),
      windows: option.marks.windows.map((w) => ({ x1: mx(w.x2), x2: mx(w.x1) })),
      entrance: { x1: mx(option.marks.entrance.x2), x2: mx(option.marks.entrance.x1) },
      seats: option.marks.seats.map((s) => ({ ...s, x: mx(s.x) })),
    },
  };
}

const SCHEMES: Record<Purpose, (plan: Plan) => SchemeMeta> = {
  visitor: schemeVisitor,
  collab: (plan) => schemeRear(plan, true),
  focus: schemeFocus,
  compact: (plan) => schemeRear(plan, false),
};

function tryScheme(purpose: Purpose, input: LayoutInput, W: number, D: number): { option: LayoutOption } | { error: Infeasible } {
  let best: Infeasible | null = null;
  for (const t of TRIES) {
    try {
      const plan = new Plan(input, W, D, t);
      const built = plan.finish(purpose, SCHEMES[purpose](plan));
      const option = input.entrance === "left" ? mirror(built) : built;
      // 편집 화면과 같은 검사(겹침·칸막이·문 앞 여유)에 걸리는 배치는 내놓지 않고 다음 여유 수준을 시도한다.
      const issue = checkOption(option, input.staff).issues.find((x) => x.key !== "seats");
      if (issue) throw new Infeasible(issue.key === "door" ? "출입문이나 방 문 앞 여유(현재 임시 검사값 750mm)를 지키며 배치할 수 없습니다." : "가구가 겹치지 않게 배치할 수 없습니다.");
      return { option };
    } catch (e) {
      if (!(e instanceof Infeasible)) throw e;
      if (!best || (e.capacity ?? -1) > (best.capacity ?? -1)) best = e;
    }
  }
  return { error: best! };
}

/** 편집 화면의 ‘가구 추가’ 목록. 자동 배치와 같은 부품·색으로 만든다. */
export function catalogItems(): CatalogTemplate[] {
  const make = (type: string, label: string, desc: string, draw: (b: Builder) => void, seat = false): CatalogTemplate => {
    const b = new Builder();
    b.group(type, label, type, () => draw(b), seat ? { seat: true } : {});
    const it = itemFrom(b.groups[0], b.objects);
    return { type, label, desc, w: it.w, d: it.d, parts: it.parts, bom: it.bom, ...(seat ? { seat: true } : {}) };
  };
  return [
    make(
      "desk",
      "업무석",
      "책상 1,400×700 · 의자 · 모니터",
      (b) => {
        b.desk("직원 책상", 0, 0.9, 1.4, 0.7);
        b.chair("직원 의자", 0.7, 0.9 - 0.57, "N");
        b.box("모니터", 0.42, 1.4, 0.88, 0.56, 0.05, 0.34, C.monitor);
        b.box("모니터 받침", 0.65, 1.365, 0.75, 0.1, 0.12, 0.15, C.monStand, "furniture", 1, false);
        b.box("키보드", 0.47, 1.09, 0.753, 0.46, 0.16, 0.012, C.keyboard);
        b.item("직원 책상", "1,400 × 700", C.oak);
        b.item("사무용 의자", "회전형", C.chair);
      },
      true,
    ),
    make("meeting4", "회의 테이블 4인", "테이블 1,600×900 · 의자 4", (b) => {
      b.desk("회의 테이블", 0, 0.8, 1.6, 0.9);
      for (const cx of [0.4, 1.2]) {
        b.chair("회의 의자", cx, 0.8 - 0.57, "N");
        b.chair("회의 의자", cx, 0.8 + 0.9 + 0.55, "S");
      }
      b.item("회의 테이블", "1,600 × 900", C.oak);
      b.item("사무용 의자", "회전형", C.chair, 4);
    }),
    make("table2", "작은 테이블", "테이블 800×800 · 의자 2", (b) => {
      b.desk("작은 테이블", 0, 0.8, 0.8, 0.8);
      b.chair("의자", 0.4, 0.8 - 0.57, "N");
      b.chair("의자", 0.4, 0.8 + 0.8 + 0.55, "S");
      b.item("작은 테이블", "800 × 800", C.oak);
      b.item("사무용 의자", "회전형", C.chair, 2);
    }),
    make("cabinet", "수납장", "1,200×450 · 높이 1,100", (b) => {
      b.box("수납장", 0, 0, 0, 1.2, 0.45, 1.1, C.oak);
      b.item("수납장", "1,200 × 450 × H1,100", C.oak);
    }),
    make("sofa", "라운지 소파", "1,800×800", (b) => {
      b.box("라운지 소파", 0, 0, 0, 1.8, 0.8, 0.42, C.screen);
      b.box("라운지 소파 등받이", 0, 0.65, 0.42, 1.8, 0.15, 0.4, C.screen, "furniture", 1, false);
      b.item("라운지 소파", "1,800 × 800", C.screen);
    }),
    make("board", "이동식 화이트보드", "1,200 · 높이 1,500", (b) => {
      b.box("이동식 화이트보드", 0, 0, 0.2, 1.2, 0.06, 1.5, C.counter);
      b.item("이동식 화이트보드", "1,200 × H1,500", C.counter);
    }),
    make("plant", "화분", "중형", (b) => {
      b.box("화분", 0, 0, 0, 0.35, 0.35, 0.42, C.pot);
      b.box("식재", -0.06, -0.06, 0.42, 0.47, 0.47, 0.62, C.plant, "furniture", 1, false);
      b.item("화분", "중형", C.pot);
    }),
  ];
}

export function assumedDimensions(areaPyeong: number) {
  const area = areaPyeong * PYEONG;
  const W = Math.round(Math.sqrt((area * 11) / 9) * 10) / 10;
  const D = snap(area / W);
  return { W, D: r(D) };
}

export function generateLayout(input: LayoutInput): LayoutResult {
  const reasons: string[] = [];
  const assumptions: string[] = [];
  const advisories: string[] = [];

  const hasDims = !!(input.widthM && input.depthM && input.widthM > 0 && input.depthM > 0);
  const dims = hasDims ? { W: r(input.widthM!), D: r(input.depthM!) } : assumedDimensions(input.areaPyeong);
  const areaM2 = dims.W * dims.D;
  const pyeong = hasDims ? areaM2 / PYEONG : input.areaPyeong;

  if (pyeong < AUTO_MIN_PYEONG - 0.5 || pyeong > AUTO_MAX_PYEONG + 0.5)
    reasons.push(`자동 배치는 ${AUTO_MIN_PYEONG}~${AUTO_MAX_PYEONG}평 사무실만 지원합니다 (입력 약 ${pyeong.toFixed(1)}평).`);
  if (input.shape !== "rect") reasons.push("직사각형이 아닌 공간은 자동 배치를 지원하지 않습니다.");
  if (input.pillars > 0) reasons.push(`실내 기둥 ${input.pillars}개가 있어 기둥 위치를 반영한 검토가 필요합니다.`);
  if (input.entrance === "other") reasons.push("출입구가 전면 좌·우측이 아닌 위치에 있어 동선 검토가 필요합니다.");
  if (input.staff < 1) reasons.push("직원 좌석 수가 1석 이상이어야 합니다.");
  if (input.meeting && (input.meetingSeats < 4 || input.meetingSeats > 12)) reasons.push("회의실은 4~12인 규모만 자동 배치합니다.");
  const ratio = Math.max(dims.W, dims.D) / Math.min(dims.W, dims.D);
  if (ratio > 2.2) reasons.push(`가로·세로 비율(${ratio.toFixed(1)}:1)이 길쭉해 자동 배치 템플릿에 맞지 않습니다.`);

  // 실제 요청: 치수를 모르면 평수로 가정해 3D를 만들지 않는다. 운영자가 자료를 확인한다.
  if (input.intake && !hasDims) {
    const why: Record<string, string> = {
      drawing: "도면에서 치수를 읽어 배치안을 만들지는 않습니다. 도면에 적힌 실내 가로·세로를 입력하면 배치안을 만들고, 입력하지 않으면 운영자가 도면을 확인합니다.",
      dims: "실내 가로·세로를 입력해야 배치안을 만들 수 있습니다.",
      photos: "사진만으로는 실제 치수를 알 수 없어 배치안과 3D를 만들지 않았습니다. 운영자가 필요한 자료를 확인해 연락드립니다.",
      none: "아직 자료가 없어 배치안을 만들지 않았습니다. 도면이나 치수를 추가하면 배치안을 만들 수 있습니다.",
    };
    return { status: "needs_review", reasons: [why[input.intake]], assumptions, advisories, options: [], skipped: [], recommended: null, W: null, D: null, assumedDims: false };
  }

  const base = { W: dims.W, D: dims.D, assumedDims: !hasDims };
  if (reasons.length) return { status: "needs_review", reasons, assumptions, advisories, options: [], skipped: [], recommended: null, ...base };

  const options: LayoutOption[] = [];
  const skipped: NonNullable<LayoutResult["skipped"]> = [];
  for (const purpose of ["visitor", "collab", "focus"] as const) {
    const res = tryScheme(purpose, input, dims.W, dims.D);
    if ("option" in res) options.push(res.option);
    else skipped.push({ purpose, title: PURPOSES[purpose].title, reason: res.error.message });
  }
  if (!options.length) {
    // 목적별 대안이 하나도 안 나오면 좌석 수를 우선한 단일안을 시도한다.
    const res = tryScheme("compact", input, dims.W, dims.D);
    if ("error" in res) {
      reasons.push(res.error.message);
      reasons.push("면적에 비해 요청한 공간이 많습니다. 좌석 수나 개별실 구성을 줄이거나, 실측 치수를 입력해 다시 생성해 보세요.");
      return { status: "needs_review", reasons, assumptions, advisories, options: [], skipped, recommended: null, ...base };
    }
    options.push(res.option);
  }

  if (hasDims) {
    assumptions.push(`입력한 실내 치수 ${mm(dims.W)} × ${mm(dims.D)} mm (${areaM2.toFixed(1)}㎡ ≈ ${(areaM2 / PYEONG).toFixed(1)}평)를 기준으로 했습니다.`);
    if (Math.abs(areaM2 / PYEONG - input.areaPyeong) / input.areaPyeong > 0.15)
      advisories.push(`입력한 치수로 계산한 면적(약 ${(areaM2 / PYEONG).toFixed(1)}평)이 전용면적 ${input.areaPyeong}평과 다릅니다. 치수를 우선 적용했습니다.`);
  } else {
    assumptions.push(
      `실측 치수가 없어 ${input.areaPyeong}평을 ${mm(dims.W)} × ${mm(dims.D)} mm 직사각형(${areaM2.toFixed(1)}㎡)으로 가정했습니다. 실제 치수를 입력하면 그 값을 우선합니다.`,
    );
  }
  assumptions.push(`천장 높이 ${mm(CEILING)} mm, 실내 기둥·코어 없음, 화장실은 공용부에 있다고 가정했습니다.`);
  if (input.entranceOffset != null)
    assumptions.push(`출입문은 입력한 대로 전면 벽 ${input.entrance === "left" ? "왼쪽" : "오른쪽"} 모서리에서 ${mm(input.entranceOffset)} mm, 폭 ${mm(input.entranceWidth ?? ENTRANCE_W)} mm에 두었습니다.`);
  else assumptions.push(`출입구는 전면 벽 ${input.entrance === "left" ? "왼쪽" : "오른쪽"}에 폭 ${mm(ENTRANCE_W)} mm로 있다고 가정했습니다. 정확한 위치와 폭은 반영하지 않았습니다.`);
  if (input.windowWall === "other") advisories.push("창이 출입구 맞은편 벽이 아닌 곳에 있다고 입력하셨습니다. 자동 배치는 창 위치를 반영하지 못해 창을 그리지 않았고, 창가 좌석 수도 계산하지 않았습니다. 운영자와 시공사가 확인합니다.");
  else assumptions.push(`창은 출입구 맞은편(안쪽) 벽 전체에 있다고 가정했습니다${input.windowWall === "rear" ? " (입력하신 위치와 같습니다)" : ""}. 창의 크기와 개수는 실제와 다를 수 있습니다.`);
  if (roomDefs(input).length) assumptions.push(`개별실 칸막이 두께 100 mm, 각 실 출입 개구부 ${mm(DOOR_W)} mm 슬라이딩 도어 개념입니다.`);
  if (input.pantry) assumptions.push("탕비실 위치는 급배수 접속 가능 여부가 확인되지 않은 가정입니다.");
  assumptions.push("현장 실측과 설비·법규 검토 전의 상담용 개념안이며 시공 확정 도면이 아닙니다.");

  if (options.every((o) => o.notes?.length)) advisories.push(`${options[0].notes![0]} 좌석이나 개별실을 줄이면 여유가 생깁니다.`);
  const perPerson = areaM2 / (input.staff + (input.ceo ? 1 : 0));
  if (perPerson < 6) advisories.push(`1인당 면적이 약 ${perPerson.toFixed(1)}㎡로 좁은 편입니다.`);
  if (input.siteNotes?.trim()) advisories.push("입력한 출입문·창문·기둥 메모는 자동 배치에 반영되지 않았습니다. 운영자와 업체가 확인합니다.");
  if (input.reuseFurniture?.trim()) advisories.push("재사용 가구는 배치안의 가구 목록에 반영되지 않았습니다. 견적 요청 시 업체에 전달됩니다.");

  const recommended = options.find((o) => o.purpose === input.priority)?.id ?? null;
  return { status: "ok", reasons, assumptions, advisories, options, skipped, recommended, ...base };
}
