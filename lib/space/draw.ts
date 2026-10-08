import type { LayoutOption } from "../layout/types";
import { bbox } from "./check";
import { cellsOf, type Pt } from "./geometry";

// 평면 그리기에 쓰는 실제 구조의 모양. 편집 평면(미터)과 치수 평면도(픽셀)가 같은 값을 각자 축척으로 그린다.

export type Seg = [number, number, number, number];

export interface FixtureMark {
  id: string;
  label: string;
  status: "proposed" | "confirmed";
  box: { x: number; y: number; w: number; d: number };
}

export function shellGeometry(option: LayoutOption) {
  const { W, D } = option;
  const pts: Pt[] = option.outline ?? [
    [0, 0],
    [W, 0],
    [W, D],
    [0, D],
  ];
  const e = option.marks.entrance;
  const entrance: Seg = e.seg ?? [e.x1, 0, e.x2, 0];
  const inward: Pt = e.inward ?? [0, 1];
  const windows: Seg[] = option.marks.windows.map((w) => {
    if (w.seg) return w.seg;
    if (w.wall === "left") return [0, w.x1, 0, w.x2];
    if (w.wall === "right") return [W, w.x1, W, w.x2];
    if (w.wall === "front") return [w.x1, 0, w.x2, 0];
    return [w.x1, D, w.x2, D];
  });
  const water = option.objects.filter((o) => o.kind === "utility").map((o, i) => ({ n: i + 1, x: o.x + o.w / 2, y: o.y + o.d / 2 }));
  const poly = !!option.outline;
  // 다각형: 변 번호와 길이(출입문·창·급배수 위치를 ‘벽 N’으로 가리킨다).
  // 이름은 벽 바깥에 두고, 출입문이 있는 벽은 출입문 표기와 겹치지 않게 문을 뺀 긴 쪽 가운데에 둔다.
  const edges = poly
    ? pts.map((a, i) => {
        const b = pts[(i + 1) % pts.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const dir: Pt = [(b[0] - a[0]) / (len || 1), (b[1] - a[1]) / (len || 1)];
        const along = (x: number, y: number) => (x - a[0]) * dir[0] + (y - a[1]) * dir[1];
        const off = (x: number, y: number) => Math.abs((x - a[0]) * dir[1] - (y - a[1]) * dir[0]);
        let t = len / 2;
        if (off(entrance[0], entrance[1]) < 1e-3 && off(entrance[2], entrance[3]) < 1e-3) {
          const [d1, d2] = [along(entrance[0], entrance[1]), along(entrance[2], entrance[3])].sort((x, y) => x - y);
          if (d2 > 0 && d1 < len) t = d1 >= len - d2 ? d1 / 2 : (d2 + len) / 2;
        }
        return { n: i + 1, a, b, len, mid: [a[0] + dir[0] * t, a[1] + dir[1] * t] as Pt, out: [dir[1], -dir[0]] as Pt, vertical: Math.abs(dir[1]) > 0.5 };
      })
    : [];
  const fixtures: FixtureMark[] = (option.groups ?? []).flatMap((g) => {
    const status = g.fixture ?? (g.locked ? "proposed" : undefined);
    if (!status) return [];
    const parts = option.objects.filter((o) => o.g === g.id && o.plan);
    if (!parts.length) return [];
    return [{ id: g.id, label: g.label, status, box: bbox(parts) }];
  });
  return { pts, poly, entrance, inward, windows, water, edges, fixtures, voids: poly ? cellsOf(pts).outside : [] };
}

/** 설비 위치 표시. confirmed는 고객이 확인한 것이며 업체 확인은 아니다. */
export const FIXTURE_TEXT = { proposed: "자동 제안 위치", confirmed: "고객이 확인한 설비 위치" } as const;
