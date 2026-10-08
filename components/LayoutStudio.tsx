"use client";

import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import { saveSelection } from "@/lib/actions";
import type { LayoutOption, LayoutResult } from "@/lib/layout/types";
import { STYLES, getStyle, styleColor } from "@/lib/styles";
import PlanSvg from "./PlanSvg";

const Viewer3D = dynamic(() => import("./Viewer3D"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-muted">3D 화면을 불러오는 중…</div>,
});

interface Props {
  options: LayoutOption[];
  savedOption: string;
  savedStyle: string;
  /** 고객의 우선순위에 맞는 배치안 */
  recommendedOption?: string | null;
  /** 이 조건에서는 만들지 않은 배치안과 이유 */
  skipped?: LayoutResult["skipped"];
  recommended?: { id: string; reason: string };
  /** 선택을 저장할 수 있는 화면(고객·운영자)에서만 넘긴다. */
  save?: { projectId: number; versionId: number; locked: boolean };
  /** 좁은 자리에 넣을 때: 배치·스타일 선택을 위쪽 버튼으로 줄인다 */
  compact?: boolean;
  /** 저장하지 않는 화면(체험)에서 지금 고른 값을 알려 준다 */
  onSelect?: (option: string, style: string) => void;
  /** "고객 선택"처럼 저장된 선택에 붙일 말 */
  savedLabel?: string;
}

/** 배치안끼리 나란히 놓고 보는 수치 */
function rowsFor(options: LayoutOption[]): [string, (o: LayoutOption) => string][] {
  const m = (o: LayoutOption) => o.metrics!;
  const rows: [string, (o: LayoutOption) => string][] = [
    ["좌석 구성", (o) => m(o).seating],
    ["방문객 동선", (o) => (m(o).visitorDistance == null ? "맞을 방 없음" : `출입구에서 ${m(o).visitorDistance}m${m(o).visitorPassBy ? ` · 좌석 ${m(o).visitorPassBy}석 옆을 지남` : " · 좌석 옆을 지나지 않음"}`)],
    ["마주 보는 좌석", (o) => `${m(o).facing}석`],
    ["협업 테이블", (o) => (m(o).collabTable ? "있음 (6인 스탠딩)" : "없음")],
    ["주 통로 폭", (o) => `${Math.round(m(o).aisle * 1000).toLocaleString("ko-KR")} mm`],
    ["더 놓을 수 있는 좌석", (o) => `${m(o).spare}석`],
  ];
  if (options.every((o) => m(o).windowSeats != null)) {
    rows.splice(3, 0, ["창가 좌석", (o) => `${m(o).windowSeats}석`]);
    rows.splice(4, 0, ["창을 쓰는 방", (o) => m(o).windowRooms.join(", ") || "없음"]);
  }
  return rows;
}

