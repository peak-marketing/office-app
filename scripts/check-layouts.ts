// 배치 엔진 검사. 여러 조건으로 배치를 만들어 기하 오류가 없는지 확인한다.
//   npm run check:layouts
// 확인하는 것: 공간 밖으로 나간 물체, 좌석 수, 가구·벽 겹침, 방 겹침, 출입구에서 모든 좌석과 방까지 폭 0.6m로 닿는지.
import { generateLayout } from "../lib/layout/generate";
import type { LayoutInput, LayoutOption, Obj } from "../lib/layout/types";
import { checkOption, composeOption, placementFromOption, worldParts } from "../lib/space/placement";

// 가구 묶음(편집 단위)과 배치 검사(lib/space/check.ts: 겹침·공간 밖·칸막이·문 앞 750mm 임시 기준)
function checkGroups(input: LayoutInput, o: LayoutOption): string[] {
  const errs: string[] = [];
  const furn = o.objects.filter((x) => x.kind === "furniture");
  const loose = furn.filter((x) => !x.g);
  if (loose.length) errs.push(`묶음 없는 가구: ${loose.slice(0, 3).map((x) => x.name).join(", ")}`);
  const ids = (o.groups ?? []).map((g) => g.id);
  if (new Set(ids).size !== ids.length) errs.push("묶음 id 중복");
  if ((o.groups ?? []).filter((g) => g.seat).length !== input.staff) errs.push(`업무석 묶음 수 ${(o.groups ?? []).filter((g) => g.seat).length} != ${input.staff}`);
  // 가구 목록으로 바꿨다가 다시 그려도 같은 물체가 나오는지
  const placement = placementFromOption(o);
  if (!placement) errs.push("가구 목록으로 바꾸지 못함");
  else {
    const key = (x: Obj) => [x.name, x.x, x.y, x.z, x.w, x.d, x.h, x.color, x.plan].join("|");
    const before = furn.map(key).sort();
    const after = placement.items.flatMap(worldParts).map(key).sort();
    if (before.join("\n") !== after.join("\n")) errs.push(`왕복 불일치 ${before.length}/${after.length}`);
  }
  const report = checkOption(o, input.staff);
  for (const issue of report.issues) errs.push(`검사 ${issue.key}: ${issue.text}`);
  return errs;
}
export { composeOption };

