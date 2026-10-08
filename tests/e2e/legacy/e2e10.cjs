// 대면 테스트 운영: 운영용 실행에서 실제 업체 등록 → 메일 기록의 링크로 비밀번호 설정 → 실제/예시 업체 구분 배정 → 제안 → 요약
const { chromium } = require("playwright-core");
const { execSync } = require("child_process");
const { makeSpace, requestSpace, designAsIs } = require("./t8.cjs");
const B = process.env.B || "http://localhost:3101";
const DB = process.env.DB || __dirname + "/testdata/app.db";
const P = process.env.P || "/Users/gimjinbong/Desktop/인테러이 도면/platform";
const sql = (q) => execSync(`sqlite3 "${DB}" "${q.replace(/"/g, '\\"')}"`).toString().trim();
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name} ${ok ? "" : extra}`);

(async () => {
  const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const errors = [];
  const ctx = async () => { const p = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage(); p.on("pageerror", (e) => errors.push(e.message)); return p; };
  const login = async (p, email, pw = "demo1234") => { await p.goto(B + "/login"); await p.fill("input[name=email]", email); await p.fill("input[name=password]", pw); await p.click('main button:has-text("로그인")'); await p.waitForURL((u) => !u.pathname.startsWith("/login")); };

  // 운영용 실행: Secure 쿠키를 끈 http 로그인
  const a = await ctx(); await login(a, "admin@demo.kr");
  check("운영용 실행에서 http 로그인(쿠키 유지)", (await a.context().cookies()).length > 0 && !a.url().includes("/login"));

  // 1. 실제 업체 2곳 등록 → 메일 기록에 비밀번호 설정 링크
  const T = Date.now();
  const real = [{ company: `실제업체A-${T}`, email: `va${T}@test.kr` }, { company: `실제업체B-${T}`, email: `vb${T}@test.kr` }];
  for (const v of real) {
    await a.goto(B + "/admin/vendors");
    await a.click("summary:has-text('업체 직접 등록')");
    await a.fill("input[name=company]", v.company); await a.fill("input[name=name]", "담당자"); await a.fill("input[name=email]", v.email);
    await a.click("button:has-text('업체 등록')"); await a.waitForSelector(`text=${v.company} 계정을 만들고`);
  }
  await a.goto(B + "/admin/emails");
  const links = await a.$$eval("[data-testid=email-link] .font-mono", (els) => els.map((e) => e.textContent));
  check("메일 기록: 발송 설정이 없으면 비밀번호 설정 링크를 보여 줌", links.length >= 2 && links.every((l) => /\/reset\//.test(l)), JSON.stringify(links));
  // 2. 업체가 링크로 비밀번호를 정하고 로그인
  for (const [i, v] of real.entries()) {
    const link = links.find((l) => l.includes("/reset/") && sql(`select count(*) from email_outbox where to_email='${v.email}' and link='${new URL(l).pathname}'`) === "1");
    const p = await ctx();
    await p.goto(link);
    await p.fill("input[name=password]", "realpass1"); await p.click("button:has-text('새 비밀번호로 바꾸기')");
    await p.waitForURL(/\/vendor/);
    check(`실제 업체 ${i + 1}: 링크로 비밀번호를 정하면 바로 업체 화면`, p.url().includes("/vendor"), p.url());
    const again = await ctx(); await login(again, v.email, "realpass1");
    check(`실제 업체 ${i + 1}: 정한 비밀번호로 다시 로그인`, again.url().includes("/vendor"), again.url());
    v.page = p;
  }
  // 3. 고객 1명: 공간 만들기 → 요청
  const c = await ctx();
  await c.goto(B + "/signup"); await c.fill("input[name=email]", `cust${T}@test.kr`); await c.fill("input[name=password]", "testpass1"); await c.fill("input[name=name]", "테스트고객"); await c.check("input[name=consent]"); await c.click('button:has-text("가입하기")'); await c.waitForURL(/\/projects/);
  const pid = await makeSpace(c, B, { title: "첫 테스트 공간", w: 11000, d: 9000, staff: 8 });
  await requestSpace(c, B, pid, { budgetMin: 4000, budgetMax: 6000 });
  // 4. 운영자: 테스트로 표시 → 실제/예시 구분된 목록에서 실제 업체 2곳 배정
  await a.goto(`${B}/admin/projects/${pid}`);
  await a.click("button:has-text('테스트 요청으로 표시')"); await a.waitForSelector("button:has-text('실제 요청으로 표시')");
  const realGroup = await a.textContent("[data-testid=vendor-group-real]");
  const demoGroup = await a.textContent("[data-testid=vendor-group-demo]");
  check("배정 목록: 실제 업체 묶음에 등록한 2곳(실제 표시)", real.every((v) => realGroup.includes(v.company)) && realGroup.includes("실제") && !realGroup.includes("[예시]"));
  check("배정 목록: 예시 업체는 따로(응답하지 않는다는 안내)", demoGroup.includes("[예시]") && demoGroup.includes("실제로 응답하지 않아요"));
  for (const v of real) await a.locator(`[data-testid=vendor-group-real] label:has-text("${v.company}") input[name=vendor]`).check();
  await a.click('button:has-text("선택한 업체 배정")'); await a.waitForSelector("text=업체 2곳을 배정했습니다");
  // 5. 실제 업체 2곳이 받아서 제안
  for (const v of real) {
    const p = v.page;
    const aid = sql(`select a.id from assignments a join vendors x on x.id=a.vendor_id join users u on u.id=x.user_id where a.project_id=${pid} and u.email='${v.email}'`);
    await p.goto(`${B}/vendor/requests/${aid}`);
    check(`${v.company}: 받은 요청에 배치(평면·3D) 표시`, (await p.locator("[data-testid=sent-layout]").count()) === 1);
    await p.click("button:has-text('참여하기')"); await p.waitForSelector("text=최저가 자동 낙찰은 하지 않습니다");
    const body = await p.textContent("main");
    check(`${v.company}: 제안 안내 문구(운영자 선정·비공개·최저가 자동 낙찰 없음, ‘경매’ 표현 없음)`, body.includes("운영자가 선정한 여러 업체가 같은 요청 내용과 같은 항목으로 비공개로 가격·설계·자재·기간을 제안하고, 고객이 비교해 선택합니다") && body.includes("최저가 자동 낙찰은 하지 않습니다") && !body.includes("경매"));
    v.aid = aid;
  }
  check("테스트 요청 표시 저장", sql(`select is_test from projects where id=${pid}`) === "1");
  const report = execSync(`DATA_DIR="${require("path").dirname(DB)}" npm run --silent test:report`, { cwd: P }).toString();
  check("테스트 요약: 이 프로젝트와 실제 업체 2곳(예시 표시 없음)", report.includes(`프로젝트 ${pid}`) && real.every((v) => report.includes(v.company)) && !report.includes("(예시 업체)"), report.slice(0, 400));

  for (const u of ["/guide", "/partners"]) { const t = await (await c.request.get(B + u)).text(); check(`${u}: 새 설명 문구, ‘경매’ 표현 없음`, t.includes("최저가 자동 낙찰은 하지 않습니다") && t.includes("비공개로 가격·설계·자재·기간을 제안") && !t.includes("경매")); }
  check("페이지 오류 없음", errors.length === 0, errors.join(" | "));
  console.log(results.join("\n"));
  console.log(`\n${results.filter((r) => r.startsWith("PASS")).length} passed, ${results.filter((r) => r.startsWith("FAIL")).length} failed`);
  await browser.close();
})().catch((e) => { console.error(results.join("\n")); console.error(e); process.exit(1); });
