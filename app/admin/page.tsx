import Link from "next/link";
import { Badge, Empty, Notice, Page, PageTitle, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { dateKo, kst } from "@/lib/constants";
import type { Project } from "@/lib/data";
import { all, get } from "@/lib/db";
import { emailProvider } from "@/lib/mailer";
import { HOME_TYPES } from "@/lib/home";

type Row = Project & {
  customer: string;
  demo: number;
  layout_status: string | null;
  version_no: number | null;
  intake: string | null;
  home_type: string | null;
  pyeong: number | null;
  assigned: number;
  quotes: number;
  open_changes: number;
  info_answered: number;
  info_open: number;
};

type Late = { id: number; project_id: number; title: string; company: string; accepted_at: string | null; deadline: string; reminded_at: string | null };

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireUser("admin");
  const view = (await searchParams).view === "test" ? "test" : (await searchParams).view === "all" ? "all" : "real";
  const rows = all<Row>(
    `SELECT p.*, u.name AS customer, u.is_demo AS demo,
            v.layout_status, v.no AS version_no, json_extract(v.input, '$.areaPyeong') AS pyeong, json_extract(v.input, '$.intake') AS intake, json_extract(v.input, '$.homeType') AS home_type,
            (SELECT count(*) FROM assignments a WHERE a.project_id = p.id AND a.version_id = p.requested_version_id AND a.withdrawn_at IS NULL AND a.status != 'declined') AS assigned,
            (SELECT count(*) FROM quotes q WHERE q.project_id = p.id AND q.version_id = p.requested_version_id) AS quotes,
            (SELECT count(*) FROM change_requests c WHERE c.project_id = p.id AND c.status = 'open') AS open_changes,
            (SELECT count(*) FROM info_requests i WHERE i.project_id = p.id AND i.status = 'answered') AS info_answered,
            (SELECT count(*) FROM info_requests i WHERE i.project_id = p.id AND i.status = 'open') AS info_open
     FROM projects p JOIN users u ON u.id = p.customer_id
     LEFT JOIN versions v ON v.id = coalesce(p.requested_version_id, p.current_version_id)
     ORDER BY p.updated_at DESC`,
  );
  // 시연 계정의 요청과 운영자가 테스트로 표시한 요청은 실제 요청과 나눠 본다.
  const isTest = (r: Row) => !!r.demo || !!r.is_test;
  const shown = rows.filter((r) => (view === "all" ? true : view === "test" ? isTest(r) : !isTest(r)));
  const open = (r: Row) => !["contracted", "closed"].includes(r.status);
  const todo = shown.filter((r) => open(r) && (r.status === "requested" || r.open_changes > 0 || r.info_answered > 0));
  const rest = shown.filter((r) => !todo.includes(r));
  // 기한 안에 답하지 않은 업체: 참여 여부(배정 후) 또는 제안(참여 확정 후)
  const late = all<Late>(
    `SELECT a.id, a.project_id, p.title, v.company, a.accepted_at, a.reminded_at,
            CASE WHEN a.accepted_at IS NULL THEN a.respond_by ELSE a.quote_by END AS deadline
     FROM assignments a JOIN projects p ON p.id = a.project_id JOIN vendors v ON v.id = a.vendor_id
     WHERE a.status = 'invited' AND a.withdrawn_at IS NULL AND a.version_id = p.requested_version_id
       AND p.status NOT IN ('contracted','closed')
       AND (CASE WHEN a.accepted_at IS NULL THEN a.respond_by ELSE a.quote_by END) < datetime('now')
     ORDER BY deadline`,
  ).filter((l) => shown.some((r) => r.id === l.project_id));
  const failedMail = get<{ n: number }>(`SELECT count(*) AS n FROM email_outbox WHERE status = 'failed'`)!.n;
  const provider = emailProvider();
  const chip = (on: boolean) => `badge px-3 py-1.5 ${on ? "border-ink bg-ink text-white" : "bg-white text-muted hover:text-ink"}`;

  const table = (list: Row[]) => (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="table-base min-w-[820px]">
        <thead>
          <tr>
            <th>프로젝트</th>
            <th>고객</th>
            <th>상태</th>
            <th>자료·도면</th>
            <th>배정 / 견적</th>
            <th>최근 변경</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.id}>
              <td>
                <Link href={`/admin/projects/${r.id}`} className="font-medium underline decoration-line underline-offset-4">
                  {r.title}
                </Link>
                <span className="block text-xs text-muted">
                  {r.kind === "home" ? <Badge tone="brand">집</Badge> : null} {r.region} · {r.kind === "home" ? (HOME_TYPES[r.home_type as keyof typeof HOME_TYPES] ?? "집") : `${r.pyeong}평`}
                </span>
                {isTest(r) && <Badge tone="warn">{r.demo ? "시연" : "테스트"}</Badge>}
              </td>
              <td>{r.customer}</td>
              <td>
                <StatusBadge status={r.status} />
              </td>
              <td>
                <span className="flex flex-wrap gap-1">
                  {r.kind === "home" ? "집 요청" : `v${r.version_no}`}
                  {r.layout_status === "needs_review" && <Badge tone="warn">{r.intake === "photos" ? "사진 상담" : r.intake === "none" ? "자료 없음" : r.intake === "drawing" ? "도면 확인" : "배치 검토"}</Badge>}
                  {r.info_open > 0 && <Badge>자료 요청 중</Badge>}
                  {r.info_answered > 0 && <Badge tone="brand">자료 답변 도착</Badge>}
                  {r.open_changes > 0 && <Badge tone="warn">수정 요청 {r.open_changes}</Badge>}
                </span>
              </td>
              <td className="tabular-nums">
                {r.assigned} / {r.quotes}
              </td>
              <td className="text-xs text-muted">{dateKo(r.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <Page>
      <PageTitle
        title="요청 관리"
        sub="접수된 요청을 검토하고 업체를 배정합니다."
        actions={
          <Link href="/admin/emails" className="btn">
            메일 발송 기록{failedMail > 0 && <Badge tone="warn">실패 {failedMail}</Badge>}
          </Link>
        }
      />
      {provider === "log" && (
        <div className="mb-5">
          <Notice tone="warn" title="메일이 실제로 나가지 않는 상태입니다">
            이메일 발송 설정(RESEND_API_KEY, MAIL_FROM)이 없어 알림 메일을 기록만 하고 있습니다. 서비스 안 알림함은 정상입니다.
          </Notice>
        </div>
      )}
      <div className="mb-5 flex flex-wrap gap-1.5" aria-label="보기">
        <Link href="/admin" className={chip(view === "real")}>
          실제 요청 {rows.filter((r) => !isTest(r)).length}
        </Link>
        <Link href="/admin?view=test" className={chip(view === "test")}>
          시연·테스트 {rows.filter(isTest).length}
        </Link>
        <Link href="/admin?view=all" className={chip(view === "all")}>
          전체 {rows.length}
        </Link>
      </div>

      <h2 className="h-section">기한 안에 답하지 않은 업체 · {late.length}건</h2>
      {late.length === 0 ? (
        <Empty>기한을 넘긴 업체가 없습니다.</Empty>
      ) : (
        <ul className="space-y-2" data-testid="late-list">
          {late.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-danger/30 bg-warn-soft px-4 py-3 text-sm">
              <b>{l.company}</b>
              <span className="text-muted">{l.title}</span>
              <span className="text-xs font-semibold text-danger">
                {l.accepted_at ? "제안 제출" : "참여 답변"} 기한 {kst(l.deadline)} 지남
              </span>
              {l.reminded_at && <span className="text-xs text-muted">재알림 {kst(l.reminded_at)}</span>}
              <Link href={`/admin/projects/${l.project_id}`} className="btn btn-sm ml-auto">
                다시 알리기·재배정
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h2 className="h-section mt-8">처리할 일 · {todo.length}건</h2>
      {todo.length ? table(todo) : <Empty>검토하거나 답변할 요청이 없습니다.</Empty>}
      <h2 className="h-section mt-8">나머지 요청</h2>
      {rest.length ? table(rest) : <Empty>다른 요청이 없습니다.</Empty>}
    </Page>
  );
}
