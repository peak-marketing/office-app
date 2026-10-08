"use client";

import ReferenceInput from "@/components/community/ReferenceInput";
import AddressIntake, { type AddressImport } from "@/components/address/AddressIntake";
import IntakeSpaceKind from "@/components/IntakeSpaceKind";
import type {PostReference} from "@/lib/post-refs";
import BidModeField from "../BidModeField";
import { startTransition, useActionState, useState } from "react";
import type { FormState } from "@/lib/actions";
import { AREA_BASIS, HOME_SCOPES, HOME_SPACES, HOME_TYPES, HOME_WORKS, OCCUPANCY, type HomeInput } from "@/lib/home";

type Action = (state: FormState, fd: FormData) => Promise<FormState>;

export interface HomeValues {
  title: string;
  region: string;
  address: string;
  budget_min: number | null;
  budget_max: number | null;
  desired_start: string;
  desired_movein: string;
  notes: string;
  work_scope: string;
}

export interface HomeRefOption {
  id: number;
  title: string;
  photo: number | null;
  checked: boolean;
}

const STEPS = ["집 정보", "공사 범위", "가진 자료", "일정·예산"] as const;

/**
 * 집 상담 신청서. mode="new"는 4단계로 나눠 묻고, "edit"는 한 화면에 모두 보여 준다.
 * 필수는 주거 유형·지역·공사 범위뿐이다. 나머지는 비워 두면 ‘입력하지 않음’으로 전달된다.
 */
