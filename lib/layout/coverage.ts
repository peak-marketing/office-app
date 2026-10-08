import { INTAKE_MODES, PRIORITIES, mm } from "../constants";
import type { LayoutInput, LayoutOption, LayoutResult } from "./types";

// 입력한 정보가 배치에 어떻게 쓰였는지. 고객·운영자·시공사 화면이 같은 표를 쓴다.
export type CoverageKind = "applied" | "assumed" | "forwarded" | "review";

export const COVERAGE_KIND: Record<CoverageKind, { label: string; hint: string }> = {
  applied: { label: "배치에 반영", hint: "입력한 값으로 배치를 계산했습니다." },
  assumed: { label: "가정", hint: "입력이 없거나 받지 않는 값이라 정해 둔 값으로 계산했습니다. 실제와 다를 수 있습니다." },
  forwarded: { label: "전달만", hint: "배치 계산에는 쓰지 않고 운영자와 참여 시공사에 그대로 전달합니다." },
  review: { label: "검토 필요", hint: "자동 배치가 다루지 못하는 조건입니다. 운영자가 확인합니다." },
};

export interface CoverageRow {
  label: string;
  value: string;
  kind: CoverageKind;
  note: string;
}

export function inputCoverage(input: LayoutInput, result: LayoutResult | null, extra: { files?: number; refs?: number } = {}): CoverageRow[] {
  const hasDims = !!(input.widthM && input.depthM);
  const rooms = [input.ceo && "대표실", input.meeting && `회의실 ${input.meetingSeats}인`, input.pantry && "탕비실", input.storage && "창고"].filter(Boolean).join(", ");
  const size = result?.W && result.D ? `${mm(result.W)} × ${mm(result.D)} mm` : "";
  const noDims = !!input.intake && !hasDims;
  const rows: CoverageRow[] = [
    ...(input.intake ? [{ label: "가진 자료", value: INTAKE_MODES[input.intake].label, kind: "applied" as const, note: noDims ? "치수를 알 때만 배치안을 만듭니다." : "입력한 치수로 배치안을 만듭니다." }] : []),
    noDims
      ? { label: "가로·세로", value: "미입력", kind: "review", note: "평수로 치수를 가정해 3D를 만들지 않습니다. 운영자가 도면·사진을 보고 필요한 자료를 확인합니다." }
      : hasDims
      ? { label: "가로·세로", value: `${input.widthM} × ${input.depthM} m`, kind: "applied", note: "입력한 치수로 외곽을 그렸습니다. 벽 두께와 굴곡은 반영하지 않습니다." }
      : { label: "가로·세로", value: size ? `${input.areaPyeong}평 → ${size}` : `${input.areaPyeong}평`, kind: "assumed", note: "치수를 입력하지 않아 평수를 가로 11 : 세로 9 비율의 직사각형으로 가정했습니다." },
    input.shape === "rect"
      ? { label: "공간 형태", value: "직사각형", kind: "applied", note: "직사각형만 자동 배치합니다." }
      : { label: "공간 형태", value: "ㄱ자·다각형 등", kind: "review", note: "자동 배치를 만들지 않습니다. 사진과 도면을 보고 운영자가 검토합니다." },
    { label: "직원 좌석", value: `${input.staff}석`, kind: "applied", note: "모든 배치안이 이 좌석 수를 채웁니다. 채울 수 없는 배치안은 만들지 않습니다." },
    { label: "필요한 방", value: rooms || "없음(개방형)", kind: "applied", note: "모든 배치안이 이 방을 빠짐없이 포함합니다. 방 크기는 공간에 맞춰 정합니다." },
    input.entrance === "other"
      ? { label: "출입구", value: "가운데 또는 다른 벽", kind: "review", note: "동선을 자동으로 짤 수 없어 운영자가 검토합니다." }
      : { label: "출입구", value: `전면 ${input.entrance === "left" ? "왼쪽" : "오른쪽"}`, kind: "applied", note: "왼쪽·오른쪽만 반영합니다. 정확한 위치와 폭(1,200mm)은 가정입니다." },
    input.windowWall === "other"
      ? { label: "창", value: "옆 벽이나 여러 면", kind: "forwarded", note: "창 위치는 배치에 반영하지 못했습니다. 창을 그리지 않았고 시공사에 전달합니다." }
      : { label: "창", value: "출입구 맞은편 벽", kind: input.windowWall === "rear" ? "applied" : "assumed", note: input.windowWall === "rear" ? "창이 있는 벽만 반영합니다. 창의 개수와 크기는 가정입니다." : "창 위치를 입력하지 않아 출입구 맞은편 벽 전체에 있다고 가정했습니다." },
    input.pillars > 0
      ? { label: "실내 기둥", value: `${input.pillars}개`, kind: "review", note: "기둥 위치를 받지 않아 자동 배치를 만들지 않습니다. 운영자가 검토합니다." }
      : { label: "실내 기둥", value: "없음", kind: "applied", note: "기둥이 없는 공간으로 배치했습니다." },
    { label: "천장 높이·설비", value: "2,700 mm", kind: "assumed", note: "천장 높이, 분전반, 급배수, 냉난방기 위치는 받지 않습니다. 시공사가 현장에서 확인합니다." },
    { label: "중요하게 보는 것", value: PRIORITIES[input.priority ?? "unknown"], kind: "applied", note: "어느 배치안을 먼저 권할지에만 씁니다. 배치안 자체는 바뀌지 않습니다." },
  ];
  if (input.siteNotes?.trim()) rows.push({ label: "현장 메모", value: input.siteNotes.trim(), kind: "forwarded", note: "글로 적은 출입문·창문·기둥 위치는 배치에 반영하지 않습니다." });
  if (input.reuseFurniture?.trim()) rows.push({ label: "재사용 가구", value: input.reuseFurniture.trim(), kind: "forwarded", note: "배치안의 가구 목록에는 반영하지 않습니다." });
  if (extra.files != null) rows.push({ label: "현장 사진·기존 도면", value: extra.files ? `${extra.files}개` : "없음", kind: "forwarded", note: "사진과 도면에서 치수나 벽 위치를 읽어 내지 않습니다. 운영자와 참여 시공사가 봅니다." });
  if (extra.refs != null) rows.push({ label: "참고 사례", value: extra.refs ? `${extra.refs}건` : "없음", kind: "forwarded", note: "원하는 분위기를 알리는 자료입니다. 배치 계산에는 쓰지 않습니다." });
  return rows;
}

/** 저장된 선택에 해당하는 배치안. 없으면 첫 번째. */
export function pickOption(result: LayoutResult, id: string | null | undefined): LayoutOption | undefined {
  return result.options.find((o) => o.id === id) ?? result.options[0];
}
