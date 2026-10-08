// 배치 검사. 편집 화면, 고객·업체 화면, 배치 엔진 검사 스크립트가 같은 규칙을 쓴다.
// 여기서 보는 것은 아래 항목뿐이다. 경고가 없다고 해서 시공할 수 있다는 뜻이 아니다.

export interface Box {
  x: number;
  y: number;
  w: number;
  d: number;
}

/** 검사 기준. 문 앞 여유는 아직 확정하지 않은 현재 임시 검사값이다. */
export const DOOR_CLEARANCE = 0.75;
export const DOOR_CLEARANCE_NOTE = "현재 임시 검사값 750mm";
/**
 * 탕비 설비와 고객이 입력한 급배수 위치 사이 직선거리. 이보다 멀면 거리만 알린다(현재 임시 알림 거리).
 * 배관 연결 가능 여부는 판정하지 않는다.
 */
export const WATER_REACH = 3;
export const WATER_REACH_NOTE = "현재 임시 알림 거리 직선 3,000mm";
const PART_T = 0.1;
/** 맞닿은 가구를 겹침으로 세지 않도록 두는 여유 */
const EPS = 0.03;

export type CheckKey = "overlap" | "bounds" | "pillar" | "partition" | "door" | "structure" | "fixture" | "seats";

export const CHECKS: { key: CheckKey; label: string; desc: string }[] = [
  { key: "overlap", label: "가구끼리 겹침", desc: "평면에서 가구 바닥면이 서로 겹치는지 봅니다." },
  { key: "bounds", label: "공간 밖 배치", desc: "가구가 입력한 실내 치수(도면에서 따라 그린 모양) 밖으로 나갔는지 봅니다." },
  { key: "pillar", label: "기둥과 겹침", desc: "입력한 기둥 위치와 가구가 겹치는지 봅니다." },
  { key: "partition", label: "제안 칸막이와 겹침", desc: "자동 배치가 제안한 칸막이·유리벽과 가구가 겹치는지 봅니다." },
  { key: "door", label: `문·출입구 앞 여유 (${DOOR_CLEARANCE_NOTE})`, desc: "출입문과 방 문 앞 750mm 안에 가구가 있는지 봅니다. 750mm는 확정 전 임시 검사값이라 바뀔 수 있습니다. 문 열림 방향과 열리는 폭은 보지 않습니다." },
  { key: "structure", label: "제안 칸막이와 실제 구조", desc: "자동 배치의 칸막이가 입력한 기둥이나 출입문을 가로막는지 봅니다." },
  { key: "fixture", label: `탕비 설비와 급배수 거리 알림 (${WATER_REACH_NOTE})`, desc: "자동 제안 위치의 탕비 설비가 고객이 입력한 급배수 위치에서 직선 3,000mm 넘게 떨어지면 거리만 알립니다. 배관 연결이 되는지는 판정하지 않습니다(배관 경로·구배·바닥 구조를 보지 않음). 급배수 위치를 넣지 않았으면 알리지 않습니다." },
  { key: "seats", label: "업무석 수", desc: "놓인 업무석이 요청한 좌석 수보다 적은지 봅니다." },
];

/** 자동 검사가 보지 않는 것. 화면에 함께 적는다. */
export const NOT_CHECKED = ["통로 폭과 피난 동선", "소방·건축 법규", "배관 경로와 구배, 전기·냉난방 설비", "문 열림 방향", "실제 제품 규격", "천장·바닥 마감과 구조"];
export const CHECK_DISCLAIMER = "자동 검사는 위 항목만 확인합니다. 걸린 곳이 없어도 시공할 수 있다는 뜻은 아니며, 현장 실측과 업체 확인이 필요합니다.";

export interface CheckItem {
  id: string;
  label: string;
  /** 평면에 보이는 부품의 실제 위치 */
  parts: Box[];
  /** 고객이 실제 위치로 확인한 설비 */
  locked?: boolean;
  /** 자동 배치가 제안한 설비 위치(급배수 확인 전) */
  proposedFixture?: boolean;
  wall?: boolean;
  seat?: boolean;
}

export interface CheckScene {
  W: number;
  D: number;
  items: CheckItem[];
  /** 자동 배치가 제안한 칸막이·유리 */
  partitions: Box[];
  pillars: Box[];
  /** 방 문(칸막이에 낸 개구부) */
  doors: { x: number; y: number; w: number; vertical?: boolean }[];
  /** 출입문. seg·inward가 있으면(다각형) 그 구간에서 안쪽으로 본다. */
  entrance: { x1: number; x2: number; seg?: [number, number, number, number]; inward?: [number, number] };
  /** 바깥 사각형 안에서 공간이 아닌 부분(다각형). 직사각형이면 없음 */
  voids?: Box[];
  /** 확인된 급배수 위치 */
  water?: [number, number][];
  /** 요청한 업무석 수. 모르면 null */
  staff: number | null;
}

export interface Issue {
  key: CheckKey;
  ids: string[];
  text: string;
}

export interface CheckReport {
  results: { key: CheckKey; label: string; desc: string; issues: Issue[] }[];
  issues: Issue[];
  seats: number;
}

export const overlaps = (a: Box, b: Box, eps = EPS) => a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.y < b.y + b.d - eps && b.y < a.y + a.d - eps;

export function bbox(parts: Box[]): Box {
  const x1 = Math.min(...parts.map((p) => p.x));
  const y1 = Math.min(...parts.map((p) => p.y));
  const x2 = Math.max(...parts.map((p) => p.x + p.w));
  const y2 = Math.max(...parts.map((p) => p.y + p.d));
  return { x: x1, y: y1, w: x2 - x1, d: y2 - y1 };
}

