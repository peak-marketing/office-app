"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import type { FormState } from "@/lib/actions";
import { INTAKE_MODES, ITEM_STATUS, MOODS, PRIORITIES, QUOTE_CATEGORIES, WINDOW_WALLS, quoteTotals, won, type ItemStatus, type QuoteCategory, type QuoteItem } from "@/lib/constants";
import type { LayoutInput } from "@/lib/layout/types";
import type { QuoteDraft } from "@/lib/quotes";

type Action = (state: FormState, fd: FormData) => Promise<FormState>;

/**
 * 오류·완료 메시지를 보여 주는 폼. React는 action 폼을 제출 후 초기화하므로,
 * 검증 오류 때 입력값이 사라지지 않게 onSubmit으로 직접 실행한다.
 */
export function StateForm({
  action,
  submit,
  children,
  className = "",
  resetOnOk = false,
  secondary,
}: {
  action: Action;
  submit: string;
  children: ReactNode;
  className?: string;
  resetOnOk?: boolean;
  secondary?: ReactNode;
}) {
  const [state, dispatch, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnOk && state.ok) ref.current?.reset();
  }, [state, resetOnOk]);
  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => dispatch(fd));
      }}
    >
      {children}
      {state.error && (
        <p role="alert" className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.ok && <p className="mt-3 rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand">{state.ok}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "처리 중…" : submit}
        </button>
        {secondary}
      </div>
    </form>
  );
}

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs leading-relaxed text-muted">{hint}</span>}
    </label>
  );
}


const Consent = () => (
  <label className="flex items-start gap-2 rounded-lg bg-sand p-3 text-xs leading-relaxed">
    <input type="checkbox" name="consent" required className="mt-0.5 size-4 shrink-0 accent-brand" />
    <span>
      (필수) 개인정보 수집·이용에 동의합니다. 이름, 이메일, 연락처와 요청에 올린 주소·사진·도면을 요청 처리와 시공사 연결에 씁니다.{" "}
      <a href="/privacy" target="_blank" className="underline">
        자세히 보기
      </a>
    </span>
  </label>
);

export function AuthForm({ mode, action, next }: { mode: "login" | "signup"; action: Action; next?: string }) {
  const [role, setRole] = useState<"customer" | "vendor">("customer");
  return (
    <StateForm action={action} submit={mode === "login" ? "로그인" : "가입하기"} className="space-y-3">
      {next && <input type="hidden" name="next" value={next} />}
      {mode === "signup" && (
        <div className="mb-4 grid grid-cols-2 gap-2">
          {(["customer", "vendor"] as const).map((r) => (
            <label key={r} className={`cursor-pointer rounded-lg border p-3 text-sm ${role === r ? "border-brand bg-brand-soft" : "border-line bg-white"}`}>
              <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="sr-only" />
              <b>{r === "customer" ? "고객" : "파트너(시공·판매)"}</b>
              <span className="mt-1 block text-xs text-muted">{r === "customer" ? "공간을 둘러보고 꾸미고, 시공 견적과 쇼핑까지" : "시공 요청을 받거나 상품을 팔고 싶어요"}</span>
            </label>
          ))}
        </div>
      )}
      <Field label="이메일">
        <input className="input" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="비밀번호" hint={mode === "signup" ? "8자 이상" : undefined}>
        <input className="input" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "signup" ? 8 : undefined} />
      </Field>
      {mode === "signup" && (
        <>
          <Field label={role === "vendor" ? "담당자 이름" : "이름"}>
            <input className="input" name="name" autoComplete="name" required />
          </Field>
          <Field label="연락처" hint={role === "customer" ? "현장 방문을 요청한 업체에만 공개됩니다." : undefined}>
            <input className="input" name="phone" type="tel" autoComplete="tel" placeholder="010-0000-0000" />
          </Field>
          {role === "vendor" && (
            <>
              <Field label="업체명(상호)" hint="가입 후 운영자 승인을 거쳐 요청을 받거나 상품을 판매합니다.">
                <input className="input" name="company" required />
              </Field>
              <PartnerRoles />
            </>
          )}
          <Consent />
        </>
      )}
    </StateForm>
  );
}

