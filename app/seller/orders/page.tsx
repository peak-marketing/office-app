import Link from "next/link";
import GroupActions from "@/components/seller/GroupActions";
import SellerTabs from "@/components/seller/SellerTabs";
import { Badge, Empty, Page, PageTitle } from "@/components/ui";
import { kst } from "@/lib/constants";
import { all } from "@/lib/db";
import { sellerPage } from "@/lib/seller-page";
import { updateGroup } from "@/lib/shop-actions";
import { GROUP_STATUS, liveQty, type GroupStatus, type Order, type OrderGroup, type OrderItem } from "@/lib/shop";

export const metadata = { title: "주문·배송" };

const TABS: GroupStatus[] = ["paid", "preparing", "shipped", "delivered", "confirmed", "canceled"];

export default async function SellerOrders({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { seller } = await sellerPage();
  const want = (await searchParams).status;
  const status = TABS.includes(want as GroupStatus) ? (want as GroupStatus) : "paid";
  const counts = Object.fromEntries(all<{ status: string; n: number }>(`SELECT status, count(*) AS n FROM order_groups WHERE seller_id = ? GROUP BY status`, seller.id).map((r) => [r.status, r.n]));
  const groups = all<OrderGroup & Pick<Order, "no" | "recipient" | "phone" | "zipcode" | "address1" | "address2" | "memo" | "paid_at" | "pg">>(
    `SELECT g.*, o.no, o.recipient, o.phone, o.zipcode, o.address1, o.address2, o.memo, o.paid_at, o.pg FROM order_groups g JOIN orders o ON o.id = g.order_id
     WHERE g.seller_id = ? AND g.status = ? AND o.status = 'paid' ORDER BY g.id ${status === "paid" || status === "preparing" ? "ASC" : "DESC"} LIMIT 200`,
    seller.id,
    status,
  );
  const items = groups.length ? all<OrderItem>(`SELECT * FROM order_items WHERE group_id IN (${groups.map(() => "?").join(",")})`, ...groups.map((g) => g.id)) : [];
  const openClaims = new Set(all<{ group_id: number }>(`SELECT DISTINCT c.group_id FROM claims c JOIN order_groups g ON g.id = c.group_id WHERE g.seller_id = ? AND c.status IN ('requested','approved')`, seller.id).map((r) => r.group_id));
  return (
    <Page>
      <PageTitle title="주문·배송" sub="결제 완료 → 발주 확인(배송 준비) → 발송(송장 입력) → 배송 완료 → 구매 확정(고객 또는 7일 뒤 자동)" />
      <SellerTabs />
      <nav className="filter-scroll mb-4" aria-label="주문 상태">
        {TABS.map((t) => (
          <Link key={t} href={`/seller/orders?status=${t}`} className={`filter-chip ${t === status ? "active" : ""}`}>{GROUP_STATUS[t]} {counts[t] ?? 0}</Link>
        ))}
      </nav>
      {groups.length === 0 ? (
        <Empty>{GROUP_STATUS[status]} 주문이 없어요.</Empty>
      ) : (
        <ul className="space-y-3" data-testid="seller-orders">
          {groups.map((g) => (
            <li key={g.id} className="card !p-4" data-order={g.no}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <b>{g.no}</b>
                <Badge tone="brand">{GROUP_STATUS[g.status]}</Badge>
                {openClaims.has(g.id) && <Link href="/seller/claims"><Badge tone="warn">취소·반품 요청 있음</Badge></Link>}
                {g.pg === "test" && <span className="text-xs text-muted">테스트 결제</span>}
                <span className="text-xs text-muted">결제 {kst(g.paid_at)}</span>
              </div>
              <ul className="mt-2 space-y-1 text-sm">
                {items.filter((i) => i.group_id === g.id).map((i) => (
                  <li key={i.id}>{i.title} <span className="text-muted">{i.option_text}</span> × {liveQty(i)}{liveQty(i) !== i.qty && <span className="text-xs text-muted"> (주문 {i.qty})</span>}</li>
                ))}
              </ul>
              {g.status !== "canceled" && (
                <p className="mt-2 rounded-lg bg-sand p-2.5 text-xs leading-relaxed">
                  {g.recipient} · {g.phone} · {[g.zipcode && `(${g.zipcode})`, g.address1, g.address2].filter(Boolean).join(" ")}{g.memo && ` · 메모: ${g.memo}`}
                </p>
              )}
              {g.tracking_no && <p className="mt-2 text-xs text-muted">{g.courier} {g.tracking_no} · 발송 {kst(g.shipped_at)}</p>}
              <div className="mt-3"><GroupActions action={updateGroup.bind(null, g.id)} status={g.status} courier={seller.courier} /></div>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
