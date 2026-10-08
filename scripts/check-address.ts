import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressHit } from "../lib/address";

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "address-check-"));
  process.env.DATA_DIR = dir;
  process.env.SEED_DEMO = "0";
  const savedFetch = globalThis.fetch;
  const { searchAddress, searchAddressDetails, buildingInfo } = await import("../lib/address");
  const { all, db } = await import("../lib/db");
  const hit: AddressHit = {
    roadAddr: "검사시 검사로 46", jibunAddr: "검사동 651", bdNm: "검사아파트", zipNo: "11902",
    admCd: "4131010100", rnMgtSn: "413103196005", udrtYn: "0", buldMnnm: "46", buldSlno: "0",
    bun: "651", ji: "0", mt: false, apt: true,
  };
  const row = { admCd: hit.admCd, rnMgtSn: hit.rnMgtSn, udrtYn: hit.udrtYn, buldMnnm: hit.buldMnnm, buldSlno: hit.buldSlno };
  const response = (rows: unknown[], total = rows.length) => Response.json({ results: { common: { errorCode: "0", totalCount: String(total) }, juso: rows } });
  let n = 0;
  const check = (title: string, fn: () => void) => { fn(); console.log(`PASS ${title}`); n++; };
  try {
    delete process.env.JUSO_DETAIL_API_KEY;
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error("Should not fetch"); };
    const missing = await searchAddressDetails(hit, "dong", "", null);
    check("키가 없으면 예시 호수를 만들거나 API를 호출하지 않음", () => {
      assert.equal(missing.status, "missing-key"); assert.deepEqual(missing.dongs, []); assert.equal(calls, 0);
    });
    process.env.JUSO_DETAIL_API_KEY = "test-detail-key";
    const invalid = await searchAddressDetails({ ...hit, rnMgtSn: undefined }, "dong", "", null);
    check("주소 식별값 누락은 API 호출 전 거절", () => { assert.equal(invalid.status, "invalid"); assert.equal(calls, 0); });
    const long = await searchAddressDetails(hit, "floorho", "x".repeat(41), null);
    check("잘못된 선택값은 API 호출 전 거절", () => { assert.equal(long.status, "invalid"); assert.equal(calls, 0); });

    let sent = "";
    globalThis.fetch = async (url) => { sent = String(url); return response([{ ...row, dongNm: "10동" }, { ...row, dongNm: "2동" }, { ...row, dongNm: "2동" }]); };
    const dongs = await searchAddressDetails(hit, "dong", "", null);
    check("실제 목록은 중복 제거·숫자순으로 선택 가능", () => { assert.equal(dongs.status, "ready"); assert.deepEqual(dongs.dongs, ["2동", "10동"]); });
    check("상세주소 전용 키와 조회한 건물 식별값 사용", () => {
      const url = new URL(sent); assert.equal(url.origin, "https://business.juso.go.kr");
      assert.equal(url.pathname, "/addrlink/addrDetailApi.do"); assert.equal(url.searchParams.get("confmKey"), "test-detail-key");
      assert.equal(url.searchParams.get("rnMgtSn"), hit.rnMgtSn); assert.equal(url.searchParams.get("searchType"), "dong");
    });

    globalThis.fetch = async (url) => { sent = String(url); return response([
      { ...row, dongNm: "401동", floorNm: "10층", hoNm: "1001호" },
      { ...row, dongNm: "401동", floorNm: "2층", hoNm: "201호" },
      { ...row, dongNm: "401동", floorNm: "2층", hoNm: "201호" },
    ]); };
    const units = await searchAddressDetails(hit, "floorho", "401동", null);
    check("선택 동으로 조회하고 층·호를 섞지 않음", () => {
      assert.equal(units.status, "ready"); assert.equal(new URL(sent).searchParams.get("dongNm"), "401동");
      assert.deepEqual(units.units.map((u) => [u.floorNm, u.hoNm]), [["2층", "201호"], ["10층", "1001호"]]);
    });
    globalThis.fetch = async () => response([{ ...row, buldMnnm: "44", dongNm: "401동" }]);
    const otherBuilding = await searchAddressDetails(hit, "dong", "", null);
    check("다른 건물의 동·호가 반환되면 선택지로 사용하지 않음", () => { assert.equal(otherBuilding.status, "failed"); assert.deepEqual(otherBuilding.dongs, []); });
    globalThis.fetch = async () => response([{ ...row, dongNm: "402동", floorNm: "2층", hoNm: "201호" }]);
    const otherDong = await searchAddressDetails(hit, "floorho", "401동", null);
    check("다른 동의 호수를 선택한 동으로 표시하지 않음", () => { assert.equal(otherDong.status, "failed"); assert.deepEqual(otherDong.units, []); });
    globalThis.fetch = async () => response([{ ...row, dongNm: "401동" }], 3);
    const incomplete = await searchAddressDetails(hit, "dong", "", null);
    check("불완전한 목록을 전체 조회 성공으로 표시하지 않음", () => assert.equal(incomplete.status, "failed"));
    globalThis.fetch = async () => response([]);
    const empty = await searchAddressDetails(hit, "dong", "", null);
    check("정상 0건과 통신 실패를 구분하고 직접 입력으로 진행", () => { assert.equal(empty.status, "unavailable"); assert.equal(empty.error, undefined); });
    globalThis.fetch = async () => Response.json({ results: { common: { errorCode: "E0001", errorMessage: "test-detail-key" }, juso: null } });
    const denied = await searchAddressDetails(hit, "dong", "", null);
    check("승인 실패 응답은 0건으로 숨기지 않고 비밀값을 노출하지 않음", () => { assert.equal(denied.status, "failed"); assert.ok(!JSON.stringify(denied).includes("test-detail-key")); });
    globalThis.fetch = async () => { throw new Error("https://business.juso.go.kr/?confmKey=test-detail-key&dongNm=401동&hoNm=1001호"); };
    const offline = await searchAddressDetails(hit, "dong", "", null);
    const logs = all<{ kind: string; query: string; result: string }>("SELECT kind, query, result FROM ext_lookups");
    check("통신 오류에도 승인키·선택 동·호를 응답과 로그에 저장하지 않음", () => {
      assert.equal(offline.status, "failed");
      for (const privateValue of ["test-detail-key", "401동", "1001호", "confmKey"]) assert.ok(!JSON.stringify([logs, offline]).includes(privateValue));
    });
    delete process.env.DATA_GO_KR_KEY;
    const building = await buildingInfo(hit, "401동", "1001호", null);
    check("실제 주소에 건축물대장 키가 없으면 가짜 면적을 채우지 않음", () => { assert.equal(building.info, null); assert.ok(building.error); });
    const demo = await buildingInfo({ ...hit, example: true }, "101", "1203", null);
    check("시연 주소의 기존 예시 흐름은 유지", () => { assert.equal(demo.info?.example, true); assert.equal(demo.info?.unitArea, 84.97); });
    process.env.JUSO_API_KEY = "test-search-key";
    globalThis.fetch = async () => Response.json({ results: { common: { errorCode: "0" }, juso: [{ ...row, roadAddr: hit.roadAddr, jibunAddr: hit.jibunAddr, zipNo: "11902", bdKdcd: "1", lnbrMnnm: "651", lnbrSlno: "0" }] } });
    const searched = await searchAddress("검사로 46", null);
    check("주소 검색 결과가 상세주소 조회 식별값을 보존", () => {
      assert.equal(searched.hits[0].rnMgtSn, hit.rnMgtSn); assert.equal(searched.hits[0].buldMnnm, "46"); assert.equal(searched.hits[0].udrtYn, "0");
    });
    console.log(`${n} passed, 0 failed (isolated DB, mocked provider responses)`);
  } finally {
    globalThis.fetch = savedFetch;
    db().close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch(() => { console.error("FAIL address contract checks"); process.exitCode = 1; });
