import Link from "next/link";
import { Badge, Empty, Page, PageTitle } from "@/components/ui";
import { Field, StateForm } from "@/components/forms";
import { createVendorByAdmin, setVendorStatus } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { dateKo } from "@/lib/constants";
import type { Vendor } from "@/lib/data";
import { all } from "@/lib/db";

export default async function AdminVendors() {
  await requireUser("admin");
  const vendors = all<Vendor & { email: string; contact: string; phone: string; cases: number }>(
    `SELECT v.*, u.email, u.name AS contact, u.phone, (SELECT count(*) FROM vendor_cases c WHERE c.vendor_id = v.id) AS cases
     FROM vendors v JOIN users u ON u.id = v.user_id ORDER BY (v.status = 'pending') DESC, v.id DESC`,
  );
  return (
    <Page>
      <PageTitle title="업체 관리" sub="승인한 업체만 목록에 공개되고 견적 요청을 배정받습니다." />
      <details className="card mb-5" data-testid="add-vendor">
        <summary className="cursor-pointer text-sm font-semibold">업체 직접 등록</summary>
        <p className="mt-2 text-xs leading-relaxed text-muted">함께할 업체를 운영자가 등록합니다. 담당자 이메일로 비밀번호를 정하는 링크(7일 유효)가 갑니다. 소개와 시공 사례는 등록 후 ‘소개·사례 관리’에서 대신 올릴 수 있습니다.</p>
        <StateForm action={createVendorByAdmin} submit="업체 등록" resetOnOk className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="업체명">
            <input className="input" name="company" required />
          </Field>
          <Field label="담당자 이름">
            <input className="input" name="name" required />
          </Field>
          <Field label="담당자 이메일 (로그인 아이디)">
            <input className="input" name="email" type="email" required />
          </Field>
          <Field label="연락처">
            <input className="input" name="phone" type="tel" />
          </Field>
          <Field label="시공 가능 지역">
            <input className="input" name="regions" placeholder="예: 서울 전역, 경기 남부" />
          </Field>
          <Field label="전문 분야">
            <input className="input" name="specialties" placeholder="예: 사무실, 유리 칸막이" />
          </Field>
          <fieldset className="sm:col-span-2">
            <input type="hidden" name="fieldsShown" value="1" />
            <legend className="label">시공 분야</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" name="fields" value="office" defaultChecked className="size-4 accent-brand" /> 사무실
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" name="fields" value="home" className="size-4 accent-brand" /> 주거
              </label>
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="publish" defaultChecked className="size-4 accent-brand" /> 바로 승인해 공개하고 요청을 배정받게 하기
          </label>
        </StateForm>
      </details>
      {vendors.length === 0 ? (
        <Empty>가입한 업체가 없습니다.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="table-base min-w-[760px]">
            <thead>
              <tr>
                <th>업체</th>
                <th>담당자</th>
                <th>지역 · 분야</th>
                <th>사례</th>
                <th>가입일</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id}>
                  <td className="font-medium">
                    {v.status === "approved" ? (
                      <Link href={`/vendors/${v.id}`} className="underline decoration-line underline-offset-4">
                        {v.company}
                      </Link>
                    ) : (
                      v.company
                    )}
                    <span className="block max-w-xs truncate text-xs font-normal text-muted">{v.intro}</span>
                  </td>
                  <td className="text-xs">
                    {v.contact}
                    <span className="block text-muted">
                      {v.email} · {v.phone}
                    </span>
                  </td>
                  <td className="text-xs text-muted">
                    {v.regions || "—"}
                    <span className="block">{v.specialties}</span>
                    <span className="block font-semibold text-ink">분야 {(v.fields || "office").split(",").map((f) => (f === "home" ? "주거" : "사무실")).join("·")}</span>
                  </td>
                  <td>
                    {v.cases}
                    <Link href={`/admin/vendors/${v.id}`} className="mt-1 block text-xs text-brand underline">
                      소개·사례 관리
                    </Link>
                  </td>
                  <td className="text-xs text-muted">{dateKo(v.created_at)}</td>
                  <td>
                    <form action={setVendorStatus.bind(null, v.id)} className="flex items-center gap-2">
                      <Badge tone={v.status === "approved" ? "brand" : v.status === "pending" ? "warn" : "plain"}>{v.status === "approved" ? "승인" : v.status === "pending" ? "대기" : "중지"}</Badge>
                      {v.status !== "approved" && (
                        <button name="status" value="approved" className="btn btn-sm btn-primary">
                          승인
                        </button>
                      )}
                      {v.status === "approved" && (
                        <button name="status" value="suspended" className="btn btn-sm btn-danger">
                          중지
                        </button>
                      )}
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}
