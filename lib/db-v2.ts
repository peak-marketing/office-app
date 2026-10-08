import type { DatabaseSync } from "node:sqlite";

// 2차 통합: 판매자 입점 쇼핑, 커뮤니티, 업체 직접 참여 입찰. 기존 표는 바꾸지 않고 표와 컬럼만 더한다.
// 파일은 기존 files 표를 쓴다(kind 'case' = 누구나 볼 수 있는 공개 파일, category로 구분: post·product·model).

const SCHEMA_V2 = `
CREATE TABLE IF NOT EXISTS sellers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  name TEXT NOT NULL,
  intro TEXT NOT NULL DEFAULT '',
  biz_no TEXT NOT NULL DEFAULT '',
  ceo TEXT NOT NULL DEFAULT '',
  biz_address TEXT NOT NULL DEFAULT '',
  mail_order_no TEXT NOT NULL DEFAULT '',
  cs_phone TEXT NOT NULL DEFAULT '',
  cs_email TEXT NOT NULL DEFAULT '',
  bank_name TEXT NOT NULL DEFAULT '',
  bank_account TEXT NOT NULL DEFAULT '',
  bank_holder TEXT NOT NULL DEFAULT '',
  doc_file_id INTEGER,
  ship_fee INTEGER NOT NULL DEFAULT 3000,
  free_ship_over INTEGER,
  return_fee INTEGER NOT NULL DEFAULT 3000,
  courier TEXT NOT NULL DEFAULT '',
  commission_rate REAL NOT NULL DEFAULT 0.1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
  admin_memo TEXT NOT NULL DEFAULT '',
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id INTEGER NOT NULL REFERENCES sellers(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL,
  list_price INTEGER,
  option1_name TEXT NOT NULL DEFAULT '',
  option2_name TEXT NOT NULL DEFAULT '',
  width_mm INTEGER,
  depth_mm INTEGER,
  height_mm INTEGER,
  color TEXT NOT NULL DEFAULT '',
  model_file_id INTEGER,
  is_example INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','on_sale','paused','blocked','deleted')),
  block_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS products_seller ON products (seller_id, status);
CREATE TABLE IF NOT EXISTS product_images (
  product_id INTEGER NOT NULL REFERENCES products(id),
  file_id INTEGER NOT NULL REFERENCES files(id),
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, file_id)
);
CREATE TABLE IF NOT EXISTS product_skus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  opt1 TEXT NOT NULL DEFAULT '',
  opt2 TEXT NOT NULL DEFAULT '',
  add_price INTEGER NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  width_mm INTEGER,
  depth_mm INTEGER,
  height_mm INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE (product_id, opt1, opt2)
);
CREATE TABLE IF NOT EXISTS cart_items (
  user_id INTEGER NOT NULL REFERENCES users(id),
  sku_id INTEGER NOT NULL REFERENCES product_skus(id),
  qty INTEGER NOT NULL CHECK (qty > 0),
  project_id INTEGER REFERENCES projects(id),
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, sku_id)
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','expired')),
  title TEXT NOT NULL,
  items_amount INTEGER NOT NULL,
  ship_amount INTEGER NOT NULL,
  total_amount INTEGER NOT NULL,
  recipient TEXT NOT NULL,
  phone TEXT NOT NULL,
  zipcode TEXT NOT NULL DEFAULT '',
  address1 TEXT NOT NULL,
  address2 TEXT NOT NULL DEFAULT '',
  memo TEXT NOT NULL DEFAULT '',
  pg TEXT NOT NULL DEFAULT 'test',
  payment_key TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL DEFAULT '',
  fail_reason TEXT NOT NULL DEFAULT '',
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS orders_user ON orders (user_id, id);
CREATE TABLE IF NOT EXISTS order_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  seller_id INTEGER NOT NULL REFERENCES sellers(id),
  ship_fee INTEGER NOT NULL,
  ship_refunded INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','preparing','shipped','delivered','confirmed','canceled')),
  courier TEXT NOT NULL DEFAULT '',
  tracking_no TEXT NOT NULL DEFAULT '',
  shipped_at TEXT,
  delivered_at TEXT,
  confirmed_at TEXT,
  confirm_auto INTEGER NOT NULL DEFAULT 0,
  settlement_id INTEGER,
  UNIQUE (order_id, seller_id)
);
CREATE INDEX IF NOT EXISTS order_groups_seller ON order_groups (seller_id, status);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  group_id INTEGER NOT NULL REFERENCES order_groups(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  sku_id INTEGER NOT NULL REFERENCES product_skus(id),
  title TEXT NOT NULL,
  option_text TEXT NOT NULL DEFAULT '',
  unit_price INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  canceled_qty INTEGER NOT NULL DEFAULT 0,
  returned_qty INTEGER NOT NULL DEFAULT 0,
  project_id INTEGER REFERENCES projects(id)
);
CREATE TABLE IF NOT EXISTS claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  group_id INTEGER NOT NULL REFERENCES order_groups(id),
  item_id INTEGER NOT NULL REFERENCES order_items(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('cancel','return')),
  reason_code TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  qty INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','completed','rejected','withdrawn')),
  deduction INTEGER NOT NULL DEFAULT 0,
  refund_amount INTEGER NOT NULL DEFAULT 0,
  seller_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS claims_group ON claims (group_id, status);
CREATE TABLE IF NOT EXISTS refunds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  group_id INTEGER NOT NULL REFERENCES order_groups(id),
  claim_id INTEGER REFERENCES claims(id),
  amount INTEGER NOT NULL,
  pg TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('done','failed')),
  pg_result TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id INTEGER NOT NULL REFERENCES sellers(id),
  period_end TEXT NOT NULL,
  groups INTEGER NOT NULL,
  sales INTEGER NOT NULL,
  refunds INTEGER NOT NULL,
  commission INTEGER NOT NULL,
  payout INTEGER NOT NULL,
  rate REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','paid')),
  paid_at TEXT,
  memo TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('space','review')),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  space_kind TEXT NOT NULL DEFAULT 'home',
  home_type TEXT NOT NULL DEFAULT '',
  area_pyeong REAL,
  style TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  vendor_id INTEGER REFERENCES vendors(id),
  project_id INTEGER REFERENCES projects(id),
  verified INTEGER NOT NULL DEFAULT 0,
  rating INTEGER,
  is_example INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden','deleted')),
  hidden_reason TEXT NOT NULL DEFAULT '',
  views INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS posts_status ON posts (status, id);
CREATE TABLE IF NOT EXISTS post_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id),
  file_id INTEGER NOT NULL REFERENCES files(id),
  position INTEGER NOT NULL DEFAULT 0,
  caption TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS post_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_id INTEGER NOT NULL REFERENCES post_photos(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  x REAL NOT NULL,
  y REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  parent_id INTEGER REFERENCES comments(id),
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden','deleted')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS comments_post ON comments (post_id, id);
CREATE TABLE IF NOT EXISTS post_likes (
  user_id INTEGER NOT NULL REFERENCES users(id),
  post_id INTEGER NOT NULL REFERENCES posts(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, post_id)
);
CREATE TABLE IF NOT EXISTS scraps (
  user_id INTEGER NOT NULL REFERENCES users(id),
  target TEXT NOT NULL CHECK (target IN ('post','product')),
  target_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, target, target_id)
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL REFERENCES users(id),
  target TEXT NOT NULL CHECK (target IN ('post','comment','product')),
  target_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','actioned','dismissed')),
  action TEXT NOT NULL DEFAULT '',
  handled_by INTEGER REFERENCES users(id),
  handled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (reporter_id, target, target_id)
);
CREATE TABLE IF NOT EXISTS ext_lookups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  kind TEXT NOT NULL,
  query TEXT NOT NULL,
  provider TEXT NOT NULL,
  ok INTEGER NOT NULL,
  result TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export function migrateV2(conn: DatabaseSync, addColumn: (table: string, column: string, def: string) => void) {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS floorplan_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id INTEGER NOT NULL REFERENCES users(id),
      file_id INTEGER REFERENCES files(id), project_id INTEGER REFERENCES projects(id),
      status TEXT NOT NULL CHECK(status IN ('processing','ready','failed','used')),
      result TEXT, error TEXT NOT NULL DEFAULT '', iw INTEGER, ih INTEGER,
      accepted_project_id INTEGER REFERENCES projects(id),
      created_at TEXT NOT NULL DEFAULT(datetime('now')), expires_at TEXT NOT NULL DEFAULT(datetime('now','+1 day'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS floorplan_busy ON floorplan_jobs(owner_id) WHERE status='processing';
    CREATE TABLE IF NOT EXISTS floorplan_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT, complex TEXT NOT NULL, address TEXT NOT NULL,
      unit_type TEXT NOT NULL, area REAL NOT NULL, source_note TEXT NOT NULL,
      house TEXT NOT NULL, created_by INTEGER NOT NULL REFERENCES users(id),
      active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT(datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS floorplan_selections (
      id TEXT PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id), source_id TEXT NOT NULL,
      dong TEXT NOT NULL DEFAULT '', ho TEXT NOT NULL DEFAULT '', variant TEXT NOT NULL DEFAULT 'unknown',
      created_at TEXT NOT NULL DEFAULT(datetime('now')), expires_at TEXT NOT NULL DEFAULT(datetime('now','+1 day'))
    );
  `);
  conn.exec(SCHEMA_V2);
  addColumn("floorplan_jobs", "source_id", "TEXT NOT NULL DEFAULT ''");
  addColumn("floorplan_jobs", "selection_id", "TEXT NOT NULL DEFAULT ''");
  // 업체 직접 참여 입찰: 요청마다 참여 방식과 상한, 배정이 어디서 왔는지(operator: 운영자 배정, self: 업체가 직접 참여)
  addColumn("projects", "bid_mode", "TEXT NOT NULL DEFAULT 'operator'");
  addColumn("projects", "bid_cap", "INTEGER NOT NULL DEFAULT 5");
  addColumn("assignments", "source", "TEXT NOT NULL DEFAULT 'operator'");
  // 커뮤니티 표시 이름(없으면 이름 첫 글자 + **)
  addColumn("users", "nickname", "TEXT NOT NULL DEFAULT ''");
  addColumn("order_groups", "ship_deducted", "INTEGER NOT NULL DEFAULT 0");
  addColumn("order_groups", "shipping_policy", "TEXT NOT NULL DEFAULT ''");
  addColumn("orders", "purpose", "TEXT NOT NULL DEFAULT 'purchase'");
  addColumn("orders", "exchange_id", "INTEGER");
  addColumn("order_items", "exchanged_qty", "INTEGER NOT NULL DEFAULT 0");
  addColumn("order_items", "exchange_source_id", "INTEGER");
  addColumn("refunds", "job_key", "TEXT");
  addColumn("refunds", "payment_order_id", "INTEGER");
  conn.exec(`
    CREATE TABLE IF NOT EXISTS refund_jobs (
      key TEXT PRIMARY KEY, group_id INTEGER NOT NULL REFERENCES order_groups(id),
      status TEXT NOT NULL CHECK(status IN ('processing','failed','completed')),
      payload TEXT NOT NULL, lease_until INTEGER NOT NULL, error TEXT NOT NULL DEFAULT ''
    );
    CREATE UNIQUE INDEX IF NOT EXISTS refund_group_busy ON refund_jobs(group_id) WHERE status != 'completed';
    CREATE UNIQUE INDEX IF NOT EXISTS refund_job_payment ON refunds(job_key,payment_order_id) WHERE status = 'done' AND job_key IS NOT NULL;
    CREATE TABLE IF NOT EXISTS exchanges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id), group_id INTEGER NOT NULL REFERENCES order_groups(id),
      item_id INTEGER NOT NULL REFERENCES order_items(id), user_id INTEGER NOT NULL REFERENCES users(id),
      qty INTEGER NOT NULL, reason_code TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '',
      target_sku_id INTEGER NOT NULL REFERENCES product_skus(id), target_unit_price INTEGER NOT NULL,
      option_text TEXT NOT NULL, price_diff INTEGER NOT NULL, ship_fee INTEGER NOT NULL,
      amount_due INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','collected','ready','shipped','completed','rejected','withdrawn')),
      payment_order_id INTEGER REFERENCES orders(id), replacement_item_id INTEGER REFERENCES order_items(id),
      seller_note TEXT NOT NULL DEFAULT '', courier TEXT NOT NULL DEFAULT '', tracking_no TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT(datetime('now')), resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS exchanges_group ON exchanges(group_id,status);
    CREATE TABLE IF NOT EXISTS project_post_refs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      post_id INTEGER NOT NULL REFERENCES posts(id), photo_id INTEGER NOT NULL,
      snapshot TEXT NOT NULL, UNIQUE(project_id,post_id,photo_id)
    );
  `);
}
