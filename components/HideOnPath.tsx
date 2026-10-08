"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** 이미 그 화면에 있을 때는 같은 곳으로 가는 버튼을 숨긴다. */
export default function HideOnPath({ suffix, children }: { suffix: string; children: ReactNode }) {
  return usePathname().endsWith(suffix) ? null : <>{children}</>;
}
