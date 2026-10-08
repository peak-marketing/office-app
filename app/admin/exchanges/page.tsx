import AdminTabs from "@/components/admin/AdminTabs";
import ExchangeQueue from "@/components/seller/ExchangeQueue";
import {Page,PageTitle} from "@/components/ui";
import {requireUser} from "@/lib/auth";
export default async function Exchanges() {
  await requireUser("admin");
  return <Page><PageTitle title="교환 관리" sub="판매자와 고객의 교환 진행을 확인하고 처리할 수 있어요."/><AdminTabs group="shop"/><ExchangeQueue/></Page>;
}
