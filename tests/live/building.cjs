// Explicit free address/building provider test; dedicated isolated server only.
/* eslint-disable @typescript-eslint/no-require-imports -- Uses the repository's CommonJS E2E harness. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { suite } = require("../e2e/lib/harness.cjs");
if (!process.env.DB || !path.resolve(process.env.DB).includes(`${path.sep}.e2e-data${path.sep}`)) throw new Error("Use an isolated .e2e-data DB");
const t = suite("building-live", { webgl: false });
const secrets = fs.readFileSync(path.join(t.P, ".env.local"), "utf8").split(/\r?\n/).filter((line) => /^(JUSO(?:_DETAIL)?_API_KEY|DATA_GO_KR_KEY)=/.test(line)).map((line) => line.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, ""));
t.run(async () => {
  for (const mobile of [false, true]) {
    const mode = mobile ? "휴대폰" : "PC";
    const p = mobile ? await t.phone() : await t.page();
    p.setDefaultTimeout(60_000);
    let providerCalls = 0;
    let leaked = false;
    p.on("request", (r) => { if (/business\.juso\.go\.kr|apis\.data\.go\.kr/.test(r.url())) providerCalls++; if (secrets.some((s) => r.url().includes(s))) leaked = true; });
    await t.login(p, "customer@demo.kr");
    await p.goto(t.B + "/spaces/address");
    await p.click("[data-testid=address-details] summary");
    await p.fill("[data-testid=addr-q]", "구리시 산마루로 46");
    await p.click("[data-testid=addr-search]");
    await p.locator("[data-testid=addr-hits] button").first().waitFor();
    await p.locator("[data-testid=addr-hits] button").first().click();
    await p.locator("[data-testid=addr-dong] option[value='401동']").waitFor({ state: "attached" });
    await p.selectOption("[data-testid=addr-dong]", "401동");
    await p.locator("[data-testid=addr-floor] option[value='1층']").waitFor({ state: "attached" });
    await p.selectOption("[data-testid=addr-floor]", "1층");
    await p.selectOption("[data-testid=addr-ho]", "102호");
    t.check(`${mode} 실제 동·층·호 선택`, await p.inputValue("[data-testid=addr-ho]") === "102호");
    await p.click("[data-testid=addr-building]");
    await p.locator("[data-testid=addr-unit]").filter({ hasText: "74.94" }).waitFor();
    const info = await p.textContent("[data-testid=addr-info]");
    t.check(`${mode} 전용면적 74.94㎡를 표시하고 공용면적 제외 안내`, info.includes("74.94㎡") && info.includes("공용면적 제외") && !info.includes("84.97"));
    t.check(`${mode} 선택한 401동의 건물 정보를 표시`, info.includes("401동") && info.includes("129세대") && info.includes("지상 27층") && info.includes("2017.08.07"));
    t.check(`${mode} 동별 수치를 단지 전체로 오인하지 않게 안내`, info.includes("단지 전체 수치가 아니에요"));
    t.check(`${mode} 실제 공공데이터 출처와 도면은 별도임을 안내`, info.includes("공공데이터포털 건축물대장") && info.includes("평면도가 없어요") && !info.includes("예시 값"));
    const href = await p.getAttribute("[data-testid=addr-to-home]", "href");
    const url = new URL(href, t.B);
    t.check(`${mode} 상담에 전용면적만 전달하고 호·타입·방 모양은 추측하지 않음`, url.searchParams.get("area") === "74.94" && !["dong", "ho", "template", "width", "depth"].some((key) => url.searchParams.has(key)));
    t.check(`${mode} 가로 넘침 없음`, await t.noOverflow(p));
    await t.shot(p, mobile ? "02-mobile-building" : "01-desktop-building");
    const html = await p.content();
    t.check(`${mode} 승인키는 서버에서만 사용`, providerCalls === 0 && !leaked && !secrets.some((s) => html.includes(s)));
    await p.click("[data-testid=addr-to-home]");
    await p.waitForURL((u) => u.pathname === "/homes/new");
    t.check(`${mode} 상담 입력은 74.94㎡ 전용면적 기준`, await p.inputValue("[data-testid=home-area]") === "74.94" && await p.inputValue("[data-testid=home-area-unit]") === "m2" && await p.inputValue("[data-testid=home-area-basis]") === "exclusive");
    await t.shot(p, mobile ? "04-mobile-area-transfer" : "03-desktop-area-transfer");
    await p.context().close();
  }
  const logs = t.sql("select query||' '||result from ext_lookups where kind in ('building','juso-detail')");
  t.check("조회 로그에 선택 동·호와 승인키가 없음", !logs.includes("401동") && !logs.includes("102호") && !secrets.some((s) => logs.includes(s)));
  assert.equal(t.errors.length, 0);
});
