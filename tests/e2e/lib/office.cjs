// 사무실 흐름 공용 도우미(예전 t8.cjs): 실제 치수로 내 공간 만들기 → 시공 제안 요청, 업체 제안서의 설계 제안
// 원본은 tests/e2e/legacy/t8.cjs(2026-10-02). 동작은 그대로이고 견적 항목 키(KEYS)만 더했다.

/** 사무실 견적서 13항목(제안서 select[name=status_<키>] 순서) */
exports.KEYS = ["demolition", "partition", "floor", "ceiling", "electric", "network", "hvac", "fire", "finish", "plumbing", "door", "furniture", "etc"];

/** 공간 만들기 마법사(치수). 만든 프로젝트 번호를 돌려준다. skipGoto면 이미 열린 /spaces/new에서 시작 */
exports.makeSpace = async (p, B, o) => {
  if (!o.skipGoto) await p.goto(B + "/spaces/new");
  await p.click(`label.intake-option:has(input[value=${o.intake ?? "dims"}])`);
  if (o.drawing) await p.setInputFiles("input[name=drawings]", o.drawing);
  await p.click("[data-testid=wizard-next]");
  await p.fill("[data-testid=room-width]", String(o.w));
  await p.fill("[data-testid=room-depth]", String(o.d));
  await p.selectOption("[data-testid=ent-side]", o.entSide ?? "right");
  await p.fill("[data-testid=ent-off]", String(o.entOff ?? 800));
  await p.fill("[data-testid=ent-width]", String(o.entW ?? 1200));
  if (o.rearWindows) {
    await p.click("[data-testid=win-list]");
    await p.fill("[data-testid=win-at-0]", "450");
    await p.fill("[data-testid=win-width-0]", String(Math.round(o.w - 900)));
  }
  await p.click("[data-testid=wizard-next]");
  await p.fill("input[name=title]", o.title);
  await p.fill("[data-testid=staff]", String(o.staff ?? 8));
  if (o.priority) await p.selectOption("select[name=priority]", o.priority);
  if (o.meetingSeats) await p.selectOption("select[name=meetingSeats]", String(o.meetingSeats));
  for (const [k, on] of Object.entries(o.rooms ?? {})) {
    const box = p.locator(`input[name=${k}]`);
    if ((await box.isChecked()) !== on) await box.click();
  }
  await p.click("[data-testid=wizard-submit]");
  await p.waitForURL(/\/projects\/\d+\/editor/);
  await p.waitForSelector("main.editor");
  return Number(p.url().match(/projects\/(\d+)/)[1]);
};

/** 저장한 배치로 시공 제안 요청. send=false면 저장만 */
exports.requestSpace = async (p, B, pid, o = {}) => {
  await p.goto(`${B}/projects/${pid}/request`);
  await p.fill("[data-testid=req-region]", o.region ?? "서울 성동구");
  if (o.address != null) await p.fill("input[name=address]", o.address);
  if (o.budgetMin != null) await p.fill("input[name=budgetMin]", String(o.budgetMin));
  if (o.budgetMax != null) await p.fill("input[name=budgetMax]", String(o.budgetMax));
  if (o.workScope) await p.fill("textarea[name=workScope]", o.workScope);
  if (o.notes) await p.fill("textarea[name=notes]", o.notes);
  if (o.photo) await p.setInputFiles("input[name=photos]", o.photo);
  if (o.refs) for (const id of o.refs) await p.check(`input[name=refCase][value="${id}"]`);
  if (o.furniture === false) await p.uncheck("input[name=furnitureIncluded]");
  await p.click(o.send === false ? "[data-testid=req-save]" : "[data-testid=req-send]");
  await p.waitForURL(new RegExp(`/projects/${pid}$`));
};

/** 업체 제안서의 설계 제안(고객 배치대로) */
exports.designAsIs = async (p) => {
  if (await p.locator("[data-testid=design-as_is]").count()) await p.click("label:has([data-testid=design-as_is])");
};

/** 업체 계정(email)이 이 프로젝트에서 받은 배정 번호 */
exports.assignmentOf = (sql, pid, email) =>
  sql(`select a.id from assignments a join vendors x on x.id=a.vendor_id join users u on u.id=x.user_id where a.project_id=${pid} and u.email='${email}'`);
