// 운영용 실행(로컬 대면 테스트·단일 서버). 시작·중지·재시작은 데이터를 건드리지 않는다.
//   npm run serve:start     운영용으로 띄움(먼저 npm run build)
//   npm run serve:stop      중지
//   npm run serve:restart   중지 후 다시 띄움(데이터 그대로)
//   npm run serve:status    상태
// PORT(기본 3100), DATA_DIR(기본 ./data), APP_URL(기본 http://localhost:PORT)을 바꿀 수 있다.
// 서버 번호와 기록은 데이터 폴더의 server.pid · server.log에 남긴다(백업·초기화 대상 아님).
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, "data");
const port = Number(process.env.PORT || 3100);
const appUrl = process.env.APP_URL || `http://localhost:${port}`;
const pidFile = path.join(dataDir, "server.pid");
const logFile = path.join(dataDir, "server.log");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const readPid = () => {
  try {
    const pid = Number(fs.readFileSync(pidFile, "utf8").trim());
    return pid && alive(pid) ? pid : null;
  } catch {
    return null;
  }
};
const portBusy = () => {
  try {
    return execFileSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" }).trim().length > 0;
  } catch {
    return false;
  }
};
const reachable = async () => {
  try {
    const res = await fetch(`http://localhost:${port}/health`);
    return res.ok;
  } catch {
    return false;
  }
};

async function start() {
  if (readPid()) return console.log(`이미 실행 중입니다 (번호 ${readPid()}, ${appUrl}).`);
  if (portBusy()) {
    console.error(`포트 ${port}를 다른 프로그램이 쓰고 있습니다. 개발 서버(npm run dev)가 켜져 있으면 먼저 끄세요.`);
    process.exit(1);
  }
  const distDir = process.env.NEXT_DIST_DIR || ".next";
  if (!fs.existsSync(path.join(root, distDir, "BUILD_ID"))) {
    console.error(`운영용 빌드가 없습니다(${distDir}). 먼저 npm run build 를 실행하세요.`);
    process.exit(1);
  }
  fs.mkdirSync(dataDir, { recursive: true });
  const out = fs.openSync(logFile, "a");
  const next = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    DATA_DIR: dataDir,
    APP_URL: appUrl,
    // http로 여는 로컬 테스트에서는 Secure 쿠키를 쓰지 않는다(https 주소면 그대로 Secure).
    COOKIE_SECURE: process.env.COOKIE_SECURE ?? (appUrl.startsWith("https://") ? "1" : "0"),
    // 운영용 실행에서는 빈 데이터에 시연 데이터를 넣지 않는다(SEED_DEMO=1을 줄 때만).
    SEED_DEMO: process.env.SEED_DEMO ?? "0",
  };
  const child = spawn(process.execPath, [next, "start", "-p", String(port)], { cwd: root, env, detached: true, stdio: ["ignore", out, out] });
  fs.writeFileSync(pidFile, String(child.pid));
  child.unref();
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    if (!alive(child.pid)) break;
    if (await reachable()) {
      console.log(`운영용으로 띄웠습니다: ${appUrl} (번호 ${child.pid}, 데이터 ${dataDir}, 기록 ${logFile})`);
      return;
    }
  }
  console.error(`서버가 응답하지 않습니다. 기록을 확인하세요: ${logFile}`);
  process.exit(1);
}

async function stop() {
  const pid = readPid();
  if (!pid) {
    try {
      fs.rmSync(pidFile);
    } catch {}
    return console.log(portBusy() ? `이 명령으로 띄운 서버는 없습니다. 포트 ${port}는 다른 프로그램이 쓰고 있습니다.` : "실행 중인 서버가 없습니다.");
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }
  for (let i = 0; i < 40 && alive(pid); i++) await sleep(250);
  if (alive(pid)) {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {}
  }
  fs.rmSync(pidFile, { force: true });
  console.log("서버를 멈췄습니다. 데이터는 그대로입니다.");
}

async function status() {
  const pid = readPid();
  if (pid) console.log(`실행 중: ${appUrl} (번호 ${pid}) · 응답 ${(await reachable()) ? "정상" : "없음"} · 데이터 ${dataDir}`);
  else console.log(`멈춰 있습니다${portBusy() ? ` (포트 ${port}는 다른 프로그램이 사용 중)` : ""}. 데이터 ${dataDir}`);
}

const cmd = process.argv[2];
if (cmd === "start") await start();
else if (cmd === "stop") await stop();
else if (cmd === "restart") {
  await stop();
  await start();
} else if (cmd === "status") await status();
else {
  console.error("사용법: node scripts/serve.mjs start|stop|restart|status");
  process.exit(1);
}
