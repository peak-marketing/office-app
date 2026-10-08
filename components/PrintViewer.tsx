"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { LayoutOption } from "@/lib/layout/types";

const Viewer3D = dynamic(() => import("./Viewer3D"), { ssr: false });

/**
 * 인쇄용 3D. WebGL 캔버스는 인쇄 때 비어 나올 수 있어서,
 * 인쇄 직전에 현재 화면을 이미지로 떠서 그 이미지를 인쇄한다.
 */
export default function PrintViewer({ option, styleId }: { option: LayoutOption; styleId: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    const capture = () => {
      const canvas = wrap.current?.querySelector("canvas");
      if (canvas && canvas.width > 0) flushSync(() => setImage(canvas.toDataURL("image/png")));
    };
    // 첫 장면이 그려진 뒤 한 번 떠 두고, 시점을 돌렸을 수 있으니 인쇄 직전에 다시 뜬다.
    const timer = setInterval(() => {
      if (wrap.current?.querySelector("canvas")) {
        clearInterval(timer);
        setTimeout(capture, 800);
      }
    }, 200);
    window.addEventListener("beforeprint", capture);
    return () => {
      clearInterval(timer);
      window.removeEventListener("beforeprint", capture);
    };
  }, []);

  return (
    <div>
      <div ref={wrap} className="print:hidden">
        <Viewer3D option={option} styleId={styleId} className="aspect-[16/9] w-full rounded-lg border border-line" />
      </div>
      {image && (
        // eslint-disable-next-line @next/next/no-img-element -- 캔버스에서 뜬 data URL
        <img src={image} alt="3D 배치도" data-print-3d className="hidden aspect-[16/9] w-full rounded-lg border border-line object-cover print:block" />
      )}
    </div>
  );
}
