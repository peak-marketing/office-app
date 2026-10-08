import Link from "next/link";
import Icon, { type IconName } from "@/components/Icon";
import { Field, StateForm } from "@/components/forms";
import { Page } from "@/components/ui";
import { logout } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { get } from "@/lib/db";
import { saveNickname } from "@/lib/partner-actions";

export const metadata = { title: "마이페이지" };

/** 마이: 내 활동(글·저장·주문)과 내 공간으로 가는 곳 */
export default async function Me() {
  const user = await requireUser("customer");
  const n = (sql: string) => get<{ n: number }>(sql, user.id)?.n ?? 0;
  const me = get<{ nickname: string }>(`SELECT nickname FROM users WHERE id = ?`, user.id)!;
  const counts = {
    projects: n(`SELECT count(*) AS n FROM projects WHERE customer_id = ?`),
    posts: n(`SELECT count(*) AS n FROM posts WHERE user_id = ? AND status != 'deleted'`),
    saved: n(`SELECT (SELECT count(*) FROM saved_cases WHERE user_id = ?1) + (SELECT count(*) FROM scraps WHERE user_id = ?1) + (SELECT count(*) FROM favorites WHERE user_id = ?1) AS n`),
    orders: n(`SELECT count(*) AS n FROM orders WHERE user_id = ? AND status = 'paid'`),
    cart: n(`SELECT count(*) AS n FROM cart_items WHERE user_id = ?`),
  };
  const tiles: { href: string; label: string; icon: IconName; n?: number }[] = [
    { href: "/projects", label: "내 공간", icon: "layout", n: counts.projects },
    { href: "/community/mine", label: "내 글", icon: "chat", n: counts.posts },
    { href: "/saved", label: "저장", icon: "bookmark", n: counts.saved },
    { href: "/orders", label: "주문 내역", icon: "truck", n: counts.orders },
    { href: "/cart", label: "장바구니", icon: "cart", n: counts.cart },
    { href: "/notifications", label: "알림", icon: "bell" },
  ];
  return (
    <Page narrow>
      <section className="flex items-center gap-4">
        <span className="grid size-14 place-items-center rounded-full bg-brand-soft text-brand"><Icon name="user" className="size-7" /></span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold">{me.nickname || user.name}</h1>
          <p className="truncate text-sm text-muted">{user.email}</p>
        </div>
      </section>
      <ul className="mt-6 grid grid-cols-3 gap-2">
        {tiles.map((t) => (
          <li key={t.href}>
            <Link href={t.href} className="flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-white px-2 py-4 text-center text-sm font-semibold hover:border-brand">
              <Icon name={t.icon} className="size-6 text-brand" />
              {t.label}
              {t.n != null && <span className="text-xs font-normal text-muted tabular-nums">{t.n}</span>}
            </Link>
          </li>
        ))}
      </ul>
      <section className="card mt-6">
        <h2 className="h-section">커뮤니티 별명</h2>
        <p className="mb-3 text-xs text-muted">커뮤니티 글과 댓글에 보이는 이름이에요. 비워 두면 이름 첫 글자와 ** 로 보여요.</p>
        <StateForm action={saveNickname} submit="저장">
          <Field label="별명">
            <input className="input" name="nickname" defaultValue={me.nickname} maxLength={20} placeholder="2~20자" />
          </Field>
        </StateForm>
      </section>
      <nav className="mt-6 divide-y divide-line rounded-2xl border border-line bg-white text-sm" aria-label="계정">
        <Link href="/guide" className="flex min-h-12 items-center justify-between px-4">이용 방법<Icon name="chevron" className="size-4 text-muted" /></Link>
        <Link href="/partners" className="flex min-h-12 items-center justify-between px-4">시공·판매 파트너 입점 안내<Icon name="chevron" className="size-4 text-muted" /></Link>
        <Link href="/privacy" className="flex min-h-12 items-center justify-between px-4">개인정보 처리방침<Icon name="chevron" className="size-4 text-muted" /></Link>
        <form action={logout}><button className="flex min-h-12 w-full items-center px-4 text-left text-muted">로그아웃</button></form>
      </nav>
    </Page>
  );
}
