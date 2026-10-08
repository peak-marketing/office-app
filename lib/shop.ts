import { all, get, run } from "./db";
import type { Seller } from "./partner";
import { CATEGORIES, CLAIM_REASONS, type CategoryKey } from "./shop-constants";

export * from "./shop-constants";

// 판매자 입점 쇼핑. 상품(옵션 조합 = SKU, SKU마다 가격·재고), 장바구니, 주문(판매자별 배송 묶음), 취소·반품·환불, 정산.
// 금액 단위는 원(정수). 배송비는 한 주문 안에서 판매자마다 한 번만 받는다.

export interface Product {
  id: number;
  seller_id: number;
  title: string;
  category: CategoryKey;
  brand: string;
  description: string;
  /** 기본 판매가. 옵션별 추가 금액을 더한 값이 실제 가격 */
  price: number;
  /** 정가(할인 표시용). 없으면 null */
  list_price: number | null;
  option1_name: string;
  option2_name: string;
  /** 실제 규격(mm). 세 값이 모두 있으면 내 공간에 실제 크기로 놓을 수 있다. */
  width_mm: number | null;
  depth_mm: number | null;
  height_mm: number | null;
  /** 3D 상자 색(#rrggbb). 모델이 없을 때 쓴다. */
  color: string;
  /** 3D 모델(GLB) 파일 */
  model_file_id: number | null;
  /** 시연용 예시 상품(실제 판매 아님) */
  is_example: number;
  status: "draft" | "on_sale" | "paused" | "blocked" | "deleted";
  block_reason: string;
  created_at: string;
  updated_at: string;
}

export interface Sku {
  id: number;
  product_id: number;
  opt1: string;
  opt2: string;
  add_price: number;
  stock: number;
  width_mm: number | null;
  depth_mm: number | null;
  height_mm: number | null;
  active: number;
}

export const PRODUCT_STATUS: Record<Product["status"], string> = { draft: "임시 저장", on_sale: "판매 중", paused: "판매 중지(판매자)", blocked: "운영자 숨김", deleted: "삭제" };

/** 쇼핑에 보이는 상품 조건: 판매 중 + 승인된 판매자 */
const VISIBLE = `p.status = 'on_sale' AND s.status = 'approved'`;

export interface ProductCard extends Product {
  seller_name: string;
  cover: number | null;
  min_price: number;
  stock: number;
  scraps: number;
  sold: number;
}

const CARD_SELECT = `SELECT p.*, s.name AS seller_name,
  (SELECT file_id FROM product_images i WHERE i.product_id = p.id ORDER BY position, file_id LIMIT 1) AS cover,
  p.price + coalesce((SELECT min(add_price) FROM product_skus k WHERE k.product_id = p.id AND k.active = 1), 0) AS min_price,
  coalesce((SELECT sum(stock) FROM product_skus k WHERE k.product_id = p.id AND k.active = 1), 0) AS stock,
  (SELECT count(*) FROM scraps c WHERE c.target = 'product' AND c.target_id = p.id) AS scraps,
  coalesce((SELECT sum(oi.qty - oi.canceled_qty - oi.returned_qty) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = p.id AND o.status = 'paid'), 0) AS sold
  FROM products p JOIN sellers s ON s.id = p.seller_id`;

export interface ProductQuery {
  q?: string;
  cat?: string;
  sort?: string;
  /** 1이면 내 공간에 놓을 수 있는(규격이 있는) 상품만 */
  three?: string;
  seller?: string;
}

