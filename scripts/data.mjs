// 데이터 백업·확인·복구·초기화. 초기화와 복구는 이 명령으로만 하고, 서버 시작·재시작은 데이터를 건드리지 않는다.
//   npm run data:backup [-- 이름]          백업 만들기(서버를 켠 채로 가능) → data/backups/<시각>[-이름]/
//   npm run data:backups                   백업 목록과 건수
//   npm run data:verify -- <백업>          백업 파일 점검(무결성·건수·업로드 파일)
//   npm run data:restore -- <백업> --yes   백업으로 되돌리기(서버를 멈춘 뒤, 지금 데이터를 먼저 백업)
//   npm run data:reset -- --yes            데이터 초기화(서버를 멈춘 뒤, 지금 데이터를 먼저 백업). 백업 폴더는 남긴다.
// DATA_DIR로 다른 데이터 폴더를 지정할 수 있다(복구 연습용).
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), "data");
const backupsDir = path.join(dataDir, "backups");
const dbFile = path.join(dataDir, "app.db");
const uploads = path.join(dataDir, "uploads");
const args = process.argv.slice(3);
const yes = args.includes("--yes");
const name = args.find((a) => !a.startsWith("--"));

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};
const serverRunning = () => {
  try {
    const pid = Number(fs.readFileSync(path.join(dataDir, "server.pid"), "utf8").trim());
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
};
const countFiles = (dir) => {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) n += e.isDirectory() ? countFiles(path.join(dir, e.name)) : 1;
  return n;
};
function summary(file, uploadDir) {
  const db = new DatabaseSync(file, { readOnly: true });
  const one = (sql) => db.prepare(sql).get();
  const integrity = one("PRAGMA integrity_check").integrity_check;
  const c = (t) => one(`SELECT count(*) AS n FROM ${t}`).n;
  const out = {
    integrity,
    users: c("users"),
    realUsers: one("SELECT count(*) AS n FROM users WHERE is_demo = 0").n,
    vendors: c("vendors"),
    projects: c("projects"),
    versions: c("versions"),
    quotes: c("quotes"),
    files: one("SELECT count(*) AS n FROM files WHERE deleted_at IS NULL").n,
    uploadFiles: countFiles(uploadDir),
  };
  db.close();
  return out;
}
const show = (s) =>
  `무결성 ${s.integrity} · 계정 ${s.users}(시연 제외 ${s.realUsers}) · 업체 ${s.vendors} · 프로젝트 ${s.projects} · 버전 ${s.versions} · 제안 ${s.quotes} · 파일 기록 ${s.files} · 업로드 파일 ${s.uploadFiles}`;

function backup(label) {
  if (!fs.existsSync(dbFile)) fail(`데이터가 없습니다: ${dbFile}`);
  const stamp = new Date(Date.now() + 9 * 3600e3).toISOString().replace(/[:T]/g, "-").slice(0, 19); // 한국 시각
  const dir = path.join(backupsDir, `${stamp}${label ? `-${label.replace(/[^\w가-힣-]/g, "")}` : ""}`);
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(dbFile);
  db.exec(`VACUUM INTO '${path.join(dir, "app.db").replaceAll("'", "''")}'`); // 서버가 켜져 있어도 한 시점의 사본
  db.close();
  if (fs.existsSync(uploads)) fs.cpSync(uploads, path.join(dir, "uploads"), { recursive: true });
  else fs.mkdirSync(path.join(dir, "uploads"));
  const s = summary(path.join(dir, "app.db"), path.join(dir, "uploads"));
  fs.writeFileSync(path.join(dir, "summary.json"), JSON.stringify({ createdAt: new Date().toISOString(), ...s }, null, 2));
  console.log(`백업: ${dir}\n  ${show(s)}`);
  return dir;
}

function resolveBackup(n) {
  if (!n) fail("백업 이름을 주세요. 목록: npm run data:backups");
  const dir = path.isAbsolute(n) ? n : path.join(backupsDir, n);
  if (!fs.existsSync(path.join(dir, "app.db"))) fail(`백업을 찾을 수 없습니다: ${dir}`);
  return dir;
}

const cmd = process.argv[2];
if (cmd === "backup") backup(name);
else if (cmd === "list") {
  if (!fs.existsSync(backupsDir)) console.log("백업이 없습니다.");
  else
    for (const d of fs.readdirSync(backupsDir).sort()) {
      const f = path.join(backupsDir, d, "summary.json");
      const s = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
      console.log(`${d}${s ? `  · 계정 ${s.users} · 프로젝트 ${s.projects} · 제안 ${s.quotes} · 업로드 ${s.uploadFiles}` : ""}`);
    }
} else if (cmd === "verify") {
  const dir = resolveBackup(name);
  const s = summary(path.join(dir, "app.db"), path.join(dir, "uploads"));
  console.log(`${dir}\n  ${show(s)}`);
  if (s.integrity !== "ok") fail("백업 파일이 손상되었습니다.");
} else if (cmd === "restore") {
  const dir = resolveBackup(name);
  if (serverRunning()) fail("서버가 켜져 있습니다. 먼저 npm run serve:stop 을 실행하세요.");
  const s = summary(path.join(dir, "app.db"), path.join(dir, "uploads"));
  if (s.integrity !== "ok") fail("백업 파일이 손상되어 복구하지 않습니다.");
  if (!yes) fail(`이 백업으로 되돌립니다: ${dir}\n  ${show(s)}\n지금 데이터는 먼저 백업합니다. 진행하려면 끝에 --yes 를 붙이세요.`);
  if (fs.existsSync(dbFile)) backup("before-restore");
  for (const f of ["app.db", "app.db-wal", "app.db-shm"]) fs.rmSync(path.join(dataDir, f), { force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.copyFileSync(path.join(dir, "app.db"), dbFile);
  fs.rmSync(uploads, { recursive: true, force: true });
  fs.cpSync(path.join(dir, "uploads"), uploads, { recursive: true });
  console.log(`복구했습니다: ${dataDir}\n  ${show(summary(dbFile, uploads))}\n이제 npm run serve:start 로 띄우세요.`);
} else if (cmd === "reset") {
  if (serverRunning()) fail("서버가 켜져 있습니다. 먼저 npm run serve:stop 을 실행하세요.");
  if (!yes) fail(`데이터를 비웁니다(계정·프로젝트·제안·업로드 파일 모두): ${dataDir}\n지금 데이터는 먼저 백업하고, 백업 폴더는 남깁니다. 진행하려면 끝에 --yes 를 붙이세요.`);
  if (fs.existsSync(dbFile)) backup("before-reset");
  for (const f of ["app.db", "app.db-wal", "app.db-shm"]) fs.rmSync(path.join(dataDir, f), { force: true });
  fs.rmSync(uploads, { recursive: true, force: true });
  console.log("데이터를 비웠습니다. 다음 시작 때 빈 데이터로 만들어집니다(운영용은 ADMIN_EMAIL·ADMIN_PASSWORD로 운영자 계정을 만들고, 시연 데이터가 필요하면 SEED_DEMO=1).");
} else {
  console.error("사용법: node scripts/data.mjs backup|list|verify|restore|reset");
  process.exit(1);
}
