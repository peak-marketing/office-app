import Link from "next/link";
import { notFound } from "next/navigation";
import ProductEditor from "@/components/seller/ProductEditor";
import SellerTabs from "@/components/seller/SellerTabs";
import { Badge, Notice, Page, PageTitle } from "@/components/ui";
import { get } from "@/lib/db";
import { sellerPage } from "@/lib/seller-page";
import { deleteProduct, saveProduct } from "@/lib/shop-actions";
import { PRODUCT_STATUS, productImages, productSkus, type Product } from "@/lib/shop";

export const metadata = { title: "상품 수정" };

export default async function EditProduct({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { seller } = await sellerPage();
  const product = get<Product>(`SELECT * FROM products WHERE id = ? AND seller_id = ? AND status != 'deleted'`, Number((await params).id), seller.id);
  if (!product) notFound();
  const skus = productSkus(product.id, false);
  return (
    <Page>
      <PageTitle title={product.title} sub={<Badge tone={product.status === "on_sale" ? "brand" : "warn"}>{PRODUCT_STATUS[product.status]}</Badge>} actions={product.status === "on_sale" ? <Link href={`/shop/products/${product.id}`} className="btn btn-sm">쇼핑에서 보기</Link> : undefined} />
      <SellerTabs />
      {(await searchParams).saved && <div className="mb-4"><Notice>저장했어요.</Notice></div>}
      {product.status === "blocked" && <div className="mb-4"><Notice tone="warn" title="운영자가 숨긴 상품">{product.block_reason} — 운영자에게 문의해 주세요.</Notice></div>}
      <ProductEditor
        action={saveProduct.bind(null, product.id)}
        approved={seller.status === "approved"}
        images={productImages(product.id)}
        skus={skus.map((s) => ({ opt1: s.opt1, opt2: s.opt2, add_price: s.add_price, stock: s.stock, active: !!s.active, width_mm: s.width_mm, depth_mm: s.depth_mm, height_mm: s.height_mm }))}
        product={product}
      />
      <form action={deleteProduct.bind(null, product.id)} className="mt-8 border-t border-line pt-4">
        <button className="btn btn-sm btn-danger">상품 삭제</button>
        <span className="ml-2 text-xs text-muted">쇼핑에서 내리고 목록에서 지워요. 지난 주문 기록은 남아요.</span>
      </form>
    </Page>
  );
}
