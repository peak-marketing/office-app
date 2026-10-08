import Link from "next/link";
import SellerTabs from "@/components/seller/SellerTabs";
import { Badge, Empty, Page, PageTitle } from "@/components/ui";
import { all } from "@/lib/db";
import { sellerPage } from "@/lib/seller-page";
import { PRODUCT_STATUS, categoryLabel, type Product } from "@/lib/shop";

export const metadata = { title: "상품 관리" };

export default async function SellerProducts() {
  const { seller } = await sellerPage();
  const list = all<Product & { cover: number | null; stock: number; skus: number }>(
    `SELECT p.*, (SELECT file_id FROM product_images i WHERE i.product_id = p.id ORDER BY position LIMIT 1) AS cover,
       coalesce((SELECT sum(stock) FROM product_skus k WHERE k.product_id = p.id AND k.active = 1), 0) AS stock,
       (SELECT count(*) FROM product_skus k WHERE k.product_id = p.id AND k.active = 1) AS skus
     FROM products p WHERE p.seller_id = ? AND p.status != 'deleted' ORDER BY p.id DESC`,
    seller.id,
  );
  return (
    <Page>
      <PageTitle title="상품 관리" actions={<Link href="/seller/products/new" className="btn btn-primary btn-sm" data-testid="new-product">상품 등록</Link>} />
      <SellerTabs />
      {list.length === 0 ? (
        <Empty>등록한 상품이 없어요.</Empty>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2" data-testid="seller-products">
          {list.map((p) => (
            <li key={p.id}>
              <Link href={`/seller/products/${p.id}`} className="flex gap-3 rounded-2xl border border-line bg-white p-3 hover:border-brand">
                <span className="size-20 shrink-0 overflow-hidden rounded-xl bg-sand">{p.cover && <img src={`/files/${p.cover}`} alt="" className="size-full object-cover" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap gap-1.5"><Badge tone={p.status === "on_sale" ? "brand" : "warn"}>{PRODUCT_STATUS[p.status]}</Badge>{p.width_mm && <Badge>규격 있음{p.model_file_id ? " · 3D" : ""}</Badge>}</span>
                  <span className="mt-1 block truncate font-semibold">{p.title}</span>
                  <span className="text-xs text-muted">{categoryLabel(p.category)} · {p.price.toLocaleString()}원 · 옵션 {p.skus}개 · 재고 {p.stock}</span>
                  {p.status === "blocked" && <span className="mt-1 block text-xs text-danger">숨김 사유: {p.block_reason}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
