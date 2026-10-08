import { all, get, run } from "./db";

// 외부 알림 채널: 이메일. 보낼 메일은 email_outbox에 먼저 쌓고 바로 발송을 시도한다.
// EMAIL_PROVIDER=resend 와 RESEND_API_KEY, MAIL_FROM이 있으면 Resend로 보내고,
// 없으면 발송하지 않고 기록만 남긴다(status = 'logged'). 운영자 화면의 ‘메일 발송 기록’에서 확인한다.

export const BRAND_NAME = process.env.BRAND_NAME || "오피스매칭";

export const appUrl = () => (process.env.APP_URL || "http://localhost:3100").replace(/\/$/, "");

export const emailProvider = () => (process.env.EMAIL_PROVIDER === "resend" || (!process.env.EMAIL_PROVIDER && process.env.RESEND_API_KEY) ? "resend" : "log");

export interface OutboxRow {
  id: number;
  user_id: number | null;
  to_email: string;
  subject: string;
  body: string;
  link: string;
  status: "queued" | "sent" | "failed" | "logged";
  error: string;
  attempts: number;
  created_at: string;
  sent_at: string | null;
}

const escape = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function render(row: OutboxRow) {
  const url = row.link ? `${appUrl()}${row.link}` : appUrl();
  const text = `${row.subject}\n\n${row.body ? `${row.body}\n\n` : ""}바로 가기: ${url}\n\n— ${BRAND_NAME}\n진행 중인 요청과 관련해 보내 드리는 알림입니다.`;
  const html = `<div style="font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;font-size:15px;line-height:1.6;color:#22352c;max-width:520px">
<p style="font-size:17px;font-weight:700;margin:0 0 12px">${escape(row.subject)}</p>
${row.body ? `<p style="margin:0 0 18px;white-space:pre-line">${escape(row.body)}</p>` : ""}
<p style="margin:0 0 24px"><a href="${escape(url)}" style="display:inline-block;background:#2f5d46;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">바로 가기</a></p>
<p style="margin:0;color:#6f7a70;font-size:12px">${escape(BRAND_NAME)} · 진행 중인 요청과 관련해 보내 드리는 알림입니다.</p></div>`;
  return { text, html };
}

async function deliver(id: number) {
  const row = get<OutboxRow>(`SELECT * FROM email_outbox WHERE id = ?`, id);
  if (!row || row.status === "sent" || row.status === "logged") return;
  const { text, html } = render(row);
  if (emailProvider() === "log") {
    run(`UPDATE email_outbox SET status = 'logged', attempts = attempts + 1, sent_at = datetime('now') WHERE id = ?`, id);
    if (process.env.NODE_ENV !== "test") console.info(`[메일 기록] ${row.to_email} · ${row.subject}`);
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [row.to_email], subject: `[${BRAND_NAME}] ${row.subject}`, text, html }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
    run(`UPDATE email_outbox SET status = 'sent', error = '', attempts = attempts + 1, sent_at = datetime('now') WHERE id = ?`, id);
  } catch (e) {
    run(`UPDATE email_outbox SET status = 'failed', error = ?, attempts = attempts + 1 WHERE id = ?`, String((e as Error).message).slice(0, 500), id);
  }
}

/** 메일을 쌓고 바로 보낸다. 발송 실패는 요청 처리를 막지 않는다. */
export function queueEmail(m: { userId?: number | null; to: string; subject: string; body?: string; link?: string }) {
  if (!m.to) return;
  const id = run(`INSERT INTO email_outbox (user_id, to_email, subject, body, link) VALUES (?, ?, ?, ?, ?)`, m.userId ?? null, m.to, m.subject, m.body ?? "", m.link ?? "");
  void deliver(id);
}

/** 실패했거나 대기 중인 메일을 다시 보낸다. */
export async function retryEmails() {
  const rows = all<{ id: number }>(`SELECT id FROM email_outbox WHERE status IN ('failed','queued') AND attempts < 5 ORDER BY id LIMIT 50`);
  for (const r of rows) await deliver(r.id);
  return rows.length;
}

export const getOutbox = (limit = 50) => all<OutboxRow>(`SELECT * FROM email_outbox ORDER BY id DESC LIMIT ?`, limit);
