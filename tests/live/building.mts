// Explicit free public API check; no customer data and no paid AI calls.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "building-live-"));
process.env.DATA_DIR = dir;
process.env.SEED_DEMO = "0";
const results: { check: string; passed: boolean }[] = [];
const check = (label: string, fn: () => void) => { fn(); results.push({ check: label, passed: true }); console.log(`PASS ${label}`); };
try {
  const { searchAddress, searchAddressDetails, buildingInfo } = await import("../../lib/address");
  const { all, db } = await import("../../lib/db");
  assert.ok(process.env.JUSO_API_KEY && process.env.JUSO_DETAIL_API_KEY && process.env.DATA_GO_KR_KEY);
  const address = await searchAddress("구리시 산마루로 46", null);
  check("실제 주소로 갈매스타힐스 아파트 식별", () => { assert.equal(address.provider, "live"); assert.equal(address.hits[0]?.bdNm, "갈매스타힐스"); });
  const hit = address.hits[0];
  const units = await searchAddressDetails(hit, "floorho", "401동", null);
  check("상세주소에서 401동 1층 102호 선택 가능", () => { assert.equal(units.status, "ready"); assert.ok(units.units.some((u) => u.dongNm === "401동" && u.floorNm === "1층" && u.hoNm === "102호")); });
  const result = await buildingInfo(hit, "401동", "102호", null);
  check("실제 선택 동의 건축물대장 정보 확인", () => { assert.equal(result.provider, "live"); assert.equal(result.info?.buildingDong, "401동"); assert.equal(result.info?.approvedAt, "2017.08.07"); assert.equal(result.info?.households, 129); });
  check("선택 호 전유부 면적 74.94㎡, 공용면적 제외", () => { assert.equal(result.info?.unitArea, 74.94); assert.ok(result.info?.unitNote.includes("공용면적 제외")); assert.ok(!result.info?.example); });
  const missing = await buildingInfo(hit, "999동", "102호", null);
  check("미수록 동에 다른 동의 건물·호 정보를 제시하지 않음", () => assert.equal(missing.info, null));
  const logs = all("SELECT query, result FROM ext_lookups");
  check("조회 기록에 승인키와 선택 동·호를 남기지 않음", () => {
    const text = JSON.stringify(logs);
    for (const privateValue of [process.env.JUSO_API_KEY!, process.env.JUSO_DETAIL_API_KEY!, process.env.DATA_GO_KR_KEY!, "401동", "102호"]) assert.ok(!text.includes(privateValue));
    const publicResult = JSON.stringify(result);
    assert.ok(!publicResult.includes(process.env.DATA_GO_KR_KEY!));
  });
  if (process.env.OUT) {
    fs.mkdirSync(process.env.OUT, { recursive: true });
    fs.writeFileSync(path.join(process.env.OUT, "live-results.json"), JSON.stringify({ checkedAt: new Date().toISOString(), results, address: hit.roadAddr, selectedDong: "401동", selectedHo: "102호", building: result.info }, null, 2) + "\n");
  }
  db().close();
  console.log(`${results.length} passed, 0 failed (live public APIs, isolated DB)`);
} catch (error) {
  // Never print a provider exception: it can include an authenticated URL.
  console.error(JSON.stringify({ failed: true, passed: results.length, errorType: error instanceof Error ? error.name : "Unknown" }));
  process.exitCode = 1;
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
