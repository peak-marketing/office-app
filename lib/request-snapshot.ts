import { INTAKE_MODES, budgetText, type IntakeKey, type SpaceKind } from "./constants";
import { diffHome, type HomeInput } from "./home";
import { describeHomeRoom, resizedLines, type HomeRoom } from "./space/home-room";
import { diffHouse, type HouseModel } from "./space/house";
import { all, get, run } from "./db";
import { getFiles, getProjectRefs, getVersion, type CaseCard, type Project, type ProjectRef, type Version } from "./data";
import { getStyle } from "./styles";
import { diffPlacement } from "./space/placement";
import { describeRoom } from "./space/room";
import type { PlacedItem, RoomModel } from "./space/types";
import { projectPostRefs, type PostReference } from "./post-refs";
import { sourceLabel } from "./space/view";

// 업체에 보낸 요청 내용. 보낼 때마다 그때의 조건·자료·참고 사례를 통째로 남기고, 이전 것은 지우지 않는다.
// 시공사 화면은 살아 있는 프로젝트가 아니라 이 기록을 보여 준다. 상세 주소·연락처·프로젝트 이름은 넣지 않는다.

export interface RequestSnapshot {
  region: string;
  budget_min: number | null;
  budget_max: number | null;
  desired_start: string;
  desired_movein: string;
  notes: string;
  work_scope: string;
  version: { id: number; no: number; selected_option: string; selected_option_title: string; selected_style: string; layout_status: string; intake: IntakeKey | null; source?: string };
  refs: { case_id: number; file_id: number | null; note: string; c: CaseCard }[];
  postRefs?: PostReference[];
  files: { id: number; kind: string; category: string; original_name: string }[];
  /** 내 공간 버전이면 업체에 보낸 배치 그대로(실제 구조, 시작 배치, 가구 위치) */
  layout?: SentLayout;
  /** 공간 종류. 주거 1차 이전 기록은 없음(사무실) */
  kind?: SpaceKind;
  /** 집 요청이면 보낼 때의 집 정보 */
  home?: HomeInput;
  /** 집 요청이면 보낼 때의 방 한 칸 배치들(방별 버전 rev 포함). 방마다 따로 그린 참고 배치다. */
  rooms?: HomeRoom[];
  /** 집 요청이면 보낼 때의 집 전체 평면(평면 버전 rev 포함). 없으면 null, 이 기능 이전 기록은 키가 없다. */
  house?: HouseModel | null;
}

export interface SentLayout {
  room: RoomModel;
  /** 칸막이·방을 가져온 자동 배치안 id. 빈 공간이면 "" */
  start: string;
  start_title: string;
  items: PlacedItem[];
  staff: number;
  furniture_included: boolean;
}

export interface RequestRevision {
  id: number;
  project_id: number;
  no: number;
  version_id: number;
  snapshot: RequestSnapshot;
  changes: string[];
  created_at: string;
}

export function buildSnapshot(project: Project, version: Version): RequestSnapshot {
  return {
    region: project.region,
    budget_min: project.budget_min,
    budget_max: project.budget_max,
    desired_start: project.desired_start,
    desired_movein: project.desired_movein,
    notes: project.notes,
    work_scope: project.work_scope ?? "",
    version: {
      id: version.id,
      no: version.no,
      selected_option: version.selected_option,
      selected_option_title: version.result.options.find((o) => o.id === version.selected_option)?.title ?? "",
      selected_style: version.selected_style,
      layout_status: version.layout_status,
      intake: version.input.intake ?? null,
      source: version.source,
    },
    refs: getProjectRefs(project.id).map((r) => ({ case_id: r.case_id, file_id: r.file_id, note: r.note, c: r.c })),
    postRefs: projectPostRefs(project.id),
    files: getFiles(project.id).map((f) => ({ id: f.id, kind: f.kind, category: f.category, original_name: f.original_name })),
    kind: project.kind ?? "office",
    ...(version.home ? { home: version.home, rooms: version.rooms, house: version.house ?? null } : {}),
    ...(version.room && version.placement
      ? {
          layout: {
            room: version.room,
            start: version.selected_option,
            start_title: version.result.options.find((o) => o.id === version.selected_option)?.title ?? "빈 공간",
            items: version.placement.items,
            staff: version.input.staff,
            furniture_included: version.input.furnitureIncluded,
          },
        }
      : {}),
  };
}

