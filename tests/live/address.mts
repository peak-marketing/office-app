// Explicit, free public-provider check. Run with --env-file=.env.local; uses a temporary DB.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "interior-address-detail-live-"));
process.env.DATA_DIR = dir;
process.env.SEED_DEMO = "0";
const results: { check: string; passed: boolean }[] = [];
const check = (title: string, fn: () => void) => { fn(); results.push({ check: title, passed: true }); console.log(`PASS ${title}`); };
try {
  const { searchAddress, searchAddressDetails, buildingInfo } = await import("../../lib/address");
  const { all, db } = await import("../../lib/db");
  assert.ok(process.env.JUSO_API_KEY && process.env.JUSO_DETAIL_API_KEY, "Both address keys required");
  const address = await searchAddress("구리시 산마루로 46", null);
  check("실제 주소 검색에서 갈매스타힐스 아파트 확인", () => { assert.equal(address.error, undefined); assert.equal(address.provider, "live"); assert.equal(address.hits[0]?.bdNm, "갈매스타힐스"); });
  const hit = address.hits[0];
  const dongs = await searchAddressDetails(hit, "dong", "", null);
  check("주소 검색 식별값으로 실제 동 목록 조회", () => { assert.equal(dongs.status, "ready"); assert.ok(dongs.dongs.includes("401동")); assert.ok(dongs.dongs.includes("412동")); });
  const units = await searchAddressDetails(hit, "floorho", "401동", null);
  check("선택한 401동의 실제 층·호 목록 조회", () => { assert.equal(units.status, "ready"); assert.ok(units.units.length > 0); assert.ok(units.units.every((u) => u.dongNm === "401동" && u.floorNm && u.hoNm)); });
  const logs = all<{ query: string; result: string }>("SELECT query, result FROM ext_lookups");
  check("실제 조회 결과와 기록에 승인키가 노출되지 않음", () => {
    const serialized = JSON.stringify([logs, address, dongs, units]);
    for (const key of [process.env.JUSO_API_KEY!, process.env.JUSO_DETAIL_API_KEY!]) assert.ok(!serialized.includes(key));
  });
  check("조회 기록에 선택 동·호를 남기지 않음", () => { assert.ok(!JSON.stringify(logs).includes("401동")); assert.ok(!JSON.stringify(logs).includes(units.units[0].hoNm)); });
  delete process.env.DATA_GO_KR_KEY;
  const building = await buildingInfo(hit, "401동", units.units[0].hoNm, null);
  check("건축물대장 미연결 상태에서는 실제 주소의 면적을 만들지 않음", () => assert.equal(building.info, null));
  const out = process.env.OUT;
  if (out) {
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "adapter-results.json"), JSON.stringify({ checkedAt: new Date().toISOString(), results, address: hit.roadAddr, dongs: dongs.dongs, unitCount401: units.units.length, floors401: [...new Set(units.units.map((u) => u.floorNm))] }, null, 2) + "\n");
  }
  db().close();
  console.log(`${results.length} passed, 0 failed; ${dongs.dongs.length} dongs, ${units.units.length} floor/unit records in dong 401`);
} catch (error) {
  // Upstream exception messages can contain authenticated URLs. Do not print them.
  console.error(JSON.stringify({ failed: true, passed: results.length, errorType: error instanceof Error ? error.name : "Unknown" }));
  process.exitCode = 1;
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
