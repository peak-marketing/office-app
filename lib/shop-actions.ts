"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUser, requireUser } from "./auth";
import type { FormState } from "./actions";
import { all, get, run, transaction } from "./db";
import { adminIds, notify } from "./notify";
import { completeClaim, finalizePaid } from "./order-flow";
import { getSeller, getSellerByUser } from "./partner";
import { currentPg } from "./payments";
import { activeExchange } from "./exchanges";
import { moneyBusy } from "./refund-flow";
import {
  CATEGORIES,
  CLAIM_REASONS,
  cartLines,
  cartSummary,
  claimedQty,
  getOrderByNo,
  groupSettlement,
  lineProblem,
  liveQty,
  newOrderNo,
  optionText,
  type Claim,
  type Order,
  type OrderGroup,
  type OrderItem,
  type Product,
} from "./shop";
import { checkUploads, filesOf, saveUploads } from "./uploads";
import { placedProducts } from "./shop-place";
import type { PlacedItem } from "./space/types";

const str = (fd: FormData, key: string, max = 200) => String(fd.get(key) ?? "").trim().slice(0, max);
const int = (v: unknown) => {
  const raw = String(v ?? "").replaceAll(",", "").trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : NaN;
};
const refresh = () => revalidatePath("/", "layout");

async function sellerSession() {
  const user = await requireUser("vendor");
  const seller = getSellerByUser(user.id);
  if (!seller) redirect("/partner");
  return { user, seller };
}

// ── 판매자: 상품
interface SkuInput {
  opt1: string;
  opt2: string;
  add_price: number;
  stock: number;
  active: boolean;
  width_mm: number | null;
  depth_mm: number | null;
  height_mm: number | null;
}

function parseSkus(raw: string, opt1Name: string, opt2Name: string): SkuInput[] | string {
  let rows: unknown;
  try {
    rows = JSON.parse(raw || "[]");
  } catch {
    return "옵션 정보를 읽지 못했습니다.";
  }
  if (!Array.isArray(rows) || rows.length === 0) return "판매할 옵션(또는 단일 상품)을 하나 이상 넣어 주세요.";
  if (rows.length > 100) return "옵션 조합은 100개까지 만들 수 있습니다.";
  const seen = new Set<string>();
  const out: SkuInput[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const opt1 = opt1Name ? String(r.opt1 ?? "").trim().slice(0, 30) : "";
    const opt2 = opt2Name ? String(r.opt2 ?? "").trim().slice(0, 30) : "";
    if ((opt1Name && !opt1) || (opt2Name && !opt2)) return "옵션 값이 비어 있는 줄이 있습니다.";
    const key = `${opt1}\u0000${opt2}`;
    if (seen.has(key)) return `같은 옵션 조합이 두 번 있습니다: ${[opt1, opt2].filter(Boolean).join(" / ")}`;
    seen.add(key);
    const add = int(r.add_price) ?? 0;
    const stock = int(r.stock) ?? 0;
    if (Number.isNaN(add) || Math.abs(add) > 10_000_000) return "옵션 추가 금액을 확인해 주세요.";
    if (Number.isNaN(stock) || stock < 0 || stock > 99_999) return "재고는 0~99,999개로 넣어 주세요.";
    const dim = (k: string) => {
      const v = int(r[k]);
      return v && v > 0 && v <= 20000 ? v : null;
    };
    out.push({ opt1, opt2, add_price: add, stock, active: r.active !== false, width_mm: dim("width_mm"), depth_mm: dim("depth_mm"), height_mm: dim("height_mm") });
  }
  return out;
}

