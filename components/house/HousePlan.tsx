import type { ReactNode, Ref, SVGProps } from "react";
import { bbox } from "@/lib/space/check";
import { OPENINGS, fixedLabel, mmText, roomColor, wallLines, type HouseModel } from "@/lib/space/house";
import { planBoxes, type HouseReport } from "@/lib/space/house-check";
import { openingGeoms, wallPieces, type HouseDoorZone } from "@/lib/space/house-geom";
import type { RoomDetection } from "@/lib/space/house-rooms";
import { worldParts } from "@/lib/space/placement";

// 집 전체 평면 그림(위에서 본 모습). 편집 화면과 고객·업체·운영자·인쇄 화면이 같은 그림을 쓴다. 좌표는 미터, 위쪽이 y가 큰 쪽이다.

export type HouseSelection = { kind: "item" | "fixed" | "wall" | "opening" | "room"; id: string } | null;

export interface HousePlanProps {
  house: HouseModel;
  det: RoomDetection;
  report?: HouseReport | null;
  selected?: HouseSelection;
  /** 보여 줄 문 앞 자리(없으면 그리지 않음) */
  zones?: HouseDoorZone[];
  underlayUrl?: string | null;
  zoom?: number;
  thumb?: boolean;
  /** 편집 화면: 가구·고정 구조물·문을 누를 자리를 그린다. */
  interactive?: boolean;
  /** 편집 화면의 덧그림(그리는 중인 벽 등). 평면 좌표(y는 이미 뒤집은 값)로 그린다. */
  overlay?: ReactNode;
  svgRef?: Ref<SVGSVGElement>;
  svgProps?: SVGProps<SVGSVGElement>;
  testid?: string;
  highlight?: string[];
}

export const PLAN_PAD = 1.1;
const OUTER = "#2f3b35";
const INNER = "#56635d";
const FIXED = "#d6cdbd";

/** 평면 글자 크기(미터). 집이 클수록 키운다. */
export const planFont = (h: Pick<HouseModel, "width" | "depth">) => Math.min(0.42, Math.max(0.2, Math.max(h.width, h.depth) / 42));

