import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { hashPassword } from "./password";

// 쇼핑 시연 데이터: 예시 판매자 2곳(판매 전용 1곳, 시공·판매를 함께 하는 예시 업체 1곳)과 예시 상품 10개.
// 상품 사진·3D 모델은 scripts/make-shop-assets.mjs로 만든 개념 모형이며, 화면에 ‘예시 상품 · 실제 판매 아님’으로 표시한다.
// 판매자 사업자 정보는 비워 둔다(실제 사업자가 아님).

type SkuSeed = { opt1?: string; opt2?: string; add?: number; stock: number; dims?: [number, number, number] };
interface ProductSeed {
  code: string;
  seller: 0 | 1;
  title: string;
  category: string;
  brand: string;
  price: number;
  list?: number;
  option1?: string;
  option2?: string;
  dims?: [number, number, number];
  color: string;
  desc: string;
  skus: SkuSeed[];
}

export const SHOP_SEED: ProductSeed[] = [
  { code: "p01", seller: 0, title: "[예시] 3인 패브릭 소파", category: "furniture", brand: "오브제 리빙", price: 690000, list: 790000, option1: "색상", dims: [2100, 900, 820], color: "#d8cbb8", desc: "생활 방수 패브릭 3인 소파(예시 상품).\n좌방석 깊이 약 600mm.", skus: [{ opt1: "베이지", stock: 8 }, { opt1: "그레이", stock: 5 }] },
  { code: "p02", seller: 0, title: "[예시] 원목 상판 책상", category: "office", brand: "오브제 리빙", price: 249000, option1: "크기", dims: [1200, 600, 740], color: "#b88a5a", desc: "오크 무늬목 상판과 철제 다리(예시 상품). 크기별 규격이 달라요.", skus: [{ opt1: "1200", stock: 12, dims: [1200, 600, 740] }, { opt1: "1400", add: 30000, stock: 6, dims: [1400, 700, 740] }] },
  { code: "p03", seller: 0, title: "[예시] 사무용 메시 의자", category: "office", brand: "오브제 리빙", price: 159000, list: 189000, option1: "색상", dims: [640, 640, 1100], color: "#3a3f46", desc: "높이 조절, 팔걸이 포함(예시 상품).", skus: [{ opt1: "블랙", stock: 20 }, { opt1: "그레이", stock: 0 }] },
  { code: "p04", seller: 0, title: "[예시] 5단 책장", category: "storage", brand: "오브제 리빙", price: 129000, dims: [800, 300, 1800], color: "#e9e4dc", desc: "벽 고정 부품 포함(예시 상품).", skus: [{ stock: 15 }] },
  { code: "p05", seller: 0, title: "[예시] 패브릭 침대 프레임", category: "furniture", brand: "오브제 리빙", price: 389000, option1: "크기", dims: [1600, 2100, 900], color: "#cfc2b0", desc: "매트리스 별도(예시 상품).", skus: [{ opt1: "슈퍼싱글", stock: 4, dims: [1100, 2100, 900] }, { opt1: "퀸", add: 60000, stock: 3, dims: [1600, 2100, 900] }] },
  { code: "p06", seller: 0, title: "[예시] 플로어 스탠드 조명", category: "lighting", brand: "오브제 리빙", price: 89000, dims: [400, 400, 1600], color: "#f2efe8", desc: "E26 전구 별도(예시 상품).", skus: [{ stock: 25 }] },
  { code: "p07", seller: 0, title: "[예시] 거실 러그 2000×1400", category: "fabric", brand: "오브제 리빙", price: 119000, dims: [2000, 1400, 12], color: "#a9b3a0", desc: "물세탁 가능(예시 상품).", skus: [{ stock: 10 }] },
  { code: "p08", seller: 0, title: "[예시] 대형 화분 세트", category: "deco", brand: "오브제 리빙", price: 59000, color: "#5c7f4f", desc: "규격이 없는 상품 예시예요. 사진으로만 판매해요.", skus: [{ stock: 30 }] },
  { code: "p09", seller: 0, title: "[예시] 거실 수납장 1200", category: "storage", brand: "오브제 리빙", price: 219000, dims: [1200, 420, 750], color: "#f5f3ef", desc: "3D 모델 없이 규격만 있는 상품 예시예요. 내 공간에서는 같은 크기의 상자로 보여요.", skus: [{ stock: 7 }] },
  { code: "p10", seller: 1, title: "[예시] 모듈 선반 시스템", category: "storage", brand: "스튜디오 온결", price: 349000, dims: [1600, 350, 1200], color: "#2f3338", desc: "시공사가 함께 판매하는 상품 예시예요(같은 파트너가 시공과 판매를 함께 함).", skus: [{ stock: 5 }] },
];

