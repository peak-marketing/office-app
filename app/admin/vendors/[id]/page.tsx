import Link from "next/link";
import { notFound } from "next/navigation";
import VendorProfileEditor from "@/components/VendorProfileEditor";
import { Badge, Page, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getVendor } from "@/lib/data";

export default async function AdminVendor({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("admin");
  const vendor = getVendor(Number((await params).id));
  if (!vendor) notFound();
  return (
    <Page>
      <Link href="/admin/vendors" className="text-sm text-muted hover:text-ink">
        ← 업체 관리
      </Link>
      <PageTitle
        title={`${vendor.company} · 소개와 사례 대신 관리`}
        sub={
          <span className="flex items-center gap-2">
            운영자가 업체 대신 소개와 시공 사례를 올립니다. 업체도 자기 계정에서 같은 내용을 고칠 수 있습니다.
            <Badge tone={vendor.status === "approved" ? "brand" : "warn"}>{vendor.status === "approved" ? "공개 중" : vendor.status === "pending" ? "승인 대기" : "이용 중지"}</Badge>
          </span>
        }
      />
      <VendorProfileEditor vendor={vendor} adminVendorId={vendor.id} />
    </Page>
  );
}
