// P3(사용성 테스트): 업체 휴대폰(390px) 견적 작성 — 13개 항목 카드 입력·임시 저장·재접속·제출, 가로 스크롤 없음. PC 표는 유지.
const { chromium } = require("playwright-core");
const { execSync } = require("child_process");
const { makeSpace, requestSpace } = require("./t8.cjs");
const B = process.env.B || "http://localhost:3101";
const DB = process.env.DB || __dirname + "/testdata/app.db";
const sql = (q) => execSync(`sqlite3 "${DB}" "${q.replace(/"/g, '\\"')}"`).toString().trim();
const KEYS = ["demolition", "partition", "floor", "ceiling", "electric", "network", "hvac", "fire", "finish", "plumbing", "door", "furniture", "etc"];
const STATUS = ["included", "included", "separate", "included", "site_check", "included", "na", "included", "included", "site_check", "included", "separate", "na"];
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name} ${ok ? "" : extra}`);

(async () => {
  const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const errors = [];
  const ctx = async (opts = {}) => { const p = await (await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...opts })).newPage(); p.on("pageerror", (e) => errors.push(e.message)); return p; };
  const phone = () => ctx({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const login = async (p, email, pw = "demo1234") => { await p.goto(B + "/login"); await p.fill("input[name=email]", email); await p.fill("input[name=password]", pw); await p.click('main button:has-text("로그인")'); await p.waitForURL((u) => !u.pathname.startsWith("/login")); };

  // 고객 요청 → 운영자가 업체 1곳 배정
  const c = await ctx();
  const T = Date.now();
  await c.goto(B + "/signup"); await c.fill("input[name=email]", `p3c${T}@test.kr`); await c.fill("input[name=password]", "testpass1"); await c.fill("input[name=name]", "고객"); await c.check("input[name=consent]"); await c.click('button:has-text("가입하기")'); await c.waitForURL(/\/projects/);
  const pid = await makeSpace(c, B, { title: "P3 견적 테스트", w: 11000, d: 9000, staff: 8 });
  await requestSpace(c, B, pid, { budgetMin: 4000, budgetMax: 6000 });
  const a = await ctx(); await login(a, "admin@demo.kr");
  await a.goto(`${B}/admin/projects/${pid}`);
  await a.locator(`label:has-text("[예시] 스튜디오 온결") input[name=vendor]`).check();
  await a.click('button:has-text("선택한 업체 배정")'); await a.waitForSelector("text=업체 1곳을 배정했습니다");
  const aid = sql(`select a.id from assignments a join vendors x on x.id=a.vendor_id join users u on u.id=x.user_id where a.project_id=${pid} and u.email='vendor1@demo.kr'`);

  // 1. 휴대폰: 카드 입력, 가로 스크롤 없음
  let m = await phone(); await login(m, "vendor1@demo.kr");
  await m.goto(`${B}/vendor/requests/${aid}`);
  await m.locator('button:has-text("참여하기")').first().click(); await m.waitForSelector("[data-testid=quote-items]");
  const layout = await m.evaluate(() => {
    const t = document.querySelector("[data-testid=quote-items]");
    const wrap = t.parentElement;
    const cards = [...t.querySelectorAll("tbody tr")].map((tr) => tr.getBoundingClientRect());
    const name = t.querySelector("tbody tr td").getBoundingClientRect();
    return { page: document.documentElement.scrollWidth, wrapScroll: wrap.scrollWidth, wrapClient: wrap.clientWidth, cards: cards.length, maxRight: Math.max(...cards.map((r) => r.right)), minLeft: Math.min(...cards.map((r) => r.left)), nameW: name.width, theadShown: getComputedStyle(t.querySelector("thead")).display !== "none" };
  });
  check("휴대폰: 13개 항목이 카드로(표 머리 숨김)", layout.cards === 13 && !layout.theadShown, JSON.stringify(layout));
  check("휴대폰: 가로 스크롤 없음(페이지·항목 영역)", layout.page <= 390 && layout.wrapScroll <= layout.wrapClient + 1 && layout.maxRight <= 390 && layout.minLeft >= 0, JSON.stringify(layout));
  const card = await m.locator("[data-testid=quote-item-floor]").boundingBox();
  const parts = await m.evaluate(() => { const tr = document.querySelector("[data-testid=quote-item-floor]"); return [...tr.querySelectorAll("td")].map((td) => { const r = td.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), td.textContent.trim().slice(0, 12)]; }); });
  check("휴대폰: 한 카드 안에 항목명·구분·금액·사양이 모두 화면 안", parts.length === 4 && parts.every(([l, r]) => l >= 0 && r <= 390) && card.width <= 390, JSON.stringify(parts));
  // 13개 항목 입력
  const entered = {};
  for (const [i, k] of KEYS.entries()) {
    await m.selectOption(`select[name=status_${k}]`, STATUS[i]);
    const priced = STATUS[i] === "included" || STATUS[i] === "separate";
    if (priced) await m.fill(`input[name=amount_${k}]`, String((i + 1) * 110000));
    await m.fill(`input[name=spec_${k}]`, `사양 ${i + 1} · ${k}`);
    entered[k] = { status: STATUS[i], amount: priced ? (i + 1) * 110000 : null, spec: `사양 ${i + 1} · ${k}` };
  }
  await m.selectOption("select[name=vat]", "1"); await m.fill("input[name=durationDays]", "24");
  await m.locator('button:has-text("임시 저장")').first().click(); await m.waitForSelector("text=임시 저장됨");
  check("휴대폰: 13개 항목 임시 저장", true);
  await m.context().close();

  // 2. 재접속: 입력값 보존
  m = await phone(); await login(m, "vendor1@demo.kr");
  await m.goto(`${B}/vendor/requests/${aid}`); await m.waitForSelector("[data-testid=quote-items]");
  const back = await m.evaluate((keys) => Object.fromEntries(keys.map((k) => [k, { status: document.querySelector(`select[name=status_${k}]`).value, amount: document.querySelector(`input[name=amount_${k}]`).value, spec: document.querySelector(`input[name=spec_${k}]`).value }])), KEYS);
  const same = KEYS.every((k) => back[k].status === entered[k].status && (entered[k].amount == null ? back[k].amount === "" : Number(back[k].amount) === entered[k].amount) && back[k].spec === entered[k].spec);
  check("재접속: 13개 항목의 구분·금액·사양이 그대로", same, JSON.stringify(back).slice(0, 300));
  check("재접속: 부가세·기간도 그대로", (await m.inputValue("select[name=vat]")) === "1" && (await m.inputValue("input[name=durationDays]")) === "24");

  // 3. 제출
  await m.fill("input[name=startAvailable]", "2026-11-16"); await m.fill("textarea[name=extraConditions]", "없음");
  if (await m.locator("[data-testid=design-as_is]").count()) await m.click("label:has([data-testid=design-as_is])");
  await m.locator('#proposal button:text-is("제안 제출")').click(); await m.waitForSelector("text=제안을 제출했습니다");
  const items = JSON.parse(sql(`select items from quotes where assignment_id=${aid}`));
  const stored = Object.fromEntries(items.map((it) => [it.key, it]));
  check("제출: 저장된 13개 항목 = 입력값", KEYS.every((k) => stored[k] && stored[k].status === entered[k].status && (entered[k].amount == null ? stored[k].amount == null : stored[k].amount === entered[k].amount) && stored[k].spec === entered[k].spec), JSON.stringify(items).slice(0, 300));
  check("제출: 임시 저장본 정리", sql(`select count(*) from quote_drafts where assignment_id=${aid}`) === "0");

  // 4. PC는 표 그대로
  const pc = await ctx(); await login(pc, "vendor1@demo.kr");
  await pc.goto(`${B}/vendor/requests/${aid}`);
  const edit = pc.locator('button:has-text("제안 고치기"), a:has-text("제안 고치기"), summary:has-text("제안 고치기")');
  if (await edit.count()) await edit.first().click();
  if (await pc.locator("[data-testid=quote-items]").count()) {
    const pcLayout = await pc.evaluate(() => { const t = document.querySelector("[data-testid=quote-items]"); return { thead: getComputedStyle(t.querySelector("thead")).display, row: getComputedStyle(t.querySelector("tbody tr")).display }; });
    check("PC: 표(머리글·행) 그대로", pcLayout.thead === "table-header-group" && pcLayout.row === "table-row", JSON.stringify(pcLayout));
  } else check("PC: 표(머리글·행) 그대로", false, "양식을 열지 못함");

  check("페이지 오류 없음", errors.length === 0, errors.join(" | "));
  console.log(results.join("\n"));
  console.log(`\n${results.filter((r) => r.startsWith("PASS")).length} passed, ${results.filter((r) => r.startsWith("FAIL")).length} failed`);
  await browser.close();
  process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
})().catch((e) => { console.log(results.join("\n")); console.error(e); process.exit(1); });
