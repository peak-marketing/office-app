"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import PlacedProductCard from "../shop/PlacedProductCard";
import ProductPalette from "../shop/ProductPalette";
import { saveLayout } from "@/lib/actions";
import type { LayoutOption } from "@/lib/layout/types";
import { CHECKS, CHECK_DISCLAIMER, NOT_CHECKED, doorZones, josa, overlaps, type Box } from "@/lib/space/check";
import { FIXTURE_TEXT, shellGeometry } from "@/lib/space/draw";
import { checkOption, composeOption, diffPlacement, footprint, isFixed, placementFromOption, toEdits } from "@/lib/space/placement";
import type { CatalogTemplate, PlacedItem, RoomModel, Rot } from "@/lib/space/types";
import EditorPlan from "./EditorPlan";

const Viewer3D = dynamic(() => import("../Viewer3D"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-muted">3D 화면을 불러오는 중…</div>,
});

const mm = (m: number) => Math.round(m * 1000).toLocaleString("ko-KR");
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const key = (items: PlacedItem[]) => JSON.stringify(items.map((it) => [it.id, it.label, it.x, it.y, it.rot, it.fixture ?? ""]));
const STEPS = [0.01, 0.05, 0.1, 0.5];

export interface EditorProps {
  projectId: number;
  version: { id: number; no: number; source: string };
  title: string;
  room: RoomModel;
  staff: number;
  start: string;
  options: LayoutOption[];
  recommended: string | null;
  /** 만들지 못한 자동 배치와 이유 */
  skipped: { title: string; reason: string }[];
  /** 자동 배치가 하나도 없는 이유 */
  noAuto: string[];
  items: PlacedItem[];
  catalog: CatalogTemplate[];
  styleId: string;
  /** 업체에 마지막으로 보낸 배치 */
  sent: { no: number; rev: number } | null;
  readOnly: boolean;
  justSaved: string | null;
  /** 도면 밑그림 이미지 주소(따라 그린 공간) */
  underlayUrl?: string | null;
  /** 놓을 수 있는 실제 상품(규격 있는 판매 상품) */
  products?: CatalogTemplate[];
  /** 상품 화면의 ‘내 공간에 놓아 보기’로 들어왔을 때 처음에 놓을 상품 */
  initialAdd?: string | null;
}

/** 빈자리 찾기: 다른 가구·칸막이·기둥·문 앞 여유와 10cm 이상 떨어진 가장 가까운 자리 */
function findSpot(it: PlacedItem, others: PlacedItem[], option: LayoutOption, near: { x: number; y: number }) {
  const obstacles: Box[] = [
    ...others.map(footprint),
    ...option.objects.filter((o) => o.plan && (o.kind === "partition" || o.kind === "glass" || o.kind === "pillar")),
    ...doorZones({ doors: option.marks.doors, entrance: option.marks.entrance }),
    // 꺾인 공간: 바깥 사각형 안의 빈 칸(공간 아닌 곳)에는 놓지 않는다.
    ...shellGeometry(option).voids,
  ];
  const cands: { x: number; y: number }[] = [];
  for (let y = 0.25; y <= option.D - 0.25; y += 0.25) for (let x = 0.25; x <= option.W - 0.25; x += 0.25) cands.push({ x, y });
  cands.sort((a, b) => Math.hypot(a.x - near.x, a.y - near.y) - Math.hypot(b.x - near.x, b.y - near.y));
  for (const c of cands) {
    const f = footprint({ ...it, x: c.x, y: c.y });
    if (f.x < 0.02 || f.y < 0.02 || f.x + f.w > option.W - 0.02 || f.y + f.d > option.D - 0.02) continue;
    if (obstacles.some((o) => overlaps(f, o, -0.1))) continue;
    return { x: r3(c.x), y: r3(c.y) };
  }
  return { x: r3(near.x), y: r3(near.y) };
}

