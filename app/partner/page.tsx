import Link from "next/link";
import { Field, StateForm } from "@/components/forms";
import { Badge, Notice, Page, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { SELLER_STATUS, VENDOR_STATUS, partnerRoles } from "@/lib/partner";
import { applyBuildRole, applySellRole } from "@/lib/partner-actions";

export const metadata = { title: "파트너 센터" };

/** 파트너 센터: 한 계정의 시공·판매 역할과 다음 할 일 */
export default async function PartnerCenter() {
  const user = await requireUser("vendor");
  const { vendor, seller } = partnerRoles(user);
  return (
    <Page>
      <PageTitle title="파트너 센터" sub="한 계정으로 시공과 판매를 함께 할 수 있어요. 역할마다 운영자 승인을 따로 받아요." />
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card" data-testid="role-build">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">시공</h2>
            {vendor ? <Badge tone={vendor.status === "approved" ? "brand" : "warn"}>{VENDOR_STATUS[vendor.status]}</Badge> : <Badge>신청 전</Badge>}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted">고객의 공사 요청을 받아 가격·설계·자재·기간을 비공개로 제안해요. 운영자 배정이나 공개 요청 직접 참여로 요청을 받아요.</p>
          {vendor ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/vendor" className="btn btn-primary">요청·제안</Link>
              <Link href="/vendor/open" className="btn">참여할 수 있는 요청</Link>
              <Link href="/vendor/profile" className="btn">업체 소개·사례</Link>
            </div>
          ) : (
            <StateForm action={applyBuildRole} submit="시공 파트너 신청" className="mt-4 space-y-3">
              <Field label="업체명">
                <input className="input" name="company" defaultValue={seller?.name ?? ""} required />
              </Field>
              <Field label="시공 가능 지역">
                <input className="input" name="regions" placeholder="예: 서울 전역, 경기 남부" />
              </Field>
              <fieldset>
                <legend className="label">시공 분야</legend>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-1.5"><input type="checkbox" name="fields" value="office" defaultChecked className="size-4 accent-brand" /> 사무실</label>
                  <label className="flex items-center gap-1.5"><input type="checkbox" name="fields" value="home" className="size-4 accent-brand" /> 주거</label>
                </div>
              </fieldset>
            </StateForm>
          )}
        </section>
        <section className="card" data-testid="role-sell">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">판매</h2>
            {seller ? <Badge tone={seller.status === "approved" ? "brand" : "warn"}>{SELLER_STATUS[seller.status]}</Badge> : <Badge>신청 전</Badge>}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted">쇼핑에 가구·조명·자재 상품을 올려 팔아요. 규격과 3D 모델을 넣으면 고객이 내 공간에 실제 크기로 놓아 볼 수 있어요.</p>
          {seller ? (
            <>
              {seller.status === "rejected" && seller.admin_memo && <div className="mt-3"><Notice tone="warn" title="반려 사유">{seller.admin_memo}</Notice></div>}
              {seller.status === "pending" && <p className="mt-3 rounded-lg bg-sand p-3 text-sm">사업자 정보·정산 계좌·사업자등록증을 채우면 운영자가 확인해 승인해요. 승인 전에도 상품을 미리 등록해 둘 수 있어요(판매는 승인 뒤).</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/seller" className="btn btn-primary">판매자 센터</Link>
                <Link href="/seller/settings" className="btn">판매자 정보</Link>
              </div>
            </>
          ) : (
            <StateForm action={applySellRole} submit="판매자 입점 신청" className="mt-4 space-y-3">
              <Field label="상호(쇼핑에 보이는 이름)">
                <input className="input" name="name" defaultValue={vendor?.company ?? ""} required />
              </Field>
            </StateForm>
          )}
        </section>
      </div>
    </Page>
  );
}
