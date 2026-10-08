import { mm } from "@/lib/constants";
import type { LayoutOption } from "@/lib/layout/types";
import { FIXTURE_TEXT, shellGeometry } from "@/lib/space/draw";
import { getStyle, mix, styleColor } from "@/lib/styles";

const S = 60; // px per metre
const ML = 96;
const MR = 96;
const MT = 78;
const MB = 84;
const T = 0.1; // 칸막이 두께(m)

/**
 * 치수 평면도. 3D와 같은 좌표 데이터를 위에서 내려다본 모습으로 그린다.
 * thumb: 작은 카드용. 치수·글자를 빼고 방 이름과 동선만 크게 그린다.
 * space: 내 공간(실제 구조) 배치. 실제 벽과 자동 배치가 제안한 칸막이를 범례로 나눠 보여 준다.
 * highlight: 강조할 가구 묶음 id(바뀐 가구 등)
 */
export default function PlanSvg({ option, styleId, thumb = false, space = false, highlight }: { option: LayoutOption; styleId: string; thumb?: boolean; space?: boolean; highlight?: string[] }) {
  const style = getStyle(styleId);
  const { W, D } = option;
  const ink = style.plan["#233d34"] ?? "#233d34";
  const soft = mix(ink, "#ffffff", 0.45);
  const sc = (base: string) => styleColor(style, base);
  const ml = thumb ? 10 : ML;
  const mr = thumb ? 10 : MR;
  const mt = thumb ? 10 : MT;
  const mb = thumb ? 10 : MB;
  const X = (x: number) => ml + x * S;
  const Y = (y: number) => mt + (D - y) * S;
  const shell = shellGeometry(option);
  const extraLegend = space && !thumb && (shell.water.length > 0 || shell.fixtures.length > 0);
  const width = ml + W * S + mr;
  const height = mt + D * S + mb + (space && !thumb ? 22 : 0) + (extraLegend ? 20 : 0);
  const polyPoints = shell.pts.map(([x, y]) => `${X(x)},${Y(y)}`).join(" ");
  const [ea, eb, ec, ed] = shell.entrance;
  const [enx, eny] = shell.inward;
  // 출입문 표기는 문 바깥쪽(안쪽 방향의 반대)에 둔다.
  const entMid = { x: (X(ea) + X(ec)) / 2 - enx * 24, y: (Y(eb) + Y(ed)) / 2 + eny * 24 };
  const hatch = `hatch-${Math.round(W * 1000)}-${Math.round(D * 1000)}`;
  const marked = new Set(highlight ?? []);
  const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
  const rooms = option.rooms.filter((r) => r.key !== "work");
  const byX = [...rooms].sort((a, b) => a.x - b.x);
  const byY = [...rooms].sort((a, b) => a.y - b.y);
  // 출입구 표기와 겹치지 않는 쪽에 업무 공간 이름을 둔다.
  const workLabelLeft = (ea + ec) / 2 > W / 2;
  const path = option.visitorPath;
  const font = thumb ? 30 : 13;

  const rect = (o: { x: number; y: number; w: number; d: number }, fill: string, key: string, stroke = "none", sw = 0.5) => (
    <rect key={key} x={X(o.x)} y={Y(o.y + o.d)} width={o.w * S} height={o.d * S} fill={fill} stroke={stroke} strokeWidth={sw} />
  );
  const tick = (x: number, y: number, key: string) => <line key={key} x1={x - 4} y1={y + 4} x2={x + 4} y2={y - 4} stroke={ink} strokeWidth={1} />;
  const hdim = (x1: number, x2: number, py: number, text: string, key: string) => (
    <g key={key}>
      <line x1={X(x1)} y1={py} x2={X(x2)} y2={py} stroke={ink} strokeWidth={0.8} />
      {tick(X(x1), py, "a")}
      {tick(X(x2), py, "b")}
      <text x={(X(x1) + X(x2)) / 2} y={py - 6} textAnchor="middle" fontSize={12} fill={ink}>
        {text}
      </text>
    </g>
  );
  const vdim = (y1: number, y2: number, px: number, text: string, key: string) => (
    <g key={key}>
      <line x1={px} y1={Y(y1)} x2={px} y2={Y(y2)} stroke={ink} strokeWidth={0.8} />
      {tick(px, Y(y1), "a")}
      {tick(px, Y(y2), "b")}
      <text x={px - 7} y={(Y(y1) + Y(y2)) / 2} textAnchor="middle" fontSize={12} fill={ink} transform={`rotate(-90 ${px - 7} ${(Y(y1) + Y(y2)) / 2})`}>
        {text}
      </text>
    </g>
  );

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={`${option.title} 평면도`}>
      <defs>
        <pattern id={hatch} patternUnits="userSpaceOnUse" width={8} height={8} patternTransform="rotate(45)">
          <rect width={8} height={8} fill="#dcd8cf" />
          <line x1={0} y1={0} x2={0} y2={8} stroke="#857f72" strokeWidth={2} />
        </pattern>
      </defs>
      <rect width={width} height={height} fill="#ffffff" />
      <g fontFamily='"Apple SD Gothic Neo", "Malgun Gothic", sans-serif'>
        <polygon points={polyPoints} fill={mix(sc("#d9d4c9"), "#ffffff", 0.72)} />
        {option.objects
          .filter((o) => o.kind === "floor" && o.name !== "바닥")
          .map((o, i) => rect(o, mix(sc(o.color), "#ffffff", 0.5), `rf${i}`))}
        {option.objects
          .filter((o) => o.plan && o.kind === "furniture")
          .map((o, i) => rect(o, sc(o.color), `f${i}`, soft))}
        {option.objects
          .filter((o) => o.plan && o.kind === "glass")
          .map((o, i) => rect(o, mix(sc(o.color), "#ffffff", 0.2), `g${i}`, soft))}
        {option.objects
          .filter((o) => o.plan && o.kind === "partition")
          .map((o, i) => rect(o, space ? "#8e9aa8" : mix(ink, "#ffffff", 0.2), `p${i}`))}
        {option.objects
          .filter((o) => o.kind === "pillar")
          .map((o, i) => rect(o, `url(#${hatch})`, `pl${i}`, ink, thumb ? 3 : 1.4))}
        {/* 집 방의 고정 구조물 이름(기둥이 아닌 것만) */}
        {!thumb &&
          option.objects
            .filter((o) => o.kind === "pillar" && !o.name.startsWith("기둥"))
            .map((o, i) => (
              <text key={`pn${i}`} x={X(o.x + o.w / 2)} y={Y(o.y + o.d / 2) + 4} textAnchor="middle" fontSize={10} fontWeight={600} fill={ink} stroke="#ffffff" strokeWidth={3} paintOrder="stroke" data-testid="plan-fixed">
                {o.name}
              </text>
            ))}
        {[...marked].map((id) => {
          const parts = option.objects.filter((o) => o.g === id && o.plan);
          if (!parts.length) return null;
          const x1 = Math.min(...parts.map((o) => o.x)) - 0.06;
          const y1 = Math.min(...parts.map((o) => o.y)) - 0.06;
          const x2 = Math.max(...parts.map((o) => o.x + o.w)) + 0.06;
          const y2 = Math.max(...parts.map((o) => o.y + o.d)) + 0.06;
          return <rect key={`hl${id}`} x={X(x1)} y={Y(y2)} width={(x2 - x1) * S} height={(y2 - y1) * S} rx={4} fill="#147dba" fillOpacity={0.12} stroke="#147dba" strokeWidth={thumb ? 4 : 2} />;
        })}
        {/* 탕비 설비: 자동 제안 위치는 점선, 고객이 확인한 위치는 실선 */}
        {shell.fixtures.map((f) => (
          <g key={`fx${f.id}`} data-fixture={f.status}>
            <rect x={X(f.box.x) - 3} y={Y(f.box.y + f.box.d) - 3} width={f.box.w * S + 6} height={f.box.d * S + 6} rx={3} fill="none" stroke={f.status === "confirmed" ? "#1f6f8b" : "#b4643c"} strokeWidth={thumb ? 4 : 1.6} strokeDasharray={f.status === "confirmed" ? undefined : thumb ? "10 7" : "5 4"} />
            {!thumb && (
              <text x={X(Math.min(W - 0.6, Math.max(0.6, f.box.x + f.box.w / 2)))} y={Y(f.box.y) + 14} textAnchor="middle" fontSize={10} fontWeight={600} fill={f.status === "confirmed" ? "#1f6f8b" : "#b4643c"} stroke="#ffffff" strokeWidth={3} paintOrder="stroke">
                {FIXTURE_TEXT[f.status]}
              </text>
            )}
          </g>
        ))}
        <polygon points={polyPoints} fill="none" stroke={ink} strokeWidth={thumb ? 5 : space ? 3.5 : 2.5} strokeLinejoin="miter" />

        {shell.windows.map(([x1, y1, x2, y2], i) => (
          <line key={`w${i}`} x1={X(x1)} y1={Y(y1)} x2={X(x2)} y2={Y(y2)} stroke={mix(sc("#abd3df"), ink, 0.25)} strokeWidth={thumb ? 10 : 6} />
        ))}
        {shell.water.map((w) => (
          <g key={`wt${w.n}`} data-testid="plan-water">
            <circle cx={X(w.x)} cy={Y(w.y)} r={thumb ? 12 : 6} fill="#3b82c4" stroke="#ffffff" strokeWidth={thumb ? 3 : 1.5} />
            {!thumb && (
              <text x={X(w.x)} y={Y(w.y) - 10} textAnchor="middle" fontSize={10} fontWeight={600} fill="#3b82c4" stroke="#ffffff" strokeWidth={3} paintOrder="stroke">
                급배수 {w.n}
              </text>
            )}
          </g>
        ))}
        {!thumb &&
          shell.edges.map((e) => {
            // 벽 바깥 16px. 세로 벽은 벽을 따라 세워 쓴다(바깥 치수선과 겹치지 않게).
            const x = X(e.mid[0]) + e.out[0] * 16;
            const y = Y(e.mid[1]) - e.out[1] * 16;
            return (
              <text key={`el${e.n}`} x={x} y={y} dominantBaseline="middle" textAnchor="middle" transform={e.vertical ? `rotate(-90 ${x} ${y})` : undefined} fontSize={11} fill={soft} stroke="#ffffff" strokeWidth={3} paintOrder="stroke">
                벽 {e.n} · {mm(e.len)}
              </text>
            );
          })}
        {/* 문: 벽이 끊긴 자리에 점선을 그린다. */}
        {option.marks.doors.map((d, i) =>
          d.vertical ? (
            <line key={`d${i}`} x1={X(d.x + T / 2)} y1={Y(d.y)} x2={X(d.x + T / 2)} y2={Y(d.y + d.w)} stroke={soft} strokeWidth={thumb ? 3 : 1.2} strokeDasharray="4 3" />
          ) : (
            <line key={`d${i}`} x1={X(d.x)} y1={Y(d.y + T / 2)} x2={X(d.x + d.w)} y2={Y(d.y + T / 2)} stroke={soft} strokeWidth={thumb ? 3 : 1.2} strokeDasharray="4 3" />
          ),
        )}
        {/* 다른 문 자리(집 방): 벽이 끊긴 자리와 이름 */}
        {(option.marks.spots ?? []).map((sp, i) => (
          <g key={`sp${i}`} data-testid="plan-spot">
            <line x1={X(sp.seg[0])} y1={Y(sp.seg[1])} x2={X(sp.seg[2])} y2={Y(sp.seg[3])} stroke="#ffffff" strokeWidth={thumb ? 12 : 7} />
            {!thumb && (
              <text x={X((sp.seg[0] + sp.seg[2]) / 2 + sp.inward[0] * 0.3)} y={Y((sp.seg[1] + sp.seg[3]) / 2 + sp.inward[1] * 0.3) + 4} textAnchor="middle" fontSize={10} fill={ink} stroke="#ffffff" strokeWidth={3} paintOrder="stroke">
                {sp.label}
              </text>
            )}
          </g>
        ))}
        <line x1={X(ea)} y1={Y(eb)} x2={X(ec)} y2={Y(ed)} stroke="#ffffff" strokeWidth={thumb ? 12 : 7} />
        {!thumb && <line x1={X(ea) - enx * 5} y1={Y(eb) + eny * 5} x2={X(ec) - enx * 5} y2={Y(ed) + eny * 5} stroke={soft} strokeDasharray="5 3" />}

        {/* 방문객 동선 */}
        {path && (
          <g>
            <polyline points={path.map(([x, y]) => `${X(x)},${Y(y)}`).join(" ")} fill="none" stroke="#b4643c" strokeWidth={thumb ? 7 : 2.5} strokeDasharray={thumb ? "14 9" : "7 5"} strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={X(path[path.length - 1][0])} cy={Y(path[path.length - 1][1])} r={thumb ? 11 : 4.5} fill="#b4643c" />
          </g>
        )}

        {rooms.map((room, i) => (
          <g key={`l${i}`}>
            <text
              x={X(room.x + room.w / 2)}
              y={thumb ? Y(room.y + room.d / 2) + 10 : Y(room.y) - (room.key === "spare" ? 12 : 24)}
              textAnchor="middle"
              fontSize={font}
              fontWeight={600}
              fill={ink}
              stroke="#ffffff"
              strokeWidth={thumb ? 8 : 3.5}
              strokeOpacity={0.85}
              paintOrder="stroke"
            >
              {thumb ? room.label.split(" · ")[0] : room.label}
            </text>
            {!thumb && room.key !== "spare" && (
              <text x={X(room.x + room.w / 2)} y={Y(room.y) - 9} textAnchor="middle" fontSize={10} fill={soft} stroke="#ffffff" strokeWidth={3} strokeOpacity={0.85} paintOrder="stroke">
                {mm(room.w)} × {mm(room.d)}
              </text>
            )}
          </g>
        ))}
        {(option.zones ?? []).map((z, i) => (
          <text key={`z${i}`} x={X(z.x)} y={Y(z.y) + 4} textAnchor="middle" fontSize={thumb ? 26 : 12} fontWeight={600} fill="#b4643c" stroke="#ffffff" strokeWidth={thumb ? 8 : 3.5} strokeOpacity={0.9} paintOrder="stroke">
            {z.label}
          </text>
        ))}

        {!thumb && (
          <>
            <text x={entMid.x} y={entMid.y + 4} textAnchor="middle" fontSize={12} fill={ink} stroke="#ffffff" strokeWidth={3} paintOrder="stroke">
              {option.entranceLabel ?? "출입구"} {mm(Math.hypot(ec - ea, ed - eb))}
            </text>
            {option.roomOnly ? (
              <text x={workLabelLeft ? X(0) : X(W)} y={Y(0) + 50} textAnchor={workLabelLeft ? "start" : "end"} fontSize={13} fontWeight={600} fill={ink} data-testid="plan-room-label">
                {option.title}
                <tspan fontSize={10} fontWeight={400} fill="#b4643c" dx={8}>
                  방 한 칸 · 집 전체 아님
                </tspan>
              </text>
            ) : (
            <text x={workLabelLeft ? X(0) : X(W)} y={Y(0) + 50} textAnchor={workLabelLeft ? "start" : "end"} fontSize={13} fontWeight={600} fill={ink}>
              업무 공간 · {option.seats}석
              <tspan fontSize={10} fontWeight={400} fill={soft} dx={8}>
                책상 {mm(option.deskWidth)} × 700
              </tspan>
              {path && (
                <tspan fontSize={10} fontWeight={400} fill="#b4643c" dx={10}>
                  ┄ 방문객 동선
                </tspan>
              )}
            </text>
            )}
            {option.marks.seats.map((s) => (
              <text key={`s${s.n}`} x={X(s.x)} y={Y(s.y) + 3} textAnchor="middle" fontSize={9} fill="#ffffff" stroke={ink} strokeWidth={2.2} paintOrder="stroke">
                {s.n}
              </text>
            ))}

            {hdim(0, W, mt - 46, mm(W), "dw")}
            {vdim(0, D, ml - 52, mm(D), "dd")}
            {/* 벽에 붙은 방은 그 벽 바깥에 치수를 적는다. */}
            {byX.filter((room) => near(room.y + room.d, D)).map((room, i) => hdim(room.x, room.x + room.w, mt - 16, mm(room.w), `dt${i}`))}
            {byX.filter((room) => near(room.y, 0)).map((room, i) => hdim(room.x, room.x + room.w, Y(0) + 26, mm(room.w), `db${i}`))}
            {byY.filter((room) => near(room.x + room.w, W) && !near(room.y, 0)).map((room, i) => vdim(room.y, room.y + room.d, X(W) + 34, mm(room.d), `dr${i}`))}
            {byY.filter((room) => near(room.x, 0) && !near(room.y, 0)).map((room, i) => vdim(room.y, room.y + room.d, X(0) - 14, mm(room.d), `dl${i}`))}
            <text x={width / 2} y={height - (space ? 32 : 10) - (extraLegend ? 20 : 0)} textAnchor="middle" fontSize={11} fill={soft}>
              {option.roomOnly ? "치수 mm · 실내 유효치수 · 방 한 칸 참고 배치 · 개념 가구" : "치수 단위 mm · 실내 유효치수 기준 · 축척 없음(숫자 치수 우선) · 개구부 900 · 현장 실측 전 개념안"}
            </text>
            {space && option.roomOnly && (
              <g fontSize={11} fill={ink} data-testid="plan-legend">
                <line x1={12} y1={height - 13} x2={40} y2={height - 13} stroke={ink} strokeWidth={4} />
                <text x={46} y={height - 9}>실제 벽·문(입력)</text>
                <rect x={152} y={height - 19} width={12} height={12} fill={`url(#${hatch})`} stroke={ink} />
                <text x={170} y={height - 9}>고정 구조물(입력)</text>
                <line x1={282} y1={height - 13} x2={310} y2={height - 13} stroke={mix(sc("#abd3df"), ink, 0.25)} strokeWidth={5} />
                <text x={316} y={height - 9}>창</text>
              </g>
            )}
            {space && !option.roomOnly && (
              <g fontSize={11} fill={ink} data-testid="plan-legend">
                <g transform={`translate(0 ${extraLegend ? -20 : 0})`}>
                  <line x1={width / 2 - 250} y1={height - 13} x2={width / 2 - 222} y2={height - 13} stroke={ink} strokeWidth={4} />
                  <text x={width / 2 - 216} y={height - 9}>실제 벽·출입문(입력)</text>
                  <rect x={width / 2 - 92} y={height - 17} width={24} height={8} fill="#8e9aa8" />
                  <text x={width / 2 - 62} y={height - 9}>제안 칸막이(자동 배치)</text>
                  <rect x={width / 2 + 78} y={height - 19} width={12} height={12} fill={`url(#${hatch})`} stroke={ink} />
                  <text x={width / 2 + 96} y={height - 9}>기둥(입력)</text>
                  <line x1={width / 2 + 160} y1={height - 13} x2={width / 2 + 188} y2={height - 13} stroke={mix(sc("#abd3df"), ink, 0.25)} strokeWidth={5} />
                  <text x={width / 2 + 194} y={height - 9}>창</text>
                </g>
                {extraLegend && (
                  <>
                    <circle cx={width / 2 - 244} cy={height - 13} r={5} fill="#3b82c4" />
                    <text x={width / 2 - 234} y={height - 9}>급배수(고객 확인)</text>
                    <rect x={width / 2 - 150} y={height - 19} width={22} height={12} rx={2} fill="none" stroke="#b4643c" strokeWidth={1.6} strokeDasharray="5 4" />
                    <text x={width / 2 - 122} y={height - 9}>탕비 설비 자동 제안 위치</text>
                    <rect x={width / 2 + 30} y={height - 19} width={22} height={12} rx={2} fill="none" stroke="#1f6f8b" strokeWidth={1.6} />
                    <text x={width / 2 + 58} y={height - 9}>고객이 확인한 설비 위치</text>
                  </>
                )}
              </g>
            )}
          </>
        )}
      </g>
    </svg>
  );
}
