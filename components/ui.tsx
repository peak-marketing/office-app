import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/lib/actions";
import { currentUser, homeFor } from "@/lib/auth";
import { PROJECT_STATUS, STATUS_FLOW, type ProjectStatus } from "@/lib/constants";
import { countUnread } from "@/lib/data";
import { get } from "@/lib/db";
import { partnerRoles } from "@/lib/partner";
import SectionTabs from "./SectionTabs";
import Icon from "./Icon";
import SiteNavigation, { type NavigationItem } from "./SiteNavigation";

export const BRAND = "오피스매칭";

export async function SiteHeader() {
  const user = await currentUser();
  const professional = !!user && user.role !== "customer";
  const unread = user ? countUnread(user.id) : 0;
  const cart = user?.role === "customer" ? (get<{ n: number }>(`SELECT count(*) AS n FROM cart_items WHERE user_id = ?`, user.id)?.n ?? 0) : 0;
  const start = user ? "/spaces/new" : `/signup?next=${encodeURIComponent("/spaces/new")}`;
  const { vendor, seller } = partnerRoles(user);
  let links: NavigationItem[];
  let mobile: NavigationItem[];
  if (user?.role === "admin") {
    links = [
      { href: "/admin", label: "요청 관리", icon: "briefcase" },
      { href: "/admin/vendors", label: "파트너", icon: "user", match: ["/admin/sellers"] },
      { href: "/admin/orders", label: "쇼핑 운영", icon: "bag", match: ["/admin/products", "/admin/settlements"] },
      { href: "/admin/community", label: "커뮤니티", icon: "chat" },
      { href: "/admin/integrations", label: "연동 상태", icon: "sliders" },
    ];
    mobile = [...links.slice(0, 4), { href: "/notifications", label: "알림", icon: "bell" }];
  } else if (user?.role === "vendor") {
    links = [
      ...(vendor ? [{ href: "/vendor", label: "요청·제안", icon: "briefcase" as const }, { href: "/vendor/open", label: "참여 가능 요청", icon: "search" as const }, { href: "/vendor/profile", label: "업체 소개·사례", icon: "user" as const }] : []),
      ...(seller ? [{ href: "/seller", label: "판매자 센터", icon: "bag" as const }] : []),
      { href: "/partner", label: "파트너 센터", icon: "grid" },
    ];
    mobile = [...links.slice(0, 4), { href: "/notifications", label: "알림", icon: "bell" }];
  } else {
    links = [
      { href: "/", label: "홈", icon: "home" },
      { href: "/community", label: "커뮤니티", icon: "chat" },
      { href: "/shop", label: "쇼핑", icon: "bag", match: ["/cart", "/checkout", "/orders"] },
      { href: "/cases", label: "시공·견적", icon: "grid", match: ["/vendors", "/try"] },
      { href: "/projects", label: "내 공간", icon: "layout", match: ["/spaces", "/homes"] },
    ];
    mobile = [
      { href: "/", label: "홈", icon: "home" },
      { href: "/community", label: "커뮤니티", icon: "chat" },
      { href: "/shop", label: "쇼핑", icon: "bag", match: ["/cart", "/checkout", "/orders"] },
      { href: "/projects", label: "내 공간", icon: "layout", match: ["/spaces", "/homes"] },
      { href: "/me", label: "마이", icon: "user", match: ["/saved"] },
    ];
  }
  return <>
    <header className="site-header no-print">
      <div className="header-inner">
        <Link href={professional ? homeFor(user) : "/"} className="brand-logo"><span className="brand-symbol"><Icon name="layout" className="size-5" /></span>{BRAND}</Link>
        <SiteNavigation items={links} />
        <div className="header-actions">
          {!professional && <Link href="/search" className="icon-action" aria-label="검색"><Icon name="search" /></Link>}
          {!professional && <Link href="/cart" className="icon-action" aria-label={cart ? `장바구니 ${cart}개` : "장바구니"} data-testid="header-cart"><Icon name="cart" />{cart > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">{cart}</span>}</Link>}
          {user ? <>
            <Link href="/notifications" className="icon-action" aria-label={unread ? `알림 ${unread}건 읽지 않음` : "알림"}><Icon name="bell" />{unread > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">{unread}</span>}</Link>
            <details className="account-menu"><summary className="icon-action" aria-label="내 계정 메뉴"><Icon name="user" /></summary><div className="account-dropdown"><p className="border-b border-line px-3 py-3 text-sm font-bold">{user.name}님</p>
              {professional ? <Link href={homeFor(user)}>내 관리 화면</Link> : <><Link href="/me">마이페이지</Link><Link href="/projects">내 공간</Link><Link href="/orders">주문 내역</Link><Link href="/saved">저장한 것</Link></>}
              {user.role === "vendor" && <Link href="/partner">파트너 센터</Link>}
              <Link href="/guide">이용 방법</Link><form action={logout}><button>로그아웃</button></form></div></details>
          </> : <><Link href="/partners" className="header-partner whitespace-nowrap text-xs text-muted">파트너 입점</Link><Link href="/login" className="btn btn-sm border-transparent">로그인</Link></>}
          {!professional && <Link href={start} className="header-request btn btn-primary whitespace-nowrap">내 공간 만들기<Icon name="plus" className="size-4" /></Link>}
        </div>
      </div>
      {!professional && <SectionTabs />}
    </header>
    <SiteNavigation items={mobile} mobile />
  </>;
}

export function Page({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return <main className={`page-shell ${narrow ? "narrow" : ""}`}>{children}</main>;
}

export function PageTitle({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {sub && <p className="mt-1.5 text-sm text-muted">{sub}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const tone =
    status === "draft" ? "bg-white text-muted" : status === "contracted" || status === "closed" ? "bg-ink text-white border-ink" : "bg-brand-soft text-brand border-brand/30";
  return <span className={`badge ${tone}`}>{PROJECT_STATUS[status].label}</span>;
}

export function Badge({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "warn" | "brand" }) {
  const cls = tone === "warn" ? "bg-warn-soft text-warn border-warn/30" : tone === "brand" ? "bg-brand-soft text-brand border-brand/30" : "bg-white text-muted";
  return <span className={`badge ${cls}`}>{children}</span>;
}

export function Steps({ status }: { status: ProjectStatus }) {
  const index = status === "closed" ? STATUS_FLOW.length : STATUS_FLOW.indexOf(status);
  return (
    <ol className="flex flex-wrap gap-x-1 gap-y-2 text-xs">
      {STATUS_FLOW.map((s, i) => (
        <li key={s} className="flex items-center gap-1">
          <span
            className={`grid size-5 place-items-center rounded-full text-[10px] font-semibold ${i < index ? "bg-brand text-white" : i === index ? "bg-ink text-white" : "border border-line bg-white text-muted"}`}
          >
            {i + 1}
          </span>
          <span className={i === index ? "font-semibold" : "text-muted"}>{PROJECT_STATUS[s].label}</span>
          {i < STATUS_FLOW.length - 1 && <span className="mx-1 text-line">—</span>}
        </li>
      ))}
    </ol>
  );
}

/** 목록 카드용 짧은 단계 표시 */
export function StageBar({ status }: { status: ProjectStatus }) {
  const index = status === "closed" ? STATUS_FLOW.length : STATUS_FLOW.indexOf(status);
  return (
    <div>
      <div className="flex gap-1" aria-hidden>
        {STATUS_FLOW.map((s, i) => (
          <span key={s} className={`h-1.5 flex-1 rounded-full ${i < index ? "bg-brand" : i === index ? "bg-ink" : "bg-line"}`} />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted">
        <b className="text-ink">{PROJECT_STATUS[status].label}</b>
        {status !== "closed" && ` · ${Math.min(index + 1, STATUS_FLOW.length)}/${STATUS_FLOW.length} 단계`}
      </p>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warn"; title?: string; children: ReactNode }) {
  return (
    <div className={`rounded-xl border p-4 text-sm leading-relaxed ${tone === "warn" ? "border-warn/30 bg-warn-soft text-warn" : "border-line bg-sand text-ink"}`}>
      {title && <p className="mb-1 font-semibold">{title}</p>}
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">{children}</div>;
}
