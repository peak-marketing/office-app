import SellerTabs from "@/components/seller/SellerTabs";
import { Badge, Empty, Page, PageTitle, Stat } from "@/components/ui";
import { dateKo } from "@/lib/constants";
import { all } from "@/lib/db";
import { sellerPage } from "@/lib/seller-page";
import { groupSettlement } from "@/lib/shop";

export const metadata = { title: "정산" };

export default async function SellerSettlements() {
  const { seller } = await sellerPage();
  const list = all<{ id: number; period_end: string; groups: number; sales: number; refunds: number; commission: number; payout: number; rate: number; status: string; paid_at: string | null; memo: string }>(
    `SELECT * FROM settlements WHERE seller_id = ? ORDER BY id DESC`,
    seller.id,
  );
  const waiting = all<{ id: number }>(`SELECT id FROM order_groups WHERE seller_id = ? AND status = 'confirmed' AND settlement_id IS NULL`, seller.id).map((g) => groupSettlement(g.id, seller.commission_rate));
  const upcoming = waiting.reduce((s, x) => s + x.payout, 0);
  return (
    <Page>
      <PageTitle title="정산" sub="구매 확정된 주문을 모아 운영자가 정산서를 만들고, 지급한 뒤 ‘지급 완료’로 기록해요." />
      <SellerTabs />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="다음 정산에 들어갈 금액(예상)" value={`${upcoming.toLocaleString()}원`} sub={`구매 확정 ${waiting.length}건`} />
        <Stat label="지급 예정" value={`${list.filter((s) => s.status === "scheduled").reduce((n, s) => n + s.payout, 0).toLocaleString()}원`} />
        <Stat label="수수료율" value={`${Math.round(seller.commission_rate * 1000) / 10}%`} />
      </div>
      <p className="mb-4 rounded-xl bg-sand p-3 text-xs leading-relaxed text-muted">정산 금액 = 결제 금액(상품+배송비) − 환불 금액 − 수수료. 수수료는 취소·반품하지 않은 상품 금액에만 붙고 배송비에는 붙지 않아요. 지급은 운영자가 등록된 계좌로 보내요(자동 이체 연동 전).</p>
      {list.length === 0 ? (
        <Empty>아직 만들어진 정산서가 없어요.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-base min-w-[640px]" data-testid="seller-settlements">
            <thead><tr><th>기준일</th><th>주문</th><th>결제</th><th>환불</th><th>수수료</th><th>지급액</th><th>상태</th></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id}>
                  <td>{dateKo(s.period_end)}</td>
                  <td className="tabular-nums">{s.groups}</td>
                  <td className="tabular-nums">{s.sales.toLocaleString()}</td>
                  <td className="tabular-nums">{s.refunds.toLocaleString()}</td>
                  <td className="tabular-nums">{s.commission.toLocaleString()} <span className="text-xs text-muted">({Math.round(s.rate * 1000) / 10}%)</span></td>
                  <td className="tabular-nums font-semibold">{s.payout.toLocaleString()}원</td>
                  <td><Badge tone={s.status === "paid" ? "brand" : "warn"}>{s.status === "paid" ? `지급 완료 ${dateKo(s.paid_at)}` : "지급 예정"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}
