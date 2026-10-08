"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { LayoutOption } from "@/lib/layout/types";
import Icon from "./Icon";

const Viewer3D = dynamic(() => import("./Viewer3D"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-muted">3D 화면을 불러오는 중…</div>,
});

/** 입체 배치도: 먼저 그려 둔 이미지를 보여 주고, 원하면 직접 돌려 볼 수 있게 한다. */
export default function StructureView({ option, styleId, image }: { option: LayoutOption; styleId: string; image?: number | null }) {
  const [live, setLive] = useState(!image);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-sand">
      {live ? (
        <Viewer3D option={option} styleId={styleId} className="h-[360px] sm:h-[480px]" />
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- 업로드 파일 */}
          <img src={`/files/${image}`} alt="입체 배치도" loading="lazy" className="block aspect-[16/11] w-full object-cover" />
          <button type="button" onClick={() => setLive(true)} className="btn absolute bottom-3 right-3 shadow-sm">
            <Icon name="rotate" className="size-4" />
            직접 돌려 보기
          </button>
        </>
      )}
    </div>
  );
}
