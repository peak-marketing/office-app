// 브라우저 E2E 공용 도우미. 실행기(scripts/e2e.mjs)는 tests/e2e/*.cjs만 묶음으로 돌리므로 이 폴더의 파일은 따로 실행되지 않는다.
//   const t = require("./lib/harness.cjs").suite("office-explore");
//   t.run(async () => { const c = await t.page(); … t.check("이름", ok, "실패 때 보일 값"); });
// - suite(이름, { webgl: false })이면 소프트웨어 WebGL(SwiftShader) 없이 띄운다. 3D를 보지 않는 묶음은 이쪽이 훨씬 빠르다(예전 e2e10~12와 같은 실행 방식).
// - 환경 변수 B(서버 주소)·DB(그 서버의 app.db)·P(저장소 경로)가 없으면 멈춘다(실제 3100 데이터에 잘못 돌지 않도록 기본값 없음).
// - 항목마다 `PASS 이름` / `FAIL 이름 — 값` 한 줄. `## 제목` 줄은 묶음 안의 구분일 뿐이다.
// - SHOTS=1이면 화면을 P/.e2e-data/shots/<묶음>/ 에 남긴다.
// - 끝에 공통 항목 두 개(페이지 오류 없음, 서버 로그 오류 없음 — 지금 서버가 뜬 뒤의 기록만)를 더한다.
const { chromium } = require("playwright-core");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function suite(name, { webgl = true } = {}) {
  const { B, DB, P } = process.env;
  if (!B || !DB || !P) throw new Error("B(서버 주소)·DB(그 서버의 app.db)·P(저장소 경로)를 환경 변수로 주세요. 보통은 npm run test:e2e 가 넣어 줍니다.");
  const SHOTS = process.env.SHOTS === "1";
  const shotDir = path.join(P, ".e2e-data", "shots", name);
  if (SHOTS) fs.mkdirSync(shotDir, { recursive: true });

  const serverLog = path.join(path.dirname(DB), "server.log");
  const sql = (q) => execFileSync("sqlite3", [DB, q], { maxBuffer: 64 << 20 }).toString().trim();
  const fixture = (file) => path.join(__dirname, "..", "fixtures", file);

  let pass = 0;
  let fail = 0;
  const check = (title, ok, extra = "") => {
    if (ok) pass++;
    else fail++;
    console.log(`${ok ? "PASS" : "FAIL"} ${title}${ok ? "" : ` — ${String(extra).slice(0, 400)}`}`);
  };
  const group = (title) => console.log(`\n## ${title}`);

  const errors = [];
  let browser = null;
  const launch = async () => {
    browser ??= await chromium.launch({ executablePath: CHROME, headless: true, args: webgl ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [] });
    return browser;
  };
  /** 새 브라우저 창(쿠키 따로). opts는 newContext 옵션(viewport 등) */
  const page = async (opts = {}) => {
    const p = await (await (await launch()).newContext({ viewport: { width: 1440, height: 1000 }, ...opts })).newPage();
    p.on("pageerror", (e) => errors.push(`${p.url()} ${e.message}`));
    return p;
  };
  const phone = (opts = {}) => page({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, ...opts });
  const login = async (p, email, pw = "demo1234") => {
    await p.goto(B + "/login");
    await p.fill("input[name=email]", email);
    await p.fill("input[name=password]", pw);
    await p.click('main button:has-text("로그인")');
    await p.waitForURL((u) => !u.pathname.startsWith("/login"));
  };
  const noOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const shot = async (p, file, opts = {}) => {
    if (!SHOTS) return;
    await p.screenshot({ path: path.join(shotDir, `${file}.png`), fullPage: true, ...opts });
  };
  /** 조건이 참이 될 때까지 기다린다(서버 처리 뒤 DB·화면 확인용). 시간이 지나면 마지막 값을 돌려준다. */
  const until = async (fn, { timeout = 10000, interval = 100 } = {}) => {
    const end = Date.now() + timeout;
    let v;
    for (;;) {
      v = await fn();
      if (v || Date.now() > end) return v;
      await new Promise((r) => setTimeout(r, interval));
    }
  };
  /** 지금까지 쌓인 메일 기록의 마지막 번호. 이 값보다 큰 번호만 이 검사가 만든 메일이다. */
  const mailMark = () => Number(sql("select coalesce(max(id), 0) from email_outbox"));

  const finish = async ({ pageErrors = "페이지 오류 없음" } = {}) => {
    check(pageErrors, errors.length === 0, [...new Set(errors)].slice(0, 5).join(" | "));
    // 서버 기록은 지금 서버가 뜬 뒤(마지막 ‘▲ Next.js’ 줄부터)만 본다. E2E_BASE 사본에 예전 서버의 기록이 있어도 어긋나지 않게.
    const log = fs.existsSync(serverLog) ? fs.readFileSync(serverLog, "utf8") : "";
    const bad = log.slice(Math.max(0, log.lastIndexOf("▲ Next.js"))).split("\n").filter((l) => /⨯|Error:/.test(l));
    check("서버 로그 오류 없음", bad.length === 0, bad.slice(0, 3).join(" | "));
    console.log(`\n${pass} passed, ${fail} failed`);
    if (browser) await browser.close();
    process.exit(fail ? 1 : 0);
  };
  const run = (fn, opts) =>
    fn()
      .then(() => finish(opts))
      .catch(async (e) => {
        console.log(`FAIL 실행 중단 — ${String(e?.stack ?? e).slice(0, 1500)}`);
        if (browser) await browser.close().catch(() => {});
        process.exit(1);
      });

  return { name, B, DB, P, SHOTS, shotDir, sql, fixture, check, group, page, phone, login, noOverflow, shot, until, mailMark, errors, run };
}

module.exports = { suite };
