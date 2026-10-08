"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSession, currentUser, destroySession, homeFor, requireUser, type User } from "./auth";
import { FURNITURE_KEYS, HOME_INFO_ITEMS, INFO_ITEMS, ITEM_STATUS, quoteCategories, type ItemStatus, type QuoteItem } from "./constants";
import { HOME_RESULT, HOME_TYPES, homeTitle, parseHomeInput, validateHome, type HomeInput } from "./home";
import { MAX_ROOMS, homeRoomErrors, nextRoomId, parseHomeRoom, rebuildRoomItems, type HomeRoom, type RoomEdit } from "./space/home-room";
import { houseErrors, houseKey, parseHouseCreate, parseHouseEdit, rebuildHouseItems, type HouseEdit, type HouseModel } from "./space/house";
import { getCase, getOwnedProject, getProject, getVendorByUser, getVersion, type CaseSpec, type FileRow, type Project } from "./data";
import { UPLOAD_DIR, all, get, run, transaction } from "./db";
import { catalogItems, generateLayout } from "./layout/generate";
import type { LayoutInput } from "./layout/types";
import { diffPlacement, normalizeItems, placementFromOption, rebuildPlacement } from "./space/placement";
import { normalizeOutline } from "./space/geometry";
import { roomToInput, validateRoom } from "./space/room";
import type { PlacedItem, Placement, PlacementEdit, RoomModel, Underlay } from "./space/types";
import { hashPassword, verifyPassword } from "./password";
import { STYLES } from "./styles";
import { recommendStyle } from "./brief";
import { adminIds, notify, vendorUserId } from "./notify";
import { diffSnapshots, type QuoteDraft, type QuoteSnapshot } from "./quotes";
import { fileInRevisions, latestRevision, pendingChanges, recordRevision } from "./request-snapshot";
import { queueEmail, retryEmails } from "./mailer";
import { createHash } from "node:crypto";
import { BID_CAP_MAX, BID_CAP_MIN, joinBlocker } from "./bidding";
import { attachPostReference } from "./post-refs";
import { templatesForEdits } from "./shop-place";

/** 업체 응답 기한: 참여 여부는 배정 후 RESPOND_HOURS시간, 제안은 참여 확정 후 QUOTE_DAYS일 */
const RESPOND_HOURS = Number(process.env.RESPOND_HOURS) || 48;
const QUOTE_DAYS = Number(process.env.QUOTE_DAYS) || 7;

export interface FormState {
  error?: string;
  ok?: string;
}

// ── 공통 헬퍼
const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const num = (fd: FormData, key: string) => {
  const raw = str(fd, key).replaceAll(",", "");
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};
const checked = (fd: FormData, key: string) => fd.get(key) === "on" || fd.get(key) === "1";
const refresh = () => revalidatePath("/", "layout");
const log = (projectId: number, actorId: number | null, body: string) =>
  run(`INSERT INTO events (project_id, actor_id, body) VALUES (?, ?, ?)`, projectId, actorId, body);
const touch = (projectId: number, status?: string) =>
  status
    ? run(`UPDATE projects SET status = ?, updated_at = datetime('now') WHERE id = ?`, status, projectId)
    : run(`UPDATE projects SET updated_at = datetime('now') WHERE id = ?`, projectId);

/** 요청 화면의 참여 방식(운영자 배정만 / 업체 직접 참여도 받기)과 참여 상한을 저장한다. 칸이 없는 화면에서는 그대로 둔다. */
function applyBidMode(projectId: number, fd: FormData | undefined) {
  if (!fd?.has("bidMode")) return;
  const mode = str(fd, "bidMode") === "open" ? "open" : "operator";
  const cap = Math.round(num(fd, "bidCap") ?? 5);
  run(`UPDATE projects SET bid_mode = ?, bid_cap = ? WHERE id = ?`, mode, Math.min(BID_CAP_MAX, Math.max(BID_CAP_MIN, cap)), projectId);
}

async function ownedProject(projectId: number): Promise<{ user: User; project: Project }> {
  const user = await requireUser("customer", "admin");
  const project = getOwnedProject(projectId, user);
  if (!project) redirect(homeFor(user));
  return { user, project };
}

async function vendorSession() {
  const user = await requireUser("vendor");
  const vendor = getVendorByUser(user.id);
  if (!vendor) redirect("/partner");
  return { user, vendor };
}

// ── 파일
const ALLOWED: Record<string, string[]> = {
  photo: [".jpg", ".jpeg", ".png", ".webp", ".heic", ".gif"],
  drawing: [".jpg", ".jpeg", ".png", ".webp", ".pdf", ".dwg", ".dxf"],
  case: [".jpg", ".jpeg", ".png", ".webp"],
};
const MAX_FILE = 10 * 1024 * 1024;
// 브라우저가 보낸 MIME은 믿지 않고 확장자로 정한다.
const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".pdf": "application/pdf",
};

/** 저장하기 전에 형식과 크기만 확인한다. 프로젝트를 만든 뒤 파일이 거절되는 일을 막는다. */
function checkFiles(fd: FormData, field: string, kind: FileRow["kind"]) {
  for (const entry of fd.getAll(field)) {
    if (!(entry instanceof File) || entry.size === 0) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!ALLOWED[kind].includes(ext)) return `${entry.name}: 지원하지 않는 파일 형식입니다 (${ALLOWED[kind].join(", ")}).`;
    if (entry.size > MAX_FILE) return `${entry.name}: 파일 하나는 10MB 이하여야 합니다.`;
  }
  return null;
}

