"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface TabDef {
  href: string;
  label: string;
  badge?: number;
}

export default function ProjectTabs({ tabs }: { tabs: TabDef[] }) {
  const pathname = usePathname();
  return (
    <nav className="project-tabs no-print sticky z-20 -mx-4 mb-5 overflow-x-auto border-b border-line bg-paper/95 px-4 backdrop-blur" aria-label="프로젝트 메뉴">
      <ul className="flex gap-1">
        {tabs.map((t) => {
          const active = pathname === t.href;
          return (
            <li key={t.href} className="shrink-0">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-3 text-sm transition ${active ? "border-ink font-semibold text-ink" : "border-transparent text-muted hover:text-ink"}`}
              >
                {t.label}
                {!!t.badge && <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${active ? "bg-ink text-white" : "bg-brand-soft text-brand"}`}>{t.badge}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
