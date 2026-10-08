import Link from "next/link";
import { Notice, Page } from "@/components/ui";

export const metadata = { title: "결제 실패" };

/** 토스페이먼츠 결제창에서 취소·실패했을 때 */
export default async function TossFail({ searchParams }: { searchParams: Promise<{ code?: string; message?: string; orderId?: string }> }) {
  const q = await searchParams;
  return (
    <Page narrow>
      <Notice tone="warn" title="결제를 마치지 못했어요">{q.message || "결제가 취소되었거나 실패했어요."}{q.code && ` (${q.code})`}</Notice>
      <div className="mt-4 flex gap-2">
        {q.orderId && <Link href={`/pay/${encodeURIComponent(q.orderId)}`} className="btn btn-primary">다시 결제하기</Link>}
        <Link href="/cart" className="btn">장바구니</Link>
      </div>
    </Page>
  );
}
