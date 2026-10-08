// 내 공간(실제 구조)·가구 배치·배치 검사 단위 검사.
//   npm run check:space
// 서로 다른 치수로 공간이 그 치수대로 만들어지는지, 편집 결과를 서버가 원본에서 다시 채우는지,
// 검사 규칙이 정답이 정해진 사례에서 맞게 판정하는지 본다.
import { buildBrief } from "../lib/brief";
import { catalogItems, generateLayout } from "../lib/layout/generate";
import { runChecks, type CheckScene } from "../lib/space/check";
import { cellsOf, normalizeOutline, outlineErrors, polygonArea, type Pt } from "../lib/space/geometry";
import { checkOption, composeOption, diffPlacement, footprint, normalizeItems, placementFromOption, rebuildPlacement, rotateBox, toEdits, worldParts } from "../lib/space/placement";
import { entranceSupport, roomArea, roomToInput, shellMarks, shellObjects, validateRoom } from "../lib/space/room";
import { applyMat, closeOutline, draftFromPixels, draftToRoom, invertMat, nextTracePoint, orientDraft, pickEdge, rectifyOrtho, roomToDraft, setEdgeLength, snapOrtho, type TraceDraft } from "../lib/space/trace";
import type { PlacedItem, RoomModel } from "../lib/space/types";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else fails.push(`${name} ${extra}`);
};
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) <= e;

const room = (o: Partial<RoomModel> = {}): RoomModel => ({ shape: "rect", width: 11, depth: 9, height: null, entrance: { at: 9, width: 1.2 }, windows: null, pillars: [], source: "dims", ...o });
const needs = { staff: 10, ceo: true, meeting: true, meetingSeats: 6, pantry: true, storage: false, priority: "collab" as const, furnitureIncluded: true, mood: "unknown" as const, siteNotes: "", reuseFurniture: "" };

// 1. 입력 검사
ok("valid room", validateRoom(room()).length === 0);
ok("too small", validateRoom(room({ width: 1.5 })).length === 1);
ok("NaN size", validateRoom(room({ depth: NaN })).length === 1);
ok("entrance outside wall", validateRoom(room({ entrance: { at: 10.5, width: 1.2 } })).some((e) => e.includes("출입문")));
ok("entrance too narrow", validateRoom(room({ entrance: { at: 1, width: 0.5 } })).some((e) => e.includes("폭")));
ok("window outside wall", validateRoom(room({ windows: [{ wall: "left", at: 8, width: 2 }] })).some((e) => e.includes("창 1")));
ok("window over entrance", validateRoom(room({ windows: [{ wall: "front", at: 9.5, width: 1 }] })).some((e) => e.includes("출입문과 겹")));
ok("pillar outside", validateRoom(room({ pillars: [{ x: 10.8, y: 1, w: 0.5, d: 0.5 }] })).some((e) => e.includes("기둥 1")));
ok("pillar too small", validateRoom(room({ pillars: [{ x: 1, y: 1, w: 0.1, d: 0.5 }] })).some((e) => e.includes("크기")));
ok("height range", validateRoom(room({ height: 9 })).some((e) => e.includes("천장")));

// 2. 출입문 위치와 자동 배치
const eR = entranceSupport(room());
ok("right entrance offset 0.8", eR.side === "right" && near(eR.offset, 0.8) && eR.supported);
const eL = entranceSupport(room({ entrance: { at: 0.5, width: 0.9 } }));
ok("left entrance offset 0.5", eL.side === "left" && near(eL.offset, 0.5) && eL.supported);
const eC = entranceSupport(room({ entrance: { at: 5, width: 1.2 } }));
ok("center entrance unsupported", !eC.supported && !!eC.reason);
const inC = roomToInput(room({ entrance: { at: 5, width: 1.2 } }), needs);
ok("center entrance → no auto layout, reason", generateLayout(inC).options.length === 0 && generateLayout(inC).reasons.some((r) => r.includes("출입구")));
const inR = roomToInput(room({ windows: [{ wall: "rear", at: 1, width: 3 }] }), needs);
ok("input from room", inR.widthM === 11 && inR.depthM === 9 && inR.entrance === "right" && near(inR.entranceOffset!, 0.8) && inR.windowWall === "rear" && inR.pillars === 0 && near(inR.areaPyeong, 29.9, 0.05));
ok("unknown windows not assumed", roomToInput(room({ windows: null }), needs).windowWall === "other");

