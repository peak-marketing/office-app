"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PRIORITIES, mm } from "@/lib/constants";
import { demoQuery, type DemoState } from "@/lib/demo";
import { AUTO_MAX_PYEONG, AUTO_MIN_PYEONG, generateLayout } from "@/lib/layout/generate";
import type { LayoutInput } from "@/lib/layout/types";
import LayoutStudio from "./LayoutStudio";

const toInput = (s: DemoState): LayoutInput => ({
  areaPyeong: s.area,
  widthM: null,
  depthM: null,
  staff: s.staff,
  ceo: s.ceo,
  meeting: s.meeting,
  meetingSeats: s.meetingSeats,
  pantry: s.pantry,
  storage: s.storage,
  entrance: s.entrance,
  shape: "rect",
  pillars: 0,
  furnitureIncluded: true,
  priority: s.priority,
});

function Toggle({ label, checked, onChange, children }: { label: string; checked: boolean; onChange: (v: boolean) => void; children?: React.ReactNode }) {
  return (
    <div className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition ${checked ? "border-brand bg-brand-soft" : "border-line bg-white"}`}>
      <label className="flex flex-1 cursor-pointer items-center gap-2">
        <input type="checkbox" className="size-4 accent-brand" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        {label}
      </label>
      {children}
    </div>
  );
}

/** 배치 체험. 조건을 바꾸면 목적이 다른 배치안을 바로 다시 만든다. */
export default function HomeDemo({ initial, loggedIn, canStart, refCase }: { initial: DemoState; loggedIn: boolean; canStart: boolean; refCase?: { id: number; title: string } }) {
  const [state, setState] = useState(initial);
  // 슬라이더를 끄는 동안 3D를 매번 다시 만들지 않도록 잠깐 기다렸다가 반영한다.
  const [applied, setApplied] = useState(initial);
  useEffect(() => {
    const t = setTimeout(() => setApplied(state), 180);
    return () => clearTimeout(t);
  }, [state]);
  const set = (patch: Partial<DemoState>) => setState((prev) => ({ ...prev, ...patch }));

  const { area, staff, ceo, meeting, meetingSeats, pantry, storage, entrance, priority } = applied;
  const result = useMemo(
    () => generateLayout(toInput({ area, staff, ceo, meeting, meetingSeats, pantry, storage, entrance, priority, style: "natural", option: "" })),
    [area, staff, ceo, meeting, meetingSeats, pantry, storage, entrance, priority],
  );
  const shown = result.options.find((o) => o.id === state.option) ?? result.options.find((o) => o.id === result.recommended) ?? result.options[0];
  // 고른 배치와 스타일도 함께 넘겨 가입과 요청 등록까지 유지한다.
  // 체험 조건(인원·방·우선순위·평수)을 들고 실제 치수로 내 공간을 만들러 간다.
  const next = `/spaces/new?${demoQuery({ ...state, option: shown?.id ?? "" }, refCase ? { case: String(refCase.id) } : {})}`;
  const startHref = canStart ? next : loggedIn ? "/" : `/signup?next=${encodeURIComponent(next)}`;

  return (
    <div className="grid gap-5 lg:grid-cols-[290px_minmax(0,1fr)]">
      <div className="card h-fit space-y-5 lg:sticky lg:top-4">
        <p className="text-sm font-bold">내 공간 조건</p>
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="demo-area" className="text-sm font-semibold">
              전용면적
            </label>
            <span className="text-lg font-bold tabular-nums">
              {state.area}
              <span className="ml-0.5 text-sm font-medium text-muted">평</span>
            </span>
          </div>
          <input id="demo-area" type="range" min={AUTO_MIN_PYEONG} max={AUTO_MAX_PYEONG} value={state.area} onChange={(e) => set({ area: Number(e.target.value) })} className="mt-2 w-full accent-brand" />
          <div className="flex justify-between text-[11px] text-muted">
            <span>{AUTO_MIN_PYEONG}평</span>
            <span>{AUTO_MAX_PYEONG}평</span>
          </div>
          {result.W && result.D && (
            <p className="mt-1 text-[11px] text-muted">
              {mm(result.W)} × {mm(result.D)} mm로 가정 · 실제 치수는 요청할 때 입력합니다
            </p>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">직원 좌석</span>
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-sm size-8 !p-0" onClick={() => set({ staff: Math.max(1, state.staff - 1) })} aria-label="좌석 줄이기">
              −
            </button>
            <span className="w-10 text-center text-lg font-bold tabular-nums" data-testid="demo-staff">
              {state.staff}
            </span>
            <button type="button" className="btn btn-sm size-8 !p-0" onClick={() => set({ staff: Math.min(60, state.staff + 1) })} aria-label="좌석 늘리기">
              +
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold">필요한 방</p>
          <Toggle label="대표실" checked={state.ceo} onChange={(v) => set({ ceo: v })} />
          <Toggle label="회의실" checked={state.meeting} onChange={(v) => set({ meeting: v })}>
            <select
              className="rounded-md border border-line bg-white px-1.5 py-0.5 text-xs disabled:opacity-40"
              value={state.meetingSeats}
              disabled={!state.meeting}
              onChange={(e) => set({ meetingSeats: Number(e.target.value) })}
              aria-label="회의실 인원"
            >
              {[4, 6, 8, 10, 12].map((n) => (
                <option key={n} value={n}>
                  {n}인
                </option>
              ))}
            </select>
          </Toggle>
          <Toggle label="탕비실" checked={state.pantry} onChange={(v) => set({ pantry: v })} />
          <Toggle label="수납·창고" checked={state.storage} onChange={(v) => set({ storage: v })} />
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold">출입구 위치</p>
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="출입구 위치">
            {(["left", "right"] as const).map((side) => (
              <button key={side} type="button" onClick={() => set({ entrance: side })} aria-pressed={state.entrance === side} className={`btn btn-sm ${state.entrance === side ? "border-ink bg-ink text-white hover:bg-ink" : ""}`}>
                전면 {side === "left" ? "왼쪽" : "오른쪽"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="demo-priority" className="mb-2 block text-sm font-semibold">
            가장 중요하게 보는 것
          </label>
          <select id="demo-priority" className="input" value={state.priority} onChange={(e) => set({ priority: e.target.value as DemoState["priority"], option: "" })}>
            {Object.entries(PRIORITIES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">어느 배치를 먼저 보여 줄지에만 씁니다.</p>
        </div>

        <div className="border-t border-line pt-4">
          <Link href={startHref} className="btn btn-primary w-full py-2.5">
            {canStart || !loggedIn ? "이 조건으로 내 공간 만들기" : "고객 계정에서 만들 수 있습니다"}
          </Link>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            조건과 고른 배치·스타일이 그대로 넘어갑니다.{refCase && ` 참고 사례 ‘${refCase.title}’도 함께 연결됩니다.`} 실제 치수, 예산, 사진은 다음 단계에서 입력합니다.
          </p>
        </div>
      </div>

      <div className="min-w-0">
        {result.status !== "ok" ? (
          <div className="rounded-xl border border-warn/30 bg-warn-soft p-5 text-sm leading-relaxed text-warn" data-testid="demo-review">
            <p className="mb-2 font-semibold">이 조건은 자동 배치가 어렵습니다</p>
            <ul className="list-disc space-y-1 pl-4">
              {[...new Set([...(result.skipped ?? []).map((s) => `${s.title}: ${s.reason}`), ...result.reasons])].map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <p className="mt-3 text-ink">억지로 배치안을 만들지 않습니다. 이대로 요청을 등록하면 운영자가 사진과 도면을 보고 검토해 상담으로 이어집니다.</p>
          </div>
        ) : (
          <LayoutStudio
            key={state.priority}
            options={result.options}
            savedOption={state.option}
            savedStyle={state.style}
            recommendedOption={result.recommended}
            skipped={result.skipped}
            onSelect={(option, style) => set({ option, style })}
            savedLabel="선택됨"
          />
        )}
        {result.status === "ok" && result.advisories[0] && <p className="mt-3 rounded-xl bg-warn-soft px-4 py-2.5 text-xs leading-relaxed text-warn">{result.advisories[0]}</p>}
      </div>
    </div>
  );
}
