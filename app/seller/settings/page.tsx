import { redirect } from "next/navigation";
import SellerInfoForm from "@/components/seller/SellerInfoForm";
import SellerTabs from "@/components/seller/SellerTabs";
import { Badge, Notice, Page, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { SELLER_STATUS, getSellerByUser } from "@/lib/partner";
import { saveSellerInfo } from "@/lib/partner-actions";

export const metadata = { title: "판매자 정보" };

export default async function SellerSettings() {
  const user = await requireUser("vendor");
  const seller = getSellerByUser(user.id);
  if (!seller) redirect("/partner");
  return (
    <Page>
      <PageTitle title="판매자 정보" sub={<span className="flex flex-wrap items-center gap-2">사업자·고객센터·배송·정산 정보 <Badge tone={seller.status === "approved" ? "brand" : "warn"}>{SELLER_STATUS[seller.status]}</Badge></span>} />
      <SellerTabs />
      {seller.status === "rejected" && seller.admin_memo && <div className="mb-5"><Notice tone="warn" title="반려 사유">{seller.admin_memo} — 고쳐서 저장하면 다시 승인 대기로 바뀌어요.</Notice></div>}
      {seller.status === "suspended" && <div className="mb-5"><Notice tone="warn" title="판매 중지">{seller.admin_memo || "운영자에게 문의해 주세요."} 쇼핑에서 상품이 보이지 않아요.</Notice></div>}
      <p className="mb-5 text-xs text-muted">판매 수수료 {Math.round(seller.commission_rate * 1000) / 10}% (운영자와 정한 비율)</p>
      <div className="card">
        <SellerInfoForm seller={seller} action={saveSellerInfo.bind(null, null)} />
      </div>
    </Page>
  );
}