export default function LayoutEditor(p: EditorProps) {
  const router = useRouter();
  const [start, setStart] = useState(p.start);
  const [items, setItems] = useState<PlacedItem[]>(p.items);
  const [selected, setSelected] = useState<string | null>(null);
  const [past, setPast] = useState<{ start: string; items: PlacedItem[] }[]>([]);
  const [future, setFuture] = useState<{ start: string; items: PlacedItem[] }[]>([]);
  const [view, setView] = useState<"plan" | "3d">("plan");
  const [zoom, setZoom] = useState(1);
  const [step, setStep] = useState(0.1);
  const [ask, setAsk] = useState<{ kind: "start"; id: string } | { kind: "leave" } | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(p.justSaved ? { ok: p.justSaved } : null);
  const [showUnderlay, setShowUnderlay] = useState(true);
  const [pending, startTransition] = useTransition();

  const optionOf = useCallback((id: string) => p.options.find((o) => o.id === id) ?? null, [p.options]);
  const autoItems = useCallback((id: string) => {
    const o = optionOf(id);
    return o ? (placementFromOption(o)?.items ?? []) : [];
  }, [optionOf]);
  const base = useMemo(() => optionOf(start), [optionOf, start]);
  const option = useMemo(() => composeOption(p.room, base, items), [p.room, base, items]);
  const report = useMemo(() => checkOption(option, p.staff), [option, p.staff]);
  const bad = useMemo(() => new Set(report.issues.flatMap((i) => i.ids)), [report]);
  const dirty = start !== p.start || key(items) !== key(p.items);
  // 시작 배치를 바꿀 때 물어볼지: 지금 시작 배치에서 손으로 고친 것이 있을 때만
  const edited = useMemo(() => key(items) !== key(autoItems(start)), [items, start, autoItems]);
  const diff = useMemo(() => diffPlacement(start === p.start ? p.items : autoItems(start), items), [start, p.start, p.items, items, autoItems]);
  const cur = items.find((it) => it.id === selected) ?? null;
  const curFp = cur ? footprint(cur) : null;
  const readOnly = p.readOnly;
  // 고객이 실제 설비 위치로 확인한 것은 옮기지 않는다.
  const fixed = !!cur && isFixed(cur);

  const record = () => {
    setPast((h) => [...h.slice(-99), { start, items }]);
    setFuture([]);
  };
  const change = (next: PlacedItem[]) => {
    record();
    setItems(next);
    setMsg(null);
  };
  const patch = (id: string, fn: (it: PlacedItem) => PlacedItem) => change(items.map((it) => (it.id === id ? fn(it) : it)));

  const moveBy = (dx: number, dy: number) => {
    if (!cur || fixed || readOnly) return;
    patch(cur.id, (it) => ({ ...it, x: r3(Math.min(p.room.width, Math.max(0, it.x + dx))), y: r3(Math.min(p.room.depth, Math.max(0, it.y + dy))) }));
  };
  const rotate = () => {
    if (!cur || fixed || readOnly) return;
    patch(cur.id, (it) => ({ ...it, rot: ((it.rot + 270) % 360) as Rot }));
  };
  const nextId = () => `n${Math.max(0, ...items.map((it) => Number(it.id.match(/^n(\d+)$/)?.[1] ?? 0))) + 1}`;
  const nextDesk = () => Math.max(0, ...items.filter((it) => it.seat).map((it) => Number(it.label.match(/\d+/)?.[0] ?? 0))) + 1;
  const place = (it: PlacedItem, near: { x: number; y: number }) => {
    const spot = findSpot(it, items, option, near);
    const placed = { ...it, ...spot };
    change([...items, placed]);
    setSelected(placed.id);
    setView("plan");
    setMsg({ ok: `${josa(placed.label, "을", "를")} 빈자리에 놓았어요. 끌거나 화살표로 옮기세요.` });
  };
  const duplicate = () => {
    if (!cur || cur.fixture || readOnly) return;
    place({ ...cur, id: nextId(), src: cur.src ?? cur.id, origin: "added", label: cur.seat ? `업무석 ${nextDesk()}` : cur.label }, { x: cur.x + 0.4, y: cur.y });
  };
  const add = (t: CatalogTemplate) => {
    if (readOnly) return;
    place(
      { id: nextId(), type: t.type, label: t.seat ? `업무석 ${nextDesk()}` : t.label, x: 0, y: 0, rot: 0, w: t.w, d: t.d, parts: t.parts, bom: t.bom, ...(t.seat ? { seat: true } : {}), ...(t.product ? { product: t.product } : {}), origin: "added", src: `catalog:${t.type}` },
      { x: p.room.width / 2, y: p.room.depth / 2 },
    );
  };
  // 상품 화면의 ‘내 공간에 놓아 보기’: 처음 한 번 그 상품을 빈자리에 놓는다.
  const autoAdded = useRef(false);
  useEffect(() => {
    if (autoAdded.current || !p.initialAdd || readOnly) return;
    autoAdded.current = true;
    const t = p.products?.find((x) => x.type === p.initialAdd);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 들어올 때 한 번만 놓는다
    if (t) add(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const remove = () => {
    if (!cur || fixed || readOnly) return;
    change(items.filter((it) => it.id !== cur.id));
    setMsg({ ok: `${josa(cur.label, "을", "를")} 뺐어요. 되돌리기로 살릴 수 있어요.` });
    setSelected(null);
  };
  const undo = () => {
    const last = past.at(-1);
    if (!last) return;
    setFuture((f) => [...f, { start, items }]);
    setPast((h) => h.slice(0, -1));
    setStart(last.start);
    setItems(last.items);
    if (selected && !last.items.some((it) => it.id === selected)) setSelected(null);
  };
  const redo = () => {
    const next = future.at(-1);
    if (!next) return;
    setPast((h) => [...h, { start, items }]);
    setFuture((f) => f.slice(0, -1));
    setStart(next.start);
    setItems(next.items);
  };
  const switchStart = (id: string) => {
    record();
    setStart(id);
    setItems(autoItems(id));
    setSelected(null);
    setAsk(null);
    setMsg({ ok: id ? `‘${optionOf(id)?.title}’에서 다시 시작했어요. 저장하기 전까지는 바뀌지 않아요.` : "빈 공간에서 시작했어요. 아래 ‘가구 추가’로 놓아 보세요." });
  };
  const setPos = (axis: "x" | "y", value: string) => {
    if (!cur || !curFp || fixed || readOnly) return;
    const v = Number(value.replaceAll(",", "")) / 1000;
    if (!Number.isFinite(v)) return;
    if (axis === "x") patch(cur.id, (it) => ({ ...it, x: r3(Math.min(p.room.width, Math.max(0, v + curFp.w / 2))) }));
    else patch(cur.id, (it) => ({ ...it, y: r3(Math.min(p.room.depth, Math.max(0, v + curFp.d / 2))) }));
  };

  const setFixture = (status: "proposed" | "confirmed") => {
    if (!cur || !cur.fixture || readOnly) return;
    patch(cur.id, (it) => ({ ...it, fixture: status }));
    setMsg({ ok: status === "confirmed" ? `${josa(cur.label, "을", "를")} ‘고객이 확인한 설비 위치’로 표시했어요. 이제 옮기지 않아요. 업체가 현장에서 다시 확인해요.` : `${cur.label}의 확인을 풀었어요. 다시 자동 제안 위치로 표시돼요.` });
  };

  const save = () =>
    startTransition(async () => {
      const res = await saveLayout(p.projectId, { baseVersionId: p.version.id, start, edits: toEdits(items) });
      if (res.error) setMsg({ error: res.error });
      else if (res.versionId && res.versionId !== p.version.id) router.replace(`/projects/${p.projectId}/editor?v=${res.versionId}&saved=${res.no}`);
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
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

  const issueCount = report.issues.length;
  const leaveHref = `/projects/${p.projectId}/plan`;

  const startChips = (
    <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="시작 배치">
      {p.options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`filter-chip !min-h-9 !px-3 !py-1.5 !text-xs ${start === o.id ? "active" : ""}`}
          aria-pressed={start === o.id}
          data-testid={`start-${o.id}`}
          disabled={readOnly}
          onClick={() => (start === o.id ? null : edited ? setAsk({ kind: "start", id: o.id }) : switchStart(o.id))}
        >
          {o.title}
          {o.id === p.recommended && " · 추천"}
        </button>
      ))}
      <button
        type="button"
        className={`filter-chip !min-h-9 !px-3 !py-1.5 !text-xs ${start === "" ? "active" : ""}`}
        aria-pressed={start === ""}
        data-testid="start-empty"
        disabled={readOnly}
        onClick={() => (start === "" ? null : edited ? setAsk({ kind: "start", id: "" }) : switchStart(""))}
      >
        빈 공간
      </button>
    </div>
  );

  const selection = cur && curFp && (
    <div className="space-y-3" data-testid="selection">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold">
            {cur.label}
            {cur.fixture && (
              <span className={`badge ml-2 ${cur.fixture === "confirmed" ? "border-brand/30 bg-brand-soft text-brand" : "border-warn/30 bg-warn-soft text-warn"}`} data-testid="fixture-badge">
                {cur.fixture === "confirmed" ? FIXTURE_TEXT.confirmed : `${FIXTURE_TEXT.proposed} · 급배수 확인 전`}
              </span>
            )}
          </p>
          <p className="text-xs tabular-nums text-muted">
            {mm(curFp.w)} × {mm(curFp.d)} mm · {cur.rot}° 회전
          </p>
        </div>
        <button type="button" className="btn btn-sm shrink-0" onClick={() => setSelected(null)}>
          선택 해제
        </button>
      </div>
      {cur.product && <PlacedProductCard product={cur.product} w={cur.w} d={cur.d} projectId={p.projectId} />}
      {cur.fixture === "proposed" && (
        <div className="rounded-lg bg-warn-soft px-3 py-2 text-xs leading-relaxed text-warn" data-testid="fixture-note">
          <p>자동 배치가 정한 위치예요. 실제 급배수 위치는 확인하지 않았어요. 옮길 수 있고, 업체가 현장에서 배관 연결을 확인해요.</p>
          <button type="button" className="btn btn-sm mt-2 !min-h-8 bg-white" data-testid="fixture-confirm" disabled={readOnly} onClick={() => setFixture("confirmed")}>
            고객 확인: 이 자리가 실제 설비 위치예요
          </button>
        </div>
      )}
      {fixed ? (
        <div className="rounded-lg bg-brand-soft px-3 py-2 text-xs leading-relaxed text-brand" data-testid="fixture-note">
          <p>고객이 실제 설비 위치라고 확인한 자리예요(업체 확인 전). 옮기거나 지우지 않고, 위치를 바꾸려면 확인을 먼저 풀어 주세요. 급배수 연결은 업체가 현장에서 확인해요.</p>
          <button type="button" className="btn btn-sm mt-2 !min-h-8 bg-white" data-testid="fixture-unconfirm" disabled={readOnly} onClick={() => setFixture("proposed")}>
            확인 풀기
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <button type="button" className="btn btn-sm" data-testid="rotate" disabled={readOnly} onClick={rotate}>
              ↻ 90° 돌리기
            </button>
            <button type="button" className="btn btn-sm" data-testid="duplicate" disabled={readOnly || !!cur.fixture} title={cur.fixture ? "설비는 복제하지 않아요" : undefined} onClick={duplicate}>
              복제
            </button>
            <button type="button" className="btn btn-sm btn-danger" data-testid="delete" disabled={readOnly} onClick={remove}>
              삭제
            </button>
          </div>
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
              {p.room.shape === "polygon" ? "도면 아래쪽 끝에서 (mm)" : "앞벽(출입문 벽)에서 (mm)"}
              <input key={`y${cur.id}${curFp.y}`} className="input !min-h-9 !py-1.5 text-right tabular-nums" inputMode="numeric" defaultValue={Math.round(curFp.y * 1000)} data-testid="pos-y" disabled={readOnly} onBlur={(e) => setPos("y", e.target.value)} onKeyDown={(e) => e.key === "Enter" && setPos("y", (e.target as HTMLInputElement).value)} />
            </label>
          </div>
        </>
      )}
      {report.issues.filter((i) => i.ids.includes(cur.id)).map((i) => (
        <p key={i.text} className="rounded-lg bg-warn-soft px-3 py-1.5 text-xs text-warn">
          {i.text}
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
          <li key={c.key}>
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
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        업무석 {report.seats}석 · 요청 {p.staff}석. {CHECK_DISCLAIMER}
      </p>
      <details className="mt-2 text-[11px] text-muted">
        <summary className="cursor-pointer">검사하지 않는 것</summary>
        <p className="mt-1">{NOT_CHECKED.join(" · ")}</p>
        <p className="mt-1">{CHECKS.map((c) => `${c.label}: ${c.desc}`).join(" ")}</p>
      </details>
    </>
  );
  // 휴대폰: 걸린 것만 한 줄로 보이고 상세는 접어 둔다.
  const checksMobile = (
    <details className="card !p-4 lg:hidden" aria-label="자동 검사" data-testid="checks-m">
      <summary className="cursor-pointer text-sm font-bold">
        자동 검사 {issueBadge}
        <span className="ml-1 text-[11px] font-normal text-muted">· 눌러서 상세 보기</span>
      </summary>
      {checkBody}
    </details>
  );
  const checksDesktop = (
    <section className="card !p-4" aria-label="자동 검사" data-testid="checks">
      <h2 className="text-sm font-bold">자동 검사 {issueBadge}</h2>
      {checkBody}
    </section>
  );
  const savedInfo = (
    <>
      <p>
        저장할 때마다 새 버전이 생기고 이전 버전은 그대로 남아요. 지금 편집 기준은 <b>버전 {p.version.no}</b>
        {p.version.source === "edited" ? " (직접 수정)" : p.version.source === "empty" ? " (빈 공간)" : " (자동 배치)"}이에요.
      </p>
      <p className="mt-2" data-testid="sent-info">
        {p.sent ? (
          <>
            업체에 보낸 배치는 <b>버전 {p.sent.no}</b>(요청 r{p.sent.rev})예요. 저장해도 업체가 받은 기준은 그대로이고, 내 공간 화면에서 ‘변경 내용 보내기’를 눌러야 전달돼요.
          </>
        ) : (
          "아직 업체에 보내지 않았어요. 원할 때 ‘시공 제안 요청’에서 저장한 배치를 골라 보낼 수 있어요."
        )}
      </p>
    </>
  );
  const palette = (testPrefix: string, compact: boolean) =>
    p.catalog.map((t) => (
      <button
        key={t.type}
        type="button"
        className={compact ? "shrink-0 rounded-xl border border-line bg-white px-3 py-2 text-left text-xs font-semibold hover:border-brand disabled:opacity-50" : "rounded-xl border border-line bg-white px-3 py-2 text-left text-xs hover:border-brand disabled:opacity-50"}
        data-testid={`${testPrefix}${t.type}`}
        disabled={readOnly}
        onClick={() => add(t)}
      >
        <b className="block">＋ {t.label}</b>
        {!compact && <span className="text-[11px] text-muted">{t.desc}</span>}
      </button>
    ));

  return (
    <main className={`editor ${cur ? "has-selection" : ""}`} data-placement={JSON.stringify(items.map((it) => [it.id, it.x, it.y, it.rot]))} data-start={start} data-selected={selected ?? ""}>
      <div className="editor-bar">
        <Link
          href={leaveHref}
          className="btn btn-sm shrink-0"
          onClick={(e) => {
            if (dirty) {
              e.preventDefault();
              setAsk({ kind: "leave" });
            }
          }}
        >
          ← 나가기
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{p.title} · 배치 수정</p>
          <p className="truncate text-[11px] text-muted" data-testid="editor-status">
            버전 {p.version.no} 기준 · {dirty ? `저장하지 않은 변경${diff.summary ? `: ${diff.summary}` : start !== p.start ? ": 시작 배치 바뀜" : ""}` : "저장된 배치 그대로"}
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
        <button type="button" className="btn btn-sm !px-2.5" aria-label="되돌리기" title="되돌리기 (Ctrl·⌘+Z)" data-testid="editor-undo" disabled={!past.length || readOnly} onClick={undo}>
          ↶
        </button>
        <button type="button" className="btn btn-sm !px-2.5" aria-label="다시 하기" title="다시 하기" data-testid="editor-redo" disabled={!future.length || readOnly} onClick={redo}>
          ↷
        </button>
        <button type="button" className="btn btn-primary btn-sm shrink-0" data-testid="editor-save" disabled={!dirty || pending || readOnly} onClick={save}>
          {pending ? "저장 중…" : dirty ? "저장" : "저장됨"}
        </button>
      </div>

      {ask && (
        <div className="mx-auto mt-3 flex max-w-6xl flex-wrap items-center gap-2 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn" role="alertdialog" data-testid="editor-confirm">
          <span className="flex-1">{ask.kind === "leave" ? "저장하지 않은 변경이 있어요. 나가면 사라져요." : "시작 배치를 바꾸면 이 배치에서 직접 옮긴 가구가 사라져요."}</span>
          <button type="button" className="btn btn-sm" onClick={() => setAsk(null)}>
            취소
          </button>
          {ask.kind === "leave" ? (
            <Link href={leaveHref} className="btn btn-sm btn-primary">
              저장하지 않고 나가기
            </Link>
          ) : (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => switchStart(ask.id)}>
              바꾸기
            </button>
          )}
        </div>
      )}

      <div className="mx-auto grid max-w-6xl gap-4 px-4 pb-6 pt-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="shrink-0 font-semibold text-ink">시작 배치</span>
            <div className="min-w-0 flex-1">{startChips}</div>
          </div>
          {base && (
            <details className="rounded-xl border border-line bg-white px-4 py-3 text-xs leading-relaxed" data-testid="start-info">
              <summary className="cursor-pointer">
                <b className="text-ink">{base.title}</b> · {base.summary}
              </summary>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                <ul className="list-disc space-y-0.5 pl-4 text-muted">
                  {(base.reasons ?? []).map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
                <ul className="space-y-0.5">
                  {(base.pros ?? []).map((t) => (
                    <li key={t} className="flex gap-1">
                      <span className="text-brand">＋</span>
                      {t}
                    </li>
                  ))}
                </ul>
                <ul className="space-y-0.5">
                  {(base.cons ?? []).map((t) => (
                    <li key={t} className="flex gap-1">
                      <span className="text-warn">－</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="mt-2 text-muted">자동 배치의 설명은 처음 배치 기준이에요. 가구를 옮기면 그만큼 달라질 수 있어요.</p>
            </details>
          )}
          {!p.options.length && (
            <p className="rounded-xl bg-sand px-4 py-3 text-xs leading-relaxed text-muted" data-testid="no-auto">
              이 공간에서는 자동 배치를 만들지 않았어요. {p.noAuto.join(" ")} 빈 공간에 ‘가구 추가’로 직접 놓아 주세요.
            </p>
          )}
          {p.skipped.length > 0 && p.options.length > 0 && (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer">만들지 않은 자동 배치 {p.skipped.length}가지 · 이유 보기</summary>
              <ul className="mt-1 space-y-0.5">
                {p.skipped.map((s) => (
                  <li key={s.title}>
                    {s.title} — {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
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
                    onSelect={setSelected}
                    onMoveStart={record}
                    onMove={(id, x, y) => setItems((list) => list.map((it) => (it.id === id ? { ...it, x, y } : it)))}
                    underlay={p.underlayUrl && p.room.underlay && showUnderlay ? { ...p.room.underlay, url: p.underlayUrl } : null}
                  />
                </div>
                {p.underlayUrl && p.room.underlay && (
                  <button type="button" className={`btn btn-sm absolute left-2 top-2 !min-h-8 !px-2 ${showUnderlay ? "btn-primary" : ""}`} aria-pressed={showUnderlay} data-testid="underlay-toggle" onClick={() => setShowUnderlay((v) => !v)}>
                    도면 {showUnderlay ? "겹쳐 보는 중" : "겹쳐 보기"}
                  </button>
                )}
                <div className="absolute right-2 top-2 flex gap-1">
                  {[1, 1.6, 2.4].map((z) => (
                    <button key={z} type="button" className={`btn btn-sm !min-h-8 !px-2 ${zoom === z ? "btn-primary" : ""}`} aria-pressed={zoom === z} onClick={() => setZoom(z)}>
                      {z === 1 ? "전체" : `${z}배`}
                    </button>
                  ))}
                </div>
                <p className="border-t border-line bg-white px-3 py-2 text-[11px] text-muted">
                  {readOnly ? "종료된 요청이라 볼 수만 있어요." : "가구를 눌러 고르고 끌어서 옮기세요. 휴대폰은 고른 가구를 다시 눌러 끌거나 아래 화살표를 쓰세요."} 주황 점선은 문 앞 750mm(현재 임시 검사값)입니다.
                </p>
              </>
            ) : (
              <>
                <Viewer3D option={option} styleId={p.styleId} className="h-[62vh] min-h-[360px]" />
                <p className="border-t border-line bg-white px-3 py-2 text-[11px] text-muted">평면과 같은 배치 데이터로 그린 3D예요. 끌어서 돌려 보세요. 고치기는 ‘평면에서 고치기’에서 해요.</p>
              </>
            )}
          </div>
          {msg && (
            <p role={msg.error ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-sm ${msg.error ? "bg-warn-soft text-danger" : "bg-brand-soft text-brand"}`} data-testid="editor-msg">
              {msg.error ?? msg.ok}
            </p>
          )}
          {/* 휴대폰: 가구 추가와 편집 안내를 평면 바로 아래에 둔다. */}
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
            {!cur && !readOnly && (
              <p className="rounded-xl bg-brand-soft px-3 py-2 text-xs text-brand" data-testid="edit-hint-m">
                가구를 누르면 화면 아래에 옮기기·돌리기·복제·삭제 버튼이 나와요.
              </p>
            )}
          </section>
          {checksMobile}
          <details className="card !p-4 text-xs leading-relaxed lg:hidden" data-testid="save-info-m">
            <summary className="cursor-pointer text-sm font-bold">저장과 업체 전달</summary>
            <div className="mt-2">{savedInfo}</div>
          </details>
        </div>

        <aside className="space-y-4">
          <div className={`editor-sheet ${cur ? "is-open" : ""}`}>{selection || <p className="hidden text-xs text-muted lg:block">가구를 누르면 여기에서 위치를 숫자로 넣거나, 돌리기·복제·삭제할 수 있어요.</p>}</div>
          <section className="card !p-4 hidden lg:block" aria-label="가구 추가">
            <h2 className="text-sm font-bold">가구 추가</h2>
            <div className="mt-2 grid grid-cols-2 gap-1.5">{palette("add-", false)}</div>
            <p className="mt-2 text-[11px] text-muted">크기와 위치를 보는 개념 가구예요. 실제 제품 지정이 아니에요.</p>
          </section>
          <section className="card !p-4 hidden lg:block" aria-label="실제 상품 놓기" data-testid="product-palette">
            <h2 className="text-sm font-bold">실제 상품 놓기</h2>
            <p className="mt-1 text-[11px] text-muted">쇼핑에서 규격이 등록된 상품이에요. 판매자 규격 그대로 놓이고, 놓은 상품은 바로 장바구니에 담을 수 있어요.</p>
            <div className="mt-2 grid max-h-[300px] gap-1.5 overflow-y-auto"><ProductPalette products={p.products ?? []} onAdd={add} disabled={readOnly} /></div>
          </section>
          <div className="hidden lg:block">{checksDesktop}</div>
          <section className="card !p-4 hidden text-xs leading-relaxed lg:block" aria-label="저장과 업체 전달">
            <h2 className="mb-2 text-sm font-bold">저장과 업체 전달</h2>
            {savedInfo}
          </section>
        </aside>
      </div>
    </main>
  );
}