/** 배치가 바뀐 점. 업체가 읽는 문장 */
function diffLayout(a: SentLayout, b: SentLayout): string[] {
  const out: string[] = [];
  const ra = describeRoom(a.room);
  const rb = describeRoom(b.room);
  for (const [label, key] of [["실내 치수", "size"], ["출입문", "entrance"], ["창", "windows"], ["기둥", "pillars"], ["천장 높이", "height"]] as const)
    if (ra[key] !== rb[key]) out.push(`${label}: ${ra[key]} → ${rb[key]}`);
  if (a.start !== b.start) out.push(`시작 배치: ${a.start_title} → ${b.start_title} (칸막이·방 구성이 바뀜)`);
  if (a.staff !== b.staff) out.push(`요청 좌석: ${a.staff}석 → ${b.staff}석`);
  if (a.furniture_included !== b.furniture_included) out.push(`가구 견적: ${a.furniture_included ? "포함" : "별도"} → ${b.furniture_included ? "포함" : "별도"}`);
  const d = diffPlacement(a.items, b.items);
  if (d.lines.length) {
    out.push(`가구 배치: ${d.summary}`);
    out.push(...d.lines.slice(0, 8));
    if (d.lines.length > 8) out.push(`가구 외 ${d.lines.length - 8}건`);
  }
  return out;
}

/** 방 한 칸 배치들이 바뀐 점. 방은 id로 짝을 짓는다. */
function diffRooms(a: HomeRoom[], b: HomeRoom[]): string[] {
  const out: string[] = [];
  for (const r of b) {
    const before = a.find((x) => x.id === r.id);
    if (!before) {
      out.push(`방 추가: ${r.name} (배치 ${r.rev})`);
      continue;
    }
    if (before.rev === r.rev && before.name === r.name) continue;
    if (before.rev === r.rev) {
      out.push(`방 이름: ${before.name} → ${r.name}`);
      continue;
    }
    out.push(`방 배치 수정: ${before.name === r.name ? r.name : `${before.name} → ${r.name}`} (배치 ${before.rev} → ${r.rev})`);
    const ra = describeHomeRoom(before.room);
    const rb = describeHomeRoom(r.room);
    for (const [label, k] of [["치수", "size"], ["방문", "entrance"], ["다른 문 자리", "doors"], ["창", "windows"], ["고정 구조물", "fixed"], ["천장 높이", "height"]] as const)
      if (ra[k] !== rb[k]) out.push(`  ${r.name} ${label}: ${ra[k]} → ${rb[k]}`);
    const d = diffPlacement(before.items, r.items);
    const sized = resizedLines(before.items, r.items);
    if (d.lines.length || sized.length) out.push(`  ${r.name} 가구: ${[d.summary, sized.length ? `크기 조절 ${sized.length}` : ""].filter(Boolean).join(" · ")}`);
  }
  for (const r of a) if (!b.some((x) => x.id === r.id)) out.push(`방 삭제: ${r.name}`);
  return out;
}

const fileLabel = (f: RequestSnapshot["files"][number]) => `${f.category === "sketch" ? "손그림" : f.kind === "photo" ? "사진" : "도면"} ${f.original_name}`;
const refLabel = (r: RequestSnapshot["refs"][number]) => `‘${r.c.title}’${r.c.style ? `(${getStyle(r.c.style).name})` : ""}`;
const short = (t: string) => (t.length > 60 ? `${t.slice(0, 60)}…` : t) || "없음";