// 3. 서로 다른 치수 → 그 치수대로
for (const [W, D, at, ew] of [
  [11, 9, 9, 1.2],
  [7, 12, 0.5, 0.9],
  [15.3, 6.4, 2, 1.5],
  [4.2, 3.6, 0, 0.9],
] as const) {
  const r = room({ width: W, depth: D, entrance: { at, width: ew }, windows: [{ wall: "left", at: 0.5, width: 1 }], pillars: [{ x: 1, y: 1, w: 0.4, d: 0.6 }] });
  const objs = shellObjects(r);
  const floor = objs.find((o) => o.name === "바닥")!;
  ok(`floor ${W}x${D}`, floor.w === W && floor.d === D);
  const front = objs.filter((o) => o.name.startsWith("전면 벽") && !o.name.includes("상부"));
  const covered = front.reduce((s, o) => s + o.w, 0);
  ok(`front wall leaves entrance gap ${W}`, near(covered, W - ew, 1e-3), `${covered}`);
  ok(`gap position ${W}`, !front.some((o) => o.x < at + ew - 1e-6 && o.x + o.w > at + 1e-6));
  ok(`side walls length ${D}`, objs.filter((o) => o.name === "좌측 벽" || o.name === "우측 벽").every((o) => o.d === D));
  ok(`left window on left wall ${W}`, objs.some((o) => o.kind === "window" && o.x < 0.05 && near(o.y, 0.5) && near(o.d, 1)));
  ok(`pillar at input ${W}`, objs.some((o) => o.kind === "pillar" && o.x === 1 && o.y === 1 && o.w === 0.4 && o.d === 0.6));
  const marks = shellMarks(r);
  ok(`entrance mark ${W}`, near(marks.entrance.x1, at) && near(marks.entrance.x2, at + ew));
  const empty = composeOption(r, null, []);
  ok(`composed empty ${W}`, empty.W === W && empty.D === D && empty.objects.every((o) => o.kind !== "partition" && o.kind !== "glass"));
}

// 4. 자동 배치 → 가구 목록 → 같은 배치
const result = generateLayout(roomToInput(room({ windows: [{ wall: "rear", at: 0.45, width: 2.4 }] }), needs));
const collab = result.options.find((o) => o.id === "collab")!;
const placement = placementFromOption(collab)!;
ok("groups → items", placement.items.length === collab.groups!.length && placement.items.filter((i) => i.seat).length === 10);
const composed = composeOption(room({ windows: [{ wall: "rear", at: 0.45, width: 2.4 }] }), collab, placement.items);
ok("composed keeps furniture", composed.objects.filter((o) => o.kind === "furniture").length === collab.objects.filter((o) => o.kind === "furniture").length);
ok("composed uses real windows only", composed.objects.filter((o) => o.kind === "window").length === 1 && !composed.objects.some((o) => o.name === "가정 창호"));
ok("composed keeps proposed partitions", composed.objects.filter((o) => o.kind === "partition" || o.kind === "glass").length === collab.objects.filter((o) => (o.kind === "partition" || o.kind === "glass")).length);
ok("auto layout has no issues", checkOption(composed, 10).issues.length === 0, JSON.stringify(checkOption(composed, 10).issues));

// 5. 회전: 네 방향 모두 바닥면 크기·중심 유지, 360°면 원래대로
const desk = placement.items.find((i) => i.id === "desk-1")!;
for (const rot of [0, 90, 180, 270] as const) {
  const it = { ...desk, rot };
  const parts = worldParts(it).filter((p) => p.plan);
  const x1 = Math.min(...parts.map((p) => p.x)), x2 = Math.max(...parts.map((p) => p.x + p.w));
  const y1 = Math.min(...parts.map((p) => p.y)), y2 = Math.max(...parts.map((p) => p.y + p.d));
  const fp = footprint(it);
  ok(`rot ${rot} footprint`, near(x2 - x1, fp.w, 2e-3) && near(y2 - y1, fp.d, 2e-3) && near((x1 + x2) / 2, it.x, 2e-3) && near((y1 + y2) / 2, it.y, 2e-3));
}
const b = { x: 0.1, y: 0.2, w: 0.3, d: 0.4 };
const four = [90, 90, 90, 90].reduce((acc) => rotateBox(acc, 90), b as { x: number; y: number; w: number; d: number });
ok("4 × 90° = identity", near(four.x, b.x) && near(four.y, b.y) && near(four.w, b.w) && near(four.d, b.d));

