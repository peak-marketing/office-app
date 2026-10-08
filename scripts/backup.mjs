// DB와 업로드 파일을 data/backups/날짜/ 에 복사한다. 서버를 끄지 않고 실행해도 된다.
//   node scripts/backup.mjs        (Docker: docker compose exec app node scripts/backup.mjs)
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const data = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), "data");
const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
const dir = path.join(data, "backups", stamp);
fs.mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(path.join(data, "app.db"));
db.exec(`VACUUM INTO '${path.join(dir, "app.db").replaceAll("'", "''")}'`);
db.close();
fs.cpSync(path.join(data, "uploads"), path.join(dir, "uploads"), { recursive: true });
// 30일보다 오래된 백업은 지운다.
for (const name of fs.readdirSync(path.join(data, "backups"))) {
  const full = path.join(data, "backups", name);
  if (Date.now() - fs.statSync(full).mtimeMs > 30 * 86400000) fs.rmSync(full, { recursive: true, force: true });
}
console.log("backup:", dir);
