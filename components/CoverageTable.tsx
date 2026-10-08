import { COVERAGE_KIND, type CoverageKind, type CoverageRow } from "@/lib/layout/coverage";

const COVERAGE_TONE: Record<CoverageKind, string> = {
  applied: "border-brand/30 bg-brand-soft text-brand",
  assumed: "border-warn/30 bg-warn-soft text-warn",
  forwarded: "bg-white text-muted",
  review: "border-danger/30 bg-warn-soft text-danger",
};

/** 입력한 정보가 배치에 반영됐는지, 가정인지, 시공사에 전달만 되는지 나눠 보여 준다. */
export function CoverageTable({ rows, dense = false }: { rows: CoverageRow[]; dense?: boolean }) {
  return (
    <div data-testid="coverage">
      <ul className={`divide-y divide-line ${dense ? "text-xs" : "text-sm"}`}>
        {rows.map((row) => (
          <li key={row.label} className="flex items-start gap-2.5 py-2 first:pt-0">
            <span className={`badge mt-0.5 w-[5.2rem] shrink-0 justify-center !px-1 ${COVERAGE_TONE[row.kind]}`}>{COVERAGE_KIND[row.kind].label}</span>
            <span className="min-w-0 flex-1">
              <b className="font-semibold">{row.label}</b>
              <span className="ml-1.5 break-words text-muted">{row.value}</span>
              {!dense && <span className="mt-0.5 block text-xs leading-relaxed text-muted">{row.note}</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        <b className="text-ink">가정</b>은 입력이 없어 정해 둔 값이고, <b className="text-ink">전달만</b>은 배치 계산에 쓰지 않고 운영자와 참여 시공사에 그대로 보내는 정보입니다.
      </p>
    </div>
  );
}