const CELL = 0.1;
function check(input: LayoutInput, o: LayoutOption): string[] {
  const errs: string[] = [];
  const { W, D } = o;
  const inner = o.objects.filter((x) => x.kind !== "outer" && x.kind !== "window");
  for (const x of inner) if (x.x < -2e-3 || x.y < -2e-3 || x.x + x.w > W + 2e-3 || x.y + x.d > D + 2e-3) errs.push(`밖으로 나감: ${x.name} (${x.x},${x.y},${x.w},${x.d})`);
  if (o.marks.seats.length !== input.staff) errs.push(`좌석 수 ${o.marks.seats.length} != ${input.staff}`);
  const desks = o.objects.filter((x) => /^직원 책상 \d+$/.test(x.name));
  if (desks.length !== input.staff) errs.push(`책상 수 ${desks.length}`);
  const hit2 = (a: Obj, b: Obj, e = 1e-3) => a.x < b.x + b.w - e && b.x < a.x + a.w - e && a.y < b.y + b.d - e && b.y < a.y + a.d - e;
  const hit3 = (a: Obj, b: Obj) => hit2(a, b) && a.z < b.z + b.h - 1e-3 && b.z < a.z + a.h - 1e-3;
  const walls = o.objects.filter((x) => (x.kind === "partition" || x.kind === "glass") && x.h > 1);
  const furn = o.objects.filter((x) => x.kind === "furniture");
  for (const f of furn) for (const w of walls) if (hit3(f, w)) errs.push(`벽과 겹침: ${f.name} / ${w.name} @(${f.x},${f.y})`);
  const stem = (n: string) => n.replace(/ (다리|좌판|등받이|기둥|베이스)$/, "").replace(/ \d+$/, "");
  for (let i = 0; i < furn.length; i++)
    for (let j = i + 1; j < furn.length; j++) {
      const a = furn[i], b = furn[j];
      if (!hit3(a, b)) continue;
      if (stem(a.name) === stem(b.name)) continue;
      const pair = [a.name, b.name].join("|");
      if (/모니터.*모니터 받침|모니터 받침.*모니터|상판|싱크|수전|상부장|소파/.test(pair)) continue;
      errs.push(`가구 겹침: ${a.name} / ${b.name} @(${a.x},${a.y})/(${b.x},${b.y})`);
    }
  const rooms = o.rooms.filter((x) => x.key !== "work");
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i], b = rooms[j];
      if (a.x < b.x + b.w - 1e-3 && b.x < a.x + a.w - 1e-3 && a.y < b.y + b.d - 1e-3 && b.y < a.y + a.d - 1e-3) errs.push(`방 겹침 ${a.label}/${b.label}`);
    }
  // 도달 가능성: 의자를 뺀 가구와 벽을 장애물로, 폭 0.6m 통과 기준.
  const nx = Math.round(W / CELL), ny = Math.round(D / CELL);
  const blocked = new Uint8Array(nx * ny);
  const obstacles = [...walls, ...furn.filter((f) => f.plan && !/의자|스툴|모니터|키보드|스크린|옆 가림/.test(f.name) && f.z < 1.0)];
  const R = 0.28;
  for (const ob of obstacles) {
    const x0 = Math.max(0, Math.floor((ob.x - R) / CELL + 1e-6)), x1 = Math.min(nx - 1, Math.ceil((ob.x + ob.w + R) / CELL - 1e-6) - 1);
    const y0 = Math.max(0, Math.floor((ob.y - R) / CELL + 1e-6)), y1 = Math.min(ny - 1, Math.ceil((ob.y + ob.d + R) / CELL - 1e-6) - 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) blocked[y * nx + x] = 1;
  }
  // 외벽 여유
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) if (x * CELL < R - 0.05 || (x + 1) * CELL > W - R + 0.05 || y * CELL < R - 0.05 || (y + 1) * CELL > D - R + 0.05) blocked[y * nx + x] = 1;
  const seen = new Uint8Array(nx * ny);
  const ex = Math.floor(((o.marks.entrance.x1 + o.marks.entrance.x2) / 2) / CELL), ey = 3;
  const q = [ey * nx + ex];
  if (blocked[q[0]]) errs.push("출입구 앞이 막힘");
  seen[q[0]] = 1;
  while (q.length) {
    const c = q.pop()!;
    const cx = c % nx, cy = (c - cx) / nx;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= nx || y >= ny) continue;
      const k = y * nx + x;
      if (seen[k] || blocked[k]) continue;
      seen[k] = 1; q.push(k);
    }
  }
  const near = (px: number, py: number, rad: number) => {
    const x0 = Math.max(0, Math.floor((px - rad) / CELL)), x1 = Math.min(nx - 1, Math.floor((px + rad) / CELL));
    const y0 = Math.max(0, Math.floor((py - rad) / CELL)), y1 = Math.min(ny - 1, Math.floor((py + rad) / CELL));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (seen[y * nx + x]) return true;
    return false;
  };
  const seatChairs = o.objects.filter((x) => /^직원 의자 \d+ 좌판$/.test(x.name));
  for (const c of seatChairs) if (!near(c.x + c.w / 2, c.y + c.d / 2, 0.45)) errs.push(`좌석 도달 불가: ${c.name} @(${c.x},${c.y})`);
  for (const room of rooms) {
    if (room.key === "spare") { if (!near(room.x + room.w / 2, room.y + 0.6, 0.5)) errs.push(`구역 도달 불가: ${room.label}`); continue; }
    // 방 안 어딘가에 닿는가
    let ok = false;
    for (let y = Math.ceil(room.y / CELL); y < Math.floor((room.y + room.d) / CELL) && !ok; y++)
      for (let x = Math.ceil(room.x / CELL); x < Math.floor((room.x + room.w) / CELL); x++) if (seen[y * nx + x]) { ok = true; break; }
    if (!ok) errs.push(`방 도달 불가: ${room.label} (${room.x},${room.y},${room.w},${room.d})`);
  }
  if (o.visitorPath) for (const [x, y] of o.visitorPath) if (x < -1e-6 || x > W + 1e-6 || y < -1e-6 || y > D + 1e-6) errs.push("동선이 밖으로 나감");
  return errs;
}

