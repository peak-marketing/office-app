import { styleColor, getStyle } from "@/lib/styles";
import type { FurnitureItem } from "@/lib/layout/types";
import { CHECK_DISCLAIMER, NOT_CHECKED, type CheckReport } from "@/lib/space/check";
import { SPACE_KIND, type SpaceRow } from "@/lib/space/coverage";

/** 자동 검사 결과. 무엇을 검사했는지 항목별로 보이고, 경고가 없어도 ‘시공 가능’이라고 하지 않는다. */
export function CheckList({ report, staff, title = "자동 검사" }: { report: CheckReport; staff: number; title?: string }) {
  return (
    <section className="card" data-testid="check-list">
      <h2 className="h-section">
        {title}{" "}
        <span className={`badge ml-1 ${report.issues.length ? "border-warn/30 bg-warn-soft text-warn" : "text-muted"}`}>{report.issues.length ? `확인할 것 ${report.issues.length}` : "검사 항목에서 걸린 곳 없음"}</span>
      </h2>
      <ul className="grid gap-2 text-sm sm:grid-cols-2">
        {report.results.map((c) => (
          <li key={c.key} className="rounded-lg border border-line bg-white p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold">
              <span className={`grid size-4 shrink-0 place-items-center rounded-full text-[9px] ${c.issues.length ? "bg-warn text-white" : "bg-sand text-muted"}`}>{c.issues.length || "✓"}</span>
              {c.label}
            </p>
            {c.issues.length ? (
              <ul className="mt-1 space-y-0.5 text-xs text-warn">
                {c.issues.map((i) => (
                  <li key={i.text}>{i.text}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[11px] text-muted">{c.desc}</p>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        업무석 {report.seats}석 · 요청 {staff}석. {CHECK_DISCLAIMER} 검사하지 않는 것: {NOT_CHECKED.join(", ")}.
      </p>
    </section>
  );
}

/** 실제 내 공간(입력)과 가정·자동 제안을 나눈 표 */
export function SpaceFacts({ rows }: { rows: SpaceRow[] }) {
  return (
    <div className="overflow-x-auto" data-testid="space-facts">
      <table className="table-base min-w-[600px]">
        <thead>
          <tr>
            <th className="w-32">항목</th>
            <th>값</th>
            <th className="w-24">구분</th>
            <th>배치·3D에 쓰인 방식</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="text-xs font-medium">{r.label}</td>
              <td className="text-xs">{r.value}</td>
              <td>
                <span className={`badge !border-transparent kind-${r.kind}`} title={SPACE_KIND[r.kind].hint}>
                  {SPACE_KIND[r.kind].label}
                </span>
              </td>
              <td className="text-xs leading-relaxed text-muted">{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">{(Object.keys(SPACE_KIND) as (keyof typeof SPACE_KIND)[]).map((k) => `${SPACE_KIND[k].label}: ${SPACE_KIND[k].hint}`).join(" ")}</p>
    </div>
  );
}

export function FurnitureTable({ furniture, styleId }: { furniture: FurnitureItem[]; styleId: string }) {
  const style = getStyle(styleId);
  return (
    <div className="overflow-x-auto">
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
          {furniture.map((f) => {
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
      <p className="mt-2 text-xs text-muted">배치에 쓰인 개념 가구이며 실제 제품 지정이 아닙니다.</p>
    </div>
  );
}
