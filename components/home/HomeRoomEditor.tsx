"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import PlacedProductCard from "@/components/shop/PlacedProductCard";
import ProductPalette from "@/components/shop/ProductPalette";
import EditorPlan from "@/components/space/EditorPlan";
import { saveRoomLayout } from "@/lib/actions";
import { josa, overlaps, type Box } from "@/lib/space/check";
import {
  AUTO_LATER_TEXT,
  CONCEPT_FURNITURE_TEXT,
  GAP_CHECK,
  ROOM_BADGE,
  ROOM_CHECKS,
  ROOM_CHECK_DISCLAIMER,
  ROOM_NOT_CHECKED,
  ROOM_SCOPE_TEXT,
  SIZE_MAX,
  SIZE_MIN,
  SIZE_RANGE_TEXT,
  composeRoom,
  resizeItem,
  roomDoorZones,
  runRoomChecks,
  toRoomEdits,
} from "@/lib/space/home-room";
import { footprint } from "@/lib/space/placement";
import type { CatalogTemplate, PlacedItem, RoomModel, Rot } from "@/lib/space/types";

const Viewer3D = dynamic(() => import("@/components/Viewer3D"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-muted">3D 화면을 불러오는 중…</div>,
});

const mm = (m: number) => Math.round(m * 1000).toLocaleString("ko-KR");
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const key = (items: PlacedItem[]) => JSON.stringify(items.map((it) => [it.id, it.label, it.x, it.y, it.rot, it.w, it.d]));
const STEPS = [0.01, 0.05, 0.1, 0.5];

export interface HomeRoomEditorProps {
  projectId: number;
  roomId: string;
  name: string;
  rev: number;
  room: RoomModel;
  items: PlacedItem[];
  catalog: CatalogTemplate[];
  /** 업체에 보낸 요청 기록에 들어 있는 이 방의 배치 버전. 보내지 않았으면 null */
  sentRev: number | null;
  /** 요청을 보낸 적이 있는지 */
  requested: boolean;
  readOnly: boolean;
  justSaved: string | null;
  /** 놓을 수 있는 실제 상품(규격 있는 판매 상품) */
  products?: CatalogTemplate[];
  /** 상품 화면의 ‘내 공간에 놓아 보기’로 들어왔을 때 처음에 놓을 상품(product:상품:옵션) */
  initialAdd?: string | null;
}

/** 빈자리 찾기: 다른 가구·고정 구조물·문 앞 자리와 10cm 이상 떨어진 가장 가까운 자리 */
function findSpot(it: PlacedItem, others: PlacedItem[], room: RoomModel, near: { x: number; y: number }) {
  const obstacles: Box[] = [...others.map(footprint), ...room.pillars, ...roomDoorZones(room)];
  const cands: { x: number; y: number }[] = [];
  for (let y = 0.1; y <= room.depth - 0.1; y += 0.1) for (let x = 0.1; x <= room.width - 0.1; x += 0.1) cands.push({ x, y });
  cands.sort((a, b) => Math.hypot(a.x - near.x, a.y - near.y) - Math.hypot(b.x - near.x, b.y - near.y));
  for (const c of cands) {
    const f = footprint({ ...it, x: c.x, y: c.y });
    if (f.x < 0 || f.y < 0 || f.x + f.w > room.width || f.y + f.d > room.depth) continue;
    if (obstacles.some((o) => overlaps(f, o, -0.1))) continue;
    return { x: r3(c.x), y: r3(c.y) };
  }
  return { x: r3(near.x), y: r3(near.y) };
}

