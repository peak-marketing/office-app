import raw from "./styles.json";

export interface StyleDef {
  id: "natural" | "chic" | "lovely";
  name: string;
  code: string;
  tagline: string;
  description: string;
  accent: string;
  background: string;
  palette: [string, string][];
  specs: [string, string][];
  /** 내추럴 기준 색 → 이 스타일의 색 */
  colors: Record<string, string>;
  plan: Record<string, string>;
}

export const STYLES = raw as unknown as StyleDef[];
export type StyleId = StyleDef["id"];

export function getStyle(id: string | null | undefined): StyleDef {
  return STYLES.find((s) => s.id === id) ?? STYLES[0];
}

export function styleColor(style: StyleDef, base: string) {
  return style.colors[base] ?? base;
}

/** 두 색을 섞는다. t=0이면 a, t=1이면 b. */
export function mix(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
