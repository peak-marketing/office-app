// 집 전체 평면 E2E (운영용 빌드로 띄운 격리 서버에 대고 실행. 실제 3100 데이터에는 돌리지 않는다)
// 고객(PC): 집 요청 저장만(요청 전) → 치수로 평면 만들기 → 내부 벽(누르기·숫자) → 방 찾기 → 방 이름 → 문·통로·창 → 고정 구조물
// → 가구 놓기·크기 조절 → 검사(겹침·고정 구조물·벽 걸침·문 앞) → 저장 → 다시 열어도 같은 평면 → 3D → 요청 없이 저장(요청 전 그대로)
// → 도면 이미지로 따라 그리기 → 요청 보내기 → 운영자 배정(vendor1, 주거 분야) → 업체가 보낸 평면을 봄 → 고객이 고침
// → ‘변경 내용 보내기’ 전에는 업체가 이전 평면 → 보낸 뒤 새 평면과 바뀐 점 → 공유·인쇄·문구 → 휴대폰(390×844) 전 과정
// 필요: 시연 계정(customer·vendor1·admin@demo.kr, demo1234). 실행: npm run test:e2e -- house (B·DB·P는 실행기가 준다)
/* eslint-disable @typescript-eslint/no-require-imports -- 실행기가 node로 바로 돌리는 CommonJS 검사 스크립트 */
const { chromium } = require("playwright-core");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const B = process.env.B;
const DB = process.env.DB;
const OUT = process.env.OUT || path.join(process.env.P || process.cwd(), ".e2e-data/shots/house");
const SHOTS = !!process.env.SHOTS;
if (!B || !DB) throw new Error("B와 DB를 주세요");
if (SHOTS) fs.mkdirSync(OUT, { recursive: true });
const sql = (q) => execSync(`sqlite3 "${DB}" "${q.replace(/"/g, '\\"')}"`, { maxBuffer: 64 << 20 }).toString().trim();
const FORBIDDEN = ["우리 집 3D", "집 전체 3D 완성", "집 구조를 재현", "안전한 통로", "시공 가능합니다", "시공할 수 있어요"];
const LABEL = "고객이 입력한 집 평면 · 실측 도면 아님";
const results = [];
let section = "";
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} [${section}] ${name}${ok ? "" : ` — ${String(extra).slice(0, 400)}`}`);
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

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
  const houseOf = (pid) => { const raw = sql(`select house from versions where id=(select current_version_id from projects where id=${pid})`); return raw ? JSON.parse(raw) : null; };
  const state = async (p) => JSON.parse(await p.getAttribute("[data-testid=house-editor]", "data-house"));
  const rooms = async (p) => JSON.parse(await p.getAttribute("[data-testid=house-editor]", "data-rooms"));
  const issues = async (p) => JSON.parse(await p.getAttribute("[data-testid=house-editor]", "data-issues"));
  const msg = (p) => p.textContent("[data-testid=editor-msg]").catch(() => "");

  // 평면 좌표(미터) → 화면 좌표. 그 점이 화면 가운데 오게 스크롤한다.
  const planPt = (p, x, y) =>
    p.evaluate(([x, y]) => {
      const svg = document.querySelector("[data-testid=house-plan]");
      const D = Number(svg.dataset.depth);
      const at = () => new DOMPoint(x, D - y).matrixTransform(svg.getScreenCTM());
      let q = at();
      const box = svg.closest("[data-testid=plan-scroll]");
      if (box) {
        const r = box.getBoundingClientRect();
        box.scrollLeft += q.x - (r.left + r.width / 2);
        box.scrollTop += q.y - (r.top + r.height / 2);
        q = at();
      }
      // 휴대폰에서 고른 것의 조작판이 화면 아래를 덮으므로 위쪽(30%)에 오게 한다.
      window.scrollBy(0, q.y - innerHeight * 0.3);
      q = at();
      return [q.x, q.y];
    }, [x, y]);
  const tap = async (p, x, y, touch = false) => {
    const [px, py] = await planPt(p, x, y);
    if (touch) await p.touchscreen.tap(px, py);
    else await p.mouse.click(px, py);
    await p.waitForTimeout(120);
  };
  const setMm = async (p, sel, v) => { await p.fill(sel, String(v)); await p.press(sel, "Enter"); await p.waitForTimeout(120); };
  const fillHome = async (p, o) => {
    await p.goto(B + "/homes/new");
    await p.click(`[data-testid=home-type-${o.type}]`);
    await p.fill("[data-testid=home-region]", o.region);
    await p.click("[data-testid=home-next]");
    await p.click(`[data-testid=home-scope-${o.scope}]`);
    for (const w of o.works ?? []) await p.click(`[data-testid=home-work-${w}]`);
    await p.click("[data-testid=home-next]");
    await p.click("[data-testid=home-next]");
    if (o.address) await p.fill("input[name=address]", o.address);
    await p.click(o.send ? "[data-testid=home-send]" : "[data-testid=home-save]");
    await p.waitForURL(/\/projects\/\d+$/);
    return pidOf(p);
  };

  const c = await ctx();
  await login(c, "customer@demo.kr");

  // ── 1. 치수로 만들기(요청 전)
  section = "치수로 만들기";
  const P1 = await fillHome(c, { type: "apartment", region: "서울 송파구", scope: "partial", works: ["bath", "kitchen"], address: "서울 송파구 예시로 1, 101동 101호" });
  check("집 요청 저장만(요청 전)", sql(`select kind||'|'||status||'|'||coalesce(requested_version_id,'-') from projects where id=${P1}`) === "home|draft|-");
  await c.goto(`${B}/projects/${P1}`);
  check("프로젝트 탭: ‘방 배치’ 옆 ‘집 전체 평면’", (await c.locator('nav[aria-label="프로젝트 메뉴"] a').allTextContents()).join("|").includes("방 배치|집 전체 평면"));
  await c.goto(`${B}/projects/${P1}/house`);
  let t = await main(c);
  check("탭: 비어 있음 + 요청 없이도 만들 수 있음 + 문구", (await c.locator("[data-testid=house-empty]").count()) === 1 && t.includes("공사 요청 없이도 만들고 저장할 수 있어요") && t.includes(LABEL));
  await c.click("[data-testid=house-new-dims]");
  await c.waitForURL(/house\/new/);
  await c.fill("[data-testid=house-w]", "1500");
  await c.fill("[data-testid=house-d]", "7000");
  check("범위 밖(가로 1,500) 만들기 막음", (await c.isDisabled("[data-testid=house-submit]")) && (await c.textContent("[data-testid=create-errors]")).includes("2,000~40,000mm"));
  await c.fill("[data-testid=house-w]", "9000");
  check("미리보기(평면)", (await c.locator("[data-testid=create-preview]").count()) === 1);
  await shot(c, "01-create-dims");
  await c.click("[data-testid=house-submit]");
  await c.waitForURL(/house\/edit$/);
  await c.waitForSelector("[data-testid=house-editor]");
  let H = houseOf(P1);
  check("저장: 9,000 × 7,000 직사각형, 천장 2,400, 평면 1, 버전 새로", H && H.width === 9 && H.depth === 7 && H.height === 2.4 && H.rev === 1 && H.outline.length === 4 && H.source === "dims");
  check("편집 화면: 고객이 입력한 평면 문구", (await c.textContent("[data-testid=house-scope]")).includes(LABEL) && (await c.textContent("[data-testid=house-scope]")).includes("설비·구조는 표시한 것만"));
  check("처음엔 방 1개(벽 없음)", (await rooms(c)).length === 1);

  // ── 2. 내부 벽과 방 찾기
  section = "벽·방";
  check("벽 그리기 모드로 시작", (await c.getAttribute("[data-testid=house-editor]", "data-mode")) === "wall");
  await tap(c, 0.03, 4.0);
  check("시작점 표시", (await c.locator("[data-testid=wall-start]").count()) === 1);
  await tap(c, 8.96, 3.99);
  let s = await state(c);
  check("벽 1: 바깥 벽에 맞춰 (0,4)–(9,4)", s.walls.length === 1 && s.walls[0].slice(1, 5).join() === "0,4,9,4", JSON.stringify(s.walls));
  let r = await rooms(c);
  check("벽 1 → 방 2개(35.55·26.55㎡, 벽 두께 제외)", r.length === 2 && near(r[0][1], 35.55, 0.001) && near(r[1][1], 26.55, 0.001), JSON.stringify(r));
  await tap(c, 4.0, 0.03);
  await tap(c, 4.01, 3.94);
  s = await state(c);
  check("벽 2: 벽 1에 맞춰 (4,0)–(4,4)(T자)", s.walls.length === 2 && s.walls[1].slice(1, 5).join() === "4,0,4,4", JSON.stringify(s.walls));
  check("방 3개", (await rooms(c)).length === 3);
  await c.click("[data-testid=wall-numbers] summary");
  await c.fill("[data-testid=wn-x]", "6000"); await c.fill("[data-testid=wn-y]", "4000"); await c.selectOption("[data-testid=wn-dir]", "y"); await c.fill("[data-testid=wn-len]", "3000"); await c.click("[data-testid=wn-add]");
  await c.waitForTimeout(150);
  r = await rooms(c);
  check("숫자로 벽 3 → 방 4개", (await state(c)).walls.length === 3 && r.length === 4, JSON.stringify(r));
  check("방 면적(아래 왼쪽 15.6㎡ = 3.95 × 3.95)", near(r[0][1], 15.603, 0.01), JSON.stringify(r));
  await c.fill("[data-testid=wn-x]", "1000"); await c.fill("[data-testid=wn-y]", "5000"); await c.selectOption("[data-testid=wn-dir]", "x"); await c.fill("[data-testid=wn-len]", "2000"); await c.click("[data-testid=wn-add]");
  await c.waitForTimeout(150);
  t = await c.textContent("[data-testid=house-warnings]");
  check("닫히지 않은 벽(양끝 떨어짐): 경고·표시, 방 수 그대로", t.includes("벽 4 끝이 다른 벽에 닿지 않았어요") && (await c.locator("[data-testid=dangling-end]").count()) === 2 && (await rooms(c)).length === 4, t);
  await c.fill("[data-testid=wn-x]", "1000"); await c.fill("[data-testid=wn-y]", "8000"); await c.selectOption("[data-testid=wn-dir]", "x"); await c.fill("[data-testid=wn-len]", "2000"); await c.click("[data-testid=wn-add]");
  check("집 밖 벽은 넣지 않음(오류 문장)", (await msg(c)).includes("집 바깥 벽 밖으로") && (await state(c)).walls.length === 4);
  await c.click("[data-testid=editor-undo]");
  check("되돌리기: 벽 4 사라짐", (await state(c)).walls.length === 3 && (await c.locator("[data-testid=dangling-end]").count()) === 0);
  await c.click("[data-testid=wall-pick]");
  await tap(c, 6, 5.5);
  check("벽 고르기: 벽 3 선택·길이 표시", (await c.getAttribute("[data-testid=house-editor]", "data-selected")) === "wall:w3" && (await c.textContent("[data-testid=selection]")).includes("벽 3 · 세로 3,000mm"));
  await c.click("[data-testid=wall-draw]");
  await shot(c, "10-walls", false);

  // ── 3. 방 이름
  section = "방 이름";
  await c.click("[data-testid=mode-label]");
  await tap(c, 2, 2);
  check("방 고르기: 면적 표시", (await c.textContent("[data-testid=selection]")).includes("이름 없는 방 1 · 약 15.6㎡"));
  await c.click("[data-testid=room-preset-bed]");
  await tap(c, 6.5, 2);
  await c.click("[data-testid=room-preset-living]");
  await tap(c, 3, 5.5);
  await c.click("[data-testid=room-preset-kitchen]");
  await tap(c, 7.5, 5.5);
  await c.fill("[data-testid=room-name-input]", "욕실");
  await c.click("[data-testid=room-name-save]");
  r = await rooms(c);
  check("이름 4개: 침실1·거실·주방·욕실(직접 입력)", r.map((x) => x[0]).join() === "침실1,거실,주방,욕실", JSON.stringify(r));
  check("평면에 이름·면적", (await c.locator('[data-room-label="침실1"]').count()) === 1 && (await c.textContent('[data-room-label="침실1"]')).includes("15.6㎡"));

  // ── 4. 문·통로·창·고정 구조물
  section = "문·창·구조물";
  await c.click("[data-testid=mode-door]");
  await tap(c, 4, 2);
  await c.click("[data-testid=door-kind-bath]");
  await tap(c, 7.5, 4);
  await c.click("[data-testid=door-kind-passage]");
  await tap(c, 5, 4);
  await c.click("[data-testid=door-kind-entry]");
  await tap(c, 7, 0);
  await tap(c, 2, 4.05);
  check("현관문은 내부 벽에 못 놓음", (await msg(c)).includes("바깥 벽에만"));
  await c.click("[data-testid=mode-window]");
  await tap(c, 2, 7.1);
  s = await state(c);
  const kinds = s.openings.map((o) => `${o[1]}@${o[2]}`).join();
  check("문 4개(방문 w2·욕실 문 w1·통로 w1·현관문 o0) + 창(o2)", kinds === "door@w2,bath@w1,passage@w1,entry@o0,window@o2", kinds);
  check("방문: 누른 곳 가운데(폭 900, 1,550부터)", near(s.openings[0][3], 1.55) && near(s.openings[0][4], 0.9), JSON.stringify(s.openings[0]));
  check("문은 방을 나누지 않음(방 4개 그대로)", (await rooms(c)).length === 4);
  await c.click("[data-testid=mode-door]");
  await c.click("[data-testid=opening-d1]", { force: true });
  check("놓은 문 고르기", (await c.getAttribute("[data-testid=house-editor]", "data-selected")) === "opening:d1");
  await c.click("[data-testid=opening-side]");
  await c.click("[data-testid=opening-hinge]");
  await setMm(c, "[data-testid=opening-w]", 800);
  s = await state(c);
  check("문 폭·여는 쪽·경첩 고치기", near(s.openings[0][4], 0.8) && s.openings[0][5] === "b" && s.openings[0][6] === -1, JSON.stringify(s.openings[0]));
  await setMm(c, "[data-testid=opening-w]", 900);
  await setMm(c, "[data-testid=opening-at]", 4000);
  check("벽 길이 밖으로 옮기면 오류·그대로", (await msg(c)).includes("밖으로 나가요") && near((await state(c)).openings[0][3], 1.55));
  await c.click("[data-testid=mode-fixed]");
  await tap(c, 1, 3.4);
  s = await state(c);
  check("붙박이장 자리 놓기(기본 1,200 × 600)", s.fixed.length === 1 && s.fixed[0][1] === "closet" && near(s.fixed[0][4], 1.2), JSON.stringify(s.fixed));
  await setMm(c, "[data-testid=fixed-x]", 0);
  await setMm(c, "[data-testid=fixed-y]", 3350);
  s = await state(c);
  check("숫자로 벽에 붙이기(0, 3,350)", near(s.fixed[0][2], 0) && near(s.fixed[0][3], 3.35), JSON.stringify(s.fixed));
  await c.click("[data-testid=selection] button:has-text('선택 해제')");
  await c.click("[data-testid=fixed-kind-toilet]");
  await tap(c, 8.5, 6.5);
  check("변기 자리(욕실)", (await state(c)).fixed.length === 2 && (await state(c)).fixed[1][1] === "toilet");
  await shot(c, "20-doors-fixed", false);

  // ── 5. 가구와 검사
  section = "가구·검사";
  await c.click("[data-testid=mode-furniture]");
  await tap(c, 2, 1);
  check("놓을 방: 침실1", (await c.textContent("[data-testid=target-room]")) === "침실1");
  await c.click("[data-testid=add-h-bed-queen]");
  s = await state(c);
  check("퀸 침대: 침실1 빈자리", s.items.length === 1 && s.items[0][1] === "h-bed-queen" && s.items[0][2] < 4 && s.items[0][3] < 4, JSON.stringify(s.items));
  check("개념 가구 문구", (await c.textContent("[data-testid=concept-note]")).includes("치수 검토용 개념 가구 · 실제 상품 아님"));
  await setMm(c, "[data-testid=pos-x]", 0); await setMm(c, "[data-testid=pos-y]", 1800);
  let is = await issues(c);
  check("검사: 고정 구조물(붙박이장)과 겹침", is.some((i) => i[0] === "fixed" && i[1] === "n1"), JSON.stringify(is));
  await setMm(c, "[data-testid=pos-y]", 3000);
  is = await issues(c);
  check("검사: 벽에 걸침(벽 1)", is.some((i) => i[0] === "wall" && i[1] === "n1") && (await c.textContent("[data-testid=check-wall]")).includes("벽 1에 걸쳐 있어요"), JSON.stringify(is));
  await setMm(c, "[data-testid=pos-x]", 2400); await setMm(c, "[data-testid=pos-y]", 1000);
  is = await issues(c);
  const doorText = await c.textContent("[data-testid=check-door]");
  check("검사: 문 앞 장애물(방문 앞 바닥 폭 900 × 깊이 900)", is.some((i) => i[0] === "door" && i[1] === "n1") && doorText.includes("방문 앞 바닥(폭 900 × 깊이 900mm)"), doorText);
  check("문 앞 자리(주황 점선) 보임", (await c.locator("[data-testid=house-zone]").count()) >= 2);
  await c.click("[data-testid=add-h-nightstand]");
  s = await state(c);
  const ns = s.items.find((x) => x[1] === "h-nightstand");
  await setMm(c, "[data-testid=pos-x]", 2500); await setMm(c, "[data-testid=pos-y]", 1500);
  is = await issues(c);
  check("검사: 가구끼리 겹침(침대–협탁)", is.some((i) => i[0] === "overlap" && i.includes(ns[0]) && i.includes("n1")), JSON.stringify(is));
  await c.click(`[data-testid=item-n1]`, { force: true });
  check("평면에서 가구 누르면 고름", (await c.getAttribute("[data-testid=house-editor]", "data-selected")) === "item:n1");
  await setMm(c, "[data-testid=size-w]", 1400);
  s = await state(c);
  check("크기 조절 1,400 반영", near(s.items[0][5], 1.4), JSON.stringify(s.items[0]));
  await setMm(c, "[data-testid=pos-x]", 500); await setMm(c, "[data-testid=pos-y]", 500);
  await c.click(`[data-testid=item-${ns[0]}]`, { force: true });
  await setMm(c, "[data-testid=pos-x]", 2000); await setMm(c, "[data-testid=pos-y]", 2000);
  is = await issues(c);
  const gaps = await c.textContent("[data-testid=gap-notices]");
  check("검사 통과 자리: 확인할 것 0", is.length === 0 && (await c.textContent("[data-testid=issue-count]")).includes("걸린 곳 없음"), JSON.stringify(is));
  check("통로 간격 알림: 무엇과 무엇 사이 몇 mm, 판정 아님", gaps.includes("퀸 침대와 협탁 사이 빈 간격 100mm") && gaps.includes("판정하지 않습니다") && gaps.includes("임시값 600mm"), gaps);
  await shot(c, "30-furniture-checks", false);

  // ── 6. 저장·다시 열기
  section = "저장·복원";
  const before = await state(c);
  const roomsBefore = await rooms(c);
  await c.click("[data-testid=editor-save]");
  await c.waitForURL(/saved=2/);
  await c.waitForSelector("[data-testid=house-editor]");
  check("저장 → 평면 2", (await c.textContent("[data-testid=editor-status]")).includes("평면 2 기준"));
  check("저장 뒤 화면 = 저장 전(벽·문·이름·구조물·가구)", JSON.stringify(await state(c)) === JSON.stringify(before), JSON.stringify(await state(c)));
  await c.goto(`${B}/projects/${P1}/house/edit`);
  await c.waitForSelector("[data-testid=house-editor]");
  check("새로 열어도 같은 평면·방", JSON.stringify(await state(c)) === JSON.stringify(before) && JSON.stringify(await rooms(c)) === JSON.stringify(roomsBefore));
  H = houseOf(P1);
  check("DB: 평면 2, 벽 3·문창 5·이름 4·구조물 2·가구 2, 침대 1,400(부품 폭 1,400)", H.rev === 2 && H.walls.length === 3 && H.openings.length === 5 && H.labels.length === 4 && H.fixed.length === 2 && H.items.length === 2 && near(H.items[0].w, 1.4) && near(Math.max(...H.items[0].parts.filter((q) => q.p).map((q) => q.x + q.w)) - Math.min(...H.items[0].parts.filter((q) => q.p).map((q) => q.x)), 1.4, 1e-3));
  await c.click("[data-testid=editor-save]").catch(() => {});
  check("바뀐 점 없으면 저장 버튼 꺼짐", await c.isDisabled("[data-testid=editor-save]"));

  // ── 7. 3D
  section = "3D";
  await c.click("[data-testid=view-3d]");
  await c.waitForSelector("[data-testid=house-3d] canvas");
  await c.waitForTimeout(1500);
  check("편집 3D: 캔버스", (await c.locator("[data-testid=house-3d] canvas").count()) === 1);
  const objs = await c.evaluate(() => { const v = document.querySelector("[data-testid=house-3d] canvas").__viewer; return v.option.objects.map((o) => o.name); });
  check("3D: 문 위 벽(문 3개·통로 1)·창·방 바닥·가구", objs.filter((n) => n === "문 위 벽").length === 3 && objs.includes("통로 위 벽") && objs.includes("창호") && objs.includes("바닥 · 침실1") && objs.includes("침대 프레임"), objs.slice(0, 40).join(","));
  await shot(c, "40-editor-3d", false);
  await c.goto(`${B}/projects/${P1}/house`);
  t = await main(c);
  check("탭: 평면 먼저(3D는 누르면)", (await c.locator("[data-testid=house-view] [data-testid=house-plan]").count()) === 1 && (await c.locator("[data-testid=house-3d]").count()) === 0);
  check("탭: 방 4개 이름·면적, 문구", (await c.locator("[data-testid=house-room]").count()) === 4 && t.includes("침실1 · 약 15.6㎡") && t.includes(LABEL));
  await c.click("[data-testid=house-tab-3d]");
  await c.waitForSelector("[data-testid=house-3d] canvas");
  check("탭: 3D 캔버스", (await c.locator("[data-testid=house-3d] canvas").count()) === 1);
  await shot(c, "41-tab-view");

  // ── 8. 요청 없이 쓰기, 방 한 칸 배치와 함께
  section = "요청 없이";
  await c.goto(`${B}/projects/${P1}/rooms/new`);
  await c.fill("[data-testid=room-name]", "작은 방");
  await c.fill("[data-testid=room-w]", "3000");
  await c.fill("[data-testid=room-d]", "3000");
  await c.click("[data-testid=room-submit]");
  await c.waitForURL(/\/rooms\/room-\d+(\?.*)?$/);
  check("방 한 칸 배치를 만들어도 집 전체 평면 그대로(평면 2)", houseOf(P1)?.rev === 2 && JSON.parse(sql(`select rooms from versions where id=(select current_version_id from projects where id=${P1})`)).length === 1);
  await c.goto(`${B}/projects/${P1}/plan`);
  check("방 배치 탭(1차) 그대로", (await c.locator("[data-testid^=room-card-]").count()) === 1 && (await c.textContent("[data-testid=rooms-scope]")).includes("방 한 칸 · 집 전체 아님"));
  check("요청 전 그대로(draft, 요청 기록 없음)", sql(`select status||'|'||coalesce(requested_version_id,'-') from projects where id=${P1}`) === "draft|-" && sql(`select count(*) from request_revisions where project_id=${P1}`) === "0");
  check("버전마다 평면 이어 감(방 배치 0개, 평면 있는 버전 2개 이상)", Number(sql(`select count(*) from versions where project_id=${P1} and house is not null`)) >= 2);

  // ── 9. 도면 이미지로 따라 그리기
  section = "따라 그리기";
  const P2 = await fillHome(c, { type: "villa", region: "서울 은평구", scope: "full" });
  await c.goto(`${B}/projects/${P2}/house/new?from=trace`);
  await c.setInputFiles("[data-testid=trace-file]", path.join(__dirname, "fixtures/plan1.jpg"));
  await c.waitForSelector("[data-testid=trace-svg]");
  const tracePt = (u, v) => c.evaluate(([u, v]) => { const svg = document.querySelector("[data-testid=trace-svg]"); svg.scrollIntoView({ block: "center" }); const q = new DOMPoint(u, v).matrixTransform(svg.getScreenCTM()); return [q.x, q.y]; }, [u, v]);
  const clickPx = async (u, v) => { const [x, y] = await tracePt(u, v); await c.mouse.click(x, y); await c.waitForTimeout(80); };
  await clickPx(200, 900); await clickPx(1400, 900);
  await c.fill("[data-testid=trace-mm]", "12000");
  await c.click("[data-testid=trace-scale]");
  for (const [u, v] of [[200, 900], [1400, 900], [1400, 600], [1000, 600], [1000, 200], [200, 200]]) await clickPx(u, v);
  await c.click("[data-testid=trace-close]");
  t = await c.textContent("[data-testid=trace-result]");
  const dims = (t.match(/([\d,]+) × ([\d,]+) mm/) ?? []).slice(1).map((x) => Number(x.replaceAll(",", "")));
  check("따라 그린 외곽: 꺾인 집 벽 6개 약 12,000 × 7,000(축척은 찍은 두 점으로)", t.includes("바깥 벽 6개") && Math.abs(dims[0] - 12000) <= 60 && Math.abs(dims[1] - 7000) <= 60, t);
  await shot(c, "50-trace");
  await c.click("[data-testid=house-submit]");
  await c.waitForURL(/house\/edit$/);
  await c.waitForSelector("[data-testid=house-editor]");
  const H2 = houseOf(P2);
  check("저장: 따라 그림·밑그림 파일·윤곽 6점", H2.source === "trace" && H2.outline.length === 6 && H2.underlay && H2.underlay.fileId > 0 && near(H2.width, 12, 0.06) && near(H2.depth, 7, 0.06), JSON.stringify({ s: H2.source, o: H2.outline, u: H2.underlay }));
  check("밑그림은 자료 목록에 넣지 않음(category underlay)", sql(`select category from files where id=${H2.underlay.fileId}`) === "underlay");
  check("편집: 밑그림 겹쳐 보기", (await c.locator("[data-testid=house-underlay]").count()) === 1);
  const fileRes = await c.request.get(`${B}/files/${H2.underlay.fileId}`);
  check("밑그림 파일 열람(고객)", fileRes.status() === 200);
  check("꺾인 집: 방 1개(면적 = 바깥 윤곽 12×7 − 4×4)", (await rooms(c)).length === 1 && near((await rooms(c))[0][1], 12 * 7 - 4 * 4, 0.8), JSON.stringify(await rooms(c)));
  await tap(c, 0.02, 2);
  await tap(c, 11.97, 2.01);
  s = await state(c);
  check("따라 그린 집에도 벽 그리기(양쪽 바깥 벽에 맞춤)", s.walls.length === 1 && s.walls[0][1] === 0 && near(s.walls[0][3], H2.width) && (await rooms(c)).length === 2 && (await c.locator("[data-testid=dangling-end]").count()) === 0, JSON.stringify(s.walls));
  await c.click("[data-testid=editor-save]");
  await c.waitForURL(/saved=/);

  // ── 10. 요청 → 운영자 배정 → 업체
  section = "요청 흐름";
  await c.goto(`${B}/projects/${P1}/request`);
  await c.click("[data-testid=home-send]");
  await c.waitForURL(new RegExp(`/projects/${P1}$`));
  const r1 = JSON.parse(sql(`select snapshot from request_revisions where project_id=${P1} order by no desc limit 1`));
  check("요청 r1에 집 전체 평면(평면 2) 보관", r1.house && r1.house.rev === 2 && r1.house.walls.length === 3 && r1.house.labels.length === 4);
  const v1 = await ctx();
  await login(v1, "vendor1@demo.kr");
  await v1.goto(`${B}/vendor/profile`);
  if (!(await v1.isChecked("[data-testid=field-home]"))) {
    await v1.check("[data-testid=field-home]");
    await v1.locator('form:has([data-testid=vendor-fields]) button:has-text("저장")').click();
    await v1.waitForSelector("text=저장했습니다");
  }
  check("vendor1 주거 분야", sql(`select fields from vendors v join users u on u.id=v.user_id where u.email='vendor1@demo.kr'`).split(",").includes("home"));
  const a = await ctx();
  await login(a, "admin@demo.kr");
  await a.goto(`${B}/admin/projects/${P1}`);
  t = await main(a);
  check("운영자: 집 전체 평면 보기(문구·방)", (await a.locator("[data-testid=house-view]").count()) === 1 && t.includes(LABEL) && t.includes("침실1"));
  const company1 = sql(`select company from vendors v join users u on u.id=v.user_id where u.email='vendor1@demo.kr'`);
  await a.locator(`label:has-text("${company1}") input[name=vendor]`).check();
  await a.click('button:has-text("선택한 업체 배정")');
  await a.waitForSelector("text=업체 1곳을 배정했습니다");
  const aid1 = sql(`select a.id from assignments a join vendors x on x.id=a.vendor_id join users u on u.id=x.user_id where a.project_id=${P1} and u.email='vendor1@demo.kr'`);
  await v1.goto(`${B}/vendor/requests/${aid1}`);
  t = await main(v1);
  check("업체: 보낸 평면(평면 2·방 이름·문구)", (await v1.locator("[data-testid=house-view]").count()) === 1 && (await v1.getAttribute("[data-testid=house-view]", "data-house-rev")) === "2" && t.includes("침실1") && t.includes(LABEL) && t.includes("실측 도면이 아니며"));
  check("업체: 상세 주소 안 보임", !t.includes("101동 101호"));
  await shot(v1, "60-vendor-house");

  section = "변경 보내기";
  await c.goto(`${B}/projects/${P1}/house/edit`);
  await c.waitForSelector("[data-testid=house-editor]");
  await c.click("[data-testid=mode-label]");
  await tap(c, 2, 2);
  await c.fill("[data-testid=room-name-input]", "안방");
  await c.click("[data-testid=room-name-save]");
  await c.click("[data-testid=mode-wall]");
  await c.click("[data-testid=wall-numbers] summary");
  await c.fill("[data-testid=wn-x]", "4000"); await c.fill("[data-testid=wn-y]", "2500"); await c.selectOption("[data-testid=wn-dir]", "x"); await c.fill("[data-testid=wn-len]", "5000"); await c.click("[data-testid=wn-add]");
  check("고침: 벽 추가로 방 5개", (await rooms(c)).length === 5);
  check("편집: 업체에는 평면 2 안내", (await c.textContent("[data-testid=sent-info]")).includes("평면 2"));
  await c.click("[data-testid=editor-save]");
  await c.waitForURL(/saved=3/);
  await c.goto(`${B}/projects/${P1}`);
  const pend = await c.textContent("[data-testid=pending-changes]");
  check("변경 대기: 평면 2 → 3, 방 이름·벽·방 수", pend.includes("집 전체 평면 수정 (평면 2 → 3)") && pend.includes("방 이름: 침실1 → 안방") && pend.includes("내부 벽: 3개 → 4개"), pend);
  await c.goto(`${B}/projects/${P1}/house`);
  check("탭: 고침 · 업체는 평면 2 기준", (await c.textContent("[data-testid=house-tab]")).includes("고침 · 업체는 평면 2 기준"));
  await v1.goto(`${B}/vendor/requests/${aid1}`);
  t = await main(v1);
  check("보내기 전 업체는 이전 평면(평면 2·침실1·안방 없음)", (await v1.getAttribute("[data-testid=house-view]", "data-house-rev")) === "2" && t.includes("침실1") && !t.includes("안방"));
  check("요청 기록 그대로 r1", sql(`select count(*) from request_revisions where project_id=${P1}`) === "1");
  await c.goto(`${B}/projects/${P1}`);
  await c.click("[data-testid=send-update]");
  await c.waitForSelector("[data-testid=pending-changes]", { state: "detached" });
  const r2 = JSON.parse(sql(`select snapshot from request_revisions where project_id=${P1} order by no desc limit 1`));
  check("보내기 → r2: 평면 3", r2.house.rev === 3 && r2.house.labels.some((l) => l.name === "안방"));
  await v1.goto(`${B}/vendor/requests/${aid1}`);
  t = await main(v1);
  check("업체: 새 평면(평면 3·안방)과 바뀐 점", (await v1.getAttribute("[data-testid=house-view]", "data-house-rev")) === "3" && t.includes("안방") && (await v1.textContent("[data-testid=rev-changes]")).includes("집 전체 평면 수정 (평면 2 → 3)"));
  await shot(v1, "61-vendor-house-r2");

  // ── 11. 공유·인쇄·문구
  section = "공유·인쇄·문구";
  await c.goto(`${B}/projects/${P1}/activity`); await c.click("button:has-text('링크 만들기')"); await c.waitForTimeout(600);
  const token = sql(`select token from share_links where project_id=${P1} order by id desc limit 1`);
  const guest = await ctx();
  const pages = [
    ["고객 평면 탭", c, `/projects/${P1}/house`], ["고객 편집", c, `/projects/${P1}/house/edit`], ["인쇄·PDF", c, `/projects/${P1}/print`], ["공유 링크", guest, `/share/${token}`],
    ["업체 요청", v1, `/vendor/requests/${aid1}`], ["운영자", a, `/admin/projects/${P1}`], ["만들기", c, `/projects/${P2}/house`],
  ];
  for (const [name, p, url] of pages) {
    await p.goto(B + url); await p.waitForTimeout(300);
    const body = await p.textContent("body");
    const bad = FORBIDDEN.filter((f) => body.includes(f));
    check(`${name}: 금지 표현 없음`, bad.length === 0, bad.join(","));
    check(`${name}: ‘${LABEL}’`, body.includes(LABEL));
    if (name === "공유 링크") check("공유: 주소 없음·평면 있음", !body.includes("101동") && (await p.locator("[data-testid=house-view]").count()) === 1);
    if (name === "인쇄·PDF") check("인쇄: 평면 그림", (await p.locator("[data-testid=print-house] svg").count()) >= 1);
  }

  // ── 12. 휴대폰
  section = "휴대폰";
  const m = await mobile();
  await login(m, "customer@demo.kr");
  const P3 = await fillHome(m, { type: "officetel", region: "서울 마포구", scope: "undecided" });
  await m.goto(`${B}/projects/${P3}/house`);
  check("탭 가로 스크롤 없음", await noOverflow(m));
  await m.click("[data-testid=house-new-dims]");
  await m.fill("[data-testid=house-w]", "6000");
  await m.fill("[data-testid=house-d]", "5000");
  check("만들기 가로 스크롤 없음", await noOverflow(m));
  await m.click("[data-testid=house-submit]");
  await m.waitForURL(/house\/edit$/);
  await m.waitForSelector("[data-testid=house-editor]");
  check("편집 가로 스크롤 없음", await noOverflow(m));
  await m.click("[data-testid=zoom-2]");
  await tap(m, 3.02, 0.03, true);
  await tap(m, 3.01, 4.98, true);
  check("터치로 벽 그리기 → 방 2개", (await state(m)).walls.length === 1 && (await rooms(m)).length === 2, JSON.stringify(await state(m)));
  await m.click("[data-testid=mode-door]");
  await tap(m, 3, 2.5, true);
  check("터치로 방문 놓기", (await state(m)).openings.length === 1);
  await m.click("[data-testid=mode-label]");
  await tap(m, 1.5, 2.5, true);
  await m.click("[data-testid=room-preset-bed]");
  check("터치로 방 이름", (await rooms(m))[0][0] === "침실1");
  await m.click("[data-testid=selection] button:has-text('선택 해제')");
  await m.click("[data-testid=mode-furniture]");
  await m.click("[data-testid=zoom-1]");
  await tap(m, 1.5, 2.5, true);
  await m.click("[data-testid=add-h-bed-single]");
  check("가구 추가·선택 패널", (await state(m)).items.length === 1 && (await m.locator("[data-testid=selection]").count()) === 1);
  const it0 = (await state(m)).items[0];
  // 터치로 끌기: 고른 가구를 다시 눌러 끈다(브라우저 터치 입력)
  const cdp = await m.context().newCDPSession(m);
  const [sx, sy] = await planPt(m, it0[2], it0[3]);
  const [ex, ey] = await planPt(m, it0[2] + 0.5, it0[3]);
  const [sx2, sy2] = await planPt(m, it0[2], it0[3]);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: sx2, y: sy2 }] });
  for (let k = 1; k <= 6; k++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: sx2 + ((ex - sx) * k) / 6, y: sy2 + ((ey - sy) * k) / 6 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await m.waitForTimeout(200);
  const it1 = (await state(m)).items[0];
  check("터치로 끌어 옮기기(약 500mm)", Math.abs(it1[2] - it0[2] - 0.5) <= 0.1 && near(it1[3], it0[3], 0.06), JSON.stringify([it0, it1]));
  await m.click("[data-testid=move-right]");
  check("화살표로 옮기기(100mm)", near((await state(m)).items[0][2], it1[2] + 0.1, 1e-3));
  check("편집(가구 선택) 가로 스크롤 없음", await noOverflow(m));
  await shot(m, "70-mobile-editor", false);
  await m.click("[data-testid=editor-save]");
  await m.waitForURL(/saved=2/);
  check("휴대폰 저장 → 평면 2", houseOf(P3).rev === 2 && houseOf(P3).items.length === 1);
  await m.click("[data-testid=view-3d]");
  await m.waitForSelector("[data-testid=house-3d] canvas");
  check("휴대폰 3D", (await m.locator("[data-testid=house-3d] canvas").count()) === 1 && (await noOverflow(m)));
  await m.goto(`${B}/projects/${P3}/house`);
  check("탭(휴대폰) 가로 스크롤 없음", await noOverflow(m));
  await m.goto(`${B}/projects/${P3}/house/new?from=trace`);
  check("이미 평면이 있으면 만들기 대신 편집으로", /house\/edit$/.test(m.url()));
  const P4 = await fillHome(m, { type: "oneroom", region: "서울 관악구", scope: "undecided" });
  await m.goto(`${B}/projects/${P4}/house/new?from=trace`);
  await m.setInputFiles("[data-testid=trace-file]", path.join(__dirname, "fixtures/plan1.jpg"));
  await m.waitForSelector("[data-testid=trace-svg]");
  check("따라 그리기(휴대폰) 가로 스크롤 없음", await noOverflow(m));

  // ── 13. 지우기(요청 전)
  section = "지우기";
  await c.goto(`${B}/projects/${P2}/house`);
  await c.click("[data-testid=house-del]");
  await c.click("[data-testid=house-del-confirm]");
  await c.waitForSelector("[data-testid=house-empty]");
  check("평면 지우기 → 빈 상태, 새 버전에 평면 없음", houseOf(P2) === null && Number(sql(`select count(*) from versions where project_id=${P2} and house is not null`)) >= 2);
  await c.click("[data-testid=house-new-dims]");
  await c.fill("[data-testid=house-w]", "8000"); await c.fill("[data-testid=house-d]", "6000");
  await c.click("[data-testid=house-submit]");
  await c.waitForURL(/house\/edit$/);
  check("다시 만들면 평면 번호는 이어서(겹치지 않음)", houseOf(P2).rev === 3 && houseOf(P2).source === "dims");

  section = "공통";
  check("페이지 오류 없음", errors.length === 0, errors.join(" | "));
  const logFile = path.join(path.dirname(DB), "server.log");
  if (fs.existsSync(logFile)) {
    const logErr = execSync(`grep -c "⨯\\|Error:" "${logFile}" || true`).toString().trim();
    check("서버 로그 오류 없음", logErr === "0", logErr);
  }
  console.log(results.join("\n"));
  const pass = results.filter((x) => x.startsWith("PASS")).length, fail = results.filter((x) => x.startsWith("FAIL")).length;
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log(results.join("\n")); console.error(e); process.exit(1); });