/** 파트너 역할 고르기. 한 계정이 시공과 판매를 함께 할 수 있다. */
export function PartnerRoles({ build = true, sell = false }: { build?: boolean; sell?: boolean }) {
  return (
    <fieldset>
      <legend className="label">할 일 (둘 다 고를 수 있어요)</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line bg-white p-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
          <input type="checkbox" name="roles" value="build" defaultChecked={build} className="mt-0.5 size-4 accent-brand" />
          <span><b>시공</b><span className="mt-0.5 block text-xs text-muted">공사 요청을 받고 제안해요</span></span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line bg-white p-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
          <input type="checkbox" name="roles" value="sell" defaultChecked={sell} className="mt-0.5 size-4 accent-brand" />
          <span><b>판매</b><span className="mt-0.5 block text-xs text-muted">쇼핑에 상품을 올려 팔아요</span></span>
        </label>
      </div>
    </fieldset>
  );
}

/** 파트너 입점 신청. 가입 후 운영자 승인을 거친다. */
export function PartnerForm({ action }: { action: Action }) {
  return (
    <StateForm action={action} submit="파트너 입점 신청" className="space-y-3">
      <input type="hidden" name="role" value="vendor" />
      <Field label="업체명(상호)">
        <input className="input" name="company" required />
      </Field>
      <PartnerRoles />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="담당자 이름">
          <input className="input" name="name" autoComplete="name" required />
        </Field>
        <Field label="연락처">
          <input className="input" name="phone" type="tel" autoComplete="tel" placeholder="02-000-0000" />
        </Field>
      </div>
      <Field label="이메일 (로그인 아이디)">
        <input className="input" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="비밀번호" hint="8자 이상">
        <input className="input" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Consent />
    </StateForm>
  );
}

/** 비밀번호 재설정 메일 요청 */
export function ForgotForm({ action }: { action: Action }) {
  return (
    <StateForm action={action} submit="재설정 링크 받기" className="space-y-3">
      <Field label="가입한 이메일">
        <input className="input" name="email" type="email" autoComplete="email" required />
      </Field>
    </StateForm>
  );
}

export function ResetForm({ action }: { action: Action }) {
  return (
    <StateForm action={action} submit="새 비밀번호로 바꾸기" className="space-y-3">
      <Field label="새 비밀번호" hint="8자 이상">
        <input className="input" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
    </StateForm>
  );
}

export interface ProjectDefaults {
  title: string;
  region: string;
  address: string;
  budget_min: number | null;
  budget_max: number | null;
  desired_start: string;
  desired_movein: string;
  notes: string;
  work_scope?: string;
}

const NEW_INPUT: LayoutInput = {
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
  siteNotes: "",
  reuseFurniture: "",
  mood: "unknown",
};

