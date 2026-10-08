import Link from "next/link";
import AdminTabs from "@/components/admin/AdminTabs";
import { Badge, Empty, Page, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { setProductBlock } from "@/lib/shop-actions";
import { PRODUCT_STATUS, categoryLabel, type Product } from "@/lib/shop";

export const metadata = { title: "상품 관리" };

export default async function AdminProducts({ searchParams }: { searchParams: Promise<{ q?: string; reported?: string }> }) {
  await requireUser("admin");
  const { q = "", reported } = await searchParams;
  const list = all<Product & { seller: string; reports: number }>(
    `SELECT p.*, s.name AS seller, (SELECT count(*) FROM reports r WHERE r.target = 'product' AND r.target_id = p.id AND r.status = 'open') AS reports
     FROM products p JOIN sellers s ON s.id = p.seller_id WHERE p.status != 'deleted' AND (? = '' OR p.title LIKE ? OR s.name LIKE ?) ${reported ? "AND reports > 0" : ""}
     ORDER BY reports DESC, p.id DESC LIMIT 300`,
    q,
    `%${q}%`,
    `%${q}%`,
  );
  return (
    <Page>
      <PageTitle title="상품 관리" sub="정책에 맞지 않는 상품은 숨기고 사유를 판매자에게 알려요." />
      <AdminTabs group="shop" />
      <form className="mb-4 flex flex-wrap gap-2">
        <input className="input max-w-xs" name="q" defaultValue={q} placeholder="상품명·판매자" aria-label="검색" />
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="reported" value="1" defaultChecked={!!reported} /> 신고된 것만</label>
        <button className="btn btn-sm">찾기</button>
      </form>
      {list.length === 0 ? (
        <Empty>상품이 없습니다.</Empty>
      ) : (
        <ul className="space-y-2" data-testid="admin-products">
          {list.map((p) => (
            <li key={p.id} className="card !p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={p.status === "on_sale" ? "brand" : "warn"}>{PRODUCT_STATUS[p.status]}</Badge>
                {p.reports > 0 && <Badge tone="warn">신고 {p.reports}</Badge>}
                {!!p.is_example && <Badge>예시</Badge>}
                <Link href={`/shop/products/${p.id}`} className="font-semibold underline">{p.title}</Link>
                <span className="text-muted">{p.seller} · {categoryLabel(p.category)} · {p.price.toLocaleString()}원</span>
              </div>
              {p.status === "blocked" ? (
                <form action={setProductBlock.bind(null, p.id)} className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-danger">숨김 사유: {p.block_reason}</span>
                  <input type="hidden" name="do" value="unblock" />
                  <button className="btn btn-sm">숨김 풀기(판매 중지 상태로)</button>
                </form>
              ) : (
                <form action={setProductBlock.bind(null, p.id)} className="mt-2 flex flex-wrap gap-2">
                  <input type="hidden" name="do" value="block" />
                  <input className="input !min-h-9 max-w-sm text-xs" name="reason" placeholder="숨김 사유(판매자에게 보여요)" aria-label="숨김 사유" />
                  <button className="btn btn-sm btn-danger">숨기기</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
