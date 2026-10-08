const { chromium } = require("playwright-core");
const { makeSpace, requestSpace, designAsIs } = require("./t8.cjs");
const B = (process.env.B || "http://localhost:3101");
const T = Date.now();
const EMAIL = `r3_${T}@test.kr`, PEMAIL = `partner_${T}@test.kr`;
const PHOTO = "/Users/gimjinbong/Desktop/인테러이 도면/output/3D_배치도.png";
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name} ${extra}`);
(async () => {
  const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const errors = [];
  const ctx = async (viewport = { width: 1440, height: 1000 }) => { const p = await (await browser.newContext({ viewport })).newPage(); p.on("pageerror", (e) => errors.push(e.message)); return p; };
  const login = async (p, email, pw = "demo1234") => { await p.goto(B + "/login"); await p.fill("input[name=email]", email); await p.fill("input[name=password]", pw); await p.click('main button:has-text("로그인")'); await p.waitForURL((u) => !u.pathname.startsWith("/login")); };
  const noOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

  // 1. 메인
  const c = await ctx();
  await c.goto(B + "/");
  const home = await c.textContent("main");
  check("home: exploration first (space cards, filters)", /* 주거 1차: 사무실 예시 14 + 집 예시 5, 제목 ‘이런 공간 어때요?’ */ (await c.locator('[data-testid=home-cases] li[data-case]').count()) === 19 && home.includes("이런 공간 어때요?") && (await c.locator("[data-testid=filter-bar]").count()) === 1 && (await c.locator('a[href="/guide"]').count()) >= 1 && !home.includes("이것만 등록하면 됩니다"));
  check("home: CTA to request and layout", (await c.locator('main a:has-text("시공 제안 받기")').first().getAttribute("href")).includes("/signup?next=") && (await c.locator('main a:has-text("우리 공간에 적용해보기")').first().getAttribute("href")) === "/try");
  check("home: partner entry visible", (await c.locator('header a:has-text("파트너 입점")').count()) === 1);
  await c.goto(B + "/guide"); const guide = await c.textContent("main"); check("guide: holds the long explanation", ["진행 순서", "배치 제안은 이렇게 만듭니다", "금액만이 아니라 범위까지 비교합니다", "자주 묻는 질문", "전달만"].every((t) => guide.includes(t)) && guide.includes("실제 업체의 견적이 아닙니다"));
  check("home: example data labelled", home.includes("3D 제안 예시 · 실제 시공 사진 아님"));
  check("home: no invented stats/reviews", !/누적|만족도|후기|리뷰|\d[\d,]*\s*(건의|명의|개사)/.test(home), (home.match(/누적|만족도|후기|리뷰|\d+\s*%/) || []).join(","));
  check("guide example: no 최저 across different scope", (await c.locator('main .badge:text-is("최저")').count()) === 0); await c.goto(B + "/");

  // 2. 배치 체험 → B 배치 유지
  await c.click('main a:has-text("우리 공간에 적용해보기") >> nth=0'); await c.waitForURL(/\/try/); await c.waitForSelector("canvas[data-viewer]");
  await c.fill("#demo-area", "40"); await c.waitForTimeout(500); await c.click('button[data-option="focus"]'); await c.click('button[aria-pressed]:has-text("시크")'); await c.waitForTimeout(800);
  await c.click('a:has-text("이 조건으로 내 공간 만들기")'); await c.waitForURL(/\/signup\?next=/);
  check("try: chosen layout in next url", decodeURIComponent(c.url()).includes("option=focus") && decodeURIComponent(c.url()).includes("/spaces/new"));
  await c.fill("input[name=email]", EMAIL); await c.fill("input[name=password]", "testpass1"); await c.fill("input[name=name]", "한삼차"); await c.fill("input[name=phone]", "010-5555-6666");
  await c.check("input[name=consent]"); await c.click('button:has-text("가입하기")'); await c.waitForURL(/\/spaces\/new\?/);
  check("space wizard: try conditions carried after signup (priority focus, 40평 대조)", (await c.inputValue("select[name=priority]")) === "focus" && (await c.locator('input[placeholder="예: 30"]').inputValue()) === "40");
  const pid = String(await makeSpace(c, B, { skipGoto: true, title: "삼차 테스트 사무실", w: 12700, d: 10400, staff: 8 }));
  check("editor: try layout(focus) is the start", (await c.getAttribute("main.editor", "data-start")) === "focus");
  await requestSpace(c, B, pid, { region: "서울 송파구", address: "서울 송파구 감춤길 3", photo: PHOTO });
  const base = `${B}/projects/${pid}`;
  let main = await c.textContent("main");
  check("project: overview shows stage/vendors/proposals/next action", ["진행 단계", "참여 시공사", "도착한 제안", "지금 할 일", "업체에 보낸 배치"].every((t) => main.includes(t)) && main.includes("운영자가 요청을 검토하고 있습니다"), "");
  await c.click('nav[aria-label="프로젝트 메뉴"] a:has-text("공간·배치")'); await c.waitForURL(/\/plan$/); await c.waitForSelector("canvas[data-viewer]");
  check("plan tab: sent layout marked", (await c.textContent("[data-testid=version-chips]")).includes("업체에 보냄 r1"));

  // 3. 파트너 입점 신청
  const pa = await ctx(); await pa.goto(B + "/partners");
  await pa.fill("input[name=company]", "새로온 시공"); await pa.fill("input[name=name]", "박담당"); await pa.fill("input[name=email]", PEMAIL); await pa.fill("input[name=password]", "testpass1");
  await pa.check("input[name=consent]"); await pa.click('button:has-text("파트너 입점 신청")'); await pa.waitForURL(/\/vendor$/);
  check("partner signup → vendor dashboard pending", (await pa.textContent("main")).includes("운영자 승인 대기 중"));
  const admin = await ctx(); await login(admin, "admin@demo.kr");
  await admin.goto(B + "/admin/vendors"); check("admin sees partner application", (await admin.textContent("main")).includes("새로온 시공"));
  await admin.goto(`${B}/admin/projects/${pid}`);
  const boxes = admin.locator("input[name=vendor]"); for (let i = 0; i < 3; i++) await boxes.nth(i).check();
  await admin.click('button:has-text("선택한 업체 배정")'); await admin.waitForSelector("text=업체 3곳을 배정했습니다");

  // 4. 시공사: 요청 파악 → 참여 → 제안
  const KEYS = ["demolition","partition","floor","ceiling","electric","network","hvac","fire","finish","plumbing","door","furniture","etc"];
  const propose = async (p, each, over = {}, submitLabel = "제안 제출") => {
    for (const k of KEYS) {
      const o = over[k];
      if (o === "na" || o === "site_check") { await p.selectOption(`select[name=status_${k}]`, o); continue; }
      await p.selectOption(`select[name=status_${k}]`, o?.[0] ?? "included"); await p.fill(`input[name=amount_${k}]`, String(o?.[1] ?? each)); await p.fill(`input[name=spec_${k}]`, `${k} 사양`);
    }
    await designAsIs(p);
    await p.fill("textarea[name=note]", "차음을 우선한 제안입니다."); await p.selectOption("select[name=vat]", "1"); await p.fill("input[name=durationDays]", "21"); await p.fill("input[name=startAvailable]", "2026-11-16"); await p.fill("textarea[name=extraConditions]", "없음");
    await p.click(`#proposal button:text-is("${submitLabel}")`); await p.waitForSelector("text=제안을 제출했습니다");
  };
  const v1 = await ctx(); await login(v1, "vendor1@demo.kr");
  let vm = await v1.textContent("main");
  check("vendor dashboard: sections + decision needed", vm.includes("참여할 요청") && vm.includes("제출한 제안") && vm.includes("참여 여부 결정 필요"));
  await v1.screenshot({ path: "shots/60_vendor_dash.png", fullPage: true });
  await v1.click('a:has-text("서울 송파구 · 40평 사무실")'); await v1.waitForURL(/requests\/\d+/); await v1.waitForSelector("canvas[data-viewer]");
  vm = await v1.textContent("main");
  check("vendor detail: facts (region/area/use/budget/schedule/scope)", ["지역", "면적·인원", "공간 용도", "예산", "희망 일정", "요청 범위", "고객이 보낸 배치"].every((t) => vm.includes(t)) && vm.includes("서울 송파구") && vm.includes("사무실"));
  check("vendor detail: no address/contact/title before visit", !vm.includes("감춤길") && !vm.includes("010-5555-6666") && !vm.includes(EMAIL) && !vm.includes("삼차 테스트") && !vm.includes("한삼차"));
  check("vendor detail: proposal form gated until accept", (await v1.locator("#proposal select[name=vat]").count()) === 0 && vm.includes("모든 참여 업체가 같은 배치를 받습니다"));
  await v1.locator('aside button:has-text("참여하기")').click(); await v1.waitForSelector("#proposal select[name=vat]");
  await c.goto(base); main = await c.textContent("main");
  check("customer sees participation", main.includes("참여 확정 1곳") && main.includes("작성 중") && main.includes("시공사 3곳이 요청을 받았습니다"));
  await propose(v1, 1000000, { hvac: ["separate", 2000000] });
  const v2 = await ctx(); await login(v2, "vendor2@demo.kr"); await v2.click('a:has-text("서울 송파구 · 40평 사무실")'); await v2.waitForURL(/requests/);
  await v2.locator('aside button:has-text("참여하기")').click(); await v2.waitForSelector("#proposal select[name=vat]"); await propose(v2, 1050000);
  const v3 = await ctx(); await login(v3, "vendor3@demo.kr"); await v3.click('a:has-text("서울 송파구 · 40평 사무실")'); await v3.waitForURL(/requests/);
  await v3.locator('aside button:has-text("참여 안 함")').click(); await v3.waitForURL(/\/vendor$/);
  check("vendor3 declined → in past list", (await v3.textContent("main")).includes("참여 안 함"));

  // 5. 비교: 별도 vs 포함 = 같은 범위, 별도까지 더해 비교
  await c.goto(`${base}/quotes`); await c.waitForSelector("main li:has-text('현재 산정 금액')");
  main = await c.textContent("main");
  check("separate vs included: same scope, payable 14,000,000 vs 13,650,000", main.includes("14,000,000원") && main.includes("13,650,000원") && main.includes("별도 비용") && !main.includes("공사 범위가 다릅니다"));
  check("최저 on vendor2 (lower payable incl. separate)", (await c.locator('main li:has-text("모아공간") .badge:text-is("최저")').count()) === 1 && (await c.locator('main li:has-text("온결") .badge:text-is("최저")').count()) === 0);
  check("card shows cases + proposal summary + legend", main.includes("시공 사례 5건") && main.includes("차음을 우선한 제안입니다.") && main.includes("항목 구분 읽는 법") && main.includes("공사 범위와 자재 사양") && main.includes("hvac 사양"));
  check("quotes tab: duplicate compare button hidden", (await c.locator('a:has-text("제안 비교하기")').count()) === 0);
  await c.goto(base); check("overview: compare button shown", (await c.locator('a:has-text("제안 비교하기")').count()) === 1 && (await c.textContent("main")).includes("참여 안 함"));
  await c.screenshot({ path: "shots/61_overview.png", fullPage: true });
  // 현장 확인 필요 → 범위 다름
  await v2.selectOption("select[name=status_fire]", "site_check"); await v2.click('#proposal button:text-is("제안 수정 제출")'); await v2.waitForSelector("text=제안을 제출했습니다");
  await c.goto(`${base}/quotes`); await c.waitForSelector("text=시공사마다 공사 범위가 다릅니다"); main = await c.textContent("main");
  check("site_check: no 최저, labelled 금액 미정", (await c.locator('main .badge:text-is("최저")').count()) === 0 && main.includes("금액 미정 1항목") && main.includes("현장 확인 뒤 더해집니다"));
  check("common-sum caveat shown", main.includes("자재, 수량, 공사 범위가 같다는 뜻은 아닙니다"));
  // 해당 없음 → 범위 제외로 따로 표시
  await v1.selectOption("select[name=status_furniture]", "na"); await v1.click('#proposal button:text-is("제안 수정 제출")'); await v1.waitForSelector("text=제안을 제출했습니다");
  await c.reload(); await c.waitForSelector("text=시공사마다 공사 범위가 다릅니다"); main = await c.textContent("main");
  check("na vs site_check distinguished", main.includes("공사 범위에 없음 1항목") && main.includes("금액 미정 1항목") && /가구[\s\S]{0,80}해당 없음/.test(main) && /소방[\s\S]{0,120}현장 확인 필요/.test(main));
  await c.screenshot({ path: "shots/62_quotes.png", fullPage: true });

  // 6. 방문 요청 · 공개 범위
  await c.locator('summary:has-text("상담·현장 방문 요청")').first().click(); await c.locator("input[name=preferred]").first().fill("11/5 오후"); await c.locator('button:has-text("요청 보내기")').first().click(); await c.waitForSelector("text=상담·현장 방문을 요청했습니다");
  await v1.reload(); check("visited vendor sees address+contact", (await v1.textContent("main")).includes("감춤길 3") && (await v1.textContent("main")).includes("010-5555-6666"));
  await v2.reload(); check("other vendor still does not", !(await v2.textContent("main")).includes("감춤길"));
  await c.goto(B + "/projects"); main = await c.textContent("main");
  check("request list: stage, vendors, proposals, next action", main.includes("내 공간") && main.includes("참여 시공사 2곳") && main.includes("도착한 제안 2건") && main.includes("지금 할 일") && main.includes("상담·현장 방문"));
  await c.screenshot({ path: "shots/63_requests.png", fullPage: true });

  // 7. 업체 탐색 · 예시 표시 · 관심 업체
  await c.goto(B + "/cases"); check("cases: every example image labelled", (await c.locator('main li[data-case] .kind-example').count()) === 19 /* 주거 1차: 사무실 14 + 집 5 */); await c.goto(B + "/vendors");
  await c.locator('button[aria-label="관심 업체로 담기"]').first().click(); await c.waitForSelector('a:has-text("♥ 관심 업체 1")'); check("favorites kept", true);
  await c.goto(B + "/vendors/1"); check("vendor detail labelled", (await c.textContent("main")).split("3D 제안 예시 · 실제 시공 사진 아님").length - 1 >= 4);

  // 8. 모바일
  const m = await ctx({ width: 390, height: 844 }); await login(m, EMAIL, "testpass1");
  for (const [name, url] of [["home", "/"], ["requests", "/projects"], ["overview", base.replace(B, "")], ["quotes", base.replace(B, "") + "/quotes"], ["vendors", "/vendors"], ["cases", "/cases"], ["case", "/cases/1"], ["guide", "/guide"], ["saved", "/saved"], ["try", "/try"], ["partners", "/partners"]]) { await m.goto(B + url); await m.waitForTimeout(400); check(`mobile no overflow: ${name}`, await noOverflow(m)); }
  const mv = await ctx({ width: 390, height: 844 }); await login(mv, "vendor2@demo.kr"); check("mobile no overflow: vendor dash", await noOverflow(mv));
  await mv.click('a:has-text("서울 송파구 · 40평 사무실")'); await mv.waitForURL(/requests/); await mv.waitForSelector("canvas[data-viewer]");
  check("mobile vendor detail: no overflow + sticky action", (await noOverflow(mv)) && (await mv.locator('div.fixed a:has-text("제안 수정하기")').isVisible()));

  console.log(results.join("\n")); console.log("page errors:", errors.length, [...new Set(errors)].slice(0, 5).map((e) => e.slice(0, 200)));
  await browser.close();
})().catch((e) => { console.log(results.join("\n")); console.error("E2E ERROR", e.message.slice(0, 1200)); process.exit(1); });
