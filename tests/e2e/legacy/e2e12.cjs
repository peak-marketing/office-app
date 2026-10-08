// 역할별 E2E 지적 2건 확인: (1) 창 ‘잘 모름 / 창 없음 / 위치 입력함’이 모든 요약 화면에서 실제 입력과 같은지, 창을 임의로 추가하지 않는지
// (2) 이전 요청 r1의 제안 0건 안내 — 최초 요청 대기 / 변경 뒤 업체 재확인 대기 / 이전 요청 0건을 구분하는지
// SHOTS=before|after 로 화면을 output/role-e2e-20261002/fix-20261002/ 에 남긴다.
const { chromium } = require("playwright-core");
const { execSync } = require("child_process");
const { requestSpace } = require("./t8.cjs");
const B = process.env.B || "http://localhost:3101";
const DB = process.env.DB || __dirname + "/testdata/app.db";
const OUT = "/Users/gimjinbong/Desktop/인테러이 도면/output/role-e2e-20261002/fix-20261002";
const TAG = process.env.SHOTS || "";
require("fs").mkdirSync(OUT, { recursive: true });
const sql = (q) => execSync(`sqlite3 "${DB}" "${q.replace(/"/g, '\\"')}"`).toString().trim();
const KEYS = ["demolition", "partition", "floor", "ceiling", "electric", "network", "hvac", "fire", "finish", "plumbing", "door", "furniture", "etc"];
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name} ${ok ? "" : extra}`);

(async () => {
  const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const errors = [];
  const ctx = async (opts = {}) => { const p = await (await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...opts })).newPage(); p.on("pageerror", (e) => errors.push(e.message)); return p; };
  const login = async (p, email, pw = "demo1234") => { await p.goto(B + "/login"); await p.fill("input[name=email]", email); await p.fill("input[name=password]", pw); await p.click('main button:has-text("로그인")'); await p.waitForURL((u) => !u.pathname.startsWith("/login")); };
  const shot = async (p, name, opts = {}) => { if (!TAG) return; await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/${TAG}-${name}.png`, fullPage: true, ...opts }); };
  // 요약의 ‘창 위치’ 값(라벨 바로 다음 칸)
  const windowRow = (p) => p.evaluate(() => { const el = [...document.querySelectorAll("dt, th, td, span, div")].find((n) => n.children.length === 0 && n.textContent.trim() === "창 위치"); return el ? (el.nextElementSibling?.textContent ?? "").trim() : null; });

  const c = await ctx(); const T = Date.now();
  await c.goto(B + "/signup"); await c.fill("input[name=email]", `w${T}@test.kr`); await c.fill("input[name=password]", "testpass1"); await c.fill("input[name=name]", "고객"); await c.check("input[name=consent]"); await c.click('button:has-text("가입하기")'); await c.waitForURL(/\/projects/);
  const a = await ctx(); await login(a, "admin@demo.kr");
  const v = await ctx(); await login(v, "vendor1@demo.kr");

  // ── 1. 창 세 가지
  const CASES = [
    { key: "unknown", title: "창 잘 모름 공간", expect: (t) => t.startsWith("잘 모르겠음"), want: "잘 모르겠음", windows: null },
    { key: "none", title: "창 없음 공간", expect: (t) => t === "창 없음", want: "창 없음", windows: 0 },
    { key: "list", title: "창 입력 공간", expect: (t) => t.startsWith("위치 입력함") && t.includes("안쪽 벽") && t.includes("왼쪽 벽"), want: "위치 입력함 · 안쪽 벽 …, 왼쪽 벽 …", windows: 2 },
  ];
  let firstPid = null;
  for (const k of CASES) {
    await c.goto(B + "/spaces/new");
    await c.click("label.intake-option:has(input[value=dims])"); await c.click("[data-testid=wizard-next]");
    await c.fill("[data-testid=room-width]", "11000"); await c.fill("[data-testid=room-depth]", "9000");
    await c.fill("[data-testid=ent-off]", "800"); await c.fill("[data-testid=ent-width]", "1200");
    if (k.key === "none") await c.click("[data-testid=win-none]");
    if (k.key === "list") {
      await c.click("[data-testid=win-list]"); await c.fill("[data-testid=win-at-0]", "450"); await c.fill("[data-testid=win-width-0]", "2400");
      await c.click("[data-testid=add-window]"); await c.locator("[data-testid=win-row-1] select").selectOption("left"); await c.fill("[data-testid=win-at-1]", "3000"); await c.fill("[data-testid=win-width-1]", "1500");
    }
    // ‘잘 모름’은 마법사의 기본값 그대로 둔다.
    await c.click("[data-testid=wizard-next]");
    await c.fill("input[name=title]", k.title); await c.fill("[data-testid=staff]", "8");
    await c.click("[data-testid=wizard-submit]"); await c.waitForURL(/\/editor/); await c.waitForSelector("main.editor");
    const pid = Number(c.url().match(/projects\/(\d+)/)[1]);
    if (!firstPid) firstPid = pid;
    const room = JSON.parse(sql(`select room from versions where project_id=${pid} order by no desc limit 1`));
    check(`[${k.key}] 저장값 room.windows = ${k.windows === null ? "null" : k.windows + "개"}`, k.windows === null ? room.windows === null : Array.isArray(room.windows) && room.windows.length === k.windows);
    const winObjs = Number(await c.evaluate(() => document.querySelectorAll("[data-testid=editor-plan] line[stroke='#7fb8cc']").length));
    check(`[${k.key}] 편집 평면의 창 = 입력한 창 수(임의로 추가하지 않음)`, winObjs === (k.windows || 0), String(winObjs));
    await requestSpace(c, B, pid, { budgetMin: 4000, budgetMax: 6000, address: "서울 성동구 테스트로 1" });
    // 업체·운영자 화면을 보려고 배정
    await a.goto(`${B}/admin/projects/${pid}`);
    await a.locator(`label:has-text("[예시] 스튜디오 온결") input[name=vendor]`).check();
    await a.click('button:has-text("선택한 업체 배정")'); await a.waitForSelector("text=업체 1곳을 배정했습니다");
    // 공유 링크
    await c.goto(`${B}/projects/${pid}/activity`); await c.click("button:has-text('링크 만들기')"); await c.waitForTimeout(600);
    const token = sql(`select token from share_links where project_id=${pid} order by id desc limit 1`);
    const aid = sql(`select a.id from assignments a join vendors x on x.id=a.vendor_id join users u on u.id=x.user_id where a.project_id=${pid} and u.email='vendor1@demo.kr'`);
    const pages = [
      ["고객 한눈에", c, `${B}/projects/${pid}`],
      ["고객 요청 내용·자료", c, `${B}/projects/${pid}/info`],
      ["고객 공간·배치", c, `${B}/projects/${pid}/plan`],
      ["인쇄·PDF", c, `${B}/projects/${pid}/print`],
      ["공유 링크", await ctx(), `${B}/share/${token}`],
      ["업체 요청 화면", v, `${B}/vendor/requests/${aid}`],
      ["운영자 화면", a, `${B}/admin/projects/${pid}`],
    ];
    const seen = [];
    for (const [name, p, url] of pages) {
      await p.goto(url);
      const t = await windowRow(p);
      const body = await p.textContent("body");
      if (t !== null) seen.push(name);
      check(`[${k.key}] ${name}: 창 위치 = ${k.want}`, t === null ? !body.includes("옆 벽이나 여러 면") : k.expect(t) && !body.includes("옆 벽이나 여러 면"), `표시: ${t}`);
      if (k.key === "unknown" && (name === "고객 요청 내용·자료" || name === "인쇄·PDF")) await shot(p, `window-unknown-${name === "인쇄·PDF" ? "print" : "info"}`);
      if (k.key === "unknown" && name === "인쇄·PDF" && TAG) await p.pdf({ path: `${OUT}/${TAG}-window-unknown-print.pdf`, format: "A4", printBackground: true }).catch(() => {});
    }
    check(`[${k.key}] 요약이 있는 화면에서 모두 확인(${seen.length}곳: ${seen.join(", ")})`, seen.length >= 5, seen.join(", "));
  }

  // ── 2. 빈 상태 세 가지와 이전 요청 r1 0건
  const pid = firstPid;
  const aids = [sql(`select a.id from assignments a join vendors x on x.id=a.vendor_id join users u on u.id=x.user_id where a.project_id=${pid} and u.email='vendor1@demo.kr'`)];
  await a.goto(`${B}/admin/projects/${pid}`);
  await a.locator(`label:has-text("[예시] 모아공간") input[name=vendor]`).check();
  await a.click('button:has-text("선택한 업체 배정")'); await a.waitForSelector("text=업체 1곳을 배정했습니다");
  aids.push(sql(`select a.id from assignments a join vendors x on x.id=a.vendor_id join users u on u.id=x.user_id where a.project_id=${pid} and u.email='vendor2@demo.kr'`));
  await c.goto(`${B}/projects/${pid}/quotes`);
  let body = await c.textContent("main");
  check("최초 요청 제안 대기: ‘아직 도착한 제안이 없습니다’ + 받은 업체 상황", body.includes("아직 도착한 제안이 없습니다") && body.includes("참여 검토 중") && !body.includes("업체가 변경 내용을 확인 중") && !body.includes("남아 있는 제안이 없습니다"));
  const vs = [v, await ctx()]; await login(vs[1], "vendor2@demo.kr");
  for (const [i, p] of vs.entries()) {
    await p.goto(`${B}/vendor/requests/${aids[i]}`);
    await p.locator('button:has-text("참여하기")').first().click(); await p.waitForSelector("[data-testid=quote-items]");
    for (const key of KEYS) { await p.selectOption(`select[name=status_${key}]`, "included"); await p.fill(`input[name=amount_${key}]`, String(1000000 + i * 50000)); }
    await p.selectOption("select[name=vat]", "1"); await p.fill("input[name=durationDays]", "21"); await p.fill("input[name=startAvailable]", "2026-11-16"); await p.fill("textarea[name=extraConditions]", "없음");
    await p.click("label:has([data-testid=design-as_is])"); await p.locator('#proposal button:text-is("제안 제출")').click(); await p.waitForSelector("text=제안을 제출했습니다");
  }
  // 배치 변경 → r2
  await c.goto(`${B}/projects/${pid}/editor`); await c.waitForSelector("main.editor");
  await c.click("[data-testid=item-plant]", { force: true }); await c.fill("[data-testid=pos-x]", "600"); await c.press("[data-testid=pos-x]", "Enter");
  await c.click("[data-testid=editor-save]"); await c.waitForURL(/saved=/);
  await c.goto(`${B}/projects/${pid}`); await c.click("[data-testid=send-update]"); await c.waitForSelector("[data-testid=pending-changes]", { state: "detached" });
  await c.goto(`${B}/projects/${pid}/quotes`); body = await c.textContent("main");
  check("변경 뒤 업체 재확인 대기: ‘업체가 변경 내용을 확인 중입니다’", body.includes("업체가 변경 내용을 확인 중입니다") && !body.includes("운영자가 자료를 검토하고"));
  for (const [i, p] of vs.entries()) { await p.goto(`${B}/vendor/requests/${aids[i]}`); await p.click('button:has-text("확인했고 제안은 그대로 유지")'); await p.waitForTimeout(700); }
  // 보고서 상황처럼 계약 결과까지 기록한 뒤에도 이전 r1 안내가 맞는지
  await a.goto(`${B}/admin/projects/${pid}`);
  await a.selectOption("select[name=result]", "contracted");
  await a.locator("select[name=vendorId]").selectOption({ index: 1 });
  await a.fill("input[name=amount]", "5200"); await a.fill("input[name=date]", "2026-10-20");
  await a.click("button:has-text('결과 기록')"); await a.waitForTimeout(800);
  check("운영자 계약 결과 기록", sql(`select status from projects where id=${pid}`) === "contracted");
  await c.goto(`${B}/projects/${pid}/quotes?r=1`); await c.waitForSelector("[data-testid=shown-rev]");
  body = await c.textContent("main");
  await shot(c, "old-revision-r1-empty");
  check("이전 요청 r1 0건: ‘이 요청 기준으로 남아 있는 제안이 없습니다. 최신 요청 r2에서 확인해 주세요.’", body.includes("이 요청 기준으로 남아 있는 제안이 없습니다. 최신 요청 r2에서 확인해 주세요."), body.slice(body.indexOf("기준 요청"), body.indexOf("기준 요청") + 200));
  check("이전 요청 r1 0건: 운영자 배정 중 문구·‘r1 기준으로 받은 제안’ 경고 없음", !body.includes("운영자가 자료를 검토하고 시공사를 배정하는 중") && !body.includes("기준으로 받은 제안입니다"));
  const go = c.locator("[data-testid=old-rev-go-latest]");
  check("이전 요청 r1 0건: 최신 요청으로 이동 버튼", (await go.count()) === 1);
  if (await go.count()) { await go.click(); await c.waitForURL((u) => !u.search.includes("r=1")); }
  check("이동하면 최신 요청 r2 · 제안 2건(같은 기준끼리 비교 유지)", (await c.textContent("[data-testid=shown-rev]")).includes("요청 r2 · 최신 · 제안 2건") && (await c.textContent("[data-testid=same-basis]")).includes("요청 r2"));

  check("페이지 오류 없음", errors.length === 0, errors.join(" | "));
  console.log(results.join("\n"));
  console.log(`\n${results.filter((r) => r.startsWith("PASS")).length} passed, ${results.filter((r) => r.startsWith("FAIL")).length} failed`);
  await browser.close();
})().catch((e) => { console.log(results.join("\n")); console.error(e); process.exit(1); });
