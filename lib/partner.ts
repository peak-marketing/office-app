import { get } from "./db";
import type { User } from "./auth";
import type { Vendor } from "./data";

// 파트너 계정(users.role = 'vendor')은 시공(vendors 행)과 판매(sellers 행) 역할을 따로 또는 함께 가진다.

export interface Seller {
  id: number;
  user_id: number;
  /** 상호(쇼핑에 보이는 판매자 이름) */
  name: string;
  intro: string;
  biz_no: string;
  ceo: string;
  biz_address: string;
  /** 통신판매업 신고번호 */
  mail_order_no: string;
  cs_phone: string;
  cs_email: string;
  bank_name: string;
  bank_account: string;
  bank_holder: string;
  /** 사업자등록증 사본(운영자와 본인만 볼 수 있음) */
  doc_file_id: number | null;
  /** 판매자 묶음 배송비(원) */
  ship_fee: number;
  /** 이 금액 이상 사면 배송비 무료. 없으면 null */
  free_ship_over: number | null;
  /** 반품 배송비(편도) */
  return_fee: number;
  courier: string;
  /** 판매 수수료율(0.1 = 10%) */
  commission_rate: number;
  status: "pending" | "approved" | "rejected" | "suspended";
  admin_memo: string;
  approved_at: string | null;
  created_at: string;
}

export const SELLER_STATUS: Record<Seller["status"], string> = { pending: "승인 대기", approved: "승인", rejected: "반려", suspended: "판매 중지" };
export const VENDOR_STATUS: Record<Vendor["status"], string> = { pending: "승인 대기", approved: "승인", suspended: "중지" };

export const getSellerByUser = (userId: number) => get<Seller>(`SELECT * FROM sellers WHERE user_id = ?`, userId);
export const getSeller = (id: number) => get<Seller>(`SELECT * FROM sellers WHERE id = ?`, id);

/** 파트너의 역할. 고객·운영자는 둘 다 없음 */
export function partnerRoles(user: Pick<User, "id" | "role"> | null) {
  if (!user || user.role !== "vendor") return { vendor: undefined, seller: undefined };
  return { vendor: get<Vendor>(`SELECT * FROM vendors WHERE user_id = ?`, user.id), seller: getSellerByUser(user.id) };
}

/** 사업자등록번호 형식(000-00-00000) 확인. 진위는 국세청 조회(키가 있을 때) 또는 운영자가 서류로 확인한다. */
export function bizNoOk(raw: string) {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 10) return false;
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * w[i];
  sum += Math.floor((Number(d[8]) * 5) / 10);
  return (10 - (sum % 10)) % 10 === Number(d[9]);
}
export const bizNoText = (raw: string) => {
  const d = raw.replace(/\D/g, "");
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : raw;
};
