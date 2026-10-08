import Link from "next/link";
import SellerTabs from "@/components/seller/SellerTabs";
import { Badge, Notice, Page, PageTitle, Stat } from "@/components/ui";
import { get } from "@/lib/db";
import { SELLER_STATUS } from "@/lib/partner";
import { sellerPage } from "@/lib/seller-page";

export const metadata = { title: "판매자 센터" };

export default async function SellerHome() {
  const { seller } = await sellerPage();
  const n = (sql: string) => get<{ n: number }>(sql, seller.id)?.n ?? 0;
  const stats = {
    onSale: n(`SELECT count(*) AS n FROM products WHERE seller_id = ? AND status = 'on_sale'`),
    newOrders: n(`SELECT count(*) AS n FROM order_groups WHERE seller_id = ? AND status = 'paid'`),
    preparing: n(`SELECT count(*) AS n FROM order_groups WHERE seller_id = ? AND status = 'preparing'`),
    claims: n(`SELECT count(*) AS n FROM claims c JOIN order_groups g ON g.id = c.group_id WHERE g.seller_id = ? AND c.status IN ('requested','approved')`),
    soldOut: n(`SELECT count(DISTINCT p.id) AS n FROM products p WHERE p.seller_id = ? AND p.status = 'on_sale' AND NOT EXISTS (SELECT 1 FROM product_skus k WHERE k.product_id = p.id AND k.active = 1 AND k.stock > 0)`),
    unsettled: n(`SELECT coalesce(sum(payout), 0) AS n FROM settlements WHERE seller_id = ? AND status = 'scheduled'`),
  };
  return (
    <Page>
      <PageTitle title="판매자 센터" sub={<span className="flex flex-wrap items-center gap-2">{seller.name} <Badge tone={seller.status === "approved" ? "brand" : "warn"}>{SELLER_STATUS[seller.status]}</Badge></span>} actions={<Link href="/seller/products/new" className="btn btn-primary btn-sm">상품 등록</Link>} />
      <SellerTabs />
      {seller.status !== "approved" && (
        <div className="mb-5">
          <Notice tone="warn" title={seller.status === "pending" ? "운영자 승인 대기" : SELLER_STATUS[seller.status]}>
            {seller.status === "pending" ? "판매자 정보(사업자·정산 계좌·사업자등록증)를 채우면 운영자가 확인해 승인해요. 승인 전에도 상품을 임시 저장해 둘 수 있어요." : seller.admin_memo || "운영자에게 문의해 주세요."}{" "}
            <Link href="/seller/settings" className="underline">판매자 정보</Link>
          </Notice>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="판매 중인 상품" value={`${stats.onSale}개`} sub={stats.soldOut ? `모든 옵션 품절 ${stats.soldOut}개` : undefined} />
        <Link href="/seller/orders?status=paid"><Stat label="새 주문(확인 전)" value={`${stats.newOrders}건`} /></Link>
        <Link href="/seller/orders?status=preparing"><Stat label="발송 준비 중" value={`${stats.preparing}건`} /></Link>
        <Link href="/seller/claims"><Stat label="처리할 취소·반품" value={`${stats.claims}건`} /></Link>
        <Link href="/seller/settlements"><Stat label="지급 예정 정산" value={`${stats.unsettled.toLocaleString()}원`} /></Link>
        <Stat label="판매 수수료" value={`${Math.round(seller.commission_rate * 1000) / 10}%`} sub="구매 확정된 상품 금액 기준" />
      </div>
    </Page>
  );
}
