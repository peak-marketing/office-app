// 내 공간 만들기와 직접 배치 편집(예전 e2e8): 치수대로 공간 생성(사진만·ㄱ자·가운데 출입문 제한) → 가구 끌기·되돌리기·삭제·추가·회전·숫자 입력이
// 평면과 3D에 똑같이 → 저장·다시 열기·새로 고침 → 휴대폰 선택·이동·회전·되돌리기·끌기 → 업체가 고른 저장본 그대로 받음·수정 제안 첨부
// → 같은 요청 기준끼리 비교(r1/r2, 업체 재확인)
const t = require("./lib/harness.cjs").suite("office-space-editor");
const { B, sql, check, group, login, until } = t;
const { KEYS } = require("./lib/office.cjs");
const PLAN = t.fixture("plan1.jpg");
const near = (a, b, e = 0.002) => Math.abs(a - b) <= e;

t.run(async () => {
  const T = Date.now();
  const ctx = (opts = {}) => t.page(opts);
  const placement = async (p, sel = "main.editor") => JSON.parse(await p.getAttribute(sel, "data-placement"));
  const itemOf = (list, id) => list.find((x) => x[0] === id);
  const issueText = async (p) => p.textContent("[data-testid=check-issues]");

  // 공간 만들기 마법사
  const makeSpace = async (p, o) => {
    await p.goto(B + "/spaces/new");
    await p.click(`label.intake-option:has(input[value=${o.intake ?? "dims"}])`);
    await p.click("[data-testid=wizard-next]");
    if (o.shape === "other") return;
    await p.fill("[data-testid=room-width]", String(o.w));
    await p.fill("[data-testid=room-depth]", String(o.d));
    await p.selectOption("[data-testid=ent-side]", o.entSide ?? "right");
    await p.fill("[data-testid=ent-off]", String(o.entOff ?? 800));
    await p.fill("[data-testid=ent-width]", String(o.entW ?? 1200));
    if (o.windows) {
      await p.click("[data-testid=win-list]");
      for (let i = 0; i < o.windows.length; i++) {
        if (i > 0) await p.click("[data-testid=add-window]");
        await p.locator(`[data-testid=win-row-${i}] select`).selectOption(o.windows[i].wall);
        await p.fill(`[data-testid=win-at-${i}]`, String(o.windows[i].at));
        await p.fill(`[data-testid=win-width-${i}]`, String(o.windows[i].width));
      }
    } else if (o.noWindows) await p.click("[data-testid=win-none]");
    for (let i = 0; i < (o.pillars ?? []).length; i++) {
      await p.click("[data-testid=add-pillar]");
      const q = o.pillars[i];
      await p.fill(`[data-testid=pillar-x-${i}]`, String(q.x));
      await p.fill(`[data-testid=pillar-y-${i}]`, String(q.y));
      await p.fill(`[data-testid=pillar-w-${i}]`, String(q.w));
      await p.fill(`[data-testid=pillar-d-${i}]`, String(q.d));
    }
    if (o.before) await o.before();
    await p.click("[data-testid=wizard-next]");
    await p.fill("input[name=title]", o.title);
    await p.fill("[data-testid=staff]", String(o.staff));
    await p.selectOption("select[name=priority]", o.priority ?? "collab");
    await p.click("[data-testid=wizard-submit]");
    await p.waitForURL(/\/projects\/\d+\/editor/);
    await p.waitForSelector("main.editor");
    return Number(p.url().match(/projects\/(\d+)/)[1]);
  };

  // ── 가입
  const c = await ctx();
  const EMAIL = `r8c_${T}@test.kr`;
  await c.goto(B + "/signup"); await c.fill("input[name=email]", EMAIL); await c.fill("input[name=password]", "testpass1"); await c.fill("input[name=name]", "팔차고객"); await c.check("input[name=consent]"); await c.click('button:has-text("가입하기")'); await c.waitForURL(/\/projects/);
  check("빈 내 공간 목록 · 만들기 버튼", (await c.textContent("main")).includes("아직 만든 공간이 없어요") && (await c.locator("[data-testid=new-space]").count()) === 1);

  group("1. 서로 다른 치수로 만들면 그 치수대로 공간이 생긴다");
  // 사진만·자료 없음은 3D를 만들지 않는다
  await c.goto(B + "/spaces/new"); await c.click("label.intake-option:has(input[value=photos])");
  check("사진만: 3D 대신 상담 요청 안내", (await c.locator("[data-testid=no-dims-guide]").count()) === 1);
  await c.click("[data-testid=wizard-next]");
  check("사진만: 다음 단계로 넘어가지 않음", (await c.textContent("[data-testid=wizard-error]")).includes("치수나 도면"));
  // 직사각형이 아닌 모양
  await makeSpace(c, { shape: "other" });
  await c.click("[data-testid=shape-other]");
  check("ㄱ자: 직사각형으로 바꾸지 않고 제한·다음 방법 안내", (await c.textContent("[data-testid=shape-limit]")).includes("바꾸지 않고") && (await c.locator('[data-testid=shape-limit] a:has-text("상담 요청")').count()) === 1);
  await c.click("[data-testid=wizard-next]");
  check("ㄱ자: 다음 단계로 넘어가지 않음", (await c.textContent("[data-testid=wizard-error]")).includes("직사각형"));

  // A: 11 × 9 m, 오른쪽 출입문, 안쪽 창 2개, 기둥 1개
  let previewOk = false;
  const pidA = await makeSpace(c, {
    title: "성수 11×9 사무실", w: 11000, d: 9000, entOff: 800, entW: 1200, staff: 10,
    windows: [{ wall: "rear", at: 450, width: 2400 }, { wall: "rear", at: 3850, width: 3300 }],
    pillars: [{ x: 3100, y: 3700, w: 500, d: 500 }],
    before: async () => { previewOk = (await c.locator("[data-testid=room-preview] svg").count()) === 1 && (await c.textContent("[data-testid=room-area]")).includes("99.0㎡"); },
  });
  check("미리보기: 넣은 치수로 평면과 면적(99.0㎡)", previewOk);
  const roomA = JSON.parse(sql(`select room from versions where project_id=${pidA}`));
  check("A: 저장된 실제 구조 = 입력값", roomA.width === 11 && roomA.depth === 9 && near(roomA.entrance.at, 9) && roomA.entrance.width === 1.2 && roomA.windows.length === 2 && roomA.pillars[0].x === 3.1 && roomA.pillars[0].w === 0.5, JSON.stringify(roomA));
  check("A: 공사 요청 없이 만들어짐", sql(`select status || '|' || coalesce(requested_version_id,'') from projects where id=${pidA}`) === "draft|");
  check("A: 편집 화면 평면 = 11 × 9 m", (await c.getAttribute("[data-testid=editor-plan]", "viewBox")) === "-0.75 -0.75 12.5 10.85");
  check("A: 시작 배치 = 직원 협업(우선순위)", (await c.getAttribute("main.editor", "data-start")) === "collab");
  check("A: 기둥 겹침이 검사에 표시", (await issueText(c)).includes("기둥과 겹쳐요"));

  // B: 7 × 12 m, 왼쪽 출입문, 창 없음, 기둥 없음
  const c2 = await ctx();
  await login(c2, EMAIL, "testpass1");
  const pidB = await makeSpace(c2, { title: "좁고 긴 7×12", w: 7000, d: 12000, entSide: "left", entOff: 500, entW: 900, staff: 4, noWindows: true });
  const roomB = JSON.parse(sql(`select room from versions where project_id=${pidB}`));
  check("B: 저장된 실제 구조 = 7 × 12, 왼쪽 출입문 500·폭 900, 창 없음", roomB.width === 7 && roomB.depth === 12 && near(roomB.entrance.at, 0.5) && near(roomB.entrance.width, 0.9) && Array.isArray(roomB.windows) && roomB.windows.length === 0, JSON.stringify(roomB));
  check("B: 편집 화면 평면 = 7 × 12 m", (await c2.getAttribute("[data-testid=editor-plan]", "viewBox")) === "-0.75 -0.75 8.5 13.85");
  await c2.click("[data-testid=view-3d]"); await c2.waitForFunction(() => document.querySelector("canvas[data-viewer]")?.__viewer, null, { timeout: 20000 });
  const dimsB = await c2.evaluate(() => { const o = document.querySelector("canvas[data-viewer]").__viewer.option; const ent = o.objects.filter((x) => x.kind === "outer" && x.name.startsWith("전면")); return { W: o.W, D: o.D, gapStart: Math.min(...ent.filter((x) => x.x > 0.01).map((x) => x.x)), wins: o.objects.filter((x) => x.kind === "window").length }; });
  check("B: 3D도 7 × 12, 출입문 자리(0.5~1.4m)가 비어 있고 창 없음", dimsB.W === 7 && dimsB.D === 12 && near(dimsB.gapStart, 1.4) && dimsB.wins === 0, JSON.stringify(dimsB));

  // C: 출입문이 가운데 → 자동 배치 대신 빈 공간에서 시작
  const c3 = await ctx(); await login(c3, EMAIL, "testpass1");
  let limitShown = false;
  const pidC = await makeSpace(c3, { title: "가운데 출입문", w: 11000, d: 9000, entSide: "left", entOff: 5000, entW: 1200, staff: 6, before: async () => { limitShown = (await c3.locator("[data-testid=entrance-limit]").count()) === 1; } });
  check("C: 가운데 출입문 제한 안내(마법사)", limitShown);
  check("C: 자동 배치 없이 빈 공간에서 시작 + 이유", (await c3.getAttribute("main.editor", "data-start")) === "" && (await c3.textContent("[data-testid=no-auto]")).includes("현재 자동 배치 지원 범위: 출입문이 가까운 모서리에서 2,500mm 이내"));
  check("C: 출입문은 입력한 위치(5~6.2m)로 저장", near(JSON.parse(sql(`select room from versions where project_id=${pidC}`)).entrance.at, 5));
  await c3.click("[data-testid=add-desk]");
  check("C: 빈 공간에 업무석 추가", (await placement(c3)).length === 1);

  group("2. 가구 편집이 평면과 3D에 똑같이 반영된다");
  const p0 = await placement(c);
  const pillarIssue = (await issueText(c)).match(/(업무석 \d+)이 기둥과 겹쳐요/)?.[1];
  // 끌어서 옮기기(마우스) → 되돌리기
  const dragId = p0.find((x) => x[0].startsWith("desk-"))[0];
  const box = await c.locator(`[data-testid=item-${dragId}]`).boundingBox();
  const scale = await c.$eval("[data-testid=editor-plan]", (svg) => svg.getScreenCTM().a);
  await c.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await c.mouse.down();
  for (let i = 1; i <= 8; i++) await c.mouse.move(box.x + box.width / 2 + (0.5 * scale * i) / 8, box.y + box.height / 2);
  await c.mouse.up();
  const p1 = await placement(c);
  check("끌기: 마우스로 0.5m 오른쪽", near(itemOf(p1, dragId)[1] - itemOf(p0, dragId)[1], 0.5, 0.051), `${itemOf(p0, dragId)} → ${itemOf(p1, dragId)}`);
  await c.click("[data-testid=editor-undo]");
  check("되돌리기: 끌기 전 위치", near(itemOf(await placement(c), dragId)[1], itemOf(p0, dragId)[1]));
  // 기둥과 겹친 업무석: 이슈를 눌러 고르고 삭제, 새 업무석 추가
  await c.locator(`[data-testid=check-issues] button:has-text("${pillarIssue}이 기둥과 겹쳐요")`).locator("visible=true").first().click();
  const pillarId = await c.getAttribute("main.editor", "data-selected");
  check("검사 항목을 누르면 그 가구가 골라짐", pillarId.startsWith("desk-") && (await c.textContent("[data-testid=selection]")).includes(pillarIssue));
  await c.click("[data-testid=delete]");
  check("삭제 후 업무석 1석 부족 경고", (await issueText(c)).includes("1석 부족"));
  await c.click("[data-testid=add-desk]");
  const p2 = await placement(c);
  const added = p2.find((x) => x[0].startsWith("n"));
  check("추가: 빈자리에 업무석, 기둥·부족 경고 사라짐", !!added && !(await issueText(c)).includes("기둥과 겹쳐요") && !(await issueText(c)).includes("부족"));
  // 협업 테이블 180° 돌리기, 숫자로 화분 위치 넣기
  await c.click("[data-testid=item-collab-table]", { force: true }); await c.click("[data-testid=rotate]"); await c.click("[data-testid=rotate]");
  const plant = p2.find((x) => x[0].startsWith("plant"))[0];
  await c.click(`[data-testid=item-${plant}]`, { force: true });
  await c.fill("[data-testid=pos-y]", "1500"); await c.press("[data-testid=pos-y]", "Enter");
  const p3 = await placement(c);
  check("회전: 협업 테이블 180°", itemOf(p3, "collab-table")[3] === 180);
  check("숫자 입력: 화분이 앞벽에서 1,500mm", near(itemOf(p3, plant)[2] - 0.175, 1.5, 0.002), String(itemOf(p3, plant)));
  // 3D가 같은 데이터인지: 3D 장면의 가구 부품 위치 = 평면 편집 상태
  await c.click("[data-testid=view-3d]"); await c.waitForFunction(() => document.querySelector("canvas[data-viewer]")?.__viewer, null, { timeout: 20000 });
  const same3d = await c.evaluate(([ids]) => {
    const o = document.querySelector("canvas[data-viewer]").__viewer.option;
    const plan = JSON.parse(document.querySelector("main.editor").dataset.placement);
    return ids.every((id) => {
      const parts = o.objects.filter((x) => x.g === id && x.plan);
      const it = plan.find((x) => x[0] === id);
      if (!parts.length || !it) return false;
      const cx = (Math.min(...parts.map((p) => p.x)) + Math.max(...parts.map((p) => p.x + p.w))) / 2;
      const cy = (Math.min(...parts.map((p) => p.y)) + Math.max(...parts.map((p) => p.y + p.d))) / 2;
      return Math.abs(cx - it[1]) < 0.002 && Math.abs(cy - it[2]) < 0.002;
    });
  }, [[added[0], "collab-table", plant]]);
  check("3D: 추가·회전·숫자로 옮긴 가구가 평면과 같은 위치", same3d);
  const count3d = await c.evaluate(() => new Set(document.querySelector("canvas[data-viewer]").__viewer.option.objects.filter((x) => x.g).map((x) => x.g)).size);
  check("3D: 가구 묶음 수 = 평면 가구 수", count3d === p3.length, `${count3d} vs ${p3.length}`);
  check("3D: 기둥이 실제 위치에 서 있음", await c.evaluate(() => document.querySelector("canvas[data-viewer]").__viewer.option.objects.some((x) => x.kind === "pillar" && x.x === 3.1 && x.y === 3.7 && x.h > 2)));
  await c.click("[data-testid=view-plan]");

  group("3. 저장 후 다시 열어도 배치가 그대로");
  await c.click("[data-testid=editor-save]"); await c.waitForURL(/saved=2/);
  const v2 = Number(c.url().match(/v=(\d+)/)[1]);
  const saved2 = JSON.parse(sql(`select placement from versions where id=${v2}`)).items.map((it) => [it.id, it.x, it.y, it.rot]);
  check("저장: 새 버전 2 (직접 수정, 버전 1 기준)", sql(`select no || '|' || source || '|' || (base_version_id = (select id from versions where project_id=${pidA} and no=1)) from versions where id=${v2}`) === "2|edited|1");
  check("저장: DB 배치 = 화면 배치", JSON.stringify(saved2) === JSON.stringify(p3));
  check("저장: 바뀐 점 요약 기록", sql(`select note from versions where id=${v2}`).includes("회전 1"));
  await c.goto(`${B}/projects/${pidA}/editor`); await c.waitForSelector("main.editor");
  check("다시 열기: 같은 배치 복원", JSON.stringify(await placement(c)) === JSON.stringify(p3));
  await c.reload(); await c.waitForSelector("main.editor");
  check("새로 고침 후에도 같은 배치", JSON.stringify(await placement(c)) === JSON.stringify(p3));
  check("버전 1은 그대로 남음", JSON.stringify(JSON.parse(sql(`select placement from versions where project_id=${pidA} and no=1`)).items.map((it) => [it.id, it.x, it.y, it.rot])) === JSON.stringify(p0));
  await c.goto(`${B}/projects/${pidA}/plan`);
  check("공간·배치 탭: 바뀐 점과 실제/가정 구분 표", (await c.textContent("[data-testid=version-diff]")).includes("회전") && (await c.textContent("[data-testid=space-facts]")).includes("자동 제안") && (await c.textContent("[data-testid=space-facts]")).includes("반영 제한"));
  await c.click("[data-testid=space-plan]");
  check("평면도 범례: 실제 벽 / 제안 칸막이 / 기둥", (await c.textContent("[data-testid=plan-legend]")).includes("제안 칸막이"));

  group("4. 휴대폰에서 선택·이동·회전·되돌리기");
  const m = await ctx({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await login(m, EMAIL, "testpass1");
  await m.goto(`${B}/projects/${pidA}/editor`); await m.waitForSelector("main.editor");
  check("휴대폰: 가로 넘침 없음", (await m.evaluate(() => document.documentElement.scrollWidth)) <= 390);
  check("휴대폰: 하단 메뉴 숨김(편집 도구와 겹치지 않음)", (await m.locator("nav.mobile-navigation").count()) === 0);
  const mp0 = await placement(m);
  const mid = "whiteboard";
  const wb = await m.locator(`[data-testid=item-${mid}]`).boundingBox();
  await m.tap(`[data-testid=item-${mid}]`, { position: { x: wb.width / 2, y: wb.height / 2 }, force: true });
  check("휴대폰: 눌러서 고르기 → 아래 조작판", (await m.getAttribute("main.editor", "data-selected")) === mid && (await m.locator(".editor-sheet.is-open [data-testid=move-right]").isVisible()));
  check("휴대폰: 처음 누르기는 고르기만(위치 그대로)", JSON.stringify(await placement(m)) === JSON.stringify(mp0));
  for (let i = 0; i < 3; i++) await m.tap("[data-testid=move-right]");
  await m.tap("[data-testid=move-up]");
  let mp1 = await placement(m);
  check("휴대폰: 화살표 버튼 → 오른쪽 300mm, 안쪽 100mm", near(itemOf(mp1, mid)[1] - itemOf(mp0, mid)[1], 0.3) && near(itemOf(mp1, mid)[2] - itemOf(mp0, mid)[2], 0.1));
  await m.tap("[data-testid=rotate]");
  check("휴대폰: 90° 돌리기", itemOf(await placement(m), mid)[3] === 270);
  await m.tap("[data-testid=editor-undo]");
  check("휴대폰: 되돌리기 → 회전 취소", itemOf(await placement(m), mid)[3] === 0 && near(itemOf(await placement(m), mid)[1], itemOf(mp1, mid)[1]));
  await m.tap("[data-testid=editor-redo]");
  check("휴대폰: 다시 하기 → 회전", itemOf(await placement(m), mid)[3] === 270);
  // 고른 가구를 다시 눌러 끌기(터치)
  const before = itemOf(await placement(m), mid);
  const wb2 = await m.locator(`[data-testid=item-${mid}]`).boundingBox();
  const mscale = await m.$eval("[data-testid=editor-plan]", (svg) => svg.getScreenCTM().a);
  await m.evaluate(([sx, sy, dx]) => {
    const svg = document.querySelector("[data-testid=editor-plan]");
    const target = document.elementFromPoint(sx, sy);
    const ev = (t, x, el) => el.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: x, clientY: sy, pointerId: 11, pointerType: "touch", isPrimary: true }));
    ev("pointerdown", sx, target);
    for (let i = 1; i <= 6; i++) ev("pointermove", sx + (dx * i) / 6, svg);
    ev("pointerup", sx + dx, svg);
  }, [wb2.x + wb2.width / 2, wb2.y + wb2.height / 2, -0.4 * mscale]);
  check("휴대폰: 고른 가구를 손가락으로 끌기", near(itemOf(await placement(m), mid)[1] - before[1], -0.4, 0.051), `${before} → ${itemOf(await placement(m), mid)}`);
  const sheet = await m.locator(".editor-sheet.is-open").boundingBox();
  check("휴대폰: 조작판이 화면 아래 안에 있음", sheet && sheet.y + sheet.height <= 844 + 1 && sheet.y > 300);
  await m.tap("[data-testid=editor-save]"); await m.waitForURL(/saved=3/);
  const mpSaved = await placement(m);
  await m.reload(); await m.waitForSelector("main.editor");
  check("휴대폰: 저장 후 새로 고침해도 같은 배치(버전 3)", JSON.stringify(await placement(m)) === JSON.stringify(mpSaved) && itemOf(mpSaved, mid)[3] === 270);
  await m.goto(B + "/spaces/new");
  check("휴대폰: 공간 만들기 가로 넘침 없음", (await m.evaluate(() => document.documentElement.scrollWidth)) <= 390);

  group("5. 업체가 고객이 고른 정확한 배치를 받는다");
  // 버전 2를 골라 요청(지금 배치는 버전 3) — 원하는 저장본을 고를 수 있다
  await c.goto(`${B}/projects/${pidA}`);
  check("요청 전: 다음 할 일 = 시공 제안 요청", (await c.textContent("[data-testid=next-title]")).includes("원할 때 시공 제안을 요청"));
  await c.click("[data-testid=next-cta]"); await c.waitForURL(/\/request$/);
  await c.click("[data-testid=basis-2]");
  await c.fill("[data-testid=req-region]", "서울 성동구"); await c.fill("input[name=budgetMin]", "4000"); await c.fill("input[name=budgetMax]", "6000");
  await c.click("[data-testid=req-send]"); await c.waitForURL(new RegExp(`/projects/${pidA}$`));
  const r1 = JSON.parse(sql(`select snapshot from request_revisions where project_id=${pidA} and no=1`));
  check("요청: r1 기준 = 버전 2(고른 저장본)", r1.version.no === 2 && sql(`select requested_version_id from projects where id=${pidA}`) === String(v2));
  check("요청: r1에 실제 구조와 가구 위치 전체를 고정", JSON.stringify(r1.layout.items.map((it) => [it.id, it.x, it.y, it.rot])) === JSON.stringify(p3) && r1.layout.room.width === 11 && r1.layout.room.pillars.length === 1);
  const admin = await ctx(); await login(admin, "admin@demo.kr");
  await admin.goto(`${B}/admin/projects/${pidA}`);
  for (const v of ["[예시] 스튜디오 온결", "[예시] 모아공간"]) await admin.locator(`label:has-text("${v}") input[name=vendor]`).check();
  await admin.click('button:has-text("선택한 업체 배정")'); await admin.waitForSelector("text=업체 2곳을 배정했습니다");
  const vendorReq = async (email) => {
    const v = await ctx(); await login(v, email);
    const aid = sql(`select a.id from assignments a join vendors x on x.id=a.vendor_id join users u on u.id=x.user_id where a.project_id=${pidA} and u.email='${email}'`);
    await v.goto(`${B}/vendor/requests/${aid}`);
    return { v, aid };
  };
  const { v: v1, aid: a1 } = await vendorReq("vendor1@demo.kr");
  const sent1 = JSON.parse(await v1.getAttribute("[data-testid=sent-layout]", "data-placement"));
  check("업체 A: 받은 배치 = 고객이 고른 버전 2 그대로", JSON.stringify(sent1) === JSON.stringify(p3));
  check("업체 A: 공간 이름·상세 주소 없음", !(await v1.textContent("main")).includes("성수 11×9 사무실"));
  await v1.locator('aside button:has-text("참여하기")').click(); await v1.waitForSelector("#proposal select[name=vat]");
  check("업체 A: 설계 제안 칸", (await v1.locator("[data-testid=design-fields]").count()) === 1);
  for (const k of KEYS) { await v1.selectOption(`select[name=status_${k}]`, "included"); await v1.fill(`input[name=amount_${k}]`, "1000000"); }
  await v1.selectOption("select[name=vat]", "1"); await v1.fill("input[name=durationDays]", "21"); await v1.fill("input[name=startAvailable]", "2026-11-16"); await v1.fill("textarea[name=extraConditions]", "없음");
  await v1.click('#proposal button:text-is("제안 제출")');
  check("업체 A: 설계 제안 고르지 않으면 제출 안 됨", (await v1.locator("#proposal p[role=alert]").textContent()).includes("설계 제안"));
  await v1.click("label:has([data-testid=design-as_is])"); await v1.click('#proposal button:text-is("제안 제출")'); await v1.waitForSelector("text=제안을 제출했습니다");
  const { v: v2p, aid: a2 } = await vendorReq("vendor2@demo.kr");
  check("업체 B: 같은 배치를 받음", (await v2p.getAttribute("[data-testid=sent-layout]", "data-placement")) === JSON.stringify(p3));
  await v2p.locator('aside button:has-text("참여하기")').click(); await v2p.waitForSelector("#proposal select[name=vat]");
  for (const k of KEYS) { await v2p.selectOption(`select[name=status_${k}]`, "included"); await v2p.fill(`input[name=amount_${k}]`, "900000"); }
  await v2p.selectOption("select[name=vat]", "1"); await v2p.fill("input[name=durationDays]", "25"); await v2p.fill("input[name=startAvailable]", "2026-11-20"); await v2p.fill("textarea[name=extraConditions]", "없음");
  await v2p.click("label:has([data-testid=design-proposal])");
  await v2p.fill("[data-testid=design-note]", "협업 테이블을 탕비실 앞쪽으로 옮기면 출입구 앞이 넓어집니다.");
  await v2p.setInputFiles("[data-testid=design-files]", PLAN);
  await v2p.click('#proposal button:text-is("제안 제출")'); await v2p.waitForSelector("text=제안을 제출했습니다");
  const fileB = sql(`select id from files where category='proposal' and project_id=${pidA}`);
  check("업체 B: 수정 제안 첨부 저장", !!fileB && sql(`select design_mode from quotes where assignment_id=${a2}`) === "proposal");
  await v1.goto(`${B}/vendor/requests/${a1}`);
  check("업체 A: 업체 B의 금액·제안이 보이지 않음", !(await v1.textContent("main")).includes("모아공간") && !(await v1.textContent("main")).includes("탕비실 앞쪽으로"));
  const st = async (p, url) => (await p.request.get(url)).status();
  check("첨부: 고객은 열람, 다른 업체(A)는 불가", (await st(c, `${B}/files/${fileB}`)) === 200 && (await st(v1, `${B}/files/${fileB}`)) !== 200);
  check("첨부: 고객 자료 목록·업체 전달 목록에 섞이지 않음", !sql(`select snapshot from request_revisions where project_id=${pidA}`).includes("plan1.jpg"));

  group("6. 같은 요청 기준의 제안끼리 비교한다");
  await c.goto(`${B}/projects/${pidA}/quotes`);
  check("비교: 두 제안 모두 r1 · 배치 버전 2 기준", (await c.textContent("[data-testid=same-basis]")).includes("요청 r1 · 배치 버전 2") && (await c.textContent("[data-testid=same-basis]")).includes("2건"));
  check("비교: 설계 제안 줄(고객 배치대로 / 수정 제안·첨부)", (await c.textContent("[data-testid=design-row]")).includes("고객 배치대로") && (await c.textContent("[data-testid=design-row]")).includes("수정 제안") && (await c.textContent("[data-testid=design-row]")).includes("plan1.jpg"));
  // 요청 뒤 배치 수정: 저장해도 업체 기준은 그대로
  await c.goto(`${B}/projects/${pidA}/editor`); await c.waitForSelector("main.editor");
  await c.click(`[data-testid=item-${plant}]`, { force: true }); await c.fill("[data-testid=pos-x]", "600"); await c.press("[data-testid=pos-x]", "Enter");
  await c.click("[data-testid=editor-save]"); await c.waitForURL(/saved=4/);
  const p4 = await placement(c);
  await v1.goto(`${B}/vendor/requests/${a1}`);
  check("요청 뒤 저장: 업체 A는 여전히 버전 2 배치(변경 내용 보내기 전)", (await v1.getAttribute("[data-testid=sent-layout]", "data-placement")) === JSON.stringify(p3));
  await c.goto(`${B}/projects/${pidA}`);
  const pend = await c.textContent("[data-testid=pending-changes]");
  check("내 공간: 보낸 배치와 달라진 내용 표시(가구 배치 포함)", pend.includes("기준 배치: 버전 2") && pend.includes("가구 배치"), pend.slice(0, 200));
  await c.click("[data-testid=send-update]"); await c.waitForSelector("[data-testid=pending-changes]", { state: "detached" });
  const r2 = JSON.parse(sql(`select snapshot from request_revisions where project_id=${pidA} and no=2`));
  check("변경 내용 보내기: r2 = 버전 4 배치", r2.version.no === 4 && JSON.stringify(r2.layout.items.map((it) => [it.id, it.x, it.y, it.rot])) === JSON.stringify(p4));
  check("같은 업체가 새 기준으로 이어서(재배정 없음)", sql(`select count(*) from assignments where project_id=${pidA} and version_id=(select requested_version_id from projects where id=${pidA}) and withdrawn_at is null`) === "2");
  await v1.goto(`${B}/vendor/requests/${a1}`);
  check("업체 A: 이제 버전 4 배치 + 바뀐 점 + 이전 기준 제안 안내", (await v1.getAttribute("[data-testid=sent-layout]", "data-placement")) === JSON.stringify(p4) && (await v1.textContent("[data-testid=rev-changes]")).includes("가구 배치") && (await v1.textContent("main")).includes("이전 요청 내용 기준"));
  // P2(사용성 테스트): r2를 보낸 직후 기본 화면은 최신 r2. 제안 0건이면 ‘업체가 변경 내용을 확인 중’
  const v2id = sql(`select id from versions where project_id=${pidA} and no=2`), v4id = sql(`select id from versions where project_id=${pidA} and no=4`);
  const tabBadge = async () => ((await c.locator("nav a:has-text('제안 비교') span.rounded-full").textContent().catch(() => "")) || "0").trim();
  await c.goto(`${B}/projects/${pidA}/quotes`);
  check("P2 r2 직후: 기본 = 최신 요청 r2 · 제안 0건", (await c.textContent("[data-testid=shown-rev]")).includes("요청 r2 · 최신 · 제안 0건") && (await c.locator("[data-testid=same-basis]").count()) === 0);
  check("P2 r2 직후: ‘업체가 변경 내용을 확인 중입니다’ 안내", (await c.textContent("[data-testid=reconfirming-empty]")).includes("업체가 변경 내용을 확인 중입니다"));
  check("P2 r2 직후: 기준 배치·도면 링크 = r2(배치 버전 4)", (await c.textContent("[data-testid=basis-version]")).includes("배치 버전 4 · 요청 r2 기준") && (await c.getAttribute("[data-testid=basis-plan-link]", "href")).endsWith(`v=${v4id}`));
  check("P2 r2 직후: 이전 견적은 ‘이전 요청 기준 제안 보기 · r1 · 2건’으로 따로", (await c.textContent("[data-testid=prev-rev-1]")).includes("이전 요청 기준 제안 보기 · r1 · 2건"));
  check("P2 r2 직후: 탭 제안 수 0, 지금 할 일 = 업체 확인 중", (await tabBadge()) === "0" && (await c.textContent("[data-testid=next-title]")).includes("업체가 변경 내용을 확인 중입니다"));
  await c.click("[data-testid=prev-rev-1]"); await c.waitForURL(/r=1/);
  check("P2 이전 요청 보기: r1 · 제안 2건, 기준 배치 버전 2·도면 링크 r1", (await c.textContent("[data-testid=shown-rev]")).includes("요청 r1 · 이전 요청 · 제안 2건") && (await c.textContent("[data-testid=same-basis]")).includes("요청 r1 · 배치 버전 2") && (await c.textContent("[data-testid=basis-version]")).includes("배치 버전 2 · 요청 r1 기준") && (await c.getAttribute("[data-testid=basis-plan-link]", "href")).endsWith(`v=${v2id}`));
  check("P2 이전 요청 보기: 최신으로 돌아가기", (await c.locator("[data-testid=back-latest]").count()) === 1);
  await v1.click('button:has-text("확인했고 제안은 그대로 유지")');
  await until(() => sql(`select count(*) from quotes q join request_revisions r on r.id=q.request_rev_id where q.assignment_id=${a1} and r.no=2`) === "1");
  await c.goto(`${B}/projects/${pidA}/quotes`);
  const basisText = await c.textContent("[data-testid=same-basis]");
  check("P2 업체 1곳 재확인: r2 기준 1건(r1과 섞지 않음)", (await c.textContent("[data-testid=shown-rev]")).includes("제안 1건") && basisText.includes("요청 r2 · 배치 버전 4") && basisText.includes("1건") && (await c.locator("ul > li:has-text('[예시] 모아공간')").count()) === 0, basisText);
  check("P2 업체 1곳 재확인: 탭 1, 이전 요청 r1에 1건 남음", (await tabBadge()) === "1" && (await c.textContent("[data-testid=prev-rev-1]")).includes("r1 · 1건") && (await c.textContent("[data-testid=reconfirming-note]")).includes("1건"));
  await v2p.goto(`${B}/vendor/requests/${a2}`);
  await v2p.click('button:has-text("확인했고 제안은 그대로 유지")');
  await until(() => sql(`select count(*) from quotes q join request_revisions r on r.id=q.request_rev_id where q.assignment_id=${a2} and r.no=2`) === "1");
  await c.goto(`${B}/projects/${pidA}/quotes`);
  check("P2 두 업체 재확인: r2 기준 2건, 탭 2", (await c.textContent("[data-testid=shown-rev]")).includes("요청 r2 · 최신 · 제안 2건") && (await c.textContent("[data-testid=same-basis]")).includes("2건") && (await tabBadge()) === "2");
  await c.click("[data-testid=prev-rev-1]"); await c.waitForURL(/r=1/);
  check("P2 r1 기록은 따로 열람(배치 버전 2 기준, 남은 제안 0건)", (await c.textContent("[data-testid=shown-rev]")).includes("요청 r1 · 이전 요청 · 제안 0건") && (await c.textContent("[data-testid=basis-version]")).includes("배치 버전 2 · 요청 r1 기준"));
  group("공통");
}, { pageErrors: "브라우저 오류 없음" });
