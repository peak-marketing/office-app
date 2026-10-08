import ClaimActions from "@/components/seller/ClaimActions";
import SellerTabs from "@/components/seller/SellerTabs";
import { Badge, Empty, Page, PageTitle } from "@/components/ui";
import { kst } from "@/lib/constants";
import { all, get } from "@/lib/db";
import { shippingPolicy } from "@/lib/refund-flow";
import { sellerPage } from "@/lib/seller-page";
import { resolveClaim } from "@/lib/shop-actions";
import { CLAIM_REASONS, CLAIM_STATUS, CLAIM_TYPE, GROUP_STATUS, liveQty, refundQuote, type Claim, type OrderGroup, type OrderItem } from "@/lib/shop";

export const metadata = { title: "취소·반품" };

export default async function SellerClaims() {
  const { seller } = await sellerPage();
  const claims = all<Claim & { no: string }>(
    `SELECT c.*, o.no FROM claims c JOIN order_groups g ON g.id = c.group_id JOIN orders o ON o.id = c.order_id WHERE g.seller_id = ?
     ORDER BY (c.status IN ('requested','approved')) DESC, c.id DESC LIMIT 200`,
    seller.id,
  );
  return (
    <Page>
      <PageTitle title="취소·반품" sub="발송 전 취소는 승인하면 바로 환불돼요. 반품은 승인 → 회수 확인 → 환불 순서예요. 단순 변심 반품은 반품 배송비를 빼고 환불해요." />
      <SellerTabs />
      {claims.length === 0 ? (
        <Empty>취소·반품 요청이 없어요.</Empty>
      ) : (
        <ul className="space-y-3" data-testid="seller-claims">
          {claims.map((c) => {
            const item = get<OrderItem>(`SELECT * FROM order_items WHERE id = ?`, c.item_id)!;
            const group = get<OrderGroup>(`SELECT * FROM order_groups WHERE id = ?`, c.group_id)!;
            const items = all<OrderItem>(`SELECT * FROM order_items WHERE group_id = ?`, group.id);
            const remainingAfter = items.reduce((s, i) => s + i.unit_price * (liveQty(i) - (i.id === item.id ? c.qty : 0)), 0);
            const q = ["requested", "approved"].includes(c.status) ? refundQuote({ type: c.type, reason: c.reason_code, item, qty: c.qty, group, seller: shippingPolicy(group), remainingAfter }) : null;
            return (
              <li key={c.id} className="card !p-4" data-claim={c.id}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <b>{CLAIM_TYPE[c.type]}</b>
                  <Badge tone={["requested", "approved"].includes(c.status) ? "warn" : c.status === "completed" ? "brand" : "plain"}>{CLAIM_STATUS[c.status]}</Badge>
                  <span className="text-xs text-muted">주문 {c.no} · {GROUP_STATUS[group.status]} · {kst(c.created_at)}</span>
                </div>
                <p className="mt-2 text-sm">{item.title} <span className="text-muted">{item.option_text}</span> × {c.qty} · {CLAIM_REASONS[c.reason_code]?.label}{c.reason && ` — ${c.reason}`}</p>
                {q && <p className="mt-1 text-xs text-muted">예상 환불 {q.refund.toLocaleString()}원 = {q.lines.join(" · ")}</p>}
                {c.status === "completed" && <p className="mt-1 text-xs text-brand">환불 {c.refund_amount.toLocaleString()}원{c.deduction ? ` (차감 ${c.deduction.toLocaleString()}원)` : ""}</p>}
                {c.seller_note && <p className="mt-1 text-xs text-muted">메모: {c.seller_note}</p>}
                <div className="mt-3"><ClaimActions action={resolveClaim.bind(null, c.id)} type={c.type} status={c.status} /></div>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