/** 방 한 칸 가구 배치 편집. 자동 배치 없이 개념 가구를 직접 놓고, 크기도 바꿀 수 있다. */
export default function HomeRoomEditor(p: HomeRoomEditorProps) {
  const router = useRouter();
  const [items, setItems] = useState<PlacedItem[]>(p.items);
  const [selected, setSelected] = useState<string | null>(null);
  const [past, setPast] = useState<PlacedItem[][]>([]);
  const [future, setFuture] = useState<PlacedItem[][]>([]);
  const [view, setView] = useState<"plan" | "3d">("plan");
  const [zoom, setZoom] = useState(1);
  const [step, setStep] = useState(0.1);
  const [leaving, setLeaving] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(p.justSaved ? { ok: p.justSaved } : null);
  const [pending, startTransition] = useTransition();
  const readOnly = p.readOnly;

  const option = useMemo(() => composeRoom({ room: p.room, items, name: p.name }), [p.room, items, p.name]);
  const report = useMemo(() => runRoomChecks(p.room, items), [p.room, items]);
  const bad = useMemo(() => new Set(report.issues.flatMap((i) => i.ids)), [report]);
  const zones = useMemo(() => roomDoorZones(p.room), [p.room]);
  const dirty = key(items) !== key(p.items);
  const cur = items.find((it) => it.id === selected) ?? null;
  const curFp = cur ? footprint(cur) : null;

  const change = (next: PlacedItem[]) => {
    setPast((h) => [...h.slice(-99), items]);
    setFuture([]);
    setItems(next);
    setMsg(null);
  };
  const patch = (id: string, fn: (it: PlacedItem) => PlacedItem) => change(items.map((it) => (it.id === id ? fn(it) : it)));
  const moveBy = (dx: number, dy: number) => {
    if (!cur || readOnly) return;
    patch(cur.id, (it) => ({ ...it, x: r3(Math.min(p.room.width, Math.max(0, it.x + dx))), y: r3(Math.min(p.room.depth, Math.max(0, it.y + dy))) }));
  };
  const rotate = () => {
    if (!cur || readOnly) return;
    patch(cur.id, (it) => ({ ...it, rot: ((it.rot + 270) % 360) as Rot }));
  };
  const nextId = () => `n${Math.max(0, ...items.map((it) => Number(it.id.match(/^n(\d+)$/)?.[1] ?? 0))) + 1}`;
  const place = (it: PlacedItem, near: { x: number; y: number }) => {
    const placed = { ...it, ...findSpot(it, items, p.room, near) };
    change([...items, placed]);
    setSelected(placed.id);
    setView("plan");
    setMsg({ ok: `${josa(placed.label, "을", "를")} 빈자리에 놓았어요. 끌거나 화살표로 옮기세요.` });
  };
  const add = (t: CatalogTemplate) => {
    if (readOnly) return;
    place({ id: nextId(), type: t.type, label: t.label, x: 0, y: 0, rot: 0, w: t.w, d: t.d, parts: t.parts, bom: t.bom, origin: "added", src: `catalog:${t.type}`, ...(t.product ? { product: t.product } : {}) }, { x: p.room.width / 2, y: p.room.depth / 2 });
  };
  // 상품 화면의 ‘내 공간에 놓아 보기’: 처음 한 번 그 상품을 빈자리에 놓는다.
  const added = useRef(false);
  useEffect(() => {
    if (added.current || !p.initialAdd || readOnly) return;
    added.current = true;
    const t = p.products?.find((x) => x.type === p.initialAdd);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 들어올 때 한 번만 놓는다
    if (t) add(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const duplicate = () => {
    if (!cur || readOnly) return;
    place({ ...cur, id: nextId() }, { x: cur.x + 0.4, y: cur.y });
  };
  const remove = () => {
    if (!cur || readOnly) return;
    change(items.filter((it) => it.id !== cur.id));
    setMsg({ ok: `${josa(cur.label, "을", "를")} 뺐어요. 되돌리기로 살릴 수 있어요.` });
    setSelected(null);
  };
  const undo = () => {
    const last = past.at(-1);
    if (!last) return;
    setFuture((f) => [...f, items]);
    setPast((h) => h.slice(0, -1));
    setItems(last);
    if (selected && !last.some((it) => it.id === selected)) setSelected(null);
  };
  const redo = () => {
    const next = future.at(-1);
    if (!next) return;
    setPast((h) => [...h, items]);
    setFuture((f) => f.slice(0, -1));
    setItems(next);
  };
  const setPos = (axis: "x" | "y", value: string) => {
    if (!cur || !curFp || readOnly) return;
    const v = Number(value.replaceAll(",", "")) / 1000;
    if (!Number.isFinite(v)) return;
    if (axis === "x") patch(cur.id, (it) => ({ ...it, x: r3(Math.min(p.room.width, Math.max(0, v + curFp.w / 2))) }));
    else patch(cur.id, (it) => ({ ...it, y: r3(Math.min(p.room.depth, Math.max(0, v + curFp.d / 2))) }));
  };
  /** 크기 바꾸기: 가구 자체의 가로·깊이(돌리기 전 기준). 부품을 비율대로 늘리거나 줄인다. */
  const setSize = (axis: "w" | "d", value: string) => {
    if (!cur || readOnly) return;
    const v = Number(value.replaceAll(",", "")) / 1000;
    if (!Number.isFinite(v)) return;
    if (v < SIZE_MIN - 1e-6 || v > SIZE_MAX + 1e-6) {
      setMsg({ error: `가구 크기는 ${SIZE_RANGE_TEXT}예요.` });
      return;
    }
    const tpl = p.catalog.find((c) => c.type === cur.type);
    if (!tpl || cur.product) return;
    const w = axis === "w" ? r3(v) : cur.w;
    const d = axis === "d" ? r3(v) : cur.d;
    if (Math.abs(w - cur.w) < 0.0005 && Math.abs(d - cur.d) < 0.0005) return;
    // 늘 대표 규격에서 다시 늘려 부품 비율이 누적해서 틀어지지 않게 한다.
    const sized = resizeItem({ w: tpl.w, d: tpl.d, parts: tpl.parts, bom: tpl.bom }, w, d);
    patch(cur.id, (it) => ({ ...it, w: sized.w, d: sized.d, parts: sized.parts, bom: sized.bom }));
    setMsg({ ok: `${cur.label} 크기를 ${mm(w)} × ${mm(d)}mm로 바꿨어요. 평면·3D·검사에 같은 크기가 쓰여요.` });
  };
  const resetSize = () => {
    if (!cur || readOnly) return;
    const tpl = p.catalog.find((c) => c.type === cur.type);
    if (!tpl) return;
    patch(cur.id, (it) => ({ ...it, w: tpl.w, d: tpl.d, parts: tpl.parts, bom: tpl.bom }));
  };

  const save = () =>
    startTransition(async () => {
      const res = await saveRoomLayout(p.projectId, p.roomId, { edits: toRoomEdits(items) });
      if (res.error) setMsg({ error: res.error });
      else if (res.rev && res.rev !== p.rev) router.replace(`/projects/${p.projectId}/rooms/${p.roomId}?saved=${res.rev}`);
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
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (!cur || view !== "plan") return;
      const s = e.shiftKey ? 0.5 : 0.05;
      const dir: Record<string, [number, number]> = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, s], ArrowDown: [0, -s] };
      if (dir[e.key]) {
        e.preventDefault();
        moveBy(...dir[e.key]);
      } else if (e.key === "r" || e.key === "R") rotate();
      else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        remove();
      } else if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const leaveHref = `/projects/${p.projectId}/plan`;
  const issueCount = report.issues.length;

  const selection = cur && curFp && (
    <div className="space-y-3" data-testid="selection">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold">{cur.label}</p>
          <p className="text-xs tabular-nums text-muted" data-testid="sel-size">
            바닥 {mm(curFp.w)} × {mm(curFp.d)} mm · {cur.rot}° 회전
          </p>
          {!cur.product && <p className="text-[11px] text-muted">{CONCEPT_FURNITURE_TEXT}</p>}
        </div>
        <button type="button" className="btn btn-sm shrink-0" onClick={() => setSelected(null)}>
          선택 해제
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button type="button" className="btn btn-sm" data-testid="rotate" disabled={readOnly} onClick={rotate}>
          ↻ 90° 돌리기
        </button>
        <button type="button" className="btn btn-sm" data-testid="duplicate" disabled={readOnly} onClick={duplicate}>
          복제
        </button>
        <button type="button" className="btn btn-sm btn-danger" data-testid="delete" disabled={readOnly} onClick={remove}>
          삭제
        </button>
      </div>
      {cur.product ? (
        <PlacedProductCard product={cur.product} w={cur.w} d={cur.d} projectId={p.projectId} />
      ) : (
      <div className="rounded-lg border border-line p-2" data-testid="size-box">
        <p className="mb-1 text-[11px] font-semibold">크기 (돌리기 전 가로·깊이, mm)</p>
        <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
          <label className="text-[11px] text-muted">
            가로
            <input key={`w${cur.id}${cur.w}`} className="input !min-h-9 !py-1.5 text-right tabular-nums" inputMode="numeric" defaultValue={Math.round(cur.w * 1000)} data-testid="size-w" disabled={readOnly} onBlur={(e) => setSize("w", e.target.value)} onKeyDown={(e) => e.key === "Enter" && setSize("w", (e.target as HTMLInputElement).value)} />
          </label>
          <label className="text-[11px] text-muted">
            깊이
            <input key={`d${cur.id}${cur.d}`} className="input !min-h-9 !py-1.5 text-right tabular-nums" inputMode="numeric" defaultValue={Math.round(cur.d * 1000)} data-testid="size-d" disabled={readOnly} onBlur={(e) => setSize("d", e.target.value)} onKeyDown={(e) => e.key === "Enter" && setSize("d", (e.target as HTMLInputElement).value)} />
          </label>
          <button type="button" className="btn btn-sm" disabled={readOnly} onClick={resetSize} data-testid="size-reset">
            대표 규격
          </button>
        </div>
        <p className="mt-1 text-[11px] text-muted">{SIZE_RANGE_TEXT}. 높이는 그대로예요.</p>
      </div>
      )}
      <div className="flex items-center gap-3">
        <div className="grid shrink-0 grid-cols-3 gap-1" aria-label="옮기기">
          <span />
          <button type="button" className="btn btn-sm !min-h-10 !w-10 !px-0" aria-label="안쪽으로" data-testid="move-up" disabled={readOnly} onClick={() => moveBy(0, step)}>
            ↑
          </button>
          <span />
          <button type="button" className="btn btn-sm !min-h-10 !w-10 !px-0" aria-label="왼쪽으로" data-testid="move-left" disabled={readOnly} onClick={() => moveBy(-step, 0)}>
            ←
          </button>
          <button type="button" className="btn btn-sm !min-h-10 !w-10 !px-0" aria-label="앞쪽으로" data-testid="move-down" disabled={readOnly} onClick={() => moveBy(0, -step)}>
            ↓
          </button>
          <button type="button" className="btn btn-sm !min-h-10 !w-10 !px-0" aria-label="오른쪽으로" data-testid="move-right" disabled={readOnly} onClick={() => moveBy(step, 0)}>
            →
          </button>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-[11px] text-muted">한 번에 옮기는 거리</p>
          <div className="flex flex-wrap gap-1">
            {STEPS.map((s) => (
              <button key={s} type="button" className={`filter-chip !min-h-7 !px-2 !py-0.5 !text-[11px] ${step === s ? "active" : ""}`} aria-pressed={step === s} onClick={() => setStep(s)}>
                {mm(s)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-muted">
          왼쪽 벽에서 (mm)
          <input key={`x${cur.id}${curFp.x}`} className="input !min-h-9 !py-1.5 text-right tabular-nums" inputMode="numeric" defaultValue={Math.round(curFp.x * 1000)} data-testid="pos-x" disabled={readOnly} onBlur={(e) => setPos("x", e.target.value)} onKeyDown={(e) => e.key === "Enter" && setPos("x", (e.target as HTMLInputElement).value)} />
        </label>
        <label className="text-[11px] text-muted">
          앞벽(방문 벽)에서 (mm)
          <input key={`y${cur.id}${curFp.y}`} className="input !min-h-9 !py-1.5 text-right tabular-nums" inputMode="numeric" defaultValue={Math.round(curFp.y * 1000)} data-testid="pos-y" disabled={readOnly} onBlur={(e) => setPos("y", e.target.value)} onKeyDown={(e) => e.key === "Enter" && setPos("y", (e.target as HTMLInputElement).value)} />
        </label>
      </div>
      {report.issues
        .filter((i) => i.ids.includes(cur.id))
        .map((i) => (
          <p key={i.text} className="rounded-lg bg-warn-soft px-3 py-1.5 text-xs text-warn">
            {i.text}
          </p>
        ))}
      {report.notices
        .filter((n) => n.ids.includes(cur.id))
        .map((n) => (
          <p key={n.text} className="rounded-lg bg-sand px-3 py-1.5 text-xs text-muted">
            편집 참고: {n.text}
          </p>
        ))}
    </div>
  );

  const issueBadge = (
    <span className={`badge ml-1 ${issueCount ? "border-warn/30 bg-warn-soft text-warn" : "text-muted"}`} data-testid="issue-count">
      {issueCount ? `확인할 것 ${issueCount}` : "검사 항목에서 걸린 곳 없음"}
    </span>
  );
  const checkBody = (
    <>
      <ul className="mt-3 space-y-2 text-xs" data-testid="check-issues">
        {report.results.map((c) => (
          <li key={c.key} data-testid={`check-${c.key}`}>
            <p className="flex items-center gap-1.5">
              <span className={`grid size-4 shrink-0 place-items-center rounded-full text-[9px] font-bold ${c.issues.length ? "bg-warn text-white" : "bg-sand text-muted"}`}>{c.issues.length || "✓"}</span>
              <b className="font-semibold">{c.label}</b>
            </p>
            {c.issues.map((i) => (
              <button key={i.text} type="button" className="ml-5 block text-left text-warn underline-offset-2 hover:underline" onClick={() => i.ids[0] && setSelected(i.ids[0])}>
                {i.text}
              </button>
            ))}
          </li>
        ))}
      </ul>
      <div className="mt-3 border-t border-line pt-3 text-xs" data-testid="gap-notices">
        <p className="font-semibold">
          {GAP_CHECK.label} <span className="font-normal text-muted">· {report.notices.length}곳</span>
        </p>
        {report.notices.map((n) => (
          <button key={n.text} type="button" className="ml-1 block text-left text-muted underline-offset-2 hover:underline" onClick={() => setSelected(n.ids[0])}>
            {n.text}
          </button>
        ))}
        <p className="mt-1 text-[11px] leading-relaxed text-muted">{GAP_CHECK.desc}</p>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted">{ROOM_CHECK_DISCLAIMER}</p>
      <details className="mt-2 text-[11px] text-muted">
        <summary className="cursor-pointer">검사 기준과 검사하지 않는 것</summary>
        <p className="mt-1">{ROOM_CHECKS.map((c) => `${c.label}: ${c.desc}`).join(" ")}</p>
        <p className="mt-1">검사하지 않는 것: {ROOM_NOT_CHECKED.join(" · ")}</p>
      </details>
    </>
  );
  const savedInfo = (
    <div className="space-y-2" data-testid="sent-info">
      <p>
        저장할 때마다 이 방의 배치 버전이 올라가요. 지금은 <b>배치 {p.rev}</b>이에요. 다른 방은 영향을 받지 않아요.
      </p>
      <p>
        {p.requested
          ? p.sentRev != null
            ? `업체에 보낸 요청에는 이 방의 배치 ${p.sentRev}이 들어 있어요. 저장해도 업체 기준은 그대로이고, ‘변경 내용 보내기’를 눌러야 전달돼요.`
            : "이 방은 아직 업체에 보낸 요청에 들어 있지 않아요. ‘변경 내용 보내기’를 눌러야 업체가 볼 수 있어요."
          : "아직 상담 요청 전이에요. 요청을 보내면 그때의 방 배치가 함께 전달돼요."}
      </p>
    </div>
  );
  const palette = (prefix: string, compact: boolean) =>
    p.catalog.map((t) => (
      <button
        key={t.type}
        type="button"
        className={compact ? "shrink-0 rounded-xl border border-line bg-white px-3 py-2 text-left text-xs font-semibold hover:border-brand disabled:opacity-50" : "rounded-xl border border-line bg-white px-3 py-2 text-left text-xs hover:border-brand disabled:opacity-50"}
        data-testid={`${prefix}${t.type}`}
        disabled={readOnly}
        onClick={() => add(t)}
      >
        <b className="block">＋ {t.label}</b>
        {!compact && <span className="text-[11px] text-muted">{t.desc}</span>}
      </button>
    ));

  return (
    <main className={`editor ${cur ? "has-selection" : ""}`} data-room-items={JSON.stringify(items.map((it) => [it.id, it.type, it.x, it.y, it.rot, it.w, it.d]))} data-selected={selected ?? ""}>
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
          <p className="truncate text-sm font-bold">{p.name} · 방 한 칸 가구 배치</p>
          <p className="truncate text-[11px] text-muted" data-testid="editor-status">
            배치 {p.rev} 기준 · {dirty ? "저장하지 않은 변경 있음" : "저장된 배치 그대로"}
          </p>
        </div>
        <div className="hidden gap-1 sm:flex" role="group" aria-label="보기">
          <button type="button" className={`btn btn-sm ${view === "plan" ? "btn-primary" : ""}`} aria-pressed={view === "plan"} data-testid="view-plan" onClick={() => setView("plan")}>
            평면에서 고치기
          </button>
          <button type="button" className={`btn btn-sm ${view === "3d" ? "btn-primary" : ""}`} aria-pressed={view === "3d"} data-testid="view-3d" onClick={() => setView("3d")}>
            3D로 보기
          </button>
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
          <p className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-2.5 text-xs leading-relaxed text-warn" data-testid="room-scope">
            <b>{ROOM_BADGE}</b> · {ROOM_SCOPE_TEXT} {AUTO_LATER_TEXT}
          </p>
          <div className="flex gap-1 sm:hidden" role="group" aria-label="보기">
            <button type="button" className={`btn btn-sm flex-1 ${view === "plan" ? "btn-primary" : ""}`} aria-pressed={view === "plan"} data-testid="view-plan-m" onClick={() => setView("plan")}>
              평면에서 고치기
            </button>
            <button type="button" className={`btn btn-sm flex-1 ${view === "3d" ? "btn-primary" : ""}`} aria-pressed={view === "3d"} data-testid="view-3d-m" onClick={() => setView("3d")}>
              3D로 보기
            </button>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-line bg-[#fafaf8]">
            {view === "plan" ? (
              <>
                <div className="max-h-[72vh] overflow-auto p-2" data-testid="plan-scroll">
                  <EditorPlan
                    option={option}
                    items={items}
                    selected={selected}
                    bad={bad}
                    zoom={zoom}
                    readOnly={readOnly}
                    zones={zones}
                    onSelect={setSelected}
                    onMoveStart={() => {
                      setPast((h) => [...h.slice(-99), items]);
                      setFuture([]);
                    }}
                    onMove={(id, x, y) => setItems((list) => list.map((it) => (it.id === id ? { ...it, x, y } : it)))}
                  />
                </div>
                <div className="absolute right-2 top-2 flex gap-1">
                  {[1, 1.6, 2.4].map((z) => (
                    <button key={z} type="button" className={`btn btn-sm !min-h-8 !px-2 ${zoom === z ? "btn-primary" : ""}`} aria-pressed={zoom === z} onClick={() => setZoom(z)}>
                      {z === 1 ? "전체" : `${z}배`}
                    </button>
                  ))}
                </div>
                <p className="border-t border-line bg-white px-3 py-2 text-[11px] text-muted">
                  {readOnly ? "종료된 요청이라 볼 수만 있어요." : "가구를 눌러 고르고 끌어서 옮기세요. 휴대폰은 고른 가구를 다시 눌러 끌거나 아래 화살표를 쓰세요."} 가구를 고르면 주황 점선으로 문 앞 비워 둘 자리(문 폭 × 깊이 문 폭, 최대 900mm)가 보여요.
                </p>
              </>
            ) : (
              <>
                <Viewer3D option={option} styleId="natural" className="h-[62vh] min-h-[360px]" />
                <p className="border-t border-line bg-white px-3 py-2 text-[11px] text-muted">평면과 같은 데이터로 그린 방 한 칸 3D예요. 집 전체가 아니며 욕실·주방 설비와 다른 방은 없어요.</p>
              </>
            )}
          </div>
          {msg && (
            <p role={msg.error ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-sm ${msg.error ? "bg-warn-soft text-danger" : "bg-brand-soft text-brand"}`} data-testid="editor-msg">
              {msg.error ?? msg.ok}
            </p>
          )}
          <section className="space-y-2 lg:hidden" aria-label="가구 추가" data-testid="add-bar-m">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold">가구 추가</h2>
              <span className="text-[11px] text-muted">빈자리에 놓여요 · 개념 가구</span>
            </div>
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">{palette("add-m-", true)}</div>
            {!!p.products?.length && (
              <>
                <h3 className="pt-1 text-xs font-bold">실제 상품 <span className="font-normal text-muted">· 판매자 규격 그대로</span></h3>
                <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1"><ProductPalette products={p.products} onAdd={add} disabled={readOnly} compact prefix="add-m-product-" /></div>
              </>
            )}
          </section>
          <details className="card !p-4 lg:hidden" data-testid="checks-m">
            <summary className="cursor-pointer text-sm font-bold">
              자동 검사 {issueBadge}
            </summary>
            {checkBody}
          </details>
          <details className="card !p-4 text-xs leading-relaxed lg:hidden" data-testid="save-info-m">
            <summary className="cursor-pointer text-sm font-bold">저장과 업체 전달</summary>
            <div className="mt-2">{savedInfo}</div>
          </details>
        </div>

        <aside className="space-y-4">
          <div className={`editor-sheet ${cur ? "is-open" : ""}`}>{selection || <p className="hidden text-xs text-muted lg:block">가구를 누르면 여기에서 위치·크기를 숫자로 넣거나, 돌리기·복제·삭제할 수 있어요.</p>}</div>
          <section className="card !p-4 hidden lg:block" aria-label="가구 추가">
            <h2 className="text-sm font-bold">가구 추가</h2>
            <div className="mt-2 grid max-h-[340px] grid-cols-2 gap-1.5 overflow-y-auto">{palette("add-", false)}</div>
            <p className="mt-2 text-[11px] text-muted" data-testid="concept-note">
              {CONCEPT_FURNITURE_TEXT}. 크기를 바꿔 실제 가구 치수에 맞춰 볼 수 있어요.
            </p>
          </section>
          <section className="card !p-4 hidden lg:block" aria-label="실제 상품 놓기" data-testid="product-palette">
            <h2 className="text-sm font-bold">실제 상품 놓기</h2>
            <p className="mt-1 text-[11px] text-muted">쇼핑에서 규격이 등록된 상품이에요. 판매자 규격 그대로 놓이고, 놓은 상품은 바로 장바구니에 담을 수 있어요.</p>
            <div className="mt-2 grid max-h-[300px] gap-1.5 overflow-y-auto"><ProductPalette products={p.products ?? []} onAdd={add} disabled={readOnly} /></div>
          </section>
          <section className="card !p-4 hidden lg:block" aria-label="자동 검사" data-testid="checks">
            <h2 className="text-sm font-bold">자동 검사 {issueBadge}</h2>
            {checkBody}
          </section>
          <section className="card !p-4 hidden text-xs leading-relaxed lg:block" aria-label="저장과 업체 전달">
            <h2 className="mb-2 text-sm font-bold">저장과 업체 전달</h2>
            {savedInfo}
          </section>
        </aside>
      </div>
    </main>
  );
}
