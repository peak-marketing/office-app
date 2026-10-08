"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { saveHouse } from "@/lib/actions";
import PlacedProductCard from "@/components/shop/PlacedProductCard";
import ProductPalette from "@/components/shop/ProductPalette";
import { josa } from "@/lib/space/check";
import type { Pt } from "@/lib/space/geometry";
import { AUTO_LATER_TEXT, CONCEPT_FURNITURE_TEXT, SIZE_MAX, SIZE_MIN, SIZE_RANGE_TEXT, resizeItem, toRoomEdits } from "@/lib/space/home-room";
import {
  DOOR_KINDS,
  FIXED_KINDS,
  FIXED_ORDER,
  HEIGHT_MAX,
  HEIGHT_MIN,
  HOUSE_AREA_NOTE,
  HOUSE_FIXED_NOTE,
  HOUSE_LABEL,
  HOUSE_SCOPE_TEXT,
  OPENINGS,
  ROOM_KINDS,
  WALL_MIN_LEN,
  WALL_T_DEFAULT,
  areaText,
  boxInside,
  fixedErrors,
  fixedLabel,
  houseErrors,
  houseKey,
  lineOf,
  mmText,
  nextId,
  openingErrors,
  openingName,
  r3,
  roomsOf,
  snapGrid,
  wallErrors,
  wallLines,
  wallName,
  type FixedKind,
  type HouseFixed,
  type HouseItem,
  type HouseModel,
  type HouseOpening,
  type HouseWall,
  type OpeningKind,
  type RoomKind,
} from "@/lib/space/house";
import { HOUSE_CHECKS, HOUSE_CHECK_DISCLAIMER, HOUSE_GAP_CHECK, HOUSE_NOT_CHECKED, danglingEnds, houseWarnings, runHouseChecks } from "@/lib/space/house-check";
import { findHouseSpot, pickWall, placeOpening, snapEnd, snapStart } from "@/lib/space/house-edit";
import { composeHouse } from "@/lib/space/house-geom";
import { detectRooms, nearestRegion, type HouseRegion } from "@/lib/space/house-rooms";
import { footprint } from "@/lib/space/placement";
import type { CatalogTemplate, Rot } from "@/lib/space/types";
import HousePlan, { type HouseSelection } from "./HousePlan";

const Viewer3D = dynamic(() => import("@/components/Viewer3D"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-muted">3D 화면을 불러오는 중…</div>,
});

type Mode = "wall" | "door" | "window" | "label" | "fixed" | "furniture";
type Draft = Pick<HouseModel, "height" | "walls" | "openings" | "labels" | "fixed" | "items">;

const MODES: { key: Mode; label: string; hint: string }[] = [
  { key: "wall", label: "벽 그리기", hint: "시작점과 끝점을 차례로 누르세요. 가로·세로로만 그려지고, 50mm 격자와 기존 벽 끝·벽 선에 맞춰져요. 벽으로 둘러싸인 곳이 방으로 잡혀요." },
  { key: "door", label: "문·통로", hint: "종류를 고르고 벽(내부 벽·바깥 벽)을 누르세요. 문은 방을 잇는 자리라 방을 나누지 않아요. 놓은 문을 누르면 폭·위치·여는 쪽을 고쳐요." },
  { key: "window", label: "창", hint: "바깥 벽을 누르면 폭 1,500mm 창이 놓여요. 놓은 창을 누르면 폭·위치를 고쳐요." },
  { key: "label", label: "방 이름", hint: "방 안을 누르고 이름을 고르세요. 면적은 벽 안쪽 기준 추정이에요." },
  { key: "fixed", label: "고정 구조물", hint: "종류를 고르고 놓을 자리를 누르세요. 기본 크기로 놓이고 아래에서 숫자로 고쳐요. 놓은 것을 눌러 고르고, 다시 눌러 끌어 옮겨요." },
  { key: "furniture", label: "가구", hint: "가구를 누르면 고른 방의 빈자리에 놓여요. 가구를 눌러 고르고 끌어서 옮기세요(휴대폰은 고른 가구를 다시 눌러 끌기)." },
];
const STEPS = [0.01, 0.05, 0.1, 0.5];
const ZOOMS = [1, 2, 3];

const draftOf = (h: HouseModel): Draft => ({ height: h.height, walls: h.walls, openings: h.openings, labels: h.labels, fixed: h.fixed, items: h.items });
const toM = (v: string) => (v.trim() === "" ? NaN : Number(v.replaceAll(",", "")) / 1000);
const kindOfName = (name: string): RoomKind => ROOM_KINDS.find((k) => name.startsWith(k.label))?.kind ?? "other";

function MmField({ label, value, onCommit, testid, disabled }: { label: string; value: number; onCommit: (m: number) => void; testid: string; disabled?: boolean }) {
  const commit = (raw: string) => {
    const m = toM(raw);
    if (Number.isFinite(m) && Math.abs(m - value) > 0.0005) onCommit(r3(m));
  };
  return (
    <label className="block min-w-0 text-[11px] text-muted">
      {label}
      <input
        key={`${testid}-${value}`}
        className="input !min-h-9 !py-1.5 text-right tabular-nums"
        inputMode="numeric"
        defaultValue={Math.round(value * 1000)}
        data-testid={testid}
        disabled={disabled}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit((e.target as HTMLInputElement).value);
          }
        }}
      />
    </label>
  );
}

export interface HouseEditorProps {
  projectId: number;
  house: HouseModel;
  catalog: CatalogTemplate[];
  underlayUrl: string | null;
  /** 업체에 보낸 요청 기록에 들어 있는 평면 버전. 보낸 평면이 없으면 null */
  sentRev: number | null;
  requested: boolean;
  readOnly: boolean;
  justSaved: string | null;
  /** 놓을 수 있는 실제 상품(규격 있는 판매 상품) */
  products?: CatalogTemplate[];
  /** 상품 화면의 ‘내 공간에 놓아 보기’로 들어왔을 때 처음에 놓을 상품(product:상품:옵션) */
  initialAdd?: string | null;
}

