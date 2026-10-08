// 기존 데이터 화면 글자 모음 + 기존 파일 열람 확인. 같은 데이터를 반영 전·후 코드로 열어 비교한다.
// 사용: B=http://localhost:3109 DB=<app.db> OUT=<json> node pagecap.cjs   (DB는 읽기 전용으로만 연다)
const { chromium } = require("playwright-core");
const { execSync } = require("child_process");
const fs = require("fs");
const B = process.env.B, DB = process.env.DB, OUT = process.env.OUT;
const sql = (q) => execSync(`sqlite3 -readonly "${DB}" "${q}"`).toString().trim();
(async () => {
  const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const errors = []; const out = {}; const files = {};
  const ctx = async () => { const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage(); p.on("pageerror", (e) => errors.push(`${p.url()} ${e.message}`)); return p; };
  const login = async (p, email) => { await p.goto(B + "/login"); await p.fill("input[name=email]", email); await p.fill("input[name=password]", "demo1234"); await p.click('main button:has-text("로그인")'); await p.waitForURL((u) => !u.pathname.startsWith("/login")); };
  const grab = async (p, who, url) => { const r = await p.goto(B + url); await p.waitForTimeout(250); const text = (await p.textContent("main").catch(() => "")) ?? ""; out[`${who} ${url}`] = { status: r.status(), text: text.replace(/\s+/g, " ").trim() }; };
  const pids = sql("select id from projects order by id").split("\n").filter(Boolean);
  const c = await ctx(); await login(c, "customer@demo.kr");
  for (const u of ["/projects", "/saved", "/notifications"]) await grab(c, "고객", u);
  for (const id of pids) for (const t of ["", "/plan", "/quotes", "/info", "/activity", "/print"]) await grab(c, "고객", `/projects/${id}${t}`);
  for (const id of pids) for (const r of sql(`select no from request_revisions where project_id=${id}`).split("\n").filter(Boolean)) await grab(c, "고객", `/projects/${id}/quotes?r=${r}`);
  // 기존 파일(프로젝트 사진·도면·설계 제안 첨부, 사례 사진) 열람: 고객 권한으로 상태와 크기
  for (const row of sql("select id||'|'||size from files where deleted_at is null order by id").split("\n").filter(Boolean)) {
    const [id, size] = row.split("|"); const r = await c.request.get(`${B}/files/${id}`); const body = await r.body();
    files[id] = { status: r.status(), size: body.length, expected: Number(size) };
  }
  const a = await ctx(); await login(a, "admin@demo.kr");
  for (const u of ["/admin?view=all", "/admin/vendors", ...pids.map((id) => `/admin/projects/${id}`)]) await grab(a, "운영자", u);
  for (const email of ["vendor1@demo.kr", "vendor2@demo.kr", "vendor3@demo.kr"]) {
    const v = await ctx(); await login(v, email);
    await grab(v, email, "/vendor"); await grab(v, email, "/vendor/profile");
    for (const aid of sql(`select a.id from assignments a join vendors x on x.id=a.vendor_id join users u on u.id=x.user_id where u.email='${email}' order by a.id`).split("\n").filter(Boolean)) await grab(v, email, `/vendor/requests/${aid}`);
  }
  const g = await ctx();
  for (const u of ["/", "/cases", "/cases/1", "/vendors", "/guide", "/partners"]) await grab(g, "손님", u);
  for (const tok of sql("select token from share_links where revoked=0 and expires_at > datetime('now')").split("\n").filter(Boolean)) await grab(g, "손님", `/share/${tok}`);
  fs.writeFileSync(OUT, JSON.stringify({ errors, files, pages: out }, null, 1));
  const badFiles = Object.entries(files).filter(([, f]) => f.status !== 200 || f.size !== f.expected);
  console.log(`pages ${Object.keys(out).length} · not200 ${Object.values(out).filter((x) => x.status !== 200).length} · errors ${errors.length} · files ${Object.keys(files).length} (문제 ${badFiles.length})`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
