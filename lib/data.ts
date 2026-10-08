import { all, get } from "./db";
import type { User } from "./auth";
import type { ProjectStatus, QuoteItem, SpaceKind } from "./constants";
import { isHomeInput, type HomeInput, type HomeType } from "./home";
import type { HomeRoom, RoomEdit } from "./space/home-room";
import type { HouseModel } from "./space/house";
import type { LayoutInput, LayoutResult } from "./layout/types";
import type { Placement, RoomModel } from "./space/types";
import { diffSnapshots, snapshotAmount, type QuoteDraft, type QuoteSnapshot } from "./quotes";

export interface Project {
  id: number;
  customer_id: number;
  title: string;
  region: string;
  address: string;
  status: ProjectStatus;
  current_version_id: number | null;
  requested_version_id: number | null;
  budget_min: number | null;
  budget_max: number | null;
  desired_start: string;
  desired_movein: string;
  notes: string;
  work_scope: string;
  is_test: number;
  /** office: 사무실, home: 집(주거). 주거 1차 이전 프로젝트는 모두 office */
  kind: SpaceKind;
  /** operator: 운영자 배정만, open: 승인 업체가 직접 참여(bid_cap곳까지) + 운영자 배정 */
  bid_mode: "operator" | "open";
  bid_cap: number;
  outcome: string | null;
  created_at: string;
  updated_at: string;
}

interface VersionRow {
  id: number;
  project_id: number;
  no: number;
  input: string;
  result: string;
  /** home: 집 요청(자동 배치 없음) */
  layout_status: "ok" | "needs_review" | "home";
  selected_option: string;
  selected_style: string;
  note: string;
  created_by: number;
  created_at: string;
  room: string | null;
  placement: string | null;
  /** auto: 자동 배치 그대로, edited: 고객이 직접 수정, empty: 빈 공간에서 시작. 편집 기능 이전 버전은 빈 값 */
  source: string;
  base_version_id: number | null;
  rooms: string | null;
  house: string | null;
}
export interface Version extends Omit<VersionRow, "input" | "result" | "room" | "placement" | "rooms" | "house"> {
  input: LayoutInput;
  result: LayoutResult;
  /** 사용자가 입력한 실제 구조. 편집 기능 이전 버전은 null */
  room: RoomModel | null;
  placement: Placement | null;
  /** 집 요청이면 집 정보. 사무실 버전은 null(그때 input이 배치 조건이다) */
  home: HomeInput | null;
  /** 집 요청의 방 한 칸 배치들. 방마다 따로 관리하는 참고 배치이며 집 전체 도면이 아니다. */
  rooms: HomeRoom[];
  /** 집 요청의 집 전체 평면(고객이 입력한 평면, 실측 도면 아님). 없거나 이 기능 이전 버전이면 null */
  house: HouseModel | null;
}

export interface FileRow {
  id: number;
  owner_id: number;
  project_id: number | null;
  kind: "photo" | "drawing" | "case";
  original_name: string;
  stored_name: string;
  mime: string;
  size: number;
  /** sketch: 손그림 평면 */
  category: string;
  deleted_at: string | null;
  created_at: string;
}

export interface Vendor {
  id: number;
  user_id: number;
  company: string;
  intro: string;
  regions: string;
  specialties: string;
  years: number;
  status: "pending" | "approved" | "suspended";
  /** 시공 분야. "office", "home"을 쉼표로 잇는다. */
  fields: string;
  created_at: string;
}

export interface VendorCase {
  id: number;
  vendor_id: number;
  title: string;
  summary: string;
  area_pyeong: number | null;
  duration: string;
  file_id: number | null;
  /** 실제 시공 사진이 아닌 3D 제안 예시 */
  is_example: number;
  /** natural · chic · lovely 또는 빈 값(기타) */
  style: string;
  /** 시공 지역. 비어 있으면 업체의 시공 가능 지역을 보여 준다. */
  region: string;
  spec: CaseSpec;
  photos: number[];
}

