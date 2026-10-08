"use client";

import { useRef } from "react";
import type { LayoutOption } from "@/lib/layout/types";
import { doorZones, type Box } from "@/lib/space/check";
import { FIXTURE_TEXT, shellGeometry } from "@/lib/space/draw";
import { footprint, isFixed } from "@/lib/space/placement";
import type { PlacedItem, Underlay } from "@/lib/space/types";

const mm = (m: number) => Math.round(m * 1000).toLocaleString("ko-KR");
const snap = (n: number, step = 0.05) => Math.round(n / step) * step;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

interface Props {
  option: LayoutOption;
  items: PlacedItem[];
  selected: string | null;
  bad: Set<string>;
  zoom: number;
  readOnly: boolean;
  onSelect: (id: string | null) => void;
  /** 끌기를 시작할 때 한 번(되돌리기 기록용) */
  onMoveStart: () => void;
  onMove: (id: string, x: number, y: number) => void;
  /** 도면 밑그림(따라 그린 공간). url이 있으면 겹쳐 그린다. */
  underlay?: (Underlay & { url: string }) | null;
  /** 가구를 고르면 보여 줄 문 앞 구역. 없으면 사무실 기준(문·출입구 앞 750mm) */
  zones?: Box[];
}

/**
 * 편집용 평면. 3D와 같은 배치(option)를 위에서 그린다.
 * 마우스: 누르면 고르고 바로 끌 수 있다. 터치: 처음 누르면 고르기만 하고, 고른 가구를 다시 눌러 끈다(화면 스크롤과 겹치지 않게).
 */
