// 커뮤니티 역할별 E2E: 공간 소개(사진·상품 태그·시공사 연결) → 시공 후기(계약 결과 기록 → 계약 확인 표시)
// → 좋아요·스크랩·댓글·답글(업체 댓글 표시)·알림 → 신고·운영자 가리기/다시 보이기·자동 가림 → 고치기·지우기 → 휴대폰
// 실행: npm run test:e2e -- community
const { chromium } = require("playwright-core");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const B = process.env.B;
const DB = process.env.DB;
const OUT = process.env.OUT || path.join(process.env.P || process.cwd(), ".e2e-data/shots/community");
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
  const signup = async (p, email, name) => { await p.goto(B + "/signup"); await p.fill("input[name=email]", email); await p.fill("input[name=password]", "testpass1"); await p.fill("input[name=name]", name); await p.check("input[name=consent]"); await p.click('button:has-text("가입하기")'); await p.waitForURL(/\/projects/); };
  const shot = async (p, name, full = true) => { if (!SHOTS) return; await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); };
  const noOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const main = (p) => p.textContent("main");
  const waitText = (p, text) => p.waitForFunction((t) => document.querySelector("main")?.textContent.includes(t), text, { timeout: 15000 }).then(() => true, () => false);
  const tagPhoto = async (p, key, fx, fy, query) => {
    const el = p.locator(`[data-testid="photo-${key}"]`);
    await el.scrollIntoViewIfNeeded();
    const box = await el.boundingBox();
    await el.click({ position: { x: box.width * fx, y: box.height * fy } });
    await p.fill("[data-testid=tag-picker] input", query);
    await p.locator("[data-testid=tag-picker] li button").first().click({ timeout: 10000 });
  };
  const T = Date.now();

  // ── 1. 둘러보기
  section = "둘러보기";
  const g = await ctx();
  await g.goto(B + "/community");
  const published = Number(sql(`select count(*) from posts where status='published'`));
  check("커뮤니티 열림(글 수 = DB 공개 글 수)", (await g.locator("[data-testid=post-list] [data-post]").count()) === published);
  check("업체 사례와 구분 안내", (await main(g)).includes("업체가 올린 사례는 ‘시공 사례’에 따로"));
  await g.click("[data-testid=write-post]");
  await g.waitForURL(/\/login/);
  check("로그인 전 글쓰기 → 로그인", true);

  // ── 2. 공간 소개: 사진 2장·상품 태그·시공사 연결
  section = "공간 소개";
  const a = await ctx();
  const AEMAIL = `writer${T}@test.kr`;
  await signup(a, AEMAIL, "박작가");
  await a.goto(B + "/community/new");
  check("계약 없으면 시공 후기 선택 불가", await a.locator("[data-testid=type-review]").isDisabled());
  await a.fill("[data-testid=post-title]", `햇살 드는 24평 거실 ${T}`);
  await a.fill("textarea[name=body]", "소파 위치를 창 쪽으로 옮겼어요.");
  await a.selectOption("select[name=home_type]", "apartment");
  await a.fill("input[name=area_pyeong]", "24");
  await a.selectOption("select[name=style]", "natural");
  await a.fill("input[name=region]", "서울 마포구");
  const vendor1 = sql(`select v.id from vendors v join users u on u.id=v.user_id where u.email='vendor1@demo.kr'`);
  await a.selectOption("select[name=vendor]", vendor1);
  await a.click("[data-testid=post-submit]");
  check("사진 없으면 거절", await waitText(a, "사진을 한 장 이상"));
  await a.setInputFiles("[data-testid=post-photos]", [__dirname + "/fixtures/photo1.jpg", __dirname + "/fixtures/plan1.jpg"]);
  await tagPhoto(a, "new:0", 0.3, 0.6, "소파");
  await tagPhoto(a, "new:0", 0.7, 0.4, "조명");
  await a.fill("input[name=caption-new-0]", "거실 전경");
  await shot(a, "01-editor");
  await a.click("[data-testid=post-submit]");
  await a.waitForURL(/\/community\/\d+$/);
  const post1 = a.url().match(/community\/(\d+)/)[1];
  check("글 저장: 사진 2장·태그 2개", sql(`select count(*) from post_photos where post_id=${post1}`) === "2" && sql(`select count(*) from post_tags t join post_photos f on f.id=t.photo_id where f.post_id=${post1}`) === "2");
  check("사진은 공개 파일", sql(`select count(*) from post_photos p join files f on f.id=p.file_id where p.post_id=${post1} and f.kind='case' and f.category='post'`) === "2");
  let t = await main(a);
  check("상세: 공간 소개·작성자 연결 시공사(계약 확인 전)", t.includes("공간 소개") && (await a.textContent("[data-testid=post-vendor]")).includes("계약 확인 전") && !t.includes("계약 확인 ·"));
  check("상세: 별명 없으면 이름 첫 글자 + **", t.includes("박**"));
  check("상세: 사진 속 상품 2개", (await a.locator(".product-grid [data-product]").count()) === 2);
  await g.goto(`${B}/community/${post1}`);
  await g.locator("[data-testid=tag-dot]").first().click();
  const tagHref = await g.getAttribute("[data-testid=tag-link]", "href");
  check("사진 태그 점 → 상품 상세로", /\/shop\/products\/\d+/.test(tagHref || ""), tagHref);
  await shot(g, "02-post");

  // ── 3. 시공 후기: 계약 결과 기록 → 계약 확인
  section = "시공 후기";
  const admin = await ctx();
  await login(admin, "admin@demo.kr");
  const demoPid = sql(`select id from projects where title='[예시] 성수동 30평 사무실'`);
  await admin.goto(`${B}/admin/projects/${demoPid}`);
  await admin.selectOption("select[name=result]", "contracted");
  await admin.selectOption("select[name=vendorId]", vendor1);
  await admin.click('button:has-text("결과 기록")');
  check("운영자 계약 결과 기록", await until(`select status from projects where id=${demoPid}`, "contracted"));
  const c = await ctx();
  await login(c, "customer@demo.kr");
  await c.goto(B + "/community/new?type=review");
  await c.selectOption("[data-testid=review-project]", demoPid);
  await c.fill("[data-testid=post-title]", `성수동 사무실 공사 후기 ${T}`);
  await c.fill("textarea[name=body]", "일정대로 끝났고 회의실 차음이 좋아요.");
  await c.check("input[name=rating][value='4']");
  await c.selectOption("select[name=space_kind]", "office");
  await c.setInputFiles("[data-testid=post-photos]", [__dirname + "/fixtures/photo1.jpg"]);
  await c.click("[data-testid=post-submit]");
  await c.waitForURL(/\/community\/\d+$/);
  const review = c.url().match(/community\/(\d+)/)[1];
  check("후기 저장: 계약 확인·시공사 = 계약 업체", sql(`select type||'|'||verified||'|'||vendor_id||'|'||rating from posts where id=${review}`) === `review|1|${vendor1}|4`);
  t = await main(c);
  check("상세: 계약 확인 표시와 계약한 시공사", t.includes("계약 확인") && (await c.textContent("[data-testid=post-vendor]")).includes("계약한 시공사"));
  check("시공사에 후기 알림", sql(`select count(*) from notifications n join vendors v on v.user_id=n.user_id where v.id=${vendor1} and n.title like '%시공 후기%'`) === "1");
  await g.goto(`${B}/vendors/${vendor1}`);
  check("업체 화면: 계약 확인된 후기와 고객이 연결한 공간을 나눠 보여 줌", (await g.locator("[data-testid=vendor-reviews] [data-post]").count()) === 1 && (await main(g)).includes("고객이 연결한 공간 1건"));
  await c.goto(B + "/community/new");
  check("한 계약에 후기 하나(다시 쓸 수 없음)", await c.locator("[data-testid=type-review]").isDisabled());
  await g.goto(B + "/community/reviews");
  check("시공 후기 목록에 계약 확인 표시", (await g.textContent(`[data-post="${review}"]`)).includes("계약 확인"));

  // ── 4. 좋아요·스크랩·댓글·답글
  section = "반응";
  const b = await ctx();
  const BEMAIL = `reader${T}@test.kr`;
  await signup(b, BEMAIL, "이독자");
  await b.goto(`${B}/community/${post1}`);
  await b.click("[data-testid=like]");
  check("좋아요", await until(`select count(*) from post_likes where post_id=${post1}`, "1"));
  await b.click("[data-testid=scrap-post]");
  check("스크랩", await until(`select count(*) from scraps where target='post' and target_id=${post1}`, "1"));
  await b.fill("[data-testid=comment-body]", "소파 색이 궁금해요");
  await b.click('button:has-text("댓글 남기기")');
  check("댓글", await until(`select count(*) from comments where post_id=${post1}`, "1"));
  check("글쓴이에게 댓글 알림", await until(`select count(*) from notifications n join users u on u.id=n.user_id where u.email='${AEMAIL}' and n.title like '%댓글%'`, "1"));
  await a.goto(`${B}/community/${post1}`);
  await a.click('[data-testid=comment-list] button:has-text("답글")');
  await a.fill('[data-testid=comment-list] textarea[name=body]', "베이지예요!");
  await a.click('button:has-text("답글 남기기")');
  check("답글(한 단계)", await until(`select count(*) from comments where post_id=${post1} and parent_id is not null`, "1"));
  check("원 댓글 작성자에게 답글 알림은 글쓴이 본인 답글이면 댓글 작성자에게", await until(`select count(*) from notifications n join users u on u.id=n.user_id where u.email='${BEMAIL}' and n.title like '%답글%'`, "1"));
  const v = await ctx();
  await login(v, "vendor1@demo.kr");
  await v.goto(`${B}/community/${post1}`);
  await v.fill("[data-testid=comment-body]", "시공 문의는 업체 화면에서 주세요");
  await v.click('button:has-text("댓글 남기기")');
  await until(`select count(*) from comments where post_id=${post1}`, "3");
  await g.goto(`${B}/community/${post1}`);
  check("업체 댓글은 업체 이름과 ‘업체’ 표시", (await g.textContent("[data-testid=comment-list]")).includes("[예시] 스튜디오 온결업체"));
  await b.goto(B + "/saved");
  check("저장 화면에 스크랩한 공간", (await b.locator("[data-testid=saved-posts] [data-post]").count()) === 1);
  await b.goto(B + "/community?sort=popular");
  check("인기순 첫 글 = 반응 많은 글", (await b.locator("[data-testid=post-list] [data-post]").first().getAttribute("data-post")) === post1);

  // ── 5. 신고·운영자 처리
  section = "신고·관리";
  await b.goto(`${B}/community/${post1}`);
  await b.click("[data-testid=report-post]");
  await b.check("input[name=reason][value=spam]");
  await b.click('button:has-text("신고하기")');
  check("게시물 신고", await waitText(b, "신고했어요"));
  await b.reload();
  await b.click("[data-testid=report-post]");
  await b.check("input[name=reason][value=spam]");
  await b.click('button:has-text("신고하기")');
  check("같은 사람이 두 번 신고 안 됨", await waitText(b, "이미 신고했어요") && sql(`select count(*) from reports where target='post' and target_id=${post1}`) === "1");
  check("운영자에게 신고 알림", sql(`select count(*) from notifications n join users u on u.id=n.user_id where u.role='admin' and n.title like '신고 접수%'`) !== "0");
  await admin.goto(B + "/admin/community");
  const item = admin.locator(`[data-report="post-${post1}"]`);
  check("운영자: 신고 목록에 보임", (await item.count()) === 1);
  await item.locator("input[name=reason][aria-label]").fill("광고성 내용 확인");
  await item.locator('button:has-text("가리기")').click();
  check("운영자 가리기", await until(`select status from posts where id=${post1}`, "hidden"));
  check("다른 사람에게는 404", (await g.request.get(`${B}/community/${post1}`)).status() === 404);
  await a.goto(`${B}/community/${post1}`);
  check("작성자에게는 ‘운영자가 가린 글’과 이유", (await main(a)).includes("운영자가 가린 글이에요") && (await main(a)).includes("광고성 내용 확인"));
  check("작성자에게 가림 알림", sql(`select count(*) from notifications n join users u on u.id=n.user_id where u.email='${AEMAIL}' and n.title like '게시물이 가려졌%'`) === "1");
  check("신고 처리됨", sql(`select status from reports where target='post' and target_id=${post1}`) === "actioned");
  await admin.goto(B + "/admin/community?view=posts");
  await admin.locator("[data-testid=admin-posts] li", { hasText: `햇살 드는 24평 거실 ${T}` }).locator('button:has-text("다시 보이기")').click();
  check("다시 보이기", await until(`select status from posts where id=${post1}`, "published"));
  // 자동 가림: 다른 사용자 4명의 신고가 쌓인 상태에서 다섯 번째 신고
  for (let i = 0; i < 4; i++) {
    const uid = sql(`insert into users (email, password_hash, name, role) values ('r${i}${T}@test.kr', 'x', '신고자', 'customer') returning id`);
    sql(`insert into reports (reporter_id, target, target_id, reason) values (${uid}, 'post', ${review}, 'spam')`);
  }
  await b.goto(`${B}/community/${review}`);
  await b.click("[data-testid=report-post]");
  await b.check("input[name=reason][value=fake]");
  await b.click('button:has-text("신고하기")');
  check("신고 5건이면 자동 가림(운영자 확인 전)", await until(`select status||'|'||hidden_reason from posts where id=${review}`, "hidden|신고 누적(운영자 확인 전)"));
  await admin.goto(B + "/admin/community");
  await admin.locator(`[data-report="post-${review}"]`).locator('button:has-text("신고 기각")').click();
  check("신고 기각 → 신고 닫힘", await until(`select count(*) from reports where target='post' and target_id=${review} and status='open'`, "0"));
  await admin.locator("text=최근 글").click();
  await admin.locator("[data-testid=admin-posts] li", { hasText: `성수동 사무실 공사 후기 ${T}` }).locator('button:has-text("다시 보이기")').click();
  check("기각 뒤 다시 보이기", await until(`select status from posts where id=${review}`, "published"));
  // 댓글 신고·가리기
  const cid = sql(`select id from comments where post_id=${post1} and parent_id is null and user_id=(select id from users where email='${BEMAIL}')`);
  await a.goto(`${B}/community/${post1}`);
  await a.locator(`[data-comment="${cid}"] [data-testid=report-comment]`).first().click();
  await a.check("input[name=reason][value=abuse]");
  await a.click('button:has-text("신고하기")');
  await until(`select count(*) from reports where target='comment' and target_id=${cid}`, "1");
  await admin.goto(B + "/admin/community");
  await admin.locator(`[data-report="comment-${cid}"]`).locator('button:has-text("가리기")').click();
  check("댓글 가리기", await until(`select status from comments where id=${cid}`, "hidden"));
  await g.goto(`${B}/community/${post1}`);
  check("가린 댓글은 내용 대신 안내", (await g.textContent("[data-testid=comment-list]")).includes("운영자가 가린 댓글") && !(await g.textContent("[data-testid=comment-list]")).includes("소파 색이 궁금해요"));

  // ── 6. 고치기·지우기
  section = "고치기";
  await a.goto(`${B}/community/${post1}/edit`);
  await a.fill("[data-testid=post-title]", `햇살 드는 24평 거실(수정) ${T}`);
  await a.locator("input[name=removePhoto]").nth(1).check();
  await a.click("[data-testid=post-submit]");
  await a.waitForURL(new RegExp(`/community/${post1}$`));
  check("제목 수정·사진 1장 빼기·태그 유지", sql(`select title from posts where id=${post1}`).includes("(수정)") && sql(`select count(*) from post_photos where post_id=${post1}`) === "1" && sql(`select count(*) from post_tags t join post_photos f on f.id=t.photo_id where f.post_id=${post1}`) === "2");
  await a.goto(B + "/community/mine");
  check("내 글 목록", (await main(a)).includes("(수정)"));
  await a.goto(`${B}/community/${post1}`);
  await a.click('button:has-text("지우기")');
  await a.waitForURL(/\/community\/mine/);
  check("글 지우기", sql(`select status from posts where id=${post1}`) === "deleted" && (await g.request.get(`${B}/community/${post1}`)).status() === 404);

  // ── 7. 휴대폰
  section = "휴대폰";
  const m = await mobile();
  await login(m, BEMAIL, "testpass1");
  for (const pth of ["/community", "/community/spaces", "/community/reviews", `/community/${review}`, "/community/new", "/community/mine", "/saved", "/me"]) {
    await m.goto(B + pth);
    check(`가로 넘침 없음 ${pth}`, await noOverflow(m));
  }
  await m.goto(B + "/community");
  check("커뮤니티 하위 메뉴(전체·공간 소개·시공 후기·글쓰기)", (await m.locator(".section-tabs a").allTextContents()).join("|") === "전체|공간 소개|시공 후기|글쓰기");
  check("하단 탭 커뮤니티 켜짐", (await m.locator("nav.mobile-navigation a.is-active").textContent()) === "커뮤니티");
  await m.goto(B + "/community/new");
  await m.fill("[data-testid=post-title]", `휴대폰으로 올린 원룸 ${T}`);
  await m.setInputFiles("[data-testid=post-photos]", [__dirname + "/fixtures/photo1.jpg"]);
  await tagPhoto(m, "new:0", 0.5, 0.5, "책장");
  await m.click("[data-testid=post-submit]");
  await m.waitForURL(/\/community\/\d+$/);
  check("휴대폰에서 글쓰기(사진·태그)", sql(`select count(*) from post_tags t join post_photos f on f.id=t.photo_id join posts p on p.id=f.post_id where p.title like '휴대폰으로 올린 원룸%'`) === "1");
  await shot(m, "03-mobile-post");

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
