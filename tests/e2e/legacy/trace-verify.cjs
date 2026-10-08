// P1 회귀(실제 브라우저): 사용성 테스트의 ㄱ자 도면을 여러 화면 크기·확대율·축척으로 따라 그려 닫기 → 문·창 → 만들기 → 저장 → 3D
const { chromium } = require("playwright-core");
const { execSync } = require("child_process");
const B = process.env.B || "http://localhost:3101";
const DB = process.env.DB || __dirname + "/testdata/app.db";
const DRAWING = "/Users/gimjinbong/Desktop/인테러이 도면/output/usability-test-20261002/test-L-drawing.png";
const sql = (q) => execSync(`sqlite3 "${DB}" "${q.replace(/"/g, '\\"')}"`).toString().trim();
// 테스트 도면(1000×800px): 위쪽 긴 벽 (100,100)–(900,100), ㄱ자 모서리 6개
const CORNERS = [[100, 100], [900, 100], [900, 400], [500, 400], [500, 700], [100, 700]];
const CASES = [
  { vw: 1440, vh: 1200, zoom: 1, cal: [[100, 100], [900, 100], 12000], full: true, note: "사용성 테스트 재현 조건" },
  { vw: 1440, vh: 1200, zoom: 2, cal: [[100, 100], [900, 100], 12000] },
  { vw: 1440, vh: 1200, zoom: 3, cal: [[100, 100], [900, 100], 12000] },
  { vw: 1280, vh: 800, zoom: 1, cal: [[100, 100], [900, 100], 8000], full: true },
  { vw: 1920, vh: 1080, zoom: 1, cal: [[100, 100], [900, 100], 24000], full: true },
  { vw: 1366, vh: 768, zoom: 2, cal: [[100, 100], [100, 700], 9000] },
  { vw: 1600, vh: 900, zoom: 4, cal: [[500, 400], [900, 400], 6000] },
  { vw: 1440, vh: 1200, zoom: 1, cal: [[100, 100], [900, 100], 12000], start: 3, reverse: true, note: "다른 모서리에서 반대 방향" },
];
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name} ${ok ? "" : extra}`);

(async () => {
  const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const errors = [];
  for (const [n, k] of CASES.entries()) {
    const label = `${n + 1}) ${k.vw}×${k.vh} · ${k.zoom === 1 ? "전체" : k.zoom + "배"} · 축척 ${k.cal[2].toLocaleString()}mm${k.note ? ` · ${k.note}` : ""}`;
    const p = await (await browser.newContext({ viewport: { width: k.vw, height: k.vh } })).newPage();
    p.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
    await p.goto(B + "/login"); await p.fill("input[name=email]", "customer@demo.kr"); await p.fill("input[name=password]", "demo1234"); await p.click('main button:has-text("로그인")'); await p.waitForURL((u) => !u.pathname.startsWith("/login"));
    await p.goto(B + "/spaces/trace");
    await p.setInputFiles("[data-testid=trace-file]", DRAWING);
    await p.waitForSelector("[data-testid=trace-canvas]");
    if (k.zoom !== 1) await p.click(`[data-testid=trace-zoom-${k.zoom}]`);
    // 이미지 좌표 (u,v)를 화면에 보이게 스크롤한 뒤 그 화면 위치(소수)를 누른다.
    const clickPx = async (u, v) => {
      await p.evaluate(([u, v]) => {
        const svg = document.querySelector("[data-testid=trace-canvas]"), box = document.querySelector("[data-testid=trace-scroll]");
        const at = () => new DOMPoint(u, v).matrixTransform(svg.getScreenCTM());
        box.scrollIntoView({ block: "nearest" });
        const r = box.getBoundingClientRect(); let q = at();
        box.scrollLeft += q.x - (r.left + r.width / 2); box.scrollTop += q.y - (r.top + r.height / 2);
        q = at(); if (q.y < 0 || q.y > innerHeight) window.scrollBy(0, q.y - innerHeight / 2);
      }, [u, v]);
      const [x, y] = await p.$eval("[data-testid=trace-canvas]", (svg, [u, v]) => { const q = new DOMPoint(u, v).matrixTransform(svg.getScreenCTM()); return [q.x, q.y]; }, [u, v]);
      await p.mouse.click(x, y);
      return [x, y];
    };
    await clickPx(...k.cal[0]); await clickPx(...k.cal[1]);
    await p.fill("[data-testid=cal-mm]", String(k.cal[2])); await p.click("[data-testid=cal-apply]");
    await p.click("[data-testid=trace-next]");
    let order = [...CORNERS.slice(k.start || 0), ...CORNERS.slice(0, k.start || 0)];
    if (k.reverse) order = [order[0], ...order.slice(1).reverse()];
    const screen = [];
    for (const [u, v] of order) screen.push(await clickPx(u, v));
    const frac = screen.flat().some((x) => Math.abs(x - Math.round(x)) > 0.01);
    await p.click("[data-testid=trace-close]");
    const msg = await p.textContent("[data-testid=trace-msg]");
    const closed = msg.includes("벽 6개로 닫았어요");
    check(`${label}: 닫힘${frac ? "(소수 화면 좌표)" : ""}`, closed, msg);
    if (!closed) { await p.screenshot({ path: `${__dirname}/trace-fail-${n + 1}.png` }); await p.context().close(); continue; }
    // 그린 길이: 축척 기준 벽 길이가 도면과 맞는지(화면 1px 오차 범위)
    const lens = (await p.textContent("[data-testid=trace-outline]")).match(/벽 \d+ · [\d,]+/g).map((t) => Number(t.split(" · ")[1].replaceAll(",", "")));
    const mmPerPx = k.cal[2] / Math.hypot(k.cal[1][0] - k.cal[0][0], k.cal[1][1] - k.cal[0][1]);
    const expect = [400, 300, 400, 300, 800, 600].map((d) => d * mmPerPx).sort((a, b) => a - b);
    const got = [...lens].sort((a, b) => a - b);
    const tolMm = mmPerPx * 2 + 2;
    check(`${label}: 벽 길이 도면과 일치(±${Math.round(tolMm)}mm)`, got.every((g, i) => Math.abs(g - expect[i]) <= tolMm), `${JSON.stringify(got)} vs ${JSON.stringify(expect.map(Math.round))}`);
    if (!k.full) { await p.context().close(); continue; }
    // 문(아래쪽 왼편 벽)·창(위쪽 벽) → 만들기 → 편집 저장 → 3D
    await p.click("[data-testid=tool-door]"); await clickPx(300, 700);
    await p.click("[data-testid=tool-window]"); await clickPx(500, 100);
    check(`${label}: 문·창 입력`, (await p.locator("[data-testid=trace-door]").count()) === 1 && (await p.locator("[data-testid^=trace-win-]").count()) >= 1);
    await p.click("[data-testid=trace-next]");
    await p.fill("input[name=title]", `P1 회귀 ${n + 1}`); await p.fill("[data-testid=staff]", "6");
    await p.click("[data-testid=trace-submit]");
    await p.waitForURL(/\/editor/, { timeout: 20000 }); await p.waitForSelector("main.editor");
    const pid = Number(p.url().match(/projects\/(\d+)/)[1]);
    const room = JSON.parse(sql(`select room from versions where project_id=${pid} order by no desc limit 1`));
    check(`${label}: 공간 저장(꺾인 공간, 꼭짓점 6, 출입문·창)`, room.shape === "polygon" && room.outline.length === 6 && room.entrance && room.windows.length === 1);
    await p.click("[data-testid=add-desk]");
    await p.click("[data-testid=editor-save]"); await p.waitForURL(/saved=2/); await p.waitForSelector("main.editor");
    check(`${label}: 가구 놓고 배치 저장(버전 2)`, sql(`select count(*) from versions where project_id=${pid}`) === "2");
    await p.click("[data-testid=view-3d]");
    const ok3d = await p.waitForFunction(() => document.querySelector("canvas[data-viewer]")?.__viewer, null, { timeout: 20000 }).then(() => true).catch(() => false);
    check(`${label}: 3D 확인`, ok3d);
    if (n === 0) await p.screenshot({ path: `${__dirname}/p1-fixed-3d.png` });
    await p.context().close();
  }
  check("페이지 오류 없음", errors.length === 0, errors.join(" | "));
  console.log(results.join("\n"));
  console.log(`\n${results.filter((r) => r.startsWith("PASS")).length} passed, ${results.filter((r) => r.startsWith("FAIL")).length} failed`);
  await browser.close();
  process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
})().catch((e) => { console.log(results.join("\n")); console.error(e); process.exit(1); });
