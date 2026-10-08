import { redirect } from "next/navigation";
import VendorProfileEditor from "@/components/VendorProfileEditor";
import { Badge, Page, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getVendorByUser } from "@/lib/data";

export default async function VendorProfile() {
  const user = await requireUser("vendor");
  const vendor = getVendorByUser(user.id);
  if (!vendor) redirect("/partner");
  return (
    <Page>
      <PageTitle
        title="업체 소개·시공 사례"
        sub={
          <span className="flex items-center gap-2">
            고객이 견적을 비교할 때 함께 보는 정보입니다.
            <Badge tone={vendor.status === "approved" ? "brand" : "warn"}>{vendor.status === "approved" ? "승인됨 · 공개 중" : vendor.status === "pending" ? "승인 대기" : "이용 중지"}</Badge>
          </span>
        }
      />
      <VendorProfileEditor vendor={vendor} />
    </Page>
  );
}
