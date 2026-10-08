const { chromium } = require("playwright-core");
const { makeSpace, requestSpace, designAsIs } = require("./t8.cjs");
const { execSync } = require("child_process");
const B = (process.env.B || "http://localhost:3101");
const EMAIL = `r5_${Date.now()}@test.kr`;
const DB = (process.env.DB || "/private/tmp/claude-501/-Users-gimjinbong-Desktop--------/731f479b-8fe5-44a1-902c-3ab815fc5abf/scratchpad/testdata/app.db");
const sql = (q) => execSync(`sqlite3 "${DB}" "${q}"`, { maxBuffer: 64 * 1024 * 1024 }).toString().trim();
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name} ${ok ? "" : extra}`);
(async () => {
  const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const errors = [];
  const ctx = async (viewport = { width: 1440, height: 1000 }) => { const p = await (await browser.newContext({ viewport })).newPage(); p.on("pageerror", (e) => errors.push(e.message)); return p; };
  const login = async (p, email, pw = "demo1234") => { await p.goto(B + "/login"); await p.fill("input[name=email]", email); await p.fill("input[name=password]", pw); await p.click('main button:has-text("로그인")'); await p.waitForURL((u) => !u.pathname.startsWith("/login")); };
  const noOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const CASE = sql("select id from vendor_cases where title like '%뷰티 브랜드%'");
  const photos = sql(`select file_id from case_files where case_id=${CASE} order by position`).split("\n");

  // ── 1. 메인·사례 탐색 (비로그인)
  const c = await ctx();
  await c.goto(B + "/");
  const home = await c.textContent("main");
  check("home: big space cards with name, size, people, style and save", /* 주거 1차: 사무실 14 + 집 5, 사무실 카드 형식은 첫 사무실 카드로 본다 */ (await c.locator("[data-testid=home-cases] li[data-case] img").count()) === 19 && (await c.locator("[data-testid=home-cases] button[data-save-case]").count()) === 19 && /\d+평.*\d+명.*(내추럴|시크|러블리)/.test(await c.locator("[data-testid=home-cases] li[data-case]:not(:has-text('방 한 칸 3D'))").first().textContent()));
  check("home: filter chips for type/size/style", (await c.locator("[data-filter=type]").count()) === 1 && (await c.locator("[data-filter=size]").count()) === 1 && (await c.locator("[data-filter=style]").count()) === 1);
  await c.click("[data-filter=style]"); await c.click('.filter-popover button:has-text("시크")'); await c.waitForURL(/style=chic/);
  check("home: style filter applies in place", (await c.locator("[data-testid=home-cases] li[data-case]").count()) === 5 && (await c.locator("[data-testid=home-cases] li[data-case]").allTextContents()).every((t) => t.includes("시크")));
  await c.goto(B + "/");
  check("home: apply-to-my-space and vendors in the middle", (await c.locator('main a[href="/try"]:has-text("우리 공간에 적용해보기")').count()) >= 1 && (await c.locator('main a[href="/vendors"]').count()) >= 1 && !home.includes("자주 묻는 질문"));
  check("home: no invented stats/reviews", !/누적|만족도|후기|리뷰|\d[\d,]*\s*(건의|명의|개사)|\d+\s*%/.test(home));
  check("home: guest has no my-status", (await c.locator("[data-testid=my-status]").count()) === 0);
  await c.goto(B + "/cases?style=chic");
  let metas = await c.locator("main li[data-case]").allTextContents();
  check("cases: style filter", metas.length === 5 && metas.every((t) => t.includes("시크")), String(metas.length));
  await c.goto(B + "/cases?size=30"); metas = await c.locator("main li[data-case]").allTextContents();
  check("cases: size filter", metas.length > 0 && metas.every((t) => /3\d평/.test(t)), String(metas.length));
  await c.goto(B + "/cases?region=" + encodeURIComponent("경기")); metas = await c.locator("main li[data-case]").allTextContents();
  check("cases: region filter", metas.length === 3, String(metas.length));
  await c.goto(B + "/cases?style=lovely&size=30"); check("cases: combined filters", (await c.locator("main li[data-case]").count()) === 2);
  await c.goto(B + "/cases?q=" + encodeURIComponent("스타트업")); check("cases: text search", (await c.locator("main li[data-case]").count()) === 4);

  // 비로그인 저장 → 로그인 화면
  await c.goto(`${B}/cases/${CASE}`);
  await c.locator("aside button[data-save-case]").click(); await c.waitForURL(/\/login\?next=/);
  check("guest save → login with return path", decodeURIComponent(c.url()).includes(`next=/cases/${CASE}`));

  // ── 2. 가입 후 사례 저장 · 관심 업체는 따로
  await c.goto(`${B}/signup?next=${encodeURIComponent(`/cases/${CASE}`)}`);
  await c.fill("input[name=email]", EMAIL); await c.fill("input[name=password]", "testpass1"); await c.fill("input[name=name]", "오차고객"); await c.fill("input[name=phone]", "010-1212-3434");
  await c.check("input[name=consent]"); await c.click('button:has-text("가입하기")'); await c.waitForURL(new RegExp(`/cases/${CASE}$`));
  const uid = sql(`select id from users where email='${EMAIL}'`);
  await c.locator("aside button[data-save-case]").click(); await c.waitForSelector('aside button[data-save-case]:has-text("저장한 공간")');
  check("saved case stored; favorites untouched", sql(`select count(*) from saved_cases where user_id=${uid} and case_id=${CASE}`) === "1" && sql(`select count(*) from favorites where user_id=${uid}`) === "0");
  await c.locator('aside button:has-text("관심 업체로 담기")').click(); await c.waitForSelector('aside button:has-text("관심 업체에 담김")');
  check("favorite vendor stored separately", sql(`select count(*) from favorites where user_id=${uid}`) === "1" && sql(`select count(*) from saved_cases where user_id=${uid}`) === "1");
  await c.goto(B + "/saved");
  check("saved page: cases and vendors in separate lists", (await c.locator("[data-testid=saved-cases] li[data-case]").count()) === 1 && (await c.locator("[data-testid=saved-vendors] > li").count()) === 1);

  // ── 3. 사례 상세 → 이런 공간으로 제안받기 → 요청서에 연결
  await c.goto(`${B}/cases/${CASE}`);
  await c.click('button[aria-label="사진 2"]');
  await c.locator('aside a[data-testid=request-like-this]').click(); await c.waitForURL(/\/spaces\/new\?/);
  check("request starts with case + chosen photo", c.url().includes(`case=${CASE}`) && c.url().includes(`photo=${photos[1]}`));
  check("space wizard: case banner + prefilled from case", (await c.textContent("[data-testid=start-case]")).includes("뷰티 브랜드 30평 사무실") && (await c.inputValue("[data-testid=staff]")) === "8" && (await c.locator('input[placeholder="예: 30"]').inputValue()) === "30");
  const pid = String(await makeSpace(c, B, { skipGoto: true, title: "오차 비공개 프로젝트", w: 11000, d: 9000, staff: 10, priority: "collab" }));
  const base = `${B}/projects/${pid}`;
  check("project_refs row: case + chosen photo", sql(`select case_id||'|'||file_id from project_refs where project_id=${pid}`) === `${CASE}|${photos[1]}`);
  await c.goto(base);
  let main = await c.textContent("main");
  check("overview: reference case shown", (await c.locator("[data-testid=overview-refs] img").count()) === 1 && main.includes("참고 사례 1건"));

  // ── 4. 배치: 목적이 다른 대안, 이유·장단점, 스타일과 분리
  await c.goto(`${base}/plan`); await c.waitForSelector("canvas[data-viewer]");
  const result = JSON.parse(sql(`select result from versions where project_id=${pid}`));
  const ids = result.options.map((o) => o.id);
  check("layout: purpose-based options generated", ids.length >= 2 && ids.every((id) => ["visitor", "collab", "focus"].includes(id)), ids.join(","));
  const meet = result.options.map((o) => { const r = o.rooms.find((x) => x.key === "meeting"); return `${r.x},${r.y},${r.w},${r.d}`; });
  const seatXY = result.options.map((o) => o.marks.seats.map((s) => `${s.x},${s.y}`).join(";"));
  check("layout: room positions differ between options", new Set(meet).size === ids.length, meet.join(" / "));
  check("layout: seat positions and seating types differ", new Set(seatXY).size === ids.length && new Set(result.options.map((o) => o.metrics.seating)).size === ids.length);
  check("layout: every option keeps required seats and rooms", result.options.every((o) => o.marks.seats.length === 10 && ["ceo", "meeting", "pantry"].every((k) => o.rooms.some((r) => r.key === k))));
  check("layout: each option has reasons, pros, cons", result.options.every((o) => o.reasons.length >= 2 && o.pros.length >= 1 && o.cons.length >= 1));
  check("layout: recommended follows priority, preselected", result.recommended === "collab" ? sql(`select selected_option from versions where project_id=${pid}`) === "collab" : result.recommended === null, String(result.recommended));
  await c.goto(`${base}/editor`); await c.waitForSelector("main.editor");
  check("editor: one start chip per option (+ 빈 공간)", (await c.locator("button[data-testid^=start-]").count()) === ids.length + 1);
  const whys = [];
  for (const id of ids) { await c.click(`[data-testid=start-${id}]`); await c.waitForTimeout(200); whys.push(await c.textContent("[data-testid=start-info]")); }
  await c.click("[data-testid=start-collab]");
  check("editor: start info changes per option and lists pros/cons", new Set(whys).size === ids.length && whys.every((t) => t.includes("＋") && t.includes("－")));
  check("editor: back on saved start → nothing to save", (await c.textContent("[data-testid=editor-save]")) === "저장됨");
  await c.goto(`${base}/plan`); await c.waitForSelector("canvas[data-viewer]");
  main = await c.textContent("main");
  check("plan: real/assumed coverage on plan tab", (await c.locator("main [data-testid=space-facts]").count()) === 1 && main.includes("입력한 치수로"));
  const target = "collab";
  await c.click('[data-testid=style-picker] button[data-style=chic]'); await c.waitForTimeout(900);
  check("plan: style saved independently of layout", sql(`select selected_option||'|'||selected_style from versions where project_id=${pid}`) === `${target}|chic`);
  await c.click('[data-testid=style-picker] button[data-style=lovely]'); await c.waitForTimeout(900);
  check("style change keeps layout", sql(`select selected_option||'|'||selected_style from versions where project_id=${pid}`) === `${target}|lovely`);

  // ── 5. 조건을 바꾸면 배치가 달라지는가 (체험 화면)
  const t = await ctx(); await t.goto(B + "/try"); await t.waitForSelector("canvas[data-viewer]");
  check("try: default gives three purpose layouts", (await t.locator("button[data-option]").count()) === 3);
  const thumbs0 = await t.locator("button[data-option] svg").evaluateAll((els) => els.map((e) => e.innerHTML));
  check("try: thumbnails are different drawings", new Set(thumbs0).size === 3);
  await t.click('button:has-text("전면 왼쪽")'); await t.waitForTimeout(600);
  const thumbsL = await t.locator("button[data-option] svg").evaluateAll((els) => els.map((e) => e.innerHTML));
  check("try: entrance side changes every layout", thumbsL.every((h, i) => h !== thumbs0[i]));
  await t.click('button[aria-label="좌석 늘리기"]'); await t.click('button[aria-label="좌석 늘리기"]'); await t.waitForTimeout(600);
  const n10 = await t.locator("button[data-option]").count();
  check("try: more staff changes result", (await t.locator("button[data-option] svg").first().innerHTML()) !== thumbsL[0] || n10 !== 3);
  await t.uncheck('label:has-text("회의실") input'); await t.uncheck('label:has-text("대표실") input'); await t.waitForTimeout(600);
  const skipped = await t.textContent("[data-testid=layout-skipped]");
  check("try: no guest room → visitor layout not forced, reason shown", (await t.locator('button[data-option="visitor"]').count()) === 0 && skipped.includes("방문객 응대 중심") && skipped.includes("회의실이나 대표실이 없어"));
  await t.selectOption("#demo-priority", "focus"); await t.waitForTimeout(500);
  check("try: priority marks matching layout", (await t.locator('button[data-option="focus"]:has-text("우선순위와 맞음")').count()) === 1 && (await t.locator('button[data-option="focus"][aria-pressed=true]').count()) === 1);
  await t.goto(B + "/try?area=20&staff=24"); await t.waitForSelector("[data-testid=demo-review]");
  check("try: infeasible → review, no forced layout", (await t.locator("button[data-option]").count()) === 0 && (await t.textContent("[data-testid=demo-review]")).includes("억지로 배치안을 만들지 않습니다"));

  // ── 6. 요청 → 운영자 → 시공사 화면까지 참고 사례 연결
  await requestSpace(c, B, pid, { region: "서울 강서구", address: "서울 강서구 숨김로 55" });
  const admin = await ctx(); await login(admin, "admin@demo.kr"); await admin.goto(`${B}/admin/projects/${pid}`);
  main = await admin.textContent("main");
  check("admin: sees reference case, chosen photo, note, vendor hint", main.includes("고객이 연결한 참고 사례 · 1건") && main.includes("뷰티 브랜드 30평 사무실") && main.includes("고객이 고른 사진") && main.includes("참고 사례의 시공사") && main.includes("♥ 고객 관심 업체"));
  const boxes = admin.locator("input[name=vendor]"); for (let i = 0; i < 3; i++) await boxes.nth(i).check();
  await admin.click('button:has-text("선택한 업체 배정")'); await admin.waitForSelector("text=업체 3곳을 배정했습니다");

  const KEYS = ["demolition","partition","floor","ceiling","electric","network","hvac","fire","finish","plumbing","door","furniture","etc"];
  const fill = async (p, each) => {
    for (const k of KEYS) { await p.selectOption(`select[name=status_${k}]`, "included"); await p.fill(`input[name=amount_${k}]`, String(each)); }
    await p.selectOption("select[name=vat]", "1"); await p.fill("input[name=durationDays]", "21"); await p.fill("input[name=startAvailable]", "2026-11-16"); await p.fill("textarea[name=extraConditions]", "없음");
    await designAsIs(p);
  };
  const v3 = await ctx(); await login(v3, "vendor3@demo.kr"); await v3.click('a:has-text("서울 강서구 · 29.9평 사무실")'); await v3.waitForURL(/requests/); await v3.waitForSelector("canvas[data-viewer]");
  main = await v3.textContent("main");
  check("vendor(owner): reference case with chosen photo and note", main.includes("고객이 참고한 사례 · 1건") && main.includes("뷰티 브랜드 30평 사무실") && main.includes("고객이 고른 사진") && main.includes("우리 업체 사례"));
  check("vendor: first ref photo is the chosen one", (await v3.locator("[data-testid=ref-cases] li li img").first().getAttribute("src")) === `/files/${photos[1]}`);
  check("vendor: sees customer's layout + style as basis", main.includes("고객이 보낸 배치") && main.includes("· 러블리"), "");
  check("vendor: no title/address/contact before visit", !main.includes("오차 비공개 프로젝트") && !main.includes("숨김로") && !main.includes("010-1212-3434") && !main.includes(EMAIL));
  await v3.locator('aside button:has-text("참여하기")').click(); await v3.waitForSelector("#proposal select[name=vat]");
  await fill(v3, 1100000); await v3.click('#proposal button:text-is("제안 제출")'); await v3.waitForSelector("text=제안을 제출했습니다");
  const v1 = await ctx(); await login(v1, "vendor1@demo.kr"); await v1.click('a:has-text("서울 강서구 · 29.9평 사무실")'); await v1.waitForURL(/requests/); await v1.waitForSelector("canvas[data-viewer]");
  main = await v1.textContent("main");
  check("vendor(other): sees reference but not marked own", main.includes("고객이 참고한 사례 · 1건") && main.includes("뷰티 브랜드 30평 사무실") && !main.includes("우리 업체 사례"));
  await v1.locator('aside button:has-text("참여하기")').click(); await v1.waitForSelector("#proposal select[name=vat]");
  await fill(v1, 1000000); await v1.click('#proposal button:text-is("제안 제출")'); await v1.waitForSelector("text=제안을 제출했습니다");

  // ── 7. 고른 배치와 참고 자료를 기준으로 제안 비교
  await c.goto(`${base}/quotes`); await c.waitForSelector("main li:has-text('현재 산정 금액')"); main = await c.textContent("main");
  check("compare: two proposals on the chosen layout version", (await c.locator("main li:has-text('현재 산정 금액 · 부가세 포함')").count()) >= 2 && main.includes("러블리 도면 보기") && (await c.locator('main .badge:text-is("최저")').count()) >= 1);
  await c.goto(base); main = await c.textContent("main");
  check("overview: basis = layout + style + reference", main.includes("· 러블리") && main.includes("참고 사례 1건") && main.includes("제안 2건이 도착했습니다"));
  // 요청 뒤 배치를 바꿔 저장하면 새 버전이 되고, 업체가 받은 기준(버전 1)은 그대로다
  await c.goto(`${base}/editor`); await c.waitForSelector("main.editor");
  await c.click(`[data-testid=start-${ids.find((id) => id !== target)}]`); await c.click("[data-testid=editor-save]"); await c.waitForURL(/saved=2/);
  check("version rule kept: layout change after request forks v2, sent basis stays v1", sql(`select count(*) from versions where project_id=${pid}`) === "2" && sql(`select requested_version_id=(select id from versions where project_id=${pid} and no=1) from projects where id=${pid}`) === "1");

  // ── 8. 로그인 후 메인 · 참고 사례 추가/해제
  await c.goto(B + "/"); const my = await c.textContent("[data-testid=my-status]");
  check("home(logged in): request, proposals, saved cases", my.includes("진행 중인 요청") && my.includes("도착한 제안 2") && my.includes("저장한 공간 1"));
  await c.goto(`${base}/info`);
  await c.click('button[aria-label="참고 사례 연결 해제"]'); await c.waitForSelector("text=연결한 참고 사례가 없습니다");
  check("info: reference removed", sql(`select count(*) from project_refs where project_id=${pid}`) === "0");
  await c.fill('#refs input[name=note]', "다시 연결"); await c.click('#refs button:has-text("연결하기")'); await c.waitForSelector("#refs [data-testid=ref-cases]");
  check("info: reference re-added from saved cases", sql(`select case_id||'|'||note from project_refs where project_id=${pid}`) === `${CASE}|다시 연결`);

  // ── 9. 모바일
  const m = await ctx({ width: 390, height: 844 });
  await m.goto(B + "/login"); await m.fill("input[name=email]", EMAIL); await m.fill("input[name=password]", "testpass1"); await m.click('main button:has-text("로그인")'); await m.waitForURL((u) => !u.pathname.startsWith("/login"));
  for (const [name, url] of [["home", "/"], ["cases", "/cases"], ["case", `/cases/${CASE}`], ["saved", "/saved"], ["try", "/try"], ["guide", "/guide"], ["wizard", `/spaces/new?case=${CASE}`], ["editor", `/projects/${pid}/editor`], ["plan", `/projects/${pid}/plan`], ["info", `/projects/${pid}/info`], ["quotes", `/projects/${pid}/quotes`]]) {
    await m.goto(B + url); await m.waitForTimeout(500); check(`mobile no overflow: ${name}`, await noOverflow(m));
  }
  await m.goto(`${B}/cases/${CASE}`);
  check("mobile case: sticky request bar", await m.locator('[data-testid=detail-cta] a:has-text("이 분위기로 제안받기")').isVisible() && (await m.locator(".mobile-navigation").count()) === 0);
  await m.goto(`${B}/projects/${pid}/plan`); await m.waitForSelector("[data-testid=space-view]");
  check("mobile plan: space view + style picker visible", (await m.locator("[data-testid=space-view]").isVisible()) && (await m.locator("[data-testid=style-picker]").isVisible()));

  console.log(results.join("\n")); console.log("page errors:", errors.length, errors.slice(0, 3));
  await browser.close();
})().catch((e) => { console.log(results.join("\n")); console.error("E2E ERROR", e.message.slice(0, 700)); process.exit(1); });