export default function EditorPlan({ option, items, selected, bad, zoom, readOnly, onSelect, onMoveStart, onMove, underlay, zones: customZones }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; ox: number; oy: number; moved: boolean } | null>(null);
  const { W, D } = option;
  const Y = (y: number) => D - y;
  const pad = 0.75;
  const fpOf = new Map(items.map((it) => [it.id, footprint(it)]));
  const zones = selected ? (customZones ?? doorZones({ doors: option.marks.doors, entrance: option.marks.entrance })) : [];
  const furn = option.objects.filter((o) => o.kind === "furniture" && o.plan);
  const shell = shellGeometry(option);
  const poly = shell.pts.map(([x, y]) => `${x},${Y(y)}`).join(" ");
  const [ea, eb, ec, ed] = shell.entrance;
  const [enx, eny] = shell.inward;

  const toWorld = (e: React.PointerEvent) => {
    const m = svg.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: D - p.y };
  };

  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    const id = (e.target as Element).closest("[data-id]")?.getAttribute("data-id") ?? null;
    if (!id) {
      onSelect(null);
      return;
    }
    const it = items.find((x) => x.id === id);
    const was = selected === id;
    onSelect(id);
    if (!it || readOnly || isFixed(it)) return;
    if (e.pointerType === "touch" && !was) return;
    const p = toWorld(e);
    drag.current = { id, ox: p.x - it.x, oy: p.y - it.y, moved: false };
    try {
      svg.current?.setPointerCapture(e.pointerId);
    } catch {
      /* 포인터를 잡지 못해도 끌기는 된다 */
    }
    e.preventDefault();
  };
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const it = items.find((x) => x.id === d.id);
    if (!it) return;
    const p = toWorld(e);
    const nx = r3(Math.min(W, Math.max(0, snap(p.x - d.ox))));
    const ny = r3(Math.min(D, Math.max(0, snap(p.y - d.oy))));
    if (Math.abs(nx - it.x) < 1e-4 && Math.abs(ny - it.y) < 1e-4) return;
    if (!d.moved) {
      onMoveStart();
      d.moved = true;
    }
    onMove(d.id, nx, ny);
  };
  const up = () => {
    drag.current = null;
  };

  const sel = selected ? fpOf.get(selected) : undefined;
  const hatch = "edhatch";

  return (
    <svg
      ref={svg}
      viewBox={`${-pad} ${-pad} ${W + pad * 2} ${D + pad * 2 + 0.35}`}
      style={{ width: `${zoom * 100}%`, touchAction: selected && !readOnly ? "none" : "pan-x pan-y" }}
      className="block h-auto select-none"
      role="img"
      aria-label={`편집 중인 평면 ${mm(W)} × ${mm(D)} mm`}
      data-testid="editor-plan"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <defs>
        <pattern id={hatch} patternUnits="userSpaceOnUse" width={0.14} height={0.14} patternTransform="rotate(45)">
          <rect width={0.14} height={0.14} fill="#dcd8cf" />
          <line x1={0} y1={0} x2={0} y2={0.14} stroke="#857f72" strokeWidth={0.035} />
        </pattern>
      </defs>
      <polygon points={poly} fill="#f4f1ea" />
      {underlay && (
        <image
          href={underlay.url}
          width={underlay.iw}
          height={underlay.ih}
          transform={`matrix(${underlay.m[0]} ${-underlay.m[1]} ${underlay.m[2]} ${-underlay.m[3]} ${underlay.m[4]} ${D - underlay.m[5]})`}
          opacity={0.45}
          preserveAspectRatio="none"
          pointerEvents="none"
          data-testid="editor-underlay"
        />
      )}
      {option.objects
        .filter((o) => o.kind === "floor" && o.name !== "바닥")
        .map((o, i) => (
          <rect key={`f${i}`} x={o.x} y={Y(o.y + o.d)} width={o.w} height={o.d} fill={o.color} fillOpacity={0.35} />
        ))}
      {zones.map((z, i) => (
        <rect key={`z${i}`} x={z.x} y={Y(z.y + z.d)} width={z.w} height={z.d} fill="#f59e0b" fillOpacity={0.1} stroke="#f59e0b" strokeOpacity={0.5} strokeWidth={0.015} strokeDasharray="0.06 0.05" />
      ))}
      {furn.map((o, i) => (
        <rect key={`p${i}`} x={o.x} y={Y(o.y + o.d)} width={Math.max(o.w, 0.001)} height={Math.max(o.d, 0.001)} fill={o.color} stroke="#8f8d84" strokeWidth={0.012} />
      ))}
      {option.objects
        .filter((o) => o.plan && o.kind === "glass")
        .map((o, i) => (
          <rect key={`g${i}`} x={o.x} y={Y(o.y + o.d)} width={o.w} height={o.d} fill="#cfe5ec" stroke="#8fb5c2" strokeWidth={0.012} />
        ))}
      {option.objects
        .filter((o) => o.plan && o.kind === "partition")
        .map((o, i) => (
          <rect key={`w${i}`} x={o.x} y={Y(o.y + o.d)} width={o.w} height={o.d} fill="#8e9aa8" />
        ))}
      {option.objects
        .filter((o) => o.kind === "pillar")
        .map((o, i) => (
          <g key={`pl${i}`}>
            <rect x={o.x} y={Y(o.y + o.d)} width={o.w} height={o.d} fill={`url(#${hatch})`} stroke="#3d3a35" strokeWidth={0.03} />
            <text x={o.x + o.w / 2} y={Y(o.y) + 0.26} textAnchor="middle" fontSize={0.19} fill="#5d5a52">
              {o.name.startsWith("기둥") ? "기둥" : o.name}
            </text>
          </g>
        ))}
      {shell.fixtures.map((f) => (
        <g key={`fx${f.id}`} data-fixture={f.status} pointerEvents="none">
          <rect x={f.box.x - 0.05} y={Y(f.box.y + f.box.d) - 0.05} width={f.box.w + 0.1} height={f.box.d + 0.1} rx={0.04} fill="none" stroke={f.status === "confirmed" ? "#1f6f8b" : "#b4643c"} strokeWidth={0.035} strokeDasharray={f.status === "confirmed" ? undefined : "0.12 0.08"} />
          <text x={Math.min(W - 0.6, Math.max(0.6, f.box.x + f.box.w / 2))} y={Y(f.box.y) + 0.24} textAnchor="middle" fontSize={0.16} fontWeight={700} fill={f.status === "confirmed" ? "#1f6f8b" : "#b4643c"} stroke="#ffffff" strokeWidth={0.05} paintOrder="stroke">
            {FIXTURE_TEXT[f.status]}
          </text>
        </g>
      ))}
      <polygon points={poly} fill="none" stroke="#2c3a33" strokeWidth={0.1} />
      {shell.windows.map(([x1, y1, x2, y2], i) => (
        <line key={`wn${i}`} x1={x1} y1={Y(y1)} x2={x2} y2={Y(y2)} stroke="#7fb8cc" strokeWidth={0.13} />
      ))}
      {shell.water.map((w) => (
        <g key={`wt${w.n}`} pointerEvents="none" data-testid="editor-water">
          <circle cx={w.x} cy={Y(w.y)} r={0.11} fill="#3b82c4" stroke="#ffffff" strokeWidth={0.03} />
          <text x={w.x} y={Y(w.y) - 0.17} textAnchor="middle" fontSize={0.16} fontWeight={700} fill="#3b82c4" stroke="#ffffff" strokeWidth={0.05} paintOrder="stroke">
            급배수 {w.n}
          </text>
        </g>
      ))}
      {shell.edges.map((e) => {
        const x = e.mid[0] + e.out[0] * 0.24;
        const y = Y(e.mid[1] + e.out[1] * 0.24);
        return (
          <text key={`el${e.n}`} x={x} y={y} dominantBaseline="middle" textAnchor="middle" transform={e.vertical ? `rotate(-90 ${x} ${y})` : undefined} fontSize={0.17} fill="#6b7480" pointerEvents="none">
            벽 {e.n} · {mm(e.len)}
          </text>
        );
      })}
      {option.marks.doors.map((d, i) =>
        d.vertical ? (
          <line key={`d${i}`} x1={d.x + 0.05} y1={Y(d.y)} x2={d.x + 0.05} y2={Y(d.y + d.w)} stroke="#ffffff" strokeWidth={0.12} />
        ) : (
          <line key={`d${i}`} x1={d.x} y1={Y(d.y + 0.05)} x2={d.x + d.w} y2={Y(d.y + 0.05)} stroke="#ffffff" strokeWidth={0.12} />
        ),
      )}
      {(option.marks.spots ?? []).map((sp, i) => (
        <g key={`sp${i}`} pointerEvents="none" data-testid="editor-spot">
          <line x1={sp.seg[0]} y1={Y(sp.seg[1])} x2={sp.seg[2]} y2={Y(sp.seg[3])} stroke="#ffffff" strokeWidth={0.16} />
          <text x={(sp.seg[0] + sp.seg[2]) / 2 + sp.inward[0] * 0.35} y={Y((sp.seg[1] + sp.seg[3]) / 2 + sp.inward[1] * 0.35) + 0.07} textAnchor="middle" fontSize={0.19} fill="#2c3a33" stroke="#ffffff" strokeWidth={0.06} paintOrder="stroke">
            {sp.label} {mm(Math.hypot(sp.seg[2] - sp.seg[0], sp.seg[3] - sp.seg[1]))}
          </text>
        </g>
      ))}
      <line x1={ea} y1={Y(eb)} x2={ec} y2={Y(ed)} stroke="#ffffff" strokeWidth={0.16} />
      <text x={(ea + ec) / 2 - enx * 0.4} y={Y((eb + ed) / 2 - eny * 0.4) + 0.08} textAnchor="middle" fontSize={0.22} fill="#2c3a33" stroke="#ffffff" strokeWidth={0.06} paintOrder="stroke" pointerEvents="none">
        {option.entranceLabel ?? "출입문"} {mm(Math.hypot(ec - ea, ed - eb))}
      </text>
      {option.rooms
        .filter((x) => x.key !== "work")
        .map((x, i) => (
          <text key={`rl${i}`} x={x.x + x.w / 2} y={Y(x.y + x.d) + 0.36} textAnchor="middle" fontSize={0.24} fontWeight={700} fill="#2c3a33" stroke="#ffffff" strokeWidth={0.07} paintOrder="stroke">
            {x.label.split(" · ")[0]}
          </text>
        ))}
      {items.map((it) => {
        const f = fpOf.get(it.id)!;
        return bad.has(it.id) ? <rect key={`b${it.id}`} x={f.x - 0.03} y={Y(f.y + f.d) - 0.03} width={f.w + 0.06} height={f.d + 0.06} rx={0.06} fill="#c2410c" fillOpacity={0.12} stroke="#c2410c" strokeWidth={0.045} /> : null;
      })}
      {items
        .filter((it) => it.seat)
        .map((it) => {
          const f = fpOf.get(it.id)!;
          return (
            <text key={`n${it.id}`} x={f.x + f.w / 2} y={Y(f.y + f.d / 2) + 0.08} textAnchor="middle" fontSize={0.21} fontWeight={700} fill="#ffffff" stroke="#2c3a33" strokeWidth={0.06} paintOrder="stroke" pointerEvents="none">
              {it.label.match(/\d+/)?.[0] ?? ""}
            </text>
          );
        })}
      {sel && <rect x={sel.x - 0.08} y={Y(sel.y + sel.d) - 0.08} width={sel.w + 0.16} height={sel.d + 0.16} rx={0.08} fill="none" stroke="#147dba" strokeWidth={0.05} strokeDasharray="0.14 0.09" pointerEvents="none" />}
      {/* 치수 */}
      <g fontSize={0.2} fill="#6b7480" stroke="none">
        <line x1={0} y1={-0.34} x2={W} y2={-0.34} stroke="#6b7480" strokeWidth={0.018} />
        <text x={W / 2} y={-0.42} textAnchor="middle">
          {mm(W)}
        </text>
        <line x1={-0.34} y1={0} x2={-0.34} y2={D} stroke="#6b7480" strokeWidth={0.018} />
        <text x={-0.42} y={D / 2} textAnchor="middle" transform={`rotate(-90 -0.42 ${D / 2})`}>
          {mm(D)}
        </text>
      </g>
      {/* 누르는 자리: 맨 위에 둔다. 작은 가구도 누르기 쉽게 최소 0.36m */}
      {items.map((it) => {
        const f = fpOf.get(it.id)!;
        const grow = Math.max(0, (0.36 - Math.min(f.w, f.d)) / 2);
        return (
          <rect
            key={`h${it.id}`}
            data-id={it.id}
            data-testid={`item-${it.id}`}
            x={f.x - grow}
            y={Y(f.y + f.d) - grow}
            width={f.w + grow * 2}
            height={f.d + grow * 2}
            fill="#000"
            fillOpacity={0}
            style={{ cursor: readOnly || isFixed(it) ? "pointer" : selected === it.id ? "grab" : "pointer" }}
          >
            <title>{it.label}</title>
          </rect>
        );
      })}
    </svg>
  );
}