// 6. 서버가 편집 결과를 원본에서 다시 채운다
const catalog = catalogItems();
const edits = toEdits(placement.items).map((e) => (e.id === "desk-1" ? { ...e, x: e.x + 1, rot: 90 as const } : e));
edits.push({ id: "n1", src: "catalog:desk", label: "업무석 11", x: 5, y: 5, rot: 0 });
edits.push({ id: "n2", src: "desk-2", label: "업무석 12", x: 6, y: 5, rot: 180 });
const rebuilt = rebuildPlacement(edits, collab, catalog, room());
ok("rebuild ok", "items" in rebuilt);
if ("items" in rebuilt) {
  const d1 = rebuilt.items.find((i) => i.id === "desk-1")!;
  ok("rebuild keeps parts from source", JSON.stringify(d1.parts) === JSON.stringify(desk.parts) && d1.rot === 90 && near(d1.x, desk.x + 1));
  ok("rebuild catalog item", rebuilt.items.find((i) => i.id === "n1")!.parts.length === catalog.find((c) => c.type === "desk")!.parts.length && rebuilt.items.find((i) => i.id === "n1")!.seat === true);
  ok("rebuild duplicate keeps src", rebuilt.items.find((i) => i.id === "n2")!.src === "desk-2" && rebuilt.items.find((i) => i.id === "n2")!.origin === "added");
}
// 탕비 설비: 자동 배치는 ‘자동 제안 위치’, 고객이 확인하면 ‘확인된 위치’
const fx = placement.items.find((i) => i.fixture)!;
ok("pantry is a proposed fixture (not locked)", fx.fixture === "proposed" && !fx.locked && collab.groups!.find((g) => g.id === fx.id)!.fixture === "proposed");
const moveFx = rebuildPlacement(toEdits(placement.items).map((e) => (e.id === fx.id ? { ...e, x: 1, y: 1 } : e)), collab, catalog, room());
ok("proposed fixture can move", "items" in moveFx && moveFx.items.find((i) => i.id === fx.id)!.x === 1 && moveFx.items.find((i) => i.id === fx.id)!.fixture === "proposed");
const confirmFx = rebuildPlacement(toEdits(placement.items).map((e) => (e.id === fx.id ? { ...e, fixture: "confirmed" as const } : e)), collab, catalog, room());
ok("fixture can be confirmed", "items" in confirmFx && confirmFx.items.find((i) => i.id === fx.id)!.fixture === "confirmed");
const fakeFx = rebuildPlacement(toEdits(placement.items).map((e) => (e.id === "desk-1" ? { ...e, fixture: "confirmed" as const } : e)), collab, catalog, room());
ok("non-fixture cannot become fixture", "items" in fakeFx && !fakeFx.items.find((i) => i.id === "desk-1")!.fixture);
ok("legacy locked → proposed", normalizeItems([{ ...fx, fixture: undefined, locked: true }])[0].fixture === "proposed" && !normalizeItems([{ ...fx, fixture: undefined, locked: true }])[0].locked);
if ("items" in confirmFx) {
  const fd = diffPlacement(placement.items, confirmFx.items);
  ok("diff reports fixture confirmation", fd.fixtures.length === 1 && fd.lines.some((l) => l.includes("고객이 확인한 설비 위치")) && fd.summary.includes("설비 위치 확인"), fd.summary);
}
ok("unknown source rejected", "error" in rebuildPlacement([{ id: "x1", src: "nope", label: "", x: 1, y: 1, rot: 0 }], collab, catalog, room()));
ok("bad number rejected", "error" in rebuildPlacement([{ id: "desk-1", src: "desk-1", label: "", x: Number.NaN, y: 1, rot: 0 }], collab, catalog, room()));
ok("bad rotation rejected", "error" in rebuildPlacement([{ id: "desk-1", src: "desk-1", label: "", x: 1, y: 1, rot: 45 as 0 }], collab, catalog, room()));
ok("duplicate id rejected", "error" in rebuildPlacement([toEdits(placement.items)[0], toEdits(placement.items)[0]], collab, catalog, room()));
ok("too many items rejected", "error" in rebuildPlacement(Array.from({ length: 301 }, (_, i) => ({ id: `n${i}`, src: "catalog:plant", label: "", x: 1, y: 1, rot: 0 as const })), collab, catalog, room()));
ok("far outside rejected", "error" in rebuildPlacement([{ id: "n1", src: "catalog:plant", label: "", x: 40, y: 1, rot: 0 }], null, catalog, room()));

