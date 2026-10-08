"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "./auth";
import type { FormState } from "./actions";
import { get, run } from "./db";
import { adminIds, notify } from "./notify";
import { bizNoOk, getSeller, getSellerByUser, partnerRoles } from "./partner";
import { checkUploads, filesOf, saveUploads } from "./uploads";

const str = (fd: FormData, key: string, max = 200) => String(fd.get(key) ?? "").trim().slice(0, max);
const won = (fd: FormData, key: string) => {
  const raw = str(fd, key).replaceAll(",", "");
  if (raw === "") return null;
  const n = Math.round(Number(raw));
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};
const refresh = () => revalidatePath("/", "layout");

/** 판매만 하던 파트너가 시공 역할을 신청한다. 운영자 승인 뒤 요청을 받는다. */
export async function applyBuildRole(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser("vendor");
  const { vendor, seller } = partnerRoles(user);
  if (vendor) redirect("/vendor");
  const company = str(fd, "company", 60) || seller?.name || "";
  if (!company) return { error: "업체명을 입력해 주세요." };
  const fields = ["office", "home"].filter((f) => fd.getAll("fields").map(String).includes(f));
  run(`INSERT INTO vendors (user_id, company, regions, specialties, fields) VALUES (?, ?, ?, ?, ?)`, user.id, company, str(fd, "regions"), str(fd, "specialties"), fields.length ? fields.join(",") : "office");
  notify(adminIds(), { title: `시공 파트너 입점 신청: ${company}`, body: "업체 정보를 확인하고 승인해 주세요.", href: "/admin/vendors", email: true });
  refresh();
  redirect("/vendor/profile");
}

/** 시공 파트너가 판매 역할을 신청한다. 판매자 정보를 채우면 운영자가 확인해 승인한다. */
export async function applySellRole(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser("vendor");
  const { vendor, seller } = partnerRoles(user);
  if (seller) redirect("/seller/settings");
  const name = str(fd, "name", 60) || vendor?.company || "";
  if (!name) return { error: "상호를 입력해 주세요." };
  run(`INSERT INTO sellers (user_id, name, cs_phone, cs_email) VALUES (?, ?, ?, ?)`, user.id, name, user.phone, user.email);
  notify(adminIds(), { title: `판매자 입점 신청: ${name}`, body: "판매자 정보가 채워지면 서류를 확인하고 승인해 주세요.", href: "/admin/sellers", email: true });
  refresh();
  redirect("/seller/settings");
}

/** 판매자 정보·배송 정책. 판매자 본인 또는 운영자(sellerId를 넘길 때). 반려된 판매자가 고쳐 저장하면 다시 승인 대기로 돌아간다. */
export async function saveSellerInfo(sellerId: number | null, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser(sellerId == null ? "vendor" : "admin");
  const seller = sellerId == null ? getSellerByUser(user.id) : getSeller(sellerId);
  if (!seller) redirect(sellerId == null ? "/partner" : "/admin/sellers");
  const name = str(fd, "name", 60);
  const bizNo = str(fd, "biz_no", 20);
  const shipFee = won(fd, "ship_fee");
  const freeOver = won(fd, "free_ship_over");
  const returnFee = won(fd, "return_fee");
  if (!name) return { error: "상호를 입력해 주세요." };
  if (bizNo && !bizNoOk(bizNo)) return { error: "사업자등록번호가 올바르지 않습니다. 숫자 10자리를 확인해 주세요." };
  if (shipFee == null || Number.isNaN(shipFee) || shipFee > 200000) return { error: "기본 배송비를 0~200,000원으로 입력해 주세요." };
  if (Number.isNaN(freeOver)) return { error: "무료 배송 기준 금액을 확인해 주세요." };
  if (returnFee == null || Number.isNaN(returnFee) || returnFee > 200000) return { error: "반품 배송비(편도)를 0~200,000원으로 입력해 주세요." };
  const docs = filesOf(fd, "doc");
  const docError = checkUploads(docs, "doc", 1);
  if (docError) return { error: docError };
  const [docId] = docs.length ? await saveUploads(docs, "doc", seller.user_id, "seller-doc", "private") : [];
  run(
    `UPDATE sellers SET name = ?, intro = ?, biz_no = ?, ceo = ?, biz_address = ?, mail_order_no = ?, cs_phone = ?, cs_email = ?,
       bank_name = ?, bank_account = ?, bank_holder = ?, ship_fee = ?, free_ship_over = ?, return_fee = ?, courier = ?, doc_file_id = coalesce(?, doc_file_id),
       status = CASE WHEN status = 'rejected' AND ? THEN 'pending' ELSE status END
     WHERE id = ?`,
    name,
    str(fd, "intro", 500),
    bizNo.replace(/\D/g, ""),
    str(fd, "ceo", 40),
    str(fd, "biz_address"),
    str(fd, "mail_order_no", 40),
    str(fd, "cs_phone", 30),
    str(fd, "cs_email", 120),
    str(fd, "bank_name", 30),
    str(fd, "bank_account", 40).replace(/[^\d-]/g, ""),
    str(fd, "bank_holder", 40),
    shipFee,
    freeOver,
    returnFee,
    str(fd, "courier", 30),
    docId ?? null,
    sellerId == null ? 1 : 0,
    seller.id,
  );
  const after = getSeller(seller.id)!;
  if (sellerId == null && after.status === "pending" && sellerReady(after))
    notify(adminIds(), { title: `판매자 정보 확인 요청: ${after.name}`, body: "사업자 정보와 서류를 확인하고 승인해 주세요.", href: `/admin/sellers/${after.id}` });
  refresh();
  return { ok: "저장했습니다." };
}