export function searchProducts(query: ProductQuery, limit = 60): ProductCard[] {
  const where = [VISIBLE];
  const params: (string | number)[] = [];
  const q = (query.q ?? "").trim().slice(0, 40);
  if (q) {
    where.push(`(p.title LIKE ? OR p.brand LIKE ? OR s.name LIKE ?)`);
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (CATEGORIES.some((c) => c.key === query.cat)) {
    where.push(`p.category = ?`);
    params.push(query.cat!);
  }
  if (query.three === "1") where.push(`p.width_mm > 0 AND p.depth_mm > 0 AND p.height_mm > 0`);
  if (query.seller && Number.isInteger(Number(query.seller))) {
    where.push(`p.seller_id = ?`);
    params.push(Number(query.seller));
  }
  const order = query.sort === "low" ? "min_price ASC" : query.sort === "high" ? "min_price DESC" : query.sort === "popular" ? "sold DESC, scraps DESC, p.id DESC" : "p.id DESC";
  return all<ProductCard>(`${CARD_SELECT} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ?`, ...params, limit);
}

export const getProductCards = (ids: number[]): ProductCard[] =>
  ids.length ? all<ProductCard>(`${CARD_SELECT} WHERE p.id IN (${ids.map(() => "?").join(",")}) AND ${VISIBLE}`, ...ids) : [];

export const getProduct = (id: number) => (Number.isInteger(id) ? get<Product>(`SELECT * FROM products WHERE id = ?`, id) : undefined);

/** 쇼핑에서 볼 수 있는 상품 하나(판매 중지·숨김이면 없음) */
export const getVisibleProduct = (id: number) =>
  Number.isInteger(id) ? get<ProductCard>(`${CARD_SELECT} WHERE p.id = ? AND ${VISIBLE}`, id) : undefined;

export const productImages = (productId: number) =>
  all<{ file_id: number }>(`SELECT file_id FROM product_images WHERE product_id = ? ORDER BY position, file_id`, productId).map((r) => r.file_id);

export const productSkus = (productId: number, activeOnly = true) =>
  all<Sku>(`SELECT * FROM product_skus WHERE product_id = ? ${activeOnly ? "AND active = 1" : ""} ORDER BY id`, productId);

export const skuPrice = (p: Pick<Product, "price">, s: Pick<Sku, "add_price">) => p.price + s.add_price;
export const optionText = (p: Pick<Product, "option1_name" | "option2_name">, s: Pick<Sku, "opt1" | "opt2">) =>
  [p.option1_name && s.opt1 ? `${p.option1_name}: ${s.opt1}` : "", p.option2_name && s.opt2 ? `${p.option2_name}: ${s.opt2}` : ""].filter(Boolean).join(" / ");

/** 상품(또는 옵션)의 실제 규격. 셋 다 있어야 내 공간에 놓을 수 있다. */
export function productDims(p: Pick<Product, "width_mm" | "depth_mm" | "height_mm">, s?: Pick<Sku, "width_mm" | "depth_mm" | "height_mm"> | null) {
  const w = s?.width_mm ?? p.width_mm;
  const d = s?.depth_mm ?? p.depth_mm;
  const h = s?.height_mm ?? p.height_mm;
  return w && d && h ? { w, d, h } : null;
}
export const dimsText = (d: { w: number; d: number; h: number } | null) => (d ? `가로 ${d.w.toLocaleString()} × 깊이 ${d.d.toLocaleString()} × 높이 ${d.h.toLocaleString()}mm` : "규격 정보 없음");

export const discountRate = (p: Pick<ProductCard, "list_price" | "min_price">) => (p.list_price && p.list_price > p.min_price ? Math.floor(((p.list_price - p.min_price) / p.list_price) * 100) : 0);

// ── 배송비
export function shipFeeFor(seller: Pick<Seller, "ship_fee" | "free_ship_over">, subtotal: number) {
  return seller.free_ship_over != null && subtotal >= seller.free_ship_over ? 0 : seller.ship_fee;
}
export const shipPolicyText = (s: Pick<Seller, "ship_fee" | "free_ship_over">) =>
  s.ship_fee === 0 ? "무료 배송" : `배송비 ${s.ship_fee.toLocaleString()}원${s.free_ship_over != null ? ` · ${s.free_ship_over.toLocaleString()}원 이상 무료` : ""}`;

// ── 장바구니
export interface CartLine {
  sku_id: number;
  qty: number;
  project_id: number | null;
  product_id: number;
  title: string;
  opt1: string;
  opt2: string;
  option1_name: string;
  option2_name: string;
  price: number;
  add_price: number;
  stock: number;
  sku_active: number;
  product_status: Product["status"];
  seller_id: number;
  seller_name: string;
  seller_status: Seller["status"];
  ship_fee: number;
  free_ship_over: number | null;
  cover: number | null;
  is_example: number;
}

export function cartLines(userId: number, skuIds?: number[]): CartLine[] {
  const rows = all<CartLine>(
    `SELECT c.sku_id, c.qty, c.project_id, p.id AS product_id, p.title, k.opt1, k.opt2, p.option1_name, p.option2_name, p.price, k.add_price, k.stock, k.active AS sku_active,
       p.status AS product_status, s.id AS seller_id, s.name AS seller_name, s.status AS seller_status, s.ship_fee, s.free_ship_over, p.is_example,
       (SELECT file_id FROM product_images i WHERE i.product_id = p.id ORDER BY position, file_id LIMIT 1) AS cover
     FROM cart_items c JOIN product_skus k ON k.id = c.sku_id JOIN products p ON p.id = k.product_id JOIN sellers s ON s.id = p.seller_id
     WHERE c.user_id = ? ORDER BY s.id, c.added_at`,
    userId,
  );
  return skuIds ? rows.filter((r) => skuIds.includes(r.sku_id)) : rows;
}

/** 지금 살 수 없는 이유. 살 수 있으면 null */
export function lineProblem(l: CartLine) {
  if (!Number.isSafeInteger(l.price + l.add_price) || l.price + l.add_price < 100 || l.price + l.add_price > 100_000_000) return "상품 가격을 확인해야 해요. 판매자에게 문의해 주세요.";
  if (!Number.isSafeInteger(l.qty) || l.qty < 1) return "수량을 확인해 주세요.";
  if (l.product_status !== "on_sale" || l.seller_status !== "approved" || !l.sku_active) return "판매 중이 아닌 상품이에요.";
  if (l.stock <= 0) return "품절이에요.";
  if (l.qty > l.stock) return `재고가 ${l.stock}개 남았어요.`;
  return null;
}

/** 판매자별 묶음과 금액 */
export function cartSummary(lines: CartLine[]) {
  const groups = new Map<number, { seller_id: number; seller_name: string; lines: CartLine[]; subtotal: number; ship: number }>();
  for (const l of lines) {
    const g = groups.get(l.seller_id) ?? { seller_id: l.seller_id, seller_name: l.seller_name, lines: [], subtotal: 0, ship: 0 };
    g.lines.push(l);
    g.subtotal += (l.price + l.add_price) * l.qty;
    groups.set(l.seller_id, g);
  }
  for (const g of groups.values()) g.ship = shipFeeFor(g.lines[0], g.subtotal);
  const list = [...groups.values()];
  const items = list.reduce((s, g) => s + g.subtotal, 0);
  const ship = list.reduce((s, g) => s + g.ship, 0);
  return { groups: list, items, ship, total: items + ship };
}

// ── 주문
export interface Order {
  id: number;
  no: string;
  user_id: number;
  status: "pending" | "paid" | "failed" | "expired";
  title: string;
  items_amount: number;
  ship_amount: number;
  total_amount: number;
  recipient: string;
  phone: string;
  zipcode: string;
  address1: string;
  address2: string;
  memo: string;
  pg: "test" | "toss";
  payment_key: string;
  payment_method: string;
  fail_reason: string;
  paid_at: string | null;
  created_at: string;
  purpose?: string;
  exchange_id?: number | null;
}

export type GroupStatus = "pending" | "paid" | "preparing" | "shipped" | "delivered" | "confirmed" | "canceled";
export interface OrderGroup {
  id: number;
  order_id: number;
  seller_id: number;
  ship_fee: number;
  ship_refunded: number;
  status: GroupStatus;
  courier: string;
  tracking_no: string;
  shipped_at: string | null;
  delivered_at: string | null;
  confirmed_at: string | null;
  confirm_auto: number;
  settlement_id: number | null;
  ship_deducted?: number;
  shipping_policy?: string;
}
export interface OrderItem {
  id: number;
  order_id: number;
  group_id: number;
  product_id: number;
  sku_id: number;
  title: string;
  option_text: string;
  unit_price: number;
  qty: number;
  amount: number;
  canceled_qty: number;
  returned_qty: number;
  project_id: number | null;
  exchanged_qty?: number;
  exchange_source_id?: number | null;
}
export interface Claim {
  id: number;
  order_id: number;
  group_id: number;
  item_id: number;
  user_id: number;
  type: "cancel" | "return";
  reason_code: string;
  reason: string;
  qty: number;
  status: "requested" | "approved" | "completed" | "rejected" | "withdrawn";
  deduction: number;
  refund_amount: number;
  seller_note: string;
  created_at: string;
  resolved_at: string | null;
}

export const ORDER_STATUS: Record<Order["status"], string> = { pending: "결제 대기", paid: "결제 완료", failed: "결제 실패", expired: "결제 시간 지남" };
export const GROUP_STATUS: Record<GroupStatus, string> = {
  pending: "결제 대기",
  paid: "결제 완료",
  preparing: "배송 준비 중",
  shipped: "배송 중",
  delivered: "배송 완료",
  confirmed: "구매 확정",
  canceled: "주문 취소",
};
export const CLAIM_STATUS: Record<Claim["status"], string> = { requested: "요청됨", approved: "승인·회수 중", completed: "환불 완료", rejected: "거절됨", withdrawn: "철회" };
export const CLAIM_TYPE: Record<Claim["type"], string> = { cancel: "취소", return: "반품" };
export const PENDING_MINUTES = 30;
export const AUTO_CONFIRM_DAYS = 7;

export const getOrderByNo = (no: string) => get<Order>(`SELECT * FROM orders WHERE no = ?`, no);
export const orderGroups = (orderId: number) => all<OrderGroup>(`SELECT * FROM order_groups WHERE order_id = ? ORDER BY id`, orderId);
export const orderItems = (orderId: number) => all<OrderItem>(`SELECT * FROM order_items WHERE order_id = ? ORDER BY id`, orderId);
export const orderClaims = (orderId: number) => all<Claim>(`SELECT * FROM claims WHERE order_id = ? ORDER BY id`, orderId);

/** 남은(취소·반품하지 않은) 수량 */
export const liveQty = (i: Pick<OrderItem, "qty" | "canceled_qty" | "returned_qty" | "exchanged_qty">) => i.qty - i.canceled_qty - i.returned_qty - (i.exchanged_qty ?? 0);

/** 진행 중인 취소·반품 요청이 묶은 수량 */
export const claimedQty = (itemId: number) =>
  get<{ n: number }>(`SELECT coalesce(sum(qty),0) AS n FROM (SELECT qty FROM claims WHERE item_id = ? AND status IN ('requested','approved') UNION ALL SELECT qty FROM exchanges WHERE item_id = ? AND status IN ('requested','approved','collected','ready') UNION ALL SELECT qty FROM exchanges WHERE replacement_item_id = ? AND status = 'shipped')`, itemId, itemId, itemId)!.n;

/** 결제를 기다리다 시간이 지난 주문과, 배송 완료 뒤 7일이 지난 묶음을 정리한다. 화면을 열 때마다 부른다(예약 작업 없이). */
export function housekeeping() {
  run(`UPDATE orders SET status = 'expired', fail_reason = '결제 시간이 지났습니다.' WHERE status = 'pending' AND created_at < datetime('now', ?)`, `-${PENDING_MINUTES} minutes`);
  run(`UPDATE order_groups SET status = 'canceled' WHERE status = 'pending' AND order_id IN (SELECT id FROM orders WHERE status IN ('expired','failed'))`);
  run(
    `UPDATE order_groups SET status = 'confirmed', confirmed_at = datetime('now'), confirm_auto = 1
     WHERE status = 'delivered' AND delivered_at < datetime('now', ?)
       AND NOT EXISTS (SELECT 1 FROM claims c WHERE c.group_id = order_groups.id AND c.status IN ('requested','approved'))
       AND NOT EXISTS (SELECT 1 FROM exchanges e WHERE e.group_id = order_groups.id AND e.status IN ('requested','approved','collected','ready','shipped'))`,
    `-${AUTO_CONFIRM_DAYS} days`,
  );
}

/** 배송 조회: 택배사 연동 전이라 검색으로 연다(실제 배송 조회 연동 전). */
export const trackingUrl = (courier: string, no: string) => `https://search.naver.com/search.naver?query=${encodeURIComponent(`${courier} ${no} 배송조회`)}`;

/**
 * 취소·반품 환불 금액.
 * - 상품 금액: 단가 × 수량
 * - 묶음의 모든 상품이 발송 전에 취소되면 배송비도 돌려준다.
 * - 무료 배송 기준을 넘겨 배송비가 0원이었는데 일부 취소로 기준 아래로 내려가면, 원래 배송비를 뺀다.
 * - 고객 사유 반품: 반품 배송비(편도)를 빼고, 처음에 무료 배송이었으면 왕복으로 뺀다.
 */
export function refundQuote(opts: {
  type: Claim["type"];
  reason: string;
  item: Pick<OrderItem, "unit_price">;
  qty: number;
  group: Pick<OrderGroup, "ship_fee" | "ship_refunded" | "ship_deducted">;
  seller: Pick<Seller, "ship_fee" | "free_ship_over" | "return_fee">;
  /** 이 취소·반품 뒤에도 남는 묶음 상품 금액 */
  remainingAfter: number;
}) {
  const goods = opts.item.unit_price * opts.qty;
  const lines: string[] = [`상품 금액 ${goods.toLocaleString()}원`];
  let ship = 0;
  let deduction = 0;
  const held = opts.group.ship_deducted ?? 0;
  let nextShipDeducted = held;
  let refundOriginalShipping = false;
  if (opts.type === "cancel") {
    if (opts.remainingAfter === 0 && !opts.group.ship_refunded && opts.group.ship_fee > 0) {
      ship = opts.group.ship_fee;
      refundOriginalShipping = true;
      lines.push(`배송비 ${ship.toLocaleString()}원 환불(묶음 전체 취소)`);
    } else if (opts.remainingAfter > 0 && opts.group.ship_fee === 0 && opts.seller.free_ship_over != null && opts.remainingAfter < opts.seller.free_ship_over && opts.seller.ship_fee > 0) {
      const extra = Math.max(0, opts.seller.ship_fee - held);
      deduction += extra;
      nextShipDeducted += Math.min(extra, goods);
      if (extra) lines.push(`무료 배송 기준 아래로 내려가 배송비 ${extra.toLocaleString()}원 차감(묶음당 한 번)`);
    }
    if (opts.remainingAfter === 0 && held) { ship += held; nextShipDeducted = 0; lines.push(`앞서 차감한 배송비 ${held.toLocaleString()}원도 돌려드려요.`); }
  } else if (CLAIM_REASONS[opts.reason]?.buyerFault ?? true) {
    const outbound = opts.group.ship_fee === 0 ? Math.max(0,opts.seller.return_fee - held) : 0;
    const fee = opts.seller.return_fee + outbound;
    nextShipDeducted = held + Math.min(outbound,goods);
    deduction += fee;
    lines.push(`반품 배송비 ${fee.toLocaleString()}원 차감(${outbound ? "편도 + 아직 차감하지 않은 초기 배송비" : "편도 · 초기 배송비 중복 차감 없음"})`);
  } else {
    lines.push("판매자 사유라 반품 배송비 없음");
    if (opts.remainingAfter === 0) {
      if (!opts.group.ship_refunded) { ship += opts.group.ship_fee; refundOriginalShipping = opts.group.ship_fee > 0; }
      ship += held; nextShipDeducted = 0;
      if (ship) lines.push(`묶음 전체 반품으로 배송비 ${ship.toLocaleString()}원 환불`);
    }
  }
  deduction = Math.min(deduction, goods + ship);
  return { goods, ship, deduction, refund: goods + ship - deduction, lines, nextShipDeducted, refundOriginalShipping };
}

/** 정산 대상 묶음의 금액: 결제액 − 환불액, 수수료는 남은 상품 금액에만 */
export function groupSettlement(groupId: number, rate: number) {
  const g = get<OrderGroup>(`SELECT * FROM order_groups WHERE id = ?`, groupId)!;
  const items = all<OrderItem>(`SELECT * FROM order_items WHERE group_id = ?`, groupId);
  const extra = get<{ n: number }>(`SELECT coalesce(sum(o.total_amount),0) AS n FROM orders o JOIN exchanges e ON e.id = o.exchange_id WHERE e.group_id = ? AND o.status = 'paid'`, groupId)!.n;
  const sales = items.filter((i) => !i.exchange_source_id).reduce((s, i) => s + i.amount, 0) + g.ship_fee + extra;
  const refunds = get<{ n: number }>(`SELECT coalesce(sum(amount), 0) AS n FROM refunds WHERE group_id = ? AND status = 'done'`, groupId)!.n;
  const kept = items.reduce((s, i) => s + i.unit_price * liveQty(i), 0);
  const commission = Math.round(kept * rate);
  return { sales, refunds, commission, payout: sales - refunds - commission };
}

/** 오늘 날짜(한국 시간) YYYY-MM-DD */
export const todayKst = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

export function newOrderNo() {
  const d = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10).replaceAll("-", "");
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let tail = "";
  for (let i = 0; i < 6; i++) tail += abc[Math.floor(Math.random() * abc.length)];
  return `${d}-${tail}`;
}

export const isScrapped = (userId: number | undefined, target: "post" | "product", id: number) =>
  !!userId && !!get(`SELECT 1 AS ok FROM scraps WHERE user_id = ? AND target = ? AND target_id = ?`, userId, target, id);
