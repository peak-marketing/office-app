// 실제 데이터에서 주거 화면이 열리는지(보기만, 입력 없음)
const { chromium } = require("playwright-core");
const B = process.env.B;
(async () => {
  const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const errors = []; const out = [];
  const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage(); p.on("pageerror", (e) => errors.push(e.message));
  const g = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); g.on("pageerror", (e) => errors.push(e.message));
  for (const u of ["/cases?space=home", "/cases?space=office"]) { await g.goto(B + u); out.push(`${u}: 카드 ${await g.locator("main li[data-case]").count()}개`); }
  for (const id of [15, 16, 17, 18, 19]) { const r = await g.goto(`${B}/cases/${id}`); out.push(`/cases/${id}: ${r.status()} ${(await g.textContent("main")).includes("방 한 칸") ? "방 한 칸 표시" : "?"}`); }
  out.push(`휴대폰 가로 스크롤 없음: ${await g.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)}`);
  await p.goto(B + "/login"); await p.fill("input[name=email]", "customer@demo.kr"); await p.fill("input[name=password]", "demo1234"); await p.click('main button:has-text("로그인")'); await p.waitForURL((u) => !u.pathname.startsWith("/login"));
  const r = await p.goto(B + "/homes/new"); out.push(`/homes/new: ${r.status()} ${(await p.textContent("main")).includes("집 상담 신청") ? "신청서 열림" : "?"}`);
  console.log(out.join("\n")); console.log(`페이지 오류 ${errors.length}`);
  await b.close();
})();
