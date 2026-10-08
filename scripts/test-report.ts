// 테스트 결과 요약: 업체가 받은 자료로 제안했는지, 고객이 제안을 비교·선택했는지를 서비스 기록에서 뽑는다.
//   npm run test:report            운영자가 ‘테스트 요청’으로 표시한 프로젝트만
//   npm run test:report -- --all   시연 데이터를 뺀 모든 프로젝트
// 읽기만 한다. 고객 이름·주소·연락처는 출력하지 않는다(프로젝트 번호와 업체명만).
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DB = process.env.DB_PATH ?? path.join(process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), "data"), "app.db");
const db = new DatabaseSync(DB, { readOnly: true });
const all = <T>(sql: string, ...args: (string | number)[]) => db.prepare(sql).all(...args) as T[];
const one = <T>(sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args) as T | undefined;

const everything = process.argv.includes("--all");
const projects = all<{ id: number; status: string; created_at: string }>(
  everything
    ? `SELECT p.id, p.status, p.created_at FROM projects p JOIN users u ON u.id = p.customer_id WHERE u.is_demo = 0 ORDER BY p.id`
    : `SELECT id, status, created_at FROM projects WHERE is_test = 1 ORDER BY id`,
);

const hours = (a?: string | null, b?: string | null) => (a && b ? Math.round(((Date.parse(b + "Z") - Date.parse(a + "Z")) / 36e5) * 10) / 10 : null);
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");
const DESIGN: Record<string, string> = { as_is: "고객 배치대로", proposal: "수정 제안", "": "없음" };

let quotesTotal = 0, assignedTotal = 0, priced = 0, siteCheck = 0, na = 0, itemsTotal = 0;
const design: Record<string, number> = {};
const lines: string[] = [];

for (const p of projects) {
  const versions = all<{ source: string; room: string | null }>(`SELECT source, room FROM versions WHERE project_id = ? ORDER BY no`, p.id);
  const last = versions.at(-1);
  const room = last?.room ? (JSON.parse(last.room) as { shape?: string; source?: string }) : null;
  const how = room ? (room.source === "trace" ? (room.shape === "polygon" ? "도면 따라 그리기(꺾인 공간)" : "도면 따라 그리기(직사각형)") : "치수 입력") : "예전 요청서";
  const revs = one<{ n: number }>(`SELECT count(*) AS n FROM request_revisions WHERE project_id = ?`, p.id)!.n;
  const info = one<{ n: number }>(`SELECT count(*) AS n FROM info_requests WHERE project_id = ?`, p.id)!.n;
  const visits = one<{ n: number }>(`SELECT count(*) AS n FROM visit_requests WHERE project_id = ?`, p.id)!.n;
  lines.push(`\n■ 프로젝트 ${p.id} · ${how} · 저장 버전 ${versions.length}개(직접 수정 ${versions.filter((v) => v.source === "edited").length}) · 요청 기록 r${revs || "-"} · 자료 요청 ${info}건 · 방문 요청 ${visits}건 · 상태 ${p.status}`);
  const rows = all<{ id: number; company: string; demo: number; status: string; created_at: string; accepted_at: string | null; withdrawn_at: string | null }>(
    `SELECT a.id, v.company, u.is_demo AS demo, a.status, a.created_at, a.accepted_at, a.withdrawn_at FROM assignments a JOIN vendors v ON v.id = a.vendor_id JOIN users u ON u.id = v.user_id WHERE a.project_id = ? ORDER BY a.id`,
    p.id,
  );
  for (const a of rows) {
    assignedTotal++;
    const q = one<{ id: number; items: string; design_mode: string; submitted_at: string; request_rev_id: number | null }>(`SELECT id, items, design_mode, submitted_at, request_rev_id FROM quotes WHERE assignment_id = ?`, a.id);
    const head = `  - ${a.company}${a.demo ? " (예시 업체)" : ""}: 배정 → 참여 확정 ${hours(a.created_at, a.accepted_at) ?? "–"}시간`;
    if (!q) {
      lines.push(`${head} · 제안 없음(${a.withdrawn_at ? "배정 취소" : a.status === "declined" ? "거절" : "작성 전"})`);
      continue;
    }
    quotesTotal++;
    const items = JSON.parse(q.items) as { status: string }[];
    const c = { priced: items.filter((i) => i.status === "included" || i.status === "separate").length, site: items.filter((i) => i.status === "site_check").length, na: items.filter((i) => i.status === "na").length };
    priced += c.priced; siteCheck += c.site; na += c.na; itemsTotal += items.length;
    design[q.design_mode] = (design[q.design_mode] ?? 0) + 1;
    const subs = one<{ n: number }>(`SELECT count(*) AS n FROM quote_revisions WHERE quote_id = ?`, q.id)!.n;
    const rev = q.request_rev_id ? one<{ no: number }>(`SELECT no FROM request_revisions WHERE id = ?`, q.request_rev_id)?.no : null;
    lines.push(`${head} → 제출 ${hours(a.created_at, q.submitted_at) ?? "–"}시간 · 기준 r${rev ?? "-"} · 금액 확정 ${c.priced} / 현장 확인 필요 ${c.site} / 해당 없음 ${c.na} (항목 ${items.length}) · 설계 제안 ${DESIGN[q.design_mode] ?? q.design_mode} · 제출 ${subs}회`);
  }
}

console.log(`테스트 결과 요약 · ${everything ? "시연 데이터 제외 전체" : "테스트 요청으로 표시한 프로젝트"} ${projects.length}건 · ${DB}`);
console.log(lines.join("\n") || "\n(해당 프로젝트 없음 — 운영자 화면에서 ‘테스트 요청으로 표시’했는지 확인하세요)");
console.log(`\n업체 제안: 배정 ${assignedTotal}건 중 제출 ${quotesTotal}건(${pct(quotesTotal, assignedTotal)})`);
console.log(`견적 항목: 금액 확정 ${pct(priced, itemsTotal)} · 현장 확인 필요 ${pct(siteCheck, itemsTotal)} · 해당 없음 ${pct(na, itemsTotal)} (전체 ${itemsTotal}개)`);
console.log(`설계 제안: ${Object.entries(design).map(([k, n]) => `${DESIGN[k] ?? k} ${n}`).join(" · ") || "–"}`);
