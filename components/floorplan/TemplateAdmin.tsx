"use client";
import {useActionState} from "react";
import {registerFloorplanTemplate} from "@/lib/floorplan-actions";
export default function TemplateAdmin({projects}:{projects:{id:number;title:string}[]}) {
  const [state,dispatch,pending]=useActionState(registerFloorplanTemplate,{});
  return <form action={dispatch} className="card space-y-4" data-testid="template-admin-form">
    <h2 className="text-lg font-bold">검토한 평면을 등록 도면으로 공개</h2>
    <p className="text-sm text-muted">집 전체 평면의 벽·문·창·방·고정 구조물만 복사해요. 고객의 사진·가구·연락처·주소·요청 내용은 가져오지 않아요.</p>
    <label className="block text-sm">원본 프로젝트<select className="input mt-1" name="project" required><option value="">평면이 있는 주거 프로젝트 선택</option>{projects.map(p=><option key={p.id} value={p.id}>{p.id} · {p.title}</option>)}</select></label>
    <div className="grid gap-3 sm:grid-cols-2">{[{name:"complex",label:"단지명",max:80},{name:"address",label:"단지 도로명 주소 (동·호 제외)",max:150},{name:"unit",label:"타입 (예: 84A · 확장형)",max:40},{name:"source",label:"도면 출처",max:200}].map(f=><label key={f.name} className="text-sm">{f.label}<input name={f.name} maxLength={f.max} required className="input mt-1"/></label>)}<label className="text-sm">전용면적 (㎡)<input type="number" name="area" required min={5} max={1000} step="0.01" className="input mt-1"/></label></div>
    <label className="flex gap-2 text-sm"><input type="checkbox" name="rights" required className="mt-1 accent-brand"/>도면 사용 권한을 확인했고, 공개 구조·라벨·출처에서 개인정보를 제외했어요.</label>
    {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}{state.ok && <p role="status" className="text-sm text-brand">{state.ok}</p>}
    <button className="btn btn-primary" disabled={pending || !projects.length}>{pending?"등록 중…":"등록 도면 공개"}</button>
  </form>;
}
