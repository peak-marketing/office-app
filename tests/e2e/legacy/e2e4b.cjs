const { chromium } = require("playwright-core");
const { execSync } = require("child_process");
const { makeSpace, requestSpace, designAsIs } = require("./t8.cjs");
const B = (process.env.B || "http://localhost:3101");
const EMAIL = `r4_${Date.now()}@test.kr`;
const DB = (process.env.DB || "/private/tmp/claude-501/-Users-gimjinbong-Desktop--------/731f479b-8fe5-44a1-902c-3ab815fc5abf/scratchpad/testdata/app.db");
const sql = (q) => execSync(`sqlite3 "${DB}" "${q}"`).toString().trim();
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name} ${extra}`);
(async () => {
  const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const errors = [];
  const ctx = async (viewport = { width: 1440, height: 1000 }) => { const p = await (await browser.newContext({ viewport })).newPage(); p.on("pageerror", (e) => errors.push(e.message)); return p; };
  const login = async (p, email, pw = "demo1234") => { await p.goto(B + "/login"); await p.fill("input[name=email]", email); await p.fill("input[name=password]", pw); await p.click('main button:has-text("로그인")'); await p.waitForURL((u) => !u.pathname.startsWith("/login")); };
  const unread = async (p) => { await p.goto(B + "/notifications"); const t = await p.textContent("main"); const m = t.match(/읽지 않은 알림 (\d+)건/); return { n: m ? Number(m[1]) : 0, text: t }; };

  // 고객: 요청 등록
  const c = await ctx(); await c.goto(B + "/signup?next=/spaces/new");
  await c.fill("input[name=email]", EMAIL); await c.fill("input[name=password]", "testpass1"); await c.fill("input[name=name]", "오사차"); await c.fill("input[name=phone]", "010-7777-8888");
  await c.check("input[name=consent]"); await c.click('button:has-text("가입하기")'); await c.waitForURL(/\/spaces\/new/);
  const pid = String(await makeSpace(c, B, { skipGoto: true, title: "사차 비밀 프로젝트명", w: 11000, d: 9000, staff: 8 }));
  await requestSpace(c, B, pid, { region: "서울 중구", address: "서울 중구 비공개로 11" });
  const base = `${B}/projects/${pid}`;

  const admin = await ctx(); await login(admin, "admin@demo.kr");
  let u = await unread(admin); check("admin notified of new request", u.n >= 1 && u.text.includes("새 요청 접수: 사차 비밀 프로젝트명"));
  await admin.goto(`${B}/admin/projects/${pid}`);
  const boxes = admin.locator("input[name=vendor]"); for (let i = 0; i < 3; i++) await boxes.nth(i).check();
  await admin.click('button:has-text("선택한 업체 배정")'); await admin.waitForSelector("text=업체 3곳을 배정했습니다");

  // 집계 오류: 아직 참여하지 않은 업체는 '작성 중'이 아니다
  await c.goto(base); let main = await c.textContent("main");
  check("undecided vendors not counted as 작성 중", main.includes("3곳 참여 검토 중") && !main.includes("작성 중") && main.includes("0곳이 참여를 확정했습니다"), "");
  const v1 = await ctx(); await login(v1, "vendor1@demo.kr");
  u = await unread(v1); check("vendor notified of assignment, no private info", u.text.includes("새 요청이 배정되었습니다: 서울 중구") && !u.text.includes("비밀 프로젝트명") && !u.text.includes("비공개로"));
  await v1.click('button:has-text("새 요청이 배정되었습니다: 서울 중구")'); await v1.waitForURL(/\/vendor\/requests\/\d+/);
  check("notification opens request + marks read", sql(`select count(*) from notifications n join users u on u.id=n.user_id where u.email='vendor1@demo.kr' and n.title='새 요청이 배정되었습니다: 서울 중구' and n.project_id=${pid} and n.read_at is null`) === "0"); await v1.waitForSelector("canvas[data-viewer]");
  const reqUrl = v1.url(); const aid = reqUrl.split("/").pop();
  await v1.locator('aside button:has-text("참여하기")').click(); await v1.waitForSelector("#proposal select[name=vat]");
  await c.goto(base); main = await c.textContent("main");
  check("after accept: 1곳 작성 중 · 2곳 참여 검토 중", main.includes("1곳 작성 중 · 2곳 참여 검토 중") && main.includes("참여 확정 1곳"));
  u = await unread(c); check("customer notified: assigned + accepted", u.text.includes("시공사 3곳이 요청을 받았습니다") && u.text.includes("참여를 확정했습니다"));

  // 임시 저장
  await v1.fill("textarea[name=note]", "임시로 적어 둔 제안 요약"); await v1.fill("input[name=amount_demolition]", "1000000"); await v1.selectOption("select[name=status_fire]", "site_check"); await v1.fill("input[name=durationDays]", "21");
  await v1.waitForSelector("text=/임시 저장됨 \\d/", { timeout: 8000 });
  check("autosave wrote draft", sql(`select count(*) from quote_drafts where assignment_id=${aid}`) === "1" && sql(`select count(*) from quotes where assignment_id=${aid}`) === "0");
  await v1.reload(); await v1.waitForSelector("#proposal select[name=vat]");
  check("draft restored after reload", (await v1.inputValue("textarea[name=note]")) === "임시로 적어 둔 제안 요약" && (await v1.inputValue("input[name=amount_demolition]")) === "1000000" && (await v1.inputValue("select[name=status_fire]")) === "site_check" && (await v1.inputValue("input[name=durationDays]")) === "21" && (await v1.textContent("main")).includes("임시 저장한 내용을 불러왔습니다"));
  await v1.goto(B + "/vendor"); check("vendor list shows draft state", (await v1.textContent("main")).includes("작성 중 · 임시 저장됨"));
  await c.goto(`${base}/quotes`); check("draft invisible to customer", (await c.textContent("main")).includes("아직 도착한 제안이 없습니다") && !(await c.textContent("main")).includes("임시로 적어 둔"));
  await v1.goto(reqUrl); await v1.waitForSelector("#proposal select[name=vat]");
  await v1.click('#proposal button:text-is("제안 제출")'); await v1.waitForSelector("p[role=alert]");
  check("submit validates; draft values kept", (await v1.textContent("p[role=alert]")).includes("금액을 입력") && (await v1.inputValue("input[name=amount_demolition]")) === "1000000");

  const KEYS = ["demolition","partition","floor","ceiling","electric","network","hvac","fire","finish","plumbing","door","furniture","etc"];
  const fill = async (p, each, over = {}) => {
    for (const k of KEYS) {
      const o = over[k];
      if (o === "na" || o === "site_check") { await p.selectOption(`select[name=status_${k}]`, o); continue; }
      await p.selectOption(`select[name=status_${k}]`, "included"); await p.fill(`input[name=amount_${k}]`, String(o ?? each));
    }
    await p.selectOption("select[name=vat]", "1"); await p.fill("input[name=durationDays]", "21"); await p.fill("input[name=startAvailable]", "2026-11-16"); await p.fill("textarea[name=extraConditions]", "없음");
    await designAsIs(p);
  };
  await fill(v1, 1000000, { fire: "site_check" });
  await v1.click('#proposal button:text-is("제안 제출")'); await v1.waitForSelector("text=제안을 제출했습니다");
  check("submit clears draft, records revision 1", sql(`select count(*) from quote_drafts where assignment_id=${aid}`) === "0" && sql(`select count(*) from quote_revisions r join quotes q on q.id=r.quote_id where q.assignment_id=${aid}`) === "1");
  const v2 = await ctx(); await login(v2, "vendor2@demo.kr"); await v2.click('a:has-text("서울 중구 · 29.9평 사무실")'); await v2.waitForURL(/requests/);
  await v2.locator('aside button:has-text("참여하기")').click(); await v2.waitForSelector("#proposal select[name=vat]");
  await fill(v2, 900000, { fire: "site_check" }); await v2.fill("textarea[name=note]", "두 번째 업체 제안"); await v2.click('#proposal button:text-is("제안 제출")'); await v2.waitForSelector("text=제안을 제출했습니다");

  // 대표 금액 이름 · 미정 항목이 있으면 최저 숨김
  await c.goto(`${base}/quotes`); await c.waitForSelector("main li:has-text('현재 산정 금액')"); main = await c.textContent("main");
  check("label: 현재 산정 금액 · 부가세 포함", main.includes("현재 산정 금액 · 부가세 포함") && !main.includes("확정 금액 합계"));
  check("unresolved items → no 최저 (same scope)", (await c.locator('main .badge:text-is("최저")').count()) === 0 && main.includes("금액이 정해지지 않은 항목이 있어 ‘최저’를 표시하지 않았습니다") && !main.includes("공사 범위가 다릅니다"));
  check("pending text: undecided vendor not 작성 중", main.includes("아직 제안을 내지 않은 시공사: 1곳 참여 검토 중") && !main.includes("곳 작성 중"));
  await c.goto(base); check("overview: no 최저 either", (await c.locator('main .badge:text-is("최저")').count()) === 0);
  u = await unread(c); check("customer notified of proposals", (u.text.match(/의 제안이 도착했습니다/g) || []).length === 2);

  // 수정: 임시 저장은 고객에게 안 보이고, 제출하면 이력이 남는다
  await v1.reload(); await v1.waitForSelector("#proposal select[name=vat]");
  await v1.fill("input[name=amount_demolition]", "1200000"); await v1.fill("input[name=durationDays]", "28"); await v1.waitForSelector("text=/임시 저장됨 \\d/", { timeout: 8000 });
  await c.goto(`${base}/quotes`); main = await c.textContent("main");
  check("edit draft not visible to customer", main.includes("12,000,000원") && !main.includes("12,200,000원"));
  await v1.click('#proposal button:text-is("제안 수정 제출")'); await v1.waitForSelector("text=이전 제출본은 이력에 남습니다");
  await c.reload(); await c.locator('summary:has-text("수정 1회")').click(); main = await c.textContent("main");
  check("customer sees revised amount + history diff", main.includes("12,200,000원") && main.includes("철거·가설: 포함 1,000,000원 → 포함 1,200,000원") && main.includes("공사 기간: 21일 → 28일") && main.includes("1차 제출") && main.includes("2차 제출 · 현재"));
  check("previous submission preserved in DB", sql(`select group_concat(json_extract(r.snapshot,'$.duration_days')) from quote_revisions r join quotes q on q.id=r.quote_id where q.assignment_id=${aid} order by r.no`) === "21,28");
  await v1.reload(); check("vendor sees 제출 이력 2회", (await v1.textContent("main")).includes("제출 이력 · 2회"));
  await v1.click('#proposal button:text-is("제안 수정 제출")'); await v1.waitForSelector("text=달라진 내용이 없어");
  check("unchanged resubmit adds no revision", sql(`select count(*) from quote_revisions r join quotes q on q.id=r.quote_id where q.assignment_id=${aid}`) === "2");
  u = await unread(c); check("customer notified of revision", u.text.includes("제안을 수정했습니다") && u.text.includes("달라진 점 2건"));
  await c.click('button:has-text("제안을 수정했습니다")'); await c.waitForURL(/\/quotes$/); check("notification link → quotes tab", true);
  await c.goto(B + "/notifications"); await c.click('button:has-text("모두 읽음으로")'); await c.waitForSelector("text=새 알림이 없습니다"); check("mark all read", (await c.locator('header a:has-text("알림") span').count()) === 0);

  // 임시 저장 버리기
  await v2.reload(); await v2.waitForSelector("#proposal select[name=vat]"); await v2.fill("textarea[name=note]", "버릴 내용"); await v2.waitForSelector("text=/임시 저장됨 \\d/", { timeout: 8000 });
  await v2.click('button:has-text("임시 저장 버리기")'); await v2.waitForLoadState("load"); await v2.waitForSelector("#proposal select[name=vat]");
  check("discard draft restores submitted values", (await v2.inputValue("textarea[name=note]")) === "두 번째 업체 제안" && !(await v2.textContent("main")).includes("임시 저장한 내용을 불러왔습니다"));

  // 미정 항목을 모두 확정하면 최저가 다시 보인다
  for (const v of [v1, v2]) { await v.reload(); await v.waitForSelector("#proposal select[name=vat]"); await v.selectOption("select[name=status_fire]", "included"); await v.fill("input[name=amount_fire]", "500000"); await v.click('#proposal button:text-is("제안 수정 제출")'); await v.waitForSelector("text=이전 제출본은 이력에 남습니다"); }
  await c.goto(`${base}/quotes`); await c.waitForSelector("main li:has-text('현재 산정 금액')");
  check("all priced + same scope → 최저 on cheaper (vendor2)", (await c.locator('main li:has-text("모아공간") .badge:text-is("최저")').count()) >= 1 && (await c.locator('main li:has-text("온결") .badge:text-is("최저")').count()) === 0 && !(await c.textContent("main")).includes("‘최저’를 표시하지 않았습니다"));
  await c.screenshot({ path: "shots/70_quotes_history.png", fullPage: true });

  // 방문 요청 알림 · 공개 범위
  await c.locator('summary:has-text("상담·현장 방문 요청")').first().click(); await c.locator("input[name=preferred]").first().fill("11/9 오전"); await c.locator('button:has-text("요청 보내기")').first().click(); await c.waitForSelector("text=상담·현장 방문을 요청했습니다");
  u = await unread(v1); check("vendor notified of visit request", u.text.includes("고객이 상담·현장 방문을 요청했습니다") && u.text.includes("희망 일정: 11/9 오전") && !u.text.includes("비공개로 11"));
  u = await unread(v2); check("other vendor not notified, no address", !u.text.includes("방문을 요청") && !u.text.includes("비공개로"));
  await v1.goto(reqUrl); check("visited vendor sees address", (await v1.textContent("main")).includes("비공개로 11"));
  // 요청 뒤 배치 수정 → 저장만으로는 업체에 안 감 → ‘변경 내용 보내기’로 같은 업체에 알림(재배정 없음)
  await c.goto(`${base}/editor`); await c.waitForSelector("main.editor");
  await c.click("[data-testid=item-plant]", { force: true }); await c.fill("[data-testid=pos-y]", "1200"); await c.press("[data-testid=pos-y]", "Enter");
  await c.click("[data-testid=editor-save]"); await c.waitForURL(/saved=2/);
  u = await unread(v2); check("saving alone does not notify vendors", !u.text.includes("서울 중구 요청 내용이 바뀌었습니다"));
  await c.goto(base); await c.click("[data-testid=send-update]"); await c.waitForSelector("[data-testid=pending-changes]", { state: "detached" });
  u = await unread(v2); check("vendors told the request changed (r2, same vendors)", u.text.includes("서울 중구 요청 내용이 바뀌었습니다 (r2)") && sql(`select count(*) from assignments where project_id=${pid} and withdrawn_at is null and status != 'declined' and version_id=(select requested_version_id from projects where id=${pid})`) === "3");
  const m = await ctx({ width: 390, height: 844 }); await login(m, "vendor1@demo.kr"); await m.goto(B + "/notifications");
  check("mobile notifications no overflow", await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await m.screenshot({ path: "shots/71_mobile_notifications.png" });

  console.log(results.join("\n")); console.log("page errors:", errors.length, [...new Set(errors)].slice(0, 5).map((e) => e.slice(0, 200)));
  await browser.close();
})().catch((e) => { console.log(results.join("\n")); console.error("E2E ERROR", e.message.slice(0, 1200)); process.exit(1); });