// 7. 바뀐 점
const moved = placement.items.map((i) => (i.id === "desk-1" ? { ...i, x: i.x + 0.5 } : i.id === "collab-table" ? { ...i, rot: 90 as const } : i)).filter((i) => i.id !== "plant");
const d = diffPlacement(placement.items, [...moved, { ...desk, id: "n9", label: "업무석 11" }]);
ok("diff counts", d.moved.length === 1 && d.rotated.length === 1 && d.added.length === 1 && d.removed.length === 1, d.summary);
ok("diff text", d.lines.some((l) => l.includes("업무석 1") && l.includes("오른쪽으로 500")) && d.lines.some((l) => l.includes("협업 테이블") && l.includes("90° 회전")) && d.lines.includes("업무석 11 추가") && d.lines.includes("화분 삭제"));

// 8. 검사 규칙: 정답이 정해진 사례
const item = (id: string, x: number, y: number, w = 1, d = 1, extra: Partial<PlacedItem> = {}) => ({ id, label: id, parts: [{ x, y, w, d }], ...extra });
const scene = (o: Partial<CheckScene>): CheckScene => ({ W: 10, D: 8, items: [], partitions: [], pillars: [], doors: [], entrance: { x1: 8, x2: 9 }, staff: null, ...o });
const keys = (s: CheckScene) => runChecks(s).issues.map((i) => i.key).sort().join(",");
ok("no issues", keys(scene({ items: [item("a", 1, 2), item("b", 3, 2)] })) === "");
ok("touching is not overlap", keys(scene({ items: [item("a", 1, 2), item("b", 2, 2)] })) === "");
ok("overlap", keys(scene({ items: [item("a", 1, 2), item("b", 1.5, 2)] })) === "overlap");
ok("bounds", keys(scene({ items: [item("a", 9.5, 2)] })) === "bounds");
ok("pillar", keys(scene({ items: [item("a", 1, 2)], pillars: [{ x: 1.5, y: 2.5, w: 0.4, d: 0.4 }] })) === "pillar");
ok("partition", keys(scene({ items: [item("a", 1, 2)], partitions: [{ x: 1.5, y: 0, w: 0.1, d: 5 }] })) === "partition");
ok("wall item ignores partition", keys(scene({ items: [item("a", 1, 2, 1, 1, { wall: true } as never)], partitions: [{ x: 1.5, y: 0, w: 0.1, d: 5 }] })) === "");
ok("entrance clearance 750", keys(scene({ items: [item("a", 8, 0.5)] })) === "door");
ok("entrance clearance outside 750", keys(scene({ items: [item("a", 8, 0.8)] })) === "");
ok("room door both sides", keys(scene({ items: [item("a", 2, 4.1, 0.5, 0.5), item("b", 2, 5.15, 0.5, 0.5)], doors: [{ x: 2, y: 4.8, w: 0.9 }] })) === "door,door");
ok("vertical door", keys(scene({ items: [item("a", 4.6, 1, 0.3, 0.5)], doors: [{ x: 5, y: 1, w: 0.9, vertical: true }] })) === "door");
ok("seats short", keys(scene({ items: [item("a", 1, 2, 1, 1, { seat: true } as never)], staff: 2 })) === "seats");
ok("seats enough", keys(scene({ items: [item("a", 1, 2, 1, 1, { seat: true } as never), item("b", 3, 2, 1, 1, { seat: true } as never)], staff: 2 })) === "");
ok("partition blocks entrance", keys(scene({ partitions: [{ x: 8.2, y: 0.2, w: 0.1, d: 2 }] })) === "structure");
ok("partition over pillar", keys(scene({ partitions: [{ x: 3, y: 0, w: 0.1, d: 5 }], pillars: [{ x: 2.9, y: 2, w: 0.4, d: 0.4 }] })) === "structure");
ok("no '시공 가능' wording", !JSON.stringify(runChecks(scene({}))).includes("시공 가능"));
// 탕비 설비와 급배수 위치(현재 임시 검사값 3,000mm)
ok("fixture far from water", keys(scene({ items: [item("p", 1, 6, 1, 0.6, { proposedFixture: true } as never)], water: [[9, 0.1]] })) === "fixture");
ok("fixture near water", keys(scene({ items: [item("p", 7.5, 0.2, 1, 0.6, { proposedFixture: true } as never)], entrance: { x1: 2, x2: 3 }, water: [[9, 0.1]] })) === "");
ok("confirmed fixture not checked", keys(scene({ items: [item("p", 1, 6, 1, 0.6, { locked: true } as never)], water: [[9, 0.1]] })) === "");
ok("no water → not checked", keys(scene({ items: [item("p", 1, 6, 1, 0.6, { proposedFixture: true } as never)] })) === "");
// 다각형: 바깥 칸(공간 아닌 곳)에 놓이면 공간 밖
ok("void is out of bounds", keys(scene({ items: [item("a", 8, 6)], voids: [{ x: 6, y: 4, w: 4, d: 4 }] })) === "bounds");
ok("polygon entrance zone", keys(scene({ items: [item("a", 0.2, 3, 0.5, 0.5)], entrance: { x1: 0, x2: 1, seg: [0, 3.5, 0, 2.5], inward: [1, 0] } })) === "door");

