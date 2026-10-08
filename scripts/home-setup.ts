// 기존 데이터에 주거 1차 준비를 더한다(통합 반영 때 한 번). 새 칸(공간 종류·업체 분야·방 배치)은 서버가 데이터를 열 때 자동으로 붙는다.
//   npm run data:home-setup -- --dry-run   바꿀 내용만 보여 준다
//   npm run data:home-setup -- --yes       서버를 멈춘 뒤 실행. 실행 전 백업을 만든다(data/backups/<시각>-before-home-setup)
// 하는 일: 공간 탐색의 집 방 한 칸 3D 예시 5건 추가(이미 있으면 건너뜀), 예시를 맡은 예시 업체(시연 계정)에 시공 분야 ‘주거’ 추가.
// 실제 업체·실제 요청·기존 사례·기존 파일은 고치지 않는다. 여러 번 실행해도 결과가 같다. DATA_DIR로 다른 데이터 폴더를 지정할 수 있다.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

process.env.SEED_DEMO = "0"; // 빈 데이터 폴더를 실수로 시연 데이터로 채우지 않는다.
const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const yes = args.includes("--yes");
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), "data");

async function main() {
  if (!dry && !yes) throw new Error("바꿀 내용을 보려면 --dry-run, 실행하려면 --yes를 붙여 주세요.");
  if (!fs.existsSync(path.join(dataDir, "app.db"))) throw new Error(`데이터가 없습니다: ${dataDir}`);
  try {
    const pid = Number(fs.readFileSync(path.join(dataDir, "server.pid"), "utf8").trim());
    process.kill(pid, 0);
    if (!dry) throw new Error(`서버가 켜져 있습니다(번호 ${pid}). npm run serve:stop 뒤에 실행해 주세요.`);
  } catch (e) {
    if ((e as Error).message.startsWith("서버가")) throw e;
  }
  // 새 칸을 먼저 붙인다(서버가 여는 것과 같은 방식).
  const { db } = await import("../lib/db");
  db();
  const { addHomeExamples } = await import("../lib/seed");
  const conn = new DatabaseSync(path.join(dataDir, "app.db"));
  const plan = addHomeExamples(conn, path.join(dataDir, "uploads"), true);
  console.log(`데이터: ${dataDir}`);
  console.log(`추가할 집 예시: ${plan.added.join(", ") || "없음"} · 이미 있음: ${plan.existing.join(", ") || "없음"} · 건너뜀: ${plan.skipped.join(", ") || "없음"}`);
  console.log(`‘주거’ 분야를 더할 예시 업체: ${plan.vendorsUpdated.join(", ") || "없음"}`);
  if (dry) return;
  if (!plan.added.length && !plan.vendorsUpdated.length) {
    console.log("바꿀 것이 없습니다.");
    return;
  }
  execFileSync(process.execPath, [path.join(process.cwd(), "scripts/data.mjs"), "backup", "before-home-setup"], { stdio: "inherit", env: { ...process.env, DATA_DIR: dataDir } });
  conn.exec("BEGIN");
  try {
    const done = addHomeExamples(conn, path.join(dataDir, "uploads"));
    conn.exec("COMMIT");
    console.log(`집 예시 ${done.added.length}건을 넣고, 예시 업체 ${done.vendorsUpdated.length}곳에 ‘주거’를 더했습니다.`);
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
