import { normalizeOutline, type Pt } from "../space/geometry";
import { houseErrors, newHouse, r3, wallLines, type HouseModel, type OpeningKind, type RoomKind } from "../space/house";
import { houseWarnings } from "../space/house-check";
import { detectRooms } from "../space/house-rooms";

// AI only reads image coordinates. Physical scale always comes from a customer-confirmed length.
export interface PlanRecognition {
  isFloorplan: boolean;
  supported: boolean;
  outline: Pt[];
  walls: { a: Pt; b: Pt }[];
  openings: { kind: OpeningKind; a: Pt; b: Pt }[];
  labels: { point: Pt; name: string; kind: RoomKind }[];
  widthMm: number | null;
  dimensionEvidence: string;
  warnings: string[];
}

const kinds = ["door", "bath", "entry", "balcony", "sliding", "passage", "window"];
const rooms = ["living", "bed", "kitchen", "bath", "entry", "balcony", "dress", "utility", "other"];
const ptSchema = { type: "array", items: { type: "number", minimum: 0, maximum: 1 }, minItems: 2, maxItems: 2 };
const object = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, properties, required: Object.keys(properties) });
export const recognitionSchema = object({
  isFloorplan: { type: "boolean" }, supported: { type: "boolean" },
  outline: { type: "array", items: ptSchema, maxItems: 64 },
  walls: { type: "array", items: object({ a: ptSchema, b: ptSchema }), maxItems: 150 },
  openings: { type: "array", items: object({ kind: { type: "string", enum: kinds }, a: ptSchema, b: ptSchema }), maxItems: 80 },
  labels: { type: "array", items: object({ point: ptSchema, name: { type: "string" }, kind: { type: "string", enum: rooms } }), maxItems: 40 },
  widthMm: { type: ["number", "null"] }, dimensionEvidence: { type: "string" },
  warnings: { type: "array", items: { type: "string" }, maxItems: 30 },
});

/** Do not trust JSON Schema alone; fixtures, provider errors and client payloads pass this same parser. */
export function parseRecognition(raw: unknown): PlanRecognition {
  if (!raw || typeof raw !== "object") throw new Error("도면 인식 결과를 읽지 못했어요.");
  const x = raw as PlanRecognition;
  const point = (p: unknown) => Array.isArray(p) && p.length === 2 && p.every(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1);
  const list = (v: unknown, max: number) => Array.isArray(v) && v.length <= max;
  if (typeof x.isFloorplan !== "boolean" || typeof x.supported !== "boolean" || !list(x.outline, 64) || !x.outline.every(point)
    || !list(x.walls, 150) || !x.walls.every(w => w && point(w.a) && point(w.b))
    || !list(x.openings, 80) || !x.openings.every(o => o && kinds.includes(o.kind) && point(o.a) && point(o.b))
    || !list(x.labels, 40) || !x.labels.every(l => l && rooms.includes(l.kind) && point(l.point) && typeof l.name === "string" && l.name.length > 0 && l.name.length <= 20)
    || !(x.widthMm === null || typeof x.widthMm === "number" && Number.isFinite(x.widthMm) && x.widthMm >= 2000 && x.widthMm <= 40000)
    || typeof x.dimensionEvidence !== "string" || x.dimensionEvidence.length > 500
    || !list(x.warnings, 30) || !x.warnings.every(w => typeof w === "string" && w.length <= 500)) throw new Error("도면 인식 결과 형식이 맞지 않아요. 다시 인식하거나 따라 그리기를 이용해 주세요.");
  if (!x.isFloorplan) throw new Error("평면도로 확인되지 않았어요. 공간 사진 대신 벽과 방이 보이는 도면을 올려 주세요.");
  if (!x.supported) throw new Error("사선·곡선 벽이나 여러 층 등 현재 자동 인식 지원 범위를 벗어난 도면이에요. 수동 입력이나 상담을 이용해 주세요.");
  if (x.outline.length < 4) throw new Error("바깥 벽을 읽지 못했어요. 선명한 도면이나 따라 그리기를 이용해 주세요.");
  return structuredClone(x);
}