/** 받침 있는 낱말이면 a, 없으면 b. 숫자는 읽는 소리로 본다. */
export function josa(word: string, a: string, b: string) {
  const ch = word.trim().slice(-1);
  if (/[0-9]/.test(ch)) return word + ("013678".includes(ch) ? a : b);
  const code = ch.charCodeAt(0) - 0xac00;
  return word + (code >= 0 && code <= 11171 && code % 28 ? a : b);
}

/** 문 앞 여유 구역. 방 문은 칸막이 양쪽, 출입문은 안쪽만 본다. */
export function doorZones(scene: Pick<CheckScene, "doors" | "entrance">) {
  const c = DOOR_CLEARANCE;
  const zones: (Box & { label: string })[] = [];
  for (const d of scene.doors) {
    if (d.vertical) zones.push({ x: d.x - c, y: d.y, w: c, d: d.w, label: "방 문" }, { x: d.x + PART_T, y: d.y, w: c, d: d.w, label: "방 문" });
    else zones.push({ x: d.x, y: d.y - c, w: d.w, d: c, label: "방 문" }, { x: d.x, y: d.y + PART_T, w: d.w, d: c, label: "방 문" });
  }
  const e = scene.entrance;
  if (e.seg && e.inward) {
    const [ax, ay, bx, by] = e.seg;
    const [nx, ny] = e.inward;
    const x1 = Math.min(ax, bx, ax + nx * c, bx + nx * c), x2 = Math.max(ax, bx, ax + nx * c, bx + nx * c);
    const y1 = Math.min(ay, by, ay + ny * c, by + ny * c), y2 = Math.max(ay, by, ay + ny * c, by + ny * c);
    zones.push({ x: x1, y: y1, w: x2 - x1, d: y2 - y1, label: "출입문" });
  } else zones.push({ x: e.x1, y: 0, w: e.x2 - e.x1, d: c, label: "출입문" });
  return zones;
}

export function runChecks(scene: CheckScene): CheckReport {
  const issues: Issue[] = [];
  const add = (key: CheckKey, ids: string[], text: string) => issues.push({ key, ids, text });
  const { W, D, items } = scene;
  const boxes = items.map((it) => (it.parts.length ? bbox(it.parts) : null));
  const zones = doorZones(scene);
  const hits = (parts: Box[], b: Box) => parts.some((p) => overlaps(p, b));

  items.forEach((it, i) => {
    const f = boxes[i];
    if (!f) return;
    const name = it.label;
    if (f.x < -0.01 || f.y < -0.01 || f.x + f.w > W + 0.01 || f.y + f.d > D + 0.01 || (scene.voids ?? []).some((v) => hits(it.parts, v))) add("bounds", [it.id], `${josa(name, "이", "가")} 공간 밖으로 나갔어요`);
    if (scene.pillars.some((p) => hits(it.parts, p))) add("pillar", [it.id], `${josa(name, "이", "가")} 기둥과 겹쳐요`);
    if (!it.wall && !it.locked && scene.partitions.some((p) => hits(it.parts, p))) add("partition", [it.id], `${josa(name, "이", "가")} 제안 칸막이와 겹쳐요`);
    if (!it.wall) {
      const z = zones.find((zone) => hits(it.parts, zone));
      if (z) add("door", [it.id], `${josa(name, "이", "가")} ${z.label} 앞 750mm(임시 검사값) 안에 있어요`);
    }
    for (let j = i + 1; j < items.length; j++) {
      const g = boxes[j];
      if (!g || !overlaps(f, g)) continue;
      if (it.parts.some((p) => hits(items[j].parts, p))) add("overlap", [it.id, items[j].id], `${josa(name, "과", "와")} ${josa(items[j].label, "이", "가")} 겹쳐요`);
    }
  });

  // 자동 배치의 칸막이가 실제 구조를 가로막는지
  const entranceZone = zones[zones.length - 1];
  if (scene.partitions.some((p) => overlaps(p, entranceZone))) add("structure", [], "제안 칸막이가 출입문 앞을 가로막아요. 다른 시작 배치를 고르거나 빈 공간에서 시작해 주세요.");
  scene.pillars.forEach((pl, k) => {
    if (scene.partitions.some((p) => overlaps(p, pl, 0.01))) add("structure", [], `제안 칸막이가 기둥 ${k + 1}과 겹쳐요. 칸막이 위치는 업체와 현장에서 맞춰야 해요.`);
  });

  // 자동 제안 위치의 탕비 설비가 확인된 급배수 위치에서 먼지
  if (scene.water?.length)
    items.forEach((it, i) => {
      const f = boxes[i];
      if (!it.proposedFixture || !f) return;
      const cx = f.x + f.w / 2, cy = f.y + f.d / 2;
      const dist = Math.min(...scene.water!.map(([x, y]) => Math.hypot(x - cx, y - cy)));
      if (dist > WATER_REACH) add("fixture", [it.id], `${josa(it.label, "이", "가")} 고객이 입력한 급배수 위치에서 직선 약 ${(Math.round(dist * 10) / 10).toFixed(1)}m 떨어져 있어요(거리 알림). 연결 가능 여부는 판정하지 않으며 업체가 현장에서 확인해요`);
    });

  const seats = items.filter((it) => it.seat).length;
  if (scene.staff != null && seats < scene.staff) add("seats", [], `업무석이 ${scene.staff - seats}석 부족해요 (요청 ${scene.staff}석 · 지금 ${seats}석)`);

  return {
    results: CHECKS.map((c) => ({ ...c, issues: issues.filter((x) => x.key === c.key) })),
    issues,
    seats,
  };
}