export default function HousePlan({ house, det, report, selected, zones = [], underlayUrl, zoom = 1, thumb = false, interactive = false, overlay, svgRef, svgProps, testid = "house-plan", highlight }: HousePlanProps) {
  const { width: W, depth: D } = house;
  const Y = (y: number) => D - y;
  const pad = thumb ? house.outerT + 0.1 : PLAN_PAD;
  const fs = planFont(house);
  const lines = wallLines(house);
  const pieces = wallPieces(house, lines);
  const geoms = openingGeoms(house, lines);
  const poly = house.outline.map(([x, y]) => `${x},${Y(y)}`).join(" ");
  const bad = new Set(report?.issues.flatMap((i) => i.ids) ?? []);
  const marked = new Set(highlight ?? []);
  const sel = selected ?? null;
  const rect = (b: { x: number; y: number; w: number; d: number }) => ({ x: b.x, y: Y(b.y + b.d), width: Math.max(b.w, 0.001), height: Math.max(b.d, 0.001) });
  const hatch = `hh-${Math.round(W * 1000)}-${Math.round(D * 1000)}`;
  const u = house.underlay;

  return (
    <svg
      ref={svgRef}
      viewBox={`${-pad} ${-pad} ${W + pad * 2} ${D + pad * 2}`}
      style={{ width: `${zoom * 100}%` }}
      className="block h-auto select-none"
      role="img"
      aria-label={`집 전체 평면 ${mmText(W)} × ${mmText(D)} mm`}
      data-testid={testid}
      data-depth={D}
      data-width={W}
      {...svgProps}
    >
      <defs>
        <pattern id={hatch} patternUnits="userSpaceOnUse" width={0.14} height={0.14} patternTransform="rotate(45)">
          <rect width={0.14} height={0.14} fill="#dcd8cf" />
          <line x1={0} y1={0} x2={0} y2={0.14} stroke="#857f72" strokeWidth={0.035} />
        </pattern>
      </defs>
      <polygon points={poly} fill="#f6f4ef" />
      {u && underlayUrl && (
        <image
          href={underlayUrl}
          width={u.iw}
          height={u.ih}
          transform={`matrix(${u.m[0]} ${-u.m[1]} ${u.m[2]} ${-u.m[3]} ${u.m[4]} ${D - u.m[5]})`}
          opacity={0.45}
          preserveAspectRatio="none"
          pointerEvents="none"
          data-testid="house-underlay"
        />
      )}
      {det.regions.map((r) => (
        <g key={`r${r.idx}`} data-room={r.idx} opacity={underlayUrl && u ? 0.55 : 1}>
          {r.rects.map((b, i) => (
            <rect key={i} {...rect(b)} fill={r.sliver ? "#efe9df" : roomColor(r.kind)} stroke={sel?.kind === "room" && sel.id === String(r.idx) ? "#147dba" : "none"} strokeWidth={0.04} />
          ))}
        </g>
      ))}
      {sel?.kind === "room" &&
        det.regions
          .filter((r) => String(r.idx) === sel.id)
          .flatMap((r) => r.rects)
          .map((b, i) => <rect key={`rs${i}`} {...rect(b)} fill="#147dba" fillOpacity={0.12} pointerEvents="none" />)}
      {zones.map((z, i) => (
        <rect key={`z${i}`} {...rect(z)} fill="#f59e0b" fillOpacity={0.12} stroke="#f59e0b" strokeOpacity={0.6} strokeWidth={0.02} strokeDasharray="0.08 0.06" pointerEvents="none" data-testid="house-zone" />
      ))}
      {house.fixed.map((f) => (
        <g key={f.id} data-fixed={f.id}>
          <rect {...rect(f)} fill={f.h == null ? `url(#${hatch})` : FIXED} stroke={sel?.kind === "fixed" && sel.id === f.id ? "#147dba" : "#6f685c"} strokeWidth={sel?.kind === "fixed" && sel.id === f.id ? 0.05 : 0.025} />
          {!thumb && (
            <text x={f.x + f.w / 2} y={Y(f.y + f.d / 2) + fs * 0.3} textAnchor="middle" fontSize={fs * 0.62} fill="#4d483f" stroke="#ffffff" strokeWidth={fs * 0.15} paintOrder="stroke" pointerEvents="none">
              {fixedLabel(f)}
            </text>
          )}
        </g>
      ))}
      {house.items.flatMap((it) => {
        const ps = worldParts(it).filter((o) => o.plan);
        // 부품이 없는 가구(후속: 규격만 있는 상품)는 바닥면 상자로 그린다.
        return (ps.length ? ps : planBoxes(it).map((b) => ({ ...b, color: "#c9c3b6" }))).map((o, i) => <rect key={`${it.id}-${i}`} {...rect(o)} fill={o.color} stroke="#8f8d84" strokeWidth={0.012} pointerEvents="none" />);
      })}
      {house.items.map((it) => {
        const b = bbox(planBoxes(it));
        const isSel = sel?.kind === "item" && sel.id === it.id;
        return (
          <g key={`b${it.id}`} pointerEvents="none">
            {bad.has(it.id) && <rect x={b.x - 0.03} y={Y(b.y + b.d) - 0.03} width={b.w + 0.06} height={b.d + 0.06} rx={0.05} fill="#c2410c" fillOpacity={0.12} stroke="#c2410c" strokeWidth={0.04} />}
            {marked.has(it.id) && <rect x={b.x - 0.05} y={Y(b.y + b.d) - 0.05} width={b.w + 0.1} height={b.d + 0.1} rx={0.06} fill="none" stroke="#147dba" strokeWidth={0.04} />}
            {isSel && <rect x={b.x - 0.08} y={Y(b.y + b.d) - 0.08} width={b.w + 0.16} height={b.d + 0.16} rx={0.08} fill="none" stroke="#147dba" strokeWidth={0.05} strokeDasharray="0.14 0.09" />}
          </g>
        );
      })}
      {pieces.map((p, i) => (
        <rect key={`w${i}`} {...rect(p)} fill={sel?.kind === "wall" && sel.id === p.ref ? "#147dba" : p.outer ? OUTER : INNER} data-wall={p.ref} />
      ))}
      {geoms.map((g) => {
        const isSel = sel?.kind === "opening" && sel.id === g.id;
        const stroke = isSel ? "#147dba" : "#2f3b35";
        const face = (o: number): [number, number, number, number] => [g.a[0] + g.n[0] * o, Y(g.a[1] + g.n[1] * o), g.b[0] + g.n[0] * o, Y(g.b[1] + g.n[1] * o)];
        if (g.kind === "window") {
          const mid = face((g.o0 + g.o1) / 2);
          return (
            <g key={g.id} data-opening={g.id}>
              <rect {...rect(g.box)} fill="#e3f1f6" stroke={isSel ? "#147dba" : "#7fb8cc"} strokeWidth={isSel ? 0.04 : 0.02} />
              <line x1={mid[0]} y1={mid[1]} x2={mid[2]} y2={mid[3]} stroke="#7fb8cc" strokeWidth={0.025} />
            </g>
          );
        }
        if (g.kind === "passage") {
          const [f0, f1] = [face(g.o0), face(g.o1)];
          return (
            <g key={g.id} data-opening={g.id} stroke={isSel ? "#147dba" : "#8a948f"} strokeWidth={0.02} strokeDasharray="0.07 0.05">
              <line x1={f0[0]} y1={f0[1]} x2={f0[2]} y2={f0[3]} />
              <line x1={f1[0]} y1={f1[1]} x2={f1[2]} y2={f1[3]} />
            </g>
          );
        }
        if (g.kind === "sliding") {
          const t = g.o1 - g.o0;
          const half = g.width / 2 + 0.05;
          const seg = (o: number, from: number) => {
            const ax = g.a[0] + g.dir[0] * from + g.n[0] * o, ay = g.a[1] + g.dir[1] * from + g.n[1] * o;
            return <line x1={ax} y1={Y(ay)} x2={ax + g.dir[0] * half} y2={Y(ay + g.dir[1] * half)} />;
          };
          return (
            <g key={g.id} data-opening={g.id} stroke={stroke} strokeWidth={0.035}>
              {seg(g.o0 + t * 0.3, 0)}
              {seg(g.o0 + t * 0.7, g.width - half)}
            </g>
          );
        }
        if (!g.hinge || !g.swing || !g.latch) return null;
        const hx = g.hinge[0], hy = Y(g.hinge[1]);
        const px = g.hinge[0] + g.swing[0] * g.width, py = Y(g.hinge[1] + g.swing[1] * g.width);
        const lx = g.latch[0], ly = Y(g.latch[1]);
        const sweep = (px - hx) * (ly - hy) - (py - hy) * (lx - hx) > 0 ? 1 : 0;
        return (
          <g key={g.id} data-opening={g.id} fill="none" stroke={stroke}>
            <line x1={hx} y1={hy} x2={px} y2={py} strokeWidth={0.04} />
            <path d={`M ${px} ${py} A ${g.width} ${g.width} 0 0 ${sweep} ${lx} ${ly}`} strokeWidth={0.015} strokeDasharray="0.05 0.04" />
            {g.kind === "entry" && !thumb && (
              <text x={(g.a[0] + g.b[0]) / 2 - g.n[0] * (house.outerT + fs * 0.9)} y={Y((g.a[1] + g.b[1]) / 2 - g.n[1] * (house.outerT + fs * 0.9)) + fs * 0.3} textAnchor="middle" fontSize={fs * 0.75} fill="#2f3b35" stroke="none">
                {OPENINGS.entry.label}
              </text>
            )}
          </g>
        );
      })}
      {!thumb &&
        det.regions
          .filter((r) => !r.sliver)
          .map((r) => (
            <g key={`l${r.idx}`} pointerEvents="none" data-room-label={r.display}>
              <text x={r.anchor[0]} y={Y(r.anchor[1]) - fs * 0.05} textAnchor="middle" fontSize={fs} fontWeight={700} fill={r.name ? "#24302b" : "#7b847f"} stroke="#ffffff" strokeWidth={fs * 0.22} paintOrder="stroke">
                {r.display}
              </text>
              <text x={r.anchor[0]} y={Y(r.anchor[1]) + fs * 0.95} textAnchor="middle" fontSize={fs * 0.72} fill="#5b6560" stroke="#ffffff" strokeWidth={fs * 0.18} paintOrder="stroke">
                {r.area.toFixed(1)}㎡
              </text>
            </g>
          ))}
      {!thumb && (
        <g fontSize={fs * 0.8} fill="#6b7480" pointerEvents="none">
          <line x1={0} y1={-house.outerT - 0.3} x2={W} y2={-house.outerT - 0.3} stroke="#6b7480" strokeWidth={0.015} />
          <text x={W / 2} y={-house.outerT - 0.38} textAnchor="middle" data-testid="house-dim-w">
            {mmText(W)}
          </text>
          <line x1={-house.outerT - 0.3} y1={0} x2={-house.outerT - 0.3} y2={D} stroke="#6b7480" strokeWidth={0.015} />
          <text x={-house.outerT - 0.38} y={D / 2} textAnchor="middle" transform={`rotate(-90 ${-house.outerT - 0.38} ${D / 2})`} data-testid="house-dim-d">
            {mmText(D)}
          </text>
          {house.outline.length > 4 &&
            lines
              .filter((l) => l.outer && l.len >= 0.8)
              .map((l) => {
                const off = house.outerT + fs * 0.9;
                const x = (l.a[0] + l.b[0]) / 2 - l.n[0] * off;
                const y = Y((l.a[1] + l.b[1]) / 2 - l.n[1] * off);
                return (
                  <text key={l.ref} x={x} y={y + fs * 0.25} textAnchor="middle" transform={Math.abs(l.dir[1]) > 0.5 ? `rotate(-90 ${x} ${y})` : undefined} fontSize={fs * 0.65}>
                    {mmText(l.len)}
                  </text>
                );
              })}
          {sel?.kind === "wall" &&
            lines
              .filter((l) => l.ref === sel.id)
              .map((l) => {
                const x = (l.a[0] + l.b[0]) / 2 + l.n[0] * (l.t / 2 + fs * 0.7);
                const y = Y((l.a[1] + l.b[1]) / 2 + l.n[1] * (l.t / 2 + fs * 0.7));
                return (
                  <text key={`sl${l.ref}`} x={x} y={y + fs * 0.3} textAnchor="middle" fill="#147dba" fontWeight={700} stroke="#ffffff" strokeWidth={fs * 0.2} paintOrder="stroke" fontSize={fs * 0.85}>
                    {mmText(l.len)}
                  </text>
                );
              })}
        </g>
      )}
      {interactive && (
        <g>
          {house.fixed.map((f) => {
            const grow = Math.max(0, (0.36 - Math.min(f.w, f.d)) / 2);
            return <rect key={`hf${f.id}`} x={f.x - grow} y={Y(f.y + f.d) - grow} width={f.w + grow * 2} height={f.d + grow * 2} fill="#000" fillOpacity={0} data-hit="fixed" data-id={f.id} data-testid={`fixed-${f.id}`} />;
          })}
          {geoms.map((g) => {
            const grow = 0.12;
            return <rect key={`ho${g.id}`} x={g.box.x - grow} y={Y(g.box.y + g.box.d) - grow} width={g.box.w + grow * 2} height={g.box.d + grow * 2} fill="#000" fillOpacity={0} data-hit="opening" data-id={g.id} data-testid={`opening-${g.id}`} />;
          })}
          {house.items.map((it) => {
            const b = bbox(planBoxes(it));
            const grow = Math.max(0, (0.36 - Math.min(b.w, b.d)) / 2);
            return (
              <rect key={`hi${it.id}`} x={b.x - grow} y={Y(b.y + b.d) - grow} width={b.w + grow * 2} height={b.d + grow * 2} fill="#000" fillOpacity={0} data-hit="item" data-id={it.id} data-testid={`item-${it.id}`}>
                <title>{it.label}</title>
              </rect>
            );
          })}
        </g>
      )}
      {overlay}
    </svg>
  );
}
