import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { hashPassword } from "./password";
import { seed } from "./seed";
import { migrateV2 } from "./db-v2";

// 데이터 폴더. 기본은 프로젝트의 data/. 복구 연습처럼 다른 폴더로 띄울 때만 DATA_DIR을 준다.
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('customer','vendor','admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  company TEXT NOT NULL,
  intro TEXT NOT NULL DEFAULT '',
  regions TEXT NOT NULL DEFAULT '',
  specialties TEXT NOT NULL DEFAULT '',
  years INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','suspended')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS vendor_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  area_pyeong REAL,
  duration TEXT NOT NULL DEFAULT '',
  file_id INTEGER,
  is_example INTEGER NOT NULL DEFAULT 0,
  style TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  spec TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS case_files (
  case_id INTEGER NOT NULL REFERENCES vendor_cases(id),
  file_id INTEGER NOT NULL REFERENCES files(id),
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (case_id, file_id)
);
CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL REFERENCES users(id),
  vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, vendor_id)
);
CREATE TABLE IF NOT EXISTS saved_cases (
  user_id INTEGER NOT NULL REFERENCES users(id),
  case_id INTEGER NOT NULL REFERENCES vendor_cases(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, case_id)
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  region TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  current_version_id INTEGER,
  requested_version_id INTEGER,
  budget_min INTEGER,
  budget_max INTEGER,
  desired_start TEXT NOT NULL DEFAULT '',
  desired_movein TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  outcome TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  no INTEGER NOT NULL,
  input TEXT NOT NULL,
  result TEXT NOT NULL,
  layout_status TEXT NOT NULL,
  selected_option TEXT NOT NULL DEFAULT 'A',
  selected_style TEXT NOT NULL DEFAULT 'natural',
  note TEXT NOT NULL DEFAULT '',
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  project_id INTEGER REFERENCES projects(id),
  kind TEXT NOT NULL CHECK (kind IN ('photo','drawing','case')),
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS project_refs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  case_id INTEGER NOT NULL REFERENCES vendor_cases(id),
  file_id INTEGER,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, case_id)
);
CREATE TABLE IF NOT EXISTS change_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  version_id INTEGER NOT NULL REFERENCES versions(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  reply TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS share_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  version_id INTEGER NOT NULL REFERENCES versions(id),
  vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','declined','quoted')),
  accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, version_id, vendor_id)
);
CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL UNIQUE REFERENCES assignments(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),
  version_id INTEGER NOT NULL REFERENCES versions(id),
  vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  items TEXT NOT NULL,
  vat_included INTEGER NOT NULL,
  duration_days INTEGER NOT NULL,
  start_available TEXT NOT NULL,
  extra_conditions TEXT NOT NULL DEFAULT '',
  furniture_included INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS quote_drafts (
  assignment_id INTEGER PRIMARY KEY REFERENCES assignments(id),
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS quote_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER NOT NULL REFERENCES quotes(id),
  no INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (quote_id, no)
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  project_id INTEGER REFERENCES projects(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  href TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications (user_id, read_at);
CREATE TABLE IF NOT EXISTS visit_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  quote_id INTEGER NOT NULL UNIQUE REFERENCES quotes(id),
  vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  preferred TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','confirmed','done')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS request_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  no INTEGER NOT NULL,
  version_id INTEGER NOT NULL REFERENCES versions(id),
  snapshot TEXT NOT NULL,
  changes TEXT NOT NULL DEFAULT '[]',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, no)
);
CREATE TABLE IF NOT EXISTS info_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  items TEXT NOT NULL DEFAULT '[]',
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','closed')),
  reply TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  answered_at TEXT
);
CREATE TABLE IF NOT EXISTS email_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','logged')),
  error TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT
);
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  actor_id INTEGER REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const globalDb = globalThis as unknown as { __db?: DatabaseSync };

