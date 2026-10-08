"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 고객 화면의 묶음별 하위 메뉴(오늘의집처럼 머리 아래 한 줄). 해당 묶음 화면에서만 보인다.
const SECTIONS: { test: (p: string) => boolean; tabs: { href: string; label: string; exact?: boolean }[] }[] = [
  {
    test: (p) => p === "/community" || p.startsWith("/community/"),
    tabs: [
      { href: "/community", label: "전체", exact: true },
      { href: "/community/spaces", label: "공간 소개" },
      { href: "/community/reviews", label: "시공 후기" },
      { href: "/community/new", label: "글쓰기" },
    ],
  },
  {
    test: (p) => p === "/shop" || p.startsWith("/shop/") || p === "/cart" || p.startsWith("/orders"),
    tabs: [
      { href: "/shop", label: "쇼핑 홈", exact: true },
      { href: "/shop/search", label: "전체 상품" },
      { href: "/shop/search?three=1", label: "내 공간에 놓기" },
      { href: "/cart", label: "장바구니" },
      { href: "/orders", label: "주문 내역" },
    ],
  },
  {
    test: (p) => p === "/cases" || p.startsWith("/cases/") || p === "/vendors" || p.startsWith("/vendors/") || p === "/try" || p === "/request",
    tabs: [
      { href: "/cases", label: "시공 사례" },
      { href: "/vendors", label: "시공사" },
      { href: "/try", label: "배치 해보기" },
      { href: "/request", label: "견적 요청" },
    ],
  },
];

export default function SectionTabs() {
  const path = usePathname();
  const section = SECTIONS.find((s) => s.test(path));
  if (!section || /^\/cases\/\d+$/.test(path) || /^\/shop\/products\/\d+$/.test(path)) return null;
  return (
    <nav className="section-tabs" aria-label="하위 메뉴">
      <div className="section-tabs-inner">
        {section.tabs.map((t) => {
          const base = t.href.split("?")[0];
          const on = t.href.includes("?") ? false : t.exact ? path === base : path === base || path.startsWith(base + "/");
          return (
            <Link key={t.href} href={t.href} className={on ? "is-active" : ""} aria-current={on ? "page" : undefined}>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