/** 사례의 공간 구성. 사례에서 요청을 시작할 때 조건을 미리 채우는 데 쓴다. */
export interface CaseSpec {
  staff?: number;
  rooms?: ("ceo" | "meeting" | "pantry" | "storage")[];
  meetingSeats?: number;
  /** 공간 종류(업종) */
  category?: string;
  /** 3D 제안 예시: 이미지를 만든 배치 목적과 출입구. 같은 조건으로 입체 배치도와 평면도를 다시 그린다. */
  layout?: "visitor" | "collab" | "focus";
  entrance?: "left" | "right";
  /** 공간 종류. 없으면 사무실 */
  kind?: SpaceKind;
  /** 집 예시: 주거 유형과 방 한 칸 배치(입력한 방 + 가구 편집 목록). 같은 데이터로 입체·평면도를 다시 그린다. */
  homeType?: HomeType;
  homeRoom?: { name: string; room: RoomModel; edits: RoomEdit[] };
}

export const CASE_CATEGORIES = ["스타트업·IT", "전문직 사무소", "디자인·브랜드", "교육·출판", "유통·물류"] as const;

/** 탐색 화면의 사례 카드 */
export interface CaseCard extends VendorCase {
  company: string;
  vendor_regions: string;
}

export const ROOM_LABEL = { ceo: "대표실", meeting: "회의실", pantry: "탕비실", storage: "창고" } as const;
export const caseRegion = (c: Pick<CaseCard, "region" | "vendor_regions">) => c.region || c.vendor_regions;

export interface Assignment {
  id: number;
  project_id: number;
  version_id: number;
  vendor_id: number;
  status: "invited" | "declined" | "quoted";
  /** 업체가 참여를 확정한 시각. 비어 있으면 아직 참여 여부를 정하지 않은 것 */
  accepted_at: string | null;
  /** 참여 여부 답변 기한 / 제안 제출 기한 */
  respond_by: string | null;
  quote_by: string | null;
  /** 운영자가 배정을 취소한 시각(무응답 등으로 재배정) */
  withdrawn_at: string | null;
  reminded_at: string | null;
  /** operator: 운영자 배정, self: 업체가 공개 요청에 직접 참여 */
  source: "operator" | "self";
  created_at: string;
}

interface QuoteRow {
  id: number;
  assignment_id: number;
  project_id: number;
  version_id: number;
  vendor_id: number;
  items: string;
  vat_included: number;
  duration_days: number;
  start_available: string;
  extra_conditions: string;
  furniture_included: number;
  note: string;
  submitted_at: string;
  updated_at: string;
  /** 이 제안이 기준으로 삼은 요청 내용 버전 */
  request_rev_id: number | null;
  /** 설계 제안: as_is(고객 배치대로) · proposal(수정 제안) · 빈 값(예전 제안) */
  design_mode: string;
  design_note: string;
  design_files: string;
}
export interface Quote extends Omit<QuoteRow, "items" | "design_files"> {
  items: QuoteItem[];
  design_files: number[];
}

export interface VisitRequest {
  id: number;
  project_id: number;
  quote_id: number;
  vendor_id: number;
  preferred: string;
  message: string;
  status: "requested" | "confirmed" | "done";
  created_at: string;
}

export interface ChangeRequest {
  id: number;
  project_id: number;
  version_id: number;
  user_id: number;
  body: string;
  status: "open" | "done";
  reply: string;
  created_at: string;
  resolved_at: string | null;
}

export interface ShareLink {
  id: number;
  project_id: number;
  token: string;
  expires_at: string;
  revoked: number;
  created_at: string;
}

const parseVersion = (row: VersionRow): Version => {
  const input = JSON.parse(row.input);
  return {
    ...row,
    input,
    result: JSON.parse(row.result),
    room: row.room ? JSON.parse(row.room) : null,
    placement: row.placement ? JSON.parse(row.placement) : null,
    home: isHomeInput(input) ? input : null,
    rooms: row.rooms ? JSON.parse(row.rooms) : [],
    house: row.house ? JSON.parse(row.house) : null,
  };
};
const parseQuote = (row: QuoteRow): Quote => ({ ...row, items: JSON.parse(row.items), design_files: JSON.parse(row.design_files || "[]") });