async function saveFiles(fd: FormData, field: string, kind: FileRow["kind"], ownerId: number, projectId: number | null, category = "") {
  const ids: number[] = [];
  for (const entry of fd.getAll(field)) {
    if (!(entry instanceof File) || entry.size === 0) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!ALLOWED[kind].includes(ext)) throw new Error(`${entry.name}: 지원하지 않는 파일 형식입니다 (${ALLOWED[kind].join(", ")}).`);
    if (entry.size > MAX_FILE) throw new Error(`${entry.name}: 파일 하나는 10MB 이하여야 합니다.`);
    const stored = randomBytes(16).toString("hex") + ext;
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, stored), Buffer.from(await entry.arrayBuffer()));
    ids.push(
      run(
        `INSERT INTO files (owner_id, project_id, kind, original_name, stored_name, mime, size, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ownerId,
        projectId,
        kind,
        entry.name,
        stored,
        MIME[ext] ?? "application/octet-stream",
        entry.size,
        category,
      ),
    );
  }
  return ids;
}

/** 로그인 뒤 돌아갈 내부 경로. 외부 주소로 보내지 않도록 확인한다. */
function safeNext(fd: FormData) {
  const next = str(fd, "next");
  return next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : null;
}

// ── 회원
export async function signup(_: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  const name = str(fd, "name");
  const phone = str(fd, "phone");
  const role = str(fd, "role") === "vendor" ? "vendor" : "customer";
  const company = str(fd, "company");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "이메일 형식을 확인해 주세요." };
  if (password.length < 8) return { error: "비밀번호는 8자 이상이어야 합니다." };
  if (!name) return { error: "이름을 입력해 주세요." };
  if (role === "vendor" && !company) return { error: "업체명을 입력해 주세요." };
  // 파트너 역할: 시공(build)·판매(sell). 예전 입점 양식처럼 고르지 않고 보내면 시공으로 본다.
  const roles = fd.getAll("roles").map(String);
  const build = role === "vendor" && (roles.includes("build") || !fd.has("roles"));
  const sell = role === "vendor" && roles.includes("sell");
  if (role === "vendor" && fd.has("roles") && !build && !sell) return { error: "시공과 판매 중 하나 이상 골라 주세요." };
  if (!checked(fd, "consent")) return { error: "개인정보 수집·이용에 동의해 주세요." };
  if (get(`SELECT 1 AS ok FROM users WHERE email = ?`, email)) return { error: "이미 가입된 이메일입니다." };
  const userId = transaction(() => {
    const id = run(`INSERT INTO users (email, password_hash, name, phone, role) VALUES (?, ?, ?, ?, ?)`, email, hashPassword(password), name, phone, role);
    if (build) run(`INSERT INTO vendors (user_id, company) VALUES (?, ?)`, id, company);
    if (sell) run(`INSERT INTO sellers (user_id, name, cs_phone, cs_email) VALUES (?, ?, ?, ?)`, id, company, phone, email);
    return id;
  });
  if (build) notify(adminIds(), { title: `시공 파트너 입점 신청: ${company}`, body: "업체 정보를 확인하고 승인해 주세요.", href: "/admin/vendors", email: true });
  if (sell) notify(adminIds(), { title: `판매자 입점 신청: ${company}`, body: "판매자 정보가 채워지면 서류를 확인하고 승인해 주세요.", href: "/admin/sellers", email: true });
  await createSession(userId);
  redirect(role === "vendor" ? (build ? "/vendor" : "/partner") : (safeNext(fd) ?? "/projects"));
}

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email").toLowerCase();
  const user = get<User & { password_hash: string }>(`SELECT * FROM users WHERE email = ?`, email);
  if (!user || !verifyPassword(str(fd, "password"), user.password_hash)) return { error: "이메일 또는 비밀번호가 맞지 않습니다." };
  await createSession(user.id);
  redirect((user.role === "customer" && safeNext(fd)) || homeFor(user));
}

export async function logout() {
  await destroySession();
  redirect("/");
}

// ── 프로젝트
function parseInput(fd: FormData): LayoutInput {
  const entrance = str(fd, "entrance");
  const mood = str(fd, "mood");
  const windowWall = str(fd, "windowWall");
  const priority = str(fd, "priority");
  const intake = str(fd, "intake");
  const mode = intake === "drawing" || intake === "dims" || intake === "photos" || intake === "none" ? intake : undefined;
  // 치수를 모르는 방식에서는 가로·세로를 저장하지 않는다(사진만으로 치수를 아는 것처럼 만들지 않는다).
  const known = !mode || mode === "drawing" || mode === "dims";
  return {
    ...(mode ? { intake: mode } : {}),
    areaPyeong: num(fd, "areaPyeong") ?? 0,
    widthM: known ? num(fd, "widthM") : null,
    depthM: known ? num(fd, "depthM") : null,
    staff: Math.round(num(fd, "staff") ?? 0),
    ceo: checked(fd, "ceo"),
    meeting: checked(fd, "meeting"),
    meetingSeats: Math.round(num(fd, "meetingSeats") ?? 6),
    pantry: checked(fd, "pantry"),
    storage: checked(fd, "storage"),
    entrance: entrance === "left" || entrance === "other" ? entrance : "right",
    shape: str(fd, "shape") === "other" ? "other" : "rect",
    pillars: Math.max(0, Math.round(num(fd, "pillars") ?? 0)),
    furnitureIncluded: checked(fd, "furnitureIncluded"),
    windowWall: windowWall === "rear" || windowWall === "other" ? windowWall : "unknown",
    priority: priority === "visitor" || priority === "collab" || priority === "focus" ? priority : "unknown",
    siteNotes: str(fd, "siteNotes"),
    reuseFurniture: str(fd, "reuseFurniture"),
    mood: mood === "warm" || mood === "pro" || mood === "soft" ? mood : "unknown",
  };
}

function parseProjectFields(fd: FormData) {
  return {
    title: str(fd, "title"),
    region: str(fd, "region"),
    address: str(fd, "address"),
    budget_min: num(fd, "budgetMin"),
    budget_max: num(fd, "budgetMax"),
    desired_start: str(fd, "desiredStart"),
    desired_movein: str(fd, "desiredMovein"),
    notes: str(fd, "notes"),
    work_scope: str(fd, "workScope").slice(0, 1000),
  };
}

function validateProject(p: ReturnType<typeof parseProjectFields>, input: LayoutInput): string | null {
  if (!p.title) return "프로젝트 이름을 입력해 주세요.";
  if (!p.region) return "지역을 입력해 주세요.";
  if (!(input.areaPyeong > 0)) return "전용면적(평)을 입력해 주세요.";
  if (input.areaPyeong > 1000) return "전용면적을 확인해 주세요.";
  if (!(input.staff >= 1)) return "직원 수를 1명 이상 입력해 주세요.";
  if ((input.widthM == null) !== (input.depthM == null)) return "가로·세로 치수는 둘 다 입력하거나 둘 다 비워 주세요.";
  if (input.widthM != null && (input.widthM < 2 || input.widthM > 100 || input.depthM! < 2 || input.depthM! > 100))
    return "가로·세로 치수는 미터 단위로 입력해 주세요 (예: 11, 9).";
  if (p.budget_min != null && p.budget_max != null && p.budget_min > p.budget_max) return "예산 최소값이 최대값보다 큽니다.";
  if (input.intake === "dims" && input.widthM == null) return "실내 가로·세로를 입력해 주세요.";
  if (input.intake === "photos" && !p.work_scope) return "사진으로 상담하려면 원하는 공사 내용을 적어 주세요.";
  return null;
}

function insertVersion(projectId: number, userId: number, input: LayoutInput, note = "", preferredOption = "") {
  const result = generateLayout(input);
  // 체험에서 고른 배치가 이 조건에서도 나오면 그대로, 아니면 우선순위에 맞는 배치를 선택해 둔다.
  const option = result.options.some((o) => o.id === preferredOption) ? preferredOption : (result.recommended ?? result.options[0]?.id ?? "");
  const { n } = get<{ n: number }>(`SELECT coalesce(max(no), 0) AS n FROM versions WHERE project_id = ?`, projectId)!;
  const versionId = run(
    `INSERT INTO versions (project_id, no, input, result, layout_status, selected_option, selected_style, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    projectId,
    n + 1,
    JSON.stringify(input),
    JSON.stringify(result),
    result.status,
    option,
    recommendStyle(input).id,
    note,
    userId,
  );
  run(`UPDATE projects SET current_version_id = ?, updated_at = datetime('now') WHERE id = ?`, versionId, projectId);
  return { versionId, no: n + 1, result };
}

export async function createProject(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser("customer");
  const fields = parseProjectFields(fd);
  const input = parseInput(fd);
  const error = validateProject(fields, input);
  if (error) return { error };
  const has = (key: string) => fd.getAll(key).some((f) => f instanceof File && f.size > 0);
  if (input.intake === "drawing" && !has("drawings")) return { error: "도면 파일을 올려 주세요. 지금 없으면 다른 자료 방식을 고르세요." };
  if (input.intake === "photos" && !has("photos")) return { error: "현장 사진을 한 장 이상 올려 주세요." };
  const fileError = checkFiles(fd, "photos", "photo") ?? checkFiles(fd, "drawings", "drawing") ?? checkFiles(fd, "sketches", "drawing");
  if (fileError) return { error: fileError };
  const projectId = transaction(() => {
    const id = run(
      `INSERT INTO projects (customer_id, title, region, address, budget_min, budget_max, desired_start, desired_movein, notes, work_scope)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      user.id,
      fields.title,
      fields.region,
      fields.address,
      fields.budget_min,
      fields.budget_max,
      fields.desired_start,
      fields.desired_movein,
      fields.notes,
      fields.work_scope,
    );
    const { result } = insertVersion(id, user.id, input, "", str(fd, "preferredOption"));
    log(id, user.id, result.status === "ok" ? "프로젝트를 만들고 배치안을 생성했습니다." : "프로젝트를 만들었습니다. 자동 배치가 어려워 검토가 필요합니다.");
    // 사례에서 시작했거나 저장한 사례 가운데 고른 것을 요청서에 연결한다.
    const refIds = [...new Set(fd.getAll("refCase").map(Number))].filter((n) => Number.isInteger(n) && getCase(n)).slice(0, 8);
    for (const caseId of refIds) insertRef(id, caseId, Number(fd.get("refPhoto")) || null, str(fd, `refNote_${caseId}`));
    if (refIds.length) log(id, user.id, `참고 사례 ${refIds.length}건을 요청서에 연결했습니다.`);
    attachPostReference(id,fd);
    return id;
  });
  try {
    await saveFiles(fd, "photos", "photo", user.id, projectId);
    await saveFiles(fd, "drawings", "drawing", user.id, projectId);
    await saveFiles(fd, "sketches", "drawing", user.id, projectId, "sketch");
  } catch (e) {
    // 프로젝트는 만들어졌으므로 파일 오류는 상세 화면에서 다시 올리게 한다.
    log(projectId, user.id, `파일 업로드 실패: ${(e as Error).message}`);
  }
  refresh();
  redirect(`/projects/${projectId}`);
}

// ── 집(주거) 요청
/**
 * 집 요청 버전. 집 정보와 방 한 칸 배치들, 집 전체 평면을 함께 남긴다. 한번 저장한 버전은 고치지 않는다.
 * house를 주지 않으면(undefined) 바로 전 버전(base)의 집 전체 평면을 그대로 이어 간다. 집 정보·방 배치를 저장해도 평면을 잃지 않는다.
 */
function insertHomeVersion(projectId: number, userId: number, home: HomeInput, rooms: HomeRoom[], base: number | null, note: string, house?: HouseModel | null) {
  const keep = house === undefined ? (base ? (getVersion(base)?.house ?? null) : null) : house;
  const { n } = get<{ n: number }>(`SELECT coalesce(max(no), 0) AS n FROM versions WHERE project_id = ?`, projectId)!;
  const id = run(
    `INSERT INTO versions (project_id, no, input, result, layout_status, selected_option, selected_style, note, created_by, rooms, source, base_version_id, house)
     VALUES (?, ?, ?, ?, 'home', '', 'natural', ?, ?, ?, '', ?, ?)`,
    projectId,
    n + 1,
    JSON.stringify(home),
    JSON.stringify(HOME_RESULT),
    note,
    userId,
    JSON.stringify(rooms),
    base,
    keep ? JSON.stringify(keep) : null,
  );
  run(`UPDATE projects SET current_version_id = ?, updated_at = datetime('now') WHERE id = ?`, id, projectId);
  return { id, no: n + 1 };
}

function budgetError(p: ReturnType<typeof parseProjectFields>) {
  return p.budget_min != null && p.budget_max != null && p.budget_min > p.budget_max ? "예산 최소값이 최대값보다 큽니다." : null;
}

/** 집 상담 신청. 필수는 주거 유형·지역·공사 범위뿐이라 도면·치수·사진이 없어도 신청할 수 있다. */
export async function createHome(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser("customer");
  const fields = parseProjectFields(fd);
  const home = parseHomeInput(fd);
  const error = validateHome(home, fields.region) ?? budgetError(fields);
  if (error) return { error };
  const fileError = checkFiles(fd, "photos", "photo") ?? checkFiles(fd, "drawings", "drawing");
  if (fileError) return { error: fileError };
  const projectId = transaction(() => {
    const id = run(
      `INSERT INTO projects (customer_id, title, region, address, budget_min, budget_max, desired_start, desired_movein, notes, work_scope, kind)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'home')`,
      user.id,
      (fields.title || homeTitle(home, fields.region)).slice(0, 60),
      fields.region.slice(0, 60),
      fields.address,
      fields.budget_min,
      fields.budget_max,
      fields.desired_start,
      fields.desired_movein,
      fields.notes,
      fields.work_scope,
    );
    insertHomeVersion(id, user.id, home, [], null, "");
    applyBidMode(id, fd);
    log(id, user.id, `집 상담 요청서를 만들었습니다 (${HOME_TYPES[home.homeType]}).`);
    const refIds = [...new Set(fd.getAll("refCase").map(Number))].filter((n) => Number.isInteger(n) && getCase(n)).slice(0, 8);
    for (const caseId of refIds) insertRef(id, caseId, null, "");
    attachPostReference(id,fd);
    return id;
  });
  try {
    await saveFiles(fd, "photos", "photo", user.id, projectId);
    await saveFiles(fd, "drawings", "drawing", user.id, projectId);
  } catch (e) {
    log(projectId, user.id, `파일 업로드 실패: ${(e as Error).message}`);
  }
  if (str(fd, "intent") === "send") await requestQuotes(projectId);
  refresh();
  redirect(`/projects/${projectId}`);
}

/** 집 요청 내용 고치기. 집 정보가 바뀌면 새 버전을 만들고(방 배치는 그대로 이어 간다), 요청을 보낸 뒤라면 ‘변경 내용 보내기’로 업체에 전한다. */
export async function saveHomeRequest(projectId: number, _: FormState, fd: FormData): Promise<FormState> {
  const { user, project } = await ownedProject(projectId);
  if (project.kind !== "home") return { error: "집 요청이 아닙니다." };
  if (["contracted", "closed"].includes(project.status)) return { error: "종료된 프로젝트입니다." };
  const current = getVersion(project.current_version_id);
  if (!current?.home) return { error: "요청 내용을 찾을 수 없습니다." };
  const fields = parseProjectFields(fd);
  const home = parseHomeInput(fd);
  const error = validateHome(home, fields.region) ?? budgetError(fields);
  if (error) return { error };
  const fileError = checkFiles(fd, "photos", "photo") ?? checkFiles(fd, "drawings", "drawing");
  if (fileError) return { error: fileError };
  transaction(() => {
    run(
      `UPDATE projects SET title = ?, region = ?, address = ?, budget_min = ?, budget_max = ?, desired_start = ?, desired_movein = ?, notes = ?, work_scope = ?, updated_at = datetime('now') WHERE id = ?`,
      (fields.title || project.title).slice(0, 60),
      fields.region.slice(0, 60),
      fields.address,
      fields.budget_min,
      fields.budget_max,
      fields.desired_start,
      fields.desired_movein,
      fields.notes,
      fields.work_scope,
      projectId,
    );
    if (JSON.stringify(home) !== JSON.stringify(current.home)) insertHomeVersion(projectId, user.id, home, current.rooms, current.id, "집 정보 수정");
    const picked = new Set(fd.getAll("refCase").map(Number).filter((n) => Number.isInteger(n) && getCase(n)));
    if (fd.get("refsShown")) {
      for (const r of all<{ id: number; case_id: number }>(`SELECT id, case_id FROM project_refs WHERE project_id = ?`, projectId)) if (!picked.has(r.case_id)) run(`DELETE FROM project_refs WHERE id = ?`, r.id);
      for (const caseId of [...picked].slice(0, 8)) insertRef(projectId, caseId, null, "");
    }
  });
  try {
    await saveFiles(fd, "photos", "photo", user.id, projectId);
    await saveFiles(fd, "drawings", "drawing", user.id, projectId);
  } catch (e) {
    return { error: (e as Error).message };
  }
  applyBidMode(projectId, fd);
  if (!project.requested_version_id && str(fd, "intent") === "send") {
    await requestQuotes(projectId);
    redirect(`/projects/${projectId}`);
  }
  log(projectId, user.id, "요청 내용을 고쳤습니다.");
  refresh();
  redirect(`/projects/${projectId}`);
}

// ── 집 요청의 방 한 칸 배치. 방마다 따로 관리하는 참고 배치이며, 바꿀 때마다 요청 내용의 새 버전을 만든다.
// 요청을 보낸 뒤 방을 추가·삭제·수정해도 고객이 ‘변경 내용 보내기’를 눌러야 업체 기준(요청 기록)에 반영된다.
async function homeForRooms(projectId: number) {
  const { user, project } = await ownedProject(projectId);
  if (project.kind !== "home") return { error: "집 요청이 아닙니다." } as const;
  if (["contracted", "closed"].includes(project.status)) return { error: "종료된 요청이라 고칠 수 없습니다." } as const;
  const current = getVersion(project.current_version_id);
  if (!current?.home) return { error: "요청 내용을 찾을 수 없습니다." } as const;
  return { user, project, current };
}

const roomName = (fd: FormData) => str(fd, "name").slice(0, 20);
const now = () => new Date().toISOString().slice(0, 19).replace("T", " ");

export async function createRoom(projectId: number, _: FormState, fd: FormData): Promise<FormState> {
  const ctx = await homeForRooms(projectId);
  if ("error" in ctx) return { error: ctx.error };
  const { user, current } = ctx;
  if (current.rooms.length >= MAX_ROOMS) return { error: `방 배치는 요청 하나에 ${MAX_ROOMS}개까지 만들 수 있어요.` };
  const name = roomName(fd);
  if (!name) return { error: "방 이름을 넣어 주세요. 예: 침실" };
  const room = parseHomeRoom(str(fd, "room"));
  if (!room) return { error: "방 정보를 읽지 못했습니다. 다시 입력해 주세요." };
  const errs = homeRoomErrors(room);
  if (errs.length) return { error: errs[0] };
  // 지운 방의 id를 다시 쓰지 않도록 이 요청의 모든 버전에서 쓴 id를 본다.
  const used = all<{ rooms: string | null }>(`SELECT rooms FROM versions WHERE project_id = ?`, projectId).flatMap((v) => (v.rooms ? (JSON.parse(v.rooms) as HomeRoom[]).map((x) => x.id) : []));
  const id = nextRoomId(used);
  transaction(() => {
    insertHomeVersion(projectId, user.id, current.home!, [...current.rooms, { id, name, rev: 1, room, items: [], saved_at: now() }], current.id, `방 추가: ${name}`);
    log(projectId, user.id, `방 배치를 추가했습니다: ${name} (방 한 칸 참고 배치).`);
  });
  refresh();
  redirect(`/projects/${projectId}/rooms/${id}`);
}

/** 방 이름·치수·문·창·고정 구조물을 고친다. 놓인 가구는 그대로 두고, 방 밖으로 나가면 검사에서 알린다. */
export async function updateRoom(projectId: number, roomId: string, _: FormState, fd: FormData): Promise<FormState> {
  const ctx = await homeForRooms(projectId);
  if ("error" in ctx) return { error: ctx.error };
  const { user, current } = ctx;
  const target = current.rooms.find((x) => x.id === roomId);
  if (!target) return { error: "방을 찾을 수 없습니다." };
  const name = roomName(fd);
  if (!name) return { error: "방 이름을 넣어 주세요." };
  const room = parseHomeRoom(str(fd, "room"));
  if (!room) return { error: "방 정보를 읽지 못했습니다. 다시 입력해 주세요." };
  const errs = homeRoomErrors(room);
  if (errs.length) return { error: errs[0] };
  const shapeChanged = JSON.stringify(room) !== JSON.stringify(target.room);
  if (!shapeChanged && name === target.name) redirect(`/projects/${projectId}/rooms/${roomId}`);
  const next = { ...target, name, room, rev: shapeChanged ? target.rev + 1 : target.rev, saved_at: now() };
  transaction(() => {
    insertHomeVersion(projectId, user.id, current.home!, current.rooms.map((x) => (x.id === roomId ? next : x)), current.id, shapeChanged ? `방 정보 수정: ${name}` : `방 이름: ${target.name} → ${name}`);
    log(projectId, user.id, shapeChanged ? `방 정보를 고쳤습니다: ${name} (배치 ${next.rev}).` : `방 이름을 바꿨습니다: ${target.name} → ${name}.`);
  });
  refresh();
  redirect(`/projects/${projectId}/rooms/${roomId}`);
}

/** 방 한 칸의 가구 배치 저장. 크기를 바꾼 가구는 바꾼 크기 그대로 저장되고 다시 열어도 같다. */
export async function saveRoomLayout(projectId: number, roomId: string, payload: { edits: RoomEdit[] }): Promise<FormState & { rev?: number }> {
  const ctx = await homeForRooms(projectId);
  if ("error" in ctx) return { error: ctx.error };
  const { user, current } = ctx;
  const target = current.rooms.find((x) => x.id === roomId);
  if (!target) return { error: "방을 찾을 수 없습니다. 다른 화면에서 지웠는지 확인해 주세요." };
  const rebuilt = rebuildRoomItems(payload?.edits, target.room, templatesForEdits(Array.isArray(payload?.edits) ? payload.edits : []), target.items);
  if ("error" in rebuilt) return { error: rebuilt.error };
  const key = (items: PlacedItem[]) => JSON.stringify(items.map((it) => [it.id, it.type, it.label, it.x, it.y, it.rot, it.w, it.d]));
  if (key(rebuilt.items) === key(target.items)) return { ok: "저장한 배치와 달라진 점이 없어 그대로 두었어요.", rev: target.rev };
  const next = { ...target, items: rebuilt.items, rev: target.rev + 1, saved_at: now() };
  transaction(() => {
    insertHomeVersion(projectId, user.id, current.home!, current.rooms.map((x) => (x.id === roomId ? next : x)), current.id, `방 배치 저장: ${target.name}`);
    log(projectId, user.id, `${target.name} 가구 배치를 저장했습니다 (배치 ${next.rev}).`);
  });
  refresh();
  return { ok: `${target.name} 배치 ${next.rev}로 저장했어요.`, rev: next.rev };
}

export async function deleteRoom(projectId: number, roomId: string) {
  const ctx = await homeForRooms(projectId);
  if ("error" in ctx) return;
  const { user, current } = ctx;
  const target = current.rooms.find((x) => x.id === roomId);
  if (!target) return;
  transaction(() => {
    insertHomeVersion(projectId, user.id, current.home!, current.rooms.filter((x) => x.id !== roomId), current.id, `방 삭제: ${target.name}`);
    log(projectId, user.id, `방 배치를 지웠습니다: ${target.name}.`);
  });
  refresh();
}

// ── 집 전체 평면. 바깥 벽(치수·도면 따라 그리기) 안에 내부 벽·문·창·방 이름·고정 구조물·개념 가구를 넣는다.
// 고객이 입력한 평면이며 실측 도면이 아니다. 공사 요청 없이도 만들고 저장할 수 있다(프로젝트는 요청 전 그대로).
// 저장할 때마다 새 버전을 만들고(방 배치는 그대로), 요청을 보낸 뒤라면 ‘변경 내용 보내기’를 눌러야 업체 기준에 반영된다.
/** 이 요청에서 쓴 적 없는 평면 번호(지웠다가 다시 만들어도 번호가 겹치지 않게) */
const nextHouseRev = (projectId: number) => (get<{ r: number | null }>(`SELECT max(json_extract(house, '$.rev')) AS r FROM versions WHERE project_id = ? AND house IS NOT NULL`, projectId)?.r ?? 0) + 1;

export async function createHouse(projectId: number, _: FormState, fd: FormData): Promise<FormState> {
  const ctx = await homeForRooms(projectId);
  if ("error" in ctx) return { error: ctx.error };
  const { user, current } = ctx;
  if (current.house) return { error: "이미 집 전체 평면이 있어요. 새로 만들려면 지금 평면을 먼저 지워 주세요." };
  const house = parseHouseCreate(str(fd, "house"));
  if (!house) return { error: "평면 정보를 읽지 못했습니다. 다시 입력해 주세요." };
  const errs = houseErrors(house);
  if (errs.length) return { error: errs[0] };
  const underlayError = checkUnderlay(fd);
  if (underlayError) return { error: underlayError };
  if (house.underlay) {
    try {
      // 밑그림은 따라 그리기용 이미지로만 보관한다(자료 목록·요청 자료에는 넣지 않는다).
      const ids = await saveFiles(fd, "underlay", "drawing", user.id, projectId, "underlay");
      if (ids[0]) house.underlay.fileId = ids[0];
      else delete house.underlay;
    } catch (e) {
      return { error: (e as Error).message };
    }
  }
  const saved: HouseModel = { ...house, rev: nextHouseRev(projectId), saved_at: now() };
  const how = house.source === "trace" ? "도면 이미지 따라 그리기" : "치수";
  transaction(() => {
    insertHomeVersion(projectId, user.id, current.home!, current.rooms, current.id, `집 전체 평면 만들기 (${how})`, saved);
    log(projectId, user.id, `집 전체 평면을 만들었습니다 (${how}, 평면 ${saved.rev} · 고객이 입력한 평면).`);
  });
  refresh();
  redirect(`/projects/${projectId}/house/edit`);
}

/** Create a private home draft from dimensions/tracing, without requiring a construction request. */
export async function createHouseSpace(_: FormState,fd:FormData):Promise<FormState>{
  const user=await requireUser("customer");
  const house=parseHouseCreate(str(fd,"house"));
  if(!house)return {error:"평면 정보를 확인해 주세요."};
  const error=houseErrors(house)[0]??checkUnderlay(fd);
  if(error)return {error};
  let fileId:number|undefined;
  if(house.underlay){
    try{[fileId]=await saveFiles(fd,"underlay","drawing",user.id,null,"underlay");}
    catch(e){return {error:e instanceof Error?e.message:"도면을 저장하지 못했어요."};}
    if(!fileId)return {error:"따라 그린 원본 도면을 올려 주세요."};
    house.underlay.fileId=fileId;
  }
  const id=transaction(()=>{
    const projectId=run("INSERT INTO projects(customer_id,title,region,kind) VALUES(?,'우리 집','','home')",user.id);
    const home:HomeInput={kind:"home",homeType:"apartment",scope:"undecided",works:[],spaces:[],area:null,areaUnit:"m2",areaBasis:"unknown",rooms:null,baths:null,builtYear:null,occupancy:null,rules:""};
    insertHomeVersion(projectId,user.id,home,[],null,"집 전체 평면 직접 만들기",{...house,rev:1,saved_at:now()});
    if(fileId)run("UPDATE files SET project_id=? WHERE id=? AND owner_id=?",projectId,fileId,user.id);
    log(projectId,user.id,"내 집 평면을 직접 만들었습니다. 공사 요청 전 참고 배치입니다.");
    return projectId;
  });
  refresh();redirect(`/projects/${id}/house/edit`);
}

/** 집 전체 평면 저장. 윤곽·밑그림은 그대로 두고 벽·문·창·방 이름·고정 구조물·가구를 받는다. 가구 부품은 개념 가구 목록에서 다시 채운다. */
export async function saveHouse(projectId: number, payload: { baseRev: number; edit: HouseEdit; items: RoomEdit[] }): Promise<FormState & { rev?: number }> {
  const ctx = await homeForRooms(projectId);
  if ("error" in ctx) return { error: ctx.error };
  const { user, current } = ctx;
  const prev = current.house;
  if (!prev) return { error: "집 전체 평면을 찾을 수 없어요. 다른 화면에서 지웠는지 확인해 주세요." };
  if (Number(payload?.baseRev) !== prev.rev) return { error: `다른 화면에서 평면 ${prev.rev}로 먼저 저장했어요. 화면을 새로 고친 뒤 다시 고쳐 주세요.` };
  const edit = parseHouseEdit(payload?.edit);
  if (!edit) return { error: "평면 정보를 읽지 못했습니다. 화면을 새로 고쳐 주세요." };
  const rebuilt = rebuildHouseItems(payload?.items, prev, templatesForEdits(Array.isArray(payload?.items) ? payload.items : []), prev.items);
  if ("error" in rebuilt) return { error: rebuilt.error };
  const next: HouseModel = { ...prev, ...edit, items: rebuilt.items };
  const errs = houseErrors(next);
  if (errs.length) return { error: errs[0] };
  if (houseKey(next) === houseKey(prev)) return { ok: "저장한 평면과 달라진 점이 없어 그대로 두었어요.", rev: prev.rev };
  const saved: HouseModel = { ...next, rev: nextHouseRev(projectId), saved_at: now() };
  transaction(() => {
    insertHomeVersion(projectId, user.id, current.home!, current.rooms, current.id, `집 전체 평면 저장 (평면 ${saved.rev})`, saved);
    log(projectId, user.id, `집 전체 평면을 저장했습니다 (평면 ${saved.rev}).`);
  });
  refresh();
  return { ok: `평면 ${saved.rev}로 저장했어요.`, rev: saved.rev };
}

export async function deleteHouse(projectId: number) {
  const ctx = await homeForRooms(projectId);
  if ("error" in ctx) return;
  const { user, current } = ctx;
  if (!current.house) return;
  transaction(() => {
    insertHomeVersion(projectId, user.id, current.home!, current.rooms, current.id, "집 전체 평면 삭제", null);
    log(projectId, user.id, `집 전체 평면을 지웠습니다 (평면 ${current.house!.rev}).`);
  });
  refresh();
  redirect(`/projects/${projectId}/house`);
}

// ── 내 공간(실제 구조 + 가구 배치)
/** 화면이 보낸 공간 치수(JSON). 숫자가 아닌 값은 NaN으로 두어 검사에서 걸러진다. */
function parseRoom(raw: string): RoomModel | null {
  try {
    const o = JSON.parse(raw);
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 1000) / 1000 : NaN);
    const walls = ["front", "rear", "left", "right"] as const;
    const wall = (w: unknown) => (walls as readonly unknown[]).includes(w) ? (w as (typeof walls)[number]) : "rear";
    const poly = o.shape === "polygon";
    const edge = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < 64 ? (v as number) : 0);
    const ref = (w: { wall?: unknown; edge?: unknown; at?: unknown }) => (poly ? { edge: edge(w.edge), at: n(w.at) } : { wall: wall(w.wall), at: n(w.at) });
    let outline: [number, number][] | undefined;
    let W = n(o.width);
    let D = n(o.depth);
    if (poly) {
      if (!Array.isArray(o.outline) || o.outline.length < 4 || o.outline.length > 64) return null;
      const raw = o.outline.map((p: unknown) => [n((p as number[])?.[0]), n((p as number[])?.[1])] as [number, number]);
      if (raw.some((p: [number, number]) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return null;
      // 화면에서 정리한 꼭짓점을 그대로 받는다. 정리 규칙이 달라 변 번호가 바뀌면 받지 않는다.
      outline = normalizeOutline(raw);
      if (JSON.stringify(outline) !== JSON.stringify(raw)) return null;
      W = Math.max(...outline.map((p) => p[0]));
      D = Math.max(...outline.map((p) => p[1]));
    }
    const m = o.underlay?.m;
    const underlay =
      Array.isArray(m) && m.length === 6 && m.every((v: unknown) => typeof v === "number" && Number.isFinite(v)) && Number.isInteger(o.underlay.iw) && Number.isInteger(o.underlay.ih)
        ? { fileId: Number(o.underlay.fileId) || 0, iw: o.underlay.iw as number, ih: o.underlay.ih as number, m: m as Underlay["m"] }
        : null;
    return {
      shape: poly ? "polygon" : "rect",
      width: W,
      depth: D,
      ...(outline ? { outline } : {}),
      height: o.height == null ? null : n(o.height),
      entrance: { at: n(o.entrance?.at), width: n(o.entrance?.width), ...(poly ? { edge: edge(o.entrance?.edge) } : {}) },
      windows: Array.isArray(o.windows) ? o.windows.slice(0, 21).map((w: { wall?: unknown; edge?: unknown; at?: unknown; width?: unknown }) => ({ ...ref(w), width: n(w.width) })) : null,
      pillars: Array.isArray(o.pillars) ? o.pillars.slice(0, 13).map((p: Record<string, unknown>) => ({ x: n(p.x), y: n(p.y), w: n(p.w), d: n(p.d) })) : [],
      utilities: Array.isArray(o.utilities) ? o.utilities.slice(0, 7).map((u: { wall?: unknown; edge?: unknown; at?: unknown }) => ({ kind: "water" as const, ...ref(u) })) : [],
      source: o.source === "trace" ? "trace" : "dims",
      areaHint: o.areaHint == null || o.areaHint === "" ? null : n(o.areaHint),
      ...(underlay ? { underlay } : {}),
    };
  } catch {
    return null;
  }
}

/** 밑그림: 새로 올린 이미지가 있으면 그것을, 없으면 이 프로젝트에 이미 있는 밑그림만 이어 쓴다. */
async function attachUnderlay(room: RoomModel, fd: FormData, userId: number, projectId: number, keep: number | null) {
  if (!room.underlay) return;
  const ids = await saveFiles(fd, "underlay", "drawing", userId, projectId, "underlay");
  if (ids[0]) room.underlay.fileId = ids[0];
  else if (keep && room.underlay.fileId === keep) return;
  else delete room.underlay;
}

function parseNeeds(fd: FormData) {
  const priority = str(fd, "priority");
  const seats = Math.round(num(fd, "meetingSeats") ?? 6);
  return {
    staff: Math.round(num(fd, "staff") ?? 0),
    ceo: checked(fd, "ceo"),
    meeting: checked(fd, "meeting"),
    meetingSeats: [4, 6, 8, 10, 12].includes(seats) ? seats : 6,
    pantry: checked(fd, "pantry"),
    storage: checked(fd, "storage"),
    priority: (priority === "visitor" || priority === "collab" || priority === "focus" ? priority : "unknown") as LayoutInput["priority"],
    furnitureIncluded: fd.get("furnitureIncluded") == null ? true : checked(fd, "furnitureIncluded"),
    mood: "unknown" as const,
    siteNotes: str(fd, "siteNotes"),
    reuseFurniture: "",
  };
}

interface SpaceVersion {
  input: LayoutInput;
  result: ReturnType<typeof generateLayout>;
  start: string;
  style: string;
  room: RoomModel;
  placement: Placement;
  source: "auto" | "edited" | "empty";
  base: number | null;
  note: string;
}

/** 내 공간 버전. 한번 저장한 버전은 고치지 않고, 바꿀 때마다 새 버전을 만든다. */
function insertSpaceVersion(projectId: number, userId: number, v: SpaceVersion) {
  const { n } = get<{ n: number }>(`SELECT coalesce(max(no), 0) AS n FROM versions WHERE project_id = ?`, projectId)!;
  const id = run(
    `INSERT INTO versions (project_id, no, input, result, layout_status, selected_option, selected_style, note, created_by, room, placement, source, base_version_id)
     VALUES (?, ?, ?, ?, 'ok', ?, ?, ?, ?, ?, ?, ?, ?)`,
    projectId,
    n + 1,
    JSON.stringify(v.input),
    JSON.stringify(v.result),
    v.start,
    v.style,
    v.note,
    userId,
    JSON.stringify(v.room),
    JSON.stringify(v.placement),
    v.source,
    v.base,
  );
  run(`UPDATE projects SET current_version_id = ?, updated_at = datetime('now') WHERE id = ?`, id, projectId);
  return { id, no: n + 1 };
}

/** 실제 구조와 필요한 공간으로 자동 배치를 만들고, 시작 배치를 고른다. 자동 배치가 없으면 빈 공간에서 시작한다. */
function layoutFor(room: RoomModel, needs: ReturnType<typeof parseNeeds>, intake: "dims" | "drawing", prefer = "") {
  const input = roomToInput(room, needs, intake);
  const result = generateLayout(input);
  const start = result.options.find((o) => o.id === prefer) ?? result.options.find((o) => o.id === result.recommended) ?? result.options[0] ?? null;
  const placement: Placement = (start && placementFromOption(start)) || { items: [] };
  return { input, result, start, placement };
}

const SHAPE_LIMIT = "치수 입력으로는 직사각형 공간만 만들 수 있습니다. ㄱ자 등 다른 모양은 직사각형으로 바꾸지 않고, 도면 따라 그리기나 상담 요청을 이용해 주세요.";

/** 밑그림 이미지(도면 따라 그리기). 화면에서 PDF도 이미지로 바꿔 보낸다. */
function checkUnderlay(fd: FormData) {
  for (const entry of fd.getAll("underlay")) {
    if (!(entry instanceof File) || entry.size === 0) continue;
    if (![".jpg", ".jpeg", ".png", ".webp"].includes(path.extname(entry.name).toLowerCase())) return "밑그림은 JPG·PNG·WEBP 이미지만 받습니다.";
    if (entry.size > MAX_FILE) return "밑그림 이미지는 10MB 이하여야 합니다.";
  }
  return null;
}

export async function createSpace(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser("customer");
  if (str(fd, "shape") && str(fd, "shape") !== "rect" && str(fd, "shape") !== "trace") return { error: SHAPE_LIMIT };
  const room = parseRoom(str(fd, "room"));
  if (!room) return { error: "공간 치수를 읽지 못했습니다. 다시 입력해 주세요." };
  const errs = validateRoom(room);
  if (errs.length) return { error: errs[0] };
  const needs = parseNeeds(fd);
  if (!(needs.staff >= 1 && needs.staff <= 200)) return { error: "직원 좌석 수를 1~200석으로 넣어 주세요." };
  const fileError = checkFiles(fd, "drawings", "drawing") ?? checkUnderlay(fd);
  if (fileError) return { error: fileError };
  const intake = str(fd, "intake") === "drawing" || room.source === "trace" ? "drawing" : "dims";
  const { input, result, start, placement } = layoutFor(room, needs, intake);
  const projectId = transaction(() => {
    const id = run(`INSERT INTO projects (customer_id, title, region, address) VALUES (?, ?, ?, ?)`, user.id, (str(fd, "title") || "우리 사무실").slice(0, 60), str(fd, "region").slice(0, 60), str(fd, "address").slice(0, 300));
    const v = insertSpaceVersion(id, user.id, { input, result, start: start?.id ?? "", style: recommendStyle(input).id, room, placement, source: start ? "auto" : "empty", base: null, note: "" });
    log(id, user.id, `${room.source === "trace" ? "도면을 따라 그려 " : ""}내 공간을 만들었습니다 (버전 ${v.no}). ${start ? `자동 배치 ‘${start.title}’에서 시작합니다.` : "자동 배치 없이 빈 공간에서 시작합니다."}`);
    const refIds = [...new Set(fd.getAll("refCase").map(Number))].filter((n) => Number.isInteger(n) && getCase(n)).slice(0, 8);
    for (const caseId of refIds) insertRef(id, caseId, Number(fd.get("refPhoto")) || null, "");
    attachPostReference(id,fd);
    return id;
  });
  try {
    await saveFiles(fd, "drawings", "drawing", user.id, projectId);
    if (room.underlay) {
      // 밑그림 파일 번호는 프로젝트를 만든 뒤에 정해지므로 첫 버전에 채워 넣는다.
      await attachUnderlay(room, fd, user.id, projectId, null);
      run(`UPDATE versions SET room = ? WHERE project_id = ?`, JSON.stringify(room), projectId);
    }
  } catch (e) {
    log(projectId, user.id, `파일 업로드 실패: ${(e as Error).message}`);
  }
  refresh();
  redirect(`/projects/${projectId}/editor`);
}

/** 공간 치수나 필요한 공간을 바꾼다. 배치는 새 조건의 자동 배치에서 다시 시작하고, 이전 버전은 그대로 남는다. */
export async function updateSpace(projectId: number, _: FormState, fd: FormData): Promise<FormState> {
  const { user, project } = await ownedProject(projectId);
  if (["contracted", "closed"].includes(project.status)) return { error: "종료된 프로젝트입니다." };
  const current = getVersion(project.current_version_id);
  if (str(fd, "shape") && str(fd, "shape") !== "rect" && str(fd, "shape") !== "trace") return { error: SHAPE_LIMIT };
  const room = parseRoom(str(fd, "room"));
  if (!room) return { error: "공간 치수를 읽지 못했습니다. 다시 입력해 주세요." };
  const errs = validateRoom(room);
  if (errs.length) return { error: errs[0] };
  const underlayError = checkFiles(fd, "drawings", "drawing") ?? checkUnderlay(fd);
  if (underlayError) return { error: underlayError };
  try {
    await attachUnderlay(room, fd, user.id, projectId, current?.room?.underlay?.fileId ?? null);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const needs = { ...parseNeeds(fd), furnitureIncluded: current?.input.furnitureIncluded ?? true };
  if (!(needs.staff >= 1 && needs.staff <= 200)) return { error: "직원 좌석 수를 1~200석으로 넣어 주세요." };
  const { input, result, start, placement } = layoutFor(room, needs, current?.input.intake === "drawing" ? "drawing" : "dims", current?.selected_option);
  const v = transaction(() => {
    if (str(fd, "title")) run(`UPDATE projects SET title = ? WHERE id = ?`, str(fd, "title").slice(0, 60), projectId);
    return insertSpaceVersion(projectId, user.id, { input, result, start: start?.id ?? "", style: current?.selected_style ?? recommendStyle(input).id, room, placement, source: start ? "auto" : "empty", base: current?.id ?? null, note: "공간 정보 변경" });
  });
  log(projectId, user.id, `공간 정보를 바꿔 버전 ${v.no}을 만들었습니다${room.source === "trace" ? " (도면 따라 그리기)" : ""}. 배치는 ${start ? `자동 배치 ‘${start.title}’` : "빈 공간"}에서 다시 시작합니다.`);
  try {
    await saveFiles(fd, "drawings", "drawing", user.id, projectId);
  } catch (e) {
    log(projectId, user.id, `파일 업로드 실패: ${(e as Error).message}`);
  }
  refresh();
  redirect(`/projects/${projectId}/editor`);
}

/** 편집한 배치를 새 버전으로 저장한다. 가구 부품은 서버가 원본에서 다시 채운다. */
export async function saveLayout(projectId: number, payload: { baseVersionId: number; start: string; edits: PlacementEdit[] }): Promise<FormState & { versionId?: number; no?: number }> {
  const { user, project } = await ownedProject(projectId);
  if (["contracted", "closed"].includes(project.status)) return { error: "종료된 프로젝트는 배치를 바꿀 수 없습니다." };
  const base = getVersion(Number(payload?.baseVersionId));
  if (!base || base.project_id !== projectId || !base.room || !base.placement) return { error: "저장할 공간을 찾을 수 없습니다. 화면을 새로 고쳐 주세요." };
  const start = String(payload.start ?? "");
  const startOption = start ? (base.result.options.find((o) => o.id === start) ?? null) : null;
  if (start && !startOption) return { error: "시작 배치를 찾을 수 없습니다." };
  const rebuilt = rebuildPlacement(payload.edits, startOption, [...catalogItems(), ...templatesForEdits(Array.isArray(payload.edits) ? payload.edits : [])], base.room, base.placement.items);
  if ("error" in rebuilt) return { error: rebuilt.error };
  const items = rebuilt.items;
  const key = (list: PlacedItem[]) => JSON.stringify(normalizeItems(list).map((it) => [it.id, it.label, it.x, it.y, it.rot, it.fixture ?? ""]));
  if (start === base.selected_option && key(base.placement.items) === key(items)) return { ok: "바뀐 점이 없어 저장하지 않았습니다.", versionId: base.id, no: base.no };
  const auto = startOption ? (placementFromOption(startOption)?.items ?? []) : [];
  const source = !startOption && !items.length ? "empty" : startOption && key(auto) === key(items) ? "auto" : "edited";
  const d = diffPlacement(start === base.selected_option ? base.placement.items : auto, items);
  const note = start !== base.selected_option ? `시작 배치 ‘${startOption?.title ?? "빈 공간"}’${d.summary ? ` · ${d.summary}` : ""}` : d.summary;
  const v = transaction(() =>
    insertSpaceVersion(projectId, user.id, { input: base.input, result: base.result, start, style: base.selected_style, room: base.room!, placement: { items }, source, base: base.id, note }),
  );
  log(projectId, user.id, `배치를 저장했습니다 (버전 ${v.no}${note ? ` · ${note}` : ""}).`);
  refresh();
  return { ok: `버전 ${v.no}로 저장했습니다.`, versionId: v.id, no: v.no };
}

/**
 * 시공 제안 요청서. 요청 전에는 ‘요청 보내기’로 업체 배정을 요청하고,
 * 요청 뒤에는 고친 내용을 저장만 한다(업체에는 ‘변경 내용 보내기’를 눌러야 간다).
 */
export async function saveRequest(projectId: number, _: FormState, fd: FormData): Promise<FormState> {
  const { user, project } = await ownedProject(projectId);
  if (["contracted", "closed"].includes(project.status)) return { error: "종료된 프로젝트입니다." };
  const basis = getVersion(num(fd, "basis"));
  if (!basis || basis.project_id !== projectId) return { error: "요청에 쓸 배치를 골라 주세요." };
  const fields = parseProjectFields(fd);
  if (!fields.region) return { error: "지역(시·구)을 입력해 주세요. 참여 업체에 공개됩니다." };
  if (fields.budget_min != null && fields.budget_max != null && fields.budget_min > fields.budget_max) return { error: "예산 최소값이 최대값보다 큽니다." };
  const fileError = checkFiles(fd, "photos", "photo") ?? checkFiles(fd, "drawings", "drawing");
  if (fileError) return { error: fileError };
  const furniture = checked(fd, "furnitureIncluded");
  transaction(() => {
    run(
      `UPDATE projects SET region = ?, address = ?, budget_min = ?, budget_max = ?, desired_start = ?, desired_movein = ?, notes = ?, work_scope = ?, updated_at = datetime('now') WHERE id = ?`,
      fields.region,
      fields.address,
      fields.budget_min,
      fields.budget_max,
      fields.desired_start,
      fields.desired_movein,
      fields.notes,
      fields.work_scope,
      projectId,
    );
    let target = basis;
    // 가구 견적 포함 여부는 배치 버전에 붙어 있으므로, 바뀌면 같은 배치로 새 버전을 만든다(보낸 버전은 고치지 않는다).
    if (basis.input.furnitureIncluded !== furniture) {
      const input = { ...basis.input, furnitureIncluded: furniture };
      if (basis.room && basis.placement) {
        const v = insertSpaceVersion(projectId, user.id, { input, result: basis.result, start: basis.selected_option, style: basis.selected_style, room: basis.room, placement: basis.placement, source: (basis.source || "auto") as SpaceVersion["source"], base: basis.id, note: `가구 견적 ${furniture ? "포함" : "별도"}` });
        target = getVersion(v.id)!;
      }
    } else if (basis.id !== project.current_version_id) run(`UPDATE projects SET current_version_id = ?, updated_at = datetime('now') WHERE id = ?`, basis.id, projectId);
    // 참고 사례: 고른 것만 남긴다.
    const picked = new Set(fd.getAll("refCase").map(Number).filter((n) => Number.isInteger(n) && getCase(n)));
    if (fd.get("refsShown")) {
      for (const r of all<{ id: number; case_id: number }>(`SELECT id, case_id FROM project_refs WHERE project_id = ?`, projectId)) if (!picked.has(r.case_id)) run(`DELETE FROM project_refs WHERE id = ?`, r.id);
      for (const caseId of [...picked].slice(0, 8)) insertRef(projectId, caseId, null, "");
    }
    return target;
  });
  try {
    await saveFiles(fd, "photos", "photo", user.id, projectId);
    await saveFiles(fd, "drawings", "drawing", user.id, projectId);
  } catch (e) {
    return { error: (e as Error).message };
  }
  applyBidMode(projectId, fd);
  if (!project.requested_version_id && str(fd, "intent") === "send") {
    await requestQuotes(projectId);
    redirect(`/projects/${projectId}`);
  }
  log(projectId, user.id, "요청 내용을 고쳤습니다.");
  refresh();
  redirect(`/projects/${projectId}`);
}

/** 참고 사례를 요청서에 연결한다. photoId는 그 사례의 사진일 때만 남긴다. */
function insertRef(projectId: number, caseId: number, photoId: number | null, note: string) {
  const photo = photoId && get(`SELECT 1 AS ok FROM case_files WHERE case_id = ? AND file_id = ?`, caseId, photoId) ? photoId : null;
  run(`INSERT OR IGNORE INTO project_refs (project_id, case_id, file_id, note) VALUES (?, ?, ?, ?)`, projectId, caseId, photo, note.slice(0, 300));
}

export async function addProjectRef(projectId: number, fd: FormData) {
  const { user } = await ownedProject(projectId);
  const c = getCase(Number(fd.get("caseId")));
  if (!c) return;
  if (get(`SELECT 1 AS ok FROM project_refs WHERE project_id = ? AND case_id = ?`, projectId, c.id)) return;
  insertRef(projectId, c.id, null, str(fd, "note"));
  log(projectId, user.id, `참고 사례 ‘${c.title}’을(를) 요청서에 연결했습니다.`);
  touch(projectId);
  refresh();
}

export async function removeProjectRef(refId: number) {
  const ref = get<{ project_id: number; case_id: number }>(`SELECT project_id, case_id FROM project_refs WHERE id = ?`, refId);
  if (!ref) return;
  const { user } = await ownedProject(ref.project_id);
  run(`DELETE FROM project_refs WHERE id = ?`, refId);
  log(ref.project_id, user.id, "참고 사례 연결을 하나 해제했습니다.");
  touch(ref.project_id);
  refresh();
}

/** 참고 사례 저장·해제. 관심 업체와는 따로 관리한다. */
export async function toggleSavedCase(caseId: number): Promise<{ on: boolean }> {
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/cases/${caseId}`)}`);
  if (user.role !== "customer" || !getCase(caseId)) return { on: false };
  const exists = get(`SELECT 1 AS ok FROM saved_cases WHERE user_id = ? AND case_id = ?`, user.id, caseId);
  if (exists) run(`DELETE FROM saved_cases WHERE user_id = ? AND case_id = ?`, user.id, caseId);
  else run(`INSERT INTO saved_cases (user_id, case_id) VALUES (?, ?)`, user.id, caseId);
  refresh();
  return { on: !exists };
}

export async function updateProject(projectId: number, _: FormState, fd: FormData): Promise<FormState> {
  const { user, project } = await ownedProject(projectId);
  const fields = parseProjectFields(fd);
  const input = parseInput(fd);
  const error = validateProject(fields, input);
  if (error) return { error };
  const current = getVersion(project.current_version_id);
  transaction(() => {
    run(
      `UPDATE projects SET title = ?, region = ?, address = ?, budget_min = ?, budget_max = ?, desired_start = ?, desired_movein = ?, notes = ?, work_scope = ?, updated_at = datetime('now') WHERE id = ?`,
      fields.title,
      fields.region,
      fields.address,
      fields.budget_min,
      fields.budget_max,
      fields.desired_start,
      fields.desired_movein,
      fields.notes,
      fields.work_scope,
      projectId,
    );
    // 공간 조건이 바뀌었을 때만 새 버전을 만든다.
    if (!current || JSON.stringify(current.input) !== JSON.stringify(input)) {
      const { no, result } = insertVersion(projectId, user.id, input, str(fd, "versionNote"));
      log(projectId, user.id, `조건을 변경해 v${no}을 생성했습니다${result.status === "ok" ? "" : " (검토 필요)"}.`);
    } else {
      log(projectId, user.id, "프로젝트 정보를 수정했습니다.");
    }
  });
  refresh();
  redirect(`/projects/${projectId}`);
}

/** 배치 옵션·스타일 선택을 저장한다. 견적을 요청한 버전은 기준이 바뀌지 않도록 새 버전으로 분기한다. */
export async function saveSelection(projectId: number, versionId: number, option: string, style: string): Promise<FormState> {
  const { user, project } = await ownedProject(projectId);
  const version = getVersion(versionId);
  if (!version || version.project_id !== projectId) return { error: "버전을 찾을 수 없습니다." };
  if (!STYLES.some((s) => s.id === style)) return { error: "스타일을 확인해 주세요." };
  if (option !== version.selected_option && version.result.options.length && !version.result.options.some((o) => o.id === option)) return { error: "배치안을 확인해 주세요." };
  if (version.selected_option === option && version.selected_style === style) return { ok: "이미 선택된 조합입니다." };
  const styleName = STYLES.find((s) => s.id === style)!.name;
  const optionName = version.result.options.find((o) => o.id === option)?.title ?? option;
  if (project.requested_version_id === versionId) {
    const { n } = get<{ n: number }>(`SELECT max(no) AS n FROM versions WHERE project_id = ?`, projectId)!;
    // 내 공간 버전이면 실제 구조와 가구 배치도 그대로 옮긴다.
    const id = run(
      `INSERT INTO versions (project_id, no, input, result, layout_status, selected_option, selected_style, note, created_by, room, placement, source, base_version_id)
       SELECT project_id, ?, input, result, layout_status, ?, ?, ?, ?, room, placement, source, id FROM versions WHERE id = ?`,
      n + 1,
      option,
      style,
      `v${version.no}에서 선택 변경`,
      user.id,
      versionId,
    );
    run(`UPDATE projects SET current_version_id = ?, updated_at = datetime('now') WHERE id = ?`, id, projectId);
    log(projectId, user.id, `선택을 바꿔 v${n + 1}을 만들었습니다 (${optionName}, ${styleName}).`);
    refresh();
    return { ok: `견적 요청한 v${version.no}은 그대로 두고 v${n + 1}을 만들었습니다.` };
  }
  run(`UPDATE versions SET selected_option = ?, selected_style = ? WHERE id = ?`, option, style, versionId);
  touch(projectId);
  refresh();
  return { ok: `${optionName} · ${styleName}(으)로 저장했습니다.` };
}

export async function setCurrentVersion(projectId: number, versionId: number) {
  const { user } = await ownedProject(projectId);
  const version = getVersion(versionId);
  if (!version || version.project_id !== projectId) return;
  run(`UPDATE projects SET current_version_id = ?, updated_at = datetime('now') WHERE id = ?`, versionId, projectId);
  log(projectId, user.id, `v${version.no}을 현재 버전으로 지정했습니다.`);
  refresh();
}

export async function addFiles(projectId: number, _: FormState, fd: FormData): Promise<FormState> {
  const { user } = await ownedProject(projectId);
  try {
    const n =
      (await saveFiles(fd, "photos", "photo", user.id, projectId)).length +
      (await saveFiles(fd, "drawings", "drawing", user.id, projectId)).length +
      (await saveFiles(fd, "sketches", "drawing", user.id, projectId, "sketch")).length;
    if (!n) return { error: "올릴 파일을 선택해 주세요." };
    log(projectId, user.id, `파일 ${n}개를 올렸습니다.`);
    refresh();
    return { ok: `파일 ${n}개를 올렸습니다.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function removeFile(fileId: number) {
  const user = await requireUser();
  const file = get<FileRow>(`SELECT * FROM files WHERE id = ?`, fileId);
  if (!file || (file.owner_id !== user.id && user.role !== "admin")) return;
  // 업체에 보낸 요청 내용에 들어간 파일은 지우지 않고 목록에서만 뺀다. 업체는 받은 자료를 계속 볼 수 있다.
  if (file.project_id && fileInRevisions(file.project_id, fileId)) {
    run(`UPDATE files SET deleted_at = datetime('now') WHERE id = ?`, fileId);
    refresh();
    return;
  }
  run(`UPDATE vendor_cases SET file_id = NULL WHERE file_id = ?`, fileId);
  run(`DELETE FROM case_files WHERE file_id = ?`, fileId);
  run(`DELETE FROM files WHERE id = ?`, fileId);
  await fs.rm(path.join(UPLOAD_DIR, file.stored_name), { force: true });
  refresh();
}

export async function addChangeRequest(projectId: number, fd: FormData) {
  const { user, project } = await ownedProject(projectId);
  const body = str(fd, "body");
  if (!body || !project.current_version_id) return;
  run(`INSERT INTO change_requests (project_id, version_id, user_id, body) VALUES (?, ?, ?, ?)`, projectId, project.current_version_id, user.id, body);
  log(projectId, user.id, "수정 요청을 남겼습니다.");
  notify(adminIds(), { projectId, title: `수정 요청: ${project.title}`, body, href: `/admin/projects/${projectId}` });
  refresh();
}

export async function createShareLink(projectId: number, fd: FormData) {
  const { user } = await ownedProject(projectId);
  const days = [1, 7, 30].includes(Number(fd.get("days"))) ? Number(fd.get("days")) : 7;
  run(`INSERT INTO share_links (project_id, token, expires_at) VALUES (?, ?, datetime('now', ?))`, projectId, randomBytes(18).toString("base64url"), `+${days} days`);
  log(projectId, user.id, `${days}일짜리 공유 링크를 만들었습니다.`);
  refresh();
}

export async function revokeShareLink(linkId: number) {
  const link = get<{ project_id: number }>(`SELECT project_id FROM share_links WHERE id = ?`, linkId);
  if (!link) return;
  await ownedProject(link.project_id);
  run(`UPDATE share_links SET revoked = 1 WHERE id = ?`, linkId);
  refresh();
}

export async function requestQuotes(projectId: number, fd?: FormData) {
  const { user } = await ownedProject(projectId);
  applyBidMode(projectId, fd instanceof FormData ? fd : undefined);
  const project = getProject(projectId)!;
  const version = getVersion(project.current_version_id);
  if (!version || project.requested_version_id === version.id) return;
  if (["contracted", "closed"].includes(project.status)) return;
  // 한 번 요청한 뒤에는 다시 요청하지 않고, 바뀐 내용(배치 포함)을 같은 업체에 보낸다.
  if (project.requested_version_id) return sendRequestUpdate(projectId);
  // 이전 도면으로 참여하던 시공사에는 마감을 알린다.
  const previous = project.requested_version_id
    ? all<{ id: number; vendor_id: number }>(`SELECT id, vendor_id FROM assignments WHERE project_id = ? AND version_id = ? AND status != 'declined'`, projectId, project.requested_version_id)
    : [];
  run(`UPDATE projects SET requested_version_id = ?, status = 'requested', updated_at = datetime('now') WHERE id = ?`, version.id, projectId);
  // 이때의 조건·자료·참고 사례를 그대로 남긴다. 시공사는 이 기록을 본다.
  const rev = recordRevision(getProject(projectId)!, version, user.id);
  for (const a of previous)
    notify([vendorUserId(a.vendor_id)], {
      projectId,
      title: `${project.region} 요청의 도면이 바뀌었습니다`,
      body: "이전 도면 기준 제안은 마감되었습니다. 새 도면으로 다시 배정되면 알려 드립니다.",
      href: `/vendor/requests/${a.id}`,
    });
  notify(adminIds(), {
    projectId,
    title: `${project.requested_version_id ? "도면 변경 후 재요청" : "새 요청 접수"}: ${project.title}`,
    body: version.home
      ? `집 · ${HOME_TYPES[version.home.homeType]} · ${project.region} · 요청 내용 r${rev.no}. 검토하고 주거 시공이 가능한 업체를 배정해 주세요.`
      : `${project.region} · v${version.no} · 요청 내용 r${rev.no}${version.layout_status === "ok" ? "" : " · 배치안 없음(자료 확인 필요)"}. 검토하고 시공사를 배정해 주세요.`,
    href: `/admin/projects/${projectId}`,
    email: true,
  });
  // 업체 직접 참여를 켠 요청은 분야가 맞는 승인 업체에 알린다(알림함만, 이름·주소·연락처 없이).
  if (project.bid_mode === "open") {
    const kind = project.kind === "home" ? "home" : "office";
    const targets = all<{ id: number; fields: string }>(`SELECT id, fields FROM vendors WHERE status = 'approved'`).filter((v) => (v.fields || "office").split(",").includes(kind));
    for (const v of targets)
      notify([vendorUserId(v.id)], {
        projectId,
        title: `참여할 수 있는 새 요청: ${project.region} · ${kind === "home" ? "주거" : "사무실"}`,
        body: `업체 직접 참여를 받는 요청입니다. 참여 업체 ${project.bid_cap}곳까지, 먼저 참여한 순서로 받습니다.`,
        href: `/vendor/open/${projectId}`,
      });
  }
  log(
    projectId,
    user.id,
    version.home
      ? `집 상담을 요청했습니다 (요청 내용 r${rev.no}${version.rooms.length ? `, 방 배치 ${version.rooms.length}개 포함` : ""}).`
      : version.layout_status === "ok"
        ? `v${version.no} 기준으로 견적을 요청했습니다.`
        : `v${version.no} 기준으로 상담을 접수했습니다 (자동 배치 없음, 운영자 검토 필요).`,
  );
  refresh();
}

/** 요청을 보낸 뒤 바꾼 내용을 새 요청 내용으로 남기고 배정된 시공사에 알린다. 이전 요청 내용은 지우지 않는다. */
export async function sendRequestUpdate(projectId: number) {
  const { user, project } = await ownedProject(projectId);
  const sent = getVersion(project.requested_version_id);
  const version = getVersion(project.current_version_id) ?? sent;
  if (!sent || !version || ["contracted", "closed"].includes(project.status)) return;
  if (!pendingChanges(project).length) return;
  const rev = transaction(() => {
    // 배치를 고쳤으면 같은 업체가 새 배치를 기준으로 이어서 제안한다. 이미 낸 제안은 이전 요청 내용(r번호) 기준으로 남는다.
    if (version.id !== sent.id) {
      const moving = all<{ id: number }>(`SELECT id FROM assignments WHERE project_id = ? AND version_id = ? AND status != 'declined' AND withdrawn_at IS NULL`, projectId, sent.id);
      for (const a of moving) {
        run(`UPDATE assignments SET version_id = ? WHERE id = ?`, version.id, a.id);
        run(`UPDATE quotes SET version_id = ? WHERE assignment_id = ?`, version.id, a.id);
      }
      run(`UPDATE projects SET requested_version_id = ?, updated_at = datetime('now') WHERE id = ?`, version.id, projectId);
    }
    return recordRevision(getProject(projectId)!, version, user.id);
  });
  const active = all<{ id: number; vendor_id: number }>(
    `SELECT id, vendor_id FROM assignments WHERE project_id = ? AND version_id = ? AND status != 'declined' AND withdrawn_at IS NULL`,
    projectId,
    version.id,
  );
  for (const a of active)
    notify([vendorUserId(a.vendor_id)], {
      projectId,
      title: `${project.region} 요청 내용이 바뀌었습니다 (r${rev.no})`,
      body: `바뀐 점 ${rev.changes.length}건: ${rev.changes.slice(0, 3).join(" / ")}${rev.changes.length > 3 ? " 외" : ""}. 이전 내용도 요청 화면에서 볼 수 있습니다.`,
      href: `/vendor/requests/${a.id}`,
      email: true,
    });
  notify(adminIds(), { projectId, title: `요청 내용 변경 r${rev.no}: ${project.title}`, body: rev.changes.slice(0, 3).join(" / "), href: `/admin/projects/${projectId}` });
  log(projectId, user.id, `바뀐 요청 내용을 업체에 보냈습니다 (r${rev.no}, 변경 ${rev.changes.length}건).`);
  touch(projectId);
  refresh();
}

export async function requestVisit(quoteId: number, fd: FormData) {
  const quote = get<{ id: number; project_id: number; vendor_id: number }>(`SELECT id, project_id, vendor_id FROM quotes WHERE id = ?`, quoteId);
  if (!quote) return;
  const { user, project } = await ownedProject(quote.project_id);
  if (get(`SELECT 1 AS ok FROM visit_requests WHERE quote_id = ?`, quoteId)) return;
  run(`INSERT INTO visit_requests (project_id, quote_id, vendor_id, preferred, message) VALUES (?, ?, ?, ?, ?)`, project.id, quoteId, quote.vendor_id, str(fd, "preferred"), str(fd, "message"));
  if (["matching", "quoted"].includes(project.status)) touch(project.id, "visit");
  const vendor = get<{ company: string }>(`SELECT company FROM vendors WHERE id = ?`, quote.vendor_id);
  log(project.id, user.id, `${vendor?.company}에 현장 방문을 요청했습니다. 상세 주소와 연락처가 이 업체에 공개됩니다.`);
  const asg = get<{ assignment_id: number }>(`SELECT assignment_id FROM quotes WHERE id = ?`, quoteId);
  notify([vendorUserId(quote.vendor_id)], {
    projectId: project.id,
    title: `${project.region} 고객이 상담·현장 방문을 요청했습니다`,
    body: `상세 주소와 연락처가 공개되었습니다.${str(fd, "preferred") ? ` 희망 일정: ${str(fd, "preferred")}` : ""}`,
    href: `/vendor/requests/${asg?.assignment_id}`,
    email: true,
  });
  notify(adminIds(), { projectId: project.id, title: `방문 요청: ${project.title}`, body: `${vendor?.company}`, href: `/admin/projects/${project.id}` });
  refresh();
}

/** 관심 업체 담기·빼기. 운영자가 업체를 배정할 때 참고한다. */
export async function toggleFavorite(vendorId: number): Promise<{ on: boolean }> {
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/vendors/${vendorId}`)}`);
  if (user.role !== "customer") return { on: false };
  const vendor = get<{ id: number }>(`SELECT id FROM vendors WHERE id = ? AND status = 'approved'`, vendorId);
  if (!vendor) return { on: false };
  const exists = get(`SELECT 1 AS ok FROM favorites WHERE user_id = ? AND vendor_id = ?`, user.id, vendorId);
  if (exists) run(`DELETE FROM favorites WHERE user_id = ? AND vendor_id = ?`, user.id, vendorId);
  else run(`INSERT INTO favorites (user_id, vendor_id) VALUES (?, ?)`, user.id, vendorId);
  refresh();
  return { on: !exists };
}

// ── 업체
/** 업체 본인, 또는 운영자가 업체 대신(vendorId를 넘길 때) 소개와 사례를 고친다. */
async function editableVendor(vendorId: number | null) {
  if (vendorId == null) return (await vendorSession()).vendor;
  await requireUser("admin");
  const vendor = get<{ id: number; user_id: number; company: string; status: string; fields: string }>(`SELECT id, user_id, company, status, fields FROM vendors WHERE id = ?`, vendorId);
  if (!vendor) redirect("/admin/vendors");
  return vendor;
}

/** 업체 시공 분야. 화면에 분야 칸이 없으면(예전 화면) 그대로 둔다. 하나도 고르지 않으면 사무실로 둔다. */
function parseFields(fd: FormData, fallback = "office") {
  if (!fd.get("fieldsShown")) return fallback || "office";
  const picked = ["office", "home"].filter((f) => fd.getAll("fields").map(String).includes(f));
  return picked.length ? picked.join(",") : "office";
}

export async function saveVendorProfile(vendorId: number | null, _: FormState, fd: FormData): Promise<FormState> {
  const vendor = await editableVendor(vendorId);
  const company = str(fd, "company");
  if (!company) return { error: "업체명을 입력해 주세요." };
  run(
    `UPDATE vendors SET company = ?, intro = ?, regions = ?, specialties = ?, years = ?, fields = ? WHERE id = ?`,
    company,
    str(fd, "intro"),
    str(fd, "regions"),
    str(fd, "specialties"),
    Math.max(0, Math.round(num(fd, "years") ?? 0)),
    parseFields(fd, vendor.fields),
    vendor.id,
  );
  refresh();
  return { ok: "저장했습니다." };
}

export async function addVendorCase(vendorId: number | null, _: FormState, fd: FormData): Promise<FormState> {
  const vendor = await editableVendor(vendorId);
  const title = str(fd, "title");
  if (!title) return { error: "사례 제목을 입력해 주세요." };
  if (fd.getAll("images").filter((f) => f instanceof File && f.size > 0).length > 8) return { error: "사진은 사례 하나에 8장까지 올릴 수 있습니다." };
  let fileIds: number[] = [];
  try {
    fileIds = await saveFiles(fd, "images", "case", vendor.user_id, null);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const fileId = fileIds[0] ?? null;
  const style = str(fd, "style");
  const staff = num(fd, "staff");
  const spec: CaseSpec = { rooms: (["ceo", "meeting", "pantry", "storage"] as const).filter((k) => fd.getAll("rooms").includes(k)) };
  if (staff != null && staff >= 1) spec.staff = Math.round(staff);
  const caseId = run(
    `INSERT INTO vendor_cases (vendor_id, title, summary, area_pyeong, duration, file_id, style, region, spec) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    vendor.id,
    title,
    str(fd, "summary"),
    num(fd, "areaPyeong"),
    str(fd, "duration"),
    fileId,
    STYLES.some((s) => s.id === style) ? style : "",
    str(fd, "region"),
    JSON.stringify(spec),
  );
  fileIds.forEach((id, i) => run(`INSERT INTO case_files (case_id, file_id, position) VALUES (?, ?, ?)`, caseId, id, i));
  refresh();
  return { ok: "시공 사례를 추가했습니다." };
}

export async function deleteVendorCase(caseId: number) {
  const user = await requireUser("vendor", "admin");
  const vendor = user.role === "vendor" ? getVendorByUser(user.id) : undefined;
  const row = user.role === "admin" ? get<{ id: number }>(`SELECT id FROM vendor_cases WHERE id = ?`, caseId) : get<{ id: number }>(`SELECT id FROM vendor_cases WHERE id = ? AND vendor_id = ?`, caseId, vendor?.id ?? -1);
  if (!row) return;
  const files = all<{ file_id: number }>(`SELECT file_id FROM case_files WHERE case_id = ?`, caseId);
  // 고객이 업체에 보낸 요청에 참고 사례로 들어간 사례면 사진 파일은 남긴다(요청 기록에 사례 정보가 복사되어 있다).
  const sent = !!get(`SELECT 1 AS ok FROM request_revisions WHERE snapshot LIKE ?`, `%"case_id":${caseId},%`);
  run(`DELETE FROM saved_cases WHERE case_id = ?`, caseId);
  run(`DELETE FROM project_refs WHERE case_id = ?`, caseId);
  run(`DELETE FROM case_files WHERE case_id = ?`, caseId);
  run(`DELETE FROM vendor_cases WHERE id = ?`, caseId);
  if (sent) for (const f of files) run(`UPDATE files SET deleted_at = datetime('now') WHERE id = ?`, f.file_id);
  else for (const f of files) await removeFile(f.file_id);
  refresh();
}

export async function submitQuote(assignmentId: number, _: FormState, fd: FormData): Promise<FormState> {
  const { user, vendor } = await vendorSession();
  if (vendor.status !== "approved") return { error: "운영자 승인 후 견적을 제출할 수 있습니다." };
  const assignment = get<{ id: number; project_id: number; version_id: number; vendor_id: number; status: string; withdrawn_at: string | null }>(
    `SELECT * FROM assignments WHERE id = ? AND vendor_id = ?`,
    assignmentId,
    vendor.id,
  );
  if (!assignment || assignment.withdrawn_at) return { error: "배정된 요청을 찾을 수 없습니다." };
  const project = getProject(assignment.project_id)!;
  if (project.requested_version_id !== assignment.version_id) return { error: "고객이 도면을 변경해 이 버전의 견적은 마감되었습니다." };
  if (["contracted", "closed"].includes(project.status)) return { error: "종료된 프로젝트입니다." };

  const items: QuoteItem[] = [];
  for (const c of quoteCategories(project.kind)) {
    const status = str(fd, `status_${c.key}`) as ItemStatus;
    if (!(status in ITEM_STATUS)) return { error: `${c.label}: 포함 여부를 선택해 주세요.` };
    const amount = num(fd, `amount_${c.key}`);
    if ((status === "included" || status === "separate") && !(amount != null && amount > 0))
      return { error: `${c.label}: 금액을 입력하거나, 확정할 수 없으면 '현장 확인 필요'를 선택해 주세요.` };
    items.push({ key: c.key, status, amount: status === "included" || status === "separate" ? Math.round(amount!) : null, spec: str(fd, `spec_${c.key}`) });
  }
  const vat = str(fd, "vat");
  if (vat !== "1" && vat !== "0") return { error: "부가세 포함 여부를 선택해 주세요." };
  const days = num(fd, "durationDays");
  if (!(days != null && days > 0)) return { error: "예상 공사 기간(일)을 입력해 주세요." };
  const start = str(fd, "startAvailable");
  if (!start) return { error: "착공 가능일을 입력해 주세요." };
  const extra = str(fd, "extraConditions");
  if (!extra) return { error: "추가비용이 발생하는 조건을 적어 주세요. 없으면 '없음'이라고 적어 주세요." };
  const furniture = items.find((it) => FURNITURE_KEYS.includes(it.key))?.status === "included" ? 1 : 0;
  // 설계 제안: 고객이 보낸 배치대로 시공할지, 고칠 점을 제안할지. 고객 배치가 있는 요청에서만 받는다.
  const hasLayout = !!getVersion(assignment.version_id)?.room;
  const designMode = str(fd, "designMode");
  const designNote = str(fd, "designNote").slice(0, 2000);
  if (hasLayout && designMode !== "as_is" && designMode !== "proposal") return { error: "설계 제안에서 ‘고객 배치대로 시공’ 또는 ‘수정 제안’을 골라 주세요." };
  const designFileError = checkFiles(fd, "designFiles", "drawing");
  if (designFileError) return { error: designFileError };
  const newFiles = fd.getAll("designFiles").filter((f) => f instanceof File && f.size > 0).length;
  const prevQuote = get<{ design_files: string }>(`SELECT design_files FROM quotes WHERE assignment_id = ?`, assignmentId);
  const keptFiles: number[] = prevQuote ? JSON.parse(prevQuote.design_files || "[]") : [];
  if (designMode === "proposal" && designNote.length < 10 && !newFiles && !keptFiles.length) return { error: "수정 제안은 바꾸고 싶은 점과 이유를 10자 이상 적거나 도면·이미지를 붙여 주세요." };
  if (keptFiles.length + newFiles > 10) return { error: "설계 제안 첨부는 10개까지 올릴 수 있습니다." };
  let designFiles = keptFiles;
  if (designMode === "proposal" && newFiles) {
    try {
      designFiles = [...keptFiles, ...(await saveFiles(fd, "designFiles", "drawing", user.id, project.id, "proposal"))];
    } catch (e) {
      return { error: (e as Error).message };
    }
  }

  const snapshot: QuoteSnapshot = {
    items,
    vat_included: Number(vat),
    duration_days: Math.round(days),
    start_available: start,
    extra_conditions: extra,
    furniture_included: furniture,
    note: str(fd, "note"),
    ...(hasLayout ? { design_mode: designMode, design_note: designMode === "proposal" ? designNote : "", design_files: designMode === "proposal" ? designFiles : [] } : {}),
  };
  // 제안은 지금 업체에 보여 주고 있는 요청 내용을 기준으로 한다.
  const basis = latestRevision(project.id, assignment.version_id);
  if (basis) snapshot.request_rev = basis.no;
  const existing = get<{ id: number }>(`SELECT id FROM quotes WHERE assignment_id = ?`, assignmentId);
  const last = existing ? get<{ no: number; snapshot: string }>(`SELECT no, snapshot FROM quote_revisions WHERE quote_id = ? ORDER BY no DESC LIMIT 1`, existing.id) : undefined;
  const changes = last ? diffSnapshots(JSON.parse(last.snapshot), snapshot) : [];
  if (existing && last && changes.length === 0) {
    run(`DELETE FROM quote_drafts WHERE assignment_id = ?`, assignmentId);
    refresh();
    return { ok: "제출한 제안과 달라진 내용이 없어 그대로 두었습니다." };
  }

  transaction(() => {
    let quoteId: number;
    if (existing) {
      quoteId = existing.id;
      run(
        `UPDATE quotes SET items = ?, vat_included = ?, duration_days = ?, start_available = ?, extra_conditions = ?, furniture_included = ?, note = ?, request_rev_id = ?, design_mode = ?, design_note = ?, design_files = ?, updated_at = datetime('now') WHERE id = ?`,
        JSON.stringify(items),
        snapshot.vat_included,
        snapshot.duration_days,
        start,
        extra,
        furniture,
        snapshot.note,
        basis?.id ?? null,
        snapshot.design_mode ?? "",
        snapshot.design_note ?? "",
        JSON.stringify(snapshot.design_files ?? []),
        quoteId,
      );
      log(project.id, user.id, `${vendor.company}이(가) 제안을 수정했습니다 (${(last?.no ?? 1) + 1}차 제출, 변경 ${changes.length}건).`);
    } else {
      quoteId = run(
        `INSERT INTO quotes (assignment_id, project_id, version_id, vendor_id, items, vat_included, duration_days, start_available, extra_conditions, furniture_included, note, request_rev_id, design_mode, design_note, design_files)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        assignmentId,
        project.id,
        assignment.version_id,
        vendor.id,
        JSON.stringify(items),
        snapshot.vat_included,
        snapshot.duration_days,
        start,
        extra,
        furniture,
        snapshot.note,
        basis?.id ?? null,
        snapshot.design_mode ?? "",
        snapshot.design_note ?? "",
        JSON.stringify(snapshot.design_files ?? []),
      );
      log(project.id, user.id, `${vendor.company}이(가) 제안을 제출했습니다.`);
    }
    // 제출할 때마다 그 시점의 내용을 한 벌 남긴다. 이전 제출본은 지우지 않는다.
    run(`INSERT INTO quote_revisions (quote_id, no, snapshot, created_by) VALUES (?, ?, ?, ?)`, quoteId, (last?.no ?? 0) + 1, JSON.stringify(snapshot), user.id);
    run(`DELETE FROM quote_drafts WHERE assignment_id = ?`, assignmentId);
    run(`UPDATE assignments SET status = 'quoted', accepted_at = coalesce(accepted_at, datetime('now')) WHERE id = ?`, assignmentId);
    if (project.status === "matching") touch(project.id, "quoted");
  });
  notify([project.customer_id], {
    projectId: project.id,
    title: existing ? `${vendor.company}이(가) 제안을 수정했습니다` : `${vendor.company}의 제안이 도착했습니다`,
    body: existing ? `달라진 점 ${changes.length}건: ${changes.slice(0, 2).join(" / ")}${changes.length > 2 ? " 외" : ""}` : "금액, 공사 범위, 기간을 비교해 보세요.",
    href: `/projects/${project.id}/quotes`,
    email: true,
  });
  if (!existing) notify(adminIds(), { projectId: project.id, title: `제안 도착: ${project.title}`, body: vendor.company, href: `/admin/projects/${project.id}` });
  refresh();
  return { ok: existing ? `수정한 제안을 제출했습니다. 이전 제출본은 이력에 남습니다.` : "제안을 제출했습니다. 고객이 비교 화면에서 확인합니다." };
}

