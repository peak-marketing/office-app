import { all, get } from "./db";
import { HOME_TYPE_LABEL, STYLE_LABEL, type POST_TYPE } from "./community-constants";

export * from "./community-constants";

// 커뮤니티: 공간 소개(고객 누구나)·시공 후기(계약 결과가 기록된 고객). 업체 사례(vendor_cases)와 구분해 보여 준다.
// 시공 후기의 ‘계약 확인’은 운영자가 기록한 계약 결과(projects.outcome)의 업체와 후기에 연결한 업체가 같을 때만 붙는다.

export interface Post {
  id: number;
  user_id: number;
  type: keyof typeof POST_TYPE;
  title: string;
  body: string;
  space_kind: "home" | "office";
  home_type: string;
  area_pyeong: number | null;
  style: string;
  region: string;
  vendor_id: number | null;
  project_id: number | null;
  /** 계약 결과와 맞는 시공 후기 */
  verified: number;
  rating: number | null;
  is_example: number;
  status: "published" | "hidden" | "deleted";
  hidden_reason: string;
  views: number;
  created_at: string;
  updated_at: string;
}

export interface PostCard extends Post {
  author: string;
  cover: number | null;
  photos: number;
  likes: number;
  scraps: number;
  comments: number;
  vendor: string | null;
}

/** 표시 이름: 별명이 없으면 이름 첫 글자 + ** */
export const authorName = (u: { nickname?: string | null; name: string }) => u.nickname || `${[...u.name][0] ?? "회"}**`;
export const AUTHOR_SQL = `coalesce(nullif(u.nickname, ''), substr(u.name, 1, 1) || '**')`;

const CARD = `SELECT p.*, ${AUTHOR_SQL} AS author, v.company AS vendor,
  (SELECT file_id FROM post_photos f WHERE f.post_id = p.id ORDER BY position, id LIMIT 1) AS cover,
  (SELECT count(*) FROM post_photos f WHERE f.post_id = p.id) AS photos,
  (SELECT count(*) FROM post_likes l WHERE l.post_id = p.id) AS likes,
  (SELECT count(*) FROM scraps s WHERE s.target = 'post' AND s.target_id = p.id) AS scraps,
  (SELECT count(*) FROM comments c WHERE c.post_id = p.id AND c.status = 'published') AS comments
  FROM posts p JOIN users u ON u.id = p.user_id LEFT JOIN vendors v ON v.id = p.vendor_id`;

export interface PostQuery {
  type?: string;
  kind?: string;
  home?: string;
  style?: string;
  sort?: string;
  q?: string;
  vendor?: string;
  user?: number;
}

export function listPosts(q: PostQuery, limit = 60): PostCard[] {
  const where = ["p.status = 'published'"];
  const params: (string | number)[] = [];
  if (q.type === "space" || q.type === "review") (where.push("p.type = ?"), params.push(q.type));
  if (q.kind === "home" || q.kind === "office") (where.push("p.space_kind = ?"), params.push(q.kind));
  if (q.home && HOME_TYPE_LABEL[q.home]) (where.push("p.home_type = ?"), params.push(q.home));
  if (q.style && STYLE_LABEL[q.style]) (where.push("p.style = ?"), params.push(q.style));
  if (q.vendor && Number.isInteger(Number(q.vendor))) (where.push("p.vendor_id = ?"), params.push(Number(q.vendor)));
  const text = (q.q ?? "").trim().slice(0, 40);
  if (text) (where.push("(p.title LIKE ? OR p.body LIKE ?)"), params.push(`%${text}%`, `%${text}%`));
  const order = q.sort === "popular" ? "(likes + scraps * 2 + comments) DESC, p.id DESC" : "p.id DESC";
  return all<PostCard>(`${CARD} WHERE ${where.join(" AND ")} AND cover IS NOT NULL ORDER BY ${order} LIMIT ?`, ...params, limit);
}

/** 내 글(가려진 글 포함, 지운 글 제외) */
export const myPosts = (userId: number): PostCard[] => all<PostCard>(`${CARD} WHERE p.user_id = ? AND p.status != 'deleted' ORDER BY p.id DESC`, userId);

export const getPostCard = (id: number) => (Number.isInteger(id) ? get<PostCard>(`${CARD} WHERE p.id = ? AND p.status != 'deleted'`, id) : undefined);

export interface PhotoTag {
  id: number;
  x: number;
  y: number;
  product_id: number;
  title: string;
  price: number;
  cover: number | null;
  /** 판매 중이 아니면 링크 대신 ‘판매 종료’ */
  on_sale: number;
}
export interface PostPhoto {
  id: number;
  file_id: number;
  caption: string;
  tags: PhotoTag[];
}

export function postPhotos(postId: number): PostPhoto[] {
  const photos = all<Omit<PostPhoto, "tags">>(`SELECT id, file_id, caption FROM post_photos WHERE post_id = ? ORDER BY position, id`, postId);
  if (!photos.length) return [];
  const tags = all<PhotoTag & { photo_id: number }>(
    `SELECT t.id, t.photo_id, t.x, t.y, t.product_id, p.title, p.price, (p.status = 'on_sale' AND s.status = 'approved') AS on_sale,
       (SELECT file_id FROM product_images i WHERE i.product_id = p.id ORDER BY position LIMIT 1) AS cover
     FROM post_tags t JOIN products p ON p.id = t.product_id JOIN sellers s ON s.id = p.seller_id WHERE t.photo_id IN (${photos.map(() => "?").join(",")})`,
    ...photos.map((p) => p.id),
  );
  return photos.map((p) => ({ ...p, tags: tags.filter((t) => t.photo_id === p.id) }));
}

export interface CommentRow {
  id: number;
  post_id: number;
  user_id: number;
  parent_id: number | null;
  body: string;
  status: "published" | "hidden" | "deleted";
  created_at: string;
  author: string;
  role: string;
  company: string | null;
}
export const postComments = (postId: number) =>
  all<CommentRow>(
    `SELECT c.*, ${AUTHOR_SQL} AS author, u.role, (SELECT company FROM vendors v WHERE v.user_id = u.id) AS company FROM comments c JOIN users u ON u.id = c.user_id
     WHERE c.post_id = ? AND c.status != 'deleted' ORDER BY coalesce(c.parent_id, c.id), c.id`,
    postId,
  );

/** 시공 후기를 쓸 수 있는 내 프로젝트: 계약 결과가 기록되었고 아직 후기를 쓰지 않은 것 */
export function reviewableProjects(userId: number) {
  return all<{ id: number; title: string; kind: string; outcome: string }>(
    `SELECT id, title, kind, outcome FROM projects WHERE customer_id = ? AND status = 'contracted' AND outcome IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.project_id = projects.id AND p.type = 'review' AND p.status != 'deleted')`,
    userId,
  ).flatMap((p) => {
    const o = JSON.parse(p.outcome) as { vendorId?: number | null; company?: string | null };
    return o.vendorId ? [{ id: p.id, title: p.title, kind: p.kind, vendorId: o.vendorId, company: o.company ?? "" }] : [];
  });
}

export const isLiked = (userId: number | undefined, postId: number) => !!userId && !!get(`SELECT 1 AS ok FROM post_likes WHERE user_id = ? AND post_id = ?`, userId, postId);
