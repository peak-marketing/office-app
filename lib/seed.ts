import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { generateLayout } from "./layout/generate";
import type { LayoutInput } from "./layout/types";
import { hashPassword } from "./password";
import { EXAMPLE_QUOTES, exampleItems } from "./example-quotes";
import { SEED_CASES } from "./seed-cases";
import { addShopExamples } from "./seed-shop";
import { HOME_SEED_CASES, seedEdits } from "./seed-home-cases";
import { getProject, getVersion } from "./data";
import { recordRevision } from "./request-snapshot";
import { placementFromOption } from "./space/placement";
import { roomToInput } from "./space/room";
import type { RoomModel } from "./space/types";

// 빈 DB에 시연용 계정과 예시 데이터를 넣는다. SEED_DEMO=0 이면 건너뛴다.
export const DEMO_PASSWORD = "demo1234";

/** 예시 업체(시연 계정) 이름. 사례 데이터의 vendor 번호가 이 순서를 가리킨다. */
export const DEMO_VENDOR_COMPANIES = ["[예시] 스튜디오 온결", "[예시] 모아공간", "[예시] 라인앤폼"];

/**
 * 집 방 한 칸 3D 예시(5건)를 넣는다. 새 데이터의 시연 데이터와 기존 데이터의 주거 준비(npm run data:home-setup)가 함께 쓴다.
 * 이미 있는 예시(같은 제목)는 건너뛰고, 예시 업체(시연 계정)가 없으면 넣지 않는다. 예시를 맡은 예시 업체에는 시공 분야 ‘주거’를 더한다.
 * 실제 업체·실제 요청·기존 사례는 건드리지 않는다. 스타일은 정하지 않는다.
 */
export function addHomeExamples(conn: DatabaseSync, uploadDir: string, dryRun = false) {
  const insert = (sql: string, ...params: (string | number | null)[]) => Number(conn.prepare(sql).run(...params).lastInsertRowid);
  const assetDir = path.join(process.cwd(), "seed-assets");
  const out = { added: [] as string[], existing: [] as string[], skipped: [] as string[], vendorsUpdated: [] as string[] };
  const vendorOf = (i: number) =>
    conn.prepare(`SELECT v.id, v.user_id, v.fields, v.company FROM vendors v JOIN users u ON u.id = v.user_id WHERE v.company = ? AND u.is_demo = 1 ORDER BY v.id LIMIT 1`).get(DEMO_VENDOR_COMPANIES[i]) as
      | { id: number; user_id: number; fields: string; company: string }
      | undefined;
  for (const i of [...new Set(HOME_SEED_CASES.map((c) => c.vendor))]) {
    const v = vendorOf(i);
    if (v && !(v.fields || "office").split(",").includes("home")) {
      out.vendorsUpdated.push(v.company);
      if (!dryRun) conn.prepare(`UPDATE vendors SET fields = ? WHERE id = ?`).run([...(v.fields || "office").split(","), "home"].join(","), v.id);
    }
  }
  for (const c of HOME_SEED_CASES) {
    if (conn.prepare(`SELECT 1 AS ok FROM vendor_cases WHERE title = ?`).get(c.title)) {
      out.existing.push(c.code);
      continue;
    }
    const v = vendorOf(c.vendor);
    if (!v) {
      out.skipped.push(`${c.code}(예시 업체 ${DEMO_VENDOR_COMPANIES[c.vendor]} 없음)`);
      continue;
    }
    out.added.push(c.code);
    if (dryRun) continue;
    const names = fs.existsSync(assetDir) ? fs.readdirSync(assetDir).filter((n) => n.startsWith(`${c.code}-`) && n.endsWith(".jpg")) : [];
    const ordered = [...names.filter((n) => /-e\d+\.jpg$/.test(n)).sort(), ...names.filter((n) => n.endsWith("-iso.jpg"))];
    const fileIds = ordered.map((name) => {
      const stored = `seed-${name}`;
      fs.mkdirSync(uploadDir, { recursive: true });
      fs.copyFileSync(path.join(assetDir, name), path.join(uploadDir, stored));
      return insert(`INSERT INTO files (owner_id, project_id, kind, original_name, stored_name, mime, size) VALUES (?, NULL, 'case', ?, ?, 'image/jpeg', ?)`, v.user_id, name, stored, fs.statSync(path.join(assetDir, name)).size);
    });
    const cid = insert(
      `INSERT INTO vendor_cases (vendor_id, title, summary, area_pyeong, duration, file_id, is_example, style, region, spec) VALUES (?, ?, ?, ?, '', ?, 1, '', ?, ?)`,
      v.id,
      c.title,
      c.summary,
      c.area,
      fileIds[0] ?? null,
      c.region,
      JSON.stringify({ kind: "home", category: "주거", homeType: c.homeType, homeRoom: { name: c.name, room: c.room, edits: seedEdits(c) } }),
    );
    fileIds.forEach((id, i) => insert(`INSERT INTO case_files (case_id, file_id, position) VALUES (?, ?, ?)`, cid, id, i));
  }
  return out;
}

