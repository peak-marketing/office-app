import { all } from "@/lib/db";
import { EXCHANGE_STATUS, type Exchange } from "@/lib/exchanges";
import { resolveExchange } from "@/lib/exchange-actions";
import { Badge, Empty } from "../ui";
import ExchangeActions from "./ExchangeActions";
export default function ExchangeQueue({sellerId}: {sellerId?:number}) {
  const rows=all<Exchange & { no:string; title:string }>(`SELECT e.*,o.no,i.title FROM exchanges e JOIN orders o ON o.id=e.order_id JOIN order_items i ON i.id=e.item_id JOIN order_groups g ON g.id=e.group_id ${sellerId ? "WHERE g.seller_id = ?" : ""} ORDER BY e.id DESC LIMIT 200`,...(sellerId ? [sellerId] : []));
  if (!rows.length) return <Empty>교환 요청이 없어요.</Empty>;
  return <ul className="space-y-3">{rows.map(e => <li key={e.id} className="card" data-exchange={e.id}>
    <div className="flex flex-wrap gap-2 text-sm"><b>{e.title}</b><Badge>{EXCHANGE_STATUS[e.status]}</Badge><span className="text-muted">주문 {e.no}</span></div>
    <p className="mt-2 text-sm">{e.qty}개 → {e.option_text || "기본"} · 차액 {e.price_diff.toLocaleString()}원 · 교환 배송비 {e.ship_fee.toLocaleString()}원</p>
    <p className="text-sm">{e.amount_due > 0 ? `고객 추가 결제 ${e.amount_due.toLocaleString()}원` : e.amount_due < 0 ? `회수 후 환불 ${(-e.amount_due).toLocaleString()}원` : "차액 없음"}{e.reason && ` · ${e.reason}`}</p>
    {e.seller_note && <p className="text-sm text-muted">{e.seller_note}</p>}
    {e.status === "collected" && <p className="mt-2 text-sm text-muted">고객 추가 결제가 끝나면 발송할 수 있어요.</p>}
    <ExchangeActions action={resolveExchange.bind(null,e.id)} status={e.status}/>
  </li>)}</ul>;
}
