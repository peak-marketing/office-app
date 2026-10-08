// 실제 상품 3D 배치 E2E: 상품 → ‘내 공간에 놓아 보기’ → 놓을 공간 고르기 → 편집 화면에 실제 규격으로 놓임
// → 저장·다시 열기 → 3D(GLB 모델 / 모델 없으면 상자) → 놓은 상품 장바구니 담기(내 공간 연결) — 방 한 칸·집 전체·사무실, PC·휴대폰
// 실행: npm run test:e2e -- place
const { chromium } = require("playwright-core");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const B = process.env.B;
const DB = process.env.DB;
const OUT = process.env.OUT || path.join(process.env.P || process.cwd(), ".e2e-data/shots/place");
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
  const shot = async (p, name, full = false) => { if (!SHOTS) return; await p.waitForTimeout(600); await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); };
  const noOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const T = Date.now();
  const pid = (t) => sql(`select id from products where title like '%${t}%'`);
  const SOFA = pid("3인 패브릭 소파"), DESK = pid("원목 상판 책상"), CAB = pid("거실 수납장"), PLANT = pid("대형 화분");
  const modelCount = (p) => p.evaluate(() => document.querySelector("canvas[data-viewer='3d']")?.__viewer?.models?.children.length ?? -1);
  const waitModels = async (p, n) => { const end = Date.now() + 20000; while (Date.now() < end) { if ((await modelCount(p)) === n) return true; await p.waitForTimeout(250); } return false; };

  // ── 1. 준비: 고객, 집 요청(저장만), 방 한 칸과 집 전체 평면
  section = "준비";
  const c = await ctx();
  const EMAIL = `place${T}@test.kr`;
  await c.goto(B + "/signup"); await c.fill("input[name=email]", EMAIL); await c.fill("input[name=password]", "testpass1"); await c.fill("input[name=name]", "배치고객"); await c.check("input[name=consent]"); await c.click('button:has-text("가입하기")'); await c.waitForURL(/\/projects/);
  await c.goto(`${B}/place/${SOFA}`);
  check("놓을 공간이 없으면 공간 만들기 안내", (await c.textContent("main")).includes("가구를 놓을 수 있는 내 공간이 없어요"));
  await c.goto(B + "/homes/new");
  await c.click("[data-testid=home-type-apartment]"); await c.fill("[data-testid=home-region]", "서울 마포구"); await c.click("[data-testid=home-next]");
  await c.click("[data-testid=home-scope-undecided]"); await c.click("[data-testid=home-next]"); await c.click("[data-testid=home-next]");
  await c.click("[data-testid=home-save]");
  await c.waitForURL(/\/projects\/\d+$/);
  const P = c.url().match(/projects\/(\d+)/)[1];
  await c.goto(`${B}/projects/${P}/rooms/new`);
  await c.fill("[data-testid=room-name]", "거실");
  await c.fill("[data-testid=room-w]", "5000");
  await c.fill("[data-testid=room-d]", "4000");
  await c.click("[data-testid=room-submit]");
  await c.waitForURL(/\/rooms\/room-\d+/);
  const RID = c.url().match(/rooms\/(room-\d+)/)[1];
  await c.goto(`${B}/projects/${P}/house/new?from=dims`);
  await c.fill("[data-testid=house-w]", "9000"); await c.fill("[data-testid=house-d]", "7000");
  await c.click("[data-testid=house-submit]");
  await c.waitForURL(/house\/edit$/);
  check("방 한 칸·집 전체 평면 준비", !!RID && sql(`select house is not null from versions where id=(select current_version_id from projects where id=${P})`) === "1");

  // ── 2. 방 한 칸: 상품 → 놓을 공간 → 편집 화면에 놓임
  section = "방 한 칸";
  await c.goto(`${B}/shop/products/${SOFA}`);
  await c.click("[data-testid=place-product]");
  await c.waitForURL(/\/place\//);
  const targets = await c.locator("[data-testid=place-targets] a").allTextContents();
  check("놓을 공간: 집 전체 평면·방 한 칸", targets.some((t) => t.includes("집 전체 평면")) && targets.some((t) => t.includes("거실") && t.includes("방 한 칸")), targets.join(" / "));
  await c.locator("[data-testid=place-targets] a", { hasText: "방 한 칸" }).click();
  await c.waitForURL(/rooms\/room-\d+\?add=/);
  await c.waitForSelector("[data-testid=placed-product]");
  let items = JSON.parse(await c.getAttribute("main.editor", "data-room-items"));
  const sofaItem = items.find((it) => String(it[1]).startsWith(`product:${SOFA}:`));
  check("편집 화면에 소파가 실제 규격(2,100×900)으로 놓임", !!sofaItem && Math.abs(sofaItem[5] - 2.1) < 1e-6 && Math.abs(sofaItem[6] - 0.9) < 1e-6, JSON.stringify(items));
  check("상품은 크기 조절 칸 없음·저장한 규격 안내", (await c.locator("[data-testid=size-box]").count()) === 0 && (await c.textContent("[data-testid=placed-product]")).includes("배치에 저장한 상품 규격"));
  // 모델 없는 상품(수납장)도 목록에서 놓기
  const cabType = sql(`select 'product:'||p.id||':'||k.id from products p join product_skus k on k.product_id=p.id where p.id=${CAB} limit 1`);
  await c.click(`[data-testid="add-product-${cabType}"]`);
  check("모델 없는 상품도 놓기(상자)", JSON.parse(await c.getAttribute("main.editor", "data-room-items")).some((it) => it[1] === cabType));
  check("규격 없는 상품은 목록에 없음(화분)", (await c.locator(`[data-testid^="add-product-product:${PLANT}:"]`).count()) === 0);
  await c.click("[data-testid=editor-save]");
  await c.waitForURL(/\?saved=/);
  const roomJson = JSON.parse(sql(`select rooms from versions where id=(select current_version_id from projects where id=${P})`));
  const saved = roomJson.find((r) => r.id === RID).items;
  const sp = saved.find((it) => it.product && it.product.id === Number(SOFA));
  check("저장: 상품 정보·모델 주소·규격 그대로", !!sp && sp.w === 2.1 && sp.d === 0.9 && sp.product.h === 0.82 && /^\/files\/\d+$/.test(sp.parts[0].m || "") && sp.product.model === sp.parts[0].m, JSON.stringify(sp));
  check("저장: 모델 없는 상품은 상자(모델 주소 없음)", saved.some((it) => it.product && it.product.id === Number(CAB) && !it.parts[0].m && it.product.model === null));
  await c.click("[data-testid=view-3d]");
  check("3D: 소파 GLB 모델 1개 불러옴(수납장은 상자)", await waitModels(c, 1), await modelCount(c));
  await shot(c, "01-room-3d");
  await c.click("[data-testid=view-plan]");
  await c.locator(`[data-item="${sp.id}"], [data-id="${sp.id}"]`).first().click({ timeout: 3000 }).catch(() => {});
  if ((await c.locator("[data-testid=placed-product]").count()) === 0) {
    // 평면에서 고르기 대신 검사 목록 등으로 선택이 어려우면 다시 열어 자동 선택 대신 데이터로 확인
    await c.goto(`${B}/projects/${P}/rooms/${RID}`);
  }
  // 다시 열어도 같은 위치·상품
  await c.goto(`${B}/projects/${P}/rooms/${RID}`);
  items = JSON.parse(await c.getAttribute("main.editor", "data-room-items"));
  check("다시 열어도 상품 그대로", items.some((it) => String(it[1]).startsWith(`product:${SOFA}:`)) && items.some((it) => it[1] === cabType));

  // ── 3. 놓은 상품 → 장바구니(내 공간 연결)
  section = "장바구니";
  await c.goto(`${B}/projects/${P}/rooms/${RID}?add=${encodeURIComponent(`product:${SOFA}:${sp.product.skuId}`)}`);
  await c.waitForSelector("[data-testid=placed-product]");
  await c.click("[data-testid=placed-product-cart]");
  await c.waitForSelector("[data-testid=placed-cart-ok]");
  check("장바구니에 담김(내 공간 연결)", sql(`select c.project_id||'|'||c.sku_id from cart_items c join users u on u.id=c.user_id where u.email='${EMAIL}'`) === `${P}|${sp.product.skuId}`);
  const href = await c.getAttribute("[data-testid=placed-product-link]", "href");
  check("상품 보기 → 상품 상세(내 공간 연결)", href === `/shop/products/${SOFA}?project=${P}`, href);

  // ── 4. 집 전체 평면에 놓기
  section = "집 전체";
  await c.goto(`${B}/place/${DESK}`);
  check("옵션별 규격이 다르면 옵션 고르기", (await c.locator("a.filter-chip", { hasText: "1400" }).count()) === 1);
  await c.locator("a.filter-chip", { hasText: "1400" }).click();
  await c.waitForURL(/sku=/);
  await c.locator("[data-testid=place-targets] a", { hasText: "집 전체 평면" }).click();
  await c.waitForURL(/house\/edit\?add=/);
  await c.waitForSelector("[data-testid=placed-product]");
  let hs = JSON.parse(await c.getAttribute("[data-testid=house-editor]", "data-house"));
  const desk = hs.items.find((it) => String(it[1]).startsWith(`product:${DESK}:`));
  check("1400 옵션 규격(1,400×700)으로 놓임", !!desk && Math.abs(desk[5] - 1.4) < 1e-6 && Math.abs(desk[6] - 0.7) < 1e-6, JSON.stringify(hs.items));
  await c.click("[data-testid=editor-save]");
  check("집 전체 평면 저장에 상품 포함", await until(`select json_extract(house, '$.items[0].product.id') from versions where id=(select current_version_id from projects where id=${P})`, DESK));
  await c.waitForTimeout(500);
  await c.goto(`${B}/projects/${P}/house/edit`);
  await c.click("[data-testid=view-3d]");
  check("집 3D: 책상 GLB 모델 불러옴", await waitModels(c, 1), await modelCount(c));
  await shot(c, "02-house-3d");

  // ── 5. 사무실 배치에 놓기(예시 고객의 성수동 사무실)
  section = "사무실";
  const o = await ctx();
  await o.goto(B + "/login"); await o.fill("input[name=email]", "customer@demo.kr"); await o.fill("input[name=password]", "demo1234"); await o.click('main button:has-text("로그인")'); await o.waitForURL((u) => !u.pathname.startsWith("/login"));
  const OP = sql(`select id from projects where title='[예시] 성수동 30평 사무실'`);
  const verBefore = sql(`select count(*) from versions where project_id=${OP}`);
  await o.goto(`${B}/place/${DESK}?project=${OP}`);
  await o.locator("[data-testid=place-targets] a", { hasText: "사무실 공간 배치" }).first().click();
  await o.waitForURL(/editor\?add=/);
  await o.waitForSelector("[data-testid=placed-product]");
  await o.click("[data-testid=editor-save]");
  check("사무실 배치 저장(새 버전)에 상품", await until(`select count(*) from versions where project_id=${OP}`, String(Number(verBefore) + 1)) && sql(`select count(*) from json_each((select placement from versions where project_id=${OP} order by id desc limit 1), '$.items') where json_extract(value, '$.product.id')=${DESK}`) === "1");
  check("업체 기준은 ‘변경 내용 보내기’ 전까지 그대로", sql(`select requested_version_id = (select id from versions where project_id=${OP} order by id desc limit 1) from projects where id=${OP}`) === "0");

  // ── 5-1. 내 공간 한눈에: 놓은 상품 목록과 한꺼번에 담기
  section = "내 공간 상품";
  await c.goto(`${B}/projects/${P}`);
  const sp2 = await c.textContent("[data-testid=space-products]");
  check("한눈에: 이 공간에 놓은 상품(방·집 전체 합쳐)", sp2.includes("3인 패브릭 소파") && sp2.includes("거실 수납장") && sp2.includes("원목 상판 책상"), sp2.slice(0, 200));
  sql(`delete from cart_items where user_id=(select id from users where email='${EMAIL}')`);
  await c.click("[data-testid=space-products-cart]");
  await c.waitForURL(/\/cart/);
  check("놓은 상품 모두 장바구니(내 공간 연결)", await until(`select count(*)||'|'||count(distinct project_id) from cart_items where user_id=(select id from users where email='${EMAIL}')`, "3|1") && sql(`select distinct project_id from cart_items where user_id=(select id from users where email='${EMAIL}')`) === P);

  // ── 6. 휴대폰
  section = "휴대폰";
  const m = await mobile();
  await m.goto(B + "/login"); await m.fill("input[name=email]", EMAIL); await m.fill("input[name=password]", "testpass1"); await m.click('main button:has-text("로그인")'); await m.waitForURL((u) => !u.pathname.startsWith("/login"));
  await m.goto(`${B}/place/${SOFA}`);
  check("놓을 공간 고르기 넘침 없음", await noOverflow(m));
  await m.goto(`${B}/projects/${P}/rooms/${RID}`);
  check("휴대폰 방 편집: 실제 상품 줄", (await m.locator("[data-testid=add-bar-m] button[data-testid^='add-m-product-']").count()) > 0 && (await noOverflow(m)));
  await m.locator("[data-testid=add-bar-m] button[data-testid^='add-m-product-']").first().click();
  check("휴대폰에서 상품 놓기 → 아래 조작판에 상품 카드", await m.locator("[data-testid=placed-product]").isVisible());
  await shot(m, "03-mobile-room");

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
