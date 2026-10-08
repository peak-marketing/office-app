import { pickOption } from "../layout/coverage";
import type { LayoutInput, LayoutOption, LayoutResult } from "../layout/types";
import type { CheckReport } from "./check";
import { checkOption, composeOption, normalizeItems } from "./placement";
import type { PlacedItem, Placement, RoomModel } from "./types";

// 버전 하나가 보여 줄 배치. 실제 구조가 있는 버전은 실제 구조 + 제안 칸막이 + 놓인 가구로 그리고,
// 편집 기능 이전 버전은 저장된 자동 배치안을 그대로 쓴다.

export interface LayoutSource {
  input: LayoutInput;
  result: LayoutResult;
  selected_option: string;
  room: RoomModel | null;
  placement: Placement | null;
}

/** 칸막이·방을 가져올 자동 배치안. 빈 공간에서 시작했으면 null */
export function baseOptionOf(v: Pick<LayoutSource, "result" | "selected_option">): LayoutOption | null {
  if (!v.selected_option) return null;
  return v.result.options.find((o) => o.id === v.selected_option) ?? null;
}

export const isSpace = (v: Pick<LayoutSource, "room" | "placement">) => !!(v.room && v.placement);

export function versionOption(v: LayoutSource): LayoutOption | undefined {
  if (v.room && v.placement) return composeOption(v.room, baseOptionOf(v), v.placement.items);
  return pickOption(v.result, v.selected_option);
}

export const versionItems = (v: LayoutSource): PlacedItem[] => normalizeItems(v.placement?.items ?? []);

export function versionChecks(v: LayoutSource): CheckReport | null {
  if (!v.room || !v.placement) return null;
  return checkOption(composeOption(v.room, baseOptionOf(v), v.placement.items), v.input.staff);
}

/** 버전 이름: "버전 3 · 직접 수정" */
export function sourceLabel(source: string) {
  return source === "edited" ? "직접 수정" : source === "empty" ? "빈 공간에서 시작" : source === "auto" ? "자동 배치" : "";
}