/** 상품 등록·수정. intent: save(임시 저장) · publish(판매 시작) · pause(판매 중지) */
export async function saveProduct(productId: number | null, _: FormState, fd: FormData): Promise<FormState> {
  const { user, seller } = await sellerSession();
  const existing = productId ? get<Product>(`SELECT * FROM products WHERE id = ? AND seller_id = ?`, productId, seller.id) : undefined;
  if (productId && !existing) return { error: "상품을 찾을 수 없습니다." };
  if (existing?.status === "blocked") return { error: `운영자가 숨긴 상품이라 고칠 수 없습니다: ${existing.block_reason}` };
  const title = str(fd, "title", 80);
  const category = str(fd, "category");
  const price = int(fd.get("price"));
  const listPrice = int(fd.get("list_price"));
  const opt1Name = str(fd, "option1_name", 20);
  const opt2Name = opt1Name ? str(fd, "option2_name", 20) : "";
  if (!title) return { error: "상품명을 입력해 주세요." };
  if (!CATEGORIES.some((c) => c.key === category)) return { error: "카테고리를 골라 주세요." };
  if (price == null || Number.isNaN(price) || price < 100 || price > 100_000_000) return { error: "판매가를 100원~1억 원으로 입력해 주세요." };
  if (Number.isNaN(listPrice) || (listPrice != null && listPrice < price)) return { error: "정가는 비우거나 판매가 이상으로 입력해 주세요." };
  const dims = ["width_mm", "depth_mm", "height_mm"].map((k) => int(fd.get(k)));
  if (dims.some((d) => Number.isNaN(d) || (d != null && (d <= 0 || d > 20000)))) return { error: "규격은 1~20,000mm로 입력해 주세요." };
  if (dims.some((d) => d != null) && dims.some((d) => d == null)) return { error: "규격은 가로·깊이·높이를 모두 넣거나 모두 비워 주세요." };
  const skus = parseSkus(str(fd, "skus", 50_000), opt1Name, opt2Name);
  if (typeof skus === "string") return { error: skus };
  if (skus.some((s) => !Number.isSafeInteger(price + s.add_price) || price + s.add_price < 100 || price + s.add_price > 100_000_000))
    return { error: "옵션을 적용한 최종 판매가도 100원~1억 원이어야 합니다." };
  const images = filesOf(fd, "images");
  const models = filesOf(fd, "model");
  const upErr = checkUploads(images, "image", 10) ?? checkUploads(models, "model", 1);
  if (upErr) return { error: upErr };
  const keepImages = existing ? all<{ file_id: number }>(`SELECT file_id FROM product_images WHERE product_id = ?`, existing.id).map((r) => r.file_id).filter((id) => !fd.getAll("removeImage").map(Number).includes(id)) : [];
  if (keepImages.length + images.length > 10) return { error: "사진은 10장까지 올릴 수 있습니다." };
  const intent = str(fd, "intent") || "save";
  if (intent === "publish") {
    if (seller.status !== "approved") return { error: "판매자 승인 뒤 판매를 시작할 수 있습니다. 지금은 임시 저장해 두세요." };
    if (keepImages.length + images.length === 0) return { error: "판매하려면 상품 사진을 한 장 이상 올려 주세요." };
    if (!skus.some((s) => s.active)) return { error: "판매할 옵션이 하나 이상 있어야 합니다." };
  }
  let modelId: number | null | undefined;
  let imageIds: number[] = [];
  try {
    imageIds = await saveUploads(images, "image", user.id, "product", "public");
    if (models.length) [modelId] = await saveUploads(models, "model", user.id, "model", "public");
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (fd.get("removeModel") && !models.length) modelId = null;
  const status = intent === "publish" ? "on_sale" : intent === "pause" ? "paused" : existing && existing.status !== "draft" ? existing.status : "draft";
  const id = transaction(() => {
    const values = [title, category, str(fd, "brand", 40), str(fd, "description", 4000), price, listPrice, opt1Name, opt2Name, dims[0], dims[1], dims[2], /^#[0-9a-f]{6}$/i.test(str(fd, "color")) ? str(fd, "color") : ""] as const;
    let pid: number;
    if (existing) {
      pid = existing.id;
      run(
        `UPDATE products SET title = ?, category = ?, brand = ?, description = ?, price = ?, list_price = ?, option1_name = ?, option2_name = ?, width_mm = ?, depth_mm = ?, height_mm = ?, color = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
        ...values,
        status,
        pid,
      );
    } else
      pid = run(
        `INSERT INTO products (seller_id, title, category, brand, description, price, list_price, option1_name, option2_name, width_mm, depth_mm, height_mm, color, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        seller.id,
        ...values,
        status,
      );
    if (modelId !== undefined) run(`UPDATE products SET model_file_id = ? WHERE id = ?`, modelId, pid);
    for (const fid of fd.getAll("removeImage").map(Number)) run(`DELETE FROM product_images WHERE product_id = ? AND file_id = ?`, pid, fid);
    const base = get<{ n: number }>(`SELECT coalesce(max(position), -1) AS n FROM product_images WHERE product_id = ?`, pid)!.n;
    imageIds.forEach((fid, i) => run(`INSERT INTO product_images (product_id, file_id, position) VALUES (?, ?, ?)`, pid, fid, base + 1 + i));
    // 옵션: 같은 조합은 고치고, 새 조합은 더하고, 빠진 조합은 판매 중지로 둔다(지난 주문이 가리키므로 지우지 않는다).
    const old = all<{ id: number; opt1: string; opt2: string }>(`SELECT id, opt1, opt2 FROM product_skus WHERE product_id = ?`, pid);
    for (const s of skus) {
      const hit = old.find((o) => o.opt1 === s.opt1 && o.opt2 === s.opt2);
      if (hit) run(`UPDATE product_skus SET add_price = ?, stock = ?, active = ?, width_mm = ?, depth_mm = ?, height_mm = ? WHERE id = ?`, s.add_price, s.stock, s.active ? 1 : 0, s.width_mm, s.depth_mm, s.height_mm, hit.id);
      else run(`INSERT INTO product_skus (product_id, opt1, opt2, add_price, stock, active, width_mm, depth_mm, height_mm) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, pid, s.opt1, s.opt2, s.add_price, s.stock, s.active ? 1 : 0, s.width_mm, s.depth_mm, s.height_mm);
    }
    for (const o of old) if (!skus.some((s) => s.opt1 === o.opt1 && s.opt2 === o.opt2)) run(`UPDATE product_skus SET active = 0 WHERE id = ?`, o.id);
    return pid;
  });
  refresh();
  if (!existing) redirect(`/seller/products/${id}?saved=1`);
  return { ok: status === "on_sale" ? "저장했습니다. 쇼핑에 판매 중으로 보여요." : status === "paused" ? "판매를 멈췄습니다." : "임시 저장했습니다. 판매를 시작하면 쇼핑에 보여요." };
}

export async function deleteProduct(productId: number) {
  const { seller } = await sellerSession();
  run(`UPDATE products SET status = 'deleted', updated_at = datetime('now') WHERE id = ? AND seller_id = ? AND status != 'blocked'`, productId, seller.id);
  refresh();
  redirect("/seller/products");
}

// ── 운영자: 상품 숨김
export async function setProductBlock(productId: number, fd: FormData) {
  await requireUser("admin");
  const product = get<Product>(`SELECT * FROM products WHERE id = ?`, productId);
  if (!product) return;
  if (str(fd, "do") === "block") {
    const reason = str(fd, "reason", 300) || "운영 정책 위반";
    run(`UPDATE products SET status = 'blocked', block_reason = ? WHERE id = ?`, reason, productId);
    notify([getSeller(product.seller_id)?.user_id], { title: `상품이 숨겨졌습니다: ${product.title}`, body: reason, href: `/seller/products/${productId}`, email: true });
  } else run(`UPDATE products SET status = 'paused', block_reason = '' WHERE id = ? AND status = 'blocked'`, productId);
  refresh();
}

// ── 스크랩(공간 글·상품)
export async function toggleScrap(target: "post" | "product", id: number): Promise<{ on: boolean; login?: boolean }> {
  const user = await currentUser();
  if (!user || user.role !== "customer") return { on: false, login: true };
  const exists = get(`SELECT 1 AS ok FROM scraps WHERE user_id = ? AND target = ? AND target_id = ?`, user.id, target, id);
  if (exists) run(`DELETE FROM scraps WHERE user_id = ? AND target = ? AND target_id = ?`, user.id, target, id);
  else run(`INSERT INTO scraps (user_id, target, target_id) VALUES (?, ?, ?)`, user.id, target, id);
  refresh();
  return { on: !exists };
}

// ── 장바구니
/** 장바구니 담기·바로 구매. 로그인하지 않았으면 로그인 뒤 상품으로 돌아온다. */
export async function addToCart(_: FormState, fd: FormData): Promise<FormState> {
  const productId = int(fd.get("product"));
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/shop/products/${productId}`)}`);
  if (user.role !== "customer") return { error: "고객 계정으로 구매할 수 있습니다." };
  const skuId = int(fd.get("sku"));
  const qty = int(fd.get("qty")) ?? 1;
  if (!skuId || Number.isNaN(skuId)) return { error: "옵션을 골라 주세요." };
  if (!qty || Number.isNaN(qty) || qty < 1 || qty > 99) return { error: "수량을 1~99개로 골라 주세요." };
  const sku = get<{ id: number; stock: number; active: number; status: string; sstatus: string; unit_price: number }>(
    `SELECT k.id, k.stock, k.active, p.status, p.price + k.add_price AS unit_price, s.status AS sstatus FROM product_skus k JOIN products p ON p.id = k.product_id JOIN sellers s ON s.id = p.seller_id WHERE k.id = ? AND k.product_id = ?`,
    skuId,
    productId,
  );
  if (!sku || !sku.active || sku.status !== "on_sale" || sku.sstatus !== "approved") return { error: "판매 중인 옵션이 아닙니다." };
  if (!Number.isSafeInteger(sku.unit_price) || sku.unit_price < 100 || sku.unit_price > 100_000_000) return { error: "상품의 최종 판매가를 확인해야 합니다." };
  const projectId = int(fd.get("project"));
  const project = projectId && !Number.isNaN(projectId) ? get<{ id: number }>(`SELECT id FROM projects WHERE id = ? AND customer_id = ?`, projectId, user.id) : undefined;
  if (str(fd, "intent") === "buy") {
    if (qty > sku.stock) return { error: sku.stock ? `재고가 ${sku.stock}개 남았어요.` : "품절이에요." };
    run(
      `INSERT INTO cart_items (user_id, sku_id, qty, project_id) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, sku_id) DO UPDATE SET qty = excluded.qty, project_id = coalesce(excluded.project_id, project_id)`,
      user.id,
      skuId,
      qty,
      project?.id ?? null,
    );
    redirect(`/checkout?sku=${skuId}`);
  }
  const inCart = get<{ qty: number }>(`SELECT qty FROM cart_items WHERE user_id = ? AND sku_id = ?`, user.id, skuId)?.qty ?? 0;
  if (inCart + qty > sku.stock) return { error: sku.stock ? `재고가 ${sku.stock}개라 더 담을 수 없어요(장바구니 ${inCart}개).` : "품절이에요." };
  run(
    `INSERT INTO cart_items (user_id, sku_id, qty, project_id) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, sku_id) DO UPDATE SET qty = qty + excluded.qty, project_id = coalesce(excluded.project_id, project_id), added_at = datetime('now')`,
    user.id,
    skuId,
    qty,
    project?.id ?? null,
  );
  refresh();
  return { ok: "장바구니에 담았어요." };
}

export async function setCartQty(skuId: number, qty: number) {
  const user = await requireUser("customer");
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) return;
  run(`UPDATE cart_items SET qty = ? WHERE user_id = ? AND sku_id = ?`, qty, user.id, skuId);
  refresh();
}

export async function removeCartItems(skuIds: number[]) {
  const user = await requireUser("customer");
  for (const id of skuIds) run(`DELETE FROM cart_items WHERE user_id = ? AND sku_id = ?`, user.id, id);
  refresh();
}

// ── 주문·결제
/** 주문서 제출: 고른 장바구니 상품으로 결제 대기 주문을 만들고 결제 화면으로 간다. 재고는 결제 승인 때 확인해 뺀다. */
export async function createOrder(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser("customer");
  const skuIds = fd.getAll("sku").map(Number).filter(Number.isInteger);
  const lines = cartLines(user.id, skuIds);
  if (!lines.length) return { error: "주문할 상품이 없습니다. 장바구니를 확인해 주세요." };
  const problem = lines.map((l) => [l.title, lineProblem(l)] as const).find(([, p]) => p);
  if (problem) return { error: `${problem[0]}: ${problem[1]}` };
  const recipient = str(fd, "recipient", 30);
  const phone = str(fd, "phone", 20);
  const address1 = str(fd, "address1");
  if (!recipient || !phone || !address1) return { error: "받는 분, 연락처, 주소를 입력해 주세요." };
  if (!/^[\d-]{9,14}$/.test(phone)) return { error: "연락처를 숫자로 입력해 주세요." };
  if (!fd.get("agree")) return { error: "주문 내용 확인과 결제 진행에 동의해 주세요." };
  const sum = cartSummary(lines);
  if (!Number.isSafeInteger(sum.total) || sum.total <= 0 || sum.total > 1_000_000_000) return { error: "주문 금액을 확인해 주세요. 한 주문은 10억 원 이하입니다." };
  const no = newOrderNo();
  const title = lines.length > 1 ? `${lines[0].title} 외 ${lines.length - 1}건` : lines[0].title;
  transaction(() => {
    const orderId = run(
      `INSERT INTO orders (no, user_id, title, items_amount, ship_amount, total_amount, recipient, phone, zipcode, address1, address2, memo, pg) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      no,
      user.id,
      title.slice(0, 80),
      sum.items,
      sum.ship,
      sum.total,
      recipient,
      phone,
      str(fd, "zipcode", 10),
      address1,
      str(fd, "address2"),
      str(fd, "memo", 100),
      currentPg(),
    );
    for (const g of sum.groups) {
      const policy = getSeller(g.seller_id)!;
      const groupId = run(`INSERT INTO order_groups (order_id, seller_id, ship_fee, shipping_policy) VALUES (?, ?, ?, ?)`, orderId, g.seller_id, g.ship, JSON.stringify({ ship_fee: policy.ship_fee, free_ship_over: policy.free_ship_over, return_fee: policy.return_fee }));
      for (const l of g.lines)
        run(
          `INSERT INTO order_items (order_id, group_id, product_id, sku_id, title, option_text, unit_price, qty, amount, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          orderId,
          groupId,
          l.product_id,
          l.sku_id,
          l.title,
          optionText(l, l),
          l.price + l.add_price,
          l.qty,
          (l.price + l.add_price) * l.qty,
          l.project_id,
        );
    }
  });
  redirect(`/pay/${no}`);
}

async function myPendingOrder(no: string) {
  const user = await requireUser("customer");
  const order = getOrderByNo(no);
  if (!order || order.user_id !== user.id) redirect("/orders");
  return order;
}

/** 테스트 결제(키가 없을 때만): 결제 완료 또는 실패로 처리한다. 실제 돈이 오가지 않는다. */
export async function payTest(no: string, outcome: "ok" | "fail") {
  const order = await myPendingOrder(no);
  if (order.pg !== "test" || order.status !== "pending") redirect(`/orders/${no}`);
  if (outcome === "fail") {
    run(`UPDATE orders SET status = 'failed', fail_reason = '테스트 결제에서 실패를 골랐습니다.' WHERE id = ?`, order.id);
    run(`UPDATE order_groups SET status = 'canceled' WHERE order_id = ?`, order.id);
    refresh();
    redirect(`/orders/${no}`);
  }
  const r = await finalizePaid(order.id, "test", `test_${order.no}`, "테스트 결제");
  refresh();
  redirect(`/orders/${no}${r.ok ? "?paid=1" : ""}`);
}

// ── 고객: 취소·반품·구매 확정
async function myItem(itemId: number) {
  const user = await requireUser("customer");
  const item = get<OrderItem>(`SELECT * FROM order_items WHERE id = ?`, itemId);
  const order = item ? get<Order>(`SELECT * FROM orders WHERE id = ? AND user_id = ?`, item.order_id, user.id) : undefined;
  if (!item || !order) redirect("/orders");
  const group = get<OrderGroup>(`SELECT * FROM order_groups WHERE id = ?`, item.group_id)!;
  return { user, item, order, group };
}

function claimInput(fd: FormData, item: OrderItem) {
  const qty = int(fd.get("qty")) ?? 1;
  const reason = str(fd, "reason_code");
  const left = liveQty(item) - claimedQty(item.id);
  if (!CLAIM_REASONS[reason]) return { error: "사유를 골라 주세요." } as const;
  if (!qty || Number.isNaN(qty) || qty < 1 || qty > left) return { error: left > 0 ? `수량은 1~${left}개로 골라 주세요.` : "이미 취소·반품을 신청한 상품입니다." } as const;
  return { qty, reason, detail: str(fd, "reason", 300) } as const;
}

/** 주문 취소. 결제 완료(판매자 확인 전)면 바로 환불하고, 배송 준비 중이면 판매자에게 취소를 요청한다. 발송 뒤에는 반품으로 진행한다. */
export async function cancelItem(itemId: number, _: FormState, fd: FormData): Promise<FormState> {
  const { user, item, order, group } = await myItem(itemId);
  if (order.status !== "paid" || !["paid", "preparing"].includes(group.status)) return { error: "발송이 시작되어 취소할 수 없어요. 받은 뒤 반품을 신청해 주세요." };
  const input = claimInput(fd, item);
  if ("error" in input) return { error: input.error };
  const claimId = run(`INSERT INTO claims (order_id, group_id, item_id, user_id, type, reason_code, reason, qty) VALUES (?, ?, ?, ?, 'cancel', ?, ?, ?)`, order.id, group.id, item.id, user.id, input.reason, input.detail, input.qty);
  const seller = getSeller(group.seller_id)!;
  if (group.status === "paid") {
    const r = await completeClaim(claimId, true);
    if (!r.ok) {
      run(`UPDATE claims SET status = 'requested' WHERE id = ?`, claimId);
      notify([seller.user_id], { title: `취소 요청: ${item.title}`, body: "자동 환불에 실패해 판매자 확인이 필요합니다.", href: "/seller/claims" });
      refresh();
      return { error: `환불에 실패해 판매자에게 취소를 요청했어요: ${r.error}` };
    }
    notify([seller.user_id], { title: `주문 취소: ${item.title} ${input.qty}개`, body: "발송 전 고객이 취소해 환불되었습니다.", href: "/seller/orders" });
    refresh();
    redirect(`/orders/${order.no}?done=canceled&refund=${r.refund}`);
  }
  notify([seller.user_id], { title: `취소 요청: ${item.title} ${input.qty}개`, body: "배송 준비 중인 주문입니다. 발송 전이면 승인해 주세요.", href: "/seller/claims", email: true });
  refresh();
  redirect(`/orders/${order.no}?done=cancel-requested`);
}

/** 반품 신청: 배송이 시작된 뒤, 구매 확정 전 */
export async function requestReturn(itemId: number, _: FormState, fd: FormData): Promise<FormState> {
  const { user, item, order, group } = await myItem(itemId);
  if (!["shipped", "delivered"].includes(group.status)) return { error: group.status === "confirmed" ? "구매 확정한 주문은 반품을 신청할 수 없어요. 판매자 고객센터로 문의해 주세요." : "발송 전에는 취소를 이용해 주세요." };
  const input = claimInput(fd, item);
  if ("error" in input) return { error: input.error };
  run(`INSERT INTO claims (order_id, group_id, item_id, user_id, type, reason_code, reason, qty) VALUES (?, ?, ?, ?, 'return', ?, ?, ?)`, order.id, group.id, item.id, user.id, input.reason, input.detail, input.qty);
  notify([getSeller(group.seller_id)?.user_id], { title: `반품 요청: ${item.title} ${input.qty}개`, body: `사유: ${CLAIM_REASONS[input.reason].label}`, href: "/seller/claims", email: true });
  refresh();
  redirect(`/orders/${order.no}?done=return-requested`);
}

export async function withdrawClaim(claimId: number) {
  const user = await requireUser("customer");
  const claim = get<Claim>(`SELECT * FROM claims WHERE id = ? AND user_id = ?`, claimId, user.id);
  if (!claim || moneyBusy(claim.group_id)) return;
  run(`UPDATE claims SET status = 'withdrawn', resolved_at = datetime('now') WHERE id = ? AND user_id = ? AND status = 'requested'`, claimId, user.id);
  refresh();
}

export async function confirmPurchase(groupId: number) {
  const user = await requireUser("customer");
  const group = get<OrderGroup & { user_id: number }>(`SELECT g.*, o.user_id FROM order_groups g JOIN orders o ON o.id = g.order_id WHERE g.id = ?`, groupId);
  if (!group || group.user_id !== user.id || !["shipped", "delivered"].includes(group.status)) return;
  if (get(`SELECT 1 AS ok FROM claims WHERE group_id = ? AND status IN ('requested','approved')`, groupId) || get(`SELECT 1 FROM exchanges WHERE group_id = ? AND status IN ('requested','approved','collected','ready','shipped')`, groupId)) return;
  run(`UPDATE order_groups SET status = 'confirmed', confirmed_at = datetime('now'), delivered_at = coalesce(delivered_at, datetime('now')) WHERE id = ?`, groupId);
  refresh();
}

// ── 판매자: 주문 처리
async function myGroup(groupId: number) {
  const user = await requireUser("vendor", "admin");
  const group = get<OrderGroup>(`SELECT * FROM order_groups WHERE id = ?`, groupId);
  if (!group) redirect("/seller/orders");
  if (user.role === "vendor" && getSellerByUser(user.id)?.id !== group.seller_id) redirect("/seller/orders");
  return { user, group };
}

/** 발주 확인(배송 준비) → 발송(택배사·송장) → 배송 완료 */
export async function updateGroup(groupId: number, _: FormState, fd: FormData): Promise<FormState> {
  const { group } = await myGroup(groupId);
  const action = str(fd, "do");
  if (activeExchange(groupId)) return { error: "진행 중인 교환은 교환 메뉴에서 먼저 처리해 주세요." };
  const order = get<Order>(`SELECT * FROM orders WHERE id = ?`, group.order_id)!;
  const open = get(`SELECT 1 AS ok FROM claims WHERE group_id = ? AND type = 'cancel' AND status = 'requested'`, groupId);
  if (action === "prepare" && group.status === "paid") run(`UPDATE order_groups SET status = 'preparing' WHERE id = ?`, groupId);
  else if (action === "ship" && ["paid", "preparing"].includes(group.status)) {
    if (open) return { error: "처리하지 않은 취소 요청이 있습니다. 먼저 승인하거나 거절해 주세요." };
    const courier = str(fd, "courier", 30);
    const tracking = str(fd, "tracking_no", 40).replace(/\s/g, "");
    if (!courier || !tracking) return { error: "택배사와 송장번호를 입력해 주세요." };
    run(`UPDATE order_groups SET status = 'shipped', courier = ?, tracking_no = ?, shipped_at = datetime('now') WHERE id = ?`, courier, tracking, groupId);
    notify([order.user_id], { title: "상품이 발송되었습니다", body: `${courier} ${tracking}`, href: `/orders/${order.no}` });
  } else if (action === "deliver" && group.status === "shipped") {
    run(`UPDATE order_groups SET status = 'delivered', delivered_at = datetime('now') WHERE id = ?`, groupId);
    notify([order.user_id], { title: "배송이 완료되었습니다", body: "상품을 확인하고 구매를 확정해 주세요. 7일이 지나면 자동으로 구매 확정됩니다.", href: `/orders/${order.no}` });
  } else return { error: "지금 상태에서는 할 수 없는 처리입니다." };
  refresh();
  return { ok: "처리했습니다." };
}

/** 판매자(또는 운영자): 취소·반품 요청 처리 */
export async function resolveClaim(claimId: number, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser("vendor", "admin");
  const claim = get<Claim>(`SELECT * FROM claims WHERE id = ?`, claimId);
  if (!claim) return { error: "요청을 찾을 수 없습니다." };
  const group = get<OrderGroup>(`SELECT * FROM order_groups WHERE id = ?`, claim.group_id)!;
  if (user.role === "vendor" && getSellerByUser(user.id)?.id !== group.seller_id) return { error: "권한이 없습니다." };
  const decision = str(fd, "do");
  const note = str(fd, "note", 300);
  const order = get<Order>(`SELECT * FROM orders WHERE id = ?`, claim.order_id)!;
  if (decision === "reject") {
    if (moneyBusy(group.id)) return { error: "환불을 먼저 완료해야 거절할 수 있습니다." };
    if (!["requested", "approved"].includes(claim.status)) return { error: "이미 처리된 요청입니다." };
    if (!note) return { error: "거절 사유를 적어 주세요. 고객에게 그대로 보입니다." };
    run(`UPDATE claims SET status = 'rejected', seller_note = ?, resolved_at = datetime('now') WHERE id = ?`, note, claimId);
    notify([claim.user_id], { title: `${claim.type === "cancel" ? "취소" : "반품"} 요청이 거절되었습니다`, body: note, href: `/orders/${order.no}` });
    if (user.role === "vendor") notify(adminIds(), { title: `판매자 ${claim.type === "cancel" ? "취소" : "반품"} 거절: 주문 ${order.no}`, body: note, href: `/admin/orders?q=${order.no}` });
    refresh();
    return { ok: "거절했습니다." };
  }
  if (claim.type === "return" && claim.status === "requested" && decision === "approve") {
    run(`UPDATE claims SET status = 'approved', seller_note = ? WHERE id = ?`, note, claimId);
    notify([claim.user_id], { title: "반품이 승인되었습니다", body: note || "회수가 진행됩니다. 상품을 포장해 두세요. 회수 확인 뒤 환불됩니다.", href: `/orders/${order.no}` });
    refresh();
    return { ok: "반품을 승인했습니다. 상품을 회수한 뒤 ‘회수 확인·환불’을 눌러 주세요." };
  }
  const ready = (claim.type === "cancel" && claim.status === "requested" && decision === "approve") || (claim.type === "return" && claim.status === "approved" && decision === "complete");
  if (!ready) return { error: "지금 상태에서는 할 수 없는 처리입니다." };
  if (claim.type === "cancel" && !["paid", "preparing"].includes(group.status)) return { error: "이미 발송한 주문은 취소 대신 반품으로 처리합니다. 거절 사유에 안내해 주세요." };
  const r = await completeClaim(claimId, claim.type === "cancel" || !!fd.get("restock"), note);
  refresh();
  return r.ok ? { ok: `환불했습니다 (${r.refund.toLocaleString()}원).` } : { error: r.error };
}

// ── 운영자: 정산
/** 기준일까지 구매 확정된 묶음을 판매자별로 모아 정산서를 만든다. 실제 이체는 운영자가 따로 하고 ‘지급 완료’로 기록한다. */
export async function createSettlements(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireUser("admin");
  const cutoff = str(fd, "cutoff", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) return { error: "정산 기준일을 골라 주세요." };
  const end = `${cutoff} 23:59:59`;
  const sellers = all<{ seller_id: number }>(`SELECT DISTINCT seller_id FROM order_groups WHERE status = 'confirmed' AND settlement_id IS NULL AND confirmed_at <= datetime(?, '-9 hours')`, end);
  let made = 0;
  for (const { seller_id } of sellers) {
    const seller = getSeller(seller_id)!;
    transaction(() => {
      const groups = all<{ id: number }>(`SELECT id FROM order_groups WHERE seller_id = ? AND status = 'confirmed' AND settlement_id IS NULL AND confirmed_at <= datetime(?, '-9 hours')`, seller_id, end);
      if (!groups.length) return;
      const sums = groups.map((g) => groupSettlement(g.id, seller.commission_rate));
      const total = (k: keyof (typeof sums)[number]) => sums.reduce((s, x) => s + x[k], 0);
      const id = run(
        `INSERT INTO settlements (seller_id, period_end, groups, sales, refunds, commission, payout, rate, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        seller_id,
        cutoff,
        groups.length,
        total("sales"),
        total("refunds"),
        total("commission"),
        total("payout"),
        seller.commission_rate,
        admin.id,
      );
      for (const g of groups) run(`UPDATE order_groups SET settlement_id = ? WHERE id = ?`, id, g.id);
      made++;
      notify([seller.user_id], { title: `정산 예정: ${cutoff}까지 구매 확정분`, body: `지급 예정 ${total("payout").toLocaleString()}원 (주문 ${groups.length}건)`, href: "/seller/settlements" });
    });
  }
  refresh();
  return made ? { ok: `판매자 ${made}곳의 정산서를 만들었습니다.` } : { error: "기준일까지 구매 확정되고 아직 정산하지 않은 주문이 없습니다." };
}

export async function markSettlementPaid(settlementId: number, fd: FormData) {
  await requireUser("admin");
  const s = get<{ seller_id: number; payout: number; status: string }>(`SELECT seller_id, payout, status FROM settlements WHERE id = ?`, settlementId);
  if (!s || s.status === "paid") return;
  run(`UPDATE settlements SET status = 'paid', paid_at = datetime('now'), memo = ? WHERE id = ?`, str(fd, "memo", 200), settlementId);
  notify([getSeller(s.seller_id)?.user_id], { title: "정산금이 지급되었습니다", body: `${s.payout.toLocaleString()}원 (운영자가 지급 완료로 기록)`, href: "/seller/settlements" });
  refresh();
}

/** 내 공간(지금 버전)에 놓은 실제 상품을 모두 장바구니에 담는다(내 공간 연결). 재고가 모자라거나 판매 중이 아니면 건너뛴다. */
export async function addPlacedToCart(projectId: number) {
  const user = await requireUser("customer");
  const project = get<{ id: number; current_version_id: number | null }>(`SELECT id, current_version_id FROM projects WHERE id = ? AND customer_id = ?`, projectId, user.id);
  if (!project) redirect("/projects");
  const v = get<{ placement: string | null; rooms: string | null; house: string | null }>(`SELECT placement, rooms, house FROM versions WHERE id = ?`, project.current_version_id ?? -1);
  const parse = <T,>(raw: string | null | undefined, fallback: T): T => {
    try {
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  };
  const items = [
    ...parse<{ items: PlacedItem[] }>(v?.placement, { items: [] }).items,
    ...parse<{ items: PlacedItem[] }[]>(v?.rooms, []).flatMap((r) => r.items),
    ...parse<{ items: PlacedItem[] } | null>(v?.house, null)?.items ?? [],
  ];
  let added = 0;
  for (const { ref, qty } of placedProducts(items)) {
    if (!ref.skuId) continue;
    const sku = get<{ stock: number; ok: number }>(
      `SELECT k.stock, (k.active = 1 AND p.status = 'on_sale' AND s.status = 'approved') AS ok FROM product_skus k JOIN products p ON p.id = k.product_id JOIN sellers s ON s.id = p.seller_id WHERE k.id = ?`,
      ref.skuId,
    );
    if (!sku?.ok || sku.stock <= 0) continue;
    run(
      `INSERT INTO cart_items (user_id, sku_id, qty, project_id) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, sku_id) DO UPDATE SET qty = max(qty, excluded.qty), project_id = excluded.project_id`,
      user.id,
      ref.skuId,
      Math.min(qty, sku.stock, 99),
      projectId,
    );
    added++;
  }
  refresh();
  redirect(`/cart${added ? "" : "?none=1"}`);
}
