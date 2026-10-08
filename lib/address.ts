import { run } from "./db";
import { fetchBuildingInfo } from "./building-api";

// 주소로 공간 정보 찾기. 공공 API로 실제로 받을 수 있는 것만 쓴다.
// - 주소 검색: 행정안전부 도로명주소 검색 API(business.juso.go.kr, JUSO_API_KEY)
// - 상세주소: 동 목록 → 선택한 동의 층·호 목록(JUSO_DETAIL_API_KEY, 별도 승인키)
// - 건물 정보: 국토교통부 건축HUB 건축물대장정보 서비스(공공데이터포털, DATA_GO_KR_KEY) — 표제부(건물 전체)와 전유부(호별 전용면적)
// - 평면도(건축물현황도)는 공공 API로 받을 수 없다(정부24에서 소유자 등이 발급). 그래서 받는 방법을 안내하고, 받은 도면은 따라 그리기로 잇는다.
// 주소·건물 키가 없으면 예시임을 표시한다. 상세주소는 예시 호수를 만들지 않고 직접 입력으로 잇는다.

export interface AddressHit {
  roadAddr: string;
  jibunAddr: string;
  zipNo: string;
  bdNm: string;
  /** 행정구역코드 10자리(시군구 5 + 법정동 5) */
  admCd: string;
  /** 상세주소 API가 요구하는 도로명·건물 식별값. 이전 예시 주소에는 없을 수 있다. */
  rnMgtSn?: string;
  udrtYn?: string;
  buldMnnm?: string;
  buldSlno?: string;
  /** 지번 본번·부번, 산 여부 */
  bun: string;
  ji: string;
  mt: boolean;
  /** 공동주택 여부(도로명주소 API의 bdKdcd: 1 공동주택) */
  apt: boolean;
  example?: boolean;
}

export interface BuildingInfo {
  name: string;
  /** Building registry attributes describe this selected building/dong, not the whole complex. */
  buildingDong?: string;
  purpose: string;
  /** 연면적(㎡) */
  totalArea: number | null;
  floors: string;
  approvedAt: string;
  households: number | null;
  structure: string;
  /** 호를 넣었을 때 그 호의 전용면적(㎡) */
  unitArea: number | null;
  unitNote: string;
  example?: boolean;
}

export type Provider = "live" | "example";
export const addressProvider = (): Provider => (process.env.JUSO_API_KEY?.trim() ? "live" : "example");
export const buildingProvider = (): Provider => (process.env.DATA_GO_KR_KEY?.trim() ? "live" : "example");

const EXAMPLES: AddressHit[] = [
  { roadAddr: "서울특별시 예시구 예시로 12 (예시아파트)", jibunAddr: "서울특별시 예시구 예시동 100", zipNo: "00000", bdNm: "예시아파트", admCd: "1100000000", bun: "100", ji: "0", mt: false, apt: true, example: true },
  { roadAddr: "서울특별시 예시구 샘플길 34 (샘플빌라)", jibunAddr: "서울특별시 예시구 예시동 200-3", zipNo: "00001", bdNm: "샘플빌라", admCd: "1100000000", bun: "200", ji: "3", mt: false, apt: true, example: true },
  { roadAddr: "서울특별시 예시구 테스트대로 56 (테스트타워)", jibunAddr: "서울특별시 예시구 예시동 300", zipNo: "00002", bdNm: "테스트타워", admCd: "1100000000", bun: "300", ji: "0", mt: false, apt: false, example: true },
];

const log = (userId: number | null, kind: string, query: string, provider: string, ok: boolean, result: string) =>
  run(`INSERT INTO ext_lookups (user_id, kind, query, provider, ok, result) VALUES (?, ?, ?, ?, ?, ?)`, userId, kind, query.slice(0, 200), provider, ok ? 1 : 0, result.slice(0, 500));