/** 바뀐 요청 내용을 확인했고 제안은 그대로 둔다. 제출 이력에 기준 요청 내용만 바뀐 제출본을 남긴다. */
export async function keepQuoteForRevision(assignmentId: number) {
  const { user, vendor } = await vendorSession();
  const quote = get<{ id: number; project_id: number; version_id: number }>(`SELECT q.id, q.project_id, q.version_id FROM quotes q JOIN assignments a ON a.id = q.assignment_id WHERE a.id = ? AND a.vendor_id = ? AND a.withdrawn_at IS NULL`, assignmentId, vendor.id);
  if (!quote) return;
  const project = getProject(quote.project_id)!;
  if (project.requested_version_id !== quote.version_id || ["contracted", "closed"].includes(project.status)) return;
  const basis = latestRevision(project.id, quote.version_id);
  const last = get<{ no: number; snapshot: string }>(`SELECT no, snapshot FROM quote_revisions WHERE quote_id = ? ORDER BY no DESC LIMIT 1`, quote.id);
  if (!basis || !last) return;
  const snapshot: QuoteSnapshot = { ...JSON.parse(last.snapshot), request_rev: basis.no };
  transaction(() => {
    run(`UPDATE quotes SET request_rev_id = ?, updated_at = datetime('now') WHERE id = ?`, basis.id, quote.id);
    run(`INSERT INTO quote_revisions (quote_id, no, snapshot, created_by) VALUES (?, ?, ?, ?)`, quote.id, last.no + 1, JSON.stringify(snapshot), user.id);
  });
  log(project.id, user.id, `${vendor.company}이(가) 바뀐 요청 내용(r${basis.no})을 확인하고 제안을 그대로 유지했습니다.`);
  notify([project.customer_id], { projectId: project.id, title: `${vendor.company}이(가) 바뀐 요청 내용을 확인했습니다`, body: `제안은 그대로이며 요청 내용 r${basis.no} 기준으로 비교됩니다.`, href: `/projects/${project.id}/quotes`, email: true });
  refresh();
}

