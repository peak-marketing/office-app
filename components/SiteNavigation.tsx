"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon, { type IconName } from "./Icon";

export interface NavigationItem { href: string; label: string; icon?: IconName; /** 이 주소로 시작하는 화면에서도 켜진 것으로 본다 */ match?: string[] }

/** 하단 탐색을 숨기는 화면: 자체 하단 막대(요청·구매 버튼, 편집 도구)가 있는 곳 */
export function hidesBottomNav(path: string) {
  return /^\/cases\/\d+$/.test(path) || /^\/vendor\/requests\//.test(path) || path.includes("/print") || path === "/projects/new" || path === "/spaces/new" || path === "/spaces/trace" || /^\/projects\/\d+\/(editor|space)$/.test(path) || /^\/projects\/\d+\/rooms\/room-\d+$/.test(path) || /^\/projects\/\d+\/house\/(new|edit)$/.test(path) || /^\/shop\/products\/\d+$/.test(path) || path === "/checkout" || path.startsWith("/pay/");
}

const under = (path: string, href: string) => path === href || path.startsWith(href + "/");

export default function SiteNavigation({ items, mobile = false }: { items: NavigationItem[]; mobile?: boolean }) {
  const path = usePathname();
  if (mobile && hidesBottomNav(path)) return null;
  return (
    <nav className={mobile ? "mobile-navigation no-print" : "desktop-navigation"} aria-label={mobile ? "하단 탐색" : "주 메뉴"}>
      {items.map((item) => {
        const exact = ["/", "/admin", "/vendor"].includes(item.href);
        const active = (exact ? path === item.href : under(path, item.href)) || !!item.match?.some((m) => under(path, m));
        return <Link key={item.href} href={item.href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}>
          {mobile && item.icon && <Icon name={item.icon} className="size-[22px]" />}
          <span>{item.label}</span>
        </Link>;
      })}
    </nav>
  );
}
