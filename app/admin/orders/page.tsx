import Link from "next/link";
import AdminTabs from "@/components/admin/AdminTabs";
import ClaimActions from "@/components/seller/ClaimActions";
import { Badge, Empty, Page, PageTitle, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { kst } from "@/lib/constants";
import { all, get } from "@/lib/db";
import { resolveClaim } from "@/lib/shop-actions";
import { CLAIM_REASONS, CLAIM_STATUS, CLAIM_TYPE, GROUP_STATUS, ORDER_STATUS, housekeeping, type Claim, type GroupStatus, type Order } from "@/lib/shop";

export const metadata = { title: "주문·취소·반품" };

export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser("admin");
  housekeeping();
  const { q = "" } = await searchParams;
  const n = (sql: string) => get<{ n: number }>(sql)?.n ?? 0;
  const stats = {
    paidToday: n(`SELECT count(*) AS n FROM orders WHERE status = 'paid' AND paid_at >= datetime('now', '-1 day')`),
    waiting: n(`SELECT count(*) AS n FROM order_groups WHERE status = 'paid' AND id IN (SELECT g.id FROM order_groups g JOIN orders o ON o.id = g.order_id WHERE o.paid_at < datetime('now', '-2 days'))`),
    claims: n(`SELECT count(*) AS n FROM claims WHERE status IN ('requested','approved')`),
    failedRefunds: n(`SELECT count(*) AS n FROM refund_jobs WHERE status = 'failed'`) + n(`SELECT count(*) AS n FROM refunds f WHERE status = 'failed' AND NOT EXISTS (SELECT 1 FROM refunds d WHERE d.claim_id = f.claim_id AND d.status = 'done')`),
  };
  const orders = all<Order & { buyer: string; statuses: string }>(
    `SELECT o.*, u.name AS buyer, (SELECT group_concat(g.status) FROM order_groups g WHERE g.order_id = o.id) AS statuses FROM orders o JOIN users u ON u.id = o.user_id
     WHERE (? = '' OR o.no LIKE ? OR u.name LIKE ? OR o.title LIKE ?) ORDER BY o.id DESC LIMIT 100`,
    q,
    `%${q}%`,
    `%${q}%`,
    `%${q}%`,
  );
  const claims = all<Claim & { no: string; title: string; seller: string; age: number }>(
    `SELECT c.*, o.no, i.title, s.name AS seller, julianday('now') - julianday(c.created_at) AS age FROM claims c JOIN orders o ON o.id = c.order_id JOIN order_items i ON i.id = c.item_id
     JOIN order_groups g ON g.id = c.group_id JOIN sellers s ON s.id = g.seller_id WHERE c.status IN ('requested','approved') ORDER BY c.id`,
  );
  return (
    <Page>
      <PageTitle title="주문·취소·반품" sub="판매자가 처리하지 않는 취소·반품은 운영자가 대신 처리할 수 있어요." />
      <AdminTabs group="shop" />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="최근 하루 결제" value={`${stats.paidToday}건`} />
        <Stat label="결제 뒤 2일 넘게 확인 안 한 주문" value={`${stats.waiting}건`} />
        <Stat label="처리 중 취소·반품" value={`${stats.claims}건`} />
        <Stat label="환불 실패(확인 필요)" value={`${stats.failedRefunds}건`} />
      </div>
      {claims.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-lg font-bold">처리 중인 취소·반품</h2>
          <ul className="space-y-2" data-testid="admin-claims">
            {claims.map((c) => (
              <li key={c.id} className="card !p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <b>{CLAIM_TYPE[c.type]}</b><Badge tone="warn">{CLAIM_STATUS[c.status]}</Badge>
                  <span>{c.title} × {c.qty} · {CLAIM_REASONS[c.reason_code]?.label}</span>
                  <span className="text-xs text-muted">{c.seller} · 주문 {c.no} · {Math.floor(c.age)}일 전</span>
                </div>
                <div className="mt-2"><ClaimActions action={resolveClaim.bind(null, c.id)} type={c.type} status={c.status} /></div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <form className="mb-3 flex gap-2"><input className="input max-w-xs" name="q" defaultValue={q} placeholder="주문번호·구매자·상품" aria-label="주문 검색" /><button className="btn btn-sm">찾기</button></form>
      {orders.length === 0 ? (
        <Empty>주문이 없습니다.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-base min-w-[720px]" data-testid="admin-orders">
            <thead><tr><th>주문번호</th><th>구매자</th><th>상품</th><th>금액</th><th>상태</th><th>결제</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="whitespace-nowrap">{o.no}</td>
                  <td>{o.buyer}</td>
                  <td className="max-w-[260px] truncate">{o.title}</td>
                  <td className="tabular-nums">{o.total_amount.toLocaleString()}</td>
                  <td>{o.status === "paid" ? [...new Set((o.statuses ?? "").split(","))].map((s) => GROUP_STATUS[s as GroupStatus]).join(", ") : ORDER_STATUS[o.status]}</td>
                  <td className="text-xs text-muted">{o.pg === "test" ? "테스트" : "토스"} · {kst(o.paid_at ?? o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-xs text-muted"><Link href="/admin/settlements" className="underline">정산 관리로</Link></p>
    </Page>
  );
}