// 9. 도면 따라 그리기(F): 모양 정리, 닫기, 축척, 회전, 벽 길이 맞추기
const L: Pt[] = [
  [0, 0],
  [8, 0],
  [8, 4],
  [5, 4],
  [5, 7],
  [0, 7],
];
ok("L outline already normal", JSON.stringify(normalizeOutline(L)) === JSON.stringify(L));
ok("normalize: clockwise + shifted + collinear point", JSON.stringify(normalizeOutline([[10, 17], [15, 17], [15, 14], [18, 14], [18, 10], [14, 10], [10, 10], [10, 12]].map(([x, y]) => [x, y] as Pt))) === JSON.stringify(L));
ok("L area", near(polygonArea(L), 8 * 4 + 5 * 3));
const cells = cellsOf(L);
ok("cells cover L", near(cells.inside.reduce((s2, c) => s2 + c.w * c.d, 0), 47) && near(cells.outside.reduce((s2, c) => s2 + c.w * c.d, 0), 8 * 7 - 47));
ok("slanted wall rejected", outlineErrors([[0, 0], [5, 0], [5, 5], [1, 4]]).some((e) => e.includes("기울")));
ok("crossing rejected", outlineErrors([[0, 0], [4, 0], [4, 4], [6, 4], [6, 2], [0, 2]] as Pt[]).length > 0);
ok("tiny area rejected", outlineErrors([[0, 0], [1, 0], [1, 1], [0, 1]]).some((e) => e.includes("4㎡")));
ok("snap to axis", JSON.stringify(snapOrtho([0, 0], [100, 7], [], 5)) === JSON.stringify([100, 0]) && JSON.stringify(snapOrtho([100, 0], [96, 80], [[0, 82]], 5)) === JSON.stringify([100, 82]));
ok("close adds missing corner", closeOutline([[0, 0], [400, 0], [400, 300]] as Pt[])!.length === 4);
// 픽셀 → 미터: 축척 0.02m/px, 600×400px 직사각형 = 12 × 8m
const px: Pt[] = [
  [100, 500],
  [700, 500],
  [700, 100],
  [100, 100],
];
const dr = draftFromPixels(px, 0.02, 800, 600) as TraceDraft;
ok("pixels → meters", "outline" in dr && JSON.stringify(dr.outline) === JSON.stringify([[0, 0], [12, 0], [12, 8], [0, 8]]));
ok("underlay maps traced corner", near(applyMat(dr.m, [100, 500])[0], 0) && near(applyMat(dr.m, [100, 500])[1], 0) && near(applyMat(dr.m, [700, 100])[0], 12) && near(applyMat(dr.m, [700, 100])[1], 8));
ok("matrix inverse", near(applyMat(invertMat(dr.m), [12, 8])[0], 700) && near(applyMat(invertMat(dr.m), [12, 8])[1], 100));
ok("pick edge", pickEdge(dr.outline, [0.05, 4], 0.2)?.edge === 3);
// 출입문이 왼쪽 벽(변 3)에 있으면 왼쪽 벽이 앞벽이 되게 돌린다.
const withDoor: TraceDraft = { ...dr, entrance: { edge: 3, at: 1, width: 1 }, windows: [{ edge: 1, at: 2, width: 3 }], utilities: [{ edge: 2, at: 2 }], pillars: [{ x: 5, y: 3, w: 0.5, d: 0.5 }] };
const doorWorld = (dd: TraceDraft) => {
  const e = dd.entrance!;
  const ed = [dd.outline[e.edge], dd.outline[(e.edge + 1) % dd.outline.length]];
  const len = Math.hypot(ed[1][0] - ed[0][0], ed[1][1] - ed[0][1]);
  const t = e.at + e.width / 2;
  const p: Pt = [ed[0][0] + ((ed[1][0] - ed[0][0]) / len) * t, ed[0][1] + ((ed[1][1] - ed[0][1]) / len) * t];
  return applyMat(invertMat(dd.m), p);
};
const oriented = orientDraft(withDoor);
ok("orient: door edge becomes front", oriented.entrance!.edge === 0 && JSON.stringify(oriented.outline) === JSON.stringify([[0, 0], [8, 0], [8, 12], [0, 12]]));
ok("orient: door stays on same drawing spot", near(doorWorld(oriented)[0], doorWorld(withDoor)[0], 0.05) && near(doorWorld(oriented)[1], doorWorld(withDoor)[1], 0.05), `${doorWorld(oriented)} vs ${doorWorld(withDoor)}`);
ok("orient: pillar rotated", JSON.stringify(oriented.pillars[0]) === JSON.stringify({ x: 4.5, y: 5, w: 0.5, d: 0.5 }));
const rr = draftToRoom(withDoor, { height: null, areaHint: 29 }) as RoomModel;
ok("4 corners → rect room, source trace", rr.shape === "rect" && rr.width === 8 && rr.depth === 12 && rr.source === "trace" && validateRoom(rr).length === 0, JSON.stringify(validateRoom(rr)));
ok("trace rect: door on front at 1,000", rr.entrance.at === 1 && rr.entrance.width === 1 && rr.entrance.edge === undefined);
ok("trace rect: right-wall window → rear wall 3,000 from left", JSON.stringify(rr.windows) === JSON.stringify([{ wall: "rear", at: 3, width: 3 }]), JSON.stringify(rr.windows));
ok("trace rect: top-wall water → left wall 10,000 from front", JSON.stringify(rr.utilities) === JSON.stringify([{ kind: "water", wall: "left", at: 10 }]), JSON.stringify(rr.utilities));
// 도면의 왼쪽 위 모서리(문 벽의 시작)는 앞벽 왼쪽 끝, 왼쪽 아래 모서리는 앞벽 오른쪽 끝이 된다.
ok("trace rect: underlay rotated with room", near(applyMat(rr.underlay!.m, [100, 100])[0], 0, 1e-6) && near(applyMat(rr.underlay!.m, [100, 100])[1], 0, 1e-6) && near(applyMat(rr.underlay!.m, [100, 500])[0], 8, 1e-6) && near(applyMat(rr.underlay!.m, [700, 100])[1], 12, 1e-6), `${applyMat(rr.underlay!.m, [100, 100])}`);
const back = roomToDraft(rr)!;
ok("room → draft → room round trip", JSON.stringify(draftToRoom(back, { height: null, areaHint: 29 })) === JSON.stringify(rr));
// ㄱ자: 다각형으로 남고 직사각형으로 바꾸지 않는다.
const Ld: TraceDraft = { outline: L, m: [0.01, 0, 0, -0.01, 0, 7], iw: 800, ih: 700, entrance: { edge: 0, at: 6, width: 1 }, windows: [{ edge: 4, at: 1, width: 2 }], pillars: [{ x: 2, y: 2, w: 0.5, d: 0.5 }], utilities: [{ edge: 2, at: 1 }] };
const Lr = draftToRoom(Ld, { height: 2.8, areaHint: null }) as RoomModel;
ok("L → polygon room", Lr.shape === "polygon" && Lr.outline!.length === 6 && validateRoom(Lr).length === 0 && near(roomArea(Lr), 47), JSON.stringify(validateRoom(Lr)));
ok("polygon → no auto layout", generateLayout(roomToInput(Lr, needs)).options.length === 0 && !entranceSupport(Lr).supported);
const Lobj = shellObjects(Lr);
ok("polygon floor = traced area", near(Lobj.filter((o) => o.kind === "floor").reduce((s2, o) => s2 + o.w * o.d, 0), 47, 1e-6));
ok("polygon walls follow outline", Lobj.filter((o) => o.kind === "outer" && o.plan).length >= 6);
ok("polygon water marker", Lobj.filter((o) => o.kind === "utility").length === 1);
const Lopt = composeOption(Lr, null, [{ ...desk, id: "n1", x: 7, y: 6, origin: "added", src: "catalog:desk" }]);
ok("polygon: desk in the notch is outside", checkOption(Lopt, null).issues.some((i) => i.key === "bounds"));
const Lin = composeOption(Lr, null, [{ ...desk, id: "n1", x: 2.5, y: 5, origin: "added", src: "catalog:desk" }]);
ok("polygon: desk inside is fine", checkOption(Lin, null).issues.length === 0, JSON.stringify(checkOption(Lin, null).issues));
// 벽 길이 맞추기: 변 0을 8 → 9m로 늘리면 변 1이 밀리고 변 2(안쪽으로 꺾인 벽)가 1m 길어진다.
const pushed = setEdgeLength(Ld, 0, 9) as TraceDraft;
ok("set edge length", "outline" in pushed && JSON.stringify(pushed.outline) === JSON.stringify([[0, 0], [9, 0], [9, 4], [5, 4], [5, 7], [0, 7]]));
ok("set edge length keeps water spot", "outline" in pushed && near(pushed.utilities[0].at, 2));
ok("set edge length rejects collapse", "error" in setEdgeLength(Ld, 1, 7));

