import AdminTabs from "@/components/admin/AdminTabs";
import { Field, StateForm } from "@/components/forms";
import { Badge, Empty, Page, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { dateKo } from "@/lib/constants";
import { all } from "@/lib/db";
import { createSettlements, markSettlementPaid } from "@/lib/shop-actions";
import { housekeeping, todayKst } from "@/lib/shop";

export const metadata = { title: "정산 관리" };

export default async function AdminSettlements() {
  await requireUser("admin");
  housekeeping();
  const today = todayKst();
  const list = all<{ id: number; seller: string; bank: string; period_end: string; groups: number; sales: number; refunds: number; commission: number; payout: number; status: string; paid_at: string | null; memo: string }>(
    `SELECT t.*, s.name AS seller, s.bank_name || ' ' || s.bank_account || ' (' || s.bank_holder || ')' AS bank FROM settlements t JOIN sellers s ON s.id = t.seller_id ORDER BY t.status = 'paid', t.id DESC LIMIT 200`,
  );
  return (
    <Page>
      <PageTitle title="정산 관리" sub="기준일까지 구매 확정된 주문을 판매자별로 모아 정산서를 만들어요. 실제 이체는 따로 하고 ‘지급 완료’로 기록해요(지급 자동화 연동 전)." />
      <AdminTabs group="shop" />
      <section className="card mb-5 max-w-lg">
        <StateForm action={createSettlements} submit="정산서 만들기">
          <Field label="정산 기준일(이 날까지 구매 확정분)"><input className="input" type="date" name="cutoff" defaultValue={today} required /></Field>
        </StateForm>
      </section>
      {list.length === 0 ? (
        <Empty>정산서가 없습니다.</Empty>
      ) : (
        <ul className="space-y-2" data-testid="admin-settlements">
          {list.map((s) => (
            <li key={s.id} className="card !p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <b>{s.seller}</b>
                <span className="text-muted">기준 {dateKo(s.period_end)} · 주문 {s.groups}건 · 결제 {s.sales.toLocaleString()} − 환불 {s.refunds.toLocaleString()} − 수수료 {s.commission.toLocaleString()}</span>
                <b className="tabular-nums">= {s.payout.toLocaleString()}원</b>
                <Badge tone={s.status === "paid" ? "brand" : "warn"}>{s.status === "paid" ? `지급 완료 ${dateKo(s.paid_at)}` : "지급 예정"}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted">계좌 {s.bank}{s.memo && ` · ${s.memo}`}</p>
              {s.status !== "paid" && (
                <form action={markSettlementPaid.bind(null, s.id)} className="mt-2 flex flex-wrap gap-2">
                  <input className="input !min-h-9 max-w-xs text-xs" name="memo" placeholder="이체 메모(선택)" aria-label="이체 메모" />
                  <button className="btn btn-sm">지급 완료로 기록</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
