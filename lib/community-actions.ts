"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUser, requireUser } from "./auth";
import type { FormState } from "./actions";
import { all, get, run, transaction } from "./db";
import { adminIds, notify } from "./notify";
import { AUTO_HIDE_REPORTS, HOME_TYPE_LABEL, REPORT_REASONS, STYLE_LABEL } from "./community-constants";
import { reviewableProjects, type Post } from "./community";
import { getSeller } from "./partner";
import { checkUploads, filesOf, saveUploads } from "./uploads";

const str = (fd: FormData, key: string, max = 200) => String(fd.get(key) ?? "").trim().slice(0, max);
const refresh = () => revalidatePath("/", "layout");
const MAX_PHOTOS = 10;
const MAX_TAGS = 5;

export async function removePostReference(projectId:number,postId:number,photoId:number) {
  const user=await requireUser("customer");
  if (!get(`SELECT 1 FROM projects WHERE id=? AND customer_id=? AND status NOT IN ('contracted','closed')`,projectId,user.id)) return;
  run(`DELETE FROM project_post_refs WHERE project_id=? AND post_id=? AND photo_id=?`,projectId,postId,photoId);
  refresh();
}

interface TagInput {
  /** 새 사진은 "new:순번", 이미 올린 사진은 "id:사진 번호" */
  photo: string;
  x: number;
  y: number;
  product: number;
}