/** 쓰다 만 제안을 저장한다. 검증하지 않으며 고객에게 보이지 않는다. */
export async function saveQuoteDraft(assignmentId: number, fd: FormData): Promise<{ savedAt?: string; error?: string }> {
  const { vendor } = await vendorSession();
  const assignment = get<{ project_id: number; version_id: number; status: string }>(`SELECT project_id, version_id, status FROM assignments WHERE id = ? AND vendor_id = ?`, assignmentId, vendor.id);
  if (!assignment || assignment.status === "declined" || get(`SELECT 1 AS ok FROM assignments WHERE id = ? AND withdrawn_at IS NOT NULL`, assignmentId)) return { error: "저장할 수 없는 요청입니다." };
  const project = getProject(assignment.project_id)!;
  if (project.requested_version_id !== assignment.version_id || ["contracted", "closed"].includes(project.status)) return { error: "마감된 요청입니다." };
  const draft: QuoteDraft = {
    items: quoteCategories(project.kind).map((c) => {
      const status = str(fd, `status_${c.key}`) as ItemStatus;
      return { key: c.key, status: status in ITEM_STATUS ? status : "included", amount: num(fd, `amount_${c.key}`), spec: str(fd, `spec_${c.key}`) };
    }),
    vat: str(fd, "vat"),
    durationDays: str(fd, "durationDays"),
    startAvailable: str(fd, "startAvailable"),
    extraConditions: str(fd, "extraConditions"),
    note: str(fd, "note"),
    designMode: str(fd, "designMode"),
    designNote: str(fd, "designNote"),
  };
  run(
    `INSERT INTO quote_drafts (assignment_id, data) VALUES (?, ?) ON CONFLICT (assignment_id) DO UPDATE SET data = excluded.data, updated_at = datetime('now')`,
    assignmentId,
    JSON.stringify(draft),
  );
  // 입력 중에 화면이 다시 그려지지 않도록 여기서는 새로 고치지 않는다.
  return { savedAt: new Date().toISOString() };
}

