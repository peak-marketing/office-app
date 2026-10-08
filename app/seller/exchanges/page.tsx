import SellerTabs from "@/components/seller/SellerTabs";
import ExchangeQueue from "@/components/seller/ExchangeQueue";
import {Page,PageTitle} from "@/components/ui";
import {sellerPage} from "@/lib/seller-page";
export default async function Exchanges() {
  const {seller}=await sellerPage();
  return <Page><PageTitle title="교환" sub="승인 → 회수·차액 처리 → 교환 상품 발송 순서예요."/><SellerTabs/><ExchangeQueue sellerId={seller.id}/></Page>;
}
