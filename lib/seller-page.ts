import { redirect } from "next/navigation";
import { requireUser } from "./auth";
import { getSellerByUser } from "./partner";
import { housekeeping } from "./shop";

/** 판매자 센터 화면 공통: 판매자 역할이 없으면 파트너 센터로 */
export async function sellerPage() {
  const user = await requireUser("vendor");
  const seller = getSellerByUser(user.id);
  if (!seller) redirect("/partner");
  housekeeping();
  return { user, seller };
}
