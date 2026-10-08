import type { AddressHit, BuildingInfo } from "./address";

type Row = Record<string, unknown>;
const BASE = "https://apis.data.go.kr/1613000/BldRgstHubService";
const num = (v: unknown) => v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
const name = (v: unknown) => String(v ?? "").normalize("NFKC").trim();
const unitName = (v: unknown, suffix: "동" | "호") => {
  const text = name(v).replace(new RegExp(`${suffix}$`), "").trim();
  return /^\d+$/.test(text) ? String(Number(text)) : text;
};
const samePlot = (row: Row, hit: AddressHit) =>
  String(row.sigunguCd ?? "") === hit.admCd.slice(0, 5) && String(row.bjdongCd ?? "") === hit.admCd.slice(5) &&
  String(row.platGbCd ?? "") === (hit.mt ? "1" : "0") &&
  num(row.bun) === Number(hit.bun) && num(row.ji) === Number(hit.ji);

class ProviderError extends Error {
  constructor(public kind: "auth" | "failed" | "invalid") { super(kind); }
}

/** Use the decoded key with URLSearchParams, accepting either portal key format exactly once. */
function serviceKey() {
  const raw = process.env.DATA_GO_KR_KEY?.trim() ?? "";
  try { return /%[0-9a-f]{2}/i.test(raw) ? decodeURIComponent(raw) : raw; }
  catch { throw new ProviderError("auth"); }
}