export async function discardQuoteDraft(assignmentId: number) {
  const { vendor } = await vendorSession();
  if (!get(`SELECT 1 AS ok FROM assignments WHERE id = ? AND vendor_id = ?`, assignmentId, vendor.id)) return;
  run(`DELETE FROM quote_drafts WHERE assignment_id = ?`, assignmentId);
  refresh();
}

// ── 알림
export async function openNotification(id: number) {
  const user = await requireUser();
  const row = get<{ href: string }>(`SELECT href FROM notifications WHERE id = ? AND user_id = ?`, id, user.id);
  if (!row) return;
  run(`UPDATE notifications SET read_at = coalesce(read_at, datetime('now')) WHERE id = ?`, id);
  refresh();
  redirect(row.href);
}

export async function markAllNotificationsRead() {
  const user = await requireUser();
  run(`UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL`, user.id);
  refresh();
}

/** 참여 확정. 제안을 쓰기 전에 참여 의사를 먼저 알린다. */
/** 고객(또는 운영자): 업체 직접 참여 받기 켜고 끄기, 참여 상한 */
export async function setBidMode(projectId: number, _: FormState, fd: FormData): Promise<FormState> {
  const { user, project } = await ownedProject(projectId);
  if (["contracted", "closed", "visit"].includes(project.status)) return { error: "이미 상담·계약 단계라 바꿀 수 없습니다." };
  applyBidMode(projectId, fd);
  const after = getProject(projectId)!;
  if (after.bid_mode !== project.bid_mode || after.bid_cap !== project.bid_cap)
    log(projectId, user.id, after.bid_mode === "open" ? `업체 직접 참여를 받습니다 (최대 ${after.bid_cap}곳).` : "업체 직접 참여를 받지 않습니다 (운영자 배정만).");
  refresh();
  return { ok: after.bid_mode === "open" ? `업체 직접 참여를 받아요 (최대 ${after.bid_cap}곳).` : "운영자 배정으로만 받아요." };
}

