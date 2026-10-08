"use client";

import BidModeField from "../BidModeField";
import { startTransition, useActionState, useState, type ReactNode } from "react";
import type { FormState } from "@/lib/actions";

type Action = (state: FormState, fd: FormData) => Promise<FormState>;

export interface BasisOption {
  id: number;
  no: number;
  label: string;
  note: string;
  date: string;
  furniture: boolean;
  thumb: ReactNode;
  sent: boolean;
}

export interface RefOption {
  id: number;
  title: string;
  photo: number | null;
  checked: boolean;
}

/** 시공 제안 요청서. 요청 전에는 ‘요청 보내기’와 ‘저장만’, 요청 뒤에는 ‘저장’만 있다. */
export default function RequestForm({
  action,
  requested,
  bases,
  basisId,
  values,
  refs,
  bid,
}: {
  action: Action;
  requested: boolean;
  bid?: { mode: string; cap: number };
  bases: BasisOption[];
  basisId: number;
  values: { region: string; address: string; budget_min: number | null; budget_max: number | null; desired_start: string; desired_movein: string; notes: string; work_scope: string };
  refs: RefOption[];
}) {
  const [state, dispatch, pending] = useActionState(action, {});
  const [basis, setBasis] = useState(basisId);
  const chosen = bases.find((b) => b.id === basis) ?? bases[0];
  return (
    <form
      className="space-y-5"
      data-testid="request-form"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => dispatch(fd));
      }}
    >
      <section className="card">
        <h2 className="h-section">1. 업체에 보낼 배치</h2>
        <p className="mb-3 text-xs leading-relaxed text-muted">고른 배치(실제 치수·출입문·창·기둥과 가구 위치)가 하나의 기준으로 고정돼 모든 업체에 똑같이 전달돼요. 보낸 뒤에 배치를 고쳐도 ‘변경 내용 보내기’를 누르기 전까지 업체가 받은 기준은 그대로예요.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="보낼 배치">
          {bases.map((b) => (
            <label key={b.id} className={`cursor-pointer overflow-hidden rounded-xl border bg-white transition ${basis === b.id ? "border-brand shadow-[0_0_0_1px_var(--color-brand)]" : "border-line hover:border-muted"}`} data-testid={`basis-${b.no}`}>
              <input type="radio" name="basis" value={b.id} checked={basis === b.id} onChange={() => setBasis(b.id)} className="sr-only" />
              <span className="block border-b border-line">{b.thumb}</span>
              <span className="block p-3 text-sm">
                <b>버전 {b.no}</b> · {b.label}
                {b.sent && <span className="badge ml-1.5 border-brand/30 bg-brand-soft text-brand">업체에 보낸 배치</span>}
                <span className="mt-0.5 block text-xs text-muted">
                  {b.date}
                  {b.note && ` · ${b.note}`}
                </span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="card grid gap-4 sm:grid-cols-2">
        <h2 className="h-section sm:col-span-2">2. 위치와 조건</h2>
        <label className="block">
          <span className="label">지역 (시·구)</span>
          <input className="input" name="region" defaultValue={values.region} placeholder="예: 서울 성동구" required data-testid="req-region" />
          <span className="mt-1 block text-xs text-muted">참여 업체에 공개돼요.</span>
        </label>
        <label className="block">
          <span className="label">상세 주소 · 선택</span>
          <input className="input" name="address" defaultValue={values.address} placeholder="도로명 주소, 층" />
          <span className="mt-1 block text-xs text-muted">현장 방문을 요청한 업체에만 공개돼요.</span>
        </label>
        <label className="block">
          <span className="label">예산 최소 (만원)</span>
          <input className="input" name="budgetMin" type="number" min={0} step={100} defaultValue={values.budget_min ?? ""} placeholder="예: 4000" />
        </label>
        <label className="block">
          <span className="label">예산 최대 (만원)</span>
          <input className="input" name="budgetMax" type="number" min={0} step={100} defaultValue={values.budget_max ?? ""} placeholder="예: 6000" />
        </label>
        <label className="block">
          <span className="label">희망 착공일</span>
          <input className="input" name="desiredStart" type="date" defaultValue={values.desired_start} />
        </label>
        <label className="block">
          <span className="label">희망 입주일</span>
          <input className="input" name="desiredMovein" type="date" defaultValue={values.desired_movein} />
        </label>
        <label key={chosen?.id} className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="furnitureIncluded" defaultChecked={chosen?.furniture ?? true} className="size-4 accent-brand" /> 가구도 견적에 넣어 주세요
        </label>
        <label className="block sm:col-span-2">
          <span className="label">원하는 공사 내용 · 선택</span>
          <textarea className="input" name="workScope" rows={2} defaultValue={values.work_scope} placeholder="예: 바닥·조명 교체, 회의실 유리 칸막이" />
        </label>
        <label className="block sm:col-span-2">
          <span className="label">기타 요청 · 선택</span>
          <textarea className="input" name="notes" rows={2} defaultValue={values.notes} />
        </label>
      </section>

      <section className="card space-y-4">
        <h2 className="h-section">3. 참고 자료 · 선택</h2>
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
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">현장 사진</span>
            <input className="input" name="photos" type="file" accept="image/*" multiple />
          </label>
          <label className="block">
            <span className="label">기존 도면</span>
            <input className="input" name="drawings" type="file" accept="image/*,.pdf,.dwg,.dxf" multiple />
          </label>
        </div>
        <p className="text-xs leading-relaxed text-muted">업체에는 지역, 공간 치수와 배치(평면·3D), 예산·일정, 사진·도면이 보여요. 공간 이름, 상세 주소, 연락처는 현장 방문을 요청한 업체에만 공개돼요.</p>
      </section>
      {!requested && <BidModeField mode={bid?.mode} cap={bid?.cap} />}

      {state.error && (
        <p role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {requested ? (
          <button className="btn btn-primary" name="intent" value="save" disabled={pending} data-testid="req-save">
            {pending ? "저장 중…" : "저장"}
          </button>
        ) : (
          <>
            <button className="btn btn-primary" name="intent" value="send" disabled={pending} data-testid="req-send">
              {pending ? "보내는 중…" : "이 배치로 시공 제안 요청"}
            </button>
            <button className="btn" name="intent" value="save" disabled={pending} data-testid="req-save">
              저장만 하기
            </button>
          </>
        )}
        <span className="text-xs text-muted">{requested ? "저장한 뒤 내 공간 화면에서 ‘변경 내용 보내기’를 눌러야 업체에 전달돼요." : "운영자가 조건에 맞는 업체를 골라 같은 요청을 보내요. 업체끼리는 서로의 금액과 제안을 볼 수 없어요."}</span>
      </div>
    </form>
  );
}
