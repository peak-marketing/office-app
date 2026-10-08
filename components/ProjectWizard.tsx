"use client";

import ReferenceInput from "@/components/community/ReferenceInput";
import AddressIntake, { type AddressImport } from "@/components/address/AddressIntake";
import IntakeSpaceKind from "@/components/IntakeSpaceKind";
import type {PostReference} from "@/lib/post-refs";
import { startTransition, useActionState, useMemo, useRef, useState, type ReactNode } from "react";
import type { FormState } from "@/lib/actions";
import { INTAKE_MODES, MOODS, PRIORITIES, WINDOW_WALLS, mm, type IntakeKey } from "@/lib/constants";
import { inputCoverage } from "@/lib/layout/coverage";
import { generateLayout } from "@/lib/layout/generate";
import type { LayoutInput } from "@/lib/layout/types";
import { getStyle } from "@/lib/styles";
import { Field } from "./forms";
import Icon, { type IconName } from "./Icon";
import PlanSvg from "./PlanSvg";

const INTAKE_ICON: Record<IntakeKey, IconName> = { drawing: "layout", dims: "ruler", photos: "camera", none: "plus" };
import { CoverageTable } from "./CoverageTable";

/** 요청서에 연결할 수 있는 참고 사례(사례에서 시작했거나 저장해 둔 것) */
export interface RefCandidate {
  id: number;
  title: string;
  meta: string;
  photo: number | null;
  example: boolean;
}

type Action = (state: FormState, fd: FormData) => Promise<FormState>;

const STEPS = ["가진 자료", "공간 크기", "필요한 공간", "예산·일정", "분위기·참고 사례", "사진·도면", "확인"] as const;
const MOOD_STYLE: Record<string, string> = { warm: "natural", pro: "chic", soft: "lovely" };

const num = (fd: FormData, key: string) => {
  const raw = String(fd.get(key) ?? "").trim();
  return raw === "" ? null : Number(raw);
};
const on = (fd: FormData, key: string) => fd.get(key) === "on";

/** 서버의 parseInput과 같은 규칙으로 현재 입력값을 읽는다(미리보기·요약용). */
function readInput(fd: FormData): LayoutInput {
  const entrance = String(fd.get("entrance"));
  const mood = String(fd.get("mood"));
  const windowWall = String(fd.get("windowWall"));
  const priority = String(fd.get("priority"));
  const intake = String(fd.get("intake"));
  const known = intake === "drawing" || intake === "dims";
  return {
    intake: intake in INTAKE_MODES ? (intake as IntakeKey) : "none",
    areaPyeong: num(fd, "areaPyeong") ?? 0,
    // 치수를 모르는 방식에서는 가로·세로를 받지 않는다.
    widthM: known ? num(fd, "widthM") : null,
    depthM: known ? num(fd, "depthM") : null,
    staff: Math.round(num(fd, "staff") ?? 0),
    ceo: on(fd, "ceo"),
    meeting: on(fd, "meeting"),
    meetingSeats: Math.round(num(fd, "meetingSeats") ?? 6),
    pantry: on(fd, "pantry"),
    storage: on(fd, "storage"),
    entrance: entrance === "left" || entrance === "other" ? entrance : "right",
    shape: fd.get("shape") === "other" ? "other" : "rect",
    pillars: Math.max(0, Math.round(num(fd, "pillars") ?? 0)),
    furnitureIncluded: on(fd, "furnitureIncluded"),
    windowWall: windowWall === "rear" || windowWall === "other" ? windowWall : "unknown",
    priority: priority === "visitor" || priority === "collab" || priority === "focus" ? priority : "unknown",
    siteNotes: String(fd.get("siteNotes") ?? ""),
    reuseFurniture: String(fd.get("reuseFurniture") ?? ""),
    mood: mood === "warm" || mood === "pro" || mood === "soft" ? mood : "unknown",
  };
}

const fileCount = (fd: FormData, key: string) => fd.getAll(key).filter((f) => f instanceof File && f.size > 0).length;

