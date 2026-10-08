import Link from "next/link";
import CheckoutForm from "@/components/shop/CheckoutForm";
import { Empty, Notice, Page, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { paymentProvider } from "@/lib/external";
import { cartLines, cartSummary, lineProblem, optionText } from "@/lib/shop";

export const metadata = { title: "주문서" };

export default async function Checkout({ searchParams }: { searchParams: Promise<{ sku?: string | string[] }> }) {
  const user = await requireUser("customer");
  const raw = (await searchParams).sku;
  const ids = (Array.isArray(raw) ? raw : raw ? [raw] : []).map(Number).filter(Number.isInteger);
  const lines = ids.length ? cartLines(user.id, ids) : [];
  const problems = lines.filter((l) => lineProblem(l));
  const sum = cartSummary(lines);
  const testPay = paymentProvider() === "test";
  return (
    <Page narrow>
      <PageTitle title="주문서" />
      {lines.length === 0 ? (
        <Empty>주문할 상품이 없어요. <Link href="/cart" className="text-brand underline">장바구니로</Link></Empty>
      ) : (
        <div className="space-y-5">
          {problems.length > 0 && <Notice tone="warn">{problems.map((l) => `${l.title}: ${lineProblem(l)}`).join(" / ")} — 장바구니에서 고친 뒤 주문해 주세요.</Notice>}
          <section className="card space-y-4" data-testid="checkout-summary">
            {sum.groups.map((g) => (
              <div key={g.seller_id}>
                <h2 className="text-sm font-bold">{g.seller_name}</h2>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {g.lines.map((l) => (
                    <li key={l.sku_id} className="flex justify-between gap-3">
                      <span className="min-w-0">{l.title}{optionText(l, l) && <span className="text-muted"> · {optionText(l, l)}</span>} × {l.qty}</span>
                      <span className="shrink-0 tabular-nums">{((l.price + l.add_price) * l.qty).toLocaleString()}원</span>
                    </li>
                  ))}
                  <li className="flex justify-between text-xs text-muted"><span>배송비</span><span>{g.ship ? `${g.ship.toLocaleString()}원` : "무료"}</span></li>
                </ul>
              </div>
            ))}
            <div className="flex justify-between border-t border-line pt-3 font-bold"><span>총 결제 금액</span><span className="tabular-nums" data-testid="checkout-total">{sum.total.toLocaleString()}원</span></div>
          </section>
          {!problems.length && <CheckoutForm skus={lines.map((l) => l.sku_id)} name={user.name} phone={user.phone} total={sum.total} testPay={testPay} />}
        </div>
      )}
    </Page>
  );
}
