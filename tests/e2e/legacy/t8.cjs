// 8차 흐름용 테스트 도우미: 실제 치수로 내 공간 만들기 → 시공 제안 요청
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
  for (const [k, on] of Object.entries(o.rooms ?? {})) { const box = p.locator(`input[name=${k}]`); if ((await box.isChecked()) !== on) await box.click(); }
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
exports.designAsIs = async (p) => { if (await p.locator("[data-testid=design-as_is]").count()) await p.click("label:has([data-testid=design-as_is])"); };