/** 시공사: 공개 요청에 직접 참여한다. 참여 상한 안에서 먼저 참여한 순서로 받고, 참여하면 바로 제안을 작성한다. */
export async function joinOpenRequest(projectId: number): Promise<FormState> {
  const { user, vendor } = await vendorSession();
  const result = transaction(() => {
    const project = getProject(projectId);
    const blocker = joinBlocker(project, vendor);
    if (blocker) return { error: blocker };
    const id = run(
      `INSERT INTO assignments (project_id, version_id, vendor_id, source, accepted_at, quote_by) VALUES (?, ?, ?, 'self', datetime('now'), datetime('now', ?))`,
      projectId,
      project!.requested_version_id,
      vendor.id,
      `+${QUOTE_DAYS} days`,
    );
    if (project!.status === "requested") touch(projectId, "matching");
    log(projectId, user.id, `${vendor.company}이(가) 공개 요청에 직접 참여했습니다.`);
    return { id, project: project! };
  });
  if ("error" in result) return { error: result.error };
  notify([result.project.customer_id], {
    projectId,
    title: `${vendor.company}이(가) 요청에 참여했습니다`,
    body: "업체가 직접 참여해 제안을 작성하고 있습니다. 도착하면 다시 알려 드립니다.",
    href: `/projects/${projectId}`,
  });
  notify(adminIds(), { projectId, title: `직접 참여: ${vendor.company} → ${result.project.title}`, href: `/admin/projects/${projectId}` });
  refresh();
  redirect(`/vendor/requests/${result.id}`);
}