/** 운영자가 승인 전에 확인할 항목이 모두 채워졌는지 */
function sellerReady(s: NonNullable<ReturnType<typeof getSeller>>) {
  return !!(s.name && bizNoOk(s.biz_no) && s.ceo && s.biz_address && s.cs_phone && s.bank_name && s.bank_account && s.bank_holder && s.doc_file_id);
}

/** 운영자: 판매자 승인·반려·중지와 수수료율 */
export async function setSellerStatus(sellerId: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireUser("admin");
  const seller = getSeller(sellerId);
  if (!seller) return { error: "판매자를 찾을 수 없습니다." };
  const status = str(fd, "status");
  if (!["pending", "approved", "rejected", "suspended"].includes(status)) return { error: "상태를 골라 주세요." };
  const rate = Number(str(fd, "rate").replace("%", ""));
  if (!Number.isFinite(rate) || rate < 0 || rate > 50) return { error: "수수료율은 0~50%로 입력해 주세요." };
  const memo = str(fd, "memo", 500);
  if (status === "approved" && !sellerReady(seller)) return { error: "사업자 정보·정산 계좌·사업자등록증이 모두 있어야 승인할 수 있습니다." };
  if (status === "rejected" && !memo) return { error: "반려 사유를 적어 주세요. 판매자에게 그대로 보입니다." };
  run(
    `UPDATE sellers SET status = ?, commission_rate = ?, admin_memo = ?, approved_at = CASE WHEN ? = 'approved' THEN coalesce(approved_at, datetime('now')) ELSE approved_at END WHERE id = ?`,
    status,
    Math.round(rate * 10) / 1000,
    memo,
    status,
    sellerId,
  );
  // 판매 중지면 판매 중인 상품을 쇼핑에서 내린다(상품 상태는 그대로 두고 판매자 상태로 가린다).
  if (status !== seller.status) {
    const title = { approved: "판매자 입점이 승인되었습니다", rejected: "판매자 입점 신청이 반려되었습니다", suspended: "판매가 중지되었습니다", pending: "판매자 상태가 승인 대기로 바뀌었습니다" }[status]!;
    notify([seller.user_id], { title, body: memo || (status === "approved" ? "상품을 등록하고 판매를 시작할 수 있습니다." : ""), href: status === "approved" ? "/seller" : "/seller/settings", email: true });
  }
  refresh();
  return { ok: "저장했습니다." };
}

/** 고객 커뮤니티 표시 이름 */
export async function saveNickname(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const nick = str(fd, "nickname", 20);
  if (nick && nick.length < 2) return { error: "별명은 2자 이상으로 정해 주세요." };
  if (nick && get(`SELECT 1 AS ok FROM users WHERE nickname = ? AND id != ?`, nick, user.id)) return { error: "이미 쓰는 별명입니다." };
  run(`UPDATE users SET nickname = ? WHERE id = ?`, nick, user.id);
  refresh();
  return { ok: "저장했습니다." };
}

/**
 * 운영자: 국세청 사업자 상태 조회(공공데이터포털 ‘사업자등록정보 진위확인 및 상태조회’). 키가 없으면 조회하지 않는다(실제 연동 전).
 * POST https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=… { b_no: ["0000000000"] } → data[0].b_stt(계속사업자·휴업자·폐업자)
 */
export async function checkSellerBiz(sellerId: number) {
  const admin = await requireUser("admin");
  const seller = getSeller(sellerId);
  const key = process.env.DATA_GO_KR_KEY?.trim();
  if (!seller?.biz_no || !key) return;
  let ok = false;
  let result = "";
  try {
    const res = await fetch(`https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ b_no: [seller.biz_no] }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json()) as { data?: { b_stt?: string; tax_type?: string }[]; msg?: string };
    const d = body.data?.[0];
    ok = res.ok && !!d;
    result = d ? [d.b_stt || "등록되지 않은 번호", d.tax_type].filter(Boolean).join(" · ") : body.msg || `조회 실패(${res.status})`;
  } catch (e) {
    result = `조회 실패: ${(e as Error).message}`;
  }
  run(`INSERT INTO ext_lookups (user_id, kind, query, provider, ok, result) VALUES (?, 'nts', ?, 'live', ?, ?)`, admin.id, seller.biz_no, ok ? 1 : 0, result.slice(0, 300));
  refresh();
}
