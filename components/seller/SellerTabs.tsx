"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/seller", label: "요약" },
  { href: "/seller/products", label: "상품" },
  { href: "/seller/orders", label: "주문·배송" },
  { href: "/seller/claims", label: "취소·반품" },
  { href: "/seller/exchanges", label: "교환" },
  { href: "/seller/settlements", label: "정산" },
  { href: "/seller/settings", label: "판매자 정보" },
];

/** 판매자 센터 메뉴 */
export default function SellerTabs() {
  const path = usePathname();
  return (
    <nav className="filter-scroll mb-5" aria-label="판매자 센터 메뉴">
      {TABS.map((t) => {
        const on = t.href === "/seller" ? path === t.href : path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className={`filter-chip ${on ? "active" : ""}`} aria-current={on ? "page" : undefined}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
