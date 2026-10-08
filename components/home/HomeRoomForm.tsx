"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import PlanSvg from "@/components/PlanSvg";
import type { FormState } from "@/lib/actions";
import { FIXED_LABELS, ROOM_BADGE, ROOM_NAMES, ROOM_RANGE_TEXT, ROOM_SCOPE_TEXT, SIDE_LABEL, SPOT_LABELS, composeRoom, homeRoomErrors } from "@/lib/space/home-room";
import type { RoomModel, WallSide } from "@/lib/space/types";

type Action = (state: FormState, fd: FormData) => Promise<FormState>;

interface DoorRow {
  label: string;
  wall: WallSide;
  at: string;
  width: string;
}
interface WinRow {
  wall: WallSide;
  at: string;
  width: string;
}
interface FixedRow {
  label: string;
  x: string;
  y: string;
  w: string;
  d: string;
  h: string;
}

const toMm = (m: number | null | undefined) => (m == null ? "" : String(Math.round(m * 1000)));
const toM = (s: string) => (s.trim() === "" ? NaN : Number(s.replaceAll(",", "")) / 1000);
const SIDES: WallSide[] = ["front", "rear", "left", "right"];

/**
 * 방 한 칸 정보. 치수를 아는 방 하나를 직사각형으로 넣는다(앞벽 = 방문이 있는 벽).
 * 다른 문 자리·창·고정 구조물은 있는 것만 넣는다. 오른쪽 미리보기는 저장될 방과 같은 데이터로 그린다.
 */