export function seed(conn: DatabaseSync, uploadDir: string) {
  const insert = (sql: string, ...params: (string | number | null)[]) => Number(conn.prepare(sql).run(...params).lastInsertRowid);
  const hash = hashPassword(DEMO_PASSWORD);
  const user = (email: string, name: string, role: string, phone = "") =>
    insert(`INSERT INTO users (email, password_hash, name, phone, role, is_demo) VALUES (?, ?, ?, ?, ?, 1)`, email, hash, name, phone, role);

  const admin = user("admin@demo.kr", "운영자", "admin");
  const customer = user("customer@demo.kr", "김고객", "customer", "010-0000-0000");

  // 사례 사진은 seed-assets/ 의 예시 3D 이미지를 업로드 폴더로 복사해 쓴다.
  const vendorSeeds = [
    { email: "vendor1@demo.kr", company: DEMO_VENDOR_COMPANIES[0], intro: "20~50평 소형 사무실 설계·시공을 주로 합니다. 설계 담당자가 현장까지 직접 관리합니다.", regions: "서울 전역, 경기 남부", specialties: "사무실, 유리 칸막이, 맞춤 가구", years: 9, fields: "office" },
    { email: "vendor2@demo.kr", company: DEMO_VENDOR_COMPANIES[1], intro: "철거부터 가구 납품까지 한 번에 진행하는 시공 중심 업체입니다.", regions: "서울 동부, 경기 동부", specialties: "사무실, 주거 리모델링, 전기·통신, 빠른 공기", years: 14, fields: "office,home" },
    { email: "vendor3@demo.kr", company: DEMO_VENDOR_COMPANIES[2], intro: "설계 전문 스튜디오입니다. 브랜드 분위기에 맞춘 마감 제안을 강점으로 합니다.", regions: "서울 전역", specialties: "사무실, 주거 인테리어, 조명 계획", years: 6, fields: "office,home" },
  ];

  const assetDir = path.join(process.cwd(), "seed-assets");
  const addPhoto = (ownerId: number, name: string) => {
    const src = path.join(assetDir, name);
    if (!fs.existsSync(src)) return null;
    const stored = `seed-${name}`;
    fs.mkdirSync(uploadDir, { recursive: true });
    fs.copyFileSync(src, path.join(uploadDir, stored));
    return insert(
      `INSERT INTO files (owner_id, project_id, kind, original_name, stored_name, mime, size) VALUES (?, NULL, 'case', ?, ?, 'image/jpeg', ?)`,
      ownerId,
      name,
      stored,
      fs.statSync(src).size,
    );
  };

  const vendorIds: number[] = [];
  const vendorUsers: number[] = [];
  for (const v of vendorSeeds) {
    const uid = user(v.email, v.company.replace("[예시] ", "") + " 담당자", "vendor", "02-000-0000");
    vendorUsers.push(uid);
    vendorIds.push(
      insert(`INSERT INTO vendors (user_id, company, intro, regions, specialties, years, status, fields) VALUES (?, ?, ?, ?, ?, ?, 'approved', ?)`, uid, v.company, v.intro, v.regions, v.specialties, v.years, v.fields),
    );
  }
  const caseIds = new Map<string, number>();
  SEED_CASES.forEach((c) => {
    // 눈높이 3D(e1, e2, …)를 앞에, 입체 배치도(iso)를 맨 뒤에 둔다. 모두 같은 배치 데이터로 그린 3D 제안 예시다.
    const names = fs.existsSync(assetDir) ? fs.readdirSync(assetDir).filter((n) => n.startsWith(`${c.code}-`) && n.endsWith(".jpg")) : [];
    const ordered = [...names.filter((n) => /-e\d+\.jpg$/.test(n)).sort(), ...names.filter((n) => n.endsWith("-iso.jpg"))];
    const fileIds = ordered.map((n) => addPhoto(vendorUsers[c.vendor], n)).filter((id): id is number => id != null);
    const cid = insert(
      `INSERT INTO vendor_cases (vendor_id, title, summary, area_pyeong, duration, file_id, is_example, style, region, spec) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      vendorIds[c.vendor],
      c.title,
      c.summary,
      c.area,
      c.duration,
      fileIds[0] ?? null,
      c.style,
      c.region,
      JSON.stringify({ staff: c.staff, rooms: c.rooms, meetingSeats: c.meetingSeats, category: c.category, layout: c.layout, entrance: c.entrance ?? "right" }),
    );
    caseIds.set(c.code, cid);
    fileIds.forEach((id, i) => insert(`INSERT INTO case_files (case_id, file_id, position) VALUES (?, ?, ?)`, cid, id, i));
  });

  // 예시 프로젝트: 실제 치수로 만든 내 공간 + 견적 2건이 도착한 상태
  const room: RoomModel = {
    shape: "rect",
    width: 11,
    depth: 9,
    height: null,
    entrance: { at: 9, width: 1.2 },
    windows: [
      { wall: "rear", at: 0.45, width: 2.4 },
      { wall: "rear", at: 3.85, width: 3.3 },
      { wall: "rear", at: 8.15, width: 2.4 },
    ],
    pillars: [],
    source: "dims",
    areaHint: 30,
  };
  const input: LayoutInput = roomToInput(room, { staff: 8, ceo: true, meeting: true, meetingSeats: 6, pantry: true, storage: false, priority: "visitor", furnitureIncluded: true, mood: "warm", siteNotes: "", reuseFurniture: "" });
  const result = generateLayout(input);
  const startId = result.recommended ?? result.options[0]?.id ?? "";
  const placement = placementFromOption(result.options.find((o) => o.id === startId)!) ?? { items: [] };
  const pid = insert(
    `INSERT INTO projects (customer_id, title, region, address, status, budget_min, budget_max, desired_start, desired_movein, notes)
     VALUES (?, ?, ?, ?, 'quoted', ?, ?, ?, ?, ?)`,
    customer,
    "[예시] 성수동 30평 사무실",
    "서울 성동구",
    "서울 성동구 예시로 12, 5층",
    4000,
    6000,
    "2026-11-02",
    "2026-12-01",
    "전화 통화가 잦아 회의실 차음이 중요합니다.",
  );
  const vid = insert(
    `INSERT INTO versions (project_id, no, input, result, layout_status, selected_option, created_by, room, placement, source) VALUES (?, 1, ?, ?, 'ok', ?, ?, ?, ?, 'auto')`,
    pid,
    JSON.stringify(input),
    JSON.stringify(result),
    startId,
    customer,
    JSON.stringify(room),
    JSON.stringify(placement),
  );
  // 저장한 사례와 관심 업체, 요청서에 연결한 참고 사례
  for (const code of ["s02", "s11", "s01"]) insert(`INSERT INTO saved_cases (user_id, case_id) VALUES (?, ?)`, customer, caseIds.get(code)!);
  insert(`INSERT INTO favorites (user_id, vendor_id) VALUES (?, ?)`, customer, vendorIds[0]);
  const refCase = caseIds.get("s02")!;
  const refPhoto = (conn.prepare(`SELECT file_id FROM case_files WHERE case_id = ? ORDER BY position LIMIT 1 OFFSET 1`).get(refCase) as { file_id: number } | undefined)?.file_id ?? null;
  insert(`INSERT INTO project_refs (project_id, case_id, file_id, note) VALUES (?, ?, ?, ?)`, pid, refCase, refPhoto, "출입구 옆 회의실과 대기 공간 구성, 오크 톤 마감");
  // 업체에 보낸 요청 내용 r1
  const revId = recordRevision(getProject(pid)!, getVersion(vid)!, customer).id;
  conn.prepare(`UPDATE projects SET current_version_id = ?, requested_version_id = ? WHERE id = ?`).run(vid, vid, pid);

  const quoteSeeds = EXAMPLE_QUOTES;
  vendorIds.forEach((vendorId, i) => {
    const q = quoteSeeds[i];
    const aid = insert(
      `INSERT INTO assignments (project_id, version_id, vendor_id, status, accepted_at, respond_by) VALUES (?, ?, ?, ?, ?, datetime('now', '+48 hours'))`,
      pid,
      vid,
      vendorId,
      q ? "quoted" : "invited",
      q ? "2026-09-29 10:00:00" : null,
    );
    if (!q) return;
    const items = exampleItems(q);
    insert(
      `INSERT INTO quotes (assignment_id, project_id, version_id, vendor_id, items, vat_included, duration_days, start_available, extra_conditions, furniture_included, note, request_rev_id, design_mode, design_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      aid,
      pid,
      vid,
      vendorId,
      JSON.stringify(items),
      q.vat,
      q.days,
      q.start,
      q.extra,
      items.find((it) => it.key === "furniture")!.status === "included" ? 1 : 0,
      q.note,
      revId,
      i === 0 ? "as_is" : "proposal",
      i === 0 ? "" : "회의실과 대표실 칸막이를 12T 접합유리로 바꿔 통화 소리가 새지 않게 하는 것을 제안합니다. 가구 배치는 고객 배치를 따릅니다.",
    );
  });
  for (const body of ["프로젝트를 만들었습니다.", "참고 사례 1건을 요청서에 연결했습니다.", "견적을 요청했습니다.", "운영자가 업체 3곳을 배정했습니다.", "견적 2건이 도착했습니다."])
    insert(`INSERT INTO events (project_id, actor_id, body) VALUES (?, ?, ?)`, pid, body.startsWith("운영자") ? admin : customer, body);

  // 집(주거) 방 한 칸 3D 예시. 사무실 예시·예시 프로젝트의 번호가 바뀌지 않도록 맨 뒤에 넣는다.
  addHomeExamples(conn, uploadDir);
  // 2차: 쇼핑 예시 판매자·상품
  addShopExamples(conn, uploadDir);
}