/** 공간 소개·시공 후기 쓰기와 고치기. 사진 1~10장, 사진마다 상품 태그 5개까지. */
export async function savePost(postId: number | null, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser("customer");
  const existing = postId ? get<Post>(`SELECT * FROM posts WHERE id = ? AND user_id = ? AND status != 'deleted'`, postId, user.id) : undefined;
  if (postId && !existing) return { error: "글을 찾을 수 없습니다." };
  const type = existing?.type ?? (str(fd, "type") === "review" ? "review" : "space");
  const title = str(fd, "title", 60);
  const body = str(fd, "body", 5000);
  if (!title) return { error: "제목을 입력해 주세요." };
  const kind = str(fd, "space_kind") === "office" ? "office" : "home";
  const homeType = HOME_TYPE_LABEL[str(fd, "home_type")] ? str(fd, "home_type") : "";
  const style = STYLE_LABEL[str(fd, "style")] ? str(fd, "style") : "";
  const areaRaw = str(fd, "area_pyeong");
  const area = areaRaw ? Number(areaRaw) : null;
  if (area != null && (!Number.isFinite(area) || area <= 0 || area > 500)) return { error: "평수는 1~500 사이로 입력해 주세요." };
  // 시공 후기: 계약 결과가 기록된 내 프로젝트만. 시공사는 계약 결과의 업체로 정해지고 ‘계약 확인’이 붙는다.
  let vendorId: number | null = null;
  let projectId: number | null = existing?.project_id ?? null;
  let verified = 0;
  let rating: number | null = null;
  if (type === "review") {
    if (!existing) {
      const pick = reviewableProjects(user.id).find((p) => p.id === Number(str(fd, "project")));
      if (!pick) return { error: "후기를 쓸 계약을 골라 주세요. 계약 결과가 기록된 요청만 시공 후기를 쓸 수 있어요." };
      projectId = pick.id;
      vendorId = pick.vendorId;
    } else vendorId = existing.vendor_id;
    verified = 1;
    rating = Math.round(Number(str(fd, "rating")));
    if (!(rating >= 1 && rating <= 5)) return { error: "별점을 1~5로 골라 주세요." };
  } else {
    const chosen=Number(str(fd,"project"));
    if (chosen && !get(`SELECT 1 FROM projects WHERE id=? AND customer_id=?`,chosen,user.id)) return { error:"내 공간만 연결할 수 있어요." };
    projectId=chosen || null;
    const v = Number(str(fd, "vendor"));
    if (v && get(`SELECT 1 AS ok FROM vendors WHERE id = ? AND status = 'approved'`, v)) vendorId = v;
  }
  // 사진
  const newFiles = filesOf(fd, "photos");
  const upErr = checkUploads(newFiles, "image", MAX_PHOTOS);
  if (upErr) return { error: upErr };
  const keep = existing ? all<{ id: number }>(`SELECT id FROM post_photos WHERE post_id = ?`, existing.id).map((r) => r.id).filter((id) => !fd.getAll("removePhoto").map(Number).includes(id)) : [];
  if (keep.length + newFiles.length === 0) return { error: "공간 사진을 한 장 이상 올려 주세요." };
  if (keep.length + newFiles.length > MAX_PHOTOS) return { error: `사진은 ${MAX_PHOTOS}장까지 올릴 수 있어요.` };
  let tags: TagInput[] = [];
  try {
    tags = (JSON.parse(str(fd, "tags", 20000) || "[]") as TagInput[]).filter((t) => t && typeof t.photo === "string");
  } catch {
    return { error: "상품 태그를 읽지 못했어요." };
  }
  const products = new Set(all<{ id: number }>(`SELECT p.id FROM products p JOIN sellers s ON s.id = p.seller_id WHERE p.status = 'on_sale' AND s.status = 'approved'`).map((r) => r.id));
  tags = tags.filter((t) => products.has(Number(t.product)) && t.x >= 0 && t.x <= 1 && t.y >= 0 && t.y <= 1);
  const perPhoto = new Map<string, number>();
  for (const t of tags) perPhoto.set(t.photo, (perPhoto.get(t.photo) ?? 0) + 1);
  if ([...perPhoto.values()].some((n) => n > MAX_TAGS)) return { error: `사진 한 장에 상품 태그는 ${MAX_TAGS}개까지예요.` };
  const fileIds = await saveUploads(newFiles, "image", user.id, "post", "public");
  const id = transaction(() => {
    const values = [title, body, kind, homeType, area, style, str(fd, "region", 40), vendorId, rating] as const;
    let pid: number;
    if (existing) {
      pid = existing.id;
      run(`UPDATE posts SET title = ?, body = ?, space_kind = ?, home_type = ?, area_pyeong = ?, style = ?, region = ?, vendor_id = ?, rating = ?, project_id = ?, updated_at = datetime('now') WHERE id = ?`, ...values, projectId, pid);
    } else pid = run(`INSERT INTO posts (title, body, space_kind, home_type, area_pyeong, style, region, vendor_id, rating, user_id, type, project_id, verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, ...values, user.id, type, projectId, verified);
    for (const rid of fd.getAll("removePhoto").map(Number)) {
      run(`DELETE FROM post_tags WHERE photo_id = ? AND photo_id IN (SELECT id FROM post_photos WHERE post_id = ?)`, rid, pid);
      run(`DELETE FROM post_photos WHERE id = ? AND post_id = ?`, rid, pid);
    }
    for (const kid of keep) run(`UPDATE post_photos SET caption = ? WHERE id = ? AND post_id = ?`, str(fd, `caption-${kid}`, 200), kid, pid);
    const base = get<{ n: number }>(`SELECT coalesce(max(position), -1) AS n FROM post_photos WHERE post_id = ?`, pid)!.n;
    const photoIds = new Map<string, number>(keep.map((k) => [`id:${k}`, k]));
    fileIds.forEach((fid, i) => photoIds.set(`new:${i}`, run(`INSERT INTO post_photos (post_id, file_id, position, caption) VALUES (?, ?, ?, ?)`, pid, fid, base + 1 + i, str(fd, `caption-new-${i}`, 200))));
    // 태그는 화면에서 보낸 그대로 다시 쓴다.
    run(`DELETE FROM post_tags WHERE photo_id IN (SELECT id FROM post_photos WHERE post_id = ?)`, pid);
    for (const t of tags) {
      const photo = photoIds.get(t.photo);
      if (photo) run(`INSERT INTO post_tags (photo_id, product_id, x, y) VALUES (?, ?, ?, ?)`, photo, Number(t.product), Math.round(t.x * 1000) / 1000, Math.round(t.y * 1000) / 1000);
    }
    return pid;
  });
  if (!existing && type === "review" && vendorId) {
    const vendorUser = get<{ user_id: number }>(`SELECT user_id FROM vendors WHERE id = ?`, vendorId)?.user_id;
    notify([vendorUser], { title: "고객이 시공 후기를 남겼습니다", body: title, href: `/community/${id}` });
  }
  refresh();
  redirect(`/community/${id}`);
}

export async function deletePost(postId: number) {
  const user = await requireUser("customer", "admin");
  run(`UPDATE posts SET status = 'deleted', updated_at = datetime('now') WHERE id = ? AND (user_id = ? OR ? = 'admin')`, postId, user.id, user.role);
  refresh();
  redirect(user.role === "admin" ? "/admin/community" : "/community/mine");
}

export async function toggleLike(postId: number): Promise<{ on: boolean; login?: boolean }> {
  const user = await currentUser();
  if (!user) return { on: false, login: true };
  const on = !!get(`SELECT 1 AS ok FROM post_likes WHERE user_id = ? AND post_id = ?`, user.id, postId);
  if (on) run(`DELETE FROM post_likes WHERE user_id = ? AND post_id = ?`, user.id, postId);
  else if (get(`SELECT 1 AS ok FROM posts WHERE id = ? AND status = 'published'`, postId)) run(`INSERT INTO post_likes (user_id, post_id) VALUES (?, ?)`, user.id, postId);
  refresh();
  return { on: !on };
}

/** 댓글·답글(한 단계). 글쓴이와 원 댓글 작성자에게 알린다. */
export async function addComment(postId: number, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (user.role === "admin") return { error: "운영자 계정으로는 댓글을 쓸 수 없어요." };
  const post = get<Post>(`SELECT * FROM posts WHERE id = ? AND status = 'published'`, postId);
  if (!post) return { error: "댓글을 쓸 수 없는 글이에요." };
  const body = str(fd, "body", 1000);
  if (!body) return { error: "댓글을 입력해 주세요." };
  const parentId = Number(str(fd, "parent")) || null;
  const parent = parentId ? get<{ id: number; user_id: number; parent_id: number | null }>(`SELECT id, user_id, parent_id FROM comments WHERE id = ? AND post_id = ? AND status = 'published'`, parentId, postId) : undefined;
  if (parentId && !parent) return { error: "답글을 달 댓글이 없어요." };
  run(`INSERT INTO comments (post_id, user_id, parent_id, body) VALUES (?, ?, ?, ?)`, postId, user.id, parent ? (parent.parent_id ?? parent.id) : null, body);
  if (post.user_id !== user.id) notify([post.user_id], { title: "내 글에 댓글이 달렸어요", body: body.slice(0, 80), href: `/community/${postId}#comments` });
  if (parent && parent.user_id !== user.id && parent.user_id !== post.user_id) notify([parent.user_id], { title: "내 댓글에 답글이 달렸어요", body: body.slice(0, 80), href: `/community/${postId}#comments` });
  refresh();
  return { ok: "댓글을 남겼어요." };
}

export async function deleteComment(commentId: number) {
  const user = await requireUser();
  run(`UPDATE comments SET status = 'deleted' WHERE id = ? AND (user_id = ? OR ? = 'admin')`, commentId, user.id, user.role);
  refresh();
}

/** 사진에 붙일 상품 찾기(판매 중인 상품만) */
export async function searchTagProducts(q: string) {
  await requireUser("customer");
  const text = q.trim().slice(0, 40);
  if (!text) return [];
  return all<{ id: number; title: string; price: number; cover: number | null }>(
    `SELECT p.id, p.title, p.price, (SELECT file_id FROM product_images i WHERE i.product_id = p.id ORDER BY position LIMIT 1) AS cover
     FROM products p JOIN sellers s ON s.id = p.seller_id WHERE p.status = 'on_sale' AND s.status = 'approved' AND (p.title LIKE ? OR p.brand LIKE ?) ORDER BY p.id DESC LIMIT 8`,
    `%${text}%`,
    `%${text}%`,
  );
}

/** 신고: 게시물·댓글·상품. 한 사람이 같은 대상을 한 번만 신고한다. 쌓이면 운영자 확인 전까지 자동으로 가린다. */
export async function reportContent(target: "post" | "comment" | "product", id: number, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const reason = str(fd, "reason");
  if (!REPORT_REASONS[reason]) return { error: "신고 사유를 골라 주세요." };
  const table = target === "post" ? "posts" : target === "comment" ? "comments" : "products";
  if (!get(`SELECT 1 AS ok FROM ${table} WHERE id = ?`, id)) return { error: "대상을 찾을 수 없습니다." };
  if (get(`SELECT 1 AS ok FROM reports WHERE reporter_id = ? AND target = ? AND target_id = ?`, user.id, target, id)) return { ok: "이미 신고했어요. 운영자가 확인하고 있어요." };
  run(`INSERT INTO reports (reporter_id, target, target_id, reason, detail) VALUES (?, ?, ?, ?, ?)`, user.id, target, id, reason, str(fd, "detail", 500));
  const open = get<{ n: number }>(`SELECT count(*) AS n FROM reports WHERE target = ? AND target_id = ? AND status = 'open'`, target, id)!.n;
  if (open >= AUTO_HIDE_REPORTS && target !== "product")
    run(`UPDATE ${table} SET status = 'hidden'${target === "post" ? ", hidden_reason = '신고 누적(운영자 확인 전)'" : ""} WHERE id = ? AND status = 'published'`, id);
  if (open === 1 || open === AUTO_HIDE_REPORTS)
    notify(adminIds(), { title: `신고 접수: ${target === "post" ? "게시물" : target === "comment" ? "댓글" : "상품"} #${id}${open > 1 ? ` (${open}건, 자동 가림)` : ""}`, body: REPORT_REASONS[reason], href: "/admin/community" });
  refresh();
  return { ok: "신고했어요. 운영자가 확인할게요." };
}

/** 운영자: 신고 처리와 게시물·댓글 관리. hide(가리기) · unhide(다시 보이기) · delete(삭제) · dismiss(신고 기각) */
export async function moderate(target: "post" | "comment" | "product", id: number, fd: FormData) {
  const admin = await requireUser("admin");
  const action = str(fd, "do");
  const reason = str(fd, "reason", 300) || "운영 정책 위반";
  const table = target === "post" ? "posts" : target === "comment" ? "comments" : "products";
  const row = get<{ user_id?: number; seller_id?: number; title?: string; post_id?: number }>(`SELECT * FROM ${table} WHERE id = ?`, id);
  if (!row) return;
  const owner = target === "product" ? getSeller(row.seller_id!)?.user_id : row.user_id;
  transaction(() => {
    if (action === "hide") {
      if (target === "product") run(`UPDATE products SET status = 'blocked', block_reason = ? WHERE id = ?`, reason, id);
      else run(`UPDATE ${table} SET status = 'hidden'${target === "post" ? ", hidden_reason = ?" : ""} WHERE id = ?`, ...(target === "post" ? [reason, id] : [id]));
    } else if (action === "unhide") {
      if (target === "product") run(`UPDATE products SET status = 'paused', block_reason = '' WHERE id = ? AND status = 'blocked'`, id);
      else run(`UPDATE ${table} SET status = 'published'${target === "post" ? ", hidden_reason = ''" : ""} WHERE id = ? AND status = 'hidden'`, id);
    } else if (action === "delete" && target !== "product") run(`UPDATE ${table} SET status = 'deleted' WHERE id = ?`, id);
    else if (action !== "dismiss") return;
    run(
      `UPDATE reports SET status = ?, action = ?, handled_by = ?, handled_at = datetime('now') WHERE target = ? AND target_id = ? AND status = 'open'`,
      action === "dismiss" || action === "unhide" ? "dismissed" : "actioned",
      action === "dismiss" ? "기각" : action === "hide" ? `가림: ${reason}` : action === "delete" ? `삭제: ${reason}` : "다시 보이기",
      admin.id,
      target,
      id,
    );
  });
  if (action === "hide" || action === "delete")
    notify([owner], {
      title: `${target === "post" ? "게시물" : target === "comment" ? "댓글" : "상품"}이 ${action === "hide" ? "가려졌" : "삭제되었"}습니다`,
      body: reason,
      href: target === "post" ? `/community/${id}` : target === "comment" ? `/community/${row.post_id}` : `/seller/products/${id}`,
    });
  refresh();
}
