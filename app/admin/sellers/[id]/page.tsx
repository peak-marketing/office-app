import Link from "next/link";
import { notFound } from "next/navigation";
import AdminTabs from "@/components/admin/AdminTabs";
import { Field, StateForm } from "@/components/forms";
import SellerInfoForm from "@/components/seller/SellerInfoForm";
import { Badge, Notice, Page, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { get } from "@/lib/db";
import { SELLER_STATUS, bizNoOk, bizNoText, getSeller } from "@/lib/partner";
import { checkSellerBiz, saveSellerInfo, setSellerStatus } from "@/lib/partner-actions";
import { bizStatusLookup } from "@/lib/external";

export default async function AdminSeller({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("admin");
  const seller = getSeller(Number((await params).id));
  if (!seller) notFound();
  const owner = get<{ email: string; name: string; phone: string }>(`SELECT email, name, phone FROM users WHERE id = ?`, seller.user_id)!;
  const lookup = bizStatusLookup();
  const lastNts = seller.biz_no ? get<{ result: string; created_at: string; ok: number }>(`SELECT result, created_at, ok FROM ext_lookups WHERE kind = 'nts' AND query = ? ORDER BY id DESC LIMIT 1`, seller.biz_no) : undefined;
  const missing = [
    !seller.ceo && "대표자",
    !bizNoOk(seller.biz_no) && "사업자등록번호",
    !seller.biz_address && "사업장 주소",
    !seller.cs_phone && "고객센터 전화",
    !(seller.bank_name && seller.bank_account && seller.bank_holder) && "정산 계좌",
    !seller.doc_file_id && "사업자등록증",
  ].filter(Boolean);
  return (
    <Page>
      <PageTitle title={seller.name} sub={<span className="flex flex-wrap items-center gap-2">판매자 · {owner.name} ({owner.email}) <Badge tone={seller.status === "approved" ? "brand" : "warn"}>{SELLER_STATUS[seller.status]}</Badge></span>} actions={<Link href="/admin/sellers" className="btn btn-sm">목록</Link>} />
      <AdminTabs group="partners" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="card">
          <SellerInfoForm seller={seller} action={saveSellerInfo.bind(null, seller.id)} admin />
        </div>
        <aside className="space-y-4">
          <section className="card space-y-3 text-sm">
            <h2 className="h-section">승인 전 확인</h2>
            {missing.length ? <Notice tone="warn">아직 없는 정보: {missing.join(", ")}</Notice> : <p className="text-brand">필수 정보가 모두 있어요.</p>}
            <p>사업자등록번호 {seller.biz_no ? bizNoText(seller.biz_no) : "미입력"} {seller.biz_no && (bizNoOk(seller.biz_no) ? "· 형식 맞음" : "· 형식 틀림")}</p>
            <p className="text-xs leading-relaxed text-muted">{lookup.label}</p>
            {lookup.on && seller.biz_no && (
              <form action={checkSellerBiz.bind(null, seller.id)}>
                <button className="btn btn-sm">국세청 상태 조회</button>
              </form>
            )}
            {lastNts && <p className="text-xs">최근 조회: {lastNts.result} <span className="text-muted">({lastNts.created_at.slice(0, 16)})</span></p>}
            {seller.doc_file_id ? (
              <a className="btn btn-sm" href={`/files/${seller.doc_file_id}`} target="_blank">사업자등록증 보기</a>
            ) : (
              <p className="text-muted">사업자등록증 없음</p>
            )}
          </section>
          <section className="card">
            <h2 className="h-section">승인·수수료</h2>
            <StateForm action={setSellerStatus.bind(null, seller.id)} submit="저장" className="space-y-3">
              <Field label="상태">
                <select className="input" name="status" defaultValue={seller.status}>
                  {Object.entries(SELLER_STATUS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field label="판매 수수료율(%)">
                <input className="input" name="rate" inputMode="decimal" defaultValue={Math.round(seller.commission_rate * 1000) / 10} />
              </Field>
              <Field label="메모(반려·중지 사유는 판매자에게 보여요)">
                <textarea className="input min-h-20" name="memo" defaultValue={seller.admin_memo} />
              </Field>
            </StateForm>
          </section>
        </aside>
      </div>
    </Page>
  );
}