export async function searchAddress(keyword: string, userId: number | null): Promise<{ hits: AddressHit[]; provider: Provider; error?: string }> {
  const q = keyword.trim().slice(0, 80);
  if (q.length < 2) return { hits: [], provider: addressProvider(), error: "두 글자 이상 입력해 주세요." };
  if (addressProvider() === "example") {
    const hits = EXAMPLES.filter((e) => [e.roadAddr, e.jibunAddr, e.bdNm].some((t) => t.includes(q)) || /예시|샘플|테스트/.test(q) || q.length >= 2).slice(0, 3);
    log(userId, "juso", q, "example", true, `${hits.length}`);
    return { hits, provider: "example" };
  }
  try {
    const url = `https://business.juso.go.kr/addrlink/addrLinkApi.do?confmKey=${encodeURIComponent(process.env.JUSO_API_KEY!)}&currentPage=1&countPerPage=10&keyword=${encodeURIComponent(q)}&resultType=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const body = (await res.json()) as { results?: { common?: { errorCode?: string; errorMessage?: string }; juso?: Record<string, string>[] | null } };
    const common = body.results?.common;
    if (common?.errorCode && common.errorCode !== "0") {
      log(userId, "juso", q, "live", false, `${common.errorCode} ${common.errorMessage}`);
      return { hits: [], provider: "live", error: common.errorMessage || "주소 검색에 실패했습니다." };
    }
    const hits = (body.results?.juso ?? []).map((j) => ({
      roadAddr: j.roadAddr,
      jibunAddr: j.jibunAddr,
      zipNo: j.zipNo,
      bdNm: j.bdNm ?? "",
      admCd: j.admCd,
      rnMgtSn: j.rnMgtSn,
      udrtYn: j.udrtYn,
      buldMnnm: j.buldMnnm,
      buldSlno: j.buldSlno,
      bun: String(Number(j.lnbrMnnm || 0)),
      ji: String(Number(j.lnbrSlno || 0)),
      mt: j.mtYn === "1",
      apt: j.bdKdcd === "1",
    }));
    log(userId, "juso", q, "live", true, `${hits.length}`);
    return { hits, provider: "live" };
  } catch {
    log(userId, "juso", q, "live", false, "connection-or-response-error");
    return { hits: [], provider: "live", error: "주소 검색 서비스에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요." };
  }
}

export interface AddressUnit {
  dongNm: string;
  floorNm: string;
  hoNm: string;
}

export type DetailStatus = "ready" | "unavailable" | "missing-key" | "invalid" | "failed";
export interface AddressDetailResult {
  dongs: string[];
  units: AddressUnit[];
  status: DetailStatus;
  error?: string;
}

/** Only identifiers from address search are sent upstream; selected unit names are never logged. */
export async function searchAddressDetails(
  hit: AddressHit,
  mode: "dong" | "floorho",
  dong: string,
  userId: number | null,
): Promise<AddressDetailResult> {
  const empty = (status: DetailStatus, error?: string): AddressDetailResult => ({ dongs: [], units: [], status, ...(error ? { error } : {}) });
  const key = process.env.JUSO_DETAIL_API_KEY?.trim();
  if (!key || hit?.example) return empty("missing-key");
  if (!hit || !/^\d{10}$/.test(hit.admCd ?? "") || !/^\d{10,14}$/.test(hit.rnMgtSn ?? "") ||
      !/^[01]$/.test(hit.udrtYn ?? "") || !/^\d{1,5}$/.test(hit.buldMnnm ?? "") ||
      !/^\d{1,5}$/.test(hit.buldSlno ?? "") || !["dong", "floorho"].includes(mode) ||
      typeof dong !== "string" || dong.length > 40) {
    return empty("invalid", "이 주소의 상세주소 조회 정보를 확인하지 못했어요. 동·호를 직접 입력해 주세요.");
  }
  const identity = { admCd: hit.admCd, rnMgtSn: hit.rnMgtSn!, udrtYn: hit.udrtYn!, buldMnnm: hit.buldMnnm!, buldSlno: hit.buldSlno! };
  const params = new URLSearchParams({ ...identity, confmKey: key, searchType: mode, resultType: "json" });
  if (mode === "floorho") params.set("dongNm", dong.trim());
  // Counts and status only. Never store dong/floor/ho or a URL containing confmKey.
  const record = (ok: boolean, result: string) => log(userId, "juso-detail", `${identity.admCd}:${identity.rnMgtSn}:${identity.udrtYn}:${identity.buldMnnm}:${identity.buldSlno}`, "live", ok, result);
  try {
    const res = await fetch(`https://business.juso.go.kr/addrlink/addrDetailApi.do?${params}`, {
      signal: AbortSignal.timeout(10_000), cache: "no-store",
    });
    if (!res.ok) throw new Error("HTTP failure");
    const body = await res.json() as { results?: { common?: { errorCode?: string; totalCount?: string }; juso?: Record<string, unknown>[] | null } };
    const common = body.results?.common;
    if (!common || common.errorCode !== "0") {
      record(false, "provider-error");
      return empty("failed", "상세주소를 조회하지 못했어요. 잠시 뒤 다시 조회하거나 직접 입력해 주세요.");
    }
    const rows = body.results?.juso;
    if (rows != null && !Array.isArray(rows)) throw new Error("Invalid response");
    const data = rows ?? [];
    // An unexpected building/dong must not become a selectable unit for this address.
    if (data.some((row) => !row || Object.entries(identity).some(([field, value]) => String(row[field] ?? "") !== value) ||
        (mode === "floorho" && String(row.dongNm ?? "").trim() !== dong.trim()))) {
      throw new Error("Address mismatch");
    }
    if (common.totalCount !== undefined && Number(common.totalCount) !== data.length) throw new Error("Incomplete response");
    const compare = new Intl.Collator("ko", { numeric: true }).compare;
    if (mode === "dong") {
      if (data.some((row) => typeof row.dongNm !== "string" || row.dongNm.length > 40)) throw new Error("Invalid dong");
      const dongs = [...new Set(data.map((row) => String(row.dongNm).trim()))].sort(compare);
      record(true, `dong-count:${dongs.length}`);
      return { ...empty(dongs.length ? "ready" : "unavailable"), dongs };
    }
    if (data.some((row) => typeof row.floorNm !== "string" || typeof row.hoNm !== "string" || !row.hoNm.trim() || row.hoNm.length > 40 || row.floorNm.length > 40)) throw new Error("Invalid unit");
    const unique = new Map<string, AddressUnit>();
    for (const row of data) {
      const unit = { dongNm: String(row.dongNm ?? "").trim(), floorNm: String(row.floorNm).trim(), hoNm: String(row.hoNm).trim() };
      unique.set(JSON.stringify([unit.dongNm, unit.floorNm, unit.hoNm]), unit);
    }
    const units = [...unique.values()].sort((a, b) => compare(a.floorNm, b.floorNm) || compare(a.hoNm, b.hoNm));
    record(true, `unit-count:${units.length}`);
    return { ...empty(units.length ? "ready" : "unavailable"), units };
  } catch {
    record(false, "connection-or-response-error");
    return empty("failed", "상세주소 서비스에 연결하지 못했어요. 다시 조회하거나 동·호를 직접 입력해 주세요.");
  }
}

