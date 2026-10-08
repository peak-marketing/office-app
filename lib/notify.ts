import { all, get, run } from "./db";
import { queueEmail } from "./mailer";

// 알림: 서비스 안 알림함에 쌓고, email이 true면 같은 내용을 이메일로도 보낸다.
// 시공사에게 가는 알림에는 프로젝트 이름, 상세 주소, 연락처를 넣지 않는다.

export interface NotifyInput {
  projectId?: number | null;
  title: string;
  body?: string;
  /** 눌렀을 때 갈 화면 */
  href: string;
  /** 이메일로도 보낼지. 놓치면 안 되는 일에만 쓴다. */
  email?: boolean;
}

export function notify(userIds: (number | null | undefined)[], n: NotifyInput) {
  for (const id of new Set(userIds.filter((x): x is number => typeof x === "number"))) {
    run(`INSERT INTO notifications (user_id, project_id, title, body, href) VALUES (?, ?, ?, ?, ?)`, id, n.projectId ?? null, n.title, n.body ?? "", n.href);
    if (n.email) {
      const user = get<{ email: string }>(`SELECT email FROM users WHERE id = ?`, id);
      if (user) queueEmail({ userId: id, to: user.email, subject: n.title, body: n.body, link: n.href });
    }
  }
}

export const adminIds = () => all<{ id: number }>(`SELECT id FROM users WHERE role = 'admin'`).map((u) => u.id);
export const vendorUserId = (vendorId: number) => get<{ user_id: number }>(`SELECT user_id FROM vendors WHERE id = ?`, vendorId)?.user_id;
