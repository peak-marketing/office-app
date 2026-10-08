"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { CONCEPT_FURNITURE_TEXT } from "@/lib/space/home-room";
import { HOUSE_AREA_NOTE, HOUSE_FIXED_NOTE, HOUSE_LABEL, areaText, describeHouse, roomsOf, type HouseModel } from "@/lib/space/house";
import { HOUSE_CHECK_DISCLAIMER, HOUSE_GAP_CHECK, runHouseChecks } from "@/lib/space/house-check";
import { composeHouse } from "@/lib/space/house-geom";
import { detectRooms } from "@/lib/space/house-rooms";
import HousePlan from "./HousePlan";

const Viewer3D = dynamic(() => import("@/components/Viewer3D"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-muted">3D 화면을 불러오는 중…</div>,
});

/** 저장한(또는 업체에 보낸) 집 전체 평면을 본다. 평면을 먼저 보여 주고 3D는 눌러서 연다. 평면과 3D는 같은 데이터로 그린다. */
export default function HouseView({ house, note, underlayUrl, compact = false }: { house: HouseModel; note?: string; underlayUrl?: string | null; compact?: boolean }) {
  const det = useMemo(() => detectRooms(house), [house]);
  const report = useMemo(() => runHouseChecks(house, det), [house, det]);
  const [tab, setTab] = useState<"plan" | "3d">("plan");
  const [under, setUnder] = useState(false);
  const option = useMemo(() => (tab === "3d" ? composeHouse(house, det) : null), [tab, house, det]);
  const d = describeHouse(house, det);
  const rooms = roomsOf(det);
  const itemsIn = (idx: number) => house.items.filter((it) => report.itemRoom[it.id] === idx);

  return (
    <div className="space-y-3" data-testid="house-view" data-house-rev={house.rev}>
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-sm">평면 {house.rev}</b>
        <span className="rounded-full border border-warn/40 bg-warn-soft px-2.5 py-1 text-xs font-medium leading-snug text-warn" data-testid="house-label">
          {HOUSE_LABEL}
        </span>
      </div>
      {house.provenance && <div className="rounded-xl bg-warn-soft p-3 text-xs text-warn" data-testid="house-provenance"><b>{house.provenance.label} · 업체 확인 전</b><ul className="mt-1 space-y-1">{house.provenance.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></div>}
      {note && (
        <p className="text-xs leading-relaxed text-muted" data-testid="house-note">
          {note}
        </p>
      )}
      <div className="overflow-hidden rounded-xl border border-line bg-white">
        <div className="no-print flex flex-wrap items-center gap-1 border-b border-line bg-surface p-2">
          <button type="button" className={`btn btn-sm ${tab === "plan" ? "btn-primary" : ""}`} aria-pressed={tab === "plan"} onClick={() => setTab("plan")} data-testid="house-tab-plan">
            평면
          </button>
          <button type="button" className={`btn btn-sm ${tab === "3d" ? "btn-primary" : ""}`} aria-pressed={tab === "3d"} onClick={() => setTab("3d")} data-testid="house-tab-3d">
            3D
          </button>
          {house.underlay && underlayUrl && tab === "plan" && (
            <label className="ml-auto flex items-center gap-1.5 pr-2 text-xs text-muted">
              <input type="checkbox" className="accent-brand" checked={under} onChange={(e) => setUnder(e.target.checked)} data-testid="house-underlay-toggle" /> 도면 밑그림
            </label>
          )}
        </div>
        {tab === "plan" ? (
          <div className="max-h-[680px] overflow-auto p-2">
            <HousePlan house={house} det={det} report={report} underlayUrl={under ? underlayUrl : null} />
          </div>
        ) : (
          option && (
            <div data-testid="house-3d">
              <Viewer3D option={option} styleId="natural" className={compact ? "h-[340px]" : "h-[420px] lg:h-[520px]"} />
              <p className="border-t border-line px-3 py-2 text-[11px] text-muted">평면과 같은 데이터로 그린 3D예요. 기본은 벽을 낮춰 보여 주고, ‘외벽 전체’를 켜면 내부 벽까지 천장 높이로 보여요. {HOUSE_LABEL}.</p>
            </div>
          )
        )}
      </div>
      <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm" data-testid="house-summary">
        <dt className="text-muted">바깥 크기</dt>
        <dd>
          {d.size} <span className="text-xs text-muted">· {d.source}</span>
        </dd>
        <dt className="text-muted">면적</dt>
        <dd>{d.area}</dd>
        <dt className="text-muted">천장 높이</dt>
        <dd>{d.height}</dd>
        <dt className="text-muted">방</dt>
        <dd>
          <ul className="space-y-0.5" data-testid="house-rooms">
            {rooms.map((r) => (
              <li key={r.idx} data-testid="house-room" data-name={r.name} data-area={r.area}>
                <b className={r.name ? "" : "font-normal text-muted"}>{r.display}</b> · 약 {areaText(r.area)}
                {itemsIn(r.idx).length > 0 && <span className="text-xs text-muted"> · 가구 {itemsIn(r.idx).map((it) => it.label).join(", ")}</span>}
              </li>
            ))}
            {!rooms.length && <li className="text-muted">벽으로 나뉜 방이 없어요.</li>}
          </ul>
          <span className="block text-xs text-muted">{HOUSE_AREA_NOTE}</span>
        </dd>
        <dt className="text-muted">문·통로</dt>
        <dd>{d.doors}</dd>
        <dt className="text-muted">창</dt>
        <dd>{d.windows}</dd>
        <dt className="text-muted">고정 구조물</dt>
        <dd>
          {d.fixed}
          {house.fixed.length > 0 && <span className="block text-xs text-muted">{HOUSE_FIXED_NOTE}</span>}
        </dd>
        <dt className="text-muted">가구</dt>
        <dd>
          {d.items}
          {house.items.length > 0 && <span className="block text-xs text-muted">{CONCEPT_FURNITURE_TEXT}</span>}
        </dd>
        <dt className="text-muted">자동 검사</dt>
        <dd data-testid="house-checks">
          {report.issues.length ? <span className="text-warn">확인할 것 {report.issues.length}</span> : <span className="text-muted">검사 항목에서 걸린 곳 없음</span>}
          <span className="text-muted"> · 통로 간격 알림 {report.notices.length}곳(편집 참고)</span>
          {(report.issues.length > 0 || report.notices.length > 0) && (
            <details className="mt-1 text-xs">
              <summary className="cursor-pointer text-muted">자세히</summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {report.issues.map((i) => (
                  <li key={i.text} className="text-warn">
                    {i.text}
                  </li>
                ))}
                {report.notices.map((n) => (
                  <li key={n.text} className="text-muted">
                    편집 참고: {n.text}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-muted">{HOUSE_GAP_CHECK.desc}</p>
            </details>
          )}
          <span className="block text-xs text-muted">{HOUSE_CHECK_DISCLAIMER}</span>
        </dd>
      </dl>
    </div>
  );
}