export default function HomeForm({
  action,
  mode,
  requested = false,
  home,
  values,
  refs = [],
  roomCount = 0,
  bid,
  reference,
}: {
  action: Action;
  reference?: PostReference;
  mode: "new" | "edit";
  requested?: boolean;
  home?: HomeInput;
  values?: Partial<HomeValues>;
  refs?: HomeRefOption[];
  roomCount?: number;
  bid?: { mode: string; cap: number };
}) {
  const [state, dispatch, pending] = useActionState(action, {});
  const [step, setStep] = useState(0);
  const [type, setType] = useState<string>(home?.homeType ?? "");
  const [region, setRegion] = useState(values?.region ?? "");
  const [address, setAddress] = useState(values?.address ?? "");
  const [area, setArea] = useState(home?.area == null ? "" : String(home.area));
  const [areaUnit, setAreaUnit] = useState(home?.areaUnit ?? "pyeong");
  const [areaBasis, setAreaBasis] = useState(home?.areaBasis ?? "unknown");
  const [builtYear, setBuiltYear] = useState(typeof home?.builtYear === "number" ? String(home.builtYear) : "");
  const [scope, setScope] = useState<string>(home?.scope ?? "");
  const [works, setWorks] = useState<string[]>(home?.works ?? []);
  const [yearUnknown, setYearUnknown] = useState(home?.builtYear === "unknown");
  const [localError, setLocalError] = useState<string | null>(null);
  const stepped = mode === "new";
  const show = (i: number) => !stepped || step === i;

  const stepError = (i: number) => {
    if (i === 0 && !type) return "주거 유형을 골라 주세요.";
    if (i === 0 && !region.trim()) return "지역(시·구)을 입력해 주세요.";
    if (i === 1 && !scope) return "공사 범위를 골라 주세요. 정하지 못했으면 ‘아직 모름’을 고르세요.";
    if (i === 1 && scope === "partial" && !works.length) return "부분 공사는 원하는 공사를 하나 이상 골라 주세요.";
    return null;
  };
  const next = () => {
    const err = stepError(step);
    setLocalError(err);
    if (!err) setStep((s) => s + 1);
  };

  const choice = (name: string, value: string, label: string, desc: string, current: string, set: (v: string) => void, testid: string) => (
    <label className={`intake-option ${current === value ? "is-active" : ""}`} data-testid={testid}>
      <input type="radio" name={name} value={value} checked={current === value} onChange={() => set(value)} className="sr-only" />
      <span className="min-w-0">
        <b className="block text-sm">{label}</b>
        {desc && <span className="mt-0.5 block text-xs leading-relaxed text-muted">{desc}</span>}
      </span>
    </label>
  );
  const chip = "filter-chip cursor-pointer has-checked:border-brand has-checked:bg-brand-soft has-checked:text-brand";

  return (
    <form
      className="space-y-5"
      data-testid="home-form"
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter;
        for (const i of [0, 1]) {
          const err = stepError(i);
          if (err) {
            setLocalError(err);
            if (stepped) setStep(i);
            return;
          }
        }
        setLocalError(null);
        const fd = new FormData(e.currentTarget, submitter);
        startTransition(() => dispatch(fd));
      }}
    >
      <ReferenceInput reference={reference}/>
      {stepped && <div hidden={step !== 0}><IntakeSpaceKind kind="home" /></div>}
      {stepped && (
        <ol className="flex flex-wrap gap-4" aria-label="단계">
          {STEPS.map((label, i) => (
            <li key={label} className={`space-step ${i === step ? "is-on" : i < step ? "is-done" : ""}`} data-testid={`home-step-${i + 1}`}>
              <b>{i < step ? "✓" : i + 1}</b>
              {label}
            </li>
          ))}
        </ol>
      )}

      {/* 1. 집 정보 */}
      <section className={show(0) ? "card space-y-4" : "hidden"} aria-hidden={!show(0)}>
        <div>
          <h2 className="h-section">집 정보</h2>
          <p className="text-xs leading-relaxed text-muted">주거 유형과 지역만 꼭 필요해요. 나머지는 아는 것만 넣고, 모르면 비워 두세요. 비운 칸은 업체에 ‘입력하지 않음’으로 보여요.</p>
        </div>
        {stepped && <AddressIntake onApply={(value: AddressImport) => {
          setRegion(value.region); setAddress(value.address);
          setArea(value.areaM2 === null ? "" : String(value.areaM2));
          setAreaUnit(value.areaM2 === null ? "pyeong" : "m2");
          setAreaBasis(value.areaM2 === null ? "unknown" : "exclusive");
          setBuiltYear(value.year === null ? "" : String(value.year)); setYearUnknown(false); setLocalError(null);
        }} />}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="주거 유형">
          {Object.entries(HOME_TYPES).map(([k, label]) => choice("homeType", k, label, "", type, setType, `home-type-${k}`))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">지역 (시·구)</span>
            <input className="input" name="region" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="예: 서울 마포구" data-testid="home-region" />
            <span className="mt-1 block text-xs text-muted">참여 업체에 공개돼요.</span>
          </label>
          <div>
            <span className="label">면적 · 선택</span>
            <div className="flex gap-2">
              <input className="input min-w-0 flex-1" name="area" type="number" min={1} step="any" value={area} onChange={(e) => setArea(e.target.value)} placeholder="예: 24" data-testid="home-area" />
              <select className="input w-20 shrink-0" name="areaUnit" value={areaUnit} onChange={(e) => setAreaUnit(e.target.value as typeof areaUnit)} aria-label="면적 단위" data-testid="home-area-unit">
                <option value="pyeong">평</option>
                <option value="m2">㎡</option>
              </select>
              <select className="input w-28 shrink-0" name="areaBasis" value={areaBasis} onChange={(e) => setAreaBasis(e.target.value as typeof areaBasis)} aria-label="면적 기준" data-testid="home-area-basis">
                {Object.entries(AREA_BASIS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <span className="mt-1 block text-xs text-muted">아파트 ‘평형’은 보통 공급면적이에요. 기준을 모르면 그대로 두세요.</span>
          </div>
          <label className="block">
            <span className="label">방 수 · 선택</span>
            <input className="input" name="rooms" type="number" min={0} max={20} defaultValue={home?.rooms ?? ""} data-testid="home-rooms" />
          </label>
          <label className="block">
            <span className="label">욕실 수 · 선택</span>
            <input className="input" name="baths" type="number" min={0} max={10} defaultValue={home?.baths ?? ""} data-testid="home-baths" />
          </label>
          <div>
            <span className="label">준공 연도 · 선택</span>
            <div className="flex items-center gap-3">
              <input className="input min-w-0 flex-1" name="builtYear" type="number" min={1900} max={2100} value={builtYear} onChange={(e) => setBuiltYear(e.target.value)} disabled={yearUnknown} placeholder="예: 2008" data-testid="home-year" />
              <label className="flex shrink-0 items-center gap-1.5 text-sm">
                <input type="checkbox" name="builtUnknown" checked={yearUnknown} onChange={(e) => setYearUnknown(e.target.checked)} className="size-4 accent-brand" data-testid="home-year-unknown" /> 모름
              </label>
            </div>
            {stepped && <span className="mt-1 block text-xs text-muted">주소 조회로 불러온 연도는 건축물대장의 사용승인 연도예요.</span>}
          </div>
          <fieldset>
            <legend className="label">거주 상태 · 선택</legend>
            <div className="flex flex-wrap gap-2">
              {Object.entries(OCCUPANCY).map(([k, label]) => (
                <label key={k} className={chip} data-testid={`home-occ-${k}`}>
                  <input type="radio" name="occupancy" value={k} defaultChecked={home?.occupancy === k} className="sr-only" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block sm:col-span-2">
            <span className="label">관리 규약·공사 가능 시간 · 선택</span>
            <textarea className="input" name="rules" rows={2} defaultValue={home?.rules ?? ""} placeholder="예: 평일 9~18시만 공사 가능, 관리사무소 사전 신고" data-testid="home-rules" />
            <span className="mt-1 block text-xs text-muted">아파트·오피스텔은 관리 규약이 있는 경우가 많아요. 모르면 비워 두면 업체가 확인해요.</span>
          </label>
        </div>
      </section>

      {/* 2. 공사 범위 */}
      <section className={show(1) ? "card space-y-4" : "hidden"} aria-hidden={!show(1)}>
        <div>
          <h2 className="h-section">공사 범위</h2>
          <p className="text-xs leading-relaxed text-muted">정하지 못했으면 ‘아직 모름’을 골라 상담부터 받아도 돼요.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="공사 범위">
          {choice("scope", "full", HOME_SCOPES.full, "집 전체를 고쳐요.", scope, setScope, "home-scope-full")}
          {choice("scope", "partial", HOME_SCOPES.partial, "원하는 공사만 골라요.", scope, setScope, "home-scope-partial")}
          {choice("scope", "undecided", HOME_SCOPES.undecided, "업체 상담을 받고 정해요.", scope, setScope, "home-scope-undecided")}
        </div>
        {scope === "partial" && (
          <fieldset data-testid="home-works">
            <legend className="label">원하는 공사</legend>
            <div className="flex flex-wrap gap-2">
              {HOME_WORKS.map((w) => (
                <label key={w.key} className={chip} data-testid={`home-work-${w.key}`}>
                  <input
                    type="checkbox"
                    name="works"
                    value={w.key}
                    checked={works.includes(w.key)}
                    onChange={(e) => setWorks((cur) => (e.target.checked ? [...cur, w.key] : cur.filter((k) => k !== w.key)))}
                    className="sr-only"
                  />
                  {w.label}
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted">고른 공사는 업체 견적서에 ‘요청 범위’로 표시돼요. 철거·폐기물 등은 업체가 필요에 따라 적어요.</p>
          </fieldset>
        )}
        <fieldset>
          <legend className="label">공사할 공간 · 선택</legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(HOME_SPACES).map(([k, label]) => (
              <label key={k} className={chip} data-testid={`home-space-${k}`}>
                <input type="checkbox" name="spaces" value={k} defaultChecked={home?.spaces.includes(k as never)} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block">
          <span className="label">원하는 공사 내용 · 선택</span>
          <textarea className="input" name="workScope" rows={2} defaultValue={values?.work_scope ?? ""} placeholder="예: 욕실 타일과 수전 교체, 주방 상판 교체" data-testid="home-workscope" />
        </label>
      </section>

      {/* 3. 가진 자료 */}
      <section className={show(2) ? "card space-y-4" : "hidden"} aria-hidden={!show(2)}>
        <div>
          <h2 className="h-section">가진 자료 · 모두 선택</h2>
          <p className="text-xs leading-relaxed text-muted" data-testid="home-no-files">도면이나 치수, 사진이 없어도 신청할 수 있어요. 업체가 상담·현장 방문에서 확인해요.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">현장 사진</span>
            <input className="input" name="photos" type="file" accept="image/*" multiple data-testid="home-photos" />
          </label>
          <label className="block">
            <span className="label">도면</span>
            <input className="input" name="drawings" type="file" accept="image/*,.pdf,.dwg,.dxf" multiple data-testid="home-drawings" />
          </label>
        </div>
        <p className="rounded-xl bg-sand p-3 text-xs leading-relaxed text-muted" data-testid="home-room-hint">
          치수를 아는 방이 있으면 {mode === "new" ? "신청한 뒤" : ""} ‘방 배치’에서 방 한 칸씩 가구 배치를 그려 붙일 수 있어요(최대 5개). 방마다 따로 그린 참고 배치이며, 집 전체 도면이 되지는 않아요.
          {roomCount > 0 && ` 지금 방 배치 ${roomCount}개가 있어요.`}
        </p>
        {refs.length > 0 && (
          <div>
            <input type="hidden" name="refsShown" value="1" />
            <p className="label">저장한 공간 가운데 참고할 것</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {refs.map((r) => (
                <label key={r.id} className="flex items-center gap-3 rounded-xl border border-line bg-white p-2 text-sm">
                  <input type="checkbox" name="refCase" value={r.id} defaultChecked={r.checked} className="size-4 shrink-0 accent-brand" />
                  {/* eslint-disable-next-line @next/next/no-img-element -- 업로드 파일 */}
                  {r.photo ? <img src={`/files/${r.photo}`} alt="" className="size-12 shrink-0 rounded-lg object-cover" /> : <span className="size-12 shrink-0 rounded-lg bg-sand" />}
                  <span className="line-clamp-2 min-w-0">{r.title}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 4. 일정·예산 */}
      <section className={show(3) ? "card grid gap-4 sm:grid-cols-2" : "hidden"} aria-hidden={!show(3)}>
        <h2 className="h-section sm:col-span-2">일정·예산 · 모두 선택</h2>
        <label className="block">
          <span className="label">예산 최소 (만원)</span>
          <input className="input" name="budgetMin" type="number" min={0} step={100} defaultValue={values?.budget_min ?? ""} placeholder="예: 1500" />
        </label>
        <label className="block">
          <span className="label">예산 최대 (만원)</span>
          <input className="input" name="budgetMax" type="number" min={0} step={100} defaultValue={values?.budget_max ?? ""} placeholder="예: 3000" />
        </label>
        <label className="block">
          <span className="label">희망 착공일</span>
          <input className="input" name="desiredStart" type="date" defaultValue={values?.desired_start ?? ""} />
        </label>
        <label className="block">
          <span className="label">희망 입주일</span>
          <input className="input" name="desiredMovein" type="date" defaultValue={values?.desired_movein ?? ""} />
        </label>
        <label className="block">
          <span className="label">상세 주소</span>
          <input className="input" name="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="도로명 주소, 동·호수" />
          <span className="mt-1 block text-xs text-muted">현장 방문을 요청한 업체에만 공개돼요.</span>
        </label>
        <label className="block">
          <span className="label">요청 이름</span>
          <input className="input" name="title" defaultValue={values?.title ?? ""} placeholder="비우면 ‘아파트 · 서울 마포구’처럼 붙여요" />
          <span className="mt-1 block text-xs text-muted">업체에는 보이지 않아요.</span>
        </label>
        <label className="block sm:col-span-2">
          <span className="label">기타 요청</span>
          <textarea className="input" name="notes" rows={2} defaultValue={values?.notes ?? ""} />
        </label>
        <p className="text-xs leading-relaxed text-muted sm:col-span-2">업체에는 지역, 집 정보, 공사 범위, 예산·일정, 사진·도면, 방 배치가 보여요. 요청 이름, 상세 주소, 연락처는 현장 방문을 요청한 업체에만 공개돼요. 업체끼리는 서로의 금액과 제안을 볼 수 없어요.</p>
        {!requested && (
          <div className="sm:col-span-2">
            <BidModeField mode={bid?.mode} cap={bid?.cap} />
          </div>
        )}
      </section>

      {(localError || state.error) && (
        <p role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-danger" data-testid="home-error">
          {localError ?? state.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {stepped && step > 0 && (
          <button type="button" className="btn" onClick={() => setStep((s) => s - 1)} data-testid="home-prev">
            이전
          </button>
        )}
        {stepped && step < STEPS.length - 1 ? (
          <button key="next" type="button" className="btn btn-primary" onClick={next} data-testid="home-next">
            다음
          </button>
        ) : requested ? (
          <button key="save" className="btn btn-primary" name="intent" value="save" disabled={pending} data-testid="home-save">
            {pending ? "저장 중…" : "저장"}
          </button>
        ) : (
          <>
            <button key="send" className="btn btn-primary" name="intent" value="send" disabled={pending} data-testid="home-send">
              {pending ? "보내는 중…" : "상담 요청 보내기"}
            </button>
            <button key="save" className="btn" name="intent" value="save" disabled={pending} data-testid="home-save">
              저장만 하기
            </button>
          </>
        )}
        {(!stepped || step === STEPS.length - 1) && (
          <span className="text-xs text-muted">{requested ? "저장한 뒤 ‘변경 내용 보내기’를 눌러야 업체에 전달돼요." : "운영자가 주거 시공이 가능한 업체를 골라 같은 요청을 보내요."}</span>
        )}
      </div>
    </form>
  );
}