export function db() {
  if (!globalDb.__db) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const conn = new DatabaseSync(path.join(DATA_DIR, "app.db"));
    conn.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    conn.exec(SCHEMA);
    // 먼저 만들어진 DB에 나중에 생긴 컬럼을 더한다.
    const hasColumn = (table: string, column: string) =>
      conn
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .some((row) => row.name === column);
    if (!hasColumn("vendor_cases", "is_example")) {
      conn.exec(`ALTER TABLE vendor_cases ADD COLUMN is_example INTEGER NOT NULL DEFAULT 0`);
      conn.exec(`UPDATE vendor_cases SET is_example = 1 WHERE file_id IN (SELECT id FROM files WHERE stored_name LIKE 'seed-%')`);
    }
    if (!hasColumn("vendor_cases", "style")) {
      conn.exec(`ALTER TABLE vendor_cases ADD COLUMN style TEXT NOT NULL DEFAULT ''`);
      conn.exec(`ALTER TABLE vendor_cases ADD COLUMN region TEXT NOT NULL DEFAULT ''`);
      conn.exec(`ALTER TABLE vendor_cases ADD COLUMN spec TEXT NOT NULL DEFAULT '{}'`);
    }
    // 6차: 실사용 테스트 준비
    const addColumn = (table: string, column: string, def: string) => {
      if (!hasColumn(table, column)) conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
    };
    addColumn("projects", "work_scope", "TEXT NOT NULL DEFAULT ''");
    addColumn("projects", "is_test", "INTEGER NOT NULL DEFAULT 0");
    addColumn("users", "is_demo", "INTEGER NOT NULL DEFAULT 0");
    addColumn("files", "category", "TEXT NOT NULL DEFAULT ''");
    addColumn("files", "deleted_at", "TEXT");
    addColumn("assignments", "respond_by", "TEXT");
    addColumn("assignments", "quote_by", "TEXT");
    addColumn("assignments", "withdrawn_at", "TEXT");
    addColumn("assignments", "reminded_at", "TEXT");
    addColumn("quotes", "request_rev_id", "INTEGER");
    // 8차: 내 공간(실제 구조)과 가구 배치 편집, 업체 설계 제안
    addColumn("versions", "room", "TEXT");
    addColumn("versions", "placement", "TEXT");
    addColumn("versions", "source", "TEXT NOT NULL DEFAULT ''");
    addColumn("versions", "base_version_id", "INTEGER");
    addColumn("quotes", "design_mode", "TEXT NOT NULL DEFAULT ''");
    addColumn("quotes", "design_note", "TEXT NOT NULL DEFAULT ''");
    addColumn("quotes", "design_files", "TEXT NOT NULL DEFAULT '[]'");
    // 주거 1차: 공간 종류(사무실/집), 업체 시공 분야, 집 요청의 방 한 칸 배치 목록
    addColumn("projects", "kind", "TEXT NOT NULL DEFAULT 'office'");
    addColumn("vendors", "fields", "TEXT NOT NULL DEFAULT 'office'");
    addColumn("versions", "rooms", "TEXT");
    // 집 전체 평면: 바깥 벽·내부 벽·문·창·방 이름·고정 구조물·가구(JSON). 이전 버전은 NULL
    addColumn("versions", "house", "TEXT");
    // 2차 통합: 쇼핑·커뮤니티·업체 직접 참여 입찰
    migrateV2(conn, addColumn);
    if (!hasColumn("assignments", "accepted_at")) {
      conn.exec(`ALTER TABLE assignments ADD COLUMN accepted_at TEXT`);
      conn.exec(`UPDATE assignments SET accepted_at = created_at WHERE status = 'quoted'`);
    }
    // 사례당 사진 1장이던 시절의 데이터를 여러 장 구조로 옮긴다.
    conn.exec(`INSERT OR IGNORE INTO case_files (case_id, file_id) SELECT id, file_id FROM vendor_cases WHERE file_id IS NOT NULL`);
    globalDb.__db = conn;
    const { n } = conn.prepare("SELECT count(*) AS n FROM users").get() as { n: number };
    // 시연 데이터는 개발 환경에서만 넣는다. 운영에서는 SEED_DEMO=1을 줄 때만.
    const demo = process.env.SEED_DEMO === "1" || (process.env.NODE_ENV !== "production" && process.env.SEED_DEMO !== "0");
    if (n === 0 && demo) seed(conn, UPLOAD_DIR);
    ensureAdmin(conn);
    // 수정 이력이 생기기 전에 제출된 견적은 지금 내용을 1차 제출본으로 남긴다.
    conn.exec(`
      INSERT INTO quote_revisions (quote_id, no, snapshot, created_at)
      SELECT q.id, 1, json_object(
        'items', json(q.items), 'vat_included', q.vat_included, 'duration_days', q.duration_days, 'start_available', q.start_available,
        'extra_conditions', q.extra_conditions, 'furniture_included', q.furniture_included, 'note', q.note), q.submitted_at
      FROM quotes q WHERE NOT EXISTS (SELECT 1 FROM quote_revisions r WHERE r.quote_id = q.id)`);
  }
  return globalDb.__db;
}

type Params = SQLInputValue[];

// node:sqlite는 프로토타입이 없는 객체를 돌려주므로 Client Component에 넘길 수 있게 복사한다.
export function all<T>(sql: string, ...params: Params): T[] {
  return db()
    .prepare(sql)
    .all(...params)
    .map((row) => ({ ...row })) as T[];
}

export function get<T>(sql: string, ...params: Params): T | undefined {
  const row = db()
    .prepare(sql)
    .get(...params);
  return row ? ({ ...row } as T) : undefined;
}

export function run(sql: string, ...params: Params) {
  const res = db()
    .prepare(sql)
    .run(...params);
  return Number(res.lastInsertRowid);
}

export function transaction<T>(fn: () => T): T {
  const conn = db();
  conn.exec("BEGIN");
  try {
    const out = fn();
    conn.exec("COMMIT");
    return out;
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  }
}

/** 운영 첫 실행: ADMIN_EMAIL·ADMIN_PASSWORD가 있고 운영자가 없으면 운영자 계정을 만든다. */
function ensureAdmin(conn: DatabaseSync) {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  const exists = conn.prepare(`SELECT 1 AS ok FROM users WHERE role = 'admin'`).get();
  if (exists) return;
  if (password.length < 10) throw new Error("ADMIN_PASSWORD는 10자 이상이어야 합니다.");
  conn.prepare(`INSERT INTO users (email, password_hash, name, phone, role) VALUES (?, ?, ?, '', 'admin')`).run(email, hashPassword(password), process.env.ADMIN_NAME?.trim() || "운영자");
}
