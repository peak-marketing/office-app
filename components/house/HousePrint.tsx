import { CONCEPT_FURNITURE_TEXT } from "@/lib/space/home-room";
import { HOUSE_AREA_NOTE, HOUSE_LABEL, HOUSE_VENDOR_TEXT, areaText, describeHouse, roomsOf, type HouseModel } from "@/lib/space/house";
import { runHouseChecks } from "@/lib/space/house-check";
import { detectRooms } from "@/lib/space/house-rooms";
import HousePlan from "./HousePlan";

/** 인쇄·PDF용 집 전체 평면(평면 그림과 요약). 3D 없이 그린다. */
export default function HousePrint({ house }: { house: HouseModel }) {
  const det = detectRooms(house);
  const report = runHouseChecks(house, det);
  const d = describeHouse(house, det);
  return (
    <figure className="break-inside-avoid rounded-lg border border-line p-3" data-testid="print-house">
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <b>집 전체 평면 · 평면 {house.rev}</b>
        <span className="text-[11px] text-warn">{HOUSE_LABEL}</span>
      </figcaption>
      <p className="mb-2 text-xs text-muted">{HOUSE_VENDOR_TEXT}</p>
      {house.provenance && <p className="mb-2 text-xs text-warn">{house.provenance.label} · 업체 확인 전 · {house.provenance.warnings.join(" ")}</p>}
      <HousePlan house={house} det={det} report={report} testid="print-house-plan" />
      <dl className="mt-2 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[11px]">
        <dt className="text-muted">바깥 크기</dt>
        <dd>
          {d.size} · 천장 {d.height}
        </dd>
        <dt className="text-muted">방</dt>
        <dd>{roomsOf(det).map((r) => `${r.display} 약 ${areaText(r.area)}`).join(" / ") || "없음"}</dd>
        <dt className="text-muted">문·통로·창</dt>
        <dd>
          {d.doors} · 창 {d.windows}
        </dd>
        <dt className="text-muted">고정 구조물</dt>
        <dd>{d.fixed}</dd>
        <dt className="text-muted">가구</dt>
        <dd>
          {d.items} · {CONCEPT_FURNITURE_TEXT}
        </dd>
        <dt className="text-muted">자동 검사</dt>
        <dd>
          확인할 것 {report.issues.length} · 통로 간격 알림 {report.notices.length}곳(편집 참고)
        </dd>
      </dl>
      <p className="mt-1 text-[10px] text-muted">{HOUSE_AREA_NOTE}</p>
    </figure>
  );
}
