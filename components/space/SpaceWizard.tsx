"use client";

import ReferenceInput from "@/components/community/ReferenceInput";
import AddressIntake from "@/components/address/AddressIntake";
import IntakeSpaceKind from "@/components/IntakeSpaceKind";
import type {PostReference} from "@/lib/post-refs";
import Link from "next/link";
import { startTransition, useActionState, useMemo, useState, type ReactNode } from "react";
import type { FormState } from "@/lib/actions";
import { PRIORITIES } from "@/lib/constants";
import { PYEONG } from "@/lib/layout/types";
import { composeOption } from "@/lib/space/placement";
import { ENTRANCE_RANGE_TEXT, SPACE_LATER_TEXT, SPACE_SCOPE_TEXT, entranceSupport, roomArea, toPyeong, validateRoom } from "@/lib/space/room";
import { WALL_LABEL, type RoomModel, type WallSide } from "@/lib/space/types";
import PlanSvg from "../PlanSvg";
import AreaCompare from "./AreaCompare";

type Action = (state: FormState, fd: FormData) => Promise<FormState>;

export interface SpaceNeeds {
  staff: number;
  ceo: boolean;
  meeting: boolean;
  meetingSeats: number;
  pantry: boolean;
  storage: boolean;
  priority: string;
}

interface WinRow {
  wall: WallSide;
  at: string;
  width: string;
}
interface WaterRow {
  wall: WallSide;
  at: string;
}
interface PillarRow {
  x: string;
  y: string;
  w: string;
  d: string;
}

const toMm = (m: number | null | undefined) => (m == null || !Number.isFinite(m) ? "" : String(Math.round(m * 1000)));
const toM = (v: string) => (v.trim() === "" ? NaN : Number(v.replaceAll(",", "")) / 1000);
const fmt = (m: number) => Math.round(m * 1000).toLocaleString("ko-KR");

const STEPS = ["가진 자료", "모양·치수", "필요한 공간"] as const;

function Mm({ label, value, onChange, hint, testid, placeholder }: { label: string; value: string; onChange: (v: string) => void; hint?: string; testid?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <span className="relative block">
        <input className="input pr-12 text-right tabular-nums" inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))} placeholder={placeholder} data-testid={testid} />
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-muted">mm</span>
      </span>
      {hint && <span className="mt-1 block text-xs leading-relaxed text-muted">{hint}</span>}
    </label>
  );
}