export async function acceptAssignment(assignmentId: number) {
  const { user, vendor } = await vendorSession();
  if (vendor.status !== "approved") return;
  const assignment = get<{ project_id: number; status: string; accepted_at: string | null; withdrawn_at: string | null }>(
    `SELECT project_id, status, accepted_at, withdrawn_at FROM assignments WHERE id = ? AND vendor_id = ?`,
    assignmentId,
    vendor.id,
  );
  if (!assignment || assignment.status !== "invited" || assignment.accepted_at || assignment.withdrawn_at) return;
  run(`UPDATE assignments SET accepted_at = datetime('now'), quote_by = datetime('now', ?) WHERE id = ?`, `+${QUOTE_DAYS} days`, assignmentId);
  log(assignment.project_id, user.id, `${vendor.company}이(가) 참여를 확정하고 제안을 준비합니다.`);
  notify([getProject(assignment.project_id)?.customer_id], {
    projectId: assignment.project_id,
    title: `${vendor.company}이(가) 참여를 확정했습니다`,
    body: "제안을 작성하고 있습니다. 도착하면 다시 알려 드립니다.",
    href: `/projects/${assignment.project_id}`,
  });
  refresh();
}

export async function declineAssignment(assignmentId: number) {
  const { user, vendor } = await vendorSession();
  const assignment = get<{ project_id: number; status: string; withdrawn_at: string | null }>(`SELECT project_id, status, withdrawn_at FROM assignments WHERE id = ? AND vendor_id = ?`, assignmentId, vendor.id);
  if (!assignment || assignment.status !== "invited" || assignment.withdrawn_at) return;
  run(`UPDATE assignments SET status = 'declined' WHERE id = ?`, assignmentId);
  log(assignment.project_id, user.id, `${vendor.company}이(가) 참여하지 않기로 했습니다.`);
  run(`DELETE FROM quote_drafts WHERE assignment_id = ?`, assignmentId);
  notify(adminIds(), {
    projectId: assignment.project_id,
    title: `${vendor.company}이(가) 참여하지 않기로 했습니다`,
    body: "다른 시공사를 배정할지 확인해 주세요.",
    href: `/admin/projects/${assignment.project_id}`,
    email: true,
  });
  refresh();
  redirect("/vendor");
}

export async function confirmVisit(visitId: number) {
  const { user, vendor } = await vendorSession();
  const visit = get<{ project_id: number; status: string }>(`SELECT project_id, status FROM visit_requests WHERE id = ? AND vendor_id = ?`, visitId, vendor.id);
  if (!visit || visit.status !== "requested") return;
  run(`UPDATE visit_requests SET status = 'confirmed' WHERE id = ?`, visitId);
  log(visit.project_id, user.id, `${vendor.company}이(가) 현장 방문 요청을 확인했습니다.`);
  notify([getProject(visit.project_id)?.customer_id], {
    projectId: visit.project_id,
    title: `${vendor.company}이(가) 방문 요청을 확인했습니다`,
    body: "일정 조율을 위해 시공사가 연락드립니다.",
    href: `/projects/${visit.project_id}/quotes`,
    email: true,
  });
  refresh();
}

// ── 운영자
export async function assignVendors(projectId: number, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser("admin");
  const project = getProject(projectId);
  if (!project?.requested_version_id) return { error: "견적 요청이 접수된 프로젝트가 아닙니다." };
  const ids = fd.getAll("vendor").map(Number).filter(Boolean);
  if (!ids.length) return { error: "배정할 업체를 선택해 주세요." };
  const approved = new Set(all<{ id: number }>(`SELECT id FROM vendors WHERE status = 'approved'`).map((v) => v.id));
  let added = 0;
  transaction(() => {
    for (const id of ids) {
      if (!approved.has(id)) continue;
      const exists = get<{ id: number; withdrawn_at: string | null }>(`SELECT id, withdrawn_at FROM assignments WHERE project_id = ? AND version_id = ? AND vendor_id = ?`, projectId, project.requested_version_id, id);
      if (exists && !exists.withdrawn_at) continue;
      let assignmentId: number;
      if (exists) {
        // 배정을 취소했던 업체를 다시 배정한다.
        assignmentId = exists.id;
        run(`UPDATE assignments SET withdrawn_at = NULL, status = 'invited', accepted_at = NULL, quote_by = NULL, reminded_at = NULL, respond_by = datetime('now', ?), created_at = datetime('now') WHERE id = ?`, `+${RESPOND_HOURS} hours`, assignmentId);
      } else
        assignmentId = run(`INSERT INTO assignments (project_id, version_id, vendor_id, respond_by) VALUES (?, ?, ?, datetime('now', ?))`, projectId, project.requested_version_id, id, `+${RESPOND_HOURS} hours`);
      notify([vendorUserId(id)], {
        projectId,
        title: `새 요청이 배정되었습니다: ${project.region}`,
        body: `요청 내용과 도면을 확인하고 ${RESPOND_HOURS}시간 안에 참여 여부를 알려 주세요.`,
        href: `/vendor/requests/${assignmentId}`,
        email: true,
      });
      added++;
    }
    if (added) {
      if (project.status === "requested") touch(projectId, "matching");
      log(projectId, user.id, `운영자가 업체 ${added}곳을 배정했습니다.`);
      notify([project.customer_id], { projectId, title: `시공사 ${added}곳이 요청을 받았습니다`, body: "참여를 확정하거나 제안이 도착하면 알려 드립니다.", href: `/projects/${projectId}` });
    }
  });
  refresh();
  return added ? { ok: `업체 ${added}곳을 배정했습니다.` } : { error: "이미 배정된 업체입니다." };
}

export async function adminSetStatus(projectId: number, fd: FormData) {
  const user = await requireUser("admin");
  const status = str(fd, "status");
  if (!["draft", "requested", "matching", "quoted", "visit", "contracted", "closed"].includes(status)) return;
  touch(projectId, status);
  const memo = str(fd, "memo");
  log(projectId, user.id, `운영자가 진행 상태를 변경했습니다${memo ? `: ${memo}` : "."}`);
  notify([getProject(projectId)?.customer_id], { projectId, title: "운영자가 진행 상태를 변경했습니다", body: memo, href: `/projects/${projectId}` });
  refresh();
}

export async function resolveChangeRequest(requestId: number, fd: FormData) {
  const user = await requireUser("admin");
  const row = get<{ project_id: number }>(`SELECT project_id FROM change_requests WHERE id = ?`, requestId);
  if (!row) return;
  run(`UPDATE change_requests SET status = 'done', reply = ?, resolved_at = datetime('now') WHERE id = ?`, str(fd, "reply"), requestId);
  log(row.project_id, user.id, "운영자가 수정 요청에 답변했습니다.");
  notify([getProject(row.project_id)?.customer_id], { projectId: row.project_id, title: "수정 요청에 답변이 달렸습니다", body: str(fd, "reply"), href: `/projects/${row.project_id}/plan` });
  refresh();
}

export async function recordOutcome(projectId: number, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser("admin");
  const result = str(fd, "result");
  if (result !== "contracted" && result !== "closed") return { error: "결과를 선택해 주세요." };
  const vendorId = num(fd, "vendorId");
  const amount = num(fd, "amount");
  if (result === "contracted" && !vendorId) return { error: "계약한 업체를 선택해 주세요." };
  const vendor = vendorId ? get<{ company: string }>(`SELECT company FROM vendors WHERE id = ?`, vendorId) : undefined;
  const outcome = { result, vendorId, company: vendor?.company ?? null, amount, date: str(fd, "date"), memo: str(fd, "memo") };
  run(`UPDATE projects SET outcome = ?, status = ?, updated_at = datetime('now') WHERE id = ?`, JSON.stringify(outcome), result, projectId);
  log(projectId, user.id, result === "contracted" ? `계약 결과를 기록했습니다 (${vendor?.company}).` : "계약 없이 종료로 기록했습니다.");
  const project = getProject(projectId);
  notify([project?.customer_id], { projectId, title: result === "contracted" ? `계약 결과가 기록되었습니다: ${vendor?.company}` : "요청이 종료되었습니다", href: `/projects/${projectId}` });
  for (const a of all<{ id: number; vendor_id: number }>(`SELECT id, vendor_id FROM assignments WHERE project_id = ? AND version_id = ? AND status = 'quoted'`, projectId, project?.requested_version_id ?? -1))
    notify([vendorUserId(a.vendor_id)], {
      projectId,
      title: result === "contracted" && a.vendor_id === vendorId ? `${project?.region} 요청: 계약 업체로 기록되었습니다` : `${project?.region} 요청이 종료되었습니다`,
      href: `/vendor/requests/${a.id}`,
    });
  refresh();
  return { ok: "기록했습니다." };
}

