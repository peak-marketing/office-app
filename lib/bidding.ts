import { all, get } from "./db";
import { vendorFields, type Project, type Vendor } from "./data";

// 업체 직접 참여(공개 요청). 고객이 켠 요청만 승인된 시공사에 보이고, 참여 상한(bid_cap)까지 먼저 참여한 순서로 받는다.
// 운영자 배정도 그대로 쓸 수 있고, 상한은 운영자 배정 업체를 포함한 참여 업체 수다. 업체끼리는 서로의 제안을 볼 수 없다.

export const BID_CAP_MIN = 2;
export const BID_CAP_MAX = 8;
export const BID_MODE_TEXT = {
  operator: "운영자가 조건에 맞는 업체를 골라 보내요",
  open: "운영자 배정과 함께, 승인된 시공사가 요청을 보고 직접 참여할 수 있어요",
} as const;

/** 지금 이 요청에 참여 중인 업체 수(답을 기다리는 배정 포함, 거절·배정 취소 제외) */
export const participants = (projectId: number, versionId: number) =>
  get<{ n: number }>(`SELECT count(*) AS n FROM assignments WHERE project_id = ? AND version_id = ? AND status != 'declined' AND withdrawn_at IS NULL`, projectId, versionId)!.n;

/** 업체 직접 참여를 받을 수 있는 상태인지 */
export function openForBids(project: Project) {
  return project.bid_mode === "open" && !!project.requested_version_id && ["requested", "matching", "quoted"].includes(project.status) && !project.is_test;
}

/** 이 업체가 볼 수 있는 공개 요청. 시공 분야가 맞고, 아직 이 요청에 배정·참여한 적 없는 것 */
export function openRequestsFor(vendor: Vendor) {
  const fields = vendorFields(vendor);
  const rows = all<Project>(
    `SELECT p.* FROM projects p WHERE p.bid_mode = 'open' AND p.requested_version_id IS NOT NULL AND p.status IN ('requested','matching','quoted') AND p.is_test = 0
       AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.project_id = p.id AND a.vendor_id = ?)
     ORDER BY p.updated_at DESC`,
    vendor.id,
  );
  return rows
    .filter((p) => fields.includes(p.kind))
    .map((p) => {
      const n = participants(p.id, p.requested_version_id!);
      return { project: p, joined: n, left: Math.max(0, p.bid_cap - n) };
    });
}

/** 이 업체가 이 공개 요청에 참여할 수 있는지. 안 되면 이유 */
export function joinBlocker(project: Project | undefined, vendor: Vendor): string | null {
  if (vendor.status !== "approved") return "운영자 승인 뒤 참여할 수 있습니다.";
  if (!project || !openForBids(project)) return "지금은 직접 참여를 받지 않는 요청입니다.";
  if (!vendorFields(vendor).includes(project.kind)) return `업체 시공 분야에 ‘${project.kind === "home" ? "주거" : "사무실"}’이 없습니다. 업체 소개에서 분야를 추가해 주세요.`;
  if (get(`SELECT 1 AS ok FROM assignments WHERE project_id = ? AND vendor_id = ?`, project.id, vendor.id)) return "이미 배정받았거나 참여한 요청입니다.";
  if (participants(project.id, project.requested_version_id!) >= project.bid_cap) return `참여 업체가 ${project.bid_cap}곳으로 마감되었습니다.`;
  return null;
}