// 10. 도면 닫기 회귀(2026-10-02 사용성 테스트 P1): 실제 브라우저 소수 좌표와 다양한 축척
// 첫 클릭은 반올림 없이, 이후는 0.1px로 반올림된 좌표 → mm 반올림에서 1mm 기울어 ‘벽 5이 기울어져 있어요’로 거절되던 사례
const repro = {
  points: [[98.710394663702, 99.48405679923178], [899.8, 99.5], [899.8, 398.9], [500, 398.9], [500, 699.9], [98.7, 699.9]] as Pt[],
  scale: 0.01498016674068392,
};
const rd = draftFromPixels(repro.points, repro.scale, 1000, 800);
ok("P1 재현 좌표: 닫힘(기울어진 벽 없음)", "outline" in rd, "error" in rd ? rd.error : "");
if ("outline" in rd) {
  const xs = rd.outline.map((q) => q[0]), ys = rd.outline.map((q) => q[1]);
  ok("P1 재현 좌표: 꼭짓점 6개, 위쪽 벽 약 12,000mm", rd.outline.length === 6 && Math.abs(Math.max(...xs) - 12) < 0.02 && Math.abs(Math.max(...ys) - 9) < 0.02, JSON.stringify(rd.outline));
  ok("P1 재현 좌표: 모든 벽이 가로·세로", rd.outline.every((q, i) => { const r2 = rd.outline[(i + 1) % rd.outline.length]; return q[0] === r2[0] || q[1] === r2[1]; }));
}
ok("닫기: 1px 안의 차이는 같은 줄로 봄(모서리를 더 넣지 않음)", closeOutline([[10, 10], [500, 10], [500, 300], [10.4, 300]] as Pt[], 1)!.length === 4);
ok("바로잡기: 기운 변(차이 > 1px)은 그대로 둠", JSON.stringify(rectifyOrtho([[0, 0], [100, 5], [100, 50], [0, 50]] as Pt[])) === JSON.stringify([[0, 0], [100, 5], [100, 50], [0, 50]]));
ok("첫 점도 0.1px 격자", JSON.stringify(nextTracePoint([], [98.710394663702, 99.48405679923178], 10)) === JSON.stringify([98.7, 99.5]));
// 화면에서 찍는 과정을 그대로 흉내 낸다: 꼭짓점마다 소수 오차가 있는 클릭 → nextTracePoint(화면과 같은 함수) → 닫기
let seed = 20261002;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const SHAPES: [string, Pt[]][] = [
  ["직사각형", [[0, 0], [1, 0], [1, 1], [0, 1]]],
  ["ㄱ자", [[0, 0], [8, 0], [8, 3], [4, 3], [4, 6], [0, 6]]],
  ["ㄷ자", [[0, 0], [9, 0], [9, 6], [6, 6], [6, 2], [3, 2], [3, 6], [0, 6]]],
  ["T자", [[3, 0], [6, 0], [6, 4], [9, 4], [9, 7], [0, 7], [0, 4], [3, 4]]],
];
let traced = 0, legacyFirst = 0;
const bad: string[] = [];
for (let k = 0; k < 2000; k++) {
  const [name, unit] = SHAPES[k % SHAPES.length];
  const s = 0.002 + rand() * 0.05; // 축척(미터/픽셀)
  const umax = Math.max(...unit.flat());
  // 실제 크기: 단위 길이 0.6~(55m/최대 단위)m, 단위당 40px 이상(화면에서 찍을 수 있는 크기)
  const lo = Math.max(umax === 1 ? 2.5 : 0.6, 40 * s), hi = 55 / umax;
  const sx = (lo + rand() * (hi - lo)) / s, sy = (lo + rand() * (hi - lo)) / s; // 단위당 픽셀
  const ox = 20 + rand() * 300, oy = 20 + rand() * 300;
  const tol = 1 + rand() * 14; // 화면 10px × 확대율
  const corners = unit.map(([x, y]) => [ox + x * sx, oy + y * sy] as Pt);
  const start = Math.floor(rand() * corners.length);
  const order = [...corners.slice(start), ...corners.slice(0, start)];
  if (rand() < 0.5) order.reverse(); // 시계·반시계 모두
  const jitter = () => (rand() - 0.5) * 1.6; // 화면 좌표 변환에서 생기는 ±0.8px 소수 오차
  const clicks = order.map((c) => [c[0] + jitter(), c[1] + jitter()] as Pt);
  const pts: Pt[] = [];
  for (const c of clicks) pts.push(nextTracePoint(pts, c, tol));
  // 고치기 전 화면 그대로: 첫 클릭은 반올림 없이, 이후는 직각 맞춤 뒤 0.1px 반올림(사용성 테스트 P1의 원인)
  const old: Pt[] = [];
  for (const c of clicks) {
    if (!old.length) old.push(c);
    else { const q = snapOrtho(old[old.length - 1], c, old.slice(0, -1), tol); old.push([Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10]); }
  }
  const d = draftFromPixels(pts, s, 2000, 2000);
  if ("outline" in d && d.outline.length === unit.length) traced++;
  else if (bad.length < 3) bad.push(`${name} s=${s.toFixed(4)} tol=${tol.toFixed(1)}: ${"error" in d ? d.error : d.outline.length}`);
  // 예전 화면으로 찍어 저장된 좌표가 와도 닫혀야 한다.
  const d2 = draftFromPixels(old, s, 2000, 2000);
  if ("outline" in d2 && d2.outline.length === unit.length) legacyFirst++;
}
ok("화면 흉내 2,000회(직사각형·ㄱ자·ㄷ자·T자, 축척·오프셋·클릭 오차·확대율 무작위): 모두 닫힘", traced === 2000, `${traced}/2000 ${bad.join(" | ")}`);
ok("고치기 전 화면 방식(첫 점 반올림 없음)으로 찍은 좌표도 2,000회 모두 닫힘", legacyFirst === 2000, `${legacyFirst}/2000`);

