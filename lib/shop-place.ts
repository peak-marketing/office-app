import { all, get } from "./db";
import { optionText, productDims, type Product, type Sku } from "./shop";
import type { CatalogTemplate, PlacedItem, ProductRef } from "./space/types";

// 실제 상품을 내 공간에 놓기. 상품(옵션)마다 판매자가 입력한 규격으로 가구 템플릿을 만든다.
// 템플릿 종류는 product:<상품>:<옵션>(옵션이 없으면 0)이고, 편집 화면은 catalog:product:… 로 보낸다.
// 부품은 규격 크기의 상자 하나이며, 3D 모델(GLB)이 있으면 3D에서 그 모델로 바꿔 그린다(크기는 규격에 맞춘다).

export const productType = (productId: number, skuId: number | null) => `product:${productId}:${skuId ?? 0}`;

function template(p: Product & { cover: number | null }, sku: Sku | null): CatalogTemplate | null {
  const dims = productDims(p, sku);
  if (!dims) return null;
  const w = dims.w / 1000, d = dims.d / 1000, h = dims.h / 1000;
  const model = p.model_file_id ? `/files/${p.model_file_id}` : null;
  const option = sku ? optionText(p, sku) : "";
  const product: ProductRef = { id: p.id, skuId: sku?.id ?? null, title: p.title, option, h, model, price: p.price + (sku?.add_price ?? 0), cover: p.cover };
  const color = /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : "#c8b8a2";
  return {
    type: productType(p.id, sku?.id ?? null),
    label: p.title.replace(/^\[예시\]\s*/, "").slice(0, 30),
    desc: `${dims.w}×${dims.d}×${dims.h}mm${option ? ` · ${option}` : ""}`,
    w,
    d,
    parts: [{ n: p.title, x: -w / 2, y: -d / 2, z: 0, w, d, h, c: color, p: 1, ...(model ? { m: model } : {}) }],
    bom: [{ type: p.title, spec: `${dims.w}×${dims.d}×${dims.h}mm${option ? ` ${option}` : ""}`, qty: 1, color }],
    product,
  };
}

const PRODUCT_SELECT = `SELECT p.*, (SELECT file_id FROM product_images i WHERE i.product_id = p.id ORDER BY position, file_id LIMIT 1) AS cover FROM products p`;

/** 편집 화면의 ‘상품’ 목록: 판매 중이고 규격이 있는 상품(옵션별 규격이 다르면 옵션마다 하나) */
export function placeableTemplates(limit = 60): CatalogTemplate[] {
  const products = all<Product & { cover: number | null }>(
    `${PRODUCT_SELECT} JOIN sellers s ON s.id = p.seller_id WHERE p.status = 'on_sale' AND s.status = 'approved' AND p.width_mm > 0 AND p.depth_mm > 0 AND p.height_mm > 0 ORDER BY p.id DESC LIMIT ?`,
    limit,
  );
  return products.flatMap((p) => {
    const skus = all<Sku>(`SELECT * FROM product_skus WHERE product_id = ? AND active = 1 ORDER BY id`, p.id);
    const sized = skus.filter((s) => s.width_mm && s.depth_mm && s.height_mm);
    // 옵션마다 규격이 다르면 옵션별로, 아니면 대표 하나(첫 옵션)
    const picks = sized.length ? sized : skus.slice(0, 1);
    return picks.map((s) => template(p, s)).filter((t): t is CatalogTemplate => !!t);
  });
}

/** 저장할 때: 편집 목록에 든 상품 템플릿을 DB에서 다시 만든다(판매 중지된 상품도 이미 놓은 것은 그대로 둔다). */
export function templatesForEdits(edits: { src?: string }[]): CatalogTemplate[] {
  const keys = [...new Set(edits.map((e) => (typeof e?.src === "string" ? e.src.match(/^catalog:product:(\d+):(\d+)$/) : null)).filter((m): m is RegExpMatchArray => !!m).map((m) => `${m[1]}:${m[2]}`))];
  return keys.flatMap((k) => {
    const [pid, sid] = k.split(":").map(Number);
    const t = productTemplate(pid, sid || null);
    return t ? [t] : [];
  });
}

export function productTemplate(productId: number, skuId: number | null): CatalogTemplate | null {
  const p = get<Product & { cover: number | null }>(`${PRODUCT_SELECT} WHERE p.id = ? AND p.status != 'deleted'`, productId);
  if (!p) return null;
  const sku = skuId ? (get<Sku>(`SELECT * FROM product_skus WHERE id = ? AND product_id = ?`, skuId, productId) ?? null) : (get<Sku>(`SELECT * FROM product_skus WHERE product_id = ? AND active = 1 ORDER BY id LIMIT 1`, productId) ?? null);
  return template(p, sku);
}

/** 배치에 놓인 실제 상품 목록(같은 상품·옵션은 개수로 묶음) */
export function placedProducts(items: PlacedItem[]) {
  const map = new Map<string, { ref: ProductRef; qty: number }>();
  for (const it of items) if (it.product) {
    const k = `${it.product.id}:${it.product.skuId ?? 0}`;
    const cur = map.get(k);
    if (cur) cur.qty++;
    else map.set(k, { ref: it.product, qty: 1 });
  }
  return [...map.values()];
}