function validate(step: number, fd: FormData): string | null {
  const input = readInput(fd);
  if (step === 0 && !(String(fd.get("intake")) in INTAKE_MODES)) return "지금 가진 자료를 골라 주세요.";
  if (step === 0 && fd.get("intake") === "dims") return "치수를 알면 ‘내 공간 만들기’에서 실제 공간을 먼저 만들어 주세요. 아래 버튼으로 이동해요.";
  if (step === 1) {
    if (!(input.areaPyeong > 0)) return "전용면적(평)을 입력해 주세요.";
    if (!(input.staff >= 1)) return "직원 좌석 수를 1석 이상 입력해 주세요.";
    if ((input.widthM == null) !== (input.depthM == null)) return "가로·세로 치수는 둘 다 입력하거나 둘 다 비워 주세요.";
    if (input.intake === "dims" && input.widthM == null) return "실내 가로·세로를 입력해 주세요. 모르면 1단계에서 다른 선택지를 고르세요.";
  }
  if (step === 3) {
    const min = num(fd, "budgetMin");
    const max = num(fd, "budgetMax");
    if (min != null && max != null && min > max) return "예산 최소값이 최대값보다 큽니다.";
    if (input.intake === "photos" && !String(fd.get("workScope") ?? "").trim()) return "사진으로 상담하려면 원하는 공사 내용을 적어 주세요.";
  }
  if (step === 5) {
    if (input.intake === "drawing" && !fileCount(fd, "drawings")) return "도면 파일을 올려 주세요. 지금 없으면 1단계에서 다른 선택지를 고르세요.";
    if (input.intake === "photos" && !fileCount(fd, "photos")) return "현장 사진을 한 장 이상 올려 주세요.";
  }
  if (step === 6) {
    if (!String(fd.get("title") ?? "").trim()) return "프로젝트 이름을 입력해 주세요.";
    if (!String(fd.get("region") ?? "").trim()) return "지역을 입력해 주세요.";
  }
  return null;
}

function RoomCard({ name, title, desc, defaultChecked, children }: { name: string; title: string; desc: string; defaultChecked: boolean; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4 transition has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-5 accent-brand" />
        <span>
          <b className="text-sm">{title}</b>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted">{desc}</span>
        </span>
      </label>
      {children}
    </div>
  );
}

