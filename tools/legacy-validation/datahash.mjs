// 데이터 폴더 지문(읽기 전용). 사용: node datahash.mjs <데이터 폴더> [기준 데이터 폴더]
// db: 모든 표·칸, existing: 기준 데이터에 있던 행(rowid ≤ 기준 최대)과 칸만, refAll: 기준 데이터 자체, uploads: 업로드 파일
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
const [dir, refDir] = process.argv.slice(2);
const open = (d) => new DatabaseSync(join(d, "app.db"), { readOnly: true });
const tablesOf = (db) => db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all().map((r) => r.name);
const colsOf = (db, t) => db.prepare(`PRAGMA table_info("${t}")`).all().map((r) => r.name);
const db = open(dir);
const ref = refDir ? open(refDir) : db;
const h = createHash("sha256"), hx = createHash("sha256"), hr = createHash("sha256");
const counts = {};
for (const t of tablesOf(db)) { const rows = db.prepare(`SELECT * FROM "${t}" ORDER BY rowid`).all(); counts[t] = rows.length; h.update(t + JSON.stringify(rows)); }
for (const t of tablesOf(ref)) {
  const cols = colsOf(ref, t).map((c) => `"${c}"`).join(",");
  const max = ref.prepare(`SELECT coalesce(max(rowid), 0) AS m FROM "${t}"`).get().m;
  hx.update(t + JSON.stringify(db.prepare(`SELECT ${cols} FROM "${t}" WHERE rowid <= ? ORDER BY rowid`).all(max)));
  hr.update(t + JSON.stringify(ref.prepare(`SELECT ${cols} FROM "${t}" ORDER BY rowid`).all()));
}
const walk = (d) => (existsSync(d) ? readdirSync(d).sort().flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; }) : []);
const hu = createHash("sha256"); const up = join(dir, "uploads"); const files = walk(up);
for (const f of files) hu.update(relative(up, f) + "\0").update(readFileSync(f));
const newCols = [];
for (const t of tablesOf(db)) { const rc = tablesOf(ref).includes(t) ? colsOf(ref, t) : []; for (const c of colsOf(db, t)) if (!rc.includes(c)) newCols.push(`${t}.${c}`); }
console.log(JSON.stringify({ db: h.digest("hex").slice(0, 16), existing: hx.digest("hex").slice(0, 16), refAll: hr.digest("hex").slice(0, 16), uploads: hu.digest("hex").slice(0, 16), uploadFiles: files.length, integrity: Object.values(db.prepare("PRAGMA integrity_check").get())[0], newColumns: newCols, counts: { users: counts.users, projects: counts.projects, versions: counts.versions, quotes: counts.quotes, request_revisions: counts.request_revisions, files: counts.files, vendor_cases: counts.vendor_cases, assignments: counts.assignments } }));