export default function SpaceWizard({
  action,
  mode,
  initialRoom,
  initialNeeds,
  title: initialTitle = "우리 사무실",
  refCase,
  refPhoto,
  reference,
  areaHint: initialAreaHint,
  cancel,
}: {
  action: Action;
  reference?: PostReference;
  mode: "new" | "edit";
  initialRoom?: RoomModel;
  initialNeeds?: SpaceNeeds;
  title?: string;
  refCase?: number;
  refPhoto?: number;
  /** 체험에서 넘어온 평수. 치수와 대조하는 ‘알고 있는 전용면적’ 칸에 미리 넣는다. */
  areaHint?: number;
  cancel?: ReactNode;
}) {
  const [step, setStep] = useState(mode === "edit" ? 1 : 0);
  const [intake, setIntake] = useState<"dims" | "drawing" | "photos" | "none" | "">(mode === "edit" ? "dims" : "");
  const [shape, setShape] = useState<"rect" | "other">("rect");
  const r0 = initialRoom;
  const [width, setWidth] = useState(toMm(r0?.width));
  const [depth, setDepth] = useState(toMm(r0?.depth));
  const [height, setHeight] = useState(toMm(r0?.height));
  const [areaHint, setAreaHint] = useState(r0?.areaHint != null ? String(r0.areaHint) : initialAreaHint ? String(initialAreaHint) : "");
  const entSide0: "left" | "right" = r0 ? entranceSupport(r0).side : "right";
  const [entSide, setEntSide] = useState<"left" | "right">(entSide0);
  const [entOff, setEntOff] = useState(r0 ? toMm(entranceSupport(r0).offset) : "800");
  const [entW, setEntW] = useState(toMm(r0?.entrance.width ?? 1.2));
  const [winMode, setWinMode] = useState<"list" | "none" | "unknown">(r0 ? (r0.windows == null ? "unknown" : r0.windows.length ? "list" : "none") : "unknown");
  const [wins, setWins] = useState<WinRow[]>(r0?.windows?.map((w) => ({ wall: w.wall ?? "rear", at: toMm(w.at), width: toMm(w.width) })) ?? []);
  const [waters, setWaters] = useState<WaterRow[]>(r0?.utilities?.map((u) => ({ wall: u.wall ?? "rear", at: toMm(u.at) })) ?? []);
  const [pillars, setPillars] = useState<PillarRow[]>(r0?.pillars.map((p) => ({ x: toMm(p.x), y: toMm(p.y), w: toMm(p.w), d: toMm(p.d) })) ?? []);
  const [state, dispatch, pending] = useActionState(action, {});
  const [localError, setLocalError] = useState<string | null>(null);
  const [addressValues, setAddressValues] = useState({ region: "", address: "" });

  const room: RoomModel = useMemo(() => {
    const W = toM(width);
    const ew = toM(entW);
    const off = toM(entOff);
    return {
      shape: "rect",
      width: W,
      depth: toM(depth),
      height: height.trim() ? toM(height) : null,
      entrance: { at: entSide === "left" ? off : W - off - ew, width: ew },
      windows: winMode === "unknown" ? null : winMode === "none" ? [] : wins.map((w) => ({ wall: w.wall, at: toM(w.at), width: toM(w.width) })),
      pillars: pillars.map((p) => ({ x: toM(p.x), y: toM(p.y), w: toM(p.w), d: toM(p.d) })),
      utilities: waters.map((u) => ({ kind: "water" as const, wall: u.wall, at: toM(u.at) })),
      source: "dims",
      areaHint: areaHint.trim() ? Number(areaHint) : null,
    };
  }, [width, depth, height, entSide, entOff, entW, winMode, wins, pillars, waters, areaHint]);
  const errors = useMemo(() => validateRoom(room), [room]);
  const sizeOk = room.width >= 2 && room.width <= 60 && room.depth >= 2 && room.depth <= 60;
  const preview = useMemo(() => (errors.length === 0 ? composeOption(room, null, []) : null), [errors, room]);
  const ent = errors.length === 0 ? entranceSupport(room) : null;
  const pyeong = sizeOk ? toPyeong(roomArea(room)) : null;

  const next = () => {
    setLocalError(null);
    if (step === 0) {
      if (intake !== "dims" && intake !== "drawing") return setLocalError("치수나 도면이 있어야 3D 공간을 만들 수 있어요. 아래 안내를 확인해 주세요.");
    }
    if (step === 1) {
      if (shape !== "rect") return setLocalError("직사각형이 아닌 공간은 아직 만들 수 없어요. 아래 안내를 확인해 주세요.");
      if (errors.length) return setLocalError(errors[0]);
    }
    setStep((s) => s + 1);
    window.scrollTo({ top: 0 });
  };

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (errors.length) return setLocalError(errors[0]);
    const fd = new FormData(e.currentTarget);
    fd.set("room", JSON.stringify(room));
    fd.set("shape", shape);
    fd.set("intake", intake === "drawing" ? "drawing" : "dims");
    startTransition(() => dispatch(fd));
  };

  const option = (key: typeof intake, label: string, desc: string) => (
    <label className={`intake-option ${intake === key ? "is-active" : ""}`}>
      <input type="radio" name="intakeChoice" value={key} checked={intake === key} onChange={() => setIntake(key)} className="sr-only" />
      <span className="min-w-0">
        <b className="block text-sm">{label}</b>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted">{desc}</span>
      </span>
    </label>
  );

  return (
    <form onSubmit={submit} className="space-y-5" data-testid="space-wizard">
      <ReferenceInput reference={reference}/>
      {mode === "new" && <><div hidden={step !== 0}><IntakeSpaceKind kind="office" /></div><input type="hidden" name="address" value={addressValues.address} /></>}
      {refCase && <input type="hidden" name="refCase" value={refCase} />}
      {refCase && refPhoto && <input type="hidden" name="refPhoto" value={refPhoto} />}
      <ol className="flex flex-wrap gap-4" aria-label="단계">
        {STEPS.map((label, i) => (
          <li key={label} className={`space-step ${i === step ? "is-on" : i < step ? "is-done" : ""}`}>
            <b>{i < step ? "✓" : i + 1}</b>
            {label}
          </li>
        ))}
      </ol>

      {/* 1. 가진 자료 */}
      <section className={step === 0 ? "space-y-3" : "hidden"} aria-hidden={step !== 0}>
        <h2 className="text-lg font-bold">어떤 자료가 있나요?</h2>
        <p className="text-sm text-muted">있는 자료에 맞춰 공간을 만들어요. 공사 요청은 나중에 원할 때 해도 돼요.</p>
        {mode === "new" && <AddressIntake onApply={(value) => {
          setAddressValues({ region: value.region, address: value.address });
          setAreaHint(value.areaM2 === null ? "" : String(Math.round(value.areaM2 / PYEONG * 10) / 10));
          setLocalError(null);
        }} />}
        <div className="grid gap-2 sm:grid-cols-2">
          {option("dims", "가로·세로 치수를 알아요", "숫자로 벽·출입문·창·기둥을 넣어 3D 공간을 만들어요.")}
          {option("drawing", "도면이 있어요", "도면 위에 외곽 벽을 따라 그리고 출입문·창·기둥을 놓아 공간을 만들 수 있어요(PC 권장). 도면을 보며 치수만 넣어도 돼요.")}
          {option("photos", "현장 사진만 있어요", "치수를 모르면 3D를 만들지 않아요. 사진으로 상담을 요청하면 담당자가 필요한 자료를 알려 드려요.")}
          {option("none", "아직 자료가 없어요", "평수로 예시 배치만 볼 수 있어요. ‘예시’로 표시되고 내 공간으로 저장되지 않아요.")}
        </div>
        {(intake === "photos" || intake === "none") && (
          <div className="rounded-xl bg-sand p-4 text-sm leading-relaxed" data-testid="no-dims-guide">
            <p className="font-semibold">치수를 모르면 3D 공간을 만들지 않아요</p>
            <p className="mt-1 text-xs text-muted">평수만으로 벽 위치를 가정해 그리면 실제와 달라 업체 제안이 어긋나요. 아래 중에서 골라 주세요.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/projects/new?intake=${intake}${reference ? `&post=${reference.postId}&postPhoto=${reference.photoId}` : ""}`} className="btn btn-sm btn-primary">
                {intake === "photos" ? "사진으로 상담 요청" : "자료 없이 상담 요청"}
              </Link>
              <Link href="/try" className="btn btn-sm">
                평수로 예시 배치 보기
              </Link>
              <Link href="/guide#measure" className="btn btn-sm">
                치수 재는 법
              </Link>
            </div>
          </div>
        )}
        {intake === "drawing" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-brand/30 bg-brand-soft p-4 text-sm leading-relaxed" data-testid="trace-entry">
              <p className="font-semibold">도면 위에 따라 그리기</p>
              <p className="mt-1 text-xs text-muted">도면 이미지(JPG·PNG)나 PDF를 밑그림으로 띄우고, 길이를 아는 곳 하나로 축척을 맞춘 뒤 바깥 벽 모서리를 차례로 찍어요. ㄱ자 같은 꺾인 공간도 만들 수 있어요. 도면을 자동으로 읽지는 않아요.</p>
              <p className="mt-1 text-xs text-muted" data-testid="wizard-scope">{SPACE_SCOPE_TEXT}. {SPACE_LATER_TEXT}예요.</p>
              <p className="mt-1 text-xs text-muted lg:hidden">휴대폰에서는 화면이 작아 정확히 찍기 어려워요. PC에서 해 주세요. 휴대폰에서는 아래 ‘다음’으로 치수를 넣어 만들 수 있어요.</p>
              <Link href={`/spaces/trace${refCase ? `?case=${refCase}${refPhoto ? `&photo=${refPhoto}` : ""}` : ""}${reference ? `${refCase ? "&" : "?"}post=${reference.postId}&postPhoto=${reference.photoId}` : ""}`} className="btn btn-sm btn-primary mt-3" data-testid="go-trace">
                도면 따라 그리기로 만들기
              </Link>
            </div>
            <label className="block">
              <span className="label">치수로 만들 때 · 도면 파일 보관 (선택)</span>
              <input className="input" name="drawings" type="file" accept="image/*,.pdf,.dwg,.dxf" multiple />
              <span className="mt-1 block text-xs text-muted">이미지, PDF, DWG, DXF · 파일 하나에 10MB까지. 치수는 직접 넣어 주세요.</span>
            </label>
          </div>
        )}
      </section>

      {/* 2. 모양·치수 */}
      <section className={step === 1 ? "grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]" : "hidden"} aria-hidden={step !== 1}>
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-bold">공간 모양과 치수</h2>
            <p className="mt-1 text-sm text-muted">출입문이 있는 벽을 아래에 두고 봤을 때 기준이에요. 실내 벽면 사이 거리를 mm로 넣어 주세요.</p>
          </div>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="공간 모양">
            {(
              [
                ["rect", "직사각형"],
                ["other", "ㄱ자·다른 모양"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={shape === k} className={`filter-chip ${shape === k ? "active" : ""}`} data-testid={`shape-${k}`} onClick={() => setShape(k)}>
                {label}
              </button>
            ))}
          </div>
          {shape === "other" ? (
            <div className="rounded-xl border border-warn/30 bg-warn-soft p-4 text-sm leading-relaxed" data-testid="shape-limit">
              <p className="font-semibold text-warn">아직 직사각형만 3D로 만들 수 있어요</p>
              <p className="mt-1 text-xs">ㄱ자나 꺾인 공간을 임의로 직사각형으로 바꾸면 벽 위치가 실제와 달라져서, 바꾸지 않고 만들지 않아요.</p>
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
                <li>도면이 있으면 도면 위에 벽을 따라 그려 실제 모양대로 만들 수 있어요(PC 권장). 이 경우 자동 배치 없이 빈 공간에서 가구를 직접 놓아요.</li>
                <li>도면이 없으면 사진으로 상담을 요청해 주세요. 담당자가 공간을 확인해요.</li>
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={mode === "edit" ? "?trace=1" : `/spaces/trace${refCase ? `?case=${refCase}${refPhoto ? `&photo=${refPhoto}` : ""}` : ""}${reference ? `${refCase ? "&" : "?"}post=${reference.postId}&postPhoto=${reference.photoId}` : ""}`} className="btn btn-sm btn-primary" data-testid="shape-trace">
                  도면 따라 그리기
                </Link>
                <Link href={`/projects/new?intake=drawing${reference ? `&post=${reference.postId}&postPhoto=${reference.photoId}` : ""}`} className="btn btn-sm">
                  도면·사진으로 상담 요청
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Mm label="실내 가로 (출입문 있는 벽)" value={width} onChange={setWidth} testid="room-width" placeholder="예: 11000" />
                <Mm label="실내 세로 (출입문 벽 → 안쪽 벽)" value={depth} onChange={setDepth} testid="room-depth" placeholder="예: 9000" />
                <Mm label="천장 높이 · 선택" value={height} onChange={setHeight} hint="모르면 비워 두세요. 2,700mm로 그리고 ‘가정’으로 표시해요." />
                <label className="block">
                  <span className="label">알고 있는 전용면적 (평) · 선택</span>
                  <input className="input text-right" inputMode="decimal" value={areaHint} onChange={(e) => setAreaHint(e.target.value.replace(/[^\d.]/g, ""))} placeholder="예: 30" />
                  <span className="mt-1 block text-xs text-muted">치수로 계산한 면적과 대조해 잘못 넣은 치수를 찾아요.</span>
                </label>
              </div>

              <fieldset className="space-y-2">
                <legend className="label">출입문 (앞벽)</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="text-xs text-muted">기준 모서리</span>
                    <select className="input" value={entSide} onChange={(e) => setEntSide(e.target.value as "left" | "right")} data-testid="ent-side">
                      <option value="right">오른쪽 벽에서</option>
                      <option value="left">왼쪽 벽에서</option>
                    </select>
                  </label>
                  <Mm label="문 가장자리까지" value={entOff} onChange={setEntOff} testid="ent-off" />
                  <Mm label="문 폭" value={entW} onChange={setEntW} testid="ent-width" />
                </div>
                <p className="text-xs text-muted" data-testid="ent-range">{ENTRANCE_RANGE_TEXT}. 벗어나도 공간은 입력한 위치대로 만들고, 가구는 빈 공간에서 직접 놓아요.</p>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="label">창</legend>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["list", "위치를 넣을게요"],
                      ["none", "창 없음"],
                      ["unknown", "잘 모름"],
                    ] as const
                  ).map(([k, label]) => (
                    <button key={k} type="button" aria-pressed={winMode === k} className={`filter-chip !min-h-9 ${winMode === k ? "active" : ""}`} data-testid={`win-${k}`} onClick={() => {
                      setWinMode(k);
                      if (k === "list" && !wins.length) setWins([{ wall: "rear", at: "", width: "" }]);
                    }}>
                      {label}
                    </button>
                  ))}
                </div>
                {winMode === "unknown" && <p className="text-xs text-muted">창을 그리지 않고, 창이 있다고 가정하지도 않아요.</p>}
                {winMode === "list" && (
                  <div className="space-y-2">
                    {wins.map((w, i) => (
                      <div key={i} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2" data-testid={`win-row-${i}`}>
                        <label className="block">
                          <span className="text-xs text-muted">창 {i + 1} 벽</span>
                          <select className="input" value={w.wall} onChange={(e) => setWins(wins.map((x, k) => (k === i ? { ...x, wall: e.target.value as WallSide } : x)))}>
                            {(Object.keys(WALL_LABEL) as WallSide[]).map((k) => (
                              <option key={k} value={k}>
                                {WALL_LABEL[k]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <Mm label={w.wall === "left" || w.wall === "right" ? "앞벽에서" : "왼쪽 벽에서"} value={w.at} onChange={(v) => setWins(wins.map((x, k) => (k === i ? { ...x, at: v } : x)))} testid={`win-at-${i}`} />
                        <Mm label="창 폭" value={w.width} onChange={(v) => setWins(wins.map((x, k) => (k === i ? { ...x, width: v } : x)))} testid={`win-width-${i}`} />
                        <button type="button" className="btn btn-sm mb-1.5" aria-label={`창 ${i + 1} 지우기`} onClick={() => setWins(wins.filter((_, k) => k !== i))}>
                          ✕
                        </button>
                      </div>
                    ))}
                    <button type="button" className="btn btn-sm" data-testid="add-window" onClick={() => setWins([...wins, { wall: "rear", at: "", width: "" }])}>
                      ＋ 창 추가
                    </button>
                  </div>
                )}
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="label">실내 기둥 {pillars.length ? `· ${pillars.length}개` : "· 없으면 비워 두세요"}</legend>
                {pillars.map((p, i) => (
                  <div key={i} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[repeat(4,minmax(0,1fr))_auto]" data-testid={`pillar-row-${i}`}>
                    <Mm label={`기둥 ${i + 1} · 왼쪽 벽에서`} value={p.x} onChange={(v) => setPillars(pillars.map((x, k) => (k === i ? { ...x, x: v } : x)))} testid={`pillar-x-${i}`} />
                    <Mm label="앞벽에서" value={p.y} onChange={(v) => setPillars(pillars.map((x, k) => (k === i ? { ...x, y: v } : x)))} testid={`pillar-y-${i}`} />
                    <Mm label="가로" value={p.w} onChange={(v) => setPillars(pillars.map((x, k) => (k === i ? { ...x, w: v } : x)))} testid={`pillar-w-${i}`} />
                    <Mm label="세로" value={p.d} onChange={(v) => setPillars(pillars.map((x, k) => (k === i ? { ...x, d: v } : x)))} testid={`pillar-d-${i}`} />
                    <button type="button" className="btn btn-sm mb-1.5" aria-label={`기둥 ${i + 1} 지우기`} onClick={() => setPillars(pillars.filter((_, k) => k !== i))}>
                      ✕
                    </button>
                  </div>
                ))}
                <button type="button" className="btn btn-sm" data-testid="add-pillar" onClick={() => setPillars([...pillars, { x: "", y: "", w: "500", d: "500" }])}>
                  ＋ 기둥 추가
                </button>
                <p className="text-xs text-muted">기둥의 왼쪽 아래 모서리(왼쪽 벽 쪽·출입문 벽 쪽)까지 거리예요.</p>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="label">급배수 위치(고객 확인) {waters.length ? `· ${waters.length}곳` : "· 직접 확인한 경우만"}</legend>
                <p className="text-xs leading-relaxed text-muted">싱크대를 연결할 수 있는 물 공급·배수 위치를 현장에서 직접 확인했으면 넣어 주세요. 넣은 위치는 ‘고객 확인’으로 표시되고 업체가 현장에서 다시 확인해요. 모르면 비워 두세요. 탕비 설비는 ‘자동 제안 위치’로 표시돼요.</p>
                {waters.map((u, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] items-end gap-2" data-testid={`water-row-${i}`}>
                    <label className="block">
                      <span className="text-xs text-muted">급배수 {i + 1} 벽</span>
                      <select className="input" value={u.wall} onChange={(e) => setWaters(waters.map((x, k) => (k === i ? { ...x, wall: e.target.value as WallSide } : x)))} data-testid={`water-wall-${i}`}>
                        {(Object.keys(WALL_LABEL) as WallSide[]).map((k) => (
                          <option key={k} value={k}>
                            {WALL_LABEL[k]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Mm label={u.wall === "left" || u.wall === "right" ? "앞벽에서" : "왼쪽 벽에서"} value={u.at} onChange={(v) => setWaters(waters.map((x, k) => (k === i ? { ...x, at: v } : x)))} testid={`water-at-${i}`} />
                    <button type="button" className="btn btn-sm mb-1.5" aria-label={`급배수 ${i + 1} 지우기`} onClick={() => setWaters(waters.filter((_, k) => k !== i))}>
                      ✕
                    </button>
                  </div>
                ))}
                <button type="button" className="btn btn-sm" data-testid="add-water" onClick={() => setWaters([...waters, { wall: "rear", at: "" }])}>
                  ＋ 급배수 위치 추가
                </button>
              </fieldset>
            </>
          )}
        </div>
        {shape === "rect" && (
          <aside className="space-y-3 lg:sticky lg:top-24 lg:h-fit">
            <div className="overflow-hidden rounded-2xl border border-line bg-white p-2" data-testid="room-preview">
              {preview ? <PlanSvg option={preview} styleId="natural" space /> : <p className="grid aspect-[4/3] place-items-center p-6 text-center text-sm text-muted">치수를 넣으면 여기에 실제 공간이 그려져요.</p>}
            </div>
            {pyeong != null && (
              <div className="rounded-xl bg-sand px-4 py-3" data-testid="room-area">
                <AreaCompare area={roomArea(room)} hint={room.areaHint ?? null} testid="room-area-compare" />
              </div>
            )}
            {ent && !ent.supported && (
              <p className="rounded-xl bg-warn-soft px-4 py-3 text-xs leading-relaxed text-warn" data-testid="entrance-limit">
                {ent.reason} 공간과 3D는 입력한 위치대로 만들고, 가구는 빈 공간에서 직접 놓게 돼요.
              </p>
            )}
            {errors.length > 0 && sizeOk && (
              <ul className="space-y-1 rounded-xl bg-warn-soft px-4 py-3 text-xs text-warn" data-testid="room-errors">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            <p className="text-xs leading-relaxed text-muted">면적 {sizeOk ? `${fmt(room.width)} × ${fmt(room.depth)}` : "—"} mm · 1평 = {PYEONG.toFixed(3)}㎡</p>
          </aside>
        )}
      </section>

      {/* 3. 필요한 공간 */}
      <section className={step === 2 ? "space-y-4" : "hidden"} aria-hidden={step !== 2}>
        <NeedsFields mode={mode} initialNeeds={initialNeeds} title={initialTitle} region={addressValues.region} onRegionChange={(region) => setAddressValues((v) => ({ ...v, region }))} />
      </section>

      {(localError || state.error) && (
        <p role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-danger" data-testid="wizard-error">
          {localError ?? state.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {step > 0 && (
          <button type="button" className="btn" onClick={() => setStep((s) => s - 1)}>
            이전
          </button>
        )}
        {step < 2 ? (
          // key를 달리해 같은 버튼 노드가 ‘제출’로 바뀌며 클릭이 제출로 이어지는 일을 막는다.
          <button key="next" type="button" className="btn btn-primary" data-testid="wizard-next" onClick={next}>
            다음
          </button>
        ) : (
          <button key="submit" type="submit" className="btn btn-primary" disabled={pending} data-testid="wizard-submit">
            {pending ? "만드는 중…" : mode === "new" ? "내 공간 만들기" : "새 버전으로 만들기"}
          </button>
        )}
        {cancel}
      </div>
    </form>
  );
}

/** 필요한 공간(좌석·방). 치수 입력과 도면 따라 그리기가 같이 쓴다. */
export function NeedsFields({ mode, initialNeeds: n0, title, note, region, onRegionChange }: { mode: "new" | "edit"; initialNeeds?: SpaceNeeds; title: string; note?: string; region?: string; onRegionChange?: (region: string) => void }) {
  const [staff, setStaff] = useState(String(n0?.staff ?? 8));
  const [meeting, setMeeting] = useState(n0?.meeting ?? true);
  return (
    <>
      <h2 className="text-lg font-bold">어떻게 쓰실 건가요?</h2>
      <p className="text-sm text-muted">{note ?? "자동 배치가 이 조건으로 출발점이 될 배치를 만들어요. 만든 뒤 가구를 직접 옮기고 돌릴 수 있어요."}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">공간 이름</span>
          <input className="input" name="title" defaultValue={title} maxLength={60} />
        </label>
        <label className="block">
          <span className="label">직원 좌석 수</span>
          <input className="input" name="staff" type="number" min={1} max={200} value={staff} onChange={(e) => setStaff(e.target.value)} data-testid="staff" />
          <span className="mt-1 block text-xs text-muted">대표는 빼고 세어 주세요.</span>
        </label>
      </div>
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="ceo" defaultChecked={n0?.ceo ?? true} className="size-4 accent-brand" /> 대표실
        </label>
        <span className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="meeting" checked={meeting} onChange={(e) => setMeeting(e.target.checked)} className="size-4 accent-brand" /> 회의실
          </label>
          <select className="input !min-h-9 w-24 !py-1" name="meetingSeats" defaultValue={n0?.meetingSeats ?? 6} disabled={!meeting} aria-label="회의실 인원">
            {[4, 6, 8, 10, 12].map((n) => (
              <option key={n} value={n}>
                {n}인
              </option>
            ))}
          </select>
        </span>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="pantry" defaultChecked={n0?.pantry ?? true} className="size-4 accent-brand" /> 탕비실
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="storage" defaultChecked={n0?.storage ?? false} className="size-4 accent-brand" /> 창고
        </label>
      </div>
      <label className="block sm:max-w-sm">
        <span className="label">가장 중요하게 보는 것</span>
        <select className="input" name="priority" defaultValue={n0?.priority ?? "unknown"}>
          {Object.entries(PRIORITIES).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-muted">자동 배치 가운데 무엇을 먼저 보여 줄지만 정해요.</span>
      </label>
      {mode === "new" && (
        <label className="block sm:max-w-sm">
          <span className="label">지역 (시·구) · 선택</span>
          <input className="input" name="region" value={region} onChange={(e) => onRegionChange?.(e.target.value)} placeholder="예: 서울 성동구" />
          <span className="mt-1 block text-xs text-muted">공사 요청할 때 넣어도 돼요.</span>
        </label>
      )}
      {mode === "edit" && <p className="rounded-xl bg-warn-soft px-4 py-3 text-xs leading-relaxed text-warn">치수나 필요한 공간을 바꾸면 배치를 새 조건의 자동 배치에서 다시 시작해요. 지금까지 저장한 버전은 그대로 남아요.</p>}
    </>
  );
}
