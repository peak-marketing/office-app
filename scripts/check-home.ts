// 주거 1차 규칙 검사: 집 요청 입력·요약, 주거 견적 항목, 방 한 칸 입력·검사·크기 조절, 방 배치 차이 문장.
// 실행: npm run check:home
import { HOME_QUOTE_CATEGORIES, QUOTE_CATEGORIES, categoriesOf, quoteCategories } from "../lib/constants";
import { diffHome, homeRows, homeVendorChecks, parseHomeInput, validateHome, type HomeInput } from "../lib/home";
import { compareQuotes, diffSnapshots } from "../lib/quotes";
import { diffRequest, type RequestSnapshot } from "../lib/request-snapshot";
import { bbox } from "../lib/space/check";
import {
  GAP_NOTICE,
  composeRoom,
  homeCatalogItems,
  homeRoomErrors,
  nextRoomId,
  parseHomeRoom,
  rebuildRoomItems,
  resizeItem,
  runRoomChecks,
  toRoomEdits,
  type HomeRoom,
} from "../lib/space/home-room";
import { footprint, worldParts } from "../lib/space/placement";
import { shellObjects } from "../lib/space/room";
import type { PlacedItem, RoomModel } from "../lib/space/types";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` ${extra}`}`);
};
const near = (a: number, b: number, e = 1e-3) => Math.abs(a - b) < e;

// ── 1. 집 요청 입력
const fd = (o: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
};
const minimal = parseHomeInput(fd({ homeType: "oneroom", scope: "undecided" }));
check("필수 3개만으로 통과(유형·지역·공사 범위)", validateHome(minimal, "서울 관악구") === null);
check("유형 없으면 거절", validateHome(parseHomeInput(fd({ scope: "full" })), "서울") !== null);
check("지역 없으면 거절", validateHome(minimal, "") !== null);
check("공사 범위 없으면 거절", validateHome(parseHomeInput(fd({ homeType: "villa" })), "서울") !== null);
check("부분 공사는 공사 1개 이상", validateHome(parseHomeInput(fd({ homeType: "villa", scope: "partial" })), "서울") !== null);
check("부분 공사 + 도배 통과", validateHome(parseHomeInput(fd({ homeType: "villa", scope: "partial", works: ["wallpaper"] })), "서울") === null);
check("전체 리모델링이면 공사 목록은 저장하지 않음", parseHomeInput(fd({ homeType: "apartment", scope: "full", works: ["bath"] })).works.length === 0);
check("모르는 공사 키는 버림", parseHomeInput(fd({ homeType: "apartment", scope: "partial", works: ["bath", "x"] })).works.join() === "bath");
check("준공 연도 ‘모름’", parseHomeInput(fd({ homeType: "apartment", scope: "full", builtUnknown: "on", builtYear: "2001" })).builtYear === "unknown");
check("면적 범위 밖 거절", validateHome(parseHomeInput(fd({ homeType: "apartment", scope: "full", area: "900" })), "서울") !== null);
for (const t of ["oneroom", "officetel", "villa", "apartment"]) check(`주거 유형 ${t} 받음`, parseHomeInput(fd({ homeType: t, scope: "full" })).homeType === t);

const proj = { region: "서울 관악구", budget_min: null, budget_max: null, desired_start: "", desired_movein: "", notes: "", work_scope: "" };
const rows = new Map(homeRows(proj, minimal));
check("요약: 입력 안 한 면적은 ‘입력하지 않음’", rows.get("면적") === "입력하지 않음");
check("요약: 방·욕실·준공·거주 ‘입력하지 않음’", ["방·욕실", "준공 연도", "거주 상태", "공사할 공간"].every((k) => rows.get(k) === "입력하지 않음"));
check("요약: 방 배치 없음", rows.get("방 배치") === "없음");
check("요약: 원룸은 관리 규약 줄을 비어 있을 때 넣지 않음", !rows.has("관리 규약·공사 가능 시간"));
const apt = parseHomeInput(fd({ homeType: "apartment", scope: "partial", works: ["balcony", "bath"], area: "84", areaUnit: "m2", areaBasis: "exclusive", occupancy: "occupied" }));
const aptRows = new Map(homeRows(proj, apt, 2));
check("요약: 아파트는 관리 규약 ‘입력하지 않음’ 표시", aptRows.get("관리 규약·공사 가능 시간") === "입력하지 않음");
check("요약: 면적 단위·기준", aptRows.get("면적") === "84㎡ (전용)");
check("요약: 방 배치는 집 전체 도면 아님", (aptRows.get("방 배치") ?? "").includes("집 전체 도면 아님"));
const checks = homeVendorChecks(apt, 2).join(" ");
check("업체 확인: 발코니 확장은 판정하지 않음", checks.includes("판정하지 않습니다"));
check("업체 확인: 거주 중 공사·관리 규약·급배수", checks.includes("거주 중 공사") && checks.includes("관리 규약") && checks.includes("급배수"));
check("업체 확인: 방 배치는 참고·집 전체 아님", checks.includes("집 전체 도면이나 실측이 아니며"));
check("집 정보 차이 문장", diffHome(minimal, { ...minimal, area: 9, areaUnit: "pyeong" } as HomeInput).some((l) => l === "면적: 입력하지 않음 → 9평 (기준 모름)"));

// ── 2. 견적 항목
check("주거 14항목", HOME_QUOTE_CATEGORIES.length === 14 && quoteCategories("home").length === 14 && quoteCategories("office").length === 13);
check("사무실·주거 키 겹치지 않음", HOME_QUOTE_CATEGORIES.every((h) => !QUOTE_CATEGORIES.some((o) => (o.key as string) === h.key)));
const homeItems = HOME_QUOTE_CATEGORIES.map((c) => ({ key: c.key, status: "included" as const, amount: 100000, spec: "" }));
const officeItems = QUOTE_CATEGORIES.map((c) => ({ key: c.key, status: "included" as const, amount: 100000, spec: "" }));
check("제안 항목으로 세트 구분", categoriesOf(homeItems).length === 14 && categoriesOf(officeItems).length === 13);
const cmp = compareQuotes([
  { id: 1, items: homeItems, vat_included: 1 },
  { id: 2, items: homeItems.map((it) => (it.key === "balcony" ? { ...it, status: "site_check" as const, amount: null } : it)), vat_included: 1 },
]);
check("주거 비교: 범위 차이는 주거 항목 이름", cmp.diffs.length === 1 && cmp.diffs[0].label === "발코니 확장·단열" && cmp.lowestId === null);
check("주거 제출본 차이 문장", diffSnapshots({ items: homeItems, vat_included: 1, duration_days: 10, start_available: "", extra_conditions: "", furniture_included: 0, note: "" }, { items: homeItems.map((it) => (it.key === "bath" ? { ...it, amount: 200000 } : it)), vat_included: 1, duration_days: 10, start_available: "", extra_conditions: "", furniture_included: 0, note: "" })[0]?.startsWith("욕실:"));

// ── 3. 방 한 칸 입력
// 화면(HomeRoomForm)이 보내는 모양 그대로: 고정 구조물은 pillars
const raw = (o: object) => JSON.stringify({ shape: "rect", width: 3.3, depth: 3, height: null, entrance: { at: 0.3, width: 0.9 }, windows: null, pillars: [], doors: [], utilities: [], source: "dims", ...o });
const room0 = parseHomeRoom(raw({}))!;
check("방 입력 통과", homeRoomErrors(room0).length === 0);
check("방 크기 범위 밖 거절", homeRoomErrors(parseHomeRoom(raw({ width: 1.2 }))!).length > 0 && homeRoomErrors(parseHomeRoom(raw({ depth: 16 }))!).length > 0);
check("방문이 벽 밖이면 거절", homeRoomErrors(parseHomeRoom(raw({ entrance: { at: 3, width: 0.9 } }))!).length > 0);
check("같은 벽 문 자리 겹치면 거절", homeRoomErrors(parseHomeRoom(raw({ doors: [{ wall: "front", at: 0.5, width: 0.8, label: "현관문" }] }))!).some((t) => t.includes("겹쳐요")));
check("문 자리 4개 이상 거절", homeRoomErrors(parseHomeRoom(raw({ doors: [0, 1, 2, 3].map((i) => ({ wall: "rear", at: i * 0.7, width: 0.6, label: "문" })) }))!).length > 0);
check("고정 구조물이 방 밖이면 거절", homeRoomErrors(parseHomeRoom(raw({ pillars: [{ label: "붙박이장", x: 2.8, y: 0, w: 1.2, d: 0.6 }] }))!).length > 0);
check("창 위치 모름은 null로 저장(임의 추가 없음)", room0.windows === null);
check("방 id는 지운 방 번호를 다시 쓰지 않음", nextRoomId(["room-1", "room-3"]) === "room-4" && nextRoomId([]) === "room-1");

// 앞벽 방문 + 안쪽 벽 욕실 문 + 붙박이장
const room: RoomModel = parseHomeRoom(raw({ width: 4, depth: 3.5, doors: [{ wall: "rear", at: 2.8, width: 0.8, label: "욕실 문" }], pillars: [{ label: "붙박이장", x: 0, y: 2.9, w: 1.2, d: 0.6, h: 2.2 }] }))!;
check("문·구조물 있는 방 통과", homeRoomErrors(room).length === 0, homeRoomErrors(room).join());
const opt = composeRoom({ room, items: [], name: "침실" });
check("평면·3D: 방문 표기", opt.entranceLabel === "방문");
check("평면·3D: 다른 문 자리 표시", opt.marks.spots?.length === 1 && opt.marks.spots[0].label === "욕실 문");
const walls = shellObjects(room).filter((o) => o.kind === "outer" && o.plan && o.name === "후면 벽");
const rearLen = walls.reduce((s, o) => s + o.w, 0);
check("3D 벽에 욕실 문 자리만큼 빈 곳", near(rearLen, 4 + 0.3 - 0.8), String(rearLen));
const fixedObj = shellObjects(room).find((o) => o.kind === "pillar");
check("고정 구조물 이름·높이", fixedObj?.name === "붙박이장" && near(fixedObj.h, 2.2));
const officeRoom = parseHomeRoom(raw({}))!;
delete officeRoom.doors;
check("문 자리 없는 방은 예전 벽 그대로(사무실 영향 없음)", shellObjects(officeRoom).some((o) => o.name === "전면 벽 A"));

// ── 4. 검사
const cat = homeCatalogItems();
check("개념 가구 20종", cat.length === 20, String(cat.length));
const T = (type: string) => cat.find((c) => c.type === type)!;
const put = (id: string, type: string, x: number, y: number, rot: 0 | 90 | 180 | 270 = 0, w?: number, d?: number): PlacedItem => {
  const c = T(type);
  const s = resizeItem({ w: c.w, d: c.d, parts: c.parts, bom: c.bom }, w ?? c.w, d ?? c.d);
  return { id, type, label: c.label, x, y, rot, w: s.w, d: s.d, parts: s.parts, bom: s.bom, origin: "added", src: `catalog:${type}` };
};
const keys = (r: ReturnType<typeof runRoomChecks>) => r.issues.map((i) => i.key).sort().join(",");
// 퀸 침대(1.5×2)를 붙박이장과 겹치게
check("고정 구조물과 겹침", keys(runRoomChecks(room, [put("a", "h-bed-queen", 0.75, 2.4)])).includes("fixed"));
check("가구끼리 겹침", keys(runRoomChecks(room, [put("a", "h-drawer", 2, 1.5), put("b", "h-drawer", 2.3, 1.5)])).includes("overlap"));
check("방 밖", keys(runRoomChecks(room, [put("a", "h-drawer", 3.9, 1.5)])).includes("bounds"));
check("방문 앞 바닥(폭 900 × 깊이 900)", runRoomChecks(room, [put("a", "h-drawer", 0.75, 0.5)]).issues.some((i) => i.key === "door" && i.text.includes("방문 앞 바닥(폭 900 × 깊이 900mm)")));
const wideDoor = parseHomeRoom(raw({ width: 4.5, depth: 3.9, doors: [{ wall: "rear", at: 0.5, width: 2.4, label: "발코니 문" }] }))!;
check("넓은 문 앞 깊이는 최대 900mm", !runRoomChecks(wideDoor, [put("a", "h-drawer", 1.5, 2.6)]).issues.some((i) => i.key === "door") && runRoomChecks(wideDoor, [put("a", "h-drawer", 1.5, 3.3)]).issues.some((i) => i.text.includes("발코니 문 앞 바닥(폭 2,400 × 깊이 900mm)")));
check("욕실 문 앞 바닥", runRoomChecks(room, [put("a", "h-drawer", 3.2, 3)]).issues.some((i) => i.key === "door" && i.text.includes("욕실 문")));
check("문 앞 깊이 900mm 밖이면 문 앞 아님", !runRoomChecks(room, [put("a", "h-drawer", 0.75, 1.2)]).issues.some((i) => i.key === "door"));
// 통로 간격: 서랍장(0.8×0.45)을 왼쪽 벽에서 400mm
const g1 = runRoomChecks(room, [put("a", "h-drawer", 0.4 + 0.4, 1.6)]);
check("통로 간격 알림: 벽과 400mm", g1.notices.some((n) => n.text === "서랍장과 왼쪽 벽 사이 빈 간격 400mm"), JSON.stringify(g1.notices));
check("통로 간격 알림은 확인할 것에 세지 않음", g1.issues.length === 0 && g1.notices.length >= 1);
check("50mm 이하는 붙인 것으로 보고 알리지 않음", !runRoomChecks(room, [put("a", "h-drawer", 0.4 + 0.03, 1.6)]).notices.some((n) => n.text.includes("왼쪽 벽")));
check("600mm 이상은 알리지 않음", !runRoomChecks(room, [put("a", "h-drawer", 0.4 + 0.65, 1.6)]).notices.some((n) => n.text.includes("왼쪽 벽")));
check("임시값 600mm", GAP_NOTICE === 0.6);
const pair = runRoomChecks(room, [put("a", "h-drawer", 1.4, 1.6), put("b", "h-drawer", 2.7, 1.6)]);
check("가구끼리 500mm: 한 번만 알림", pair.notices.filter((n) => n.ids.length === 2).length === 1 && pair.notices.some((n) => n.text === "서랍장과 서랍장 사이 빈 간격 500mm"), JSON.stringify(pair.notices));
const offset = runRoomChecks(room, [put("a", "h-drawer", 1.4, 1.0), put("b", "h-drawer", 2.7, 1.3)]);
check("마주 보는 길이 300mm 미만이면 간격으로 보지 않음", !offset.notices.some((n) => n.ids.length === 2), JSON.stringify(offset.notices));
check("가구와 고정 구조물 사이 간격", runRoomChecks(room, [put("a", "h-drawer", 0.4, 2.9 - 0.2 - 0.225)]).notices.some((n) => n.text.includes("붙박이장 사이 빈 간격 200mm")));

// ── 5. 크기 조절: 평면·3D·검사·저장 후 복원이 같은 크기
const big = put("a", "h-bed-queen", 2, 1.5, 0, 1.8, 2.1);
const fp = footprint(big);
const planBox = bbox(worldParts(big).filter((o) => o.plan));
check("크기 조절: 바닥면 = 바꾼 크기", near(fp.w, 1.8) && near(fp.d, 2.1));
check("크기 조절: 평면 부품 = 바꾼 크기", near(planBox.w, 1.8) && near(planBox.d, 2.1), JSON.stringify(planBox));
const objs3d = composeRoom({ room, items: [big], name: "침실" }).objects.filter((o) => o.g === "a");
const box3d = bbox(objs3d);
check("크기 조절: 3D 부품 = 바꾼 크기", near(box3d.w, 1.8) && near(box3d.d, 2.1), JSON.stringify(box3d));
check("크기 조절: 높이는 그대로", near(Math.max(...objs3d.map((o) => o.z + o.h)), Math.max(...T("h-bed-queen").parts.map((p) => p.z + p.h))));
check("크기 조절: 목록 규격도 바뀐 크기", big.bom[0].spec.startsWith("1,800 × 2,100"));
const rotated = put("b", "h-bed-queen", 2, 1.5, 90, 1.8, 2.1);
check("크기 조절 + 회전: 바닥면 가로·세로 바뀜", near(footprint(rotated).w, 2.1) && near(footprint(rotated).d, 1.8));
// 큰 침대만 겹치는 자리: 기본 퀸(1.5)은 안 겹치고 1.8로 늘리면 서랍장과 겹친다
const drawer = put("d", "h-drawer", 3.35, 1.5);
check("크기 조절이 겹침 검사에 반영(기본 크기는 안 겹침)", !keys(runRoomChecks(room, [put("a", "h-bed-queen", 2, 1.5), drawer])).includes("overlap"));
check("크기 조절이 겹침 검사에 반영(늘리면 겹침)", keys(runRoomChecks(room, [put("a", "h-bed-queen", 2.2, 1.5, 0, 1.8, 2), drawer])).includes("overlap"));
const edits = toRoomEdits([big, rotated, drawer]);
const rebuilt = rebuildRoomItems(JSON.parse(JSON.stringify(edits)), room);
check("저장 후 복원: 같은 크기·부품", "items" in rebuilt && JSON.stringify(rebuilt.items.map((it) => [it.id, it.w, it.d, it.rot, it.parts])) === JSON.stringify([big, rotated, drawer].map((it) => [it.id, it.w, it.d, it.rot, it.parts])));
check("저장: 크기 범위 밖 거절", "error" in rebuildRoomItems([{ ...edits[0], w: 3.5 }], room) && "error" in rebuildRoomItems([{ ...edits[0], d: 0.2 }], room));
check("저장: 없는 가구 종류 거절", "error" in rebuildRoomItems([{ ...edits[0], src: "catalog:desk" }], room));
check("개념 가구 표시: 실제 상품 아님", cat.every((c) => !/[A-Z]{2,}\d|모델명/.test(c.desc)));

// ── 6. 방 배치 차이(요청 기록)
const hr = (id: string, name: string, rev: number, items: PlacedItem[] = [], r: RoomModel = room): HomeRoom => ({ id, name, rev, room: r, items, saved_at: "" });
const snap = (rooms: HomeRoom[]): RequestSnapshot => ({ region: "서울", budget_min: null, budget_max: null, desired_start: "", desired_movein: "", notes: "", work_scope: "", version: { id: 1, no: 1, selected_option: "", selected_option_title: "", selected_style: "natural", layout_status: "home", intake: null }, refs: [], files: [], kind: "home", home: minimal, rooms });
const a = snap([hr("room-1", "침실", 1, [put("a", "h-bed-queen", 2, 1.5)]), hr("room-2", "거실", 1)]);
const b = snap([hr("room-1", "침실", 2, [put("a", "h-bed-queen", 2, 1.5, 0, 1.8, 2.1)]), hr("room-3", "서재", 1)]);
const lines = diffRequest(a, b);
check("방 추가 문장", lines.includes("방 추가: 서재 (배치 1)"), lines.join(" / "));
check("방 삭제 문장", lines.includes("방 삭제: 거실"), lines.join(" / "));
check("방 수정 문장(배치 버전)", lines.includes("방 배치 수정: 침실 (배치 1 → 2)"), lines.join(" / "));
check("크기 조절도 변경으로 셈", lines.some((l) => l.includes("크기 조절 1")), lines.join(" / "));
check("이름만 바꾸면 이름 문장", diffRequest(a, snap([hr("room-1", "안방", 1, a.rooms![0].items), hr("room-2", "거실", 1)])).includes("방 이름: 침실 → 안방"));
check("같으면 차이 없음", diffRequest(a, snap(a.rooms!)).length === 0);
const wider = parseHomeRoom(raw({ width: 4.2, depth: 3.5, doors: [{ wall: "rear", at: 2.8, width: 0.8, label: "욕실 문" }], pillars: [{ label: "붙박이장", x: 0, y: 2.9, w: 1.2, d: 0.6, h: 2.2 }] }))!;
check("방 치수 바뀜 문장", diffRequest(a, snap([hr("room-1", "침실", 2, a.rooms![0].items, wider), hr("room-2", "거실", 1)])).some((l) => l.includes("침실 치수: 4,000 × 3,500 mm → 4,200 × 3,500 mm")));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