const stats: Record<string, number> = {};
let total = 0, bad = 0, review = 0;
const samples: string[] = [];
const combos: [boolean, boolean, boolean, boolean][] = [];
for (const a of [true, false]) for (const b of [true, false]) for (const c of [true, false]) for (const d of [true, false]) combos.push([a, b, c, d]);
const cases: LayoutInput[] = [];
for (const area of [20, 22, 25, 28, 30, 33, 36, 40, 45, 50])
  for (const staff of [2, 4, 6, 8, 10, 12, 16, 20, 26])
    for (const [ceo, meeting, pantry, storage] of combos)
      for (const seats of meeting ? [4, 6, 8, 12] : [6])
        for (const entrance of ["right", "left"] as const)
          cases.push({ areaPyeong: area, staff, ceo, meeting, meetingSeats: seats, pantry, storage, entrance, shape: "rect", pillars: 0, furnitureIncluded: true });
for (const [w, d] of [[14, 7], [7, 12], [10, 10], [16, 8], [8.5, 9], [12, 6.5], [9.3, 11.2]])
  for (const staff of [4, 8, 12, 18])
    for (const [ceo, meeting, pantry, storage] of combos)
      cases.push({ areaPyeong: Math.round((w * d) / 3.305785), widthM: w, depthM: d, staff, ceo, meeting, meetingSeats: 6, pantry, storage, entrance: "right", shape: "rect", pillars: 0, furnitureIncluded: true });

for (const [off, ew] of [[0.3, 0.9], [0.5, 1.2], [1.5, 1.2], [2.5, 1.0], [2.5, 1.8], [0, 0.9]])
  for (const [w, d] of [[11, 9], [13, 8], [9, 10], [12.5, 10.5]])
    for (const staff of [6, 10, 14])
      for (const entrance of ["right", "left"] as const)
        for (const [ceo, meeting, pantry, storage] of [[true, true, true, false], [false, true, false, false], [true, true, true, true]] as const)
          cases.push({ areaPyeong: Math.round((w * d) / 3.305785), widthM: w, depthM: d, staff, ceo, meeting, meetingSeats: 6, pantry, storage, entrance, entranceOffset: off, entranceWidth: ew, shape: "rect", pillars: 0, furnitureIncluded: true });

for (const input of cases) {
  total++;
  const res = generateLayout(input);
  if (res.status !== "ok") { review++; continue; }
  const key = res.options.map((o) => o.purpose![0]).join("");
  stats[key] = (stats[key] ?? 0) + 1;
  for (const o of res.options) {
    const errs = [...check(input, o), ...checkGroups(input, o)];
    if (errs.length) {
      bad++;
      if (samples.length < 25) samples.push(`${JSON.stringify({ a: input.areaPyeong, w: input.widthM, d: input.depthM, s: input.staff, r: [input.ceo, input.meeting, input.pantry, input.storage].map(Number).join(""), ms: input.meetingSeats, e: input.entrance, eo: input.entranceOffset, ew: input.entranceWidth })} ${o.purpose} W${o.W} D${o.D}: ${[...new Set(errs)].slice(0, 4).join(" ; ")}`);
    }
  }
}
console.log({ total, review, bad, stats });
console.log(samples.join("\n"));
if (bad) process.exit(1);