async function readPage(operation: string, params: URLSearchParams) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${BASE}/${operation}?${params}`, { signal: AbortSignal.timeout(8_000), cache: "no-store" });
      if (res.status === 401 || res.status === 403) throw new ProviderError("auth");
      if (!res.ok) throw new ProviderError("failed");
      const raw = await res.text();
      if (!raw.trim()) throw new ProviderError("failed");
      const parsed = JSON.parse(raw) as {
        response?: { header?: { resultCode?: string }; body?: { totalCount?: unknown; pageNo?: unknown; numOfRows?: unknown; items?: { item?: Row | Row[] } | "" } };
        OpenAPI_ServiceResponse?: { cmmMsgHeader?: { returnReasonCode?: string } };
      };
      const code = parsed.response?.header?.resultCode ?? parsed.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnReasonCode;
      if (["20", "30", "31"].includes(String(code))) throw new ProviderError("auth");
      if (code !== "00") throw new ProviderError(code === "05" ? "failed" : "invalid");
      const body = parsed.response?.body;
      const total = num(body?.totalCount);
      if (!body || total === null || total < 0 || !Number.isInteger(total)) throw new ProviderError("invalid");
      if (body.pageNo !== undefined && Number(body.pageNo) !== Number(params.get("pageNo"))) throw new ProviderError("invalid");
      const item = typeof body.items === "object" && body.items ? body.items.item : undefined;
      const rows = item == null ? [] : Array.isArray(item) ? item : [item];
      if (rows.some((row) => !row || typeof row !== "object")) throw new ProviderError("invalid");
      return { total, rows };
    } catch (error) {
      // Never retain an upstream URL/message: it can contain serviceKey or the selected unit.
      const failure = error instanceof ProviderError ? error : new ProviderError("failed");
      if (failure.kind !== "failed" || attempt === 2) throw failure;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw new ProviderError("failed");
}

async function readAll(operation: string, query: URLSearchParams) {
  const rows: Row[] = [];
  let total: number | null = null;
  // A selected unit is usually a handful of records. Fail instead of using a partial large list.
  for (let page = 1; page <= 10; page++) {
    const params = new URLSearchParams(query);
    params.set("pageNo", String(page));
    const r = await readPage(operation, params);
    if (total !== null && total !== r.total) throw new ProviderError("invalid");
    total = r.total;
    rows.push(...r.rows);
    if (rows.length === total) return rows;
    if (!r.rows.length || rows.length > total || total > 1_000) throw new ProviderError("invalid");
  }
  throw new ProviderError("invalid");
}

export async function fetchBuildingInfo(hit: AddressHit, dong: string, ho: string): Promise<{ info: BuildingInfo | null; error?: string }> {
  if (!/^\d{10}$/.test(hit?.admCd ?? "") || !/^\d{1,4}$/.test(hit?.bun ?? "") || !/^\d{1,4}$/.test(hit?.ji ?? "") ||
      typeof dong !== "string" || typeof ho !== "string" || dong.length > 40 || ho.length > 40) {
    return { info: null, error: "주소와 동·호를 다시 확인해 주세요." };
  }
  try {
    const query = new URLSearchParams({ serviceKey: serviceKey(), sigunguCd: hit.admCd.slice(0, 5), bjdongCd: hit.admCd.slice(5),
      platGbCd: hit.mt ? "1" : "0", bun: hit.bun.padStart(4, "0"), ji: hit.ji.padStart(4, "0"), _type: "json", numOfRows: "100" });
    const titles = await readAll("getBrTitleInfo", query);
    if (titles.some((row) => !samePlot(row, hit))) throw new ProviderError("invalid");
    const wantedDong = unitName(dong, "동");
    let matches = titles.filter((row) => !wantedDong || unitName(row.dongNm, "동") === wantedDong);
    if (matches.length > 1) {
      const primary = matches.filter((row) => String(row.mainAtchGbCd) === "0");
      if (primary.length === 1) matches = primary;
    }
    if (matches.length !== 1) return { info: null, error: matches.length ? "이 주소에 여러 건물이 있어요. 동을 선택하거나 직접 입력해 주세요." : "선택한 동의 건축물대장을 찾지 못했어요. 주소와 동을 확인해 주세요." };
    const main = matches[0];
    let unitArea: number | null = null;
    let unitNote = "";
    if (ho.trim()) {
      const uq = new URLSearchParams(query);
      // JUSO can return '102호', while building registry uses '102'. Dong uses the registry's exact name.
      uq.set("dongNm", name(main.dongNm));
      uq.set("hoNm", unitName(ho, "호"));
      try {
        const units = await readAll("getBrExposPubuseAreaInfo", uq);
        if (units.some((row) => !samePlot(row, hit))) throw new ProviderError("invalid");
        const matching = units.filter((row) => unitName(row.dongNm, "동") === unitName(main.dongNm, "동") && unitName(row.hoNm, "호") === unitName(ho, "호"));
        const own = matching.filter((row) => String(row.exposPubuseGbCd) === "1" && name(row.exposPubuseGbCdNm) === "전유");
        const unitIds = new Set(own.map((row) => name(row.mgmBldrgstPk)));
        const records = new Set(own.map((row) => JSON.stringify(Object.entries(row).filter(([key]) => key !== "rnum").sort(([a], [b]) => a.localeCompare(b)))));
        if (!own.length) unitNote = "이 동·호의 전용면적을 확인하지 못했어요. 직접 입력해 주세요.";
        else if (unitIds.size !== 1 || unitIds.has("") || records.size !== own.length || own.some((row) => num(row.area) === null || Number(row.area) <= 0)) {
          unitNote = "전유부 정보가 중복되거나 면적이 불명확해 자동 입력하지 않았어요.";
        } else {
          unitArea = Math.round(own.reduce((sum, row) => sum + Number(row.area), 0) * 100) / 100;
          unitNote = "선택한 동·호의 건축물대장 전유부 · 공용면적 제외";
        }
      } catch (error) {
        unitNote = error instanceof ProviderError && error.kind === "auth" ? "전용면적 조회 권한을 확인하지 못했어요. 직접 입력할 수 있어요." : "전용면적 조회에 실패했어요. 다시 조회하거나 직접 입력해 주세요.";
      }
    }
    return { info: {
      name: name(main.bldNm) || hit.bdNm, buildingDong: name(main.dongNm), purpose: name(main.mainPurpsCdNm), totalArea: num(main.totArea),
      floors: `지상 ${main.grndFlrCnt ?? "-"}층 / 지하 ${main.ugrndFlrCnt ?? "-"}층`, approvedAt: name(main.useAprDay).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1.$2.$3"),
      households: num(main.hhldCnt), structure: name(main.strctCdNm), unitArea, unitNote,
    } };
  } catch (error) {
    return { info: null, error: error instanceof ProviderError && error.kind === "auth" ?
      "건축물대장 인증 또는 이용 승인을 확인하지 못했어요. 운영자에게 문의하거나 자료를 직접 입력해 주세요." :
      "건축물대장 서비스 응답을 확인하지 못했어요. 다시 조회하거나 도면·치수를 직접 입력해 주세요." };
  }
}
