import { Badge, Empty, Page, PageTitle } from "@/components/ui";
import { retryEmailDelivery } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { kst } from "@/lib/constants";
import { appUrl, emailProvider, getOutbox } from "@/lib/mailer";

export const metadata = { title: "메일 발송 기록" };

const LABEL = { queued: "보내는 중", sent: "보냄", failed: "실패", logged: "기록만(발송 설정 없음)" } as const;

export default async function Emails() {
  await requireUser("admin");
  const rows = getOutbox(100);
  const logOnly = emailProvider() !== "resend";
  return (
    <Page>
      <PageTitle
        title="메일 발송 기록"
        sub={emailProvider() === "resend" ? "Resend로 발송합니다. 실패한 메일은 다시 보낼 수 있습니다." : "발송 설정이 없어 기록만 남기고 있습니다. 운영 환경 변수에 RESEND_API_KEY와 MAIL_FROM을 넣으면 실제로 보냅니다."}
        actions={
          <form action={retryEmailDelivery}>
            <button className="btn">실패한 메일 다시 보내기</button>
          </form>
        }
      />
      {rows.length === 0 ? (
        <Empty>보낸 메일이 없습니다.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="table-base min-w-[760px]">
            <thead>
              <tr>
                <th>시각</th>
                <th>받는 사람</th>
                <th>제목</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-xs text-muted">{kst(r.created_at)}</td>
                  <td className="text-xs">{r.to_email}</td>
                  <td>
                    {r.subject}
                    {r.body && <span className="block text-xs text-muted">{r.body.slice(0, 80)}</span>}
                    {/* 발송 설정이 없으면 메일이 가지 않는다. 대면 테스트에서는 운영자가 이 링크를 받는 분에게 직접 열어 준다. */}
                    {logOnly && r.status === "logged" && r.link && (
                      <span className="mt-1 block text-xs" data-testid="email-link">
                        <span className="text-muted">메일이 가지 않았어요. 받는 분에게 직접 열어 주세요: </span>
                        <span className="select-all break-all font-mono text-ink">{appUrl()}{r.link}</span>
                      </span>
                    )}
                  </td>
                  <td>
                    <Badge tone={r.status === "sent" ? "brand" : r.status === "failed" ? "warn" : "plain"}>{LABEL[r.status]}</Badge>
                    {r.error && <span className="block text-xs text-danger">{r.error.slice(0, 120)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}
