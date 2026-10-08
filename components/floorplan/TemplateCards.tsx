"use client";
import { useActionState, useState } from "react";
import { importFloorplan } from "@/lib/actions";
import HouseView from "@/components/house/HouseView";
import type { HouseModel } from "@/lib/space/house";
export interface TemplateCard { id:number; complex:string; address:string; unit_type:string; area:number; source_note:string; house:HouseModel }
function TemplateChoice({t,project}:{t:TemplateCard;project?:number}) {
  const [state,dispatch,pending]=useActionState(importFloorplan,{});
  const [open,setOpen]=useState(false);
  return <article className="card space-y-3" data-testid={`template-${t.id}`}>
    <h2 className="text-lg font-bold">{t.complex} · {t.unit_type}</h2><p className="text-sm text-muted">{t.address} · 전용 {t.area}㎡</p><p className="text-xs text-muted">도면 출처: {t.source_note}</p>
    <button type="button" className="btn btn-sm" aria-expanded={open} onClick={()=>setOpen(!open)} data-testid={`template-preview-${t.id}`}>{open?"도면 접기":"평면·3D 확인"}</button>
    {open && <><HouseView house={t.house} compact/><form action={dispatch} className="space-y-3">
      <input type="hidden" name="template" value={t.id}/>{project && <input type="hidden" name="project" value={project}/>}
      {!project && <label className="block text-sm">공간 이름<input name="title" className="input mt-1" defaultValue="우리 집" maxLength={60}/></label>}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirmed" required className="mt-1 accent-brand" data-testid="template-confirm"/>이 타입의 구조·치수가 내 집과 같은지 확인했어요. 다른 부분은 배치 편집기에서 고칠게요.</label>
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      <button className="btn btn-primary w-full sm:w-auto" disabled={pending} data-testid="template-import">{pending?"가져오는 중…":"이 도면으로 내 공간 만들기"}</button>
    </form></>}
  </article>;
}
export default function TemplateCards({templates,project}:{templates:TemplateCard[];project?:number}) {
  return <div className="space-y-4">{templates.map(t=><TemplateChoice key={t.id} t={t} project={project}/>)}</div>;
}
