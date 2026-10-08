// 자료별 접수와 운영(예전 e2e6): 가입 동의 → 사진만(치수 없이 상담·3D 없음) → 운영자 자료 요청·고객 답변 → 치수로 공간 만들기
// → 치수는 ‘내 공간 만들기’로·도면 보관 → 자료 없음(저장만) → 도면만(배치 없음) → 요청 기록 r1/r2(참고 사례·예산·자료 삭제), 업체 화면·제안 기준
// → 응답 지연·다시 알리기·배정 취소·재배정 → 테스트 표시·메일 기록·비밀번호 재설정
// 메일 확인은 이 검사가 시작된 뒤 생긴 메일(번호 > MAIL0)만 센다. 기존 데이터 사본(E2E_BASE)에 메일 기록이 있어도 어긋나지 않는다.
const path = require("path");
const t = require("./lib/harness.cjs").suite("office-intake-ops");
const { makeSpace, requestSpace, designAsIs, KEYS } = require("./lib/office.cjs");
const { B, sql, check, page, login, until } = t;
const PHOTO = t.fixture("photo1.jpg"), PLAN = t.fixture("plan1.jpg");

t.run(async () => {
  const T = Date.now();
  const MAIL0 = t.mailMark();
  const ctx = () => page();
  const signup = async (p, email, name, consent = true) => {
    await p.goto(B + "/signup"); await p.fill("input[name=email]", email); await p.fill("input[name=password]", "testpass1"); await p.fill("input[name=name]", name); await p.fill("input[name=phone]", "010-3030-4040");
    if (consent) await p.check("input[name=consent]");
    await p.click('button:has-text("가입하기")');
  };
  const next = (p) => p.click('button:has-text("다음")');
  const alertText = async (p) => (await p.locator("p[role=alert]").first().textContent().catch(() => "")) || "";
  const outbox = (to, like) => Number(sql(`select count(*) from email_outbox where id > ${MAIL0} and to_email='${to}' and subject like '%${like}%'`));

  // ── 가입: 개인정보 동의 필수
  const c = await ctx();
  const EMAIL = `r6c_${T}@test.kr`;
  await signup(c, EMAIL, "육차고객", false);
  check("signup requires consent", (await c.locator("input[name=consent]:invalid").count()) === 1 || (await alertText(c)).includes("동의"));
  await c.check("input[name=consent]"); await c.click('button:has-text("가입하기")'); await c.waitForURL(/\/projects/);

  // ── 1. 사진만 있어요: 치수 없이 상담 접수, 3D 없음
  await c.goto(B + "/projects/new");
  await next(c); check("intake: must pick a mode", (await alertText(c)).includes("가진 자료를 골라"));
  await c.click('label.intake-option:has(input[value=photos])'); await next(c);
  check("photos: no dimension fields", (await c.locator("input[name=widthM]").count()) === 0 && (await c.textContent("main")).includes("치수를 받지 않습니다"));
  check("photos: preview says no layout", (await c.locator("[data-testid=no-layout]").count()) >= 1 && (await c.locator("aside svg[aria-label$='평면도']").count()) === 0);
  await next(c); await next(c); await next(c);
  check("photos: work scope required", (await alertText(c)).includes("원하는 공사 내용"));
  await c.fill("textarea[name=workScope]", "바닥과 조명 교체, 회의실 하나 추가"); await next(c); await next(c); await next(c);
  check("photos: at least one photo required", (await alertText(c)).includes("사진을 한 장 이상"));
  await c.setInputFiles("input[name=photos]", PHOTO); await next(c);
  await c.fill("input[name=title]", "사진 상담 사무실"); await c.fill("input[name=region]", "서울 중구"); await c.fill("input[name=address]", "서울 중구 사진로 1");
  await c.click('button:has-text("요청 등록하기")'); await c.waitForURL(/\/projects\/\d+$/);
  const pPhotos = c.url().split("/").pop();
  const vPhotos = JSON.parse(sql(`select input from versions where project_id=${pPhotos}`));
  const rPhotos = JSON.parse(sql(`select result from versions where project_id=${pPhotos}`));
  check("photos: saved without dims and without layout", vPhotos.intake === "photos" && vPhotos.widthM == null && rPhotos.options.length === 0 && rPhotos.W === null && sql(`select work_scope from projects where id=${pPhotos}`).includes("조명"));
  check("photos: no 3D on project", (await c.locator("canvas[data-viewer]").count()) === 0 && (await c.textContent("main")).includes("사진으로 상담을 접수하세요"));
  await c.click('button:has-text("사진으로 상담 접수")'); await c.waitForSelector("text=운영자가 요청을 검토하고 있습니다");
  check("photos: request recorded as revision r1", sql(`select count(*) from request_revisions where project_id=${pPhotos}`) === "1");

  // 운영자: 자료 요청 → 고객 답변
  const admin = await ctx(); await login(admin, "admin@demo.kr");
  await admin.goto(B + "/admin"); let am = await admin.textContent("main");
  check("admin list: photo consult flagged, real view excludes demo", am.includes("사진 상담 사무실") && am.includes("사진 상담") && !am.includes("[예시] 성수동"));
  await admin.goto(B + "/admin?view=test"); check("admin test view shows demo project", (await admin.textContent("main")).includes("[예시] 성수동"));
  await admin.goto(`${B}/admin/projects/${pPhotos}`);
  check("admin: intake section shows mode and no layout", (await admin.textContent("[data-testid=admin-intake]")).includes("사진만 있어요") && (await admin.textContent("[data-testid=admin-intake]")).includes("배치안 없음"));
  await admin.check('input[name=item][value="도면"]'); await admin.check('input[name="item"][value="실내 가로·세로"]'); await admin.fill("textarea[name=message]", "출입구 쪽 사진도 부탁드립니다.");
  await admin.click('button:has-text("고객에게 자료 요청")'); await admin.waitForSelector("text=고객에게 자료를 요청했습니다");
  check("info request emailed to customer", outbox(EMAIL, "자료를 요청") === 1 && sql(`select status from email_outbox where id > ${MAIL0} and to_email='${EMAIL}' order by id desc limit 1`) === "logged");
  await c.goto(`${B}/projects/${pPhotos}`);
  check("customer sees info request banner", (await c.textContent("[data-testid=info-request-banner]")).includes("도면, 실내 가로·세로"));
  await c.goto(`${B}/projects/${pPhotos}/info`);
  await c.setInputFiles("input[name=drawings]", PLAN); await c.click('button:has-text("파일 올리기")'); await c.waitForSelector("text=파일 1개를 올렸습니다");
  await c.fill("#info-requests textarea[name=reply]", "도면 올렸습니다. 가로 11m, 세로 9m입니다."); await c.click('button:has-text("자료를 보냈다고 알리기")'); await c.waitForSelector("text=답변함");
  check("answer recorded and admin notified by email", sql(`select status from info_requests where project_id=${pPhotos}`) === "answered" && Number(sql(`select count(*) from email_outbox where id > ${MAIL0} and subject like '자료 답변:%사진 상담 사무실%'`)) >= 1);
  // 치수를 받은 뒤 ‘치수로 내 공간 만들기’로 실제 공간 생성
  await c.goto(`${B}/projects/${pPhotos}/space`);
  await c.fill("[data-testid=room-width]", "11000"); await c.fill("[data-testid=room-depth]", "9000"); await c.click("[data-testid=wizard-next]");
  await c.click("[data-testid=wizard-submit]"); await c.waitForURL(new RegExp(`/projects/${pPhotos}/editor`));
  check("after dims added: new version with real room + layout", sql(`select layout_status || '|' || (room is not null) from versions where project_id=${pPhotos} order by no desc limit 1`) === "ok|1");

  // ── 2. 치수는 알아요: 상담 요청서가 아니라 ‘내 공간 만들기’로 보낸다. 도면 파일은 함께 보관
  await c.goto(B + "/projects/new"); await c.click('label.intake-option:has(input[value=dims])');
  check("dims: old request wizard points to space builder", await c.locator("[data-testid=to-space]").isVisible());
  await next(c); check("dims: wizard does not continue with dims", (await alertText(c)).includes("내 공간 만들기"));
  const pid = String(await makeSpace(c, B, { intake: "drawing", drawing: PLAN, title: "치수 비밀 사무실", w: 11000, d: 9000, staff: 8 })); const base = `${B}/projects/${pid}`;
  check("space: real room + layout ok + drawing stored", sql(`select layout_status || '|' || json_extract(room,'$.width') from versions where project_id=${pid}`) === "ok|11" && sql(`select kind from files where project_id=${pid}`) === "drawing");

  // ── 3. 자료 없음: 저장만, 배치 없음
  await c.goto(B + "/projects/new"); await c.click('label.intake-option:has(input[value=none])'); for (let i = 0; i < 6; i++) await next(c);
  await c.fill("input[name=title]", "자료 없는 사무실"); await c.fill("input[name=region]", "경기 성남시");
  await c.click('button:has-text("요청 등록하기")'); await c.waitForURL(/\/projects\/\d+$/);
  const pNone = c.url().split("/").pop();
  check("none: saved as draft without layout", sql(`select status from projects where id=${pNone}`) === "draft" && JSON.parse(sql(`select result from versions where project_id=${pNone}`)).options.length === 0 && (await c.textContent("main")).includes("자료를 추가하거나"));

  // ── 4. 도면 있어요: 도면 파일 필수, 치수 없으면 배치안 없음
  await c.goto(B + "/projects/new"); await c.click('label.intake-option:has(input[value=drawing])'); for (let i = 0; i < 6; i++) await next(c);
  check("drawing: file required", (await alertText(c)).includes("도면 파일을 올려"));
  await c.setInputFiles("input[name=drawings]", PLAN); await next(c);
  await c.fill("input[name=title]", "도면 사무실"); await c.fill("input[name=region]", "서울 강남구");
  await c.click('button:has-text("요청 등록하기")'); await c.waitForURL(/\/projects\/\d+$/);
  const pDraw = c.url().split("/").pop();
  check("drawing without dims: no layout, reason explains", JSON.parse(sql(`select result from versions where project_id=${pDraw}`)).reasons[0].includes("도면에서 치수를 읽어") && (await c.textContent("main")).includes("도면으로 상담을 접수하세요"));

  // ── 5. 요청 내용 보관: 참고 사례 변경 → 이전 내용 유지, 업체에 알림
  const natural = sql("select id from vendor_cases where title like '%IT 스타트업%'"), chic = sql("select id from vendor_cases where title like '%법률사무소%'");
  const naturalPhoto = sql(`select file_id from case_files where case_id=${natural} order by position limit 1`);
  for (const id of [natural, chic]) { await c.goto(`${B}/cases/${id}`); await c.locator("aside button[data-save-case]").click(); await c.waitForSelector('aside button[data-save-case]:has-text("저장한 공간")'); }
  await c.goto(`${base}/info`); await c.selectOption("#refs select[name=caseId]", natural); await c.fill("#refs input[name=note]", "오크 톤"); await c.click('#refs button:has-text("연결하기")'); await c.waitForSelector("#refs [data-testid=ref-cases]");
  await c.setInputFiles("input[name=photos]", PHOTO); await c.click('button:has-text("파일 올리기")'); await c.waitForSelector("text=파일 1개를 올렸습니다");
  const photoId = sql(`select id from files where project_id=${pid} and kind='photo'`);
  await requestSpace(c, B, pid, { region: "서울 성동구", address: "서울 성동구 비밀길 7" });
  check("r1 snapshot holds natural case + photo", (() => { const s = JSON.parse(sql(`select snapshot from request_revisions where project_id=${pid} and no=1`)); return s.refs[0].case_id == natural && s.files.some((f) => f.id == photoId) && s.budget_min == null; })());
  check("admin emailed on new request", Number(sql(`select count(*) from email_outbox where id > ${MAIL0} and subject like '새 요청 접수: 치수 비밀 사무실'`)) >= 1);
  await admin.goto(`${B}/admin/projects/${pid}`);
  for (const v of ["[예시] 스튜디오 온결", "[예시] 모아공간"]) await admin.locator(`label:has-text("${v}") input[name=vendor]`).check();
  await admin.click('button:has-text("선택한 업체 배정")'); await admin.waitForSelector("text=업체 2곳을 배정했습니다");
  check("vendors emailed on assignment", outbox("vendor1@demo.kr", "새 요청이 배정되었습니다") === 1 && outbox("vendor2@demo.kr", "새 요청이 배정되었습니다") === 1, `${outbox("vendor1@demo.kr", "새 요청이 배정되었습니다")}/${outbox("vendor2@demo.kr", "새 요청이 배정되었습니다")}`);
  check("assignment has 48h response deadline", sql(`select count(*) from assignments where project_id=${pid} and respond_by > datetime('now','+47 hours')`) === "2");
  const v1 = await ctx(); await login(v1, "vendor1@demo.kr");
  await v1.click('a:has-text("서울 성동구 · 29.9평 사무실")'); await v1.waitForURL(/requests\/\d+/);
  const req1 = v1.url();
  check("vendor sees deadline", (await v1.textContent("[data-testid=deadline]")).includes("참여 여부 답변 기한"));
  await v1.locator('aside button:has-text("참여하기")').click(); await v1.waitForSelector("#proposal select[name=vat]");
    for (const k of KEYS) { await v1.selectOption(`select[name=status_${k}]`, "included"); await v1.fill(`input[name=amount_${k}]`, "1000000"); }
  await v1.selectOption("select[name=vat]", "1"); await v1.fill("input[name=durationDays]", "21"); await v1.fill("input[name=startAvailable]", "2026-11-16"); await v1.fill("textarea[name=extraConditions]", "없음");
  await designAsIs(v1);
  await v1.click('#proposal button:text-is("제안 제출")'); await v1.waitForSelector("text=제안을 제출했습니다");
  check("customer emailed on quote arrival", outbox(EMAIL, "제안이 도착했습니다") === 1);
  check("quote pinned to r1", sql(`select r.no from quotes q join request_revisions r on r.id=q.request_rev_id where q.project_id=${pid}`) === "1");

  // 고객이 내추럴 → 시크 사례로 바꾸고 예산을 넣고, 사진 하나를 지운다
  await c.goto(`${base}/info`);
  await c.click('button[aria-label="참고 사례 연결 해제"]'); await c.waitForSelector("text=연결한 참고 사례가 없습니다");
  await c.selectOption("#refs select[name=caseId]", chic); await c.click('#refs button:has-text("연결하기")'); await c.waitForSelector("#refs [data-testid=ref-cases]");
  await c.locator('button[aria-label="파일 삭제"]').last().click();
  check("deleted photo kept on disk for sent request", (await until(() => sql(`select deleted_at is not null from files where id=${photoId}`) === "1")) === true);
  await requestSpace(c, B, pid, { send: false, region: "서울 성동구", budgetMin: 5000, budgetMax: 7000 });
  const pend = await c.textContent("[data-testid=pending-changes]");
  check("customer sees unsent changes", pend.includes("참고 사례 추가") && pend.includes("참고 사례 제외") && pend.includes("예산") && pend.includes("자료 삭제"), pend.slice(0, 200));
  await v1.goto(req1); let vm = await v1.textContent("main");
  check("before sending: vendor still sees r1 content", vm.includes("IT 스타트업 32평") && !vm.includes("법률사무소") && !vm.includes("5,000만원"));
  await c.click("[data-testid=send-update]"); await c.waitForSelector("[data-testid=pending-changes]", { state: "detached" });
  check("r2 recorded with changes", (await until(() => sql(`select count(*) from request_revisions where project_id=${pid}`) === "2")) === true && sql(`select changes from request_revisions where project_id=${pid} and no=2`).includes("참고 사례 제외"));
  check("assigned vendors emailed about change", (await until(() => outbox("vendor1@demo.kr", "요청 내용이 바뀌었습니다") === 1 && outbox("vendor2@demo.kr", "요청 내용이 바뀌었습니다") === 1)) === true, `${outbox("vendor1@demo.kr", "요청 내용이 바뀌었습니다")}/${outbox("vendor2@demo.kr", "요청 내용이 바뀌었습니다")}`);
  await v1.goto(req1); vm = await v1.textContent("main");
  check("vendor sees r2 with change list", vm.includes("법률사무소") && (await v1.textContent("[data-testid=rev-changes]")).includes("참고 사례 제외") && vm.includes("5,000만원"));
  check("vendor told quote is on old request", vm.includes("제출한 제안은 이전 요청 내용 기준입니다"));
  await v1.goto(req1 + "?rev=1"); vm = await v1.textContent("main");
  check("vendor can still open r1: natural case and old budget", vm.includes("IT 스타트업 32평") && !vm.includes("법률사무소") && vm.includes("이전 요청 내용 r1"));
  check("files from r1 still readable by vendor", (await v1.request.get(`${B}/files/${photoId}`)).status() === 200 && (await v1.request.get(`${B}/files/${naturalPhoto}`)).status() === 200);
  await c.goto(`${base}/quotes`); let cm = await c.textContent("main");
  // P2(2026-10-02 사용성 테스트): r2를 보낸 뒤 기본은 최신 r2. 업체 확인 전에는 ‘업체가 변경 내용을 확인 중’, r1 제안은 따로 연다.
  check("customer compare: default = latest r2, vendors reconfirming; r1 kept separate", cm.includes("업체가 변경 내용을 확인 중입니다") && (await c.locator("[data-testid=prev-rev-1]").count()) === 1 && !cm.includes("요청 내용 r1 기준으로 받은 제안입니다"));
  await c.click("[data-testid=prev-rev-1]"); await c.waitForURL(/r=1/); cm = await c.textContent("main");
  check("customer compare: r1 opened separately, shown as r1 basis", cm.includes("요청 내용 r1 기준으로 받은 제안입니다"));
  await v1.goto(req1); await v1.click('button:has-text("확인했고 제안은 그대로 유지")');
  await until(() => sql(`select r.no from quotes q join request_revisions r on r.id=q.request_rev_id where q.project_id=${pid}`) === "2");
  check("vendor keeps quote → pinned to r2 with history", sql(`select r.no from quotes q join request_revisions r on r.id=q.request_rev_id where q.project_id=${pid}`) === "2" && sql(`select count(*) from quote_revisions qr join quotes q on q.id=qr.quote_id where q.project_id=${pid}`) === "2");
  await c.goto(`${base}/quotes`); cm = await c.textContent("main");
  check("customer compare now on r2", !cm.includes("기준으로 받은 제안입니다") && (await c.locator("main li:has-text('현재 산정 금액 · 부가세 포함')").count()) >= 1);
  await c.goto(`${base}/info`);
  check("customer sees sent history", (await c.textContent("[data-testid=sent-revisions]")).includes("요청 내용 r2 · 지금 업체가 보는 내용") && !(await c.textContent("main")).includes(path.basename(PHOTO) + "사진"));

  // ── 6. 응답 지연 → 다시 알리기 → 배정 취소 → 재배정
  sql(`update assignments set respond_by = datetime('now','-1 hour') where project_id=${pid} and vendor_id=(select id from vendors where company like '%모아공간%')`);
  await admin.goto(B + "/admin");
  check("admin late list shows unresponsive vendor", (await admin.textContent("[data-testid=late-list]")).includes("모아공간"));
  await admin.goto(`${B}/admin/projects/${pid}`);
  const lateItem = admin.locator('[data-testid=admin-assignments] li:has-text("모아공간")');
  await lateItem.locator('button:has-text("다시 알리기")').click();
  check("reminder emailed", (await until(() => outbox("vendor2@demo.kr", "참여 여부를 알려") === 1)) === true, String(outbox("vendor2@demo.kr", "참여 여부를 알려")));
  await admin.locator('[data-testid=admin-assignments] li:has-text("모아공간") input[name=reason]').fill("48시간 안에 답이 없었습니다");
  await admin.locator('[data-testid=admin-assignments] li:has-text("모아공간") button:has-text("배정 취소")').click();
  await until(() => sql(`select count(*) from assignments a join vendors v on v.id=a.vendor_id where a.project_id=${pid} and v.company like '%모아공간%' and a.withdrawn_at is not null`) === "1");
  const v2 = await ctx(); await login(v2, "vendor2@demo.kr");
  const a2 = sql(`select a.id from assignments a join vendors v on v.id=a.vendor_id where a.project_id=${pid} and v.company like '%모아공간%'`);
  await v2.goto(`${B}/vendor/requests/${a2}`); const v2m = await v2.textContent("main");
  check("withdrawn vendor sees notice, no details", v2m.includes("배정을 취소했습니다") && !v2m.includes("법률사무소"));
  check("withdrawn vendor loses file access", (await v2.request.get(`${B}/files/${sql(`select id from files where project_id=${pid} and kind='drawing'`)}`)).status() === 404);
  check("withdrawn vendor emailed", outbox("vendor2@demo.kr", "배정이 취소되었습니다") === 1);
  await admin.goto(`${B}/admin/projects/${pid}`); await admin.locator('label:has-text("[예시] 라인앤폼") input[name=vendor]').check();
  await admin.click('button:has-text("선택한 업체 배정")'); await admin.waitForSelector("text=업체 1곳을 배정했습니다");
  check("reassigned vendor emailed", outbox("vendor3@demo.kr", "새 요청이 배정되었습니다") === 1);
  await c.goto(base); check("customer counts exclude withdrawn", (await c.textContent("main")).includes("시공사 2곳") || (await c.textContent("main")).includes("참여 시공사2곳"));

  // ── 7. 테스트 표시, 메일 기록, 비밀번호 재설정
  await admin.goto(`${B}/admin/projects/${pNone}`); await admin.click('button:has-text("테스트 요청으로 표시")'); await admin.waitForSelector('button:has-text("실제 요청으로 표시")');
  await admin.goto(B + "/admin"); check("test-marked project leaves real view", !(await admin.textContent("main")).includes("자료 없는 사무실"));
  await admin.goto(B + "/admin/emails"); check("email log page lists messages", (await admin.locator("tbody tr").count()) >= 8 && (await admin.textContent("main")).includes("기록만"));
  const r = await ctx(); await r.goto(B + "/forgot"); await r.fill("input[name=email]", EMAIL); await r.click('button:has-text("재설정 링크 받기")'); await r.waitForSelector("text=재설정 링크를 보냈습니다");
  const link = sql(`select link from email_outbox where to_email='${EMAIL}' and subject='비밀번호 재설정'`);
  await r.goto(B + "/forgot"); await r.fill("input[name=email]", "nobody@test.kr"); await r.click('button:has-text("재설정 링크 받기")'); await r.waitForSelector("text=재설정 링크를 보냈습니다");
  check("reset: same answer for unknown email, no mail", sql(`select count(*) from email_outbox where id > ${MAIL0} and to_email='nobody@test.kr'`) === "0" && link.startsWith("/reset/"));
  await r.goto(B + link); await r.fill("input[name=password]", "newpass123"); await r.click('button:has-text("새 비밀번호로 바꾸기")'); await r.waitForURL(/\/projects/);
  const r2 = await ctx(); await login(r2, EMAIL, "newpass123"); check("login with new password", r2.url().includes("/projects"));
  await r.goto(B + link); await r.fill("input[name=password]", "another123"); await r.click('button:has-text("새 비밀번호로 바꾸기")'); await r.waitForSelector("p[role=alert]");
  check("reset link single-use", (await alertText(r)).includes("만료되었거나"));
});
