import { randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { get, run } from "./db";

export type Role = "customer" | "vendor" | "admin";
export interface User {
  id: number;
  email: string;
  name: string;
  phone: string;
  role: Role;
}

const COOKIE = "sid";
const DAYS = 14;

export const currentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const user = get<User>(
    `SELECT u.id, u.email, u.name, u.phone, u.role FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now')`,
    token,
  );
  return user ?? null;
});

/** 로그인 뒤 첫 화면. 파트너는 시공 역할이 있으면 요청·제안, 판매만 하면 판매자 센터, 아직 역할이 없으면 파트너 센터 */
export function homeFor(user: User) {
  if (user.role === "admin") return "/admin";
  if (user.role === "customer") return "/projects";
  if (get(`SELECT 1 AS ok FROM vendors WHERE user_id = ?`, user.id)) return "/vendor";
  if (get(`SELECT 1 AS ok FROM sellers WHERE user_id = ?`, user.id)) return "/seller";
  return "/partner";
}

/** 로그인과 역할을 확인한다. 페이지와 Server Action 양쪽에서 호출한다. */
export async function requireUser(...roles: Role[]): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (roles.length && !roles.includes(user.role)) redirect(homeFor(user));
  return user;
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("hex");
  run(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', ?))`, token, userId, `+${DAYS} days`);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // 로컬 대면 테스트(http://localhost)에서는 COOKIE_SECURE=0으로 띄운다. 일부 브라우저가 http에서 Secure 쿠키를 저장하지 않는다.
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "1" : process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DAYS * 86400,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) run(`DELETE FROM sessions WHERE token = ?`, token);
  jar.delete(COOKIE);
}
