// 대면 테스트 운영(예전 e2e10): 운영용 실행에서 실제 업체 등록 → 메일 기록의 링크로 비밀번호 설정 → 실제/예시 업체 구분 배정
// → 제안 안내 문구(비공개·최저가 자동 낙찰 없음) → 테스트 요약(npm run test:report)
// 메일 기록·테스트 요약은 이 검사가 만든 메일·프로젝트만 본다(기존 데이터 사본에 다른 기록이 있어도 어긋나지 않게).
const path = require("path");
const { execFileSync } = require("child_process");
const t = require("./lib/harness.cjs").suite("office-real-vendors", { webgl: false });
const { makeSpace, requestSpace, assignmentOf } = require("./lib/office.cjs");
const { B, DB, P, sql, check, page, login } = t;

/** npm run test:report 출력(이 서버의 데이터, 읽기만 함) */
const testReport = () => execFileSync("npm", ["run", "--silent", "test:report"], { cwd: P, env: { ...process.env, DB_PATH: DB, DATA_DIR: path.dirname(DB) } }).toString();
const reportCount = (r) => Number(r.match(/테스트 요청으로 표시한 프로젝트 (\d+)건/)?.[1] ?? NaN);

t.run(async () => {
  const MAIL0 = t.mailMark();
  const report0 = reportCount(testReport());

  // 운영용 실행: Secure 쿠키를 끈 http 로그인
  const a = await page(); await login(a, "admin@demo.kr");
  check("운영용 실행에서 http 로그인(쿠키 유지)", (await a.context().cookies()).length > 0 && !a.url().includes("/login"));

  // 1. 실제 업체 2곳 등록 → 메일 기록에 비밀번호 설정 링크
  const T = Date.now();
  // 항목 이름에는 실행마다 바뀌는 번호를 넣지 않는다(label). 예전 결과의 ‘실제업체A-<번호>: …’ = 지금의 ‘실제업체A: …’
  const real = [{ label: "실제업체A", company: `실제업체A-${T}`, email: `va${T}@test.kr` }, { label: "실제업체B", company: `실제업체B-${T}`, email: `vb${T}@test.kr` }];
  for (const v of real) {
    await a.goto(B + "/admin/vendors");
    await a.click("summary:has-text('업체 직접 등록')");
    await a.fill("input[name=company]", v.company); await a.fill("input[name=name]", "담당자"); await a.fill("input[name=email]", v.email);
    await a.click("button:has-text('업체 등록')"); await a.waitForSelector(`text=${v.company} 계정을 만들고`);
  }
  await a.goto(B + "/admin/emails");
  const links = await a.$$eval("[data-testid=email-link] .font-mono", (els) => els.map((e) => e.textContent));
  // 이 검사에서 등록한 두 업체에게 간 메일의 링크(DB)가 /reset/ 링크이고 메일 기록 화면에 보이는지만 본다. 다른 메일의 링크는 상관없다.
  for (const v of real) v.link = sql(`select link from email_outbox where id > ${MAIL0} and to_email='${v.email}' order by id desc limit 1`);
  const pathOf = (x) => { try { return new URL(x).pathname; } catch { return ""; } };
  const shown = (l) => links.some((x) => pathOf(x) === l);
  check("메일 기록: 발송 설정이 없으면 비밀번호 설정 링크를 보여 줌", real.every((v) => v.link.startsWith("/reset/") && shown(v.link)), JSON.stringify({ mine: real.map((v) => v.link), shown: links.slice(0, 6) }));
  // 2. 업체가 링크로 비밀번호를 정하고 로그인
  for (const [i, v] of real.entries()) {
    const link = links.find((l) => pathOf(l) === v.link) ?? B + v.link; // 화면에 보인 링크(전체 주소)를 그대로 연다
    const p = await page();
    await p.goto(link);
    await p.fill("input[name=password]", "realpass1"); await p.click("button:has-text('새 비밀번호로 바꾸기')");
    await p.waitForURL(/\/vendor/);
    check(`실제 업체 ${i + 1}: 링크로 비밀번호를 정하면 바로 업체 화면`, p.url().includes("/vendor"), p.url());
    const again = await page(); await login(again, v.email, "realpass1");
    check(`실제 업체 ${i + 1}: 정한 비밀번호로 다시 로그인`, again.url().includes("/vendor"), again.url());
    v.page = p;
  }
  // 3. 고객 1명: 공간 만들기 → 요청
  const c = await page();
  await c.goto(B + "/signup"); await c.fill("input[name=email]", `cust${T}@test.kr`); await c.fill("input[name=password]", "testpass1"); await c.fill("input[name=name]", "테스트고객"); await c.check("input[name=consent]"); await c.click('button:has-text("가입하기")'); await c.waitForURL(/\/projects/);
  const pid = await makeSpace(c, B, { title: "첫 테스트 공간", w: 11000, d: 9000, staff: 8 });
  await requestSpace(c, B, pid, { budgetMin: 4000, budgetMax: 6000 });
  // 4. 운영자: 테스트로 표시 → 실제/예시 구분된 목록에서 실제 업체 2곳 배정
  await a.goto(`${B}/admin/projects/${pid}`);
  await a.click("button:has-text('테스트 요청으로 표시')"); await a.waitForSelector("button:has-text('실제 요청으로 표시')");
  const realGroup = await a.textContent("[data-testid=vendor-group-real]");
  const demoGroup = await a.textContent("[data-testid=vendor-group-demo]");
  check("배정 목록: 실제 업체 묶음에 등록한 2곳(실제 표시)", real.every((v) => realGroup.includes(v.company)) && realGroup.includes("실제") && !realGroup.includes("[예시]"));
  check("배정 목록: 예시 업체는 따로(응답하지 않는다는 안내)", demoGroup.includes("[예시]") && demoGroup.includes("실제로 응답하지 않아요"));
  for (const v of real) await a.locator(`[data-testid=vendor-group-real] label:has-text("${v.company}") input[name=vendor]`).check();
  await a.click('button:has-text("선택한 업체 배정")'); await a.waitForSelector("text=업체 2곳을 배정했습니다");
  // 5. 실제 업체 2곳이 받아서 제안
  for (const v of real) {
    const p = v.page;
    const aid = assignmentOf(sql, pid, v.email);
    await p.goto(`${B}/vendor/requests/${aid}`);
    check(`${v.label}: 받은 요청에 배치(평면·3D) 표시`, (await p.locator("[data-testid=sent-layout]").count()) === 1);
    await p.click("button:has-text('참여하기')"); await p.waitForSelector("text=최저가 자동 낙찰은 하지 않습니다");
    const body = await p.textContent("main");
    check(`${v.label}: 제안 안내 문구(운영자 선정·비공개·최저가 자동 낙찰 없음, ‘경매’ 표현 없음)`, body.includes("운영자가 선정한 여러 업체가 같은 요청 내용과 같은 항목으로 비공개로 가격·설계·자재·기간을 제안하고, 고객이 비교해 선택합니다") && body.includes("최저가 자동 낙찰은 하지 않습니다") && !body.includes("경매"));
    v.aid = aid;
  }
  check("테스트 요청 표시 저장", sql(`select is_test from projects where id=${pid}`) === "1");
  // 테스트 요약: 검사 전보다 1건 늘었는지, 이 프로젝트 칸에 실제 업체 2곳이 있고 예시 업체가 없는지만 본다(다른 테스트 프로젝트는 상관없다).
  const report = testReport();
  const block = report.split("\n■ ").find((b) => b.startsWith(`프로젝트 ${pid} ·`)) ?? "";
  check("테스트 요약: 이 프로젝트와 실제 업체 2곳(예시 표시 없음)", reportCount(report) === report0 + 1 && real.every((v) => block.includes(v.company)) && !block.includes("(예시 업체)"), `전 ${report0}건 → 후 ${reportCount(report)}건 · ${block.slice(0, 300)}`);

  for (const u of ["/guide", "/partners"]) { const tx = await (await c.request.get(B + u)).text(); check(`${u}: 새 설명 문구, ‘경매’ 표현 없음`, tx.includes("최저가 자동 낙찰은 하지 않습니다") && tx.includes("비공개로 가격·설계·자재·기간을 제안") && !tx.includes("경매")); }
});