export function recognitionToHouse(raw: unknown, iw: number, ih: number, widthMm: number, heightMm = 2400, fileId = 0): HouseModel {
  const p = parseRecognition(raw);
  if (![iw, ih].every(n => Number.isInteger(n) && n > 0 && n <= 3000) || !(widthMm >= 2000 && widthMm <= 40000) || !(heightMm >= 2000 && heightMm <= 5000)) throw new Error("바깥 가로는 2,000~40,000mm, 천장은 2,000~5,000mm로 확인해 주세요.");
  const minX = Math.min(...p.outline.map(q => q[0])) * iw, maxX = Math.max(...p.outline.map(q => q[0])) * iw;
  const maxY = Math.max(...p.outline.map(q => q[1])) * ih;
  if (maxX - minX < 5) throw new Error("도면 바깥 폭을 읽지 못했어요.");
  const s = widthMm / 1000 / (maxX - minX);
  const toPt = ([x, y]: Pt): Pt => [r3((x * iw - minX) * s), r3((maxY - y * ih) * s)];
  const outline = normalizeOutline(p.outline.map(toPt));
  const house = newHouse(outline, "trace", heightMm / 1000, { fileId, iw, ih, m: [s, 0, 0, -s, -minX * s, maxY * s] });
  house.walls = p.walls.map((w, i) => {
    let a = toPt(w.a), b = toPt(w.b);
    if (a[0] > b[0] || a[1] > b[1]) [a, b] = [b, a];
    return { id: `w${i + 1}`, a, b, t: 0.1 };
  });
  const structureErrors = houseErrors(house);
  if (structureErrors.length) throw new Error(`인식한 평면을 확인해야 해요: ${structureErrors[0]} 수동 따라 그리기로 수정할 수 있어요.`);
  // Never snap away a diagonal or move an opening to an unrelated wall.
  const lines = wallLines(house);
  house.openings = p.openings.map((o, i) => {
    const a = toPt(o.a), b = toPt(o.b);
    const near = lines.map(l => {
      const project = (q: Pt) => (q[0] - l.a[0]) * l.dir[0] + (q[1] - l.a[1]) * l.dir[1];
      const distance = (q: Pt) => Math.abs((q[0] - l.a[0]) * l.n[0] + (q[1] - l.a[1]) * l.n[1]);
      const aa = project(a), bb = project(b);
      return { l, at: Math.min(aa, bb), width: Math.abs(bb - aa), dist: Math.max(distance(a), distance(b)) };
    }).filter(v => v.dist <= 0.05 && v.at >= -0.001 && v.at + v.width <= v.l.len + 0.001).sort((a, b) => a.dist - b.dist);
    const n = near[0];
    if (!n) throw new Error(`문·창 ${i + 1}을 벽에 연결하지 못했어요. 도면을 다시 확인하거나 따라 그리기를 이용해 주세요.`);
    return { id: `d${i + 1}`, kind: o.kind, wall: n.l.ref, at: r3(Math.max(0, n.at)), width: r3(n.width), hinge: "a", side: o.kind === "entry" ? -1 : 1 };
  });
  house.labels = p.labels.map((l, i) => { const [x, y] = toPt(l.point); return { id: `l${i + 1}`, x, y, name: l.name, kind: l.kind }; });
  const errors = houseErrors(house);
  if (errors.length) throw new Error(`인식한 평면을 확인해야 해요: ${errors[0]} 수동 따라 그리기로 수정할 수 있어요.`);
  house.provenance = { kind: "ai", label: "AI 도면 인식 초안 · 고객 치수 확인", warnings: [
    "AI 인식 초안이에요. 벽·문·창이 누락되거나 위치·폭이 다를 수 있어요. 원본 도면과 비교해 수정해 주세요.",
    ...p.warnings,
    ...houseWarnings(house, detectRooms(house)).map(w => `인식 시 확인 사항: ${w}`),
    "내·외벽 두께, 천장 높이, 문 열림 방향은 편집 시작값이에요. 실제 도면과 비교해 고쳐 주세요.",
  ] };
  return house;
}