/** 업체가 읽을 문장으로 두 요청 내용의 차이를 돌려준다. */
export function diffRequest(a: RequestSnapshot, b: RequestSnapshot): string[] {
  const out: string[] = [];
  if (a.home && b.home) {
    out.push(...diffHome(a.home, b.home));
    out.push(...diffRooms(a.rooms ?? [], b.rooms ?? []));
    out.push(...diffHouse(a.house ?? null, b.house ?? null));
  } else if (a.version.id !== b.version.id) {
    if (a.layout && b.layout) {
      const name = (s: RequestSnapshot) => `버전 ${s.version.no}${sourceLabel(s.version.source ?? "") ? ` (${sourceLabel(s.version.source ?? "")})` : ""}`;
      out.push(`기준 배치: ${name(a)} → ${name(b)}`);
      out.push(...diffLayout(a.layout, b.layout));
      if (a.version.selected_style !== b.version.selected_style) out.push(`분위기: ${getStyle(a.version.selected_style).name} → ${getStyle(b.version.selected_style).name}`);
    } else {
      const desc = (s: RequestSnapshot) => (s.version.layout_status === "ok" ? `v${s.version.no} ${s.version.selected_option_title} · ${getStyle(s.version.selected_style).name}` : `v${s.version.no} 배치안 없음`);
      out.push(`기준 도면: ${desc(a)} → ${desc(b)}`);
    }
    if (a.version.intake !== b.version.intake && b.version.intake) out.push(`가진 자료: ${a.version.intake ? INTAKE_MODES[a.version.intake].label : "—"} → ${INTAKE_MODES[b.version.intake].label}`);
  }
  if (a.region !== b.region) out.push(`지역: ${a.region} → ${b.region}`);
  const budgetA = budgetText(a.budget_min, a.budget_max);
  const budgetB = budgetText(b.budget_min, b.budget_max);
  if (budgetA !== budgetB) out.push(`예산: ${budgetA} → ${budgetB}`);
  if (a.desired_start !== b.desired_start) out.push(`희망 착공일: ${a.desired_start || "미정"} → ${b.desired_start || "미정"}`);
  if (a.desired_movein !== b.desired_movein) out.push(`희망 입주일: ${a.desired_movein || "미정"} → ${b.desired_movein || "미정"}`);
  if (a.work_scope !== b.work_scope) out.push(`원하는 공사 내용: ${short(b.work_scope)}`);
  if (a.notes !== b.notes) out.push(`기타 요청: ${short(b.notes)}`);
  for (const r of b.refs) {
    const before = a.refs.find((x) => x.case_id === r.case_id);
    if (!before) out.push(`참고 사례 추가: ${refLabel(r)}`);
    else {
      if (before.file_id !== r.file_id) out.push(`참고 사례 ${refLabel(r)}: 고른 사진이 바뀌었습니다`);
      if (before.note !== r.note) out.push(`참고 사례 ${refLabel(r)}: 마음에 든 점 “${short(r.note)}”`);
    }
  }
  for (const r of a.refs) if (!b.refs.some((x) => x.case_id === r.case_id)) out.push(`참고 사례 제외: ${refLabel(r)}`);
  for (const r of b.postRefs ?? []) if (!(a.postRefs ?? []).some(x => x.postId === r.postId && x.photoId === r.photoId)) out.push(`참고 커뮤니티 공간 추가: ‘${r.title}’`);
  for (const r of a.postRefs ?? []) if (!(b.postRefs ?? []).some(x => x.postId === r.postId && x.photoId === r.photoId)) out.push(`참고 커뮤니티 공간 제외: ‘${r.title}’`);
  for (const f of b.files) if (!a.files.some((x) => x.id === f.id)) out.push(`자료 추가: ${fileLabel(f)}`);
  for (const f of a.files) if (!b.files.some((x) => x.id === f.id)) out.push(`자료 삭제: ${fileLabel(f)}`);
  return out;
}

