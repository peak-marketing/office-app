import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressHit } from "../lib/address";

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "building-check-"));
  process.env.DATA_DIR = dir;
  process.env.SEED_DEMO = "0";
  const savedFetch = globalThis.fetch;
  const { fetchBuildingInfo } = await import("../lib/building-api");
  const { buildingInfo } = await import("../lib/address");
  const { all, db } = await import("../lib/db");
  const hit: AddressHit = { roadAddr: "검사로 46", jibunAddr: "검사동 651", zipNo: "11902", bdNm: "검사아파트", admCd: "4131010100", bun: "651", ji: "0", mt: false, apt: true };
  const plot = { sigunguCd: "41310", bjdongCd: "10100", platGbCd: "0", bun: "0651", ji: "0000" };
  const title = { ...plot, dongNm: "401동", bldNm: "검사아파트", mainAtchGbCd: "0", totArea: 13626.34, grndFlrCnt: 27, ugrndFlrCnt: 1, hhldCnt: 129, useAprDay: "20170807" };
  const own = { ...plot, dongNm: "401동", hoNm: "102", mgmBldrgstPk: "unit-102", exposPubuseGbCd: "1", exposPubuseGbCdNm: "전유", area: 74.94, flrNo: 1 };
  const fakeKey = "fake+building/key==";
  const response = (rows: unknown[], total = rows.length, page = 1) => Response.json({ response: { header: { resultCode: "00" }, body: { totalCount: String(total), pageNo: String(page), items: { item: rows } } } });
  const dispatch = (areaRows: unknown[]) => {
    globalThis.fetch = async (url) => String(url).includes("getBrTitleInfo") ? response([title]) : response(areaRows);
  };
  let n = 0;
  const check = (label: string, fn: () => void) => { fn(); n++; console.log(`PASS ${label}`); };
  try {
    for (const key of [fakeKey, encodeURIComponent(fakeKey)]) {
      process.env.DATA_GO_KR_KEY = key;
      const sent: URL[] = [];
      globalThis.fetch = async (url) => { const u = new URL(String(url)); sent.push(u); return response(u.pathname.includes("getBrTitleInfo") ? [title] : [own, { ...own, exposPubuseGbCd: "2", exposPubuseGbCdNm: "공용", area: 31.5 }]); };
      const result = await fetchBuildingInfo(hit, "401", "102호");
      check(`${key === fakeKey ? "일반" : "인코딩"} 인증키를 한 번만 인코딩해 공식 HTTPS 서비스 사용`, () => { assert.ok(sent.every((u) => u.searchParams.get("serviceKey") === fakeKey && u.origin === "https://apis.data.go.kr")); });
      check("선택한 동·호 전유면적만 합산하고 동별 건물 정보를 반환", () => { assert.equal(result.info?.unitArea, 74.94); assert.equal(result.info?.buildingDong, "401동"); assert.equal(result.info?.households, 129); assert.equal(result.info?.approvedAt, "2017.08.07"); });
      check("상세주소의 호 접미사를 변환하고 표제부의 정확한 동 이름으로 조회", () => { assert.equal(sent[1].searchParams.get("dongNm"), "401동"); assert.equal(sent[1].searchParams.get("hoNm"), "102"); });
    }
    dispatch([own, { ...own, dongNm: "402동", area: 999 }, { ...own, hoNm: "103", area: 999 }, { ...own, exposPubuseGbCd: "2", exposPubuseGbCdNm: "공용", area: 999 }]);
    const filtered = await fetchBuildingInfo(hit, "401동", "102호");
    check("다른 동·호 및 공용면적을 선택 호 면적에 넣지 않음", () => assert.equal(filtered.info?.unitArea, 74.94));

    let pages = 0;
    globalThis.fetch = async (url) => { pages++; const p = Number(new URL(String(url)).searchParams.get("pageNo")); return p === 1 ? response(Array.from({ length: 100 }, (_, i) => ({ ...title, dongNm: `${500 + i}동` })), 101) : response([title], 101, 2); };
    const paged = await fetchBuildingInfo(hit, "401동", "");
    check("표제부 전체 페이지를 읽어 뒤쪽의 선택 동도 찾음", () => { assert.equal(paged.info?.buildingDong, "401동"); assert.equal(pages, 2); });
    const missing = await fetchBuildingInfo(hit, "999동", "");
    check("없는 동을 다른 동의 정보로 대체하지 않음", () => { assert.equal(missing.info, null); assert.ok(missing.error); });
    dispatch([{ ...own, ji: "0001" }]);
    const wrongPlot = await fetchBuildingInfo(hit, "401동", "102");
    check("다른 지번 응답은 전용면적 자동 입력에 사용하지 않음", () => assert.equal(wrongPlot.info?.unitArea, null));

    for (const [label, rows] of [
      ["중복 전유부", [own, { ...own, rnum: "2" }]],
      ["서로 다른 대장", [own, { ...own, mgmBldrgstPk: "other-unit", area: 2 }]],
      ["누락 면적", [{ ...own, area: null }]],
      ["음수 면적", [{ ...own, area: -1 }]],
      ["공용부만 있음", [{ ...own, exposPubuseGbCd: "2", exposPubuseGbCdNm: "공용" }]],
      ["정상 0건", []],
    ] as [string, unknown[]][]) {
      dispatch(rows);
      const r = await fetchBuildingInfo(hit, "401동", "102");
      check(`${label}이면 0원·0㎡ 또는 추정 면적으로 채우지 않음`, () => { assert.equal(r.info?.unitArea, null); assert.ok(r.info?.unitNote); });
    }
    dispatch([own, { ...own, flrNo: 2, area: 10 }]);
    const duplex = await fetchBuildingInfo(hit, "401동", "102");
    check("동일 호·동일 대장의 서로 다른 층 전유면적은 합산", () => assert.equal(duplex.info?.unitArea, 84.94));

    let calls = 0;
    globalThis.fetch = async () => { calls++; return calls === 1 ? Response.json({ OpenAPI_ServiceResponse: { cmmMsgHeader: { returnReasonCode: "05" } } }, { status: 503 }) : response([title]); };
    const retried = await fetchBuildingInfo(hit, "401동", "");
    check("일시적인 서비스 연결 실패는 재시도 후 회복", () => { assert.ok(retried.info); assert.equal(calls, 2); });
    calls = 0;
    globalThis.fetch = async () => { calls++; return calls === 1 ? new Response("") : response([title]); };
    const emptyRetry = await fetchBuildingInfo(hit, "401동", "");
    check("빈 응답을 미수록으로 오인하지 않고 재확인", () => { assert.ok(emptyRetry.info); assert.equal(calls, 2); });
    calls = 0;
    globalThis.fetch = async () => { calls++; return new Response("", { status: 401 }); };
    const auth = await fetchBuildingInfo(hit, "401동", "102");
    check("인증 실패는 재시도 없이 안전한 안내 반환", () => { assert.equal(calls, 1); assert.equal(auth.info, null); assert.ok(auth.error?.includes("인증")); });
    globalThis.fetch = async () => response([title], 2);
    const incomplete = await fetchBuildingInfo(hit, "401동", "");
    check("불완전한 표제부를 성공으로 취급하지 않음", () => assert.equal(incomplete.info, null));
    globalThis.fetch = async (url) => String(url).includes("getBrTitleInfo") ? response([title]) : response([own], 2);
    const areaIncomplete = await fetchBuildingInfo(hit, "401동", "102");
    check("불완전한 면적 응답은 건물 정보만 유지하고 면적은 비워 둠", () => { assert.equal(areaIncomplete.info?.buildingDong, "401동"); assert.equal(areaIncomplete.info?.unitArea, null); assert.ok(areaIncomplete.info?.unitNote.includes("실패")); });
    globalThis.fetch = async (url) => { if (String(url).includes("getBrTitleInfo")) return response([title]); throw new Error(`https://apis.data.go.kr/?serviceKey=${fakeKey}&dongNm=401동&hoNm=102호`); };
    const failure = await buildingInfo(hit, "401동", "102호", null);
    const logs = all("SELECT query, result FROM ext_lookups");
    check("실패 응답과 조회 기록에 인증키·선택 동·호를 남기지 않음", () => { for (const secret of [fakeKey, "401동", "102호", "serviceKey"]) assert.ok(!JSON.stringify([logs, failure.error, failure.info?.unitNote]).includes(secret)); });
    console.log(`${n} passed, 0 failed (isolated DB, mocked building registry)`);
  } finally {
    globalThis.fetch = savedFetch;
    db().close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch(() => { console.error("FAIL building registry checks"); process.exitCode = 1; });