export const getProject = (id: number) => get<Project>(`SELECT * FROM projects WHERE id = ?`, id);

/** 고객 본인 또는 운영자만 프로젝트 전체를 볼 수 있다. */
export function getOwnedProject(id: number, user: User) {
  const project = getProject(id);
  if (!project) return undefined;
  if (user.role === "admin" || project.customer_id === user.id) return project;
  return undefined;
}

export const getVersions = (projectId: number) =>
  all<VersionRow>(`SELECT * FROM versions WHERE project_id = ? ORDER BY no DESC`, projectId).map(parseVersion);

export function getVersion(id: number | null | undefined) {
  if (!id) return undefined;
  const row = get<VersionRow>(`SELECT * FROM versions WHERE id = ?`, id);
  return row ? parseVersion(row) : undefined;
}

/** 지금 올라와 있는 파일. 지운 파일은 업체에 보낸 요청 내용에만 남는다. */
// 설계 제안 첨부와 도면 밑그림(따라 그리기용으로 바꾼 이미지, 원본은 도면 파일로 따로 남는다)은 자료 목록에서 뺀다.
export const getFiles = (projectId: number) => all<FileRow>(`SELECT * FROM files WHERE project_id = ? AND deleted_at IS NULL AND category NOT IN ('proposal', 'underlay') ORDER BY id`, projectId);
export const getFilesByIds = (ids: number[]) => (ids.length ? all<FileRow>(`SELECT * FROM files WHERE id IN (${ids.map(() => "?").join(",")}) ORDER BY id`, ...ids) : []);

/** 업체 시공 분야 */
export const vendorFields = (v: Pick<Vendor, "fields">) => (v.fields || "office").split(",").filter((f): f is SpaceKind => f === "office" || f === "home");

export const getVendorByUser = (userId: number) => get<Vendor>(`SELECT * FROM vendors WHERE user_id = ?`, userId);
export const getVendor = (id: number) => get<Vendor>(`SELECT * FROM vendors WHERE id = ?`, id);
type CaseRow = Omit<CaseCard, "photos" | "spec"> & { spec: string };
const parseSpec = (raw: string): CaseSpec => {
  try {
    return JSON.parse(raw || "{}") as CaseSpec;
  } catch {
    return {};
  }
};

function withPhotos(rows: CaseRow[]): CaseCard[] {
  if (!rows.length) return [];
  const photos = all<{ case_id: number; file_id: number }>(`SELECT case_id, file_id FROM case_files WHERE case_id IN (${rows.map(() => "?").join(",")}) ORDER BY position, file_id`, ...rows.map((c) => c.id));
  return rows.map((c) => ({ ...c, spec: parseSpec(c.spec), photos: photos.filter((p) => p.case_id === c.id).map((p) => p.file_id) }));
}

const CASE_SELECT = `SELECT c.*, v.company, v.regions AS vendor_regions FROM vendor_cases c JOIN vendors v ON v.id = c.vendor_id`;

/** 시공 사례와 사진(대표 사진이 맨 앞). */
export const getVendorCases = (vendorId: number): CaseCard[] => withPhotos(all<CaseRow>(`${CASE_SELECT} WHERE c.vendor_id = ? ORDER BY c.id DESC`, vendorId));

/** 승인된 업체의 사례 전체. 탐색 화면에서 쓴다. */
export const getCases = (): CaseCard[] => withPhotos(all<CaseRow>(`${CASE_SELECT} WHERE v.status = 'approved' ORDER BY c.id DESC`));

/** 공개된(승인된 업체의) 사례 하나 */
export function getCase(id: number): CaseCard | undefined {
  if (!Number.isInteger(id)) return undefined;
  return withPhotos(all<CaseRow>(`${CASE_SELECT} WHERE c.id = ? AND v.status = 'approved'`, id))[0];
}