export async function setVendorStatus(vendorId: number, fd: FormData) {
  await requireUser("admin");
  const status = str(fd, "status");
  if (!["pending", "approved", "suspended"].includes(status)) return;
  run(`UPDATE vendors SET status = ? WHERE id = ?`, status, vendorId);
  if (status === "approved") notify([vendorUserId(vendorId)], { title: "파트너 입점이 승인되었습니다", body: "업체 목록에 공개되었고 요청을 배정받을 수 있습니다.", href: "/vendor" });
  refresh();
}

// ── 응답 지연 관리
/** 기한 안에 답하지 않은 업체에 다시 알린다. */
export async function remindAssignment(assignmentId: number) {
  const user = await requireUser("admin");
  const a = get<{ project_id: number; vendor_id: number; accepted_at: string | null; status: string; withdrawn_at: string | null }>(`SELECT project_id, vendor_id, accepted_at, status, withdrawn_at FROM assignments WHERE id = ?`, assignmentId);
  if (!a || a.withdrawn_at || a.status !== "invited") return;
  const project = getProject(a.project_id)!;
  run(`UPDATE assignments SET reminded_at = datetime('now') WHERE id = ?`, assignmentId);
  notify([vendorUserId(a.vendor_id)], {
    projectId: a.project_id,
    title: a.accepted_at ? `${project.region} 요청의 제안을 기다리고 있습니다` : `${project.region} 요청에 참여 여부를 알려 주세요`,
    body: "답이 없으면 운영자가 다른 업체로 바꿔 배정할 수 있습니다.",
    href: `/vendor/requests/${assignmentId}`,
    email: true,
  });
  const company = get<{ company: string }>(`SELECT company FROM vendors WHERE id = ?`, a.vendor_id)?.company;
  log(a.project_id, user.id, `운영자가 ${company}에 응답을 다시 요청했습니다.`);
  refresh();
}

/** 배정을 취소한다(무응답 등). 업체는 더 이상 이 요청의 자료를 볼 수 없다. 다른 업체는 배정 목록에서 새로 고른다. */
export async function withdrawAssignment(assignmentId: number, fd: FormData) {
  const user = await requireUser("admin");
  const a = get<{ project_id: number; vendor_id: number; status: string; withdrawn_at: string | null }>(`SELECT project_id, vendor_id, status, withdrawn_at FROM assignments WHERE id = ?`, assignmentId);
  if (!a || a.withdrawn_at || a.status === "quoted") return;
  run(`UPDATE assignments SET withdrawn_at = datetime('now') WHERE id = ?`, assignmentId);
  run(`DELETE FROM quote_drafts WHERE assignment_id = ?`, assignmentId);
  const project = getProject(a.project_id)!;
  const company = get<{ company: string }>(`SELECT company FROM vendors WHERE id = ?`, a.vendor_id)?.company;
  const reason = str(fd, "reason") || "기한 안에 응답이 없었습니다.";
  notify([vendorUserId(a.vendor_id)], { projectId: a.project_id, title: `${project.region} 요청 배정이 취소되었습니다`, body: reason, href: "/vendor", email: true });
  log(a.project_id, user.id, `운영자가 ${company} 배정을 취소했습니다: ${reason}`);
  refresh();
}

// ── 자료 확인
/** 운영자가 고객에게 필요한 자료를 요청한다. */
export async function createInfoRequest(projectId: number, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser("admin");
  const project = getProject(projectId);
  if (!project) return { error: "프로젝트를 찾을 수 없습니다." };
  const allowed: readonly string[] = project.kind === "home" ? HOME_INFO_ITEMS : INFO_ITEMS;
  const items = fd.getAll("item").map(String).filter((x) => allowed.includes(x));
  const message = str(fd, "message");
  if (!items.length && !message) return { error: "필요한 자료를 고르거나 내용을 적어 주세요." };
  run(`INSERT INTO info_requests (project_id, items, message, created_by) VALUES (?, ?, ?, ?)`, projectId, JSON.stringify(items), message, user.id);
  log(projectId, user.id, `운영자가 자료를 요청했습니다${items.length ? `: ${items.join(", ")}` : ""}.`);
  notify([project.customer_id], {
    projectId,
    title: "운영자가 자료를 요청했습니다",
    body: [items.join(", "), message].filter(Boolean).join(" — "),
    href: `/projects/${projectId}/info#info-requests`,
    email: true,
  });
  refresh();
  return { ok: "고객에게 자료를 요청했습니다." };
}

/** 고객이 자료를 올리거나 답을 적고 운영자에게 알린다. */
export async function answerInfoRequest(requestId: number, fd: FormData) {
  const row = get<{ project_id: number; status: string }>(`SELECT project_id, status FROM info_requests WHERE id = ?`, requestId);
  if (!row || row.status !== "open") return;
  const { user, project } = await ownedProject(row.project_id);
  const reply = str(fd, "reply");
  run(`UPDATE info_requests SET status = 'answered', reply = ?, answered_at = datetime('now') WHERE id = ?`, reply, requestId);
  log(project.id, user.id, "요청받은 자료를 보냈습니다.");
  notify(adminIds(), { projectId: project.id, title: `자료 답변: ${project.title}`, body: reply || "자료를 올렸습니다.", href: `/admin/projects/${project.id}`, email: true });
  refresh();
}

export async function closeInfoRequest(requestId: number) {
  const user = await requireUser("admin");
  const row = get<{ project_id: number }>(`SELECT project_id FROM info_requests WHERE id = ?`, requestId);
  if (!row) return;
  run(`UPDATE info_requests SET status = 'closed' WHERE id = ?`, requestId);
  log(row.project_id, user.id, "운영자가 자료 확인을 마쳤습니다.");
  refresh();
}

/** 운영자가 직접 해 본 요청 등을 테스트로 표시해 실제 요청과 나눠 본다. */
export async function setProjectTest(projectId: number, fd: FormData) {
  const user = await requireUser("admin");
  const on = str(fd, "test") === "1";
  run(`UPDATE projects SET is_test = ? WHERE id = ?`, on ? 1 : 0, projectId);
  log(projectId, user.id, on ? "운영자가 테스트 요청으로 표시했습니다." : "운영자가 실제 요청으로 표시했습니다.");
  refresh();
}

export async function retryEmailDelivery() {
  await requireUser("admin");
  await retryEmails();
  refresh();
}

// ── 비밀번호 재설정
const tokenHash = (t: string) => createHash("sha256").update(t).digest("hex");

export async function requestPasswordReset(_: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email").toLowerCase();
  const user = get<{ id: number; email: string }>(`SELECT id, email FROM users WHERE email = ?`, email);
  if (user) {
    const token = randomBytes(24).toString("base64url");
    run(`INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+1 hour'))`, tokenHash(token), user.id);
    queueEmail({ userId: user.id, to: user.email, subject: "비밀번호 재설정", body: "아래 버튼을 눌러 1시간 안에 새 비밀번호를 정해 주세요. 요청하지 않았다면 이 메일을 무시하세요.", link: `/reset/${token}` });
  }
  // 가입 여부를 알려 주지 않도록 같은 답을 한다.
  return { ok: "가입된 이메일이면 재설정 링크를 보냈습니다. 메일함을 확인해 주세요." };
}

export async function resetPassword(token: string, _: FormState, fd: FormData): Promise<FormState> {
  const row = get<{ user_id: number }>(`SELECT user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')`, tokenHash(token));
  if (!row) return { error: "링크가 만료되었거나 이미 사용되었습니다. 다시 요청해 주세요." };
  const password = str(fd, "password");
  if (password.length < 8) return { error: "비밀번호는 8자 이상이어야 합니다." };
  transaction(() => {
    run(`UPDATE users SET password_hash = ? WHERE id = ?`, hashPassword(password), row.user_id);
    run(`UPDATE password_resets SET used_at = datetime('now') WHERE token_hash = ?`, tokenHash(token));
    run(`DELETE FROM sessions WHERE user_id = ?`, row.user_id);
  });
  await createSession(row.user_id);
  const user = get<User>(`SELECT id, email, name, phone, role FROM users WHERE id = ?`, row.user_id)!;
  redirect(homeFor(user));
}

/** 운영자가 업체를 직접 등록한다. 업체 담당자에게 비밀번호를 정하는 링크를 메일로 보낸다(7일 유효). */
export async function createVendorByAdmin(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireUser("admin");
  const email = str(fd, "email").toLowerCase();
  const company = str(fd, "company");
  const name = str(fd, "name");
  if (!company || !name) return { error: "업체명과 담당자 이름을 입력해 주세요." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "이메일 형식을 확인해 주세요." };
  if (get(`SELECT 1 AS ok FROM users WHERE email = ?`, email)) return { error: "이미 가입된 이메일입니다." };
  const publish = checked(fd, "publish");
  const userId = transaction(() => {
    const id = run(`INSERT INTO users (email, password_hash, name, phone, role) VALUES (?, ?, ?, ?, 'vendor')`, email, hashPassword(randomBytes(24).toString("hex")), name, str(fd, "phone"));
    run(`INSERT INTO vendors (user_id, company, regions, specialties, status, fields) VALUES (?, ?, ?, ?, ?, ?)`, id, company, str(fd, "regions"), str(fd, "specialties"), publish ? "approved" : "pending", parseFields(fd));
    return id;
  });
  const token = randomBytes(24).toString("base64url");
  run(`INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+7 days'))`, tokenHash(token), userId);
  queueEmail({
    userId,
    to: email,
    subject: `${company} 파트너 계정이 만들어졌습니다`,
    body: `운영자(${admin.name})가 파트너 계정을 만들었습니다. 아래 버튼을 눌러 7일 안에 비밀번호를 정하면 요청을 받고 시공 사례를 관리할 수 있습니다.`,
    link: `/reset/${token}`,
  });
  refresh();
  return { ok: `${company} 계정을 만들고 비밀번호 설정 메일을 보냈습니다.` };
}

/** AI/registered plans are rebuilt from the server record, never from client-supplied geometry. */
export async function importFloorplan(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser("customer");
  if (fd.get("confirmed") !== "on") return { error: "평면과 실제 치수를 확인해 주세요." };
  const { ownedJob, ownedSelection, jobIsFresh, templateHouse } = await import("./floorplan/jobs");
  const {planSource}=await import("./floorplan/catalog");
  const { sourceHouse } = await import("./floorplan/reference");
  let id: number;
  try {
    id = transaction(() => {
      const jobId = Number(fd.get("job")), templateId = Number(fd.get("template"));
      if (!!jobId === !!templateId) throw new Error("인식한 도면이나 등록 도면을 하나 선택해 주세요.");
      const job = jobId ? ownedJob(jobId, user.id) : undefined;
      if (job?.status === "used" && job.accepted_project_id) return job.accepted_project_id;
      let house: HouseModel;
      let fileId: number | null = null;
      if (jobId) {
        if (!job || job.status !== "ready" || !job.result || !jobIsFresh(job)) throw new Error("내 도면 인식 결과를 찾지 못했거나 만료됐어요. 다시 인식해 주세요.");
        house = sourceHouse(JSON.parse(job.result), job.iw, job.ih, Number(fd.get("widthMm")), str(fd,"heightMm") ? Number(fd.get("heightMm")) : 2400, job.file_id ?? 0,job.source_id);
        fileId = job.file_id;
      } else {
        const template = get<import("./floorplan/jobs").PlanTemplate>("SELECT * FROM floorplan_templates WHERE id=? AND active=1", templateId);
        if (!template) throw new Error("이 등록 도면은 지금 사용할 수 없어요.");
        house = templateHouse(template);
      }
      const target = Number(fd.get("project")) || job?.project_id || null;
      if (job?.project_id && target !== job.project_id) throw new Error("도면 인식을 시작한 공간에 저장해 주세요.");
      let projectId: number;
      let current: ReturnType<typeof getVersion>;
      if (target) {
        const p = getOwnedProject(target, user);
        current = p ? getVersion(p.current_version_id) : undefined;
        if (!p || p.kind !== "home" || !current?.home || ["contracted", "closed"].includes(p.status)) throw new Error("내 주거 공간에만 평면을 가져올 수 있어요.");
        if (current.house) throw new Error("이미 집 전체 평면이 있어요. 기존 평면을 편집하거나 먼저 지워 주세요.");
        projectId = p.id;
      } else {
        const title = str(fd, "title").slice(0, 60) || "우리 집";
        const selection=job?.selection_id?ownedSelection(job.selection_id,user.id):undefined;
        const source=job?.source_id?planSource(job.source_id):undefined;
        const privateAddress=source&&selection&&selection.source_id===source.id?[source.address,selection.dong?`${selection.dong.replace(/동$/,"")}동`:"",selection.ho?`${selection.ho.replace(/호$/,"")}호`:""].filter(Boolean).join(" "):"";
        projectId = run("INSERT INTO projects(customer_id,title,region,address,kind) VALUES(?,?,?,?,'home')", user.id, title, source?source.address.split(" ").slice(0,2).join(" "):str(fd,"region").slice(0,60),privateAddress);
      }
      const home: HomeInput = current?.home ?? { kind: "home", homeType: Object.hasOwn(HOME_TYPES,str(fd,"homeType")) ? str(fd,"homeType") as HomeInput["homeType"] : "apartment", scope: "undecided", works: [], spaces: [], area: null, areaUnit: "m2", areaBasis: "unknown", rooms: null, baths: null, builtYear: null, occupancy: null, rules: "" };
      const saved = { ...house, rev: nextHouseRev(projectId), saved_at: now() };
      insertHomeVersion(projectId, user.id, home, current?.rooms ?? [], current?.id ?? null, `집 전체 평면 가져오기 (${house.provenance?.label})`, saved);
      if (fileId) run("UPDATE files SET project_id=?,kind='drawing',category='underlay' WHERE id=? AND owner_id=?", projectId, fileId, user.id);
      if (jobId) run("UPDATE floorplan_jobs SET status='used',accepted_project_id=? WHERE id=? AND owner_id=?", projectId, jobId, user.id);
      log(projectId,user.id,`평면을 가져왔습니다 (${house.provenance?.label} · 실제 치수·구조는 업체 확인 전).`);
      return projectId;
    });
  } catch(e) { return { error: e instanceof Error ? e.message : "평면을 저장하지 못했어요." }; }
  refresh();
  redirect(`/projects/${id}/house/edit`);
}