/** 건축물대장: 표제부(건물 전체)와, 동·호를 주면 전유부(그 호의 전용면적) */
export async function buildingInfo(hit: AddressHit, dong: string, ho: string, userId: number | null): Promise<{ info: BuildingInfo | null; provider: Provider; error?: string }> {
  // Unit numbers are used for this lookup only; do not persist them in lookup logs.
  const key = hit.jibunAddr.trim();
  if (buildingProvider() === "example" && !hit.example) {
    return { info: null, provider: "example", error: "건축물대장 조회가 아직 연결되지 않아 실제 건물 정보와 전용면적을 확인하지 못했어요. 도면·치수를 직접 입력하거나 상담을 신청할 수 있어요." };
  }
  if (buildingProvider() === "example" || hit.example) {
    const info: BuildingInfo = {
      name: hit.bdNm || "예시 건물",
      purpose: hit.apt ? "공동주택(아파트)" : "업무시설",
      totalArea: hit.apt ? 25432.18 : 3120.5,
      floors: hit.apt ? "지상 15층 / 지하 2층" : "지상 8층 / 지하 1층",
      approvedAt: "2004.06.30",
      households: hit.apt ? 180 : null,
      structure: "철근콘크리트구조",
      unitArea: ho ? (hit.apt ? 84.97 : 99.2) : null,
      unitNote: ho ? "예시 값" : "",
      example: true,
    };
    log(userId, "building", key, "example", true, info.name);
    return { info, provider: "example" };
  }
  const result = await fetchBuildingInfo(hit, dong, ho);
  log(userId, "building", key, "live", !!result.info, result.info ? (ho && result.info.unitArea === null ? "building-found;unit-unconfirmed" : "building-found") : "lookup-failed");
  return { ...result, provider: "live" };
}

export const PLAN_SOURCES = [
  { title: "건축물현황도(평면도) 발급", body: "정부24에서 ‘건축물현황도’를 신청하면 평면도를 받을 수 있어요. 건물 소유자이거나 소유자의 위임을 받아야 해요(세입자는 소유자 동의 필요).", link: "https://www.gov.kr" },
  { title: "관리사무소·분양 자료", body: "아파트는 관리사무소에 평면도가 있거나, 분양 당시 카탈로그(평형별 평면도)를 단지 누리집에서 찾을 수 있어요." },
  { title: "직접 재기", body: "줄자로 방마다 가로·세로를 재면 치수로 공간을 만들 수 있어요. 문·창 위치도 함께 적어 주세요." },
] as const;