export function addShopExamples(conn: DatabaseSync, uploadDir: string) {
  const insert = (sql: string, ...params: (string | number | null)[]) => Number(conn.prepare(sql).run(...params).lastInsertRowid);
  const assetDir = path.join(process.cwd(), "seed-assets");
  if (conn.prepare(`SELECT 1 AS ok FROM products WHERE is_example = 1`).get()) return;
  // 판매 전용 예시 판매자
  const sellerUser = insert(`INSERT INTO users (email, password_hash, name, phone, role, is_demo) VALUES (?, ?, ?, ?, 'vendor', 1)`, "seller@demo.kr", hashPassword("demo1234"), "오브제 리빙 담당자", "02-000-0000");
  const sellers = [
    insert(
      `INSERT INTO sellers (user_id, name, intro, cs_phone, cs_email, ship_fee, free_ship_over, return_fee, courier, status, approved_at) VALUES (?, ?, ?, ?, ?, 3000, 50000, 3000, 'CJ대한통운', 'approved', datetime('now'))`,
      sellerUser,
      "[예시] 오브제 리빙",
      "시연용 예시 판매자입니다(실제 사업자 아님).",
      "02-000-0000",
      "seller@demo.kr",
    ),
  ];
  // 시공과 판매를 함께 하는 예시 업체(vendor1)
  const v1 = conn.prepare(`SELECT u.id, v.company FROM users u JOIN vendors v ON v.user_id = u.id WHERE u.email = 'vendor1@demo.kr' AND u.is_demo = 1`).get() as { id: number; company: string } | undefined;
  if (v1)
    sellers.push(
      insert(
        `INSERT INTO sellers (user_id, name, intro, cs_phone, cs_email, ship_fee, free_ship_over, return_fee, courier, status, approved_at) VALUES (?, ?, ?, '02-000-0000', 'vendor1@demo.kr', 0, NULL, 30000, '직접 배송', 'approved', datetime('now'))`,
        v1.id,
        v1.company,
        "시공과 판매를 함께 하는 예시 파트너입니다(실제 사업자 아님).",
      ),
    );
  const addFile = (ownerId: number, name: string, mime: string) => {
    const src = path.join(assetDir, name);
    if (!fs.existsSync(src)) return null;
    const stored = `seed-${name}`;
    fs.mkdirSync(uploadDir, { recursive: true });
    fs.copyFileSync(src, path.join(uploadDir, stored));
    return insert(`INSERT INTO files (owner_id, project_id, kind, original_name, stored_name, mime, size, category) VALUES (?, NULL, 'case', ?, ?, ?, ?, ?)`, ownerId, name, stored, mime, fs.statSync(src).size, mime.startsWith("model/") ? "model" : "product");
  };
  for (const p of SHOP_SEED) {
    const sellerId = sellers[p.seller];
    if (!sellerId) continue;
    const owner = (conn.prepare(`SELECT user_id FROM sellers WHERE id = ?`).get(sellerId) as { user_id: number }).user_id;
    const model = addFile(owner, `${p.code}.glb`, "model/gltf-binary");
    const pid = insert(
      `INSERT INTO products (seller_id, title, category, brand, description, price, list_price, option1_name, option2_name, width_mm, depth_mm, height_mm, color, model_file_id, is_example, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'on_sale')`,
      sellerId,
      p.title,
      p.category,
      p.brand,
      p.desc,
      p.price,
      p.list ?? null,
      p.option1 ?? "",
      p.option2 ?? "",
      p.dims?.[0] ?? null,
      p.dims?.[1] ?? null,
      p.dims?.[2] ?? null,
      p.color,
      model,
    );
    [1, 2].forEach((n, i) => {
      const fid = addFile(owner, `${p.code}-${n}.jpg`, "image/jpeg");
      if (fid) insert(`INSERT INTO product_images (product_id, file_id, position) VALUES (?, ?, ?)`, pid, fid, i);
    });
    for (const s of p.skus)
      insert(
        `INSERT INTO product_skus (product_id, opt1, opt2, add_price, stock, width_mm, depth_mm, height_mm) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        pid,
        s.opt1 ?? "",
        s.opt2 ?? "",
        s.add ?? 0,
        s.stock,
        s.dims?.[0] ?? null,
        s.dims?.[1] ?? null,
        s.dims?.[2] ?? null,
      );
  }
}