function Section({ n, title, desc, children }: { n: number; title: string; desc?: string; children: ReactNode }) {
  return (
    <fieldset className="card">
      <legend className="float-left mb-4 w-full">
        <span className="text-sm font-semibold">
          <span className="mr-2 text-muted">{n}</span>
          {title}
        </span>
        {desc && <span className="mt-1 block text-xs leading-relaxed text-muted">{desc}</span>}
      </legend>
      <div className="clear-both grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function ProjectForm({ action, project, input, mode, cancel }: { action: Action; project?: ProjectDefaults; input?: LayoutInput; mode: "new" | "edit"; cancel?: ReactNode }) {
  const i = input ?? NEW_INPUT;
  const [meeting, setMeeting] = useState(i.meeting);
  return (
    <StateForm action={action} submit={mode === "new" ? "배치안 생성하기" : "저장하고 다시 생성"} className="space-y-4" secondary={cancel}>
      <Section n={1} title="기본 정보">
        <Field label="프로젝트 이름" className="sm:col-span-2">
          <input className="input" name="title" defaultValue={project?.title} placeholder="예: 성수동 신규 사무실" required />
        </Field>
        <Field label="지역 (시·구)" hint="견적에 참여하는 업체에 공개됩니다.">
          <input className="input" name="region" defaultValue={project?.region} placeholder="예: 서울 성동구" required />
        </Field>
        <Field label="시공지 상세 주소" hint="현장 방문을 요청한 업체에만 공개됩니다.">
          <input className="input" name="address" defaultValue={project?.address} placeholder="도로명 주소, 층" />
        </Field>
      </Section>

      <Section n={2} title="공간" desc="배치안은 20~50평 직사각형 사무실이고 실내 가로·세로를 알 때만 만듭니다. 치수를 추가하려면 가진 자료를 ‘도면이 있어요’나 ‘치수는 알아요’로 바꾸세요.">
        <Field label="가진 자료" className="sm:col-span-2">
          <select className="input" name="intake" defaultValue={i.intake ?? "dims"}>
            {Object.entries(INTAKE_MODES).map(([key, m]) => (
              <option key={key} value={key}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="전용면적 (평)">
          <input className="input" name="areaPyeong" type="number" step="0.1" min="1" defaultValue={i.areaPyeong} required />
        </Field>
        <Field label="직원 좌석 수" hint="대표는 제외한 인원">
          <input className="input" name="staff" type="number" min="1" defaultValue={i.staff} required />
        </Field>
        <Field label="실내 가로 (m) · 선택" hint="출입구가 있는 벽의 길이. 비워 두면 평수로 가정합니다.">
          <input className="input" name="widthM" type="number" step="0.01" min="0" defaultValue={i.widthM ?? ""} placeholder="예: 11" />
        </Field>
        <Field label="실내 세로 (m) · 선택" hint="출입구에서 안쪽 벽까지의 깊이">
          <input className="input" name="depthM" type="number" step="0.01" min="0" defaultValue={i.depthM ?? ""} placeholder="예: 9" />
        </Field>
        <Field label="공간 형태">
          <select className="input" name="shape" defaultValue={i.shape}>
            <option value="rect">직사각형</option>
            <option value="other">ㄱ자·다각형 등 그 외</option>
          </select>
        </Field>
        <Field label="실내 기둥 수">
          <input className="input" name="pillars" type="number" min="0" defaultValue={i.pillars} />
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
      </Section>

      <Section n={3} title="필요한 공간" desc="대표실과 회의실은 각각 1개까지 자동 배치합니다. 회의실이 여러 개 필요하면 기타 요청에 적어 주세요.">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="ceo" defaultChecked={i.ceo} className="size-4 accent-brand" /> 대표실
        </label>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="meeting" checked={meeting} onChange={(e) => setMeeting(e.target.checked)} className="size-4 accent-brand" /> 회의실
          </label>
          <select className="input w-28" name="meetingSeats" defaultValue={i.meetingSeats} disabled={!meeting} aria-label="회의실 인원">
            {[4, 6, 8, 10, 12].map((n) => (
              <option key={n} value={n}>
                {n}인
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="pantry" defaultChecked={i.pantry} className="size-4 accent-brand" /> 탕비실
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="storage" defaultChecked={i.storage} className="size-4 accent-brand" /> 수납·창고
        </label>
        <Field label="가장 중요하게 보는 것" hint="배치안 가운데 무엇을 먼저 권할지 정합니다.">
          <select className="input" name="priority" defaultValue={i.priority ?? "unknown"}>
            {Object.entries(PRIORITIES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section n={4} title="예산과 일정">
        <Field label="예산 최소 (만원)">
          <input className="input" name="budgetMin" type="number" min="0" step="100" defaultValue={project?.budget_min ?? ""} placeholder="예: 4000" />
        </Field>
        <Field label="예산 최대 (만원)">
          <input className="input" name="budgetMax" type="number" min="0" step="100" defaultValue={project?.budget_max ?? ""} placeholder="예: 6000" />
        </Field>
        <Field label="희망 착공일">
          <input className="input" name="desiredStart" type="date" defaultValue={project?.desired_start} />
        </Field>
        <Field label="희망 입주일">
          <input className="input" name="desiredMovein" type="date" defaultValue={project?.desired_movein} />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="furnitureIncluded" defaultChecked={i.furnitureIncluded} className="size-4 accent-brand" /> 예산에 가구를 포함합니다
        </label>
      </Section>

      <Section n={5} title="분위기와 현장 메모">
        <Field label="선호 분위기" hint="스타일 추천에 사용합니다. 나중에 세 가지를 비교해 바꿀 수 있습니다.">
          <select className="input" name="mood" defaultValue={i.mood ?? "unknown"}>
            {Object.entries(MOODS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="재사용할 가구">
          <input className="input" name="reuseFurniture" defaultValue={i.reuseFurniture} placeholder="예: 책상 6개(1,400), 회의 테이블" />
        </Field>
        <Field label="출입문·창문·기둥 위치 메모" className="sm:col-span-2" hint="자동 배치에는 반영되지 않고 운영자와 업체가 확인합니다.">
          <textarea className="input" name="siteNotes" rows={2} defaultValue={i.siteNotes} />
        </Field>
        <Field label="원하는 공사 내용" className="sm:col-span-2" hint="사진만 있는 경우에는 꼭 적어 주세요.">
          <textarea className="input" name="workScope" rows={2} defaultValue={project?.work_scope} />
        </Field>
        <Field label="기타 요청" className="sm:col-span-2">
          <textarea className="input" name="notes" rows={2} defaultValue={project?.notes} />
        </Field>
        {mode === "edit" && (
          <Field label="변경 메모 · 선택" className="sm:col-span-2" hint="공간 조건이 바뀌면 새 버전이 만들어집니다. 무엇을 바꿨는지 적어 두면 비교하기 쉽습니다.">
            <input className="input" name="versionNote" placeholder="예: 직원 10석으로 증원" />
          </Field>
        )}
      </Section>

      {mode === "new" && (
        <Section n={6} title="사진과 도면 · 선택" desc="파일 하나에 10MB까지. 견적에 참여하는 업체에 공유됩니다. 나중에 추가할 수도 있습니다.">
          <Field label="현재 공간 사진">
            <input className="input" name="photos" type="file" accept="image/*" multiple />
          </Field>
          <Field label="기존 도면" hint="이미지, PDF, DWG, DXF">
            <input className="input" name="drawings" type="file" accept="image/*,.pdf,.dwg,.dxf" multiple />
          </Field>
        </Section>
      )}
    </StateForm>
  );
}

export function QuoteForm({
  action,
  saveDraft,
  discardDraft,
  quote,
  draft,
  customerFurniture,
  design,
  categories = QUOTE_CATEGORIES,
  requestedWorks = [],
}: {
  action: Action;
  saveDraft: (fd: FormData) => Promise<{ savedAt?: string; error?: string }>;
  discardDraft: () => Promise<void>;
  quote?: { items: QuoteItem[]; vat_included: number; duration_days: number; start_available: string; extra_conditions: string; note: string };
  /** 임시 저장본. 있으면 제출본보다 먼저 불러온다. */
  draft?: QuoteDraft;
  /** 사무실 요청: 고객 예산의 가구 포함 여부. 집 요청은 없음 */
  customerFurniture?: boolean;
  /** 고객 배치가 있는 요청이면 설계 제안을 받는다. files는 이미 올린 첨부 */
  design?: { mode: string; note: string; files: { id: number; name: string }[] };
  /** 공사 항목 세트(사무실 13·집 14) */
  categories?: readonly QuoteCategory[];
  /** 집 부분 공사에서 고객이 고른 공사. ‘요청 범위’로 표시한다. */
  requestedWorks?: string[];
}) {
  const [designMode, setDesignMode] = useState(draft?.designMode || design?.mode || "");
  // 임시 저장본 → 제출본 → 빈 양식 순으로 채운다.
  const initial: QuoteDraft | null =
    draft ??
    (quote
      ? { items: quote.items, vat: String(quote.vat_included), durationDays: String(quote.duration_days), startAvailable: quote.start_available, extraConditions: quote.extra_conditions, note: quote.note }
      : null);
  const [items, setItems] = useState<QuoteItem[]>(() =>
    categories.map((c) => initial?.items.find((it) => it.key === c.key) ?? { key: c.key, status: "included" as ItemStatus, amount: null, spec: "" }),
  );
  const [saved, setSaved] = useState<{ text: string; error?: boolean } | null>(draft ? { text: "임시 저장한 내용을 불러왔습니다" } : null);
  const [hasDraft, setHasDraft] = useState(!!draft);
  // 제출에 성공하면 서버가 임시 저장본을 지우므로 화면의 표시도 함께 지운다.
  const [state, dispatch, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const res = await action(prev, fd);
    if (res.ok) {
      setHasDraft(false);
      setSaved(null);
    }
    return res;
  }, {});
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const update = (key: string, patch: Partial<QuoteItem>) => setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  const totals = quoteTotals(items);

  const save = async () => {
    clearTimeout(timer.current);
    if (!form.current) return;
    setSaved({ text: "저장 중…" });
    // 임시 저장에는 첨부 파일을 보내지 않는다(제출할 때 올린다).
    const fd = new FormData(form.current);
    fd.delete("designFiles");
    const res = await saveDraft(fd);
    if (res.savedAt) {
      setHasDraft(true);
      setSaved({ text: `임시 저장됨 ${new Date(res.savedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}` });
    } else setSaved({ text: res.error ?? "저장하지 못했습니다", error: true });
  };
  // 입력이 멈추면 잠시 뒤 자동으로 저장한다.
  const schedule = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(save, 1500);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <form
      ref={form}
      className="space-y-5"
      onChange={schedule}
      onSubmit={(e) => {
        e.preventDefault();
        clearTimeout(timer.current);
        const fd = new FormData(e.currentTarget);
        startTransition(() => dispatch(fd));
      }}
    >
      {quote && (
        <p className="rounded-lg bg-sand px-3 py-2 text-xs leading-relaxed text-muted">
          고객에게는 마지막으로 제출한 제안이 보입니다. 여기서 고친 내용은 ‘제안 수정 제출’을 눌러야 반영되고, 이전 제출본은 이력에 남습니다.
        </p>
      )}
      {design && (
        <fieldset className="space-y-2 rounded-xl border border-line p-4" data-testid="design-fields">
          <legend className="px-1 text-sm font-semibold">설계 제안</legend>
          <p className="text-xs leading-relaxed text-muted">고객이 보낸 배치(평면·3D)를 기준으로, 그대로 시공할지 고칠 점을 제안할지 골라 주세요. 다른 업체는 이 제안을 볼 수 없습니다.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["as_is", "고객 배치대로 시공", "보낸 배치를 그대로 따릅니다."],
                ["proposal", "수정 제안", "바꾸고 싶은 점과 이유를 적고 도면·이미지를 붙입니다."],
              ] as const
            ).map(([k, label, desc]) => (
              <label key={k} className={`cursor-pointer rounded-lg border p-3 text-sm ${designMode === k ? "border-brand bg-brand-soft" : "border-line bg-white"}`}>
                <input type="radio" name="designMode" value={k} checked={designMode === k} onChange={() => setDesignMode(k)} className="sr-only" data-testid={`design-${k}`} />
                <b>{label}</b>
                <span className="mt-0.5 block text-xs text-muted">{desc}</span>
              </label>
            ))}
          </div>
          {designMode === "proposal" && (
            <>
              <textarea className="input" name="designNote" rows={3} defaultValue={draft?.designNote ?? design.note} placeholder="예: 협업 테이블을 탕비실 앞쪽으로 옮기면 출입구 앞이 넓어집니다." data-testid="design-note" />
              <input className="input" name="designFiles" type="file" accept="image/*,.pdf,.dwg,.dxf" multiple data-testid="design-files" />
              {design.files.length > 0 && <p className="text-xs text-muted">이미 올린 첨부: {design.files.map((f) => f.name).join(", ")}</p>}
            </>
          )}
        </fieldset>
      )}
      <Field label="제안 요약" hint="공사 방향, 강점, 고객 요청사항에 대한 답을 적어 주세요. 고객의 비교 화면에서 금액과 함께 보입니다.">
        <textarea className="input" name="note" rows={3} defaultValue={initial?.note} placeholder="예: 차음이 중요하다고 하셔서 회의실은 접합유리로 제안합니다." />
      </Field>
      <div className="overflow-x-auto">
        {/* 휴대폰(640px 미만)에서는 항목마다 카드로 보여 가로 스크롤 없이 작성한다(globals.css .quote-items). 입력 이름은 그대로라 임시 저장·제출은 같다. */}
        <table className="table-base quote-items sm:min-w-[720px]" data-testid="quote-items">
          <thead>
            <tr>
              <th className="w-40">공사 항목</th>
              <th className="w-40">구분</th>
              <th className="w-44">금액 (원)</th>
              <th>자재·사양</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c, n) => {
              const it = items.find((x) => x.key === c.key)!;
              const priced = it.status === "included" || it.status === "separate";
              return (
                <tr key={c.key} data-testid={`quote-item-${c.key}`}>
                  <td className="qi-name font-medium">
                    <span className="qi-no">
                      {n + 1}/{categories.length}
                    </span>
                    {c.label}
                    {requestedWorks.includes(c.key) && <span className="block text-xs font-normal text-brand" data-testid={`requested-${c.key}`}>요청 범위</span>}
                    {c.key === "furniture" && customerFurniture != null && <span className="block text-xs font-normal text-muted">고객 예산: 가구 {customerFurniture ? "포함" : "별도"}</span>}
                  </td>
                  <td>
                    <span className="qi-label">구분</span>
                    <select className="input" name={`status_${c.key}`} value={it.status} onChange={(e) => update(c.key, { status: e.target.value as ItemStatus })} aria-label={`${c.label} 구분`}>
                      {Object.entries(ITEM_STATUS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span className="qi-label">금액 (원)</span>
                    <input
                      className="input text-right disabled:bg-paper"
                      name={`amount_${c.key}`}
                      type="number"
                      min="0"
                      step="10000"
                      disabled={!priced}
                      value={priced ? (it.amount ?? "") : ""}
                      onChange={(e) => update(c.key, { amount: e.target.value === "" ? null : Number(e.target.value) })}
                      placeholder={priced ? "금액" : "—"}
                      aria-label={`${c.label} 금액`}
                    />
                  </td>
                  <td className="qi-spec">
                    <span className="qi-label">자재·사양</span>
                    <input className="input" name={`spec_${c.key}`} value={it.spec} onChange={(e) => update(c.key, { spec: e.target.value })} placeholder="자재, 규격, 범위" aria-label={`${c.label} 자재·사양`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="rounded-lg bg-sand p-3 text-sm">
        포함 항목 합계 <b>{won(totals.included)}</b>
        {totals.separate > 0 && <> · 별도 항목 {won(totals.separate)}</>}
        {totals.unresolved > 0 && <> · 미확정 {totals.unresolved}항목</>}
        <p className="mt-1 text-xs text-muted">
          구분의 뜻 — 포함: 합계에 들어감 · 별도: 공사는 하지만 합계 밖에서 따로 청구 · 현장 확인 필요: 공사는 하지만 금액 미정 · 해당 없음: 귀사 공사 범위에 없음. 금액을 확정할 수 없는 항목은 0원으로 넣지 말고 ‘현장 확인 필요’를 선택해 주세요.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="부가세">
          <select className="input" name="vat" defaultValue={initial?.vat ?? ""}>
            <option value="">선택</option>
            <option value="1">위 금액에 포함</option>
            <option value="0">별도 (10% 추가)</option>
          </select>
        </Field>
        <Field label="예상 공사 기간 (일)">
          <input className="input" name="durationDays" type="number" min="1" defaultValue={initial?.durationDays} />
        </Field>
        <Field label="착공 가능일">
          <input className="input" name="startAvailable" type="date" defaultValue={initial?.startAvailable} />
        </Field>
        <Field label="추가비용 발생 조건" className="sm:col-span-3" hint="예: 야간 작업, 배관 연장, 관리 규정에 따른 공기 연장. 없으면 ‘없음’이라고 적어 주세요.">
          <textarea className="input" name="extraConditions" rows={2} defaultValue={initial?.extraConditions} />
        </Field>
      </div>
      {state.error && (
        <p role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.ok && <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand">{state.ok}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "처리 중…" : quote ? "제안 수정 제출" : "제안 제출"}
        </button>
        <button type="button" className="btn" onClick={save} disabled={pending}>
          임시 저장
        </button>
        {hasDraft && (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={async () => {
              clearTimeout(timer.current);
              await discardDraft();
              window.location.reload();
            }}
          >
            임시 저장 버리기
          </button>
        )}
        {saved && (
          <span role="status" className={`text-xs ${saved.error ? "text-danger" : "text-muted"}`}>
            {saved.text}
            {!saved.error && " · 고객에게는 보이지 않습니다"}
          </span>
        )}
      </div>
    </form>
  );
}
