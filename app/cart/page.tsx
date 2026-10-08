import Link from "next/link";
import CartView from "@/components/shop/CartView";
import { Empty, Page, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { cartLines, lineProblem, optionText } from "@/lib/shop";

export const metadata = { title: "장바구니" };

export default async function Cart() {
  const user = await requireUser("customer");
  const lines = cartLines(user.id);
  return (
    <Page>
      <PageTitle title="장바구니" sub="판매자마다 배송비를 한 번 받아요." />
      {lines.length === 0 ? (
        <Empty>장바구니가 비어 있어요. <Link href="/shop" className="text-brand underline">쇼핑 둘러보기</Link></Empty>
      ) : (
        <CartView
          rows={lines.map((l) => ({
            sku_id: l.sku_id,
            qty: l.qty,
            product_id: l.product_id,
            title: l.title,
            option: optionText(l, l),
            unit: l.price + l.add_price,
            stock: l.stock,
            problem: lineProblem(l),
            seller_id: l.seller_id,
            seller_name: l.seller_name,
            ship_fee: l.ship_fee,
            free_ship_over: l.free_ship_over,
            cover: l.cover,
            example: !!l.is_example,
          }))}
        />
      )}
    </Page>
  );
}