type Row = Omit<RequestRevision, "snapshot" | "changes"> & { snapshot: string; changes: string };
const parse = (r: Row): RequestRevision => ({ ...r, snapshot: JSON.parse(r.snapshot), changes: JSON.parse(r.changes) });

/** 보낸 요청 내용 전체. 오래된 것부터. */
export const getRequestRevisions = (projectId: number) => all<Row>(`SELECT * FROM request_revisions WHERE project_id = ? ORDER BY no`, projectId).map(parse);

export function getRequestRevision(id: number | null | undefined) {
  if (!id) return undefined;
  const row = get<Row>(`SELECT * FROM request_revisions WHERE id = ?`, id);
  return row ? parse(row) : undefined;
}

/** 이 도면 버전으로 마지막에 보낸 요청 내용 */
export function latestRevision(projectId: number, versionId: number | null | undefined) {
  if (!versionId) return undefined;
  const row = get<Row>(`SELECT * FROM request_revisions WHERE project_id = ? AND version_id = ? ORDER BY no DESC LIMIT 1`, projectId, versionId);
  return row ? parse(row) : undefined;
}

/** 마지막으로 보낸 요청 내용(도면 버전과 상관없이) */
export function lastSentRevision(projectId: number) {
  const row = get<Row>(`SELECT * FROM request_revisions WHERE project_id = ? ORDER BY no DESC LIMIT 1`, projectId);
  return row ? parse(row) : undefined;
}

/**
 * 고객이 바꿨지만 아직 업체에 보내지 않은 내용. 요청 전이면 빈 목록.
 * 지금 배치(현재 버전)가 업체에 보낸 배치와 다르면 그 차이도 함께 센다.
 */
export function pendingChanges(project: Project): string[] {
  if (!project.requested_version_id) return [];
  const version = getVersion(project.current_version_id ?? project.requested_version_id);
  const sent = lastSentRevision(project.id);
  if (!version || !sent) return [];
  return diffRequest(sent.snapshot, buildSnapshot(project, version));
}

/** 지금 내용을 새 요청 내용으로 남긴다. 직전 요청과의 차이를 함께 저장한다. */
export function recordRevision(project: Project, version: Version, userId: number) {
  const snapshot = buildSnapshot(project, version);
  const prev = get<Row>(`SELECT * FROM request_revisions WHERE project_id = ? ORDER BY no DESC LIMIT 1`, project.id);
  const changes = prev ? diffRequest(parse(prev).snapshot, snapshot) : [];
  const no = (prev?.no ?? 0) + 1;
  const id = run(`INSERT INTO request_revisions (project_id, no, version_id, snapshot, changes, created_by) VALUES (?, ?, ?, ?, ?, ?)`, project.id, no, version.id, JSON.stringify(snapshot), JSON.stringify(changes), userId);
  return { id, no, changes };
}

/** 기록에 남은 파일은 실제로 지우지 않는다. */
export const fileInRevisions = (projectId: number, fileId: number) =>
  getRequestRevisions(projectId).some((r) => r.snapshot.files.some((f) => f.id === fileId) || r.snapshot.refs.some((x) => x.file_id === fileId || x.c.photos.includes(fileId)) || r.snapshot.postRefs?.some(x=>x.fileId===fileId));

/** 시공사 화면에서 요청 내용을 프로젝트처럼 쓸 수 있게 겹친다. 주소·이름은 원래 프로젝트 값을 두되 화면에서 가린다. */
export function projectAsSent(project: Project, snap: RequestSnapshot): Project {
  return { ...project, region: snap.region, budget_min: snap.budget_min, budget_max: snap.budget_max, desired_start: snap.desired_start, desired_movein: snap.desired_movein, notes: snap.notes, work_scope: snap.work_scope };
}

export const refsAsSent = (projectId: number, snap: RequestSnapshot): ProjectRef[] => snap.refs.map((r, i) => ({ id: -(i + 1), project_id: projectId, case_id: r.case_id, file_id: r.file_id, note: r.note, created_at: "", c: r.c }));
