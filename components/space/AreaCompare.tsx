import { PYEONG } from "@/lib/layout/types";

const sign = (n: number, digits = 1) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(digits)}`;

/**
 * 계산 면적과 고객이 입력한 전용면적을 숫자로 나란히 보여 준다. 맞는지 판정하지 않는다.
 * 계약서 면적은 산정 방식이 달라 실내 면적과 다를 수 있다.
 */
export default function AreaCompare({ area, hint, testid }: { area: number; hint: number | null; testid?: string }) {
  const hintM2 = hint ? hint * PYEONG : null;
  const diff = hintM2 != null ? area - hintM2 : null;
  const pct = hintM2 ? (diff! / hintM2) * 100 : null;
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs tabular-nums" data-testid={testid}>
      <dt className="text-muted">계산 면적</dt>
      <dd className="font-semibold">
        {area.toFixed(1)}㎡ · 약 {(area / PYEONG).toFixed(1)}평
      </dd>
      {hintM2 != null && (
        <>
          <dt className="text-muted">입력 면적</dt>
          <dd>
            {hint}평 · {hintM2.toFixed(1)}㎡
          </dd>
          <dt className="text-muted">차이</dt>
          <dd data-testid={testid ? `${testid}-diff` : undefined}>
            {sign(diff!)}㎡ ({sign(pct!)}%)
          </dd>
          <dd className="col-span-2 mt-1 leading-relaxed text-muted">
            계약서 전용면적은 벽 두께·기둥·공용 부분을 넣는 방식에 따라 실내 면적과 다를 수 있어요. 숫자만 보여 드리고 맞는지는 판정하지 않아요.
            {Math.abs(pct!) > 10 && <span className="mt-0.5 block text-warn">차이가 10%를 넘어요. 치수(축척)나 입력한 면적을 한 번 더 확인해 보세요.</span>}
          </dd>
        </>
      )}
    </dl>
  );
}
