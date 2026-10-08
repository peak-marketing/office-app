import Link from "next/link";
import AdminTabs from "@/components/admin/AdminTabs";
import { Badge, Empty, Page, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { dateKo } from "@/lib/constants";
import { all } from "@/lib/db";
import { SELLER_STATUS, bizNoText, type Seller } from "@/lib/partner";

export const metadata = { title: "판매자 관리" };

export default async function AdminSellers() {
  await requireUser("admin");
  const sellers = all<Seller & { email: string; contact: string; products: number; also_vendor: number }>(
    `SELECT s.*, u.email, u.name AS contact,
       (SELECT count(*) FROM products p WHERE p.seller_id = s.id AND p.status != 'deleted') AS products,
       EXISTS (SELECT 1 FROM vendors v WHERE v.user_id = s.user_id) AS also_vendor
     FROM sellers s JOIN users u ON u.id = s.user_id ORDER BY (s.status = 'pending') DESC, s.id DESC`,
  );
  return (
    <Page>
      <PageTitle title="판매자 관리" sub="사업자 정보·서류·정산 계좌를 확인해 승인한 판매자의 상품만 쇼핑에 보여요." />
      <AdminTabs group="partners" />
      {sellers.length === 0 ? (
        <Empty>판매자 신청이 없습니다.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-base min-w-[720px]">
            <thead>
              <tr>
                <th>판매자</th>
                <th>사업자등록번호</th>
                <th>담당자</th>
                <th>상품</th>
                <th>수수료</th>
                <th>상태</th>
                <th>신청일</th>
              </tr>
            </thead>
            <tbody>
              {sellers.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link href={`/admin/sellers/${s.id}`} className="font-semibold text-brand underline">{s.name}</Link>
                    {!!s.also_vendor && <span className="ml-2"><Badge>시공도 함</Badge></span>}
                  </td>
                  <td className="tabular-nums">{s.biz_no ? bizNoText(s.biz_no) : <span className="text-muted">미입력</span>}</td>
                  <td>{s.contact}<span className="block text-xs text-muted">{s.email}</span></td>
                  <td className="tabular-nums">{s.products}</td>
                  <td className="tabular-nums">{Math.round(s.commission_rate * 1000) / 10}%</td>
                  <td><Badge tone={s.status === "approved" ? "brand" : s.status === "pending" ? "warn" : "plain"}>{SELLER_STATUS[s.status]}</Badge></td>
                  <td className="text-xs text-muted">{dateKo(s.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}