export default function LayoutStudio({ options, savedOption, savedStyle, recommendedOption, skipped, recommended, save, compact = false, onSelect, savedLabel = "저장됨" }: Props) {
  const [picked, setPicked] = useState(savedOption);
  const [styleId, setStyleId] = useState(savedStyle);
  const [tab, setTab] = useState<"3d" | "plan">("3d");
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({});
  const [pending, startTransition] = useTransition();
  // 조건이 바뀌어 고른 배치가 사라지면 추천 배치, 그것도 없으면 첫 배치를 보여 준다.
  const option = options.find((o) => o.id === picked) ?? options.find((o) => o.id === recommendedOption) ?? options[0];
  const style = getStyle(styleId);
  const savedExists = options.some((o) => o.id === savedOption);
  const dirty = option.id !== (savedExists ? savedOption : "") || styleId !== savedStyle;
  const detailed = options.every((o) => o.metrics && o.reasons);

  const pick = (id: string) => {
    setPicked(id);
    onSelect?.(id, styleId);
  };
  const pickStyle = (id: string) => {
    setStyleId(id);
    onSelect?.(option.id, id);
  };
  const onSave = () =>
    startTransition(async () => {
      setMessage(await saveSelection(save!.projectId, save!.versionId, option.id, styleId));
    });

  const viewer = (
    <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-white">
      <div className="no-print flex flex-wrap items-center gap-1 border-b border-line bg-surface p-2">
        {(["3d", "plan"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`btn btn-sm ${tab === t ? "btn-primary" : ""}`} aria-pressed={tab === t}>
            {t === "3d" ? "3D" : "치수 평면도"}
          </button>
        ))}
        {compact ? (
          <span className="ml-auto flex flex-wrap items-center justify-end gap-1">
            {options.length > 1 &&
              options.map((o) => (
                <button key={o.id} type="button" onClick={() => pick(o.id)} aria-pressed={o.id === option.id} title={o.summary} className={`btn btn-sm ${o.id === option.id ? "border-ink bg-ink text-white hover:bg-ink" : ""}`}>
                  {o.title}
                  {o.id === savedOption && ` · ${savedLabel}`}
                </button>
              ))}
            <select className="rounded-lg border border-line bg-white px-2 py-1 text-xs" value={styleId} onChange={(e) => pickStyle(e.target.value)} aria-label="스타일">
              {STYLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.id === savedStyle ? ` · ${savedLabel}` : ""}
                </option>
              ))}
            </select>
          </span>
        ) : (
          <span className="ml-auto pr-2 text-xs text-muted">
            {option.title} · {style.name}
          </span>
        )}
      </div>
      {tab === "3d" ? (
        <Viewer3D key={option.id} option={option} styleId={styleId} className={compact ? "min-h-[340px] flex-1 sm:min-h-[460px]" : "min-h-[380px] flex-1 lg:min-h-[520px]"} />
      ) : (
        <div className="max-h-[640px] overflow-auto p-2">
          <PlanSvg option={option} styleId={styleId} />
        </div>
      )}
    </div>
  );

  const why = detailed && (
    <div className="card space-y-4" data-testid="layout-why">
      <div>
        <p className="text-[11px] font-semibold tracking-widest text-clay">{option.title}</p>
        <p className="mt-1 text-sm font-semibold leading-snug">{option.summary}</p>
      </div>
      <div>
        <h4 className="mb-1.5 text-xs font-semibold text-muted">입력 조건을 이렇게 반영했습니다</h4>
        <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed marker:text-line">
          {option.reasons!.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        <div>
          <h4 className="mb-1.5 text-xs font-semibold text-brand">좋은 점</h4>
          <ul className="space-y-1 text-xs leading-relaxed">
            {option.pros!.map((t) => (
              <li key={t} className="flex gap-1.5">
                <span className="text-brand">＋</span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="mb-1.5 text-xs font-semibold text-warn">감수할 점</h4>
          <ul className="space-y-1 text-xs leading-relaxed">
            {option.cons!.map((t) => (
              <li key={t} className="flex gap-1.5">
                <span className="text-warn">－</span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
      {option.notes?.map((t) => (
        <p key={t} className="rounded-lg bg-warn-soft p-2.5 text-xs leading-relaxed text-warn">
          {t}
        </p>
      ))}
    </div>
  );

  if (compact)
    return (
      <div className="space-y-3">
        {viewer}
        {detailed && (
          <details className="card" open>
            <summary className="cursor-pointer text-sm font-semibold">
              {option.title}
              {option.id === savedOption && <span className="ml-2 badge border-brand/30 bg-brand-soft text-brand">{savedLabel}</span>}
              <span className="ml-2 text-xs font-normal text-muted">{option.summary}</span>
            </summary>
            <ul className="mt-3 list-disc space-y-1 pl-4 text-xs leading-relaxed marker:text-line">
              {option.reasons!.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    );

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-base font-bold tracking-tight">1. 배치 고르기</h3>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              {options.length > 1
                ? `같은 조건으로 설계 목적이 다른 배치 ${options.length}가지를 만들었습니다. 방 위치, 좌석 구성, 통로가 서로 다릅니다.`
                : "이 조건에서는 배치안이 하나입니다. 억지로 여러 개를 만들지 않았습니다."}
            </p>
          </div>
        </div>
        {/* 좁은 화면에서는 옆으로 넘겨 보며 고른다. */}
        <div className={options.length > 1 ? "-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0" : "sm:max-w-sm"} role="group" aria-label="배치안">
          {options.map((o) => {
            const active = o.id === option.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => pick(o.id)}
                aria-pressed={active}
                data-option={o.id}
                className={`w-[78%] shrink-0 cursor-pointer snap-start overflow-hidden rounded-xl border bg-surface text-left transition sm:w-auto ${active ? "border-ink shadow-[0_0_0_1px_var(--color-ink)]" : "border-line hover:border-muted"}`}
              >
                <span className="block border-b border-line bg-white">
                  <PlanSvg option={o} styleId="natural" thumb />
                </span>
                <span className="block p-3.5">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <b className="text-sm">{o.title}</b>
                    {o.id === recommendedOption && <span className="badge border-clay/30 bg-warn-soft text-clay">우선순위와 맞음</span>}
                    {o.id === savedOption && <span className="badge border-brand/30 bg-brand-soft text-brand">{savedLabel}</span>}
                  </span>
                  <span className="mt-1.5 block text-xs leading-relaxed text-muted">{o.summary}</span>
                </span>
              </button>
            );
          })}
        </div>
        {!!skipped?.length && (
          <div className="mt-3 rounded-xl border border-dashed border-line p-3.5 text-xs leading-relaxed text-muted" data-testid="layout-skipped">
            <b className="text-ink">이 조건에서는 만들지 않은 배치</b>
            <ul className="mt-1 space-y-0.5">
              {skipped.map((s) => (
                <li key={s.purpose}>
                  {s.title} — {s.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {viewer}
        {why || <div className="card text-sm text-muted">{option.summary}</div>}
      </div>

      {detailed && options.length > 1 && (
        <div className="card overflow-x-auto" data-testid="layout-compare">
          <h3 className="h-section">배치안 비교</h3>
          <table className="table-base min-w-[560px]">
            <thead>
              <tr>
                <th className="w-32" />
                {options.map((o) => (
                  <th key={o.id} className={o.id === option.id ? "!text-ink" : ""}>
                    {o.title}
                    {o.id === option.id && " ✓"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowsFor(options).map(([label, get]) => (
                <tr key={label}>
                  <td className="text-xs text-muted">{label}</td>
                  {options.map((o) => (
                    <td key={o.id} className={`text-xs ${o.id === option.id ? "bg-brand-soft/50 font-medium" : ""}`}>
                      {get(o)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-muted">수치는 배치 좌표에서 계산한 값입니다. 창가 좌석은 창에서 3.2m 이내, 동선 옆 좌석은 1.5m 이내를 셉니다.</p>
        </div>
      )}

      <section className="card">
        <h3 className="text-base font-bold tracking-tight">2. 스타일 고르기</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">스타일은 색상과 마감 방향만 바꿉니다. 위에서 고른 배치는 그대로입니다. 화면 색상은 분위기 참고용이며 자재 지정이 아닙니다.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3" role="group" aria-label="인테리어 스타일">
          {STYLES.map((s) => {
            const active = s.id === styleId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => pickStyle(s.id)}
                aria-pressed={active}
                className={`cursor-pointer overflow-hidden rounded-xl border bg-white text-left transition ${active ? "border-ink shadow-[0_0_0_1px_var(--color-ink)]" : "border-line hover:border-muted"}`}
              >
                <span className="flex h-8">
                  {s.palette.map(([name, color]) => (
                    <span key={name} className="flex-1" style={{ background: color }} />
                  ))}
                </span>
                <span className="block p-3">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <b className="text-sm">{s.name}</b>
                    {s.id === recommended?.id && <span className="badge border-clay/30 bg-warn-soft text-clay">선호 분위기와 맞음</span>}
                    {s.id === savedStyle && <span className="badge border-brand/30 bg-brand-soft text-brand">{savedLabel}</span>}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted">{s.tagline}</span>
                </span>
              </button>
            );
          })}
        </div>
        {recommended && <p className="mt-3 text-xs leading-relaxed text-muted">{recommended.reason}</p>}
      </section>

      {save && (
        <div className="no-print flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" disabled={!dirty || pending} onClick={onSave}>
            {pending ? "저장 중…" : !dirty ? "선택이 저장되어 있습니다" : save.locked ? "이 선택으로 새 버전 만들기" : `${option.title} · ${style.name}(으)로 저장`}
          </button>
          {save.locked && dirty && <p className="text-xs text-muted">견적을 요청한 버전은 기준이 바뀌지 않도록 그대로 두고, 새 버전을 만듭니다.</p>}
          {message.error && <p role="alert" className="text-xs text-danger">{message.error}</p>}
          {message.ok && !dirty && <p className="text-xs text-brand">{message.ok}</p>}
        </div>
      )}

      <details className="card">
        <summary className="cursor-pointer text-sm font-semibold">
          가구 목록 · {option.furniture.reduce((s, f) => s + f.qty, 0)}점 ({option.title} · {style.name} 기준)
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>종류</th>
                <th>규격 (mm)</th>
                <th>수량</th>
                <th>색상</th>
              </tr>
            </thead>
            <tbody>
              {option.furniture.map((f) => {
                const color = styleColor(style, f.color);
                return (
                  <tr key={`${f.type}${f.spec}${f.color}`}>
                    <td>{f.type}</td>
                    <td className="text-muted">{f.spec}</td>
                    <td>{f.qty}</td>
                    <td>
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                        <i className="inline-block size-3.5 rounded border border-black/10" style={{ background: color }} />
                        {color}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">배치 모델에 쓰인 개념 가구이며 실제 제품 지정이 아닙니다.</p>
      </details>
    </div>
  );
}