// 11. 요약의 창 설명(역할별 E2E-01): 입력한 실제 구조로만 말하고, 계산값(windowWall)을 쓰지 않는다. 창을 임의로 추가하지 않는다.
const briefRow = (r: RoomModel) => buildBrief({ title: "", region: "서울", budget_min: null, budget_max: null, desired_start: "", desired_movein: "", notes: "" }, roomToInput(r, needs), generateLayout(roomToInput(r, needs)), r).rows.find(([k]) => k === "창 위치")![1];
ok("요약 창: 잘 모름(null) → 잘 모르겠음", briefRow(room({ windows: null })).startsWith("잘 모르겠음") && roomToInput(room({ windows: null }), needs).windowWall === "other");
ok("요약 창: 창 없음([]) → 창 없음", briefRow(room({ windows: [] })) === "창 없음");
ok("요약 창: 위치 입력 → 입력한 벽 그대로", briefRow(room({ windows: [{ wall: "rear", at: 0.45, width: 2.4 }, { wall: "left", at: 3, width: 1.5 }] })).startsWith("위치 입력함") && briefRow(room({ windows: [{ wall: "rear", at: 0.45, width: 2.4 }, { wall: "left", at: 3, width: 1.5 }] })).includes("왼쪽 벽"));
{
  const r0 = room({ windows: null });
  const res0 = generateLayout(roomToInput(r0, needs));
  const opt0 = res0.options.find((o) => o.id === res0.recommended) ?? res0.options[0];
  const comp0 = composeOption(r0, opt0, placementFromOption(opt0)!.items);
  ok("창 잘 모름: 자동 배치·합성 결과에 창이 없음(임의로 추가하지 않음)", comp0.objects.filter((o) => o.kind === "window").length === 0 && comp0.marks.windows.length === 0);
}

console.log(`check:space ${pass + fails.length}개 중 ${pass}개 통과`);
if (fails.length) {
  console.log(fails.join("\n"));
  process.exit(1);
}
