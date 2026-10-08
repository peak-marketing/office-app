// 집 전체 평면 규칙 검사: 방 찾기(벽으로 나뉜 영역), 벽·문·창 입력 검사, 가구 검사, 바뀐 점 문장, 3D 장면.
// 실행: npx tsx scripts/check-house.ts
import { diffRequest, type RequestSnapshot } from "../lib/request-snapshot";
import { homeCatalogItems } from "../lib/space/home-room";
import {
  describeHouse,
  diffHouse,
  houseErrors,
  houseKey,
  newHouse,
  openingErrors,
  parseHouseCreate,
  parseHouseEdit,
  rebuildHouseItems,
  rectOutline,
  wallErrors,
  type HouseItem,
  type HouseModel,
} from "../lib/space/house";
import { danglingEnds, houseWarnings, runHouseChecks } from "../lib/space/house-check";
import { findHouseSpot, pickWall, placeOpening, snapEnd, snapStart } from "../lib/space/house-edit";
import { composeHouse, houseDoorZones, wallPieces } from "../lib/space/house-geom";
import { detectRooms, regionAt } from "../lib/space/house-rooms";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra: unknown = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` ${typeof extra === "string" ? extra : JSON.stringify(extra)}`}`);
};
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) < e;

const base = (): HouseModel => ({ ...newHouse(rectOutline(10, 8), "dims", 2.4, null), rev: 1, saved_at: "2026-10-05 10:00:00" });
const catalog = homeCatalogItems();
const item = (id: string, type: string, x: number, y: number, rot: 0 | 90 | 180 | 270 = 0): HouseItem => {
  const c = catalog.find((t) => t.type === type)!;
  return { id, type, label: c.label, x, y, rot, w: c.w, d: c.d, parts: c.parts, bom: c.bom, origin: "added", src: `catalog:${type}` };
};

// ── 1. 방 찾기
const h0 = base();
let det = detectRooms(h0);
check("벽 없음: 방 1개, 면적 80㎡", det.regions.length === 1 && near(det.regions[0].area, 80), det.regions.map((r) => r.area));
const h1: HouseModel = { ...base(), walls: [{ id: "w1", a: [0, 4], b: [10, 4], t: 0.1 }] };
det = detectRooms(h1);
check("가로 벽 하나: 방 2개, 39.5㎡씩(벽 두께 제외)", det.regions.length === 2 && det.regions.every((r) => near(r.area, 39.5)), det.regions.map((r) => r.area));
check("방 번호는 아래 줄부터", regionAt(det.raster, 1, 1) === 0 && regionAt(det.raster, 1, 7) === 1 && regionAt(det.raster, 1, 4) === -1);
const h2: HouseModel = { ...h1, walls: [...h1.walls, { id: "w2", a: [5, 0], b: [5, 4], t: 0.1 }] };
det = detectRooms(h2);
check("T자 벽: 방 3개(약 19.55·19.55·39.5㎡)", det.regions.length === 3 && near(det.regions[0].area, 19.55, 0.005) && near(det.regions[1].area, 19.55, 0.005) && near(det.regions[2].area, 39.5), det.regions.map((r) => r.area));
check("같은 입력이면 같은 결과(결정적)", JSON.stringify(detectRooms(h2).regions) === JSON.stringify(det.regions));
check("이름 자리는 방 안", det.regions.every((r) => regionAt(det.raster, r.anchor[0], r.anchor[1]) === r.idx));
check("바닥 사각형 면적 합 = 방 면적", det.regions.every((r) => near(r.rects.reduce((s, b) => s + b.w * b.d, 0), r.area, 1e-3)));
const open: HouseModel = { ...h1, walls: [...h1.walls, { id: "w2", a: [5, 0], b: [5, 3], t: 0.1 }] };
det = detectRooms(open);
check("닿지 않은 벽: 아래쪽은 한 방으로 이어짐(2개)", det.regions.length === 2);
const loose = danglingEnds(open);
check("닿지 않은 벽 끝 알림(벽 2의 위쪽 끝)", loose.length === 1 && loose[0].id === "w2" && loose[0].p[1] === 3, loose);
check("경고 문장: 방이 닫히지 않음", houseWarnings(open, det).some((w) => w.includes("벽 2 끝이 다른 벽에 닿지 않았어요")));
check("닫힌 벽은 끝 알림 없음", danglingEnds(h2).length === 0);
const L: HouseModel = { ...newHouse([[0, 0], [6, 0], [6, 3], [3, 3], [3, 6], [0, 6]], "trace", 2.4, null), rev: 1, saved_at: "" };
det = detectRooms(L);
check("ㄱ자 집: 방 1개 27㎡", det.regions.length === 1 && near(det.regions[0].area, 27), det.regions.map((r) => r.area));
const odd: HouseModel = { ...newHouse(rectOutline(7.333, 5.017), "trace", 2.4, null), rev: 1, saved_at: "" };
det = detectRooms(odd);
check("격자에 안 맞는 치수(7,333 × 5,017)도 방 1개, 면적 차이 0.3㎡ 미만", det.regions.length === 1 && Math.abs(det.regions[0].area - 7.333 * 5.017) < 0.3, det.regions[0]?.area);
const thin: HouseModel = { ...h1, walls: [...h1.walls, { id: "w2", a: [0, 4.2], b: [10, 4.2], t: 0.1 }] };
det = detectRooms(thin);
check("두 벽 사이 좁은 틈(폭 100mm)은 방이 아닌 틈으로", det.regions.filter((r) => r.sliver).length === 1 && det.regions.filter((r) => !r.sliver).length === 2 && houseWarnings(thin, det).some((w) => w.includes("벽 사이 좁은 틈")));
const closet: HouseModel = { ...h1, walls: [...h1.walls, { id: "w2", a: [0, 4.7], b: [10, 4.7], t: 0.1 }] };
check("폭 600mm 공간은 방으로 셈(틈 아님)", detectRooms(closet).regions.every((r) => !r.sliver));

// ── 2. 방 이름
const named: HouseModel = { ...h2, labels: [{ id: "l1", x: 2.5, y: 2, name: "침실1", kind: "bed" }, { id: "l2", x: 5, y: 6, name: "거실", kind: "living" }] };
det = detectRooms(named);
check("이름: 라벨이 든 방에 붙음", det.regions[0].name === "침실1" && det.regions[2].name === "거실" && det.regions[1].display === "이름 없는 방 1");
const onWall: HouseModel = { ...named, labels: [{ id: "l1", x: 2.5, y: 4, name: "침실1", kind: "bed" }] };
check("벽 위에 찍힌 이름은 가까운 방으로", detectRooms(onWall).regions.some((r) => r.name === "침실1"));
const dup: HouseModel = { ...named, labels: [...named.labels, { id: "l3", x: 8, y: 6, name: "주방", kind: "kitchen" }] };
det = detectRooms(dup);
check("한 방에 이름 둘: 먼저 붙인 이름, 경고", det.regions[2].name === "거실" && det.dupLabels.length === 1 && houseWarnings(dup, det).some((w) => w.includes("한 방에 있어요")));

// ── 3. 벽·문·창 입력 검사
check("벽: 집 밖으로 나가면 오류", wallErrors(h0, { id: "w9", a: [2, 2], b: [12, 2], t: 0.1 }).some((e) => e.includes("밖으로")));
check("벽: 기운 벽 오류", wallErrors(h0, { id: "w9", a: [2, 2], b: [4, 3], t: 0.1 }).some((e) => e.includes("가로나 세로")));
check("벽: 바깥 벽 위에 겹치면 오류", wallErrors(h0, { id: "w9", a: [0, 2], b: [0, 5], t: 0.1 }).some((e) => e.includes("바깥 벽 위")));
check("벽: 같은 선에 겹치면 오류", wallErrors(h1, { id: "w9", a: [3, 4], b: [6, 4], t: 0.1 }).some((e) => e.includes("겹쳐요")));
check("벽: 두께 범위", wallErrors(h0, { id: "w9", a: [2, 2], b: [4, 2], t: 0.5 }).length === 1);
check("벽: 끝이 바깥 벽에 닿는 벽은 통과", wallErrors(h0, { id: "w9", a: [0, 2], b: [10, 2], t: 0.1 }).length === 0);
const withDoor: HouseModel = { ...h2, openings: [{ id: "d1", kind: "door", wall: "w1", at: 1, width: 0.9, hinge: "a", side: 1 }] };
check("문: 내부 벽 위 통과", houseErrors(withDoor).length === 0, houseErrors(withDoor));
check("창: 내부 벽에는 못 놓음", openingErrors(withDoor, { id: "d2", kind: "window", wall: "w1", at: 5, width: 1.2 }).some((e) => e.includes("바깥 벽에만")));
check("현관문: 내부 벽에는 못 놓음", openingErrors(withDoor, { id: "d2", kind: "entry", wall: "w1", at: 5, width: 1 }).some((e) => e.includes("바깥 벽에만")));
check("문: 같은 벽에서 겹치면 오류", openingErrors(withDoor, { id: "d2", kind: "passage", wall: "w1", at: 1.5, width: 1 }).some((e) => e.includes("겹쳐요")));
check("문: 벽 길이 밖이면 오류", openingErrors(withDoor, { id: "d2", kind: "door", wall: "w2", at: 3.5, width: 0.9 }).some((e) => e.includes("밖으로")));
check("창: 바깥 벽 통과", openingErrors(withDoor, { id: "d2", kind: "window", wall: "o2", at: 1, width: 1.5 }).length === 0);
const fixedOut: HouseModel = { ...h0, fixed: [{ id: "f1", kind: "closet", x: 9.5, y: 1, w: 1.2, d: 0.6, h: 2.2 }] };
check("고정 구조물: 집 밖이면 오류", houseErrors(fixedOut).some((e) => e.includes("집 밖")));
check("천장 높이 범위", houseErrors({ ...h0, height: 1.5 }).some((e) => e.includes("천장 높이")));
check("치수 만들기: 2,000~40,000mm 범위", houseErrors({ ...newHouse(rectOutline(45, 8), "dims", 2.4, null), rev: 1, saved_at: "" }).some((e) => e.includes("40,000")));

// ── 4. 문 앞 자리·가구 검사
const zones = houseDoorZones(withDoor);
check("문 앞 자리: 내부 벽 문은 양쪽(폭 900 × 깊이 900)", zones.length === 2 && zones.some((z) => near(z.y, 4.05) && near(z.d, 0.9)) && zones.some((z) => near(z.y, 3.05)));
const entry: HouseModel = { ...withDoor, openings: [...withDoor.openings, { id: "d2", kind: "entry", wall: "o0", at: 7, width: 1, hinge: "a", side: -1 }] };
check("문 앞 자리: 현관문(바깥 벽)은 집 안쪽만", houseDoorZones(entry).filter((z) => z.id === "d2").length === 1 && houseDoorZones(entry).find((z) => z.id === "d2")!.y === 0);
check("벽 조각: 문 자리만큼 비움", wallPieces(withDoor).filter((p) => p.ref === "w1").length === 2);
const furnished: HouseModel = {
  ...entry,
  items: [item("n1", "h-bed-queen", 2.5, 1.5), item("n2", "h-nightstand", 2.5, 1.5), item("n3", "h-wardrobe", 7, 4), item("n4", "h-drawer", 1.45, 4.5), item("n5", "h-desk", -0.2, 6)],
};
let report = runHouseChecks(furnished, detectRooms(furnished));
const has = (key: string, id: string) => report.issues.some((i) => i.key === key && i.ids.includes(id));
check("검사: 가구끼리 겹침(침대–협탁)", has("overlap", "n1") && has("overlap", "n2"), report.issues);
check("검사: 벽에 걸침(옷장이 벽 1을 가로지름)", has("wall", "n3"), report.issues);
check("검사: 문 앞 장애물(방문 앞 서랍장)", has("door", "n4"), report.issues);
check("검사: 집 밖(책상)", has("outside", "n5"), report.issues);
check("검사: 방 밖(벽 위 중심) — 옷장 중심이 벽 위", has("noroom", "n3"));
check("가구가 든 방", report.itemRoom.n1 === 0);
const fx: HouseModel = { ...h0, fixed: [{ id: "f1", kind: "closet", x: 0, y: 0, w: 1.2, d: 0.6, h: 2.2 }], items: [item("n1", "h-drawer", 0.6, 0.5)] };
report = runHouseChecks(fx, detectRooms(fx));
check("검사: 고정 구조물과 겹침", report.issues.some((i) => i.key === "fixed" && i.text.includes("붙박이장")), report.issues);
const gap: HouseModel = { ...h0, items: [item("n1", "h-wardrobe", 0.9, 4)] };
report = runHouseChecks(gap, detectRooms(gap));
check("통로 간격 알림: 바깥 벽과 300mm(편집 참고, 확인할 것에 안 셈)", report.issues.length === 0 && report.notices.some((n) => n.text === "옷장과 바깥 벽 사이 빈 간격 300mm"), report.notices);
const ok: HouseModel = { ...h2, items: [item("n1", "h-bed-queen", 2.5, 2)] };
report = runHouseChecks(ok, detectRooms(ok));
check("검사 통과 자리: 확인할 것 0", report.issues.length === 0, report.issues);

// ── 5. 입력 읽기·가구 다시 채우기
const created = parseHouseCreate(JSON.stringify({ source: "dims", width: 9.6, depth: 7.2, height: 2.3 }));
check("치수로 만들기: 직사각형 윤곽·천장 2,300", !!created && created.outline.length === 4 && created.width === 9.6 && created.height === 2.3 && houseErrors(created).length === 0);
const traced = parseHouseCreate(JSON.stringify({ source: "trace", outline: [[0, 0], [0, 5], [8, 5], [8, 0]], height: null, underlay: { iw: 1600, ih: 1100, m: [0.01, 0, 0, -0.01, 0, 11] } }));
check("따라 그리기: 윤곽을 반시계로 정리, 밑그림, 천장 기본 2,400", !!traced && traced.outline[1][0] === 8 && traced.underlay?.iw === 1600 && traced.height === 2.4);
const edit = parseHouseEdit({ height: 2.4, walls: [{ id: "w1", a: [10, 4], b: [0, 4], t: 0.1 }], openings: [{ id: "d1", kind: "x", wall: "w1", at: 1, width: 0.9 }], labels: [{ id: "l1", x: 1, y: 1, name: "  안방  ", kind: "bed" }], fixed: [] });
check("편집 읽기: 벽 끝 정렬, 모르는 문 종류는 방문, 이름 다듬기", !!edit && edit.walls[0].a[0] === 0 && edit.openings[0].kind === "door" && edit.openings[0].hinge === "a" && edit.labels[0].name === "안방");
const rb = rebuildHouseItems([{ id: "n1", src: "catalog:h-bed-queen", label: "", x: 2, y: 2, rot: 90, w: 1.4, d: 2 }], h0);
check("가구 다시 채우기: 크기 조절 1,400", "items" in rb && rb.items[0].w === 1.4 && rb.items[0].rot === 90);
check("가구 다시 채우기: 모르는 종류 거절", "error" in rebuildHouseItems([{ id: "n1", src: "catalog:x", label: "", x: 2, y: 2, rot: 0 }], h0));
check("가구 다시 채우기: 범위 밖 크기 거절", "error" in rebuildHouseItems([{ id: "n1", src: "catalog:h-bed-queen", label: "", x: 2, y: 2, rot: 0, w: 3.5 }], h0));

// ── 6. 바뀐 점 문장
const v2: HouseModel = {
  ...named,
  rev: 2,
  saved_at: "2026-10-05 11:00:00",
  walls: [...named.walls, { id: "w3", a: [5, 4], b: [5, 8], t: 0.1 }],
  labels: [{ id: "l1", x: 2.5, y: 2, name: "안방", kind: "bed" }, named.labels[1]],
  openings: [{ id: "d1", kind: "door", wall: "w1", at: 1, width: 0.9, hinge: "a", side: 1 }],
  items: [item("n1", "h-bed-queen", 2.5, 2)],
};
const lines = diffHouse({ ...named, rev: 1 }, v2);
check("바뀐 점: 평면 1 → 2, 벽 수, 문, 방 이름, 방 면적, 가구", lines[0] === "집 전체 평면 수정 (평면 1 → 2)" && lines.some((l) => l.includes("내부 벽: 2개 → 3개")) && lines.some((l) => l.includes("문·통로: 없음 → 방문 1")) && lines.some((l) => l.includes("방 이름: 침실1 → 안방")) && lines.some((l) => l.includes("거실 면적")) && lines.some((l) => l.includes("가구: 추가 1")), lines);
check("바뀐 점: 추가·삭제", diffHouse(null, v2)[0].startsWith("집 전체 평면 추가: 평면 2") && diffHouse(v2, null)[0] === "집 전체 평면 삭제 (평면 2)" && diffHouse(v2, v2).length === 0);
const snap = (house: HouseModel | null) => ({ region: "서울", budget_min: null, budget_max: null, desired_start: "", desired_movein: "", notes: "", work_scope: "", version: { id: 1, no: 1, selected_option: "", selected_option_title: "", selected_style: "natural", layout_status: "home", intake: null }, refs: [], files: [], kind: "home", home: { homeType: "apartment", scope: "full", works: [], spaces: [], area: null, areaUnit: "pyeong", areaBasis: "unknown", rooms: null, baths: null, builtYear: null, occupancy: null, rules: "" }, rooms: [], house }) as unknown as RequestSnapshot;
check("요청 내용 차이에 집 전체 평면 포함(예전 기록에 house 없음도)", diffRequest(snap(null), snap(v2)).some((l) => l.startsWith("집 전체 평면 추가")) && diffRequest({ ...snap(null), house: undefined }, snap(null)).length === 0);
check("요약 문장", describeHouse(v2).summary === "방 4개 · 내부 벽 3 · 문·통로 1 · 창 0 · 가구 1", describeHouse(v2).summary);
check("저장 비교 열쇠: 가구 위치가 바뀌면 다름", houseKey(v2) !== houseKey({ ...v2, items: [item("n1", "h-bed-queen", 2.6, 2)] }));

// ── 7. 3D 장면
const scene = composeHouse(entry, detectRooms(entry));
check("3D: 문 위 벽(문 2개), 바닥은 방마다", scene.objects.filter((o) => o.name === "문 위 벽").length === 2 && scene.objects.filter((o) => o.name.startsWith("바닥 · ")).length >= 3);
const win: HouseModel = { ...h0, openings: [{ id: "d1", kind: "window", wall: "o2", at: 2, width: 1.5 }] };
const ws = composeHouse(win, detectRooms(win)).objects;
check("3D: 창 아래·위 벽과 창호", ws.some((o) => o.name === "창 아래 벽") && ws.some((o) => o.name === "창 위 벽") && ws.some((o) => o.kind === "window"));
const boxOnly: HouseModel = { ...h0, items: [{ ...item("n1", "h-drawer", 2, 2), parts: [], product: { id: 1, skuId: null, title: "상품", option: "", h: 1.1, model: null, price: 0, cover: null } }] };
const bo = composeHouse(boxOnly, detectRooms(boxOnly)).objects.find((o) => o.g === "n1");
check("부품 없는 가구(후속 상품)는 바닥면 상자로(3D·검사)", !!bo && near(bo.w, 0.8) && near(bo.d, 0.45) && near(bo.h, 1.1) && runHouseChecks({ ...boxOnly, items: [...boxOnly.items, item("n2", "h-drawer", 2.2, 2)] }, detectRooms(boxOnly)).issues.some((i) => i.key === "overlap"));
check("3D: 방 이름표(이름·면적)", composeHouse(named, detectRooms(named)).rooms.some((r) => r.label === "침실1 19.6㎡"), composeHouse(named, detectRooms(named)).rooms.map((r) => r.label));

// ── 8. 편집 맞춤 규칙
check("시작점: 바깥 벽 선에 맞춤(격자 50mm)", JSON.stringify(snapStart(h0, [0.03, 4.02], 0.2)) === "[0,4]");
check("시작점: 모서리·벽 끝에 맞춤", JSON.stringify(snapStart(h1, [9.9, 4.1], 0.2)) === "[10,4]");
check("시작점: 벽 선 위(T자)", JSON.stringify(snapStart(h1, [5.02, 4.08], 0.2)) === "[5,4]");
check("시작점: 격자", JSON.stringify(snapStart(h0, [2.33, 2.37], 0.1)) === "[2.35,2.35]");
check("끝점: 가로·세로로만", JSON.stringify(snapEnd(h0, [2, 2], [5, 2.4], 0.1)) === "[5,2]");
check("끝점: 만나는 벽 선에 맞춤", JSON.stringify(snapEnd(h1, [5, 0], [5.03, 3.9], 0.2)) === "[5,4]");
check("끝점: 바깥 벽을 넘지 않음", JSON.stringify(snapEnd(h0, [0, 2], [14, 2], 0.2)) === "[10,2]");
check("끝점: ㄱ자 집 안쪽 모서리에서 멈춤", JSON.stringify(snapEnd(L, [0, 4], [5.5, 4], 0.1)) === "[3,4]");
const pw = pickWall(h1, [5, 4.03], 0.1);
check("벽 고르기: 두께 안이면 그 벽, 위치", pw?.ref === "w1" && near(pw.t0, 5));
check("벽 고르기: 바깥 벽(두께 바깥쪽)", pickWall(h1, [3, -0.1], 0.1)?.ref === "o0");
check("벽 고르기: 내부 벽만", pickWall(h1, [3, -0.1], 0.1, "inner") === null);
const po = placeOpening(h1, "door", pw!, 5, "d1");
check("문 놓기: 누른 곳 가운데·격자", !("error" in po) && near(po.at, 4.55) && po.width === 0.9 && po.hinge === "a");
check("문 놓기: 겹치면 오류", "error" in placeOpening({ openings: [po as never] }, "passage", pw!, 5.2, "d2"));
check("창 놓기: 내부 벽 거절", "error" in placeOpening(h1, "window", pw!, 5, "d2"));
const spotH: HouseModel = { ...named, fixed: [{ id: "f1", kind: "closet", x: 0, y: 0, w: 1.2, d: 0.6, h: 2.2 }] };
const spotDet = detectRooms(spotH);
const bedSpot = findHouseSpot(spotH, spotDet, item("n9", "h-bed-queen", 0, 0), spotDet.regions[0]);
check("빈자리: 고른 방 안, 고정 구조물과 안 겹침", regionAt(spotDet.raster, bedSpot.x, bedSpot.y) === 0 && runHouseChecks({ ...spotH, items: [item("n9", "h-bed-queen", bedSpot.x, bedSpot.y)] }, spotDet).issues.length === 0, bedSpot);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
