// 쇼핑 역할별 E2E: 판매자 입점(신청·승인) → 상품 등록(옵션·재고·규격·사진) → 고객 탐색·장바구니·주문·테스트 결제
// → 판매자 발주 확인·발송·배송 완료 → 고객 반품(단순 변심, 배송비 차감)·취소(즉시·요청) → 구매 확정 → 운영자 정산·지급 기록
// → 운영자 상품 숨김·신고 → 같은 파트너의 시공·판매 겸업 → 휴대폰 화면. 실행: npm run test:e2e -- shop
const { chromium } = require("playwright-core");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const B = process.env.B;
const DB = process.env.DB;
const OUT = process.env.OUT || path.join(process.env.P || process.cwd(), ".e2e-data/shots/shop");
const SHOTS = !!process.env.SHOTS;
if (!B || !DB) throw new Error("B와 DB를 주세요");
if (SHOTS) fs.mkdirSync(OUT, { recursive: true });
const sql = (q) => execSync(`sqlite3 "${DB}" "${q.replace(/"/g, '\\"')}"`, { maxBuffer: 64 << 20 }).toString().trim();
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
  const shot = async (p, name, full = true) => { if (!SHOTS) return; await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); };
  const noOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const main = (p) => p.textContent("main");
  const submitIn = async (p, scope, label) => { await p.locator(scope).locator(`button:has-text("${label}")`).first().click(); };
  const waitText = (p, text) => p.waitForFunction((t) => document.querySelector("main")?.textContent.includes(t), text, { timeout: 15000 }).then(() => true, () => false);
  const T = Date.now();
  // 처리 결과는 화면 메시지(곧 새로 고침되어 사라질 수 있음) 대신 저장된 상태로 기다린다.
  const until = async (q, want, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (sql(q) === want) return true; await new Promise((r) => setTimeout(r, 150)); } return false; };

  // ── 1. 둘러보기(로그인 전)
  section = "둘러보기";
  const g = await ctx();
  await g.goto(B + "/shop");
  const onSale = Number(sql(`select count(*) from products p join sellers s on s.id=p.seller_id where p.status='on_sale' and s.status='approved'`));
  check("쇼핑 홈: 테스트 결제 안내(실제 결제 아님)", (await g.textContent("[data-testid=test-pay-notice]")).includes("테스트 결제"));
  check("쇼핑 홈: 인기 상품 카드", (await g.locator("[data-testid=shop-popular] [data-product]").count()) === Math.min(8, onSale), onSale);
  check("예시 상품 표시(실제 판매 아님)", (await g.locator(".product-flag").count()) > 0);
  await g.goto(B + "/shop/search");
  check("전체 상품 수 = DB 판매 중 상품 수", (await g.locator("[data-testid=product-list] [data-product]").count()) === onSale);
  await g.goto(B + "/shop/search?three=1");
  const placeable = Number(sql(`select count(*) from products p join sellers s on s.id=p.seller_id where p.status='on_sale' and s.status='approved' and p.width_mm>0`));
  check("‘내 공간에 놓기 가능’ 필터 = 규격 있는 상품", (await g.locator("[data-testid=product-list] [data-product]").count()) === placeable, placeable);
  await g.goto(B + "/shop/search?q=" + encodeURIComponent("책상"));
  check("검색: ‘책상’", (await g.locator("[data-testid=product-list] [data-product]").count()) >= 1 && (await main(g)).includes("원목 상판 책상"));
  await g.goto(B + "/shop/search?cat=lighting");
  check("카테고리: 조명", (await main(g)).includes("플로어 스탠드"));
  const sofa = sql(`select id from products where title like '%3인 패브릭 소파%'`);
  await g.goto(`${B}/shop/products/${sofa}`);
  let t = await main(g);
  check("상세: 규격·3D 안내", t.includes("가로 2,100 × 깊이 900 × 높이 820mm") && t.includes("3D 모델로 실제 크기"));
  check("상세: 판매자 정보와 통신판매중개 고지", (await g.textContent("[data-testid=seller-info]")).includes("통신판매중개자"));
  check("상세: 예시 상품 표시", t.includes("예시 상품 · 실제 판매 아님"));
  const plant = sql(`select id from products where title like '%화분%'`);
  await g.goto(`${B}/shop/products/${plant}`);
  check("규격 없는 상품: 사진으로 판매, 내 공간 놓기 버튼 없음", (await g.locator("[data-testid=place-product]").count()) === 0 && (await main(g)).includes("규격이 없어 내 공간에 놓을 수 없어요"));
  await g.goto(`${B}/shop/products/${sofa}`);
  await g.selectOption("[data-testid=opt1]", "베이지");
  await g.click("[data-testid=add-cart]");
  await g.waitForURL(/\/login/);
  check("로그인 전 담기 → 로그인으로", g.url().includes("next=%2Fshop%2Fproducts"));
  await shot(g, "01-shop-home");

  // ── 2. 판매자 입점: 판매만 하는 파트너 → 정보 입력 → 운영자 승인
  section = "판매자 입점";
  const s = await ctx();
  const SEMAIL = `seller${T}@test.kr`;
  await s.goto(B + "/partners");
  await s.fill("input[name=company]", "테스트 리빙");
  await s.uncheck("input[name=roles][value=build]");
  await s.check("input[name=roles][value=sell]");
  await s.fill("input[name=name]", "판매담당");
  await s.fill("input[name=email]", SEMAIL);
  await s.fill("input[name=password]", "testpass1");
  await s.check("input[name=consent]");
  await s.click('button:has-text("파트너 입점 신청")');
  await s.waitForURL(/\/partner$/);
  const sid = sql(`select s.id from sellers s join users u on u.id=s.user_id where u.email='${SEMAIL}'`);
  check("판매만 신청: 판매자 행만 생김(시공 없음)", !!sid && sql(`select count(*) from vendors v join users u on u.id=v.user_id where u.email='${SEMAIL}'`) === "0");
  check("파트너 센터: 판매 승인 대기, 시공 신청 전", (await s.textContent("[data-testid=role-sell]")).includes("승인 대기") && (await s.textContent("[data-testid=role-build]")).includes("신청 전"));
  await s.goto(B + "/seller/products/new");
  await s.fill("input[name=title]", `테스트 원목 스툴 ${T}`);
  await s.selectOption("select[name=category]", "furniture");
  await s.fill("input[name=price]", "45000");
  check("승인 전: 판매 시작 버튼 비활성", await s.locator("[data-testid=product-publish]").isDisabled());
  await s.click("[data-testid=product-save]");
  await s.waitForURL(/\/seller\/products\/\d+/);
  const stoolId = s.url().match(/products\/(\d+)/)[1];
  check("승인 전: 임시 저장 가능", sql(`select status from products where id=${stoolId}`) === "draft");
  // 판매자 정보
  await s.goto(B + "/seller/settings");
  await s.fill("input[name=ceo]", "홍판매");
  await s.fill("input[name=biz_no]", "123-45-6789");
  await submitIn(s, "main", "판매자 정보 저장");
  check("사업자번호 형식 틀리면 거절", await waitText(s, "사업자등록번호가 올바르지 않습니다"));
  await s.fill("input[name=biz_no]", "123-45-67891");
  await s.fill("input[name=biz_address]", "서울 성동구 예시로 1");
  await s.fill("input[name=cs_phone]", "02-111-2222");
  await s.fill("input[name=bank_name]", "예시은행");
  await s.fill("input[name=bank_account]", "123-456-7890");
  await s.fill("input[name=bank_holder]", "테스트 리빙");
  await s.fill("input[name=ship_fee]", "3000");
  await s.fill("input[name=free_ship_over]", "100000");
  await s.fill("input[name=return_fee]", "4000");
  await s.setInputFiles("input[name=doc]", __dirname + "/fixtures/photo1.jpg");
  await submitIn(s, "main", "판매자 정보 저장");
  check("판매자 정보 저장", await waitText(s, "저장했습니다"));
  check("사업자등록증은 비공개 파일(kind photo)", sql(`select f.kind from sellers s join files f on f.id=s.doc_file_id where s.id=${sid}`) === "photo");
  const docId = sql(`select doc_file_id from sellers where id=${sid}`);
  const anon = await g.request.get(`${B}/files/${docId}`);
  check("사업자등록증: 로그인 안 한 사람은 못 봄", anon.status() === 404, anon.status());
  // 운영자 승인
  const a = await ctx();
  await login(a, "admin@demo.kr");
  await a.goto(`${B}/admin/sellers/${sid}`);
  check("운영자: 필수 정보 모두 있음", (await main(a)).includes("필수 정보가 모두 있어요"));
  check("운영자: 국세청 조회 ‘실제 연동 전’ 표시", (await main(a)).includes("실제 연동 전"));
  await a.selectOption("select[name=status]", "approved");
  await a.fill("input[name=rate]", "12");
  await submitIn(a, "aside", "저장");
  await waitText(a, "저장했습니다");
  check("운영자 승인 + 수수료 12%", sql(`select status||'|'||commission_rate from sellers where id=${sid}`) === "approved|0.12");
  check("판매자에게 승인 알림", sql(`select count(*) from notifications n join sellers s on s.user_id=n.user_id where s.id=${sid} and n.title like '%승인되었습니다%'`) === "1");

  // ── 3. 상품 등록: 옵션·재고·규격·사진
  section = "상품 등록";
  await s.goto(`${B}/seller/products/${stoolId}`);
  await s.fill("[data-testid=opt1-name]", "색상");
  await s.fill("[data-testid=opt1-values]", "내추럴, 월넛");
  await s.locator("[data-testid=sku-stock]").nth(0).fill("3");
  await s.locator("[data-testid=sku-stock]").nth(1).fill("1");
  await s.fill("[data-testid=dim-w]", "400");
  await s.fill("[data-testid=dim-d]", "400");
  await s.fill("[data-testid=dim-h]", "450");
  await s.click("[data-testid=product-publish]");
  check("사진 없이 판매 시작 → 거절", await waitText(s, "사진을 한 장 이상"));
  await s.setInputFiles("[data-testid=product-images]", [__dirname + "/fixtures/photo1.jpg", __dirname + "/fixtures/plan1.jpg"]);
  await s.click("[data-testid=product-publish]");
  check("판매 시작", await waitText(s, "판매 중으로 보여요"));
  check("옵션 2개·재고·규격 저장", sql(`select group_concat(opt1||':'||stock, ',') from product_skus where product_id=${stoolId} and active=1`) === "내추럴:3,월넛:1" && sql(`select width_mm||'x'||depth_mm||'x'||height_mm from products where id=${stoolId}`) === "400x400x450");
  check("상품 사진 2장(공개 파일)", sql(`select count(*) from product_images i join files f on f.id=i.file_id where i.product_id=${stoolId} and f.kind='case'`) === "2");
  await g.goto(`${B}/shop/search?q=${encodeURIComponent("테스트 원목 스툴")}`);
  check("쇼핑에 보임", (await g.locator("[data-testid=product-list] [data-product]").count()) === 1);

  // ── 4. 고객 주문·테스트 결제
  section = "주문·결제";
  const c = await ctx();
  const CEMAIL = `buyer${T}@test.kr`;
  await c.goto(B + "/signup"); await c.fill("input[name=email]", CEMAIL); await c.fill("input[name=password]", "testpass1"); await c.fill("input[name=name]", "구매고객"); await c.fill("input[name=phone]", "010-1234-5678"); await c.check("input[name=consent]"); await c.click('button:has-text("가입하기")'); await c.waitForURL(/\/projects/);
  await c.goto(`${B}/shop/products/${stoolId}`);
  await c.click("[data-testid=add-cart]");
  check("옵션 안 고르면 담기 거절", await waitText(c, "옵션을 골라 주세요"));
  await c.selectOption("[data-testid=opt1]", "월넛");
  check("재고 1개 옵션은 수량을 늘릴 수 없음", (await c.locator("button[aria-label='수량 더하기']").isDisabled()) && (await c.textContent("[data-testid=qty]")) === "1");
  await c.click("[data-testid=add-cart]");
  await c.waitForSelector("[data-testid=cart-ok]");
  await c.selectOption("[data-testid=opt1]", "내추럴");
  await c.click("button[aria-label='수량 더하기']");
  await c.click("[data-testid=add-cart]");
  await c.waitForFunction(() => document.querySelector("[data-testid=cart-ok]"));
  await c.goto(`${B}/shop/products/${sofa}`);
  await c.selectOption("[data-testid=opt1]", "그레이");
  await c.click("[data-testid=add-cart]");
  await c.waitForSelector("[data-testid=cart-ok]");
  await c.goto(B + "/cart");
  check("장바구니: 판매자 2곳으로 묶임", (await c.locator("[data-testid=cart-group]").count()) === 2);
  check("머리 장바구니 개수 3", (await c.getAttribute("[data-testid=header-cart]", "aria-label")).includes("3개"));
  // 스툴 45000×3 = 135000 (10만 원 이상 무료) / 소파 690000 (5만 원 이상 무료) → 825000
  check("장바구니 합계 825,000원(두 판매자 모두 무료 배송)", (await c.textContent("[data-testid=cart-total]")) === "825,000원", await c.textContent("[data-testid=cart-total]"));
  await shot(c, "02-cart");
  await c.click("[data-testid=cart-order]");
  await c.waitForURL(/\/checkout/);
  await c.fill("input[name=address1]", "서울 성동구 예시로 99");
  await c.check("input[name=agree]");
  await c.click("[data-testid=place-order]");
  await c.waitForURL(/\/pay\//);
  const no1 = c.url().split("/pay/")[1];
  check("주문 만들기 → 결제 대기", sql(`select status||'|'||total_amount||'|'||pg from orders where no='${no1}'`) === "pending|825000|test");
  check("결제 화면: 테스트 결제 표시", (await c.textContent("[data-testid=pay-box]")).includes("실제 돈이 오가지 않아요"));
  await shot(c, "03-pay-test");
  await c.click("[data-testid=test-pay-ok]");
  await c.waitForURL(/\/orders\/.+\?paid=1/);
  check("결제 완료", sql(`select status from orders where no='${no1}'`) === "paid");
  check("재고 차감(내추럴 3→1, 월넛 1→0)", sql(`select group_concat(opt1||':'||stock, ',') from product_skus where product_id=${stoolId} and active=1`) === "내추럴:1,월넛:0");
  check("장바구니 비움", sql(`select count(*) from cart_items c join users u on u.id=c.user_id where u.email='${CEMAIL}'`) === "0");
  check("판매자에게 새 주문 알림·메일", sql(`select count(*) from notifications n join sellers s on s.user_id=n.user_id where s.id=${sid} and n.title like '새 주문%'`) === "1" && sql(`select count(*) from email_outbox where to_email='${SEMAIL}' and subject like '새 주문%'`) === "1");
  await c.goto(`${B}/shop/products/${stoolId}`);
  check("품절 옵션은 고를 수 없음(월넛)", await c.evaluate(() => [...document.querySelectorAll("[data-testid=opt1] option")].find((o) => o.textContent.includes("월넛"))?.disabled === true));
  await c.selectOption("[data-testid=opt1]", "내추럴");
  await c.click("[data-testid=add-cart]");
  await c.waitForSelector("[data-testid=cart-ok]");
  await c.click("[data-testid=add-cart]");
  check("재고(1)보다 많이 담으면 거절", await waitText(c, "더 담을 수 없어요"));

  // ── 5. 판매자: 발주 확인 → 발송 → 배송 완료
  section = "판매자 배송";
  await s.goto(`${B}/seller/orders?status=paid`);
  check("새 주문 목록에 보임(배송지 포함)", (await main(s)).includes(no1) && (await main(s)).includes("서울 성동구 예시로 99"));
  check("다른 판매자 상품은 안 보임(소파)", !(await s.textContent("[data-testid=seller-orders]")).includes("3인 패브릭 소파"));
  await submitIn(s, `[data-order="${no1}"]`, "발주 확인");
  const gid = sql(`select g.id from order_groups g join orders o on o.id=g.order_id where o.no='${no1}' and g.seller_id=${sid}`);
  check("배송 준비 중", await until(`select status from order_groups where id=${gid}`, "preparing"));
  await s.goto(`${B}/seller/orders?status=preparing`);
  await s.fill(`[data-order="${no1}"] input[name=courier]`, "CJ대한통운");
  await s.fill(`[data-order="${no1}"] [data-testid=tracking-no]`, "123456789012");
  await submitIn(s, `[data-order="${no1}"]`, "발송 처리");
  check("발송: 송장 저장", await until(`select status||'|'||tracking_no from order_groups where id=${gid}`, "shipped|123456789012"));
  await c.goto(`${B}/orders/${no1}`);
  check("고객: 배송 중 + 배송 조회 링크(연동 전 표시)", (await main(c)).includes("배송 중") && (await main(c)).includes("택배사 조회 연동 전"));
  await s.goto(`${B}/seller/orders?status=shipped`);
  await submitIn(s, `[data-order="${no1}"]`, "배송 완료 처리");
  check("배송 완료", await until(`select status from order_groups where id=${gid}`, "delivered"));

  // ── 6. 반품(단순 변심): 무료 배송이었으므로 반품비 왕복(4,000×2) 차감
  section = "반품";
  await c.goto(`${B}/orders/${no1}`);
  const stoolItem = c.locator("[data-testid=order-item]", { hasText: "월넛" });
  await stoolItem.locator("[data-testid=return-open]").click();
  await stoolItem.locator("[data-testid=return-reason]").selectOption("change_mind");
  await stoolItem.locator('button:has-text("반품 신청")').last().click();
  check("반품 신청", await waitText(c, "반품을 신청했어요") && c.url().includes("done=return-requested"));
  const claimId = sql(`select id from claims where type='return' and order_id=(select id from orders where no='${no1}')`);
  await s.goto(B + "/seller/claims");
  check("판매자: 예상 환불 37,000원(45,000 − 왕복 8,000)", (await s.textContent(`[data-claim="${claimId}"]`)).includes("예상 환불 37,000원"));
  await submitIn(s, `[data-claim="${claimId}"]`, "반품 승인");
  check("반품 승인(회수 중)", await until(`select status from claims where id=${claimId}`, "approved"));
  await s.goto(B + "/seller/claims");
  await submitIn(s, `[data-claim="${claimId}"]`, "회수 확인·환불");
  check("반품 환불 완료 37,000원·재고 복구(월넛 0→1)", (await until(`select status||'|'||refund_amount||'|'||deduction from claims where id=${claimId}`, "completed|37000|8000")) && sql(`select stock from product_skus where product_id=${stoolId} and opt1='월넛'`) === "1");
  check("고객에게 환불 알림(테스트 결제 표시)", sql(`select count(*) from notifications n join users u on u.id=n.user_id where u.email='${CEMAIL}' and n.title like '반품 환불이 완료%' and n.body like '%테스트 결제%'`) === "1");
  await c.goto(`${B}/orders/${no1}`);
  await c.locator(`[data-testid=order-group]`, { hasText: "테스트 리빙" }).locator("[data-testid=confirm-purchase]").click();
  await c.waitForTimeout(500);
  check("구매 확정", sql(`select status from order_groups where id=${gid}`) === "confirmed");

  // ── 7. 취소: 결제 완료 상태 즉시 취소(전액+배송비) / 배송 준비 중 취소 요청 → 판매자 승인
  section = "취소";
  await c.goto(B + "/cart"); // 내추럴 1개 담겨 있음
  await c.click("[data-testid=cart-order]");
  await c.waitForURL(/\/checkout/);
  check("주문서: 10만 원 미만이라 배송비 3,000원", (await c.textContent("[data-testid=checkout-total]")) === "48,000원", await c.textContent("[data-testid=checkout-total]"));
  await c.fill("input[name=address1]", "서울 성동구 예시로 99"); await c.check("input[name=agree]"); await c.click("[data-testid=place-order]"); await c.waitForURL(/\/pay\//);
  const no2 = c.url().split("/pay/")[1];
  await c.click("[data-testid=test-pay-ok]"); await c.waitForURL(/\/orders\//);
  const stockBefore = sql(`select stock from product_skus where product_id=${stoolId} and opt1='내추럴'`);
  await c.locator("[data-testid=cancel-open]").first().click();
  await c.locator("[data-testid=cancel-reason]").selectOption("change_mind");
  await c.locator('button:has-text("주문 취소")').last().click();
  check("결제 완료 상태 취소 → 즉시 환불 48,000원(배송비 포함)", await waitText(c, "48,000원을 환불했어요"));
  check("묶음 취소·재고 복구", sql(`select g.status||'|'||g.ship_refunded from order_groups g join orders o on o.id=g.order_id where o.no='${no2}'`) === "canceled|1" && Number(sql(`select stock from product_skus where product_id=${stoolId} and opt1='내추럴'`)) === Number(stockBefore) + 1);
  // 배송 준비 중 취소 요청
  await c.goto(`${B}/shop/products/${stoolId}`);
  await c.selectOption("[data-testid=opt1]", "내추럴");
  await c.click("[data-testid=buy-now]");
  await c.waitForURL(/\/checkout/);
  await c.fill("input[name=address1]", "서울 성동구 예시로 99"); await c.check("input[name=agree]"); await c.click("[data-testid=place-order]"); await c.waitForURL(/\/pay\//);
  const no3 = c.url().split("/pay/")[1];
  await c.click("[data-testid=test-pay-ok]"); await c.waitForURL(/\/orders\//);
  await s.goto(`${B}/seller/orders?status=paid`);
  await submitIn(s, `[data-order="${no3}"]`, "발주 확인");
  await until(`select g.status from order_groups g join orders o on o.id=g.order_id where o.no='${no3}'`, "preparing");
  await c.goto(`${B}/orders/${no3}`);
  await c.locator("[data-testid=cancel-open]").first().click();
  await c.locator("[data-testid=cancel-reason]").selectOption("change_mind");
  await c.locator('button:has-text("주문 취소")').last().click();
  check("배송 준비 중 → 판매자에게 취소 요청", await waitText(c, "판매자에게 취소를 요청했어요"));
  await s.goto(`${B}/seller/orders?status=preparing`);
  await s.fill(`[data-order="${no3}"] [data-testid=tracking-no]`, "999");
  await s.fill(`[data-order="${no3}"] input[name=courier]`, "CJ대한통운");
  await submitIn(s, `[data-order="${no3}"]`, "발송 처리");
  check("처리 안 한 취소 요청이 있으면 발송 막음", await waitText(s, "처리하지 않은 취소 요청"));
  const cancelClaim = sql(`select id from claims where order_id=(select id from orders where no='${no3}')`);
  await s.goto(B + "/seller/claims");
  await submitIn(s, `[data-claim="${cancelClaim}"]`, "취소 승인·환불");
  check("판매자 취소 승인 → 환불(45,000원 + 배송비 3,000원)", await until(`select status||'|'||refund_amount from claims where id=${cancelClaim}`, "completed|48000"));

  // ── 8. 정산
  section = "정산";
  await a.goto(B + "/admin/settlements");
  await submitIn(a, "main", "정산서 만들기");
  await waitText(a, "정산서를 만들었습니다");
  // 스툴 묶음: 결제 135,000(배송 0) − 환불 37,000, 수수료 = 남은 상품 90,000 × 12% = 10,800 → 87,200
  check("정산서: 결제 135,000 − 환불 37,000 − 수수료 10,800 = 87,200", sql(`select sales||'|'||refunds||'|'||commission||'|'||payout from settlements where seller_id=${sid}`) === "135000|37000|10800|87200", sql(`select sales||'|'||refunds||'|'||commission||'|'||payout from settlements where seller_id=${sid}`));
  await s.goto(B + "/seller/settlements");
  check("판매자: 정산 예정 보임", (await s.textContent("[data-testid=seller-settlements]")).includes("87,200원"));
  await a.goto(B + "/admin/settlements");
  await a.locator("[data-testid=admin-settlements] li", { hasText: "테스트 리빙" }).locator('button:has-text("지급 완료로 기록")').click();
  await a.waitForTimeout(500);
  check("지급 완료 기록", sql(`select status from settlements where seller_id=${sid}`) === "paid");

  // ── 9. 운영자: 상품 신고·숨김
  section = "운영자 관리";
  await c.goto(`${B}/shop/products/${stoolId}`);
  await c.click("[data-testid=report-product]");
  await c.check("input[name=reason][value=fake]");
  await c.click('button:has-text("신고하기")');
  check("고객 상품 신고", await waitText(c, "신고했어요"));
  await a.goto(B + "/admin/products?reported=1");
  check("운영자: 신고된 상품 보임", (await main(a)).includes("테스트 원목 스툴"));
  const row = a.locator("[data-testid=admin-products] li", { hasText: "테스트 원목 스툴" });
  await row.locator("input[name=reason]").fill("허위 규격 확인 필요");
  await row.locator('button:has-text("숨기기")').click();
  await a.waitForTimeout(500);
  check("숨김 → 쇼핑에서 사라짐", sql(`select status from products where id=${stoolId}`) === "blocked" && (await g.request.get(`${B}/shop/products/${stoolId}`)).status() === 404);
  check("판매자에게 숨김 사유 알림", sql(`select count(*) from notifications n join sellers s on s.user_id=n.user_id where s.id=${sid} and n.body='허위 규격 확인 필요'`) === "1");
  await a.goto(B + "/admin/integrations");
  check("연동 상태: 결제·메일·주소·건축물대장 ‘실제 연동 전’", (await a.locator("[data-testid=integrations] li", { hasText: "실제 연동 전" }).count()) >= 5);

  // ── 10. 겸업 파트너: 시공 + 판매
  section = "겸업";
  const v = await ctx();
  await login(v, "vendor1@demo.kr");
  const nav = await v.textContent("header");
  check("시공 메뉴와 판매자 센터가 함께 보임", nav.includes("요청·제안") && nav.includes("판매자 센터") && nav.includes("파트너 센터"));
  await v.goto(B + "/seller");
  check("판매자 센터 열림(예시 업체 상품 판매 중)", (await main(v)).includes("판매 중인 상품"));
  await v.goto(B + "/partner");
  check("파트너 센터: 시공·판매 모두 승인", (await v.textContent("[data-testid=role-build]")).includes("승인") && (await v.textContent("[data-testid=role-sell]")).includes("승인"));
  await s.goto(B + "/partner");
  await s.fill("[data-testid=role-build] input[name=company]", "테스트 리빙 시공");
  await submitIn(s, "[data-testid=role-build]", "시공 파트너 신청");
  await s.waitForURL(/\/vendor\/profile/);
  check("판매자가 시공 역할 추가 신청 → 승인 대기", sql(`select v.status from vendors v join sellers s on s.user_id=v.user_id where s.id=${sid}`) === "pending");

  // ── 11. 휴대폰
  section = "휴대폰";
  const m = await mobile();
  await login(m, CEMAIL, "testpass1");
  for (const pth of ["/shop", "/shop/search?three=1", `/shop/products/${sofa}`, "/cart", "/orders", `/orders/${no1}`, "/me"]) {
    await m.goto(B + pth);
    check(`가로 넘침 없음 ${pth}`, await noOverflow(m));
  }
  await m.goto(`${B}/shop/products/${sofa}`);
  check("상품 상세: 아래 구매 막대(장바구니·바로 구매)", await m.locator("[data-testid=buy-now-m]").isVisible());
  check("상품 상세: 하단 탐색 숨김(구매 막대와 겹치지 않음)", (await m.locator("nav.mobile-navigation").count()) === 0);
  await m.selectOption("[data-testid=opt1]", "베이지");
  await m.click("[data-testid=add-cart-m]");
  await m.waitForSelector("[data-testid=cart-ok]");
  check("휴대폰에서 담기", sql(`select count(*) from cart_items c join users u on u.id=c.user_id where u.email='${CEMAIL}'`) === "1");
  await m.goto(B + "/shop");
  const tabs = await m.locator("nav.mobile-navigation a").allTextContents();
  check("하단 탭: 홈·커뮤니티·쇼핑·내 공간·마이", tabs.join("|") === "홈|커뮤니티|쇼핑|내 공간|마이", tabs.join("|"));
  await shot(m, "04-mobile-shop");
  const ms = await mobile();
  await login(ms, SEMAIL, "testpass1");
  for (const pth of ["/seller", "/seller/products", `/seller/products/${stoolId}`, "/seller/orders", "/seller/claims", "/seller/settlements", "/seller/settings", "/partner"]) {
    await ms.goto(B + pth);
    check(`판매자 화면 넘침 없음 ${pth}`, await noOverflow(ms));
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