export default function HomeRoomForm({ action, mode, initial }: { action: Action; mode: "new" | "edit"; initial?: { name: string; room: RoomModel } }) {
  const [state, dispatch, pending] = useActionState(action, {});
  const r0 = initial?.room;
  const [name, setName] = useState(initial?.name ?? "");
  const [w, setW] = useState(toMm(r0?.width));
  const [d, setD] = useState(toMm(r0?.depth));
  const [h, setH] = useState(toMm(r0?.height));
  const [entAt, setEntAt] = useState(r0 ? toMm(r0.entrance.at) : "300");
  const [entW, setEntW] = useState(r0 ? toMm(r0.entrance.width) : "900");
  const [doors, setDoors] = useState<DoorRow[]>((r0?.doors ?? []).map((x) => ({ label: x.label, wall: x.wall, at: toMm(x.at), width: toMm(x.width) })));
  const [winMode, setWinMode] = useState<"unknown" | "none" | "list">(r0 ? (r0.windows == null ? "unknown" : r0.windows.length ? "list" : "none") : "unknown");
  const [wins, setWins] = useState<WinRow[]>((r0?.windows ?? []).map((x) => ({ wall: x.wall ?? "rear", at: toMm(x.at), width: toMm(x.width) })));
  const [fixed, setFixed] = useState<FixedRow[]>((r0?.pillars ?? []).map((p) => ({ label: p.label || "기둥", x: toMm(p.x), y: toMm(p.y), w: toMm(p.w), d: toMm(p.d), h: toMm(p.h) })));
  const [shown, setShown] = useState(false);

  const room: RoomModel = useMemo(
    () => ({
      shape: "rect",
      width: toM(w),
      depth: toM(d),
      height: h.trim() ? toM(h) : null,
      entrance: { at: toM(entAt), width: toM(entW) },
      windows: winMode === "unknown" ? null : winMode === "none" ? [] : wins.map((x) => ({ wall: x.wall, at: toM(x.at), width: toM(x.width) })),
      pillars: fixed.map((p) => ({ x: toM(p.x), y: toM(p.y), w: toM(p.w), d: toM(p.d), label: p.label || "기둥", ...(p.h.trim() ? { h: toM(p.h) } : {}) })),
      doors: doors.map((x) => ({ wall: x.wall, at: toM(x.at), width: toM(x.width), label: x.label || "문" })),
      utilities: [],
      source: "dims",
    }),
    [w, d, h, entAt, entW, doors, winMode, wins, fixed],
  );
  const errors = useMemo(() => homeRoomErrors(room), [room]);
  const preview = errors.length ? null : composeRoom({ room, items: [], name: name || "방" });

  const num = (value: string, set: (v: string) => void, testid: string, label: string, placeholder = "") => (
    <label className="block min-w-0">
      <span className="text-[11px] text-muted">{label}</span>
      <input className="input !min-h-9 !py-1.5 text-right tabular-nums" inputMode="numeric" value={value} placeholder={placeholder} onChange={(e) => set(e.target.value)} data-testid={testid} />
    </label>
  );
  const sideSelect = (value: WallSide, set: (v: WallSide) => void, testid: string, allowFront = true) => (
    <label className="block min-w-0">
      <span className="text-[11px] text-muted">벽</span>
      <select className="input !min-h-9 !py-1.5" value={value} onChange={(e) => set(e.target.value as WallSide)} data-testid={testid}>
        {SIDES.filter((s) => allowFront || s !== "front").map((s) => (
          <option key={s} value={s}>
            {SIDE_LABEL[s]}
          </option>
        ))}
      </select>
    </label>
  );
  const setRow = <T,>(list: T[], set: (v: T[]) => void, i: number, patch: Partial<T>) => set(list.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  return (
    <form
      className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]"
      data-testid="room-form"
      onSubmit={(e) => {
        e.preventDefault();
        setShown(true);
        if (!name.trim() || errors.length) return;
        const fd = new FormData();
        fd.set("name", name.trim());
        fd.set("room", JSON.stringify(room));
        startTransition(() => dispatch(fd));
      }}
    >
      <div className="min-w-0 space-y-5">
        <p className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-xs leading-relaxed text-warn" data-testid="room-scope">
          <b>{ROOM_BADGE}</b> · {ROOM_SCOPE_TEXT}
        </p>
        <section className="card space-y-3">
          <h2 className="h-section !mb-0">방 이름</h2>
          <div className="flex flex-wrap gap-1.5">
            {ROOM_NAMES.map((n) => (
              <button key={n} type="button" className={`filter-chip !min-h-8 !px-3 !py-1 !text-xs ${name === n ? "active" : ""}`} onClick={() => setName(n)} data-testid={`room-preset-${n}`}>
                {n}
              </button>
            ))}
          </div>
          <input className="input" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="예: 침실" data-testid="room-name" />
        </section>

        <section className="card space-y-3">
          <div>
            <h2 className="h-section !mb-0">방 치수 (mm)</h2>
            <p className="mt-1 text-xs text-muted">방문이 있는 벽을 아래(앞벽)에 두고 봐요. 벽 안쪽 면 사이 거리를 넣어 주세요. {ROOM_RANGE_TEXT}.</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {num(w, setW, "room-w", "가로(앞벽 길이)", "예: 3300")}
            {num(d, setD, "room-d", "세로(앞벽→안쪽 벽)", "예: 3000")}
            {num(h, setH, "room-h", "천장 높이 · 선택", "모르면 비움")}
          </div>
        </section>

        <section className="card space-y-3">
          <h2 className="h-section !mb-0">방문 (앞벽)</h2>
          <div className="grid grid-cols-2 gap-2">
            {num(entAt, setEntAt, "ent-at", "왼쪽 벽에서 문 가장자리까지")}
            {num(entW, setEntW, "ent-w", "문 폭")}
          </div>
          <div className="space-y-2 border-t border-line pt-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">다른 문 자리 · 선택</p>
              <button type="button" className="btn btn-sm" disabled={doors.length >= 3} onClick={() => setDoors([...doors, { label: "욕실 문", wall: "rear", at: "300", width: "800" }])} data-testid="add-door">
                ＋ 문 자리
              </button>
            </div>
            <p className="text-[11px] text-muted">욕실·발코니·현관 문처럼 가구로 막으면 안 되는 자리예요. 문 앞 장애물 검사에 함께 써요. 최대 3개.</p>
            {doors.map((x, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-white p-2 sm:grid-cols-[1.2fr_1.3fr_1fr_1fr_auto]">
                <label className="block min-w-0">
                  <span className="text-[11px] text-muted">이름</span>
                  <select className="input !min-h-9 !py-1.5" value={x.label} onChange={(e) => setRow(doors, setDoors, i, { label: e.target.value })} data-testid={`door-label-${i}`}>
                    {SPOT_LABELS.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </label>
                {sideSelect(x.wall, (v) => setRow(doors, setDoors, i, { wall: v }), `door-wall-${i}`)}
                {num(x.at, (v) => setRow(doors, setDoors, i, { at: v }), `door-at-${i}`, x.wall === "left" || x.wall === "right" ? "앞벽에서" : "왼쪽 벽에서")}
                {num(x.width, (v) => setRow(doors, setDoors, i, { width: v }), `door-w-${i}`, "폭")}
                <button type="button" className="btn btn-sm btn-danger self-end" onClick={() => setDoors(doors.filter((_, k) => k !== i))} data-testid={`door-del-${i}`}>
                  빼기
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="card space-y-3">
          <h2 className="h-section !mb-0">창</h2>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="창">
            {(
              [
                ["unknown", "위치 모름"],
                ["none", "창 없음"],
                ["list", "위치 입력"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={winMode === k} className={`filter-chip !min-h-8 !px-3 !py-1 !text-xs ${winMode === k ? "active" : ""}`} onClick={() => setWinMode(k)} data-testid={`win-mode-${k}`}>
                {label}
              </button>
            ))}
          </div>
          {winMode === "unknown" && <p className="text-[11px] text-muted">창을 그리지 않고 ‘위치 모름’으로 전달해요. 임의로 창을 넣지 않아요.</p>}
          {winMode === "list" && (
            <>
              {wins.map((x, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-white p-2 sm:grid-cols-[1.3fr_1fr_1fr_auto]">
                  {sideSelect(x.wall, (v) => setRow(wins, setWins, i, { wall: v }), `win-wall-${i}`)}
                  {num(x.at, (v) => setRow(wins, setWins, i, { at: v }), `win-at-${i}`, x.wall === "left" || x.wall === "right" ? "앞벽에서" : "왼쪽 벽에서")}
                  {num(x.width, (v) => setRow(wins, setWins, i, { width: v }), `win-w-${i}`, "폭")}
                  <button type="button" className="btn btn-sm btn-danger self-end" onClick={() => setWins(wins.filter((_, k) => k !== i))}>
                    빼기
                  </button>
                </div>
              ))}
              <button type="button" className="btn btn-sm" disabled={wins.length >= 6} onClick={() => setWins([...wins, { wall: "rear", at: "500", width: "1500" }])} data-testid="add-win">
                ＋ 창
              </button>
            </>
          )}
        </section>

        <section className="card space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="h-section !mb-0">고정 구조물 · 선택</h2>
            <button type="button" className="btn btn-sm" disabled={fixed.length >= 6} onClick={() => setFixed([...fixed, { label: "붙박이장", x: "0", y: "0", w: "1200", d: "600", h: "" }])} data-testid="add-fixed">
              ＋ 구조물
            </button>
          </div>
          <p className="text-[11px] text-muted">기둥, 붙박이장, 싱크대 자리처럼 옮길 수 없는 것을 크기만 있는 상자로 넣어요. 설비 연결은 다루지 않아요. 가구와 겹치면 검사에서 알려요.</p>
          {fixed.map((p, i) => (
            <div key={i} className="grid grid-cols-3 gap-2 rounded-lg border border-line bg-white p-2 sm:grid-cols-[1.3fr_repeat(5,1fr)_auto]">
              <label className="col-span-3 block min-w-0 sm:col-span-1">
                <span className="text-[11px] text-muted">이름</span>
                <select className="input !min-h-9 !py-1.5" value={p.label} onChange={(e) => setRow(fixed, setFixed, i, { label: e.target.value })} data-testid={`fixed-label-${i}`}>
                  {FIXED_LABELS.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </label>
              {num(p.x, (v) => setRow(fixed, setFixed, i, { x: v }), `fixed-x-${i}`, "왼쪽 벽에서")}
              {num(p.y, (v) => setRow(fixed, setFixed, i, { y: v }), `fixed-y-${i}`, "앞벽에서")}
              {num(p.w, (v) => setRow(fixed, setFixed, i, { w: v }), `fixed-w-${i}`, "가로")}
              {num(p.d, (v) => setRow(fixed, setFixed, i, { d: v }), `fixed-d-${i}`, "깊이")}
              {num(p.h, (v) => setRow(fixed, setFixed, i, { h: v }), `fixed-h-${i}`, "높이", "천장까지")}
              <button type="button" className="btn btn-sm btn-danger self-end" onClick={() => setFixed(fixed.filter((_, k) => k !== i))}>
                빼기
              </button>
            </div>
          ))}
        </section>

        {(shown && (!name.trim() || errors.length > 0)) || state.error ? (
          <div role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-danger" data-testid="room-errors">
            {!name.trim() && <p>방 이름을 넣어 주세요.</p>}
            {errors.map((t) => (
              <p key={t}>{t}</p>
            ))}
            {state.error && <p>{state.error}</p>}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <button className="btn btn-primary" disabled={pending} data-testid="room-submit">
            {pending ? "저장 중…" : mode === "new" ? "방 만들고 가구 놓기" : "방 정보 저장"}
          </button>
          <span className="text-xs text-muted">{mode === "new" ? "빈 방에서 시작해 가구를 직접 놓아요. 집 자동 배치는 이번 범위에서 제외했어요(후속 검토)." : "놓은 가구는 그대로 두고, 방 밖으로 나가면 검사에서 알려요."}</span>
        </div>
      </div>

      <aside className="lg:sticky lg:top-4 lg:h-fit">
        <div className="overflow-hidden rounded-2xl border border-line bg-white" data-testid="room-preview">
          <p className="border-b border-line px-3 py-2 text-xs font-semibold">
            미리보기 <span className="font-normal text-warn">· {ROOM_BADGE}</span>
          </p>
          {preview ? <PlanSvg option={preview} styleId="natural" space /> : <p className="grid aspect-[4/3] place-items-center p-4 text-center text-xs text-muted">{errors[0] ?? "방 치수를 넣으면 미리보기가 나와요."}</p>}
        </div>
      </aside>
    </form>
  );
}
