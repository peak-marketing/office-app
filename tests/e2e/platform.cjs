// 2차 통합 공통 E2E: 역할별 메뉴(PC·휴대폰) · 홈·통합 검색 · 주소로 도면 찾기(예시 모드) · 업체 직접 참여 입찰(+운영자 배정)
// · 파트너 겸업 가입 · 역할별 주요 화면 휴대폰 넘침. 실행: npm run test:e2e -- platform
const { chromium } = require("playwright-core");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const B = process.env.B;
const DB = process.env.DB;
const OUT = process.env.OUT || path.join(process.env.P || process.cwd(), ".e2e-data/shots/platform");
const SHOTS = !!process.env.SHOTS;
if (!B || !DB) throw new Error("B와 DB를 주세요");
if (SHOTS) fs.mkdirSync(OUT, { recursive: true });
const sql = (q) => execSync(`sqlite3 "${DB}" "${q.replace(/"/g, '\\"')}"`, { maxBuffer: 64 << 20 }).toString().trim();
const results = [];
let section = "";
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} [${section}] ${name}${ok ? "" : ` — ${String(extra).slice(0, 300)}`}`);
const until = async (q, want, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (sql(q) === want) return true; await new Promise((r) => setTimeout(r, 150)); } return false; };

(async () => {
  const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const errors = [];
  const ctx = async (opts = {}) => {
    const p = await (await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...opts })).newPage();
    p.on("pageerror", (e) => errors.push(`${p.url()} ${e.message}`));
    return p;
  };
  const mobile = () => ctx({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const login = async (p, email, pw = "demo1234") => { await p.goto(B + "/login"); await p.fill("input[name=email]", email); await p.fill("input[name=password]", pw); await p.click('main button:has-text("로그인")'); await p.waitForURL((u) => !u.pathname.startsWith("/login")); };
  const shot = async (p, name, full = true) => { if (!SHOTS) return; await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); };
  const noOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const main = (p) => p.textContent("main");
  const navText = async (p) => (await p.locator("nav.desktop-navigation a").allTextContents()).join("|");
  const tabText = async (p) => (await p.locator("nav.mobile-navigation a").allTextContents()).join("|");
  const T = Date.now();

  // ── 1. 역할별 메뉴
  section = "메뉴";
  const g = await ctx();
  await g.goto(B + "/");
  check("손님 주 메뉴: 홈·커뮤니티·쇼핑·시공·견적·내 공간", (await navText(g)) === "홈|커뮤니티|쇼핑|시공·견적|내 공간", await navText(g));
  check("머리: 검색·장바구니·로그인·내 공간 만들기", (await g.locator("header a[aria-label=검색]").count()) === 1 && (await g.locator("[data-testid=header-cart]").count()) === 1);
  await g.goto(B + "/cases");
  check("시공 하위 메뉴: 시공 사례·시공사·배치 해보기·견적 요청", (await g.locator(".section-tabs a").allTextContents()).join("|") === "시공 사례|시공사|배치 해보기|견적 요청");
  check("시공 사례 화면에서 ‘시공·견적’ 켜짐", (await g.locator("nav.desktop-navigation a.is-active").textContent()) === "시공·견적");
  const roles = [
    ["vendor1@demo.kr", "요청·제안|참여 가능 요청|업체 소개·사례|판매자 센터|파트너 센터", "시공+판매 파트너"],
    ["vendor2@demo.kr", "요청·제안|참여 가능 요청|업체 소개·사례|파트너 센터", "시공 파트너"],
    ["seller@demo.kr", "판매자 센터|파트너 센터", "판매 전용 파트너"],
    ["admin@demo.kr", "요청 관리|파트너|쇼핑 운영|커뮤니티|연동 상태", "운영자"],
  ];
  for (const [email, want, label] of roles) {
    const p = await ctx();
    await login(p, email);
    check(`${label} 메뉴`, (await navText(p)) === want, await navText(p));
    await p.context().close();
  }
  const sOnly = await ctx();
  await login(sOnly, "seller@demo.kr");
  check("판매 전용 파트너 로그인 → 판매자 센터", new URL(sOnly.url()).pathname === "/seller");
  await sOnly.goto(B + "/vendor");
  check("판매 전용 파트너가 시공 화면 → 파트너 센터로", new URL(sOnly.url()).pathname === "/partner");

  // ── 2. 홈·통합 검색
  section = "홈·검색";
  await g.goto(B + "/");
  check("홈: 바로 가기 8개", (await g.locator("[data-testid=quick-actions] a").count()) === 8);
  check("홈: 오늘의 공간·내 공간 3D·많이 찾는 상품·시공 사례", (await g.locator("[data-testid=today-spaces]").count()) === 1 && (await g.locator("[data-testid=space3d-promo]").count()) === 1 && (await g.locator("[data-testid=home-products] [data-product]").count()) === 4 && (await g.locator("[data-testid=home-cases] [data-case]").count()) > 0);
  await shot(g, "01-home");
  await g.fill("form[role=search] input[name=q]", "책상");
  await g.press("form[role=search] input[name=q]", "Enter");
  await g.waitForURL(/\/search\?q=/);
  check("통합 검색: 상품 결과", (await g.locator("[data-testid=search-products] [data-product]").count()) >= 1);
  await g.goto(B + "/search?q=" + encodeURIComponent("온결"));
  check("통합 검색: 시공사 결과", (await g.textContent("[data-testid=search-vendors]")).includes("스튜디오 온결"));

  // ── 3. 주소로 도면 찾기(키 없음 → 예시 모드)
  section = "주소";
  await g.goto(B + "/spaces/address");
  check("손님: 로그인 안내 + 평면도 받는 방법 3가지", (await main(g)).includes("로그인한 뒤") && (await g.locator("[data-testid=plan-sources] li").count()) === 3);
  check("평면도는 공공 API로 받을 수 없다고 안내", (await main(g)).includes("건축물대장 조회에는 평면도가 포함되지 않아요"));
  const c = await ctx();
  const CEMAIL = `addr${T}@test.kr`;
  await c.goto(B + "/signup"); await c.fill("input[name=email]", CEMAIL); await c.fill("input[name=password]", "testpass1"); await c.fill("input[name=name]", "주소고객"); await c.check("input[name=consent]"); await c.click('button:has-text("가입하기")'); await c.waitForURL(/\/projects/);
  await c.goto(B + "/spaces/address");
  await c.click("[data-testid=address-details] summary");
  await c.fill("[data-testid=addr-q]", "예시로 12");
  await c.click("[data-testid=addr-search]");
  await c.waitForSelector("[data-testid=addr-hits] button");
  check("키 없음: ‘실제 연동 전 · 예시 주소’ 표시", (await c.textContent("[data-testid=addr-example]")).includes("실제 주소가 아니에요"));
  await c.locator("[data-testid=addr-hits] button", { hasText: "예시아파트" }).click();
  await c.fill("[data-testid=addr-ho]", "1203");
  await c.click("[data-testid=addr-building]");
  await c.waitForSelector("[data-testid=addr-info]");
  const info = await c.textContent("[data-testid=addr-info]");
  check("건물 정보: 예시 값 표시와 전용면적", info.includes("실제 연동 전 · 예시 값") && (await c.textContent("[data-testid=addr-unit]")).includes("84.97㎡"));
  check("건축물대장에 평면도 없음 안내", info.includes("평면도가 없어요"));
  check("조회 기록(예시 제공자)", sql(`select count(*) from ext_lookups where provider='example' and kind in ('juso','building')`) === "2");
  await c.click("[data-testid=addr-to-home]");
  await c.waitForURL(/\/homes\/new\?/);
  check("집 상담 신청으로 이어짐: 유형 아파트·지역 채움", (await c.inputValue("[data-testid=home-region]")).includes("예시구") && (await c.locator("[data-testid=home-type-apartment] input").isChecked()));
  check("전용면적 84.97㎡(전용) 채움", (await c.inputValue("[data-testid=home-area]")) === "84.97" && (await c.inputValue("[data-testid=home-area-unit]")) === "m2" && (await c.inputValue("[data-testid=home-area-basis]")) === "exclusive");
  await shot(c, "02-address");

  // ── 4. 업체 직접 참여 입찰
  section = "직접 참여";
  await c.goto(B + "/homes/new?type=apartment&region=" + encodeURIComponent("서울 송파구"));
  await c.click("[data-testid=home-next]");
  await c.click("[data-testid=home-scope-full]");
  await c.click("[data-testid=home-next]");
  await c.click("[data-testid=home-next]");
  await c.fill("input[name=address]", "서울 송파구 비공개로 1, 101동 1203호");
  await c.check("[data-testid=bid-open]");
  await c.selectOption("[data-testid=bid-cap]", "2");
  await c.click("[data-testid=home-send]");
  await c.waitForURL(/\/projects\/\d+$/);
  const pid = c.url().match(/projects\/(\d+)/)[1];
  check("요청: 업체 직접 참여·상한 2곳", sql(`select bid_mode||'|'||bid_cap||'|'||status from projects where id=${pid}`) === "open|2|requested");
  check("주거 분야 승인 업체에만 공개 요청 알림(이름·주소 없이)", sql(`select count(*) from notifications n join vendors v on v.user_id=n.user_id where n.project_id=${pid} and n.title like '참여할 수 있는 새 요청%' and v.fields like '%home%'`) === "2" && sql(`select count(*) from notifications n join vendors v on v.user_id=n.user_id where n.project_id=${pid} and v.fields not like '%home%'`) === "0" && sql(`select count(*) from notifications where project_id=${pid} and (title like '%비공개로%' or body like '%비공개로%' or title like '%101동%')`) === "0");
  const v2 = await ctx(); await login(v2, "vendor2@demo.kr");
  const v3 = await ctx(); await login(v3, "vendor3@demo.kr");
  const v1 = await ctx(); await login(v1, "vendor1@demo.kr");
  await v2.goto(B + "/vendor");
  check("업체 홈: 직접 참여할 수 있는 요청 배너", (await v2.locator("[data-testid=open-banner]").count()) === 1);
  await v2.goto(B + "/vendor/open");
  check("업체: 참여 가능 목록에 보임", (await v2.locator(`[data-testid=open-list] a[href="/vendor/open/${pid}"]`).count()) === 1);
  await v1.goto(B + "/vendor/open");
  check("분야가 다른 업체(사무실 전용)에는 안 보임", (await v1.locator(`a[href="/vendor/open/${pid}"]`).count()) === 0);
  await v2.goto(`${B}/vendor/open/${pid}`);
  let t = await main(v2);
  check("미리보기: 상세 주소·요청 이름 없음, 파일은 참여 뒤", !t.includes("비공개로") && !t.includes("101동") && t.includes("참여하면 볼 수 있어요"));
  await v2.click('button:has-text("이 요청에 참여하기")');
  await v2.waitForURL(/\/vendor\/requests\/\d+/);
  check("참여 → 바로 제안 작성(참여 확정·기한)", sql(`select a.source||'|'||a.status||'|'||(a.accepted_at is not null)||'|'||(a.quote_by is not null) from assignments a join vendors v on v.id=a.vendor_id join users u on u.id=v.user_id where a.project_id=${pid} and u.email='vendor2@demo.kr'`) === "self|invited|1|1");
  check("요청 상태: 운영자 검토 → 제안 접수", sql(`select status from projects where id=${pid}`) === "matching");
  check("고객에게 참여 알림", sql(`select count(*) from notifications where project_id=${pid} and title like '%요청에 참여했습니다' and user_id=(select id from users where email='${CEMAIL}')`) === "1");
  await v3.goto(`${B}/vendor/open/${pid}`);
  await v3.click('button:has-text("이 요청에 참여하기")');
  await v3.waitForURL(/\/vendor\/requests\/\d+/);
  check("두 번째 업체 참여 → 상한 도달", sql(`select count(*) from assignments where project_id=${pid} and source='self'`) === "2");
  // 운영자 배정은 상한과 별개로 할 수 있다.
  const admin = await ctx(); await login(admin, "admin@demo.kr");
  await admin.goto(`${B}/admin/projects/${pid}`);
  check("운영자 화면: 받는 방식과 직접 참여 표시", (await admin.textContent("[data-testid=admin-bid-mode]")).includes("업체 직접 참여(최대 2곳") && (await admin.locator("[data-testid=admin-assignments] .badge", { hasText: "직접 참여" }).count()) === 2);
  const v1id = sql(`select v.id from vendors v join users u on u.id=v.user_id where u.email='vendor1@demo.kr'`);
  await admin.check(`input[name=vendor][value="${v1id}"]`);
  await admin.click('button:has-text("선택한 업체 배정")');
  check("운영자 배정 함께 사용(상한과 별개)", await until(`select count(*) from assignments where project_id=${pid} and vendor_id=${v1id} and source='operator'`, "1"));
  // 상한 마감: 새 업체가 들어오려 하면 막힌다.
  const NV = `bidder${T}@test.kr`;
  sql(`insert into users (email, password_hash, name, role) values ('${NV}', (select password_hash from users where email='vendor2@demo.kr'), '입찰업체', 'vendor')`);
  sql(`insert into vendors (user_id, company, status, fields) values ((select id from users where email='${NV}'), '마감 확인 업체', 'approved', 'home')`);
  const nv = await ctx(); await login(nv, NV);
  await nv.goto(`${B}/vendor/open/${pid}`);
  check("상한이 차면 참여 막힘", (await main(nv)).includes("마감되었습니다"));
  await nv.goto(B + "/vendor/open");
  check("목록에도 마감 표시", (await nv.textContent(`a[href="/vendor/open/${pid}"]`)).includes("마감"));
  // 업체끼리 제안을 볼 수 없다: 다른 업체 배정 화면 접근 막힘
  const aidV3 = sql(`select a.id from assignments a join vendors v on v.id=a.vendor_id join users u on u.id=v.user_id where a.project_id=${pid} and u.email='vendor3@demo.kr'`);
  const other = await v2.request.get(`${B}/vendor/requests/${aidV3}`);
  check("다른 업체의 요청·제안 화면은 열 수 없음", other.status() === 404, other.status());
  // 고객이 운영자 배정만으로 바꾸면 더는 목록에 안 보인다.
  await c.goto(`${B}/projects/${pid}/info`);
  check("고객: 받는 방식 카드(참여 2/2곳)", (await c.textContent("[data-testid=bid-mode-card]")).includes("2/2곳") || (await c.textContent("[data-testid=bid-mode-card]")).includes("3/2곳"));
  await c.locator("[data-testid=bid-mode-card] input[name=bidMode][value=operator]").check();
  await c.locator("[data-testid=bid-mode-card] button:has-text('저장')").click();
  check("운영자 배정만으로 변경", await until(`select bid_mode from projects where id=${pid}`, "operator"));
  sql(`delete from assignments where project_id=${pid} and vendor_id=(select v.id from vendors v join users u on u.id=v.user_id where u.email='${NV}')`);
  await nv.goto(B + "/vendor/open");
  check("운영자 배정만이면 공개 목록에서 사라짐", (await nv.locator(`a[href="/vendor/open/${pid}"]`).count()) === 0);
  check("최저가 자동 낙찰 없음(요청 상태는 고객 선택 전)", !["contracted", "visit"].includes(sql(`select status from projects where id=${pid}`)));

  // ── 5. 파트너 겸업 가입
  section = "파트너 가입";
  const pt = await ctx();
  const PEMAIL = `both${T}@test.kr`;
  await pt.goto(B + "/partners");
  await pt.fill("input[name=company]", "겸업 테스트");
  await pt.check("input[name=roles][value=sell]");
  await pt.fill("input[name=name]", "겸업담당"); await pt.fill("input[name=email]", PEMAIL); await pt.fill("input[name=password]", "testpass1"); await pt.check("input[name=consent]");
  await pt.click('button:has-text("파트너 입점 신청")');
  await pt.waitForURL(/\/vendor$/);
  check("시공+판매 신청: 두 역할 모두 승인 대기", sql(`select (select status from vendors v where v.user_id=u.id)||'|'||(select status from sellers s where s.user_id=u.id) from users u where u.email='${PEMAIL}'`) === "pending|pending");
  check("운영자에게 시공·판매 신청 알림 각각", sql(`select count(*) from notifications where title like '%입점 신청: 겸업 테스트'`) === String(2 * Number(sql(`select count(*) from users where role='admin'`))));

  // ── 6. 휴대폰
  section = "휴대폰";
  const mg = await mobile();
  await mg.goto(B + "/");
  check("손님 하단 탭: 홈·커뮤니티·쇼핑·내 공간·마이", (await tabText(mg)) === "홈|커뮤니티|쇼핑|내 공간|마이", await tabText(mg));
  for (const pth of ["/", "/search?q=소파", "/spaces/address", "/request", "/cases", "/vendors", "/community", "/shop", "/partners"]) {
    await mg.goto(B + pth);
    check(`손님 넘침 없음 ${pth}`, await noOverflow(mg));
  }
  await shot(mg, "03-mobile-home");
  const mv = await mobile(); await login(mv, "vendor1@demo.kr");
  check("겸업 파트너 하단 탭", (await tabText(mv)).startsWith("요청·제안|참여 가능 요청|업체 소개·사례|판매자 센터"), await tabText(mv));
  for (const pth of ["/vendor", "/vendor/open", "/partner", "/seller", "/notifications"]) {
    await mv.goto(B + pth);
    check(`파트너 넘침 없음 ${pth}`, await noOverflow(mv));
  }
  const ma = await mobile(); await login(ma, "admin@demo.kr");
  check("운영자 하단 탭", (await tabText(ma)) === "요청 관리|파트너|쇼핑 운영|커뮤니티|알림", await tabText(ma));
  for (const pth of ["/admin", "/admin/vendors", "/admin/sellers", "/admin/products", "/admin/orders", "/admin/settlements", "/admin/community", "/admin/integrations"]) {
    await ma.goto(B + pth);
    check(`운영자 넘침 없음 ${pth}`, await noOverflow(ma));
  }

  section = "오류";
  check("페이지 오류 없음", errors.length === 0, errors.join(" | "));
  await browser.close();
  console.log(results.join("\n"));
  const fail = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(`\n${results.length - fail} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.log(results.join("\n"));
  console.log("FAIL [실행] " + (e.stack || e.message));
  process.exit(1);
});
