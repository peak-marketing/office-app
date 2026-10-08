"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { LayoutOption } from "@/lib/layout/types";
import PlanSvg from "../PlanSvg";

const Viewer3D = dynamic(() => import("../Viewer3D"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-muted">3D 화면을 불러오는 중…</div>,
});

/** 저장한(또는 업체에 보낸) 배치를 3D와 치수 평면도로 본다. 둘은 같은 배치 데이터로 그린다. */
export default function SpaceView({ option, styleId, highlight, height = "min-h-[380px] lg:min-h-[520px]", label, start = "3d" }: { option: LayoutOption; styleId: string; highlight?: string[]; height?: string; label?: string; start?: "3d" | "plan" }) {
  const [tab, setTab] = useState<"3d" | "plan">(start);
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-white" data-testid="space-view">
      <div className="no-print flex flex-wrap items-center gap-1 border-b border-line bg-surface p-2">
        {(["3d", "plan"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`btn btn-sm ${tab === t ? "btn-primary" : ""}`} aria-pressed={tab === t} data-testid={`space-${t}`}>
            {t === "3d" ? "3D" : "치수 평면도"}
          </button>
        ))}
        {label && <span className="ml-auto pr-2 text-xs text-muted">{label}</span>}
      </div>
      {tab === "3d" ? (
        <Viewer3D option={option} styleId={styleId} className={`${height} flex-1`} />
      ) : (
        <div className="max-h-[680px] overflow-auto p-2">
          <PlanSvg option={option} styleId={styleId} space highlight={highlight} />
        </div>
      )}
    </div>
  );
}