export default function ProjectWizard({
  action,
  initial,
  preferredOption = "",
  refs = [],
  startCase,
  startPhoto,
  reference,
  cancel,
}: {
  action: Action;
  reference?: PostReference;
  initial: Partial<LayoutInput>;
  preferredOption?: string;
  /** 연결할 수 있는 참고 사례. startCase는 처음부터 골라 둔다. */
  refs?: RefCandidate[];
  startCase?: number;
  startPhoto?: number;
  cancel: ReactNode;
}) {
  const i: LayoutInput = {
    areaPyeong: 30,
    widthM: null,
    depthM: null,
    staff: 8,
    ceo: true,
    meeting: true,
    meetingSeats: 6,
    pantry: true,
    storage: false,
    entrance: "right",
    shape: "rect",
    pillars: 0,
    furnitureIncluded: true,
    windowWall: "unknown",
    priority: "unknown",
    mood: "unknown",
    ...initial,
  };
  const form = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0);
  const [intake, setIntake] = useState<IntakeKey | "">(i.intake ?? "");
  const known = intake === "drawing" || intake === "dims";
  const [reached, setReached] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<{ input: LayoutInput; text: Record<string, string>; files: number; refs: number }>({ input: i, text: {}, files: 0, refs: startCase ? 1 : 0 });
  const [state, dispatch, pending] = useActionState(action, {});
  const [addressValues, setAddressValues] = useState({ region: "", address: "", area: String(i.areaPyeong) });
  const last = step === STEPS.length - 1;

  const sync = () => {
    const fd = new FormData(form.current!);
    const text: Record<string, string> = {};
    for (const key of ["title", "region", "address", "budgetMin", "budgetMax", "desiredStart", "desiredMovein", "reuseFurniture", "workScope"]) text[key] = String(fd.get(key) ?? "").trim();
    const files = ["photos", "drawings", "sketches"].reduce((n, k) => n + fileCount(fd, k), 0);
    setSnapshot({ input: readInput(fd), text, files, refs: fd.getAll("refCase").length });
    return fd;
  };
  const go = (to: number) => {
    const fd = sync();
    if (to > step) {
      for (let s = step; s < to; s++) {
        const problem = validate(s, fd);
        if (problem) {
          setError(problem);
          setStep(s);
          return;
        }
      }
    }
    setError(null);
    setStep(to);
    setReached((r) => Math.max(r, to));
    form.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const result = useMemo(() => (snapshot.input.areaPyeong > 0 && snapshot.input.staff >= 1 ? generateLayout(snapshot.input) : null), [snapshot.input]);
  const option = result?.options.find((o) => o.id === preferredOption) ?? result?.options.find((o) => o.id === result.recommended) ?? result?.options[0];
  const coverage = useMemo(() => inputCoverage(snapshot.input, result, { files: snapshot.files, refs: snapshot.refs }), [snapshot, result]);
  const previewStyle = MOOD_STYLE[snapshot.input.mood ?? ""] ?? "natural";
  const rooms = [snapshot.input.ceo && "대표실", snapshot.input.meeting && `회의실 ${snapshot.input.meetingSeats}인`, snapshot.input.pantry && "탕비실", snapshot.input.storage && "창고"].filter(Boolean).join(", ");

  const preview = (
    <div className="card !p-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-semibold">미리보기</span>
        {result && intake && <span className={`badge ${result.status === "ok" ? "border-brand/30 bg-brand-soft text-brand" : "border-warn/30 bg-warn-soft text-warn"}`}>{result.status === "ok" ? "자동 배치 가능" : "검토 필요"}</span>}
      </div>
      {!intake ? (
        <p className="rounded-lg bg-sand p-4 text-xs leading-relaxed text-muted" data-testid="preview-wait">가진 자료를 고르면 여기에서 미리보기를 보여 드려요. 실내 치수를 아는 경우에만 배치안을 그려요.</p>
      ) : option ? (
        <>
          <PlanSvg option={option} styleId={previewStyle} thumb />
          <p className="mt-2 px-1 text-[11px] leading-relaxed text-muted">
            <b className="text-ink">{option.title}</b> · {mm(option.W)} × {mm(option.D)} mm{result!.assumedDims && " (평수로 가정)"} · {getStyle(previewStyle).name} 색상
          </p>
          {result!.options.length > 1 && (
            <p className="mt-1 px-1 text-[11px] leading-relaxed text-muted">
              이 조건으로 {result!.options.map((o) => o.title).join(", ")} {result!.options.length}가지 배치가 나옵니다. 등록한 뒤 비교해서 고릅니다.
            </p>
          )}
          {result!.advisories[0] && <p className="mt-2 rounded-lg bg-warn-soft p-2 text-[11px] leading-relaxed text-warn">{result!.advisories[0]}</p>}
        </>
      ) : result && result.W == null && snapshot.input.intake ? (
        <div className="rounded-lg bg-sand p-3 text-xs leading-relaxed" data-testid="no-layout">
          <p className="font-semibold">배치안을 만들지 않습니다</p>
          <p className="mt-1 text-muted">{result.reasons[0]}</p>
          <p className="mt-2 text-muted">요청은 그대로 접수됩니다. 운영자가 자료를 보고 필요한 것을 알려 드립니다.</p>
        </div>
      ) : result ? (
        <div className="rounded-lg bg-warn-soft p-3 text-xs leading-relaxed text-warn">
          <ul className="list-disc space-y-1 pl-4">
            {result.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="mt-2 text-ink">이대로 접수하면 배치안 없이 운영자가 검토합니다. 조건을 조정하면 자동 배치를 받을 수 있습니다.</p>
        </div>
      ) : (
        <p className="p-3 text-xs text-muted">면적과 직원 수를 입력하면 배치 미리보기가 나옵니다.</p>
      )}
      <details className="mt-3 border-t border-line px-1 pt-3" open>
        <summary className="cursor-pointer text-xs font-semibold">입력한 정보는 이렇게 쓰입니다</summary>
        <div className="mt-2">
          <CoverageTable rows={coverage} dense />
        </div>
      </details>
    </div>
  );

  return (
    <form
      ref={form}
      noValidate
      onChange={sync}
      onSubmit={(e) => {
        e.preventDefault();
        if (!last) return go(step + 1);
        const fd = sync();
        for (let s = 0; s < STEPS.length; s++) {
          const problem = validate(s, fd);
          if (problem) {
            setError(problem);
            setStep(s);
            return;
          }
        }
        setError(null);
        startTransition(() => dispatch(fd));
      }}
      className="scroll-mt-4"
    >
      <ReferenceInput reference={reference}/>
      <div hidden={step !== 0}><IntakeSpaceKind kind="office" /></div>
      <input type="hidden" name="preferredOption" value={preferredOption} />
      <ol className="mb-5 flex gap-1 overflow-x-auto pb-1 text-xs" aria-label="입력 단계">
        {STEPS.map((label, n) => (
          <li key={label} className="shrink-0">
            <button
              type="button"
              disabled={n > reached}
              onClick={() => go(n)}
              aria-current={n === step ? "step" : undefined}
              className={`flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 py-1.5 transition disabled:cursor-default ${n === step ? "border-brand bg-brand text-white" : n <= reached ? "cursor-pointer border-brand/40 bg-brand-soft text-brand" : "border-line bg-white text-muted"}`}
            >
              <span className="tabular-nums">{n + 1}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="card">
          <h2 className="text-lg font-bold">
            <span className="mr-2 text-muted">
              {step + 1}/{STEPS.length}
            </span>
            {STEPS[step]}
          </h2>

          <div hidden={step !== 0} className="mt-4"><AddressIntake onApply={(value: AddressImport) => {
            const area = value.areaM2 === null ? "" : String(Math.round(value.areaM2 / 3.3058 * 10) / 10);
            setAddressValues({ region: value.region, address: value.address, area });
            setSnapshot((s) => ({ ...s, input: { ...s.input, areaPyeong: Number(area) }, text: { ...s.text, region: value.region, address: value.address } }));
            setError(null);
          }} /></div>

          {/* 모든 단계를 폼 안에 두고 보이는 것만 바꾼다. 파일 선택과 입력값이 단계 이동에도 유지된다. */}
          <fieldset hidden={step !== 0} className="mt-4 grid gap-3 sm:grid-cols-2" data-testid="intake">
            <legend className="mb-3 text-sm leading-relaxed text-muted sm:col-span-2">도면이 없어도 괜찮아요. 사무실은 가진 자료에 맞춰 다음 단계가 달라져요. 집 인테리어는 위에서 ‘집’을 선택해 주세요.</legend>
            {(Object.entries(INTAKE_MODES) as [IntakeKey, (typeof INTAKE_MODES)[IntakeKey]][]).map(([key, m]) => (
              <label key={key} className="intake-option">
                <input type="radio" name="intake" value={key} checked={intake === key} onChange={() => setIntake(key)} className="sr-only" />
                <span className="intake-icon">
                  <Icon name={INTAKE_ICON[key]} className="size-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block text-[15px]">{m.label}</b>
                  <span className="mt-1 block text-[13px] leading-relaxed text-muted">{m.hint}</span>
                </span>
                <span className="intake-check" aria-hidden>
                  <Icon name="check" className="size-4" />
                </span>
              </label>
            ))}
            {known && (
              <div className="rounded-xl border border-brand/30 bg-brand-soft p-4 text-sm leading-relaxed sm:col-span-2" data-testid="to-space">
                <p className="font-semibold">{intake === "dims" ? "치수를 알면 ‘내 공간 만들기’로 시작해요" : "직사각형 공간이고 도면에서 치수를 읽을 수 있다면 ‘내 공간 만들기’가 더 정확해요"}</p>
                <p className="mt-1 text-xs text-muted">출입문·창·기둥 위치까지 넣어 실제 공간을 3D로 만들고, 가구를 직접 옮겨 저장한 뒤 원할 때 시공 제안을 요청할 수 있어요.{intake === "drawing" ? " ㄱ자 등 다른 모양은 여기서 도면으로 상담을 요청해 주세요." : ""}</p>
                <a href={`/spaces/new${startCase ? `?case=${startCase}` : ""}`} className="btn btn-primary btn-sm mt-3">
                  내 공간 만들기로 이동
                </a>
              </div>
            )}
          </fieldset>

          <div hidden={step !== 1} className="mt-4 grid gap-4 sm:grid-cols-2">
            <p className="text-sm leading-relaxed text-muted sm:col-span-2">배치안은 20~50평 직사각형 사무실이고 실내 치수를 알 때만 만듭니다. 그 밖의 공간도 접수할 수 있으며 운영자가 검토해 상담으로 이어집니다. 모르는 값은 비워 두세요. 정해 둔 값은 미리보기 아래에 ‘가정’으로 표시합니다.</p>
            <Field label="전용면적 (평)">
              <input className="input" name="areaPyeong" type="number" inputMode="decimal" step="0.1" min="1" value={addressValues.area} onChange={(e) => setAddressValues((v) => ({ ...v, area: e.target.value }))} />
            </Field>
            <Field label="직원 좌석 수" hint="대표는 제외한 인원">
              <input className="input" name="staff" type="number" inputMode="numeric" min="1" defaultValue={i.staff} />
            </Field>
            {known ? (
              <>
            <Field label={intake === "dims" ? "실내 가로 (m)" : "실내 가로 (m) · 도면에 적힌 값"} hint={intake === "dims" ? "출입구가 있는 벽의 길이" : "입력하면 배치안을 바로 만들고, 비워 두면 운영자가 도면을 확인합니다."}>
              <input className="input" name="widthM" type="number" inputMode="decimal" step="0.01" min="0" defaultValue={i.widthM ?? ""} placeholder="예: 11" />
            </Field>
            <Field label="실내 세로 (m)" hint="출입구에서 안쪽 벽까지의 깊이">
              <input className="input" name="depthM" type="number" inputMode="decimal" step="0.01" min="0" defaultValue={i.depthM ?? ""} placeholder="예: 9" />
            </Field>
            <Field label="공간 형태">
              <select className="input" name="shape" defaultValue={i.shape}>
                <option value="rect">직사각형</option>
                <option value="other">ㄱ자·다각형 등 그 외</option>
              </select>
            </Field>
            <Field label="실내 기둥 수">
              <input className="input" name="pillars" type="number" inputMode="numeric" min="0" defaultValue={i.pillars} />
            </Field>
            <Field label="출입구 위치" hint="출입구가 있는 벽을 아래에 두고 봤을 때">
              <select className="input" name="entrance" defaultValue={i.entrance}>
                <option value="right">오른쪽</option>
                <option value="left">왼쪽</option>
                <option value="other">가운데 또는 다른 벽</option>
              </select>
            </Field>
            <Field label="창이 있는 벽" hint="출입구 맞은편 벽일 때만 배치에 반영합니다.">
              <select className="input" name="windowWall" defaultValue={i.windowWall ?? "unknown"}>
                {Object.entries(WINDOW_WALLS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
              </>
            ) : (
              <p className="rounded-xl bg-sand p-3 text-xs leading-relaxed text-muted sm:col-span-2">
                {intake === "photos" ? "사진만 있는 경우에는 치수를 받지 않습니다. 평수와 인원만 알려 주시면 운영자가 사진을 보고 필요한 자료를 확인합니다." : "자료가 없는 경우에는 평수와 인원만 먼저 저장합니다. 도면이나 치수는 요청 화면에서 나중에 추가할 수 있습니다."}
              </p>
            )}
          </div>

          <div hidden={step !== 2} className="mt-4 grid gap-3 sm:grid-cols-2">
            <p className="text-sm leading-relaxed text-muted sm:col-span-2">대표실과 회의실은 각각 1개까지 자동 배치합니다. 더 필요하면 4단계의 기타 요청에 적어 주세요.</p>
            <RoomCard name="ceo" title="대표실" desc="책상, 방문 의자, 수납장이 들어가는 독립된 방" defaultChecked={i.ceo} />
            <RoomCard name="meeting" title="회의실" desc="유리 칸막이와 회의 테이블, 벽걸이 화면" defaultChecked={i.meeting}>
              <label className="mt-3 flex items-center gap-2 pl-8 text-xs text-muted">
                인원
                <select className="input w-24 !py-1" name="meetingSeats" defaultValue={i.meetingSeats}>
                  {[4, 6, 8, 10, 12].map((n) => (
                    <option key={n} value={n}>
                      {n}인
                    </option>
                  ))}
                </select>
              </label>
            </RoomCard>
            <RoomCard name="pantry" title="탕비실" desc="싱크, 하부장, 냉장고 자리. 급배수 위치는 업체가 확인합니다." defaultChecked={i.pantry} />
            <RoomCard name="storage" title="수납·창고" desc="선반이 들어가는 문 달린 보관 공간" defaultChecked={i.storage} />
            <fieldset className="sm:col-span-2">
              <legend className="label">가장 중요하게 보는 것 — 배치안 가운데 무엇을 먼저 권할지 정합니다. 배치안은 모두 만들어 비교할 수 있습니다.</legend>
              <div className="grid gap-2 sm:grid-cols-4">
                {Object.entries(PRIORITIES).map(([key, label]) => (
                  <label key={key} className="flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-white p-3 text-sm transition has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                    <input type="radio" name="priority" value={key} defaultChecked={(i.priority ?? "unknown") === key} className="size-4 accent-brand" />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div hidden={step !== 3} className="mt-4 grid gap-4 sm:grid-cols-2">
            <p className="text-sm leading-relaxed text-muted sm:col-span-2">예산은 업체가 범위를 잡는 기준이 됩니다. 정하지 않았다면 비워 두어도 됩니다.</p>
            <Field label="예산 최소 (만원)">
              <input className="input" name="budgetMin" type="number" inputMode="numeric" min="0" step="100" placeholder="예: 4000" />
            </Field>
            <Field label="예산 최대 (만원)">
              <input className="input" name="budgetMax" type="number" inputMode="numeric" min="0" step="100" placeholder="예: 6000" />
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="furnitureIncluded" defaultChecked={i.furnitureIncluded} className="size-4 accent-brand" /> 예산에 가구를 포함합니다
            </label>
            <Field label="희망 착공일">
              <input className="input" name="desiredStart" type="date" />
            </Field>
            <Field label="희망 입주일">
              <input className="input" name="desiredMovein" type="date" />
            </Field>
            <Field label={intake === "photos" ? "원하는 공사 내용" : "원하는 공사 내용 · 선택"} className="sm:col-span-2" hint="예: 전체 철거 후 새로 시공, 바닥과 조명만 교체, 회의실 하나 추가">
              <textarea className="input" name="workScope" rows={3} maxLength={1000} />
            </Field>
          </div>

          <div hidden={step !== 4} className="mt-4 grid gap-4 sm:grid-cols-2">
            <fieldset className="sm:col-span-2">
              <legend className="label">선호 분위기 — 추천 스타일을 정하는 데 씁니다. 나중에 세 가지를 비교해 바꿀 수 있습니다.</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(MOODS).map(([key, label]) => {
                  const s = MOOD_STYLE[key] ? getStyle(MOOD_STYLE[key]) : null;
                  return (
                    <label key={key} className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-white p-3 text-sm transition has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                      <input type="radio" name="mood" value={key} defaultChecked={(i.mood ?? "unknown") === key} className="size-4 accent-brand" />
                      <span className="flex-1">
                        {label}
                        {s && <span className="block text-xs text-muted">{s.name}</span>}
                      </span>
                      {s && (
                        <span className="flex overflow-hidden rounded-md border border-black/10">
                          {s.palette.map(([name, color]) => (
                            <i key={name} className="block h-6 w-3.5" style={{ background: color }} />
                          ))}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <fieldset className="sm:col-span-2" data-testid="wizard-refs">
              <legend className="label">참고 사례 — 고른 사례와 사진이 요청서에 연결되어 운영자와 배정된 시공사가 함께 봅니다.</legend>
              {refs.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line p-3 text-xs leading-relaxed text-muted">저장한 사례가 없습니다. 사례를 둘러보다 저장해 두면 여기에서 고를 수 있고, 요청을 등록한 뒤에도 추가할 수 있습니다.</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {refs.map((c) => (
                    <li key={c.id} className="rounded-xl border border-line bg-white p-2.5 transition has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                      <label className="flex cursor-pointer items-center gap-3">
                        <input type="checkbox" name="refCase" value={c.id} defaultChecked={c.id === startCase} className="size-5 shrink-0 accent-brand" />
                        {c.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element -- 업로드 파일
                          <img src={`/files/${c.photo}`} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <span className="size-14 shrink-0 rounded-lg bg-sand" />
                        )}
                        <span className="min-w-0">
                          <b className="line-clamp-1 text-sm">{c.title}</b>
                          <span className="line-clamp-1 block text-xs text-muted">{c.meta}</span>
                          {c.id === startCase && <span className="text-[11px] font-semibold text-clay">이 사례에서 시작</span>}
                        </span>
                      </label>
                      <input className="input mt-2 !py-1.5 text-xs" name={`refNote_${c.id}`} placeholder="이 사례에서 마음에 든 점 (선택)" aria-label={`${c.title}에서 마음에 든 점`} maxLength={300} />
                    </li>
                  ))}
                </ul>
              )}
              {startPhoto ? <input type="hidden" name="refPhoto" value={startPhoto} /> : null}
            </fieldset>
            <Field label="재사용할 가구" className="sm:col-span-2">
              <input className="input" name="reuseFurniture" placeholder="예: 책상 6개(1,400), 회의 테이블" />
            </Field>
            <Field label="출입문·창문·기둥 위치 메모" className="sm:col-span-2" hint="자동 배치에는 반영되지 않고 운영자와 업체가 확인합니다.">
              <textarea className="input" name="siteNotes" rows={2} />
            </Field>
            <Field label="기타 요청" className="sm:col-span-2">
              <textarea className="input" name="notes" rows={2} />
            </Field>
          </div>

          <div hidden={step !== 5} className="mt-4 grid gap-4">
            <p className="text-sm leading-relaxed text-muted">
              {intake === "drawing"
                ? "도면을 한 개 이상 올려 주세요. 현장 사진이 있으면 함께 올리면 업체가 더 정확하게 견적을 냅니다."
                : intake === "dims"
                  ? "손으로 그린 평면이 있으면 사진으로 찍어 올려 주세요. 현장 사진도 도움이 됩니다. 둘 다 선택입니다."
                  : intake === "photos"
                    ? "현장 사진을 한 장 이상 올려 주세요. 출입구, 창, 기둥이 보이게 여러 방향에서 찍으면 좋습니다."
                    : "지금은 건너뛰어도 됩니다. 자료는 요청 화면의 ‘요청 내용·자료’에서 나중에 올릴 수 있습니다."}{" "}
              파일 하나에 10MB까지이며, 견적에 참여하는 업체에만 공유됩니다.
            </p>
            <Field label={intake === "drawing" ? "기존 도면" : "기존 도면 · 선택"} hint="이미지, PDF, DWG, DXF">
              <input className="input" name="drawings" type="file" accept="image/*,.pdf,.dwg,.dxf" multiple />
            </Field>
            {intake === "dims" && (
              <Field label="손그림 평면 · 선택" hint="종이에 그린 평면을 찍은 사진">
                <input className="input" name="sketches" type="file" accept="image/*,.pdf" multiple />
              </Field>
            )}
            <Field label={intake === "photos" ? "현재 공간 사진" : "현재 공간 사진 · 선택"}>
              <input className="input" name="photos" type="file" accept="image/*" multiple />
            </Field>
          </div>

          <div hidden={step !== 6} className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="프로젝트 이름" className="sm:col-span-2">
              <input className="input" name="title" placeholder="예: 성수동 신규 사무실" />
            </Field>
            <Field label="지역 (시·구)" hint="견적에 참여하는 업체에 공개됩니다.">
              <input className="input" name="region" value={addressValues.region} onChange={(e) => setAddressValues((v) => ({ ...v, region: e.target.value }))} placeholder="예: 서울 성동구" />
            </Field>
            <Field label="시공지 상세 주소 · 선택" hint="현장 방문을 요청한 업체에만 공개됩니다.">
              <input className="input" name="address" value={addressValues.address} onChange={(e) => setAddressValues((v) => ({ ...v, address: e.target.value }))} placeholder="도로명 주소, 층" />
            </Field>
            <div className="rounded-xl bg-sand p-4 text-sm sm:col-span-2">
              <p className="mb-2 font-semibold">입력한 조건</p>
              <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5">
                <dt className="text-muted">가진 자료</dt>
                <dd>{intake ? INTAKE_MODES[intake].label : "—"}</dd>
                <dt className="text-muted">공간</dt>
                <dd>
                  {snapshot.input.areaPyeong}평 · 직원 {snapshot.input.staff}석
                  {snapshot.input.widthM && snapshot.input.depthM ? ` · ${snapshot.input.widthM} × ${snapshot.input.depthM} m` : " · 실내 치수 미입력"}
                </dd>
                <dt className="text-muted">필요 공간</dt>
                <dd>{rooms || "개별실 없음(개방형)"}</dd>
                <dt className="text-muted">예산</dt>
                <dd>
                  {snapshot.text.budgetMin || snapshot.text.budgetMax ? `${snapshot.text.budgetMin || "?"} ~ ${snapshot.text.budgetMax || "?"}만원` : "미정"} · 가구 {snapshot.input.furnitureIncluded ? "포함" : "별도"}
                </dd>
                <dt className="text-muted">일정</dt>
                <dd>
                  착공 {snapshot.text.desiredStart || "미정"} / 입주 {snapshot.text.desiredMovein || "미정"}
                </dd>
                <dt className="text-muted">분위기</dt>
                <dd>{MOODS[snapshot.input.mood ?? "unknown"]}</dd>
                <dt className="text-muted">우선순위</dt>
                <dd>{PRIORITIES[snapshot.input.priority ?? "unknown"]}</dd>
                <dt className="text-muted">참고 사례</dt>
                <dd>{snapshot.refs ? `${snapshot.refs}건 연결` : "없음"}</dd>
                <dt className="text-muted">파일</dt>
                <dd>{snapshot.files ? `${snapshot.files}개 선택` : "없음"}</dd>
              </dl>
            </div>
            <div className="sm:col-span-2 lg:hidden">{preview}</div>
          </div>

          {(error || state.error) && (
            <p role="alert" className="mt-4 rounded-lg bg-warn-soft px-3 py-2 text-sm text-danger">
              {error || state.error}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
            {step > 0 && (
              <button type="button" className="btn" onClick={() => go(step - 1)}>
                이전
              </button>
            )}
            <button className="btn btn-primary" disabled={pending}>
              {pending ? "요청을 등록하는 중…" : last ? (result?.status === "ok" ? "요청 등록하고 배치안 보기" : "요청 등록하기") : "다음"}
            </button>
            <span className="ml-auto">{cancel}</span>
          </div>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-4">{preview}</div>
        </aside>
      </div>
    </form>
  );
}
