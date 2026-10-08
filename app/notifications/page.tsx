import { Empty, Page, PageTitle } from "@/components/ui";
import { markAllNotificationsRead, openNotification } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { getNotifications } from "@/lib/data";

export const metadata = { title: "알림" };

const when = (s: string) => `${s.slice(5, 10).replace("-", ".")} ${s.slice(11, 16)}`;

export default async function Notifications() {
  const user = await requireUser();
  const list = getNotifications(user.id);
  const unread = list.filter((n) => !n.read_at).length;
  return (
    <Page narrow>
      <PageTitle
        title="알림"
        sub={unread ? `읽지 않은 알림 ${unread}건` : "새 알림이 없습니다."}
        actions={
          unread > 0 && (
            <form action={markAllNotificationsRead}>
              <button className="btn btn-sm">모두 읽음으로</button>
            </form>
          )
        }
      />
      {list.length === 0 ? (
        <Empty>아직 알림이 없습니다. 요청이 진행되면 여기에 알려 드립니다.</Empty>
      ) : (
        <ul className="space-y-2">
          {list.map((n) => (
            <li key={n.id}>
              <form action={openNotification.bind(null, n.id)}>
                <button className={`block w-full cursor-pointer rounded-xl border p-4 text-left transition hover:border-brand ${n.read_at ? "border-line bg-surface" : "border-brand/40 bg-brand-soft"}`}>
                  <span className="flex items-baseline justify-between gap-3">
                    <b className="text-sm">
                      {!n.read_at && <span className="mr-2 inline-block size-2 rounded-full bg-clay align-middle" aria-label="읽지 않음" />}
                      {n.title}
                    </b>
                    <span className="shrink-0 text-xs tabular-nums text-muted">{when(n.created_at)}</span>
                  </span>
                  {n.body && <span className="mt-1 block text-sm leading-relaxed text-muted">{n.body}</span>}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-xs leading-relaxed text-muted">지금은 서비스 안에서만 알려 드립니다. 메일과 문자 알림은 아직 연결되지 않았습니다.</p>
    </Page>
  );
}
