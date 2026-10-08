"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const GROUPS: Record<string, { href: string; label: string }[]> = {
  partners: [
    { href: "/admin/vendors", label: "시공사" },
    { href: "/admin/sellers", label: "판매자" },
  ],
  shop: [
    { href: "/admin/products", label: "상품" },
    { href: "/admin/orders", label: "주문·취소·반품" },
    { href: "/admin/exchanges", label: "교환" },
    { href: "/admin/settlements", label: "정산" },
  ],
};

/** 운영자 화면 묶음 메뉴 */
export default function AdminTabs({ group }: { group: keyof typeof GROUPS }) {
  const path = usePathname();
  return (
    <nav className="filter-scroll mb-5" aria-label="운영 메뉴">
      {GROUPS[group].map((t) => {
        const on = path === t.href || path.startsWith(t.href + "/");
        return (
          <Link key={t.href} href={t.href} className={`filter-chip ${on ? "active" : ""}`} aria-current={on ? "page" : undefined}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
