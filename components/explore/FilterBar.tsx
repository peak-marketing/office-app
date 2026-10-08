"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Icon from "../Icon";

export interface FilterGroup {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

/**
 * 공간 종류·평수·스타일 필터. 칩을 누르면 휴대폰에서는 아래에서 올라오는 선택창,
 * 넓은 화면에서는 칩 아래 작은 창으로 고른다. 고르면 바로 목록이 바뀐다.
 */
export default function FilterBar({ basePath, groups, current }: { basePath: string; groups: FilterGroup[]; current: Record<string, string> }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const href = (patch: Record<string, string>) => {
    const next = { ...current, ...patch };
    const qs = new URLSearchParams(Object.entries(next).filter(([, v]) => v));
    return qs.toString() ? `${basePath}?${qs}` : basePath;
  };
  const pick = (key: string, value: string) => {
    setOpen(null);
    router.push(href({ [key]: value }), { scroll: false });
  };
  const active = groups.some((g) => current[g.key]);
  const group = groups.find((g) => g.key === open);

  return (
    <div className="filter-bar" data-testid="filter-bar">
      <div className="filter-scroll">
        {groups.map((g) => {
          const chosen = g.options.find((o) => o.value === current[g.key]);
          return (
            <div key={g.key} className="relative shrink-0">
              <button type="button" className={`filter-chip ${chosen ? "active" : ""}`} aria-expanded={open === g.key} aria-haspopup="dialog" onClick={() => setOpen(open === g.key ? null : g.key)} data-filter={g.key}>
                {chosen ? chosen.label : g.label}
                <Icon name="chevron" className={`size-3.5 transition ${open === g.key ? "-rotate-90" : "rotate-90"}`} />
              </button>
              {open === g.key && (
                <div className="filter-popover hidden md:block" role="dialog" aria-label={`${g.label} 고르기`}>
                  <Options g={g} value={current[g.key] ?? ""} onPick={(v) => pick(g.key, v)} />
                </div>
              )}
            </div>
          );
        })}
        {active && (
          <button type="button" className="filter-chip filter-reset" onClick={() => router.push(basePath, { scroll: false })}>
            초기화
          </button>
        )}
      </div>
      {group && (
        <div className="md:hidden">
          <button type="button" className="sheet-backdrop" aria-label="닫기" onClick={() => setOpen(null)} />
          <div className="filter-sheet" role="dialog" aria-modal="true" aria-label={`${group.label} 고르기`}>
            <div className="sheet-handle" aria-hidden />
            <div className="flex items-center justify-between px-5 pb-2 pt-1">
              <b className="text-lg">{group.label}</b>
              <button type="button" className="icon-action" aria-label="닫기" onClick={() => setOpen(null)}>
                <Icon name="close" />
              </button>
            </div>
            <Options g={group} value={current[group.key] ?? ""} onPick={(v) => pick(group.key, v)} />
          </div>
        </div>
      )}
    </div>
  );
}

function Options({ g, value, onPick }: { g: FilterGroup; value: string; onPick: (v: string) => void }) {
  return (
    <ul className="filter-options">
      {[{ value: "", label: "전체" }, ...g.options].map((o) => (
        <li key={o.value || "all"}>
          <button type="button" onClick={() => onPick(o.value)} aria-pressed={value === o.value} className={value === o.value ? "is-on" : ""}>
            {o.label}
            {value === o.value && <Icon name="check" className="size-5" />}
          </button>
        </li>
      ))}
    </ul>
  );
}