export const getSavedCaseIds = (userId: number) => all<{ case_id: number }>(`SELECT case_id FROM saved_cases WHERE user_id = ?`, userId).map((r) => r.case_id);

/** 고객이 저장한 사례. 최근에 저장한 것부터. */
export const getSavedCases = (userId: number): CaseCard[] =>
  withPhotos(all<CaseRow>(`${CASE_SELECT} JOIN saved_cases s ON s.case_id = c.id WHERE s.user_id = ? AND v.status = 'approved' ORDER BY s.created_at DESC, c.id DESC`, userId));

/** 요청서에 연결한 참고 사례 */
export interface ProjectRef {
  id: number;
  project_id: number;
  case_id: number;
  /** 고객이 특히 마음에 든다고 고른 사진 */
  file_id: number | null;
  note: string;
  created_at: string;
  c: CaseCard;
}

export function getProjectRefs(projectId: number): ProjectRef[] {
  const refs = all<Omit<ProjectRef, "c">>(`SELECT * FROM project_refs WHERE project_id = ? ORDER BY id`, projectId);
  if (!refs.length) return [];
  const cases = withPhotos(all<CaseRow>(`${CASE_SELECT} WHERE c.id IN (${refs.map(() => "?").join(",")})`, ...refs.map((x) => x.case_id)));
  return refs.flatMap((x) => {
    const c = cases.find((k) => k.id === x.case_id);
    return c ? [{ ...x, c }] : [];
  });
}

/** 업체 목록 카드: 사례 수와 대표 사진들 */
export function getVendorCards() {
  const vendors = all<Vendor>(`SELECT * FROM vendors WHERE status = 'approved' ORDER BY id`);
  const cases = getCases();
  return vendors.map((v) => {
    const mine = cases.filter((c) => c.vendor_id === v.id);
    return { ...v, cases: mine.length, photos: mine.flatMap((c) => c.photos.slice(0, 2).map((id) => ({ id, example: !!c.is_example }))).slice(0, 4), styles: [...new Set(mine.map((c) => c.style).filter(Boolean))] };
  });
}
export type VendorCard = ReturnType<typeof getVendorCards>[number];

/** 제안 카드에 함께 보여 줄 시공사 정보(사례 사진 포함). */
export function getProposalVendor(vendorId: number) {
  const vendor = getVendor(vendorId)!;
  const cases = getVendorCases(vendorId);
  return {
    id: vendor.id,
    company: vendor.company,
    years: vendor.years,
    caseCount: cases.length,
    photos: cases.flatMap((c) => c.photos.slice(0, 1).map((id) => ({ id, example: !!c.is_example }))).slice(0, 3),
  };
}

export const getFavoriteVendorIds = (userId: number) =>
  all<{ vendor_id: number }>(`SELECT vendor_id FROM favorites WHERE user_id = ?`, userId).map((r) => r.vendor_id);

export const getAssignments = (projectId: number, versionId?: number | null) =>
  versionId
    ? all<Assignment>(`SELECT * FROM assignments WHERE project_id = ? AND version_id = ? ORDER BY id`, projectId, versionId)
    : all<Assignment>(`SELECT * FROM assignments WHERE project_id = ? ORDER BY id`, projectId);

export const getQuotes = (projectId: number) =>
  all<QuoteRow>(`SELECT * FROM quotes WHERE project_id = ? ORDER BY id`, projectId).map(parseQuote);

export function getQuoteByAssignment(assignmentId: number) {
  const row = get<QuoteRow>(`SELECT * FROM quotes WHERE assignment_id = ?`, assignmentId);
  return row ? parseQuote(row) : undefined;
}

export interface QuoteRevision {
  id: number;
  quote_id: number;
  no: number;
  snapshot: QuoteSnapshot;
  created_at: string;
}

/** 제출 이력. 오래된 것부터. */
export const getQuoteRevisions = (quoteId: number): QuoteRevision[] =>
  all<Omit<QuoteRevision, "snapshot"> & { snapshot: string }>(`SELECT id, quote_id, no, snapshot, created_at FROM quote_revisions WHERE quote_id = ? ORDER BY no`, quoteId).map((r) => ({
    ...r,
    snapshot: JSON.parse(r.snapshot),
  }));

