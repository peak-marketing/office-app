// 브라우저 E2E 실행기. 묶음마다 새 데이터(시연 데이터 포함)로 격리 서버를 띄우고 검사를 돌린다.
//   npm run test:e2e                   tests/e2e/*.cjs 모두
//   npm run test:e2e -- home shop      이름에 맞는 묶음만
//   E2E_BUILD=1 npm run test:e2e       먼저 검사용 빌드(.next-test)를 만든다
//   E2E_PORT(기본 3301), E2E_BASE=<데이터 폴더>(그 데이터 사본으로 시작, 예: 운영 데이터 백업)
// 검사 스크립트는 B(주소)·DB(데이터 파일)·P(저장소 경로)를 환경 변수로 받는다. 결과는 .e2e-data/<묶음>.out
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const port = Number(process.env.E2E_PORT || 3301);
const out = path.join(root, ".e2e-data");
const dist = process.env.E2E_DIST || ".next-test";
// Ordinary regression tests use fixtures. Never let a developer's local key turn them into paid API calls.
// Real-model checks are an explicit opt-in under tests/live/ and use a separate server/data directory.
const testEnv = { ...process.env, OPENAI_API_KEY: "" };
const filters = process.argv.slice(2);
const suites = fs
  .readdirSync(path.join(root, "tests/e2e"))
  .filter((f) => f.endsWith(".cjs"))
  .map((f) => f.replace(/\.cjs$/, ""))
  .filter((n) => !filters.length || filters.some((f) => n.includes(f)))
  .sort();
if (!suites.length) {
  console.error("돌릴 검사가 없습니다.");
  process.exit(1);
}
fs.mkdirSync(out, { recursive: true });
if (process.env.E2E_BUILD === "1" || !fs.existsSync(path.join(root, dist, "BUILD_ID"))) {
  console.log("검사용 빌드를 만듭니다(.next-test)…");
  execFileSync(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "build"], { stdio: "inherit", env: { ...testEnv, NEXT_DIST_DIR: dist } });
}
const serve = (cmd, dataDir) =>
  spawnSync(process.execPath, [path.join(root, "scripts/serve.mjs"), cmd], {
    env: { ...testEnv, NEXT_DIST_DIR: dist, DATA_DIR: dataDir, PORT: String(port), SEED_DEMO: "1", COOKIE_SECURE: "0" },
    encoding: "utf8",
  });
const summary = [];
for (const name of suites) {
  const dataDir = path.join(out, `data-${name}`);
  serve("stop", dataDir);
  fs.rmSync(dataDir, { recursive: true, force: true });
  if (process.env.E2E_BASE) fs.cpSync(process.env.E2E_BASE, dataDir, { recursive: true, filter: (s) => !s.includes(`${path.sep}backups`) });
  const started = serve("start", dataDir);
  if (started.status !== 0) {
    summary.push(`${name}: 서버 시작 실패 ${started.stderr || started.stdout}`);
    continue;
  }
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(root, "tests/e2e", `${name}.cjs`)], {
    env: { ...testEnv, B: `http://localhost:${port}`, DB: path.join(dataDir, "app.db"), P: root },
    encoding: "utf8",
    maxBuffer: 64 << 20,
  });
  serve("stop", dataDir);
  const text = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  fs.writeFileSync(path.join(out, `${name}.out`), text);
  const pass = (text.match(/^PASS/gm) ?? []).length;
  const fail = (text.match(/^FAIL/gm) ?? []).length;
  summary.push(`${name}: 통과 ${pass} · 실패 ${fail}${r.status !== 0 && !fail ? " · 실행 오류(.e2e-data/" + name + ".out)" : ""} · ${Math.round((Date.now() - t0) / 1000)}초`);
  console.log(summary.at(-1));
}
fs.writeFileSync(path.join(out, "summary.txt"), summary.join("\n") + "\n");
console.log(`\n결과: .e2e-data/summary.txt`);
process.exit(summary.some((s) => !/실패 0 · \d+초$/.test(s)) ? 1 : 0);