/** 집 전체 평면 편집: 내부 벽·문·창·방 이름·고정 구조물·개념 가구. 평면과 3D는 같은 데이터로 그린다. */
export default function HouseEditor(p: HouseEditorProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => draftOf(p.house));
  const [past, setPast] = useState<Draft[]>([]);
  const [future, setFuture] = useState<Draft[]>([]);
  const [mode, setModeState] = useState<Mode>(p.house.walls.length ? "furniture" : "wall");
  const [wallSub, setWallSub] = useState<"draw" | "pick">("draw");
  const [wallT, setWallT] = useState(WALL_T_DEFAULT);
  const [doorKind, setDoorKind] = useState<OpeningKind>("door");
  const [fixedKind, setFixedKind] = useState<FixedKind>("closet");
  const [sel, setSel] = useState<HouseSelection>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [start, setStart] = useState<Pt | null>(null);
  const [hover, setHover] = useState<Pt | null>(null);
  const [zoom, setZoom] = useState(1);
  const [view, setView] = useState<"plan" | "3d">("plan");
  const [under, setUnder] = useState(p.house.source === "trace" && !!p.house.underlay);
  const [step, setStep] = useState(0.1);
  const [roomText, setRoomText] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(p.justSaved ? { ok: p.justSaved } : null);
  const [pending, startTransition] = useTransition();
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ kind: "item" | "fixed"; id: string; ox: number; oy: number; moved: boolean } | null>(null);
  const lastPointer = useRef("mouse");
  // 누른 자리의 대상. 끌기 위해 포인터를 잡으면 click이 평면 전체로 가므로 누를 때 본 대상을 기억해 둔다.
  const downHit = useRef<{ kind: string; id: string } | null>(null);
  const readOnly = p.readOnly;

  const house: HouseModel = useMemo(() => ({ ...p.house, ...draft }), [p.house, draft]);
  const outline = p.house.outline;
  const det = useMemo(() => detectRooms({ outline, walls: draft.walls, labels: draft.labels }), [outline, draft.walls, draft.labels]);
  const report = useMemo(() => runHouseChecks(house, det), [house, det]);
  const errors = useMemo(() => houseErrors(house), [house]);
  const warnings = useMemo(() => houseWarnings(house, det), [house, det]);
  const option = useMemo(() => (view === "3d" ? composeHouse(house, det) : null), [view, house, det]);
  const rooms = roomsOf(det);
  const dirty = houseKey(house) !== houseKey(p.house);
  const W = house.width, D = house.depth;

  const curItem = sel?.kind === "item" ? (draft.items.find((it) => it.id === sel.id) ?? null) : null;
  const curFixed = sel?.kind === "fixed" ? (draft.fixed.find((f) => f.id === sel.id) ?? null) : null;
  const curWall = sel?.kind === "wall" ? (draft.walls.find((w) => w.id === sel.id) ?? null) : null;
  const curOpening = sel?.kind === "opening" ? (draft.openings.find((o) => o.id === sel.id) ?? null) : null;
  const curRoom = sel?.kind === "room" ? (det.regions[Number(sel.id)] ?? null) : null;
  const targetRoom = target != null && det.regions[target] && !det.regions[target].sliver ? det.regions[target] : null;

  // ── 상태 바꾸기(되돌리기 기록)
  const change = (next: Draft, ok?: string) => {
    setPast((h) => [...h.slice(-99), draft]);
    setFuture([]);
    setDraft(next);
    setMsg(ok ? { ok } : null);
  };
  const fail = (error: string) => setMsg({ error });
  const undo = () => {
    const last = past.at(-1);
    if (!last) return;
    setFuture((f) => [...f, draft]);
    setPast((h) => h.slice(0, -1));
    setDraft(last);
    setSel(null);
    setMsg({ ok: "바로 전 변경을 되돌렸어요." });
  };
  const redo = () => {
    const next = future.at(-1);
    if (!next) return;
    setPast((h) => [...h, draft]);
    setFuture((f) => f.slice(0, -1));
    setDraft(next);
    setSel(null);
  };
  const setMode = (m: Mode) => {
    setModeState(m);
    setStart(null);
    setHover(null);
    setSel(null);
    setMsg(null);
  };

  // ── 화면 좌표 → 평면 좌표
  const toWorld = (cx: number, cy: number): Pt | null => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return null;
    const q = new DOMPoint(cx, cy).matrixTransform(m.inverse());
    return [q.x, D - q.y];
  };
  const tolFor = (pointer: string) => {
    const m = svgRef.current?.getScreenCTM();
    const pxPerM = m ? Math.hypot(m.a, m.b) : 30;
    return (pointer === "touch" ? 22 : 14) / pxPerM;
  };

  // ── 벽
  const addWall = (a: Pt, b: Pt, t: number) => {
    const [s, e] = a[0] > b[0] + 1e-9 || a[1] > b[1] + 1e-9 ? [b, a] : [a, b];
    const wall: HouseWall = { id: nextId("w", draft.walls.map((w) => w.id)), a: [r3(s[0]), r3(s[1])], b: [r3(e[0]), r3(e[1])], t };
    const errs = wallErrors({ outline, walls: draft.walls }, wall);
    if (errs.length) return fail(errs[0]);
    const len = Math.hypot(e[0] - s[0], e[1] - s[1]);
    change({ ...draft, walls: [...draft.walls, wall] }, `${wallName(wall)}(길이 ${mmText(len)}mm)을 그렸어요. 벽으로 둘러싸인 곳은 방으로 잡혀요.`);
  };
  const clickWall = (w: Pt, tol: number) => {
    if (wallSub === "pick") {
      const l = pickWall(house, w, tol, "inner");
      if (!l) return fail("내부 벽을 눌러 주세요. 바깥 벽은 고르거나 지울 수 없어요.");
      setSel({ kind: "wall", id: l.ref });
      setMsg(null);
      return;
    }
    if (!start) {
      setStart(snapStart(house, w, tol));
      setHover(null);
      setMsg({ ok: "끝점을 누르세요. 같은 점을 다시 누르면 취소돼요." });
      return;
    }
    const end = snapEnd(house, start, w, tol);
    setStart(null);
    setHover(null);
    if (Math.hypot(end[0] - start[0], end[1] - start[1]) < WALL_MIN_LEN) return setMsg({ ok: "벽 그리기를 취소했어요." });
    addWall(start, end, wallT);
  };
  const updateWall = (id: string, fn: (w: HouseWall) => HouseWall) => {
    const w0 = draft.walls.find((w) => w.id === id);
    if (!w0) return;
    const next = fn(w0);
    const errs = wallErrors({ outline, walls: draft.walls }, next);
    if (errs.length) return fail(errs[0]);
    change({ ...draft, walls: draft.walls.map((w) => (w.id === id ? next : w)) }, `${wallName(next)}을 고쳤어요.`);
  };
  const setWallNumbers = (w: HouseWall, key: "x" | "y" | "len", v: number) => {
    if (key === "len" && v < WALL_MIN_LEN) return fail("벽 길이는 100mm 이상으로 넣어 주세요. 방향을 바꾸려면 벽을 지우고 다시 그려 주세요.");
    const horizontal = Math.abs(w.b[1] - w.a[1]) < 1e-9;
    const len = horizontal ? w.b[0] - w.a[0] : w.b[1] - w.a[1];
    updateWall(w.id, (x) => {
      const a: Pt = key === "x" ? [v, x.a[1]] : key === "y" ? [x.a[0], v] : x.a;
      const l = key === "len" ? v : len;
      return { ...x, a, b: horizontal ? [r3(a[0] + l), a[1]] : [a[0], r3(a[1] + l)] };
    });
  };
  const removeWall = (id: string) => {
    const n = draft.openings.filter((o) => o.wall === id).length;
    change({ ...draft, walls: draft.walls.filter((w) => w.id !== id), openings: draft.openings.filter((o) => o.wall !== id) }, `${wallName({ id })}을 지웠어요${n ? `(그 벽의 문·통로 ${n}개도 함께)` : ""}. 되돌리기로 살릴 수 있어요.`);
    setSel(null);
  };
  const addWallByNumbers = (fd: FormData) => {
    const x = toM(String(fd.get("wx") ?? "")), y = toM(String(fd.get("wy") ?? "")), len = toM(String(fd.get("wl") ?? ""));
    if (![x, y, len].every(Number.isFinite) || len < WALL_MIN_LEN) return fail("시작 위치와 길이(100mm 이상)를 mm로 넣어 주세요.");
    const a: Pt = [r3(x), r3(y)];
    const dir = String(fd.get("wd"));
    const b: Pt = dir === "x" ? [r3(x + len), r3(y)] : [r3(x), r3(y + len)];
    addWall(a, b, wallT);
  };

  // ── 문·통로·창
  const clickOpening = (w: Pt, tol: number) => {
    if (sel) {
      setSel(null);
      return;
    }
    const kind: OpeningKind = mode === "window" ? "window" : doorKind;
    const l = pickWall(house, w, tol);
    if (!l) return fail(OPENINGS[kind].outerOnly ? "바깥 벽(진한 테두리)을 눌러 주세요." : "벽 위를 눌러 주세요. 확대하면 더 정확하게 누를 수 있어요.");
    const o = placeOpening(draft, kind, l, l.t0, nextId("d", draft.openings.map((x) => x.id)));
    if ("error" in o) return fail(o.error);
    change({ ...draft, openings: [...draft.openings, o] }, `${OPENINGS[kind].label}을 ${l.name}에 놓았어요(폭 ${mmText(o.width)}mm). 놓은 것을 누르면 고칠 수 있어요.`);
  };
  const updateOpening = (id: string, fn: (o: HouseOpening) => HouseOpening, ok?: string) => {
    const o0 = draft.openings.find((o) => o.id === id);
    if (!o0) return;
    const next = fn(o0);
    const errs = openingErrors(house, next);
    if (errs.length) return fail(errs[0]);
    change({ ...draft, openings: draft.openings.map((o) => (o.id === id ? next : o)) }, ok ?? `${openingName(house, next)}을 고쳤어요.`);
  };
  const removeOpening = (id: string) => {
    const o = draft.openings.find((x) => x.id === id);
    if (!o) return;
    change({ ...draft, openings: draft.openings.filter((x) => x.id !== id) }, `${openingName(house, o)}을 뺐어요.`);
    setSel(null);
  };

  // ── 방 이름
  const clickRoom = (w: Pt) => {
    const id = nearestRegion(det.raster, w[0], w[1], 2);
    const r = id >= 0 ? det.regions[id] : null;
    if (!r || r.sliver) return fail("방 안(벽으로 둘러싸인 곳)을 눌러 주세요.");
    setSel({ kind: "room", id: String(r.idx) });
    setTarget(r.idx);
    setRoomText(r.name);
    setMsg(null);
  };
  const pickRoom = (r: HouseRegion) => {
    setSel({ kind: "room", id: String(r.idx) });
    setRoomText(r.name);
    setTarget(r.idx);
    setMsg(null);
  };
  const presetName = (k: RoomKind, r: HouseRegion) => {
    const base = ROOM_KINDS.find((x) => x.kind === k)!.label;
    const names = draft.labels.filter((l) => l.id !== r.labelId).map((l) => l.name);
    if (k === "bed") {
      let n = 1;
      while (names.includes(`${base}${n}`)) n++;
      return `${base}${n}`;
    }
    if (!names.includes(base)) return base;
    let n = 2;
    while (names.includes(`${base}${n}`)) n++;
    return `${base}${n}`;
  };
  const nameRoom = (r: HouseRegion, raw: string, kind?: RoomKind) => {
    const name = raw.replace(/\s+/g, " ").trim().slice(0, 20);
    if (!name) return fail("방 이름을 넣어 주세요.");
    const k = kind ?? kindOfName(name);
    const label = r.labelId ? draft.labels.find((l) => l.id === r.labelId) : undefined;
    if (label) change({ ...draft, labels: draft.labels.map((l) => (l.id === label.id ? { ...l, name, kind: k } : l)) }, `방 이름을 ‘${name}’(으)로 바꿨어요.`);
    else change({ ...draft, labels: [...draft.labels, { id: nextId("l", draft.labels.map((l) => l.id)), x: r.anchor[0], y: r.anchor[1], name, kind: k }] }, `이 방을 ‘${name}’(으)로 이름 붙였어요 (약 ${r.area.toFixed(1)}㎡).`);
    setRoomText(name);
  };
  const unnameRoom = (r: HouseRegion) => {
    if (!r.labelId) return;
    change({ ...draft, labels: draft.labels.filter((l) => l.id !== r.labelId) }, `‘${r.name}’ 이름을 지웠어요.`);
    setRoomText("");
  };

  // ── 고정 구조물
  const clickFixed = (w: Pt) => {
    if (sel) {
      setSel(null);
      return;
    }
    const spec = FIXED_KINDS[fixedKind];
    const f: HouseFixed = {
      id: nextId("f", draft.fixed.map((x) => x.id)),
      kind: fixedKind,
      x: snapGrid(Math.min(W - spec.w, Math.max(0, w[0] - spec.w / 2))),
      y: snapGrid(Math.min(D - spec.d, Math.max(0, w[1] - spec.d / 2))),
      w: spec.w,
      d: spec.d,
      h: spec.h,
    };
    if (!boxInside(house, f)) return fail("집 안쪽을 눌러 주세요. 벽에 붙이려면 놓은 뒤 위치를 숫자로 맞추세요.");
    change({ ...draft, fixed: [...draft.fixed, f] }, `${josa(fixedLabel(f), "을", "를")} 놓았어요(${mmText(f.w)} × ${mmText(f.d)}mm). 크기는 아래에서 고쳐요.`);
    setSel({ kind: "fixed", id: f.id });
  };
  const updateFixed = (id: string, fn: (f: HouseFixed) => HouseFixed, ok?: string) => {
    const i = draft.fixed.findIndex((f) => f.id === id);
    if (i < 0) return;
    const next = fn(draft.fixed[i]);
    const errs = fixedErrors(house, next, i);
    if (errs.length) return fail(errs[0]);
    change({ ...draft, fixed: draft.fixed.map((f) => (f.id === id ? next : f)) }, ok);
  };
  const removeFixed = (id: string) => {
    const f = draft.fixed.find((x) => x.id === id);
    if (!f) return;
    change({ ...draft, fixed: draft.fixed.filter((x) => x.id !== id) }, `${josa(fixedLabel(f), "을", "를")} 뺐어요.`);
    setSel(null);
  };

  // ── 가구
  const itemPatch = (id: string, fn: (it: HouseItem) => HouseItem, ok?: string) => change({ ...draft, items: draft.items.map((it) => (it.id === id ? fn(it) : it)) }, ok);
  const place = (it: HouseItem, room: HouseRegion | null) => {
    const spot = findHouseSpot({ ...house, items: draft.items }, det, it, room);
    const placed = { ...it, ...spot };
    change({ ...draft, items: [...draft.items, placed] }, `${josa(placed.label, "을", "를")} ${room ? `${room.display}의 ` : ""}빈자리에 놓았어요. 끌거나 화살표로 옮기세요.`);
    setSel({ kind: "item", id: placed.id });
  };
  const addItem = (t: CatalogTemplate) => {
    if (readOnly) return;
    if (mode !== "furniture") setModeState("furniture");
    place({ id: nextId("n", draft.items.map((x) => x.id)), type: t.type, label: t.label, x: 0, y: 0, rot: 0, w: t.w, d: t.d, parts: t.parts, bom: t.bom, origin: "added", src: `catalog:${t.type}`, ...(t.product ? { product: t.product } : {}) }, targetRoom);
  };
  // 상품 화면의 ‘내 공간에 놓아 보기’: 처음 한 번 그 상품을 빈자리에 놓는다.
  const autoAdded = useRef(false);
  useEffect(() => {
    if (autoAdded.current || !p.initialAdd || readOnly) return;
    autoAdded.current = true;
    const t = p.products?.find((x) => x.type === p.initialAdd);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 들어올 때 한 번만 놓는다
    if (t) addItem(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const moveSelected = (dx: number, dy: number) => {
    if (readOnly) return;
    if (curItem) itemPatch(curItem.id, (it) => ({ ...it, x: r3(Math.min(W, Math.max(0, it.x + dx))), y: r3(Math.min(D, Math.max(0, it.y + dy))) }));
    else if (curFixed) updateFixed(curFixed.id, (f) => ({ ...f, x: r3(f.x + dx), y: r3(f.y + dy) }));
  };
  const rotateItem = () => curItem && !readOnly && itemPatch(curItem.id, (it) => ({ ...it, rot: ((it.rot + 270) % 360) as Rot }));
  const duplicateItem = () => {
    if (!curItem || readOnly) return;
    const room = det.regions[report.itemRoom[curItem.id]] ?? null;
    place({ ...curItem, id: nextId("n", draft.items.map((x) => x.id)) }, room && !room.sliver ? room : targetRoom);
  };
  const removeItem = () => {
    if (!curItem || readOnly) return;
    change({ ...draft, items: draft.items.filter((it) => it.id !== curItem.id) }, `${josa(curItem.label, "을", "를")} 뺐어요. 되돌리기로 살릴 수 있어요.`);
    setSel(null);
  };
  const setItemPos = (axis: "x" | "y", v: number) => {
    if (!curItem || readOnly) return;
    const f = footprint(curItem);
    itemPatch(curItem.id, (it) => (axis === "x" ? { ...it, x: r3(Math.min(W, Math.max(0, v + f.w / 2))) } : { ...it, y: r3(Math.min(D, Math.max(0, v + f.d / 2))) }));
  };
  const setItemSize = (axis: "w" | "d", v: number) => {
    if (!curItem || readOnly) return;
    if (v < SIZE_MIN - 1e-6 || v > SIZE_MAX + 1e-6) return fail(`가구 크기는 ${SIZE_RANGE_TEXT}예요.`);
    const tpl = p.catalog.find((c) => c.type === curItem.type);
    if (!tpl || curItem.product) return;
    const w = axis === "w" ? r3(v) : curItem.w, d = axis === "d" ? r3(v) : curItem.d;
    const sized = resizeItem({ w: tpl.w, d: tpl.d, parts: tpl.parts, bom: tpl.bom }, w, d);
    itemPatch(curItem.id, (it) => ({ ...it, w: sized.w, d: sized.d, parts: sized.parts, bom: sized.bom }), `${curItem.label} 크기를 ${mmText(w)} × ${mmText(d)}mm로 바꿨어요. 평면·3D·검사에 같은 크기가 쓰여요.`);
  };
  const resetItemSize = () => {
    if (!curItem || readOnly) return;
    const tpl = p.catalog.find((c) => c.type === curItem.type);
    if (tpl) itemPatch(curItem.id, (it) => ({ ...it, w: tpl.w, d: tpl.d, parts: tpl.parts, bom: tpl.bom }));
  };

  // ── 평면 누르기·끌기
  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    lastPointer.current = e.pointerType;
    const hit = (e.target as Element).closest("[data-hit]");
    const kind = hit?.getAttribute("data-hit");
    const id = hit?.getAttribute("data-id");
    downHit.current = kind && id ? { kind, id } : null;
    if (readOnly) return;
    const dragKind = mode === "furniture" ? "item" : mode === "fixed" ? "fixed" : null;
    if (!dragKind || kind !== dragKind || !id) return;
    const was = sel?.kind === dragKind && sel.id === id;
    setSel({ kind: dragKind, id });
    if (dragKind === "item") {
      const room = report.itemRoom[id];
      if (room >= 0) setTarget(room);
    }
    if (e.pointerType === "touch" && !was) return;
    const w = toWorld(e.clientX, e.clientY);
    const pos = dragKind === "item" ? draft.items.find((x) => x.id === id) : draft.fixed.find((x) => x.id === id);
    if (!w || !pos) return;
    drag.current = { kind: dragKind, id, ox: w[0] - pos.x, oy: w[1] - pos.y, moved: false };
    try {
      svgRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* 포인터를 잡지 못해도 끌기는 된다 */
    }
    e.preventDefault();
  };
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (mode === "wall" && wallSub === "draw" && start && e.pointerType === "mouse") {
      const w = toWorld(e.clientX, e.clientY);
      if (w) setHover(snapEnd(house, start, w, tolFor("mouse")));
      return;
    }
    const d = drag.current;
    if (!d) return;
    const w = toWorld(e.clientX, e.clientY);
    if (!w) return;
    if (d.kind === "item") {
      const it = draft.items.find((x) => x.id === d.id);
      if (!it) return;
      const nx = r3(Math.min(W, Math.max(0, snapGrid(w[0] - d.ox)))), ny = r3(Math.min(D, Math.max(0, snapGrid(w[1] - d.oy))));
      if (Math.abs(nx - it.x) < 1e-4 && Math.abs(ny - it.y) < 1e-4) return;
      if (!d.moved) {
        setPast((h) => [...h.slice(-99), draft]);
        setFuture([]);
        d.moved = true;
      }
      setDraft((prev) => ({ ...prev, items: prev.items.map((x) => (x.id === d.id ? { ...x, x: nx, y: ny } : x)) }));
    } else {
      const f = draft.fixed.find((x) => x.id === d.id);
      if (!f) return;
      const nx = r3(Math.min(W - f.w, Math.max(0, snapGrid(w[0] - d.ox)))), ny = r3(Math.min(D - f.d, Math.max(0, snapGrid(w[1] - d.oy))));
      if (Math.abs(nx - f.x) < 1e-4 && Math.abs(ny - f.y) < 1e-4) return;
      if (!boxInside(house, { ...f, x: nx, y: ny })) return;
      if (!d.moved) {
        setPast((h) => [...h.slice(-99), draft]);
        setFuture([]);
        d.moved = true;
      }
      setDraft((prev) => ({ ...prev, fixed: prev.fixed.map((x) => (x.id === d.id ? { ...x, x: nx, y: ny } : x)) }));
    }
  };
  const onUp = () => {
    drag.current = null;
  };
  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (readOnly) return;
    const w = toWorld(e.clientX, e.clientY);
    if (!w) return;
    const tol = tolFor(lastPointer.current);
    const hit = (e.target as Element).closest("[data-hit]");
    const kind = hit?.getAttribute("data-hit") ?? downHit.current?.kind;
    const id = hit?.getAttribute("data-id") ?? downHit.current?.id;
    downHit.current = null;
    if (mode === "wall") return clickWall(w, tol);
    if (mode === "door" || mode === "window") {
      const o = kind === "opening" ? draft.openings.find((x) => x.id === id) : undefined;
      if (o && (mode === "window") === (o.kind === "window")) {
        setSel({ kind: "opening", id: o.id });
        setMsg(null);
        return;
      }
      return clickOpening(w, tol);
    }
    if (mode === "label") return clickRoom(w);
    if (mode === "fixed") {
      if (kind === "fixed") return;
      return clickFixed(w);
    }
    if (mode === "furniture" && kind !== "item") {
      setSel(null);
      const r = nearestRegion(det.raster, w[0], w[1], 1);
      if (r >= 0 && !det.regions[r].sliver) setTarget(r);
    }
  };

  const save = () =>
    startTransition(async () => {
      if (errors.length) return fail(`저장하기 전에 고쳐 주세요: ${errors[0]}`);
      const res = await saveHouse(p.projectId, { baseRev: p.house.rev, edit: { height: draft.height, walls: draft.walls, openings: draft.openings, labels: draft.labels, fixed: draft.fixed }, items: toRoomEdits(draft.items) });
      if (res.error) fail(res.error);
      else if (res.rev && res.rev !== p.house.rev) router.replace(`/projects/${p.projectId}/house/edit?saved=${res.rev}`);
      else setMsg({ ok: res.ok });
    });

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.key === "Escape") {
        setStart(null);
        setHover(null);
        setSel(null);
        return;
      }
      if (view !== "plan" || readOnly) return;
      const s = e.shiftKey ? 0.5 : 0.05;
      const dir: Record<string, [number, number]> = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, s], ArrowDown: [0, -s] };
      if (dir[e.key] && (curItem || curFixed)) {
        e.preventDefault();
        moveSelected(...dir[e.key]);
      } else if ((e.key === "r" || e.key === "R") && curItem) rotateItem();
      else if (e.key === "Delete" || e.key === "Backspace") {
        if (!sel) return;
        e.preventDefault();
        if (curItem) removeItem();
        else if (curFixed) removeFixed(curFixed.id);
        else if (curOpening) removeOpening(curOpening.id);
        else if (curWall) removeWall(curWall.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ── 평면 덧그림(그리는 중인 벽)
  const Y = (y: number) => D - y;
  const overlay = (
    <g pointerEvents="none">
      {start && (
        <>
          <circle cx={start[0]} cy={Y(start[1])} r={0.12} fill="#147dba" data-testid="wall-start" />
          {hover && <line x1={start[0]} y1={Y(start[1])} x2={hover[0]} y2={Y(hover[1])} stroke="#147dba" strokeWidth={wallT} strokeOpacity={0.6} />}
          {hover && (
            <text x={(start[0] + hover[0]) / 2} y={Y((start[1] + hover[1]) / 2) - 0.2} textAnchor="middle" fontSize={0.28} fill="#147dba" stroke="#fff" strokeWidth={0.06} paintOrder="stroke">
              {mmText(Math.hypot(hover[0] - start[0], hover[1] - start[1]))}
            </text>
          )}
        </>
      )}
      {mode === "wall" &&
        danglingEnds(house).map((d, i) => <circle key={`dg${i}`} cx={d.p[0]} cy={Y(d.p[1])} r={0.1} fill="none" stroke="#f59e0b" strokeWidth={0.04} data-testid="dangling-end" />)}
    </g>
  );
  const zones = mode === "door" || (mode === "furniture" && curItem) ? report.zones : [];

  const panelTitle = (t: string, close = true) => (
    <div className="flex items-start justify-between gap-2">
      <p className="text-sm font-bold">{t}</p>
      {close && (
        <button type="button" className="btn btn-sm shrink-0" onClick={() => setSel(null)}>
          선택 해제
        </button>
      )}
    </div>
  );
  const arrows = (
    <div className="flex items-center gap-3">
      <div className="grid shrink-0 grid-cols-3 gap-1" aria-label="옮기기">
        <span />
        <button type="button" className="btn btn-sm !min-h-10 !w-10 !px-0" aria-label="위로" data-testid="move-up" disabled={readOnly} onClick={() => moveSelected(0, step)}>
          ↑
        </button>
        <span />
        <button type="button" className="btn btn-sm !min-h-10 !w-10 !px-0" aria-label="왼쪽으로" data-testid="move-left" disabled={readOnly} onClick={() => moveSelected(-step, 0)}>
          ←
        </button>
        <button type="button" className="btn btn-sm !min-h-10 !w-10 !px-0" aria-label="아래로" data-testid="move-down" disabled={readOnly} onClick={() => moveSelected(0, -step)}>
          ↓
        </button>
        <button type="button" className="btn btn-sm !min-h-10 !w-10 !px-0" aria-label="오른쪽으로" data-testid="move-right" disabled={readOnly} onClick={() => moveSelected(step, 0)}>
          →
        </button>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-[11px] text-muted">한 번에 옮기는 거리</p>
        <div className="flex flex-wrap gap-1">
          {STEPS.map((s) => (
            <button key={s} type="button" className={`filter-chip !min-h-7 !px-2 !py-0.5 !text-[11px] ${step === s ? "active" : ""}`} aria-pressed={step === s} onClick={() => setStep(s)}>
              {mmText(s)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  let selection: ReactNode = null;
  if (curItem) {
    const f = footprint(curItem);
    const room = det.regions[report.itemRoom[curItem.id]];
    selection = (
      <div className="space-y-3" data-testid="selection" data-kind="item">
        {panelTitle(curItem.label)}
        <p className="text-xs tabular-nums text-muted" data-testid="sel-size">
          바닥 {mmText(f.w)} × {mmText(f.d)} mm · {curItem.rot}° 회전{room ? ` · ${room.display}` : " · 방 밖"}
        </p>
        {!curItem.product && <p className="text-[11px] text-muted">{CONCEPT_FURNITURE_TEXT}</p>}
        <div className="grid grid-cols-3 gap-2">
          <button type="button" className="btn btn-sm" data-testid="rotate" disabled={readOnly} onClick={rotateItem}>
            ↻ 90°
          </button>
          <button type="button" className="btn btn-sm" data-testid="duplicate" disabled={readOnly} onClick={duplicateItem}>
            복제
          </button>
          <button type="button" className="btn btn-sm btn-danger" data-testid="delete" disabled={readOnly} onClick={removeItem}>
            삭제
          </button>
        </div>
        {curItem.product ? <PlacedProductCard product={curItem.product} w={curItem.w} d={curItem.d} projectId={p.projectId} /> : (
        <div className="rounded-lg border border-line p-2" data-testid="size-box">
          <p className="mb-1 text-[11px] font-semibold">크기 (돌리기 전 가로·깊이, mm)</p>
          <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <MmField label="가로" value={curItem.w} testid="size-w" disabled={readOnly} onCommit={(v) => setItemSize("w", v)} />
            <MmField label="깊이" value={curItem.d} testid="size-d" disabled={readOnly} onCommit={(v) => setItemSize("d", v)} />
            <button type="button" className="btn btn-sm" disabled={readOnly} onClick={resetItemSize} data-testid="size-reset">
              대표 규격
            </button>
          </div>
          <p className="mt-1 text-[11px] text-muted">{SIZE_RANGE_TEXT}. 높이는 그대로예요.</p>
        </div>
        )}
        {arrows}
        <div className="grid grid-cols-2 gap-2">
          <MmField label="왼쪽 바깥 벽에서 (mm)" value={f.x} testid="pos-x" disabled={readOnly} onCommit={(v) => setItemPos("x", v)} />
          <MmField label="아래쪽 바깥 벽에서 (mm)" value={f.y} testid="pos-y" disabled={readOnly} onCommit={(v) => setItemPos("y", v)} />
        </div>
        {report.issues
          .filter((i) => i.ids.includes(curItem.id))
          .map((i) => (
            <p key={i.text} className="rounded-lg bg-warn-soft px-3 py-1.5 text-xs text-warn">
              {i.text}
            </p>
          ))}
        {report.notices
          .filter((n) => n.ids.includes(curItem.id))
          .map((n) => (
            <p key={n.text} className="rounded-lg bg-sand px-3 py-1.5 text-xs text-muted">
              편집 참고: {n.text}
            </p>
          ))}
      </div>
    );
  } else if (curFixed) {
    selection = (
      <div className="space-y-3" data-testid="selection" data-kind="fixed">
        {panelTitle(fixedLabel(curFixed))}
        <p className="text-[11px] text-muted">{HOUSE_FIXED_NOTE}</p>
        <div className="grid grid-cols-3 gap-2">
          <MmField label="가로" value={curFixed.w} testid="fixed-w" disabled={readOnly} onCommit={(v) => updateFixed(curFixed.id, (f) => ({ ...f, w: v }))} />
          <MmField label="깊이" value={curFixed.d} testid="fixed-d" disabled={readOnly} onCommit={(v) => updateFixed(curFixed.id, (f) => ({ ...f, d: v }))} />
          <label className="block min-w-0 text-[11px] text-muted">
            높이(비우면 천장)
            <input
              key={`fh-${curFixed.id}-${curFixed.h}`}
              className="input !min-h-9 !py-1.5 text-right tabular-nums"
              inputMode="numeric"
              defaultValue={curFixed.h == null ? "" : Math.round(curFixed.h * 1000)}
              data-testid="fixed-h"
              disabled={readOnly}
              onBlur={(e) => {
                const raw = e.target.value.trim();
                const h = raw === "" ? null : toM(raw);
                if (h === curFixed.h || (h != null && !Number.isFinite(h))) return;
                updateFixed(curFixed.id, (f) => ({ ...f, h: h == null ? null : r3(h) }));
              }}
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <MmField label="왼쪽 바깥 벽에서 (mm)" value={curFixed.x} testid="fixed-x" disabled={readOnly} onCommit={(v) => updateFixed(curFixed.id, (f) => ({ ...f, x: v }))} />
          <MmField label="아래쪽 바깥 벽에서 (mm)" value={curFixed.y} testid="fixed-y" disabled={readOnly} onCommit={(v) => updateFixed(curFixed.id, (f) => ({ ...f, y: v }))} />
        </div>
        {arrows}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn btn-sm" disabled={readOnly} data-testid="fixed-rotate" onClick={() => updateFixed(curFixed.id, (f) => ({ ...f, w: f.d, d: f.w }))}>
            ↻ 가로·깊이 바꾸기
          </button>
          <button type="button" className="btn btn-sm btn-danger" disabled={readOnly} data-testid="fixed-delete" onClick={() => removeFixed(curFixed.id)}>
            삭제
          </button>
        </div>
      </div>
    );
  } else if (curWall) {
    const horizontal = Math.abs(curWall.b[1] - curWall.a[1]) < 1e-9;
    const len = horizontal ? curWall.b[0] - curWall.a[0] : curWall.b[1] - curWall.a[1];
    selection = (
      <div className="space-y-3" data-testid="selection" data-kind="wall">
        {panelTitle(`${wallName(curWall)} · ${horizontal ? "가로" : "세로"} ${mmText(len)}mm`)}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MmField label="시작 x (mm)" value={curWall.a[0]} testid="wall-x" disabled={readOnly} onCommit={(v) => setWallNumbers(curWall, "x", v)} />
          <MmField label="시작 y (mm)" value={curWall.a[1]} testid="wall-y" disabled={readOnly} onCommit={(v) => setWallNumbers(curWall, "y", v)} />
          <MmField label="길이 (mm)" value={len} testid="wall-len" disabled={readOnly} onCommit={(v) => setWallNumbers(curWall, "len", v)} />
          <MmField label="두께 (mm)" value={curWall.t} testid="wall-t" disabled={readOnly} onCommit={(v) => updateWall(curWall.id, (w) => ({ ...w, t: v }))} />
        </div>
        <p className="text-[11px] text-muted">x는 왼쪽 바깥 벽 안쪽에서, y는 아래쪽 바깥 벽 안쪽에서 잰 벽 중심선 위치예요.</p>
        <button type="button" className="btn btn-sm btn-danger" disabled={readOnly} data-testid="wall-delete" onClick={() => removeWall(curWall.id)}>
          이 벽 지우기
        </button>
      </div>
    );
  } else if (curOpening) {
    const spec = OPENINGS[curOpening.kind];
    const line = lineOf(wallLines(house), curOpening.wall);
    selection = (
      <div className="space-y-3" data-testid="selection" data-kind="opening">
        {panelTitle(`${openingName(house, curOpening)} · ${line?.name ?? ""}`)}
        {curOpening.kind !== "window" && (
          <label className="block text-[11px] text-muted">
            종류
            <select
              className="input !min-h-9 !py-1.5"
              value={curOpening.kind}
              disabled={readOnly}
              data-testid="opening-kind"
              onChange={(e) => {
                const kind = e.target.value as OpeningKind;
                updateOpening(curOpening.id, (o) => ({ id: o.id, kind, wall: o.wall, at: o.at, width: o.width, ...(OPENINGS[kind].hinged ? { hinge: o.hinge ?? "a", side: o.side ?? OPENINGS[kind].side } : {}) }));
              }}
            >
              {DOOR_KINDS.filter((k) => !OPENINGS[k].outerOnly || line?.outer).map((k) => (
                <option key={k} value={k}>
                  {OPENINGS[k].label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="grid grid-cols-2 gap-2">
          <MmField label="폭 (mm)" value={curOpening.width} testid="opening-w" disabled={readOnly} onCommit={(v) => updateOpening(curOpening.id, (o) => ({ ...o, width: v }))} />
          <MmField label="벽 시작점에서 (mm)" value={curOpening.at} testid="opening-at" disabled={readOnly} onCommit={(v) => updateOpening(curOpening.id, (o) => ({ ...o, at: v }))} />
        </div>
        <p className="text-[11px] text-muted">
          폭 {mmText(spec.min)}~{mmText(spec.max)}mm. 벽 시작점은 {line && Math.abs(line.dir[0]) > 0.5 ? (line.dir[0] > 0 ? "왼쪽" : "오른쪽") : line && line.dir[1] > 0 ? "아래쪽" : "위쪽"} 끝이에요.
        </p>
        {spec.hinged && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn btn-sm" disabled={readOnly} data-testid="opening-hinge" onClick={() => updateOpening(curOpening.id, (o) => ({ ...o, hinge: o.hinge === "b" ? "a" : "b" }), "경첩을 반대쪽으로 옮겼어요.")}>
              경첩 반대쪽
            </button>
            <button type="button" className="btn btn-sm" disabled={readOnly} data-testid="opening-side" onClick={() => updateOpening(curOpening.id, (o) => ({ ...o, side: o.side === -1 ? 1 : -1 }), "여는 쪽을 바꿨어요.")}>
              여는 쪽 바꾸기
            </button>
          </div>
        )}
        <button type="button" className="btn btn-sm btn-danger" disabled={readOnly} data-testid="opening-delete" onClick={() => removeOpening(curOpening.id)}>
          빼기
        </button>
      </div>
    );
  } else if (curRoom) {
    selection = (
      <div className="space-y-3" data-testid="selection" data-kind="room">
        {panelTitle(`${curRoom.display} · 약 ${areaText(curRoom.area)}`)}
        <div className="flex flex-wrap gap-1.5">
          {ROOM_KINDS.map((k) => (
            <button key={k.kind} type="button" className="filter-chip !min-h-8 !px-3 !py-1 !text-xs" disabled={readOnly} data-testid={`room-preset-${k.kind}`} onClick={() => nameRoom(curRoom, presetName(k.kind, curRoom), k.kind)}>
              {k.kind === "bed" ? presetName("bed", curRoom) : k.label}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            nameRoom(curRoom, roomText);
          }}
        >
          <input className="input !min-h-10" value={roomText} maxLength={20} placeholder="직접 입력 (예: 안방)" onChange={(e) => setRoomText(e.target.value)} data-testid="room-name-input" disabled={readOnly} />
          <button className="btn btn-sm shrink-0" disabled={readOnly} data-testid="room-name-save">
            이 이름으로
          </button>
        </form>
        {curRoom.labelId && (
          <button type="button" className="btn btn-sm btn-danger" disabled={readOnly} data-testid="room-unname" onClick={() => unnameRoom(curRoom)}>
            이름 지우기
          </button>
        )}
        <p className="text-[11px] text-muted">{HOUSE_AREA_NOTE}</p>
      </div>
    );
  }

  const toolPanel = (
    <div className="space-y-2" data-testid={`tool-${mode}`}>
      <p className="text-[11px] leading-relaxed text-muted">{MODES.find((m) => m.key === mode)!.hint}</p>
      {mode === "wall" && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" className={`filter-chip !min-h-8 !px-3 !py-1 !text-xs ${wallSub === "draw" ? "active" : ""}`} aria-pressed={wallSub === "draw"} data-testid="wall-draw" onClick={() => {
                setWallSub("draw");
                setSel(null);
              }}>
              새 벽 그리기
            </button>
            <button type="button" className={`filter-chip !min-h-8 !px-3 !py-1 !text-xs ${wallSub === "pick" ? "active" : ""}`} aria-pressed={wallSub === "pick"} data-testid="wall-pick" onClick={() => {
                setWallSub("pick");
                setStart(null);
              }}>
              벽 고르기·지우기
            </button>
            <span className="ml-1 text-[11px] text-muted">새 벽 두께</span>
            {[0.1, 0.15, 0.2].map((t) => (
              <button key={t} type="button" className={`filter-chip !min-h-8 !px-2.5 !py-1 !text-xs ${wallT === t ? "active" : ""}`} aria-pressed={wallT === t} onClick={() => setWallT(t)}>
                {mmText(t)}
              </button>
            ))}
          </div>
          <details className="rounded-lg border border-line bg-white px-3 py-2 text-xs" data-testid="wall-numbers">
            <summary className="cursor-pointer font-semibold">숫자로 벽 넣기</summary>
            <form
              className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5"
              onSubmit={(e) => {
                e.preventDefault();
                addWallByNumbers(new FormData(e.currentTarget));
              }}
            >
              <label className="text-[11px] text-muted">
                시작 x (mm)
                <input name="wx" className="input !min-h-9 !py-1.5 text-right" inputMode="numeric" data-testid="wn-x" />
              </label>
              <label className="text-[11px] text-muted">
                시작 y (mm)
                <input name="wy" className="input !min-h-9 !py-1.5 text-right" inputMode="numeric" data-testid="wn-y" />
              </label>
              <label className="text-[11px] text-muted">
                방향
                <select name="wd" className="input !min-h-9 !py-1.5" data-testid="wn-dir">
                  <option value="x">가로(오른쪽으로)</option>
                  <option value="y">세로(위쪽으로)</option>
                </select>
              </label>
              <label className="text-[11px] text-muted">
                길이 (mm)
                <input name="wl" className="input !min-h-9 !py-1.5 text-right" inputMode="numeric" data-testid="wn-len" />
              </label>
              <button className="btn btn-sm self-end" disabled={readOnly} data-testid="wn-add">
                벽 넣기
              </button>
            </form>
            <p className="mt-1 text-[11px] text-muted">x는 왼쪽 바깥 벽 안쪽에서, y는 아래쪽 바깥 벽 안쪽에서 잰 벽 중심선 위치예요.</p>
          </details>
        </>
      )}
      {mode === "door" && (
        <div className="flex flex-wrap gap-1.5">
          {DOOR_KINDS.map((k) => (
            <button key={k} type="button" className={`filter-chip !min-h-8 !px-3 !py-1 !text-xs ${doorKind === k ? "active" : ""}`} aria-pressed={doorKind === k} data-testid={`door-kind-${k}`} onClick={() => setDoorKind(k)}>
              {OPENINGS[k].label} {mmText(OPENINGS[k].width)}
            </button>
          ))}
        </div>
      )}
      {mode === "label" && (
        <div className="flex flex-wrap gap-1.5" data-testid="room-chips">
          {rooms.map((r) => (
            <button key={r.idx} type="button" className={`filter-chip !min-h-8 !px-3 !py-1 !text-xs ${curRoom?.idx === r.idx ? "active" : ""}`} onClick={() => pickRoom(r)} data-testid={`room-chip-${r.idx}`}>
              {r.display} · {r.area.toFixed(1)}㎡
            </button>
          ))}
        </div>
      )}
      {mode === "fixed" && (
        <div className="flex flex-wrap gap-1.5">
          {FIXED_ORDER.map((k) => (
            <button key={k} type="button" className={`filter-chip !min-h-8 !px-3 !py-1 !text-xs ${fixedKind === k ? "active" : ""}`} aria-pressed={fixedKind === k} data-testid={`fixed-kind-${k}`} onClick={() => setFixedKind(k)}>
              {FIXED_KINDS[k].label}
            </button>
          ))}
        </div>
      )}
      {mode === "furniture" && (
        <>
          <p className="text-[11px]">
            놓을 방: <b data-testid="target-room">{targetRoom ? targetRoom.display : "가장 넓은 방"}</b> <span className="text-muted">(평면에서 방 바닥을 누르면 바뀌어요)</span>
          </p>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:grid lg:max-h-[176px] lg:grid-cols-3 lg:overflow-y-auto" data-testid="palette">
            {p.catalog.map((t) => (
              <button key={t.type} type="button" className="shrink-0 rounded-xl border border-line bg-white px-3 py-2 text-left text-xs hover:border-brand disabled:opacity-50" data-testid={`add-${t.type}`} disabled={readOnly} onClick={() => addItem(t)}>
                <b className="block">＋ {t.label}</b>
                <span className="hidden text-[11px] text-muted lg:block">{t.desc}</span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted" data-testid="concept-note">
            {CONCEPT_FURNITURE_TEXT}. 크기를 바꿔 실제 가구 치수에 맞춰 볼 수 있어요. {AUTO_LATER_TEXT}
          </p>
          {!!p.products?.length && (
            <>
              <p className="pt-1 text-[11px] font-bold">실제 상품 <span className="font-normal text-muted">· 판매자 규격 그대로, 놓은 뒤 장바구니에 담을 수 있어요</span></p>
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:grid lg:max-h-[200px] lg:grid-cols-2 lg:overflow-y-auto" data-testid="product-palette">
                <ProductPalette products={p.products} onAdd={addItem} disabled={readOnly} compact prefix="add-product-" />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );

  const issueCount = report.issues.length;
  const issueBadge = (
    <span className={`badge ml-1 ${issueCount ? "border-warn/30 bg-warn-soft text-warn" : "text-muted"}`} data-testid="issue-count">
      {issueCount ? `확인할 것 ${issueCount}` : "검사 항목에서 걸린 곳 없음"}
    </span>
  );
  const leaveHref = `/projects/${p.projectId}/house`;

  return (
    <main
      className={`editor ${selection ? "has-selection" : ""}`}
      data-testid="house-editor"
      data-mode={mode}
      data-house={JSON.stringify({
        height: draft.height,
        walls: draft.walls.map((w) => [w.id, w.a[0], w.a[1], w.b[0], w.b[1], w.t]),
        openings: draft.openings.map((o) => [o.id, o.kind, o.wall, o.at, o.width, o.hinge ?? "", o.side ?? 0]),
        labels: draft.labels.map((l) => [l.id, l.name]),
        fixed: draft.fixed.map((f) => [f.id, f.kind, f.x, f.y, f.w, f.d, f.h]),
        items: draft.items.map((it) => [it.id, it.type, it.x, it.y, it.rot, it.w, it.d]),
      })}
      data-rooms={JSON.stringify(rooms.map((r) => [r.display, r.area, r.labelId ?? ""]))}
      data-issues={JSON.stringify(report.issues.map((i) => [i.key, ...i.ids]))}
      data-selected={sel ? `${sel.kind}:${sel.id}` : ""}
    >
      <div className="editor-bar">
        <Link
          href={leaveHref}
          className="btn btn-sm shrink-0"
          onClick={(e) => {
            if (dirty) {
              e.preventDefault();
              setLeaving(true);
            }
          }}
        >
          ← 나가기
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">집 전체 평면</p>
          <p className="truncate text-[11px] text-muted" data-testid="editor-status">
            평면 {p.house.rev} 기준 · {dirty ? "저장하지 않은 변경 있음" : "저장된 평면 그대로"}
          </p>
        </div>
        <button type="button" className="btn btn-sm !px-2.5" aria-label="되돌리기" data-testid="editor-undo" disabled={!past.length || readOnly} onClick={undo}>
          ↶
        </button>
        <button type="button" className="btn btn-sm !px-2.5" aria-label="다시 하기" data-testid="editor-redo" disabled={!future.length || readOnly} onClick={redo}>
          ↷
        </button>
        <button type="button" className="btn btn-primary btn-sm shrink-0" data-testid="editor-save" disabled={!dirty || pending || readOnly} onClick={save}>
          {pending ? "저장 중…" : dirty ? "저장" : "저장됨"}
        </button>
      </div>

      {leaving && (
        <div className="mx-auto mt-3 flex max-w-6xl flex-wrap items-center gap-2 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn" role="alertdialog" data-testid="editor-confirm">
          <span className="flex-1">저장하지 않은 변경이 있어요. 나가면 사라져요.</span>
          <button type="button" className="btn btn-sm" onClick={() => setLeaving(false)}>
            취소
          </button>
          <Link href={leaveHref} className="btn btn-sm btn-primary">
            저장하지 않고 나가기
          </Link>
        </div>
      )}

      <div className="mx-auto grid max-w-6xl gap-4 px-4 pb-6 pt-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-3">
          <p className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-2.5 text-xs leading-relaxed text-warn" data-testid="house-scope">
            <b>{HOUSE_LABEL}</b> · {HOUSE_SCOPE_TEXT}
          </p>
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1" role="group" aria-label="편집 도구">
            {MODES.map((m) => (
              <button key={m.key} type="button" className={`btn btn-sm shrink-0 ${mode === m.key ? "btn-primary" : ""}`} aria-pressed={mode === m.key} data-testid={`mode-${m.key}`} disabled={readOnly && m.key !== mode} onClick={() => setMode(m.key)}>
                {m.label}
              </button>
            ))}
          </div>
          {!readOnly && toolPanel}
          <div className="relative overflow-hidden rounded-2xl border border-line bg-[#fafaf8]">
            <div className="flex flex-wrap items-center gap-1 border-b border-line bg-white p-2">
              <button type="button" className={`btn btn-sm ${view === "plan" ? "btn-primary" : ""}`} aria-pressed={view === "plan"} data-testid="view-plan" onClick={() => setView("plan")}>
                평면
              </button>
              <button type="button" className={`btn btn-sm ${view === "3d" ? "btn-primary" : ""}`} aria-pressed={view === "3d"} data-testid="view-3d" onClick={() => setView("3d")}>
                3D
              </button>
              {view === "plan" && (
                <span className="ml-auto flex items-center gap-1">
                  {p.underlayUrl && house.underlay && (
                    <label className="mr-1 flex items-center gap-1 text-[11px] text-muted">
                      <input type="checkbox" className="accent-brand" checked={under} onChange={(e) => setUnder(e.target.checked)} data-testid="underlay-toggle" /> 밑그림
                    </label>
                  )}
                  {ZOOMS.map((z) => (
                    <button key={z} type="button" className={`btn btn-sm !min-h-8 !px-2 ${zoom === z ? "btn-primary" : ""}`} aria-pressed={zoom === z} data-testid={`zoom-${z}`} onClick={() => setZoom(z)}>
                      {z === 1 ? "전체" : `${z}배`}
                    </button>
                  ))}
                </span>
              )}
            </div>
            {view === "plan" ? (
              <div className="max-h-[72vh] overflow-auto p-2" data-testid="plan-scroll">
                <HousePlan
                  house={house}
                  det={det}
                  report={report}
                  selected={sel}
                  zones={zones}
                  underlayUrl={under ? p.underlayUrl : null}
                  zoom={zoom}
                  interactive
                  overlay={overlay}
                  svgRef={svgRef}
                  svgProps={{
                    onPointerDown: onDown,
                    onPointerMove: onMove,
                    onPointerUp: onUp,
                    onPointerCancel: onUp,
                    onClick,
                    style: { width: `${zoom * 100}%`, touchAction: (mode === "furniture" && curItem) || (mode === "fixed" && curFixed) ? "none" : "manipulation", cursor: mode === "wall" || mode === "door" || mode === "window" ? "crosshair" : "default" },
                  }}
                />
              </div>
            ) : (
              option && (
                <div data-testid="house-3d">
                  <Viewer3D option={option} styleId="natural" className="h-[62vh] min-h-[360px]" />
                </div>
              )
            )}
            <p className="border-t border-line bg-white px-3 py-2 text-[11px] text-muted">
              {view === "plan"
                ? `${readOnly ? "종료된 요청이라 볼 수만 있어요. " : ""}방 이름 아래 숫자는 벽 안쪽 기준 추정 면적이에요. 주황 점선은 문·통로 앞 비워 둘 자리(문 폭 × 깊이 문 폭, 최대 900mm)예요.`
                : `평면과 같은 데이터로 그린 3D예요. 기본은 벽을 낮춰 보여 주고, ‘외벽 전체’를 켜면 내부 벽까지 천장 높이로 보여요. ${HOUSE_LABEL}.`}
            </p>
          </div>
          {msg && (
            <p role={msg.error ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-sm ${msg.error ? "bg-warn-soft text-danger" : "bg-brand-soft text-brand"}`} data-testid="editor-msg">
              {msg.error ?? msg.ok}
            </p>
          )}
        </div>

        <aside className="space-y-4">
          <div className={`editor-sheet ${selection ? "is-open" : ""}`}>{selection || <p className="hidden text-xs text-muted lg:block">벽·문·고정 구조물·가구를 고르면 여기에서 숫자로 고치거나 지울 수 있어요.</p>}</div>
          <section className="card !p-4 space-y-2" aria-label="집 정보" data-testid="house-info">
            <h2 className="text-sm font-bold">집 정보</h2>
            <p className="text-xs text-muted">
              바깥 {mmText(W)} × {mmText(D)} mm · {p.house.provenance?.label ?? (p.house.source === "trace" ? "도면 이미지에서 따라 그림" : "치수로 만듦")}
            </p>
            {p.house.provenance && <ul className="space-y-1 text-xs text-warn" data-testid="editor-provenance">{p.house.provenance.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul>}
            <div className="max-w-[12rem]">
              <MmField
                label="천장 높이 (mm)"
                value={draft.height}
                testid="house-height"
                disabled={readOnly}
                onCommit={(v) => (v >= HEIGHT_MIN - 1e-6 && v <= HEIGHT_MAX + 1e-6 ? change({ ...draft, height: v }, `천장 높이를 ${mmText(v)}mm로 바꿨어요.`) : fail("천장 높이는 2,000~5,000mm로 넣어 주세요."))}
              />
            </div>
          </section>
          <section className="card !p-4" aria-label="방" data-testid="rooms-panel">
            <h2 className="text-sm font-bold">
              방 {rooms.length}개 <span className="text-xs font-normal text-muted">· 벽으로 나뉜 영역</span>
            </h2>
            <ul className="mt-2 space-y-1 text-xs">
              {rooms.map((r) => (
                <li key={r.idx}>
                  <button type="button" className="text-left hover:underline" data-testid={`rooms-panel-${r.idx}`} onClick={() => {
                      setModeState("label");
                      pickRoom(r);
                    }}>
                    <b className={r.name ? "" : "font-normal text-muted"}>{r.display}</b> · 약 {areaText(r.area)}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-muted">{HOUSE_AREA_NOTE}</p>
          </section>
          {(errors.length > 0 || warnings.length > 0) && (
            <section className="card !p-4 text-xs" aria-label="평면 확인" data-testid="house-warnings">
              <h2 className="text-sm font-bold">평면 확인</h2>
              {errors.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-danger" data-testid="house-errors">
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
              {warnings.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-warn">
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              {errors.length > 0 && <p className="mt-2 text-[11px] text-muted">빨간 항목을 고쳐야 저장돼요. 주황 항목은 확인을 권하는 알림이에요.</p>}
            </section>
          )}
          <section className="card !p-4" aria-label="자동 검사" data-testid="checks">
            <h2 className="text-sm font-bold">자동 검사 {issueBadge}</h2>
            <ul className="mt-3 space-y-2 text-xs" data-testid="check-issues">
              {report.results.map((c) => (
                <li key={c.key} data-testid={`check-${c.key}`}>
                  <p className="flex items-center gap-1.5">
                    <span className={`grid size-4 shrink-0 place-items-center rounded-full text-[9px] font-bold ${c.issues.length ? "bg-warn text-white" : "bg-sand text-muted"}`}>{c.issues.length || "✓"}</span>
                    <b className="font-semibold">{c.label}</b>
                  </p>
                  {c.issues.map((i) => (
                    <button
                      key={i.text}
                      type="button"
                      className="ml-5 block text-left text-warn underline-offset-2 hover:underline"
                      onClick={() => {
                        if (!i.ids[0]) return;
                        setModeState("furniture");
                        setSel({ kind: "item", id: i.ids[0] });
                      }}
                    >
                      {i.text}
                    </button>
                  ))}
                </li>
              ))}
            </ul>
            <div className="mt-3 border-t border-line pt-3 text-xs" data-testid="gap-notices">
              <p className="font-semibold">
                {HOUSE_GAP_CHECK.label} <span className="font-normal text-muted">· {report.notices.length}곳</span>
              </p>
              {report.notices.map((n) => (
                <p key={n.text} className="ml-1 text-muted">
                  {n.text}
                </p>
              ))}
              <p className="mt-1 text-[11px] leading-relaxed text-muted">{HOUSE_GAP_CHECK.desc}</p>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted">{HOUSE_CHECK_DISCLAIMER}</p>
            <details className="mt-2 text-[11px] text-muted">
              <summary className="cursor-pointer">검사 기준과 검사하지 않는 것</summary>
              <p className="mt-1">{HOUSE_CHECKS.map((c) => `${c.label}: ${c.desc}`).join(" ")}</p>
              <p className="mt-1">검사하지 않는 것: {HOUSE_NOT_CHECKED.join(" · ")}</p>
            </details>
          </section>
          <section className="card !p-4 text-xs leading-relaxed" aria-label="저장과 업체 전달" data-testid="sent-info">
            <h2 className="mb-2 text-sm font-bold">저장과 업체 전달</h2>
            <p>
              저장할 때마다 평면 버전이 올라가요. 지금은 <b>평면 {p.house.rev}</b>이에요. 방 한 칸 배치는 그대로 남아요.
            </p>
            <p className="mt-1">
              {p.requested
                ? p.sentRev != null
                  ? `업체에 보낸 요청에는 평면 ${p.sentRev}이 들어 있어요. 저장해도 업체 기준은 그대로이고, ‘변경 내용 보내기’를 눌러야 전달돼요.`
                  : "이 평면은 아직 업체에 보낸 요청에 들어 있지 않아요. ‘변경 내용 보내기’를 눌러야 업체가 볼 수 있어요."
                : "아직 공사 요청 전이에요. 요청 없이도 저장해 둘 수 있고, 요청을 보내면 그때의 평면이 함께 전달돼요."}
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}
