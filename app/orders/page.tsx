import Link from "next/link";
import { Badge, Empty, Page, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { dateKo } from "@/lib/constants";
import { all } from "@/lib/db";
import { GROUP_STATUS, ORDER_STATUS, housekeeping, type GroupStatus, type Order } from "@/lib/shop";

export const metadata = { title: "주문 내역" };

export default async function Orders() {
  const user = await requireUser("customer");
  housekeeping();
  const orders = all<Order & { statuses: string; cover: number | null }>(
    `SELECT o.*, (SELECT group_concat(status) FROM order_groups g WHERE g.order_id = o.id) AS statuses,
       (SELECT i.file_id FROM order_items oi JOIN product_images i ON i.product_id = oi.product_id WHERE oi.order_id = o.id ORDER BY oi.id, i.position LIMIT 1) AS cover
     FROM orders o WHERE o.user_id = ? ORDER BY o.id DESC LIMIT 100`,
    user.id,
  );
  return (
    <Page narrow>
      <PageTitle title="주문 내역" />
      {orders.length === 0 ? (
        <Empty>주문한 상품이 없어요. <Link href="/shop" className="text-brand underline">쇼핑 둘러보기</Link></Empty>
      ) : (
        <ul className="space-y-3" data-testid="order-list">
          {orders.map((o) => {
            const st = [...new Set((o.statuses ?? "").split(",").filter(Boolean))] as GroupStatus[];
            return (
              <li key={o.id}>
                <Link href={`/orders/${o.no}`} className="flex gap-3 rounded-2xl border border-line bg-white p-4 hover:border-brand">
                  <span className="size-16 shrink-0 overflow-hidden rounded-xl bg-sand">{o.cover && <img src={`/files/${o.cover}`} alt="" className="size-full object-cover" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {o.status === "paid" ? st.map((s) => <Badge key={s} tone={s === "canceled" ? "plain" : "brand"}>{GROUP_STATUS[s]}</Badge>) : <Badge tone="warn">{ORDER_STATUS[o.status]}</Badge>}
                      {o.pg === "test" && <span className="text-[11px] text-muted">테스트 결제</span>}
                    </span>
                    <span className="mt-1 block truncate text-sm font-semibold">{o.title}</span>
                    <span className="mt-0.5 block text-xs text-muted">{dateKo(o.created_at)} · {o.no} · {o.total_amount.toLocaleString()}원</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