/** 화면에 보여 줄 이력: 제출본마다 금액과 바로 앞 제출본에서 달라진 점 */
export function getRevisionHistory(quoteId: number) {
  const revisions = getQuoteRevisions(quoteId);
  return revisions.map((r, i) => ({
    no: r.no,
    created_at: r.created_at,
    amount: snapshotAmount(r.snapshot),
    changes: i === 0 ? [] : diffSnapshots(revisions[i - 1].snapshot, r.snapshot),
  }));
}
export type RevisionHistory = ReturnType<typeof getRevisionHistory>;

export function getQuoteDraft(assignmentId: number) {
  const row = get<{ data: string; updated_at: string }>(`SELECT data, updated_at FROM quote_drafts WHERE assignment_id = ?`, assignmentId);
  return row ? { data: JSON.parse(row.data) as QuoteDraft, updated_at: row.updated_at } : undefined;
}

export interface Notification {
  id: number;
  user_id: number;
  project_id: number | null;
  title: string;
  body: string;
  href: string;
  read_at: string | null;
  created_at: string;
}
export const getNotifications = (userId: number, limit = 60) =>
  all<Notification>(`SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?`, userId, limit);
export const countUnread = (userId: number) => get<{ n: number }>(`SELECT count(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL`, userId)!.n;

export const getVisits = (projectId: number) =>
  all<VisitRequest>(`SELECT * FROM visit_requests WHERE project_id = ? ORDER BY id`, projectId);

export const getChangeRequests = (projectId: number) =>
  all<ChangeRequest>(`SELECT * FROM change_requests WHERE project_id = ? ORDER BY id DESC`, projectId);

export const getShareLinks = (projectId: number) =>
  all<ShareLink>(`SELECT * FROM share_links WHERE project_id = ? ORDER BY id DESC`, projectId);

export const getEvents = (projectId: number) =>
  all<{ id: number; body: string; created_at: string; actor: string | null }>(
    `SELECT e.id, e.body, e.created_at, u.name AS actor FROM events e LEFT JOIN users u ON u.id = e.actor_id
     WHERE e.project_id = ? ORDER BY e.id DESC`,
    projectId,
  );

export function getCustomerContact(project: Project) {
  return get<{ name: string; phone: string; email: string }>(`SELECT name, phone, email FROM users WHERE id = ?`, project.customer_id);
}

/** 파일 열람 권한: 소유자·운영자·해당 프로젝트에 배정된 업체. 시공 사례 이미지는 공개. */
export function canReadFile(file: FileRow, user: User | null) {
  if (file.kind === "case") return true;
  if (!user) return false;
  if (user.role === "admin" || file.owner_id === user.id) return true;
  // 업체 설계 제안 첨부는 낸 업체와 그 프로젝트의 고객만 본다. 다른 업체는 볼 수 없다.
  if (file.category === "proposal") return user.role === "customer" && !!file.project_id && getProject(file.project_id)?.customer_id === user.id;
  if (user.role === "vendor" && file.project_id) {
    const vendor = getVendorByUser(user.id);
    if (!vendor) return false;
    return !!get(
      `SELECT 1 AS ok FROM assignments WHERE project_id = ? AND vendor_id = ? AND status != 'declined' AND withdrawn_at IS NULL`,
      file.project_id,
      vendor.id,
    );
  }
  return false;
}

export interface InfoRequest {
  id: number;
  project_id: number;
  items: string[];
  message: string;
  status: "open" | "answered" | "closed";
  reply: string;
  created_at: string;
  answered_at: string | null;
}
export const getInfoRequests = (projectId: number): InfoRequest[] =>
  all<Omit<InfoRequest, "items"> & { items: string }>(`SELECT * FROM info_requests WHERE project_id = ? ORDER BY id DESC`, projectId).map((r) => ({ ...r, items: JSON.parse(r.items) }));
