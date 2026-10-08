// 주거 1차 역할별 E2E (운영용 빌드로 띄운 서버에 대고 실행. 실제 3100 데이터에는 돌리지 않는다 — 데이터 사본에만)
// 고객 집 상담 신청(4유형·자료별) → 운영자 배정 → 업체 2곳 제안(PC·휴대폰) → 고객 비교 → 방 한 칸 배치(검사·크기·저장·복원)
// → 보낸 뒤 방 추가·삭제·수정은 ‘변경 내용 보내기’ 전까지 업체 기준 그대로 → 공간 탐색 집 예시 → 범위 밖 기능 없음
// 필요: 시연 계정(customer·vendor1~3·admin@demo.kr, demo1234), 집 예시 5건과 예시 업체 ‘주거’ 분야(npm run data:home-setup)
// 실행: B=http://localhost:3110 DB=<사본 app.db> NODE_PATH=<playwright-core가 있는 node_modules> node home-e2e.cjs  (SHOTS=1이면 OUT에 화면)
// 2026-10-02 검증본(118개)을 2026-10-05 다시 만들었다. 검증 때 고친 선택자 3곳(업체 프로필 저장, 요청 범위, 머리 메뉴 /try) 반영.
const { chromium } = require("playwright-core");
const { execSync } = require("child_process");
const fs = require("fs");
const B = process.env.B;
const DB = process.env.DB;
const OUT = process.env.OUT || __dirname + "/shots";
const SHOTS = !!process.env.SHOTS;
if (!B || !DB) throw new Error("B와 DB를 주세요");
if (SHOTS) fs.mkdirSync(OUT, { recursive: true });
const sql = (q) => execSync(`sqlite3 "${DB}" "${q.replace(/"/g, '\\"')}"`, { maxBuffer: 64 << 20 }).toString().trim();
const HKEYS = ["strip", "wallpaper", "flooring", "film", "carpentry", "doors", "window", "bath", "kitchen", "lighting", "piping", "balcony", "builtin", "misc"];
const FORBIDDEN = ["우리 집 3D", "집 전체 3D 완성", "집 구조를 재현", "안전한 통로", "시공 가능합니다", "시공할 수 있어요"];
const results = [];
let section = "";
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} [${section}] ${name}${ok ? "" : ` — ${String(extra).slice(0, 300)}`}`);

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
  const shot = async (p, name, full = true) => { if (!SHOTS) return; await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); };
  const noOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const main = (p) => p.textContent("main");
  const pidOf = (p) => Number(p.url().match(/projects\/(\d+)/)[1]);
  const aidOf = (pid, email) => sql(`select a.id from assignments a join vendors x on x.id=a.vendor_id join users u on u.id=x.user_id where a.project_id=${pid} and u.email='${email}'`);

  const fillHome = async (p, o) => {
    await p.goto(B + "/homes/new");
    await p.click(`[data-testid=home-type-${o.type}]`);
    await p.fill("[data-testid=home-region]", o.region);
    if (o.area) { await p.fill("[data-testid=home-area]", String(o.area)); if (o.unit) await p.selectOption("[data-testid=home-area-unit]", o.unit); if (o.basis) await p.selectOption("[data-testid=home-area-basis]", o.basis); }
    if (o.rooms != null) await p.fill("[data-testid=home-rooms]", String(o.rooms));
    if (o.baths != null) await p.fill("[data-testid=home-baths]", String(o.baths));
    if (o.yearUnknown) await p.check("[data-testid=home-year-unknown]");
    if (o.occ) await p.click(`[data-testid=home-occ-${o.occ}]`);
    if (o.rules) await p.fill("[data-testid=home-rules]", o.rules);
    await p.click("[data-testid=home-next]");
    await p.click(`[data-testid=home-scope-${o.scope}]`);
    for (const w of o.works ?? []) await p.click(`[data-testid=home-work-${w}]`);
    await p.click("[data-testid=home-next]");
    if (o.photo) await p.setInputFiles("[data-testid=home-photos]", o.photo);
    if (o.drawing) await p.setInputFiles("[data-testid=home-drawings]", o.drawing);
    await p.click("[data-testid=home-next]");
    if (o.address) await p.fill("input[name=address]", o.address);
    if (o.budgetMin) await p.fill("input[name=budgetMin]", String(o.budgetMin));
    await p.click(o.send === false ? "[data-testid=home-save]" : "[data-testid=home-send]");
    await p.waitForURL(/\/projects\/\d+$/);
    return pidOf(p);
  };
  const makeRoom = async (p, pid, o) => {
    await p.goto(`${B}/projects/${pid}/rooms/new`);
    await p.fill("[data-testid=room-name]", o.name);
    await p.fill("[data-testid=room-w]", String(o.w));
    await p.fill("[data-testid=room-d]", String(o.d));
    if (o.door) { await p.click("[data-testid=add-door]"); await p.selectOption("[data-testid=door-wall-0]", o.door.wall); await p.fill("[data-testid=door-at-0]", String(o.door.at)); await p.fill("[data-testid=door-w-0]", String(o.door.w)); }
    if (o.fixed) { await p.click("[data-testid=add-fixed]"); await p.selectOption("[data-testid=fixed-label-0]", o.fixed.label); for (const k of ["x", "y", "w", "d", "h"]) await p.fill(`[data-testid=fixed-${k}-0]`, String(o.fixed[k])); }
    if (o.win) { await p.click("[data-testid=win-mode-list]"); await p.click("[data-testid=add-win]"); await p.selectOption("[data-testid=win-wall-0]", o.win.wall); await p.fill("[data-testid=win-at-0]", String(o.win.at)); await p.fill("[data-testid=win-w-0]", String(o.win.w)); }
    await p.click("[data-testid=room-submit]");
    await p.waitForURL(/\/rooms\/room-\d+(\?.*)?$/);
    await p.waitForSelector("main.editor");
    return p.url().match(/rooms\/(room-\d+)/)[1];
  };
  const roomItems = async (p) => JSON.parse(await p.getAttribute("main.editor", "data-room-items"));
  const setPos = async (p, x, y) => { await p.fill("[data-testid=pos-x]", String(x)); await p.press("[data-testid=pos-x]", "Enter"); await p.fill("[data-testid=pos-y]", String(y)); await p.press("[data-testid=pos-y]", "Enter"); await p.waitForTimeout(150); };
  const issueTexts = (p) => p.locator("[data-testid=checks] [data-testid=check-issues] button").allTextContents();

  const c = await ctx(); const T = Date.now(); const EMAIL = `home${T}@test.kr`;
  await c.goto(B + "/signup"); await c.fill("input[name=email]", EMAIL); await c.fill("input[name=password]", "testpass1"); await c.fill("input[name=name]", "주거고객"); await c.check("input[name=consent]"); await c.click('button:has-text("가입하기")'); await c.waitForURL(/\/projects/);
  const a = await ctx(); await login(a, "admin@demo.kr");

  // ── 1. 고객: 집 상담 신청
  section = "고객 신청";
  await c.goto(B + "/homes/new");
  await c.click("[data-testid=home-next]");
  check("필수값 없으면 다음 단계로 가지 않음(주거 유형)", (await c.textContent("[data-testid=home-error]")).includes("주거 유형"));
  await c.click("[data-testid=home-type-oneroom]"); await c.click("[data-testid=home-next]");
  check("지역 없으면 다음 단계로 가지 않음", (await c.textContent("[data-testid=home-error]")).includes("지역"));
  await c.fill("[data-testid=home-region]", "서울 관악구"); await c.click("[data-testid=home-next]");
  await c.click("[data-testid=home-scope-partial]"); await c.click("[data-testid=home-next]");
  check("부분 공사는 공사 1개 이상", (await c.textContent("[data-testid=home-error]")).includes("하나 이상"));
  await shot(c, "01-customer-home-form-step2");

  const P = {};
  P.oneroom = await fillHome(c, { type: "oneroom", region: "서울 관악구", scope: "undecided" });
  check("원룸: 도면·치수·사진 없이 신청 → 접수(r1)", sql(`select kind||'|'||status from projects where id=${P.oneroom}`) === "home|requested" && sql(`select count(*) from request_revisions where project_id=${P.oneroom}`) === "1");
  check("원룸: 파일 0개", sql(`select count(*) from files where project_id=${P.oneroom}`) === "0");
  P.officetel = await fillHome(c, { type: "officetel", region: "서울 마포구", scope: "partial", works: ["wallpaper", "flooring"], photo: __dirname + "/photo1.jpg" });
  check("오피스텔: 사진만 올려 신청", sql(`select count(*) from files where project_id=${P.officetel} and kind='photo'`) === "1" && sql(`select status from projects where id=${P.officetel}`) === "requested");
  P.villa = await fillHome(c, { type: "villa", region: "서울 은평구", scope: "full", area: 18, basis: "supply", rooms: 2, baths: 1, yearUnknown: true, occ: "occupied", drawing: __dirname + "/plan1.jpg" });
  check("빌라: 도면 첨부 신청", sql(`select count(*) from files where project_id=${P.villa} and kind='drawing'`) === "1");
  P.apt = await fillHome(c, { type: "apartment", region: "서울 송파구", scope: "partial", works: ["bath", "kitchen", "balcony"], area: 84, unit: "m2", basis: "exclusive", rules: "평일 9~18시만 공사 가능", address: "서울 송파구 예시로 77, 101동 1203호", budgetMin: 2000, send: false });
  check("아파트: 저장만(요청 전)", sql(`select status||'|'||coalesce(requested_version_id,'-') from projects where id=${P.apt}`) === "draft|-");
  for (const [k, pid] of Object.entries(P)) check(`${k}: 공간 종류 집`, sql(`select kind from projects where id=${pid}`) === "home");

  await c.goto(`${B}/projects/${P.oneroom}/info`);
  let t = await main(c);
  check("요약: 입력하지 않은 값은 ‘입력하지 않음’(면적·방·욕실·준공·거주·공간)", ["면적입력하지 않음", "방·욕실입력하지 않음", "준공 연도입력하지 않음", "거주 상태입력하지 않음", "공사할 공간입력하지 않음"].every((x) => t.includes(x)), t.slice(0, 500));
  check("요약: 공사 범위 ‘아직 모름’", t.includes("아직 모름(상담 후 결정)"));
  await shot(c, "02-customer-info-not-entered");
  await c.goto(`${B}/projects/${P.villa}/info`); t = await main(c);
  check("요약: 빌라 입력값 그대로(18평 공급·방 2·욕실 1·준공 모름·거주 중)", t.includes("18평 (공급)") && t.includes("방 2 · 욕실 1") && t.includes("준공 연도모름") && t.includes("거주 중 공사"));
  await c.goto(`${B}/projects/${P.oneroom}`); t = await main(c);
  check("한눈에: 다음 할 일 = 운영자 검토(주거 업체)", t.includes("주거 시공이 가능한 업체를 배정"));
  await c.goto(`${B}/projects`); t = await main(c);
  check("내 공간 목록: 집 표시", (await c.locator("[data-testid=space-list] .badge:text-is('집')").count()) === 4);

  // ── 2. 방 한 칸 배치(요청 전, 아파트)
  section = "방 한 칸";
  await c.goto(`${B}/projects/${P.apt}/plan`);
  check("방 배치 탭: 비어 있음 + ‘집 전체 도면이 되지 않아요’", (await c.locator("[data-testid=rooms-empty]").count()) === 1 && (await c.textContent("[data-testid=rooms-scope]")).includes("집 전체 도면이 되지 않아요"));
  await c.goto(`${B}/projects/${P.apt}/rooms/new`);
  await c.fill("[data-testid=room-name]", "침실"); await c.fill("[data-testid=room-w]", "1200"); await c.fill("[data-testid=room-d]", "3500"); await c.click("[data-testid=room-submit]");
  check("방 크기 범위 밖이면 저장하지 않음", (await c.textContent("[data-testid=room-errors]")).includes("1,500~15,000mm"));
  const R1 = await makeRoom(c, P.apt, { name: "침실", w: 4000, d: 3500, door: { wall: "rear", at: 2800, w: 800 }, fixed: { label: "붙박이장", x: 0, y: 2900, w: 1200, d: 600, h: 2200 }, win: { wall: "rear", at: 500, w: 1500 } });
  const savedRoom = JSON.parse(sql(`select rooms from versions where id=(select current_version_id from projects where id=${P.apt})`))[0];
  check("방 저장: 치수·방문·욕실 문 자리·붙박이장·창", savedRoom.room.width === 4 && savedRoom.room.doors[0].label === "욕실 문" && savedRoom.room.pillars[0].label === "붙박이장" && savedRoom.room.pillars[0].h === 2.2 && savedRoom.room.windows.length === 1 && savedRoom.rev === 1);
  check("편집: ‘방 한 칸 · 집 전체 아님’ + 자동 배치 후속 검토", (await c.textContent("[data-testid=room-scope]")).includes("방 한 칸 · 집 전체 아님") && (await c.textContent("[data-testid=room-scope]")).includes("후속 검토"));
  check("편집: 개념 가구 표시", (await c.textContent("[data-testid=concept-note]")).includes("치수 검토용 개념 가구 · 실제 상품 아님"));
  await c.click("[data-testid=add-h-bed-queen]"); await c.waitForTimeout(200);
  let items = await roomItems(c);
  check("퀸 침대 놓기(빈자리)", items.length === 1 && items[0][1] === "h-bed-queen");
  await setPos(c, 0, 2000);
  let issues = await issueTexts(c);
  check("검사: 고정 구조물(붙박이장)과 겹침", issues.some((x) => x.includes("고정 구조물(붙박이장)과 겹쳐요")), issues.join(" / "));
  check("검사: 방 밖", issues.some((x) => x.includes("방 밖으로 나갔어요")), issues.join(" / "));
  await setPos(c, 1600, 1500);
  issues = await issueTexts(c);
  check("검사: 문 앞 장애물(욕실 문 앞 바닥 폭 800 × 깊이 800)", issues.some((x) => x.includes("욕실 문 앞 바닥(폭 800 × 깊이 800mm)")), issues.join(" / "));
  await setPos(c, 1300, 1500);
  issues = await issueTexts(c);
  const gaps = await c.textContent("[data-testid=checks] [data-testid=gap-notices]");
  check("검사 통과 자리: 확인할 것 0", issues.length === 0 && (await c.textContent("[data-testid=checks] [data-testid=issue-count]")).includes("걸린 곳 없음"), issues.join(" / "));
  check("통로 간격 알림: 무엇과 무엇 사이인지(침대–붙박이장 100mm), 확인할 것에 안 셈", gaps.includes("퀸 침대와 붙박이장 사이 빈 간격 100mm") && gaps.includes("편집 참고 · 임시값 600mm"), gaps);
  check("통로 간격 알림: 판정하지 않는다고 명시", gaps.includes("지나갈 수 있는지·안전한지는 판정하지 않습니다"));
  await shot(c, "10-room-editor-checks");
  await c.fill("[data-testid=size-w]", "1800"); await c.press("[data-testid=size-w]", "Enter"); await c.waitForTimeout(200);
  items = await roomItems(c); issues = await issueTexts(c);
  check("크기 1800: 편집 데이터·겹침 검사에 반영", Math.abs(items[0][5] - 1.8) < 1e-6 && issues.some((x) => x.includes("붙박이장") || x.includes("욕실 문")), issues.join(" / "));
  check("크기 1800: 선택 패널 바닥 크기", (await c.textContent("[data-testid=sel-size]")).includes("1,800 × 2,000"));
  await c.fill("[data-testid=size-w]", "1400"); await c.press("[data-testid=size-w]", "Enter"); await c.waitForTimeout(200);
  items = await roomItems(c); issues = await issueTexts(c);
  check("크기 1400: 겹침 없어짐", Math.abs(items[0][5] - 1.4) < 1e-6 && issues.length === 0, issues.join(" / "));
  await c.click("[data-testid=add-h-nightstand]"); await c.waitForTimeout(150);
  await c.click("[data-testid=view-3d]"); await c.waitForSelector("main.editor canvas"); await c.waitForTimeout(1500);
  check("3D 보기(같은 데이터)", (await c.locator("main.editor canvas").count()) === 1);
  await shot(c, "11-room-editor-3d", false);
  await c.click("[data-testid=view-plan]");
  await c.click("[data-testid=editor-save]"); await c.waitForURL(/saved=2/);
  items = await roomItems(c);
  check("저장 후 다시 열기: 크기 1400 그대로", items.length === 2 && Math.abs(items.find((x) => x[1] === "h-bed-queen")[5] - 1.4) < 1e-6);
  const dbRoom = JSON.parse(sql(`select rooms from versions where id=(select current_version_id from projects where id=${P.apt})`))[0];
  const bed = dbRoom.items.find((x) => x.type === "h-bed-queen");
  const partsW = Math.max(...bed.parts.filter((q) => q.p).map((q) => q.x + q.w)) - Math.min(...bed.parts.filter((q) => q.p).map((q) => q.x));
  check("DB: 배치 2, 침대 w 1.4 · 부품 폭 1.4(평면·3D 같은 크기) · 목록 규격", dbRoom.rev === 2 && Math.abs(bed.w - 1.4) < 1e-6 && Math.abs(partsW - 1.4) < 1e-3 && bed.bom[0].spec.startsWith("1,400 × 2,000"), JSON.stringify({ rev: dbRoom.rev, w: bed.w, partsW, spec: bed.bom[0].spec }));
  await c.goto(`${B}/projects/${P.apt}/rooms/${R1}`); items = await roomItems(c);
  check("새로 열어도 1400", Math.abs(items.find((x) => x[1] === "h-bed-queen")[5] - 1.4) < 1e-6);
  const names = ["거실", "작은 방", "서재", "아이 방"];
  const rids = [R1];
  for (const n of names) rids.push(await makeRoom(c, P.apt, { name: n, w: 3000 + rids.length * 200, d: 3000 }));
  await c.goto(`${B}/projects/${P.apt}/plan`);
  check("방 5개: 더 만들 수 없음(버튼 없음)", (await c.locator("[data-testid=add-room]").count()) === 0 && (await c.locator("[data-testid^=room-card-]").count()) === 5);
  await c.goto(`${B}/projects/${P.apt}/rooms/new`); await c.waitForURL(/\/plan$/);
  check("방 5개: 만들기 주소로 가도 방 배치로 돌아감", c.url().endsWith("/plan"));
  await c.click(`[data-testid=room-del-${rids[4]}]`); await c.click(`[data-testid=room-del-confirm-${rids[4]}]`); await c.waitForTimeout(800);
  check("요청 전 방 삭제", (await c.locator("[data-testid^=room-card-]").count()) === 4);
  await shot(c, "12-rooms-tab-before-send");
  await c.goto(`${B}/projects/${P.apt}`);
  check("한눈에: 방 배치 4개 · 집 전체 아님", (await c.textContent("[data-testid=overview-rooms]")).includes("방 한 칸 · 집 전체 아님") && (await c.locator("[data-testid=overview-rooms] li").count()) === 4);
  await c.goto(`${B}/projects/${P.apt}/request`); await c.click("[data-testid=home-send]"); await c.waitForURL(new RegExp(`/projects/${P.apt}$`));
  const r1 = JSON.parse(sql(`select snapshot from request_revisions where project_id=${P.apt} order by no desc limit 1`));
  check("요청 r1에 방별 배치 버전 보관(침실 배치 2, 나머지 1)", r1.rooms.length === 4 && r1.rooms[0].rev === 2 && r1.rooms.slice(1).every((x) => x.rev === 1) && r1.home.homeType === "apartment");

  // ── 3. 운영자 배정
  section = "운영자";
  await a.goto(`${B}/admin`); t = await main(a);
  check("목록: 집 요청 표시", (t.match(/집 요청/g) ?? []).length >= 4);
  await a.goto(`${B}/admin/projects/${P.apt}`); t = await main(a);
  check("상세: 집 · 아파트 · 방 배치 4개, 주거 배정 안내", t.includes("아파트 · 방 배치 4개") && (await a.locator("[data-testid=home-assign-hint]").count()) === 1);
  const order = await a.locator("[data-testid=vendor-group-demo] label b").allTextContents();
  check("주거 분야 업체 먼저(모아공간·라인앤폼), 온결은 ‘주거 분야 없음’", order[0].includes("모아공간") && order[1].includes("라인앤폼") && order[2].includes("온결") && (await a.locator('[data-testid=vendor-group-demo] label:has-text("온결") .badge:text-is("주거 분야 없음")').count()) === 1, order.join(","));
  check("상세: 방 배치 보기(업체 문구)", (await a.locator("[data-testid=rooms-view] [data-testid=room-badge]").count()) === 4 && (await a.textContent("[data-testid=rooms-note]")).includes("집 전체 도면이나 실측이 아니며"));
  check("자료 요청 항목: 주거용(관리 규약)", (await a.locator('label:has-text("관리 규약·공사 가능 시간") input[name=item]').count()) === 1 && (await a.locator('label:has-text("출입구·창·기둥 위치") input[name=item]').count()) === 0);
  await a.locator(`label:has-text("[예시] 모아공간") input[name=vendor]`).check();
  await a.locator(`label:has-text("[예시] 라인앤폼") input[name=vendor]`).check();
  await a.click('button:has-text("선택한 업체 배정")'); await a.waitForSelector("text=업체 2곳을 배정했습니다");
  await shot(a, "20-admin-assign-home");
  const v1 = await ctx(); await login(v1, "vendor1@demo.kr"); await v1.goto(`${B}/vendor/profile`);
  await v1.check("[data-testid=field-home]"); await v1.locator('form:has([data-testid=vendor-fields]) button:has-text("저장")').click(); await v1.waitForSelector("text=저장했습니다");
  check("업체 프로필: 시공 분야(사무실·주거) 저장", sql(`select fields from vendors v join users u on u.id=v.user_id where u.email='vendor1@demo.kr'`) === "office,home");
  await a.goto(`${B}/admin/projects/${P.oneroom}`);
  check("분야 반영: 온결도 주거 분야", (await a.locator('[data-testid=vendor-group-demo] label:has-text("온결") .badge:text-is("주거 분야 없음")').count()) === 0);

  // ── 4. 업체 제안
  section = "업체";
  const v2 = await ctx(); await login(v2, "vendor2@demo.kr");
  const aid2 = aidOf(P.apt, "vendor2@demo.kr");
  await v2.goto(`${B}/vendor`); t = await main(v2);
  check("업체 목록: ‘서울 송파구 · 아파트’", t.includes("서울 송파구 · 아파트"));
  await v2.goto(`${B}/vendor/requests/${aid2}`); t = await main(v2);
  check("요청: 집 요약·공사 범위·방 배치 4개", t.includes("부분 공사: 욕실, 주방(싱크대·상판), 발코니 확장·단열") && (await v2.locator("[data-testid=rooms-view] [data-testid^=room-room-]").count()) === 4);
  check("요청: 방 배치는 참고·집 전체 도면 아님", (await v2.textContent("[data-testid=rooms-note]")).includes("방 한 칸의 가구 배치(참고)") && (await v2.locator("[data-testid=room-badge]").count()) === 4);
  check("요청: 침실 배치 2 · 침대 1,400×2,000 · 개념 가구", t.includes("침실 · 배치 2") && t.includes("퀸 침대 1,400×2,000") && t.includes("실제 상품 아님"));
  check("요청: 상세 주소·연락처·요청 이름 안 보임", !t.includes("101동 1203호") && !t.includes(EMAIL));
  check("요청: 발코니 확장 판정 안 함 안내", t.includes("확장 가능 여부를 판정하지 않습니다"));
  await shot(v2, "30-vendor-home-request");
  await v2.locator('button:has-text("참여하기")').first().click(); await v2.waitForSelector("[data-testid=quote-items]");
  check("견적서: 주거 14항목", (await v2.locator("[data-testid=quote-items] tbody tr").count()) === 14);
  check("견적서: 요청 범위(욕실·주방·발코니)만 표시", (await v2.locator("[data-testid=requested-bath]").count()) === 1 && (await v2.locator("[data-testid=requested-kitchen]").count()) === 1 && (await v2.locator("[data-testid=requested-balcony]").count()) === 1 && (await v2.locator("[data-testid^=requested-]").count()) === 3);
  check("견적서: 설계 제안 칸 없음(방 배치는 참고)", (await v2.locator("[data-testid=design-fields]").count()) === 0);
  for (const k of HKEYS) { await v2.selectOption(`select[name=status_${k}]`, k === "balcony" ? "site_check" : k === "film" ? "na" : "included"); if (k !== "balcony" && k !== "film") await v2.fill(`input[name=amount_${k}]`, String(k === "bath" ? 4200000 : 300000)); }
  await v2.selectOption("select[name=vat]", "1"); await v2.fill("input[name=durationDays]", "20"); await v2.fill("input[name=startAvailable]", "2026-11-23"); await v2.fill("textarea[name=extraConditions]", "관리사무소 신고 후 공사");
  await v2.click('button:has-text("임시 저장")'); await v2.waitForSelector("text=임시 저장됨");
  await v2.goto(`${B}/vendor/requests/${aid2}`); await v2.waitForSelector("[data-testid=quote-items]");
  check("임시 저장 → 다시 열기: 값 그대로", (await v2.inputValue("input[name=amount_bath]")) === "4200000" && (await v2.inputValue("select[name=status_balcony]")) === "site_check");
  await shot(v2, "31-vendor-quote-14-items");
  await v2.locator('#proposal button:text-is("제안 제출")').click(); await v2.waitForSelector("text=제안을 제출했습니다");
  const q2 = JSON.parse(sql(`select items from quotes where assignment_id=${aid2}`));
  check("제출: 현장 확인 필요 항목은 금액 없음(0원 아님)", q2.find((x) => x.key === "balcony").amount === null && q2.length === 14);
  const v3 = await mobile(); await login(v3, "vendor3@demo.kr");
  const aid3 = aidOf(P.apt, "vendor3@demo.kr");
  await v3.goto(`${B}/vendor/requests/${aid3}`);
  await v3.locator('button:has-text("참여하기")').first().click(); await v3.waitForSelector("[data-testid=quote-items]");
  check("휴대폰: 견적 카드 14개, 가로 스크롤 없음", (await v3.locator("[data-testid=quote-items] tbody tr").count()) === 14 && (await noOverflow(v3)));
  for (const k of HKEYS) { await v3.selectOption(`select[name=status_${k}]`, "included"); await v3.fill(`input[name=amount_${k}]`, String(k === "bath" ? 3900000 : 320000)); }
  await v3.selectOption("select[name=vat]", "1"); await v3.fill("input[name=durationDays]", "18"); await v3.fill("input[name=startAvailable]", "2026-11-30"); await v3.fill("textarea[name=extraConditions]", "없음");
  await shot(v3, "32-vendor-quote-mobile");
  await v3.locator('#proposal button:text-is("제안 제출")').click(); await v3.waitForSelector("text=제안을 제출했습니다");
  check("휴대폰 제출 저장", sql(`select count(*) from quotes where project_id=${P.apt}`) === "2");

  // ── 5. 고객 비교
  section = "고객 비교";
  await c.goto(`${B}/projects/${P.apt}/quotes`); t = await main(c);
  check("같은 기준 2건(요청 r1)", t.includes("아래 제안 2건 모두 요청 r1") && t.includes("같은 집 정보·공사 범위·자료를 받은 업체가"));
  check("비교표: 주거 14항목, 요청 범위 3줄", (await c.locator("section.hidden.md\\:block tbody tr").count()) >= 14 && (await c.locator("section.hidden.md\\:block tbody td span:text-is('요청 범위')").count()) === 3);
  check("범위가 다르면(발코니 현장 확인·필름 해당 없음) ‘최저’ 없음 + 차이 안내", t.includes("시공사마다 공사 범위가 다릅니다") && (await c.locator("main .badge:text-is('최저')").count()) === 0);
  await shot(c, "40-customer-compare");
  await c.locator(`main li:has-text("모아공간") summary:has-text("상담·현장 방문 요청")`).click();
  await c.locator(`main li:has-text("모아공간") input[name=preferred]`).fill("11/2 오전");
  await c.locator(`main li:has-text("모아공간") button:has-text("요청 보내기")`).click(); await c.waitForTimeout(800);
  await v2.goto(`${B}/vendor/requests/${aid2}`); t = await main(v2);
  check("방문 요청한 업체에만 상세 주소 공개", t.includes("101동 1203호"));
  await v3.goto(`${B}/vendor/requests/${aid3}`); t = await main(v3);
  check("방문 요청 안 한 업체는 주소 안 보임", !t.includes("101동 1203호"));

  // ── 6. 보낸 뒤 방 추가·삭제·수정
  section = "변경 보내기";
  await c.goto(`${B}/projects/${P.apt}/rooms/${R1}`);
  await c.locator("[data-testid=item-n1]").click({ force: true });
  await c.fill("[data-testid=size-w]", "1500"); await c.press("[data-testid=size-w]", "Enter"); await c.waitForTimeout(150);
  await c.click("[data-testid=editor-save]"); await c.waitForURL(/saved=3/);
  check("편집 화면: 업체에 보낸 요청엔 배치 2", (await c.textContent("[data-testid=sent-info]")).includes("배치 2"));
  await makeRoom(c, P.apt, { name: "드레스룸", w: 2400, d: 2000 });
  await c.goto(`${B}/projects/${P.apt}/plan`);
  await c.click(`[data-testid=room-del-${rids[1]}]`); await c.click(`[data-testid=room-del-confirm-${rids[1]}]`); await c.waitForTimeout(800);
  t = await c.textContent("[data-testid=rooms-tab]");
  check("방 탭: 고침/새 방/지운 방 상태", t.includes("고침 · 업체는 배치 2 기준") && t.includes("새 방 · 업체에 아직 안 보냄") && (await c.textContent("[data-testid=rooms-removed]")).includes("거실(배치 1)"), t.slice(0, 400));
  await shot(c, "50-rooms-tab-pending");
  await c.goto(`${B}/projects/${P.apt}`);
  const pend = await c.textContent("[data-testid=pending-changes]");
  check("변경 대기: 방 배치 수정·추가·삭제 문장", pend.includes("방 배치 수정: 침실 (배치 2 → 3)") && pend.includes("크기 조절 1") && pend.includes("방 추가: 드레스룸") && pend.includes("방 삭제: 거실"), pend);
  check("아직 업체 기준 그대로(r1)", sql(`select count(*) from request_revisions where project_id=${P.apt}`) === "1");
  await v3.goto(`${B}/vendor/requests/${aid3}`); t = await main(v3);
  check("업체: 보내기 전엔 이전 방 배치(침실 배치 2, 거실 있음)", t.includes("침실 · 배치 2") && t.includes("거실") && !t.includes("드레스룸"));
  await shot(c, "51-pending-changes");
  await c.click("[data-testid=send-update]"); await c.waitForSelector("[data-testid=pending-changes]", { state: "detached" });
  const r2 = JSON.parse(sql(`select snapshot from request_revisions where project_id=${P.apt} order by no desc limit 1`));
  check("보내기 → r2: 방 4개(침실 배치 3, 거실 없음, 드레스룸 있음)", r2.rooms.length === 4 && r2.rooms.find((x) => x.name === "침실").rev === 3 && !r2.rooms.some((x) => x.name === "거실") && r2.rooms.some((x) => x.name === "드레스룸"));
  await v3.goto(`${B}/vendor/requests/${aid3}`); t = await main(v3);
  check("업체: r2 바뀐 점과 새 방 배치", (await v3.textContent("[data-testid=rev-changes]")).includes("방 삭제: 거실") && t.includes("침실 · 배치 3") && t.includes("드레스룸"));
  await shot(v3, "52-vendor-r2-changes");
  await c.goto(`${B}/projects/${P.apt}/quotes`); t = await main(c);
  check("비교: r2 뒤 업체 재확인 대기", t.includes("업체가 변경 내용을 확인 중입니다"));
  await v2.goto(`${B}/vendor/requests/${aid2}`); await v2.click('button:has-text("확인했고 제안은 그대로 유지")'); await v2.waitForTimeout(800);
  await c.goto(`${B}/projects/${P.apt}/quotes`); t = await main(c);
  check("비교: 한 곳 확인 → r2 기준 1건", t.includes("요청 r2 · 최신 · 제안 1건"));

  // ── 7. 표시 문구·금지 표현
  section = "표시 문구";
  await c.goto(`${B}/projects/${P.apt}/activity`); await c.click("button:has-text('링크 만들기')"); await c.waitForTimeout(600);
  const token = sql(`select token from share_links where project_id=${P.apt} order by id desc limit 1`);
  const guest = await ctx();
  const pages = [
    ["고객 한눈에", c, `/projects/${P.apt}`], ["고객 방 배치", c, `/projects/${P.apt}/plan`], ["고객 요청 내용", c, `/projects/${P.apt}/info`], ["고객 제안 비교", c, `/projects/${P.apt}/quotes`],
    ["고객 방 편집", c, `/projects/${P.apt}/rooms/${R1}`], ["인쇄·PDF", c, `/projects/${P.apt}/print`], ["공유 링크", guest, `/share/${token}`],
    ["업체 요청", v3, `/vendor/requests/${aid3}`], ["운영자", a, `/admin/projects/${P.apt}`],
  ];
  for (const [name, p, url] of pages) {
    await p.goto(B + url); await p.waitForTimeout(300);
    const body = await p.textContent("body");
    const bad = FORBIDDEN.filter((f) => body.includes(f));
    check(`${name}: 금지 표현 없음`, bad.length === 0, bad.join(","));
    if (["고객 방 배치", "고객 방 편집", "인쇄·PDF", "공유 링크", "업체 요청", "운영자", "고객 한눈에"].includes(name)) check(`${name}: ‘방 한 칸 · 집 전체 아님’`, body.includes("방 한 칸 · 집 전체 아님"));
    if (name === "인쇄·PDF") await shot(p, "60-print-home");
    if (name === "공유 링크") check("공유: 주소·연락처 없음", !body.includes("101동") && !body.includes(EMAIL));
  }

  // ── 8. 휴대폰 고객
  section = "휴대폰";
  const m = await mobile(); await login(m, EMAIL, "testpass1");
  await m.goto(B + "/homes/new");
  check("신청서 1단계 가로 스크롤 없음", await noOverflow(m));
  await m.click("[data-testid=home-type-villa]"); await m.fill("[data-testid=home-region]", "서울 강서구"); await m.click("[data-testid=home-next]");
  await m.click("[data-testid=home-scope-partial]"); await m.click("[data-testid=home-work-wallpaper]"); await m.click("[data-testid=home-work-lighting]");
  check("신청서 2단계 가로 스크롤 없음", await noOverflow(m));
  await shot(m, "70-mobile-home-form");
  await m.click("[data-testid=home-next]"); check("신청서 3단계 가로 스크롤 없음", await noOverflow(m));
  await m.click("[data-testid=home-next]"); check("신청서 4단계 가로 스크롤 없음", await noOverflow(m));
  await m.click("[data-testid=home-send]"); await m.waitForURL(/\/projects\/\d+$/);
  const mp = pidOf(m);
  check("휴대폰 신청 접수", sql(`select status from projects where id=${mp}`) === "requested");
  await m.goto(`${B}/projects/${mp}/rooms/new`);
  check("방 만들기 가로 스크롤 없음", await noOverflow(m));
  await m.fill("[data-testid=room-name]", "작은 방"); await m.fill("[data-testid=room-w]", "2700"); await m.fill("[data-testid=room-d]", "3000"); await m.click("[data-testid=room-submit]");
  await m.waitForURL(/rooms\/room-1/); await m.waitForSelector("main.editor");
  await m.click("[data-testid=add-m-h-bed-single]"); await m.waitForTimeout(200);
  check("방 편집(휴대폰): 가구 추가·선택 패널", (await roomItems(m)).length === 1 && (await m.locator("[data-testid=selection]").count()) === 1);
  check("방 편집(휴대폰) 가로 스크롤 없음", await noOverflow(m));
  await shot(m, "71-mobile-room-editor", false);
  await m.click("[data-testid=editor-save]"); await m.waitForURL(/saved=2/);
  await m.goto(`${B}/projects/${mp}/plan`); check("방 탭(휴대폰) 가로 스크롤 없음", await noOverflow(m));
  await m.goto(`${B}/projects/${mp}`); check("한눈에(휴대폰): 변경 내용 보내기 안내", (await m.locator("[data-testid=pending-changes]").count()) === 1 && (await noOverflow(m)));

  // ── 9. 공간 탐색 집 예시
  section = "공간 탐색";
  const officeCases = Number(sql(`select count(*) from vendor_cases c join vendors v on v.id=c.vendor_id where v.status='approved' and coalesce(json_extract(c.spec,'$.kind'),'office') != 'home'`));
  const homeCases = Number(sql(`select count(*) from vendor_cases c join vendors v on v.id=c.vendor_id where v.status='approved' and json_extract(c.spec,'$.kind') = 'home'`));
  await guest.goto(B + "/"); t = await guest.textContent("main");
  check(`홈: 사무실 ${officeCases} + 집 ${homeCases} 예시, ‘이런 공간 어때요?’`, homeCases === 5 && (await guest.locator("[data-testid=home-cases] li[data-case]").count()) === officeCases + homeCases && t.includes("이런 공간 어때요?"));
  await guest.goto(B + "/cases?space=home");
  check("필터 집 전체 = 5, 모두 ‘3D 제안 예시’·‘방 한 칸 3D’", (await guest.locator("main li[data-case]").count()) === 5 && (await guest.locator("main li[data-case] .kind-example").count()) === 5 && (await guest.locator("main li[data-case]:has-text('방 한 칸 3D')").count()) === 5);
  await shot(guest, "80-explore-home");
  await guest.goto(B + "/cases?space=office"); check(`필터 사무실 = ${officeCases}`, (await guest.locator("main li[data-case]").count()) === officeCases);
  await guest.goto(B + "/cases?space=home-apartment"); check("필터 집 · 아파트 = 2", (await guest.locator("main li[data-case]").count()) === 2);
  const hid = sql(`select id from vendor_cases where json_extract(spec,'$.homeType')='apartment' order by id limit 1`);
  await guest.goto(`${B}/cases/${hid}`); t = await main(guest);
  check("예시 상세: 방 한 칸 입체·평면, 개념 가구, 집 전체 아님", t.includes("방 한 칸 입체로 보기") && t.includes("개념 가구") && t.includes("집 전체 구조와 욕실·주방 설비, 다른 방은 들어 있지 않아요"));
  check("예시 상세: 사무실 배치 체험 버튼 없음(머리 메뉴 제외)", (await guest.locator('a[href^="/try?"]').count()) === 0);
  await shot(guest, "81-explore-home-detail");
  await c.goto(`${B}/cases/${hid}`); const href = await c.getAttribute("[data-testid=request-like-this]", "href");
  check("예시 → 집 상담 신청", href === `/homes/new?case=${hid}`);
  await c.goto(B + href);
  check("신청서: 예시가 참고 사례로 골라져 있음·유형 아파트", (await c.isChecked(`input[name=refCase][value="${hid}"]`)) && (await c.locator("[data-testid=home-type-apartment].is-active").count()) === 1);

  // ── 10. 범위 밖·사무실 분리
  section = "범위";
  for (const u of ["/community", "/shop", "/products"]) { const r = await guest.goto(B + u); check(`${u} 없음(404)`, r.status() === 404); }
  await guest.goto(B + "/guide"); t = await main(guest);
  check("이용 안내: 집 자동 배치는 ‘이번 범위 제외 · 후속 검토’", t.includes("이번 범위 제외 · 후속 검토") && !t.includes("계획 없음"));
  const office = await ctx(); await login(office, "vendor3@demo.kr");
  const oa = sql(`select a.id from assignments a join projects p on p.id=a.project_id join vendors x on x.id=a.vendor_id join users u on u.id=x.user_id where p.kind='office' and a.status='invited' and a.withdrawn_at is null and p.status not in ('contracted','closed') and a.version_id=p.requested_version_id and u.email='vendor3@demo.kr' limit 1`);
  if (oa) {
    await office.goto(`${B}/vendor/requests/${oa}`);
    await office.locator('button:has-text("참여하기")').first().click(); await office.waitForSelector("[data-testid=quote-items]");
    check("사무실 요청은 사무실 13항목 그대로", (await office.locator("[data-testid=quote-items] tbody tr").count()) === 13 && (await office.locator("[data-testid^=requested-]").count()) === 0);
  } else check("사무실 요청 견적서 확인(참여 전 사무실 배정이 없어 건너뜀)", true);
  check("기존 사무실 프로젝트 = 사무실", sql(`select group_concat(distinct kind) from projects where title like '[예시]%' or title like '[테스트%'`) === "office");

  section = "공통";
  check("페이지 오류 없음", errors.length === 0, errors.join(" | "));
  const logErr = execSync(`grep -c "⨯\\|Error:" "${require("path").dirname(DB)}/server.log" || true`).toString().trim();
  check("서버 로그 오류 없음", logErr === "0", logErr);
  console.log(results.join("\n"));
  const pass = results.filter((r) => r.startsWith("PASS")).length, fail = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log(results.join("\n")); console.error(e); process.exit(1); });
