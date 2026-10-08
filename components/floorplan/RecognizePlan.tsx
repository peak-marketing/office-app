"use client";
/* eslint-disable @next/next/no-img-element -- Local customer-selected Blob previews cannot use image optimization. */
import Link from "next/link";
import { useActionState, useMemo, useState, useTransition } from "react";
import { analyzeFloorplan } from "@/lib/floorplan-actions";
import { importFloorplan } from "@/lib/actions";
import { type PlanRecognition } from "@/lib/floorplan/geometry";
import HouseView from "@/components/house/HouseView";
import DrawingInput, { type Drawing } from "./DrawingInput";
import {referenceRecognition,sourceHouse} from "@/lib/floorplan/reference";
import type {PlanSource} from "@/lib/floorplan/catalog";

export interface RecognitionResult { id: number; result: PlanRecognition; iw: number; ih: number; image: string; sourceId?:string }
export default function RecognizePlan({ enabled, project, initial,source,selection }: { enabled: boolean; project?: number; initial?: RecognitionResult;source?:PlanSource;selection?:string }) {
  const [drawing,setDrawing]=useState<Drawing|null>(null), [result,setResult]=useState<RecognitionResult|null>(initial??null);
  const [width,setWidth]=useState(initial?.result.widthMm ? String(initial.result.widthMm):""),[height,setHeight]=useState("2400"),[error,setError]=useState("");
  const [busy,start]=useTransition();
  const reference=Boolean(source&&!drawing&&referenceRecognition(source.id));
  const [saved,dispatch,saving]=useActionState(importFloorplan,{});
  const preview=useMemo(()=>{
    if(!result || !width.trim())return null;
    try{return {house:sourceHouse(result.result,result.iw,result.ih,Number(width),Number(height),0,result.sourceId)};}
    catch(e){return {error:e instanceof Error?e.message:"치수를 확인해 주세요."};}
  },[result,width,height]);
  const trace=project?`/projects/${project}/house/new?from=trace`:"/spaces/home?from=trace";
  return <div className="space-y-5" data-testid="recognition-studio">
    {!enabled && !reference && <p className="rounded-xl bg-warn-soft p-4 text-sm text-warn" data-testid="ai-unavailable">AI 도면 인식은 아직 연결 전이에요. API 연결 후 사용할 수 있고, 지금은 <Link className="underline" href={trace}>도면 따라 그리기</Link>로 만들 수 있어요.</p>}
    <section className="card space-y-4">
      <h2 className="text-lg font-bold">1. {source&&!drawing?"선택한 아파트 도면":"도면 올리기"}</h2>
      {source&&!drawing&&<div className="space-y-2" data-testid="selected-source"><p className="font-semibold">{source.complex} · {source.unitType}</p><p className="text-sm text-muted">{source.address} · {source.variant}</p><img src={`/api/floorplans/source/${source.id}`} className="w-full rounded-xl border border-line" alt="선택한 공개 도면"/><a href={source.pageUrl} target="_blank" rel="noreferrer" className="text-xs text-brand underline">원본 출처 확인</a></div>}
      <p className="text-sm text-muted">벽과 방이 보이는 평면도를 올려 주세요. PDF는 분석할 한 쪽을 골라요. JPG·PNG·WEBP·PDF, 최대 10MB.</p>
      <fieldset disabled={busy || saving}><DrawingInput onChange={d=>{setDrawing(d);setResult(null);setWidth("");setError("");}} /></fieldset>
      {drawing && <img src={drawing.url} alt="분석할 도면" className="max-h-80 w-full rounded-xl border border-line object-contain" data-testid="recognition-image" />}
      <form onSubmit={e=>{
        e.preventDefault();if(!drawing&&!source)return;
        const fd=new FormData(e.currentTarget);
        if(drawing)fd.set("image",new File([drawing.blob],"floorplan.png",{type:"image/png"}));
        else if(source){fd.set("source",source.id);fd.set("sourceConfirmed","yes");if(selection)fd.set("selection",selection);}
        if(project)fd.set("project",String(project));
        setError("");start(async()=>{const r=await analyzeFloorplan(fd);if("error" in r){setError(r.error??"도면 인식에 실패했어요.");return;}setResult(r);setWidth(r.result.widthMm?String(r.result.widthMm):"");});
      }} className="space-y-3">
        {!reference&&<label className="flex items-start gap-2 text-xs leading-relaxed text-muted"><input type="checkbox" name="consent" value="yes" required className="mt-0.5 accent-brand" data-testid="ai-consent" />도면 이미지를 OpenAI에 전송해 분석하는 데 동의해요. 주소·성명은 도면에서 지우고 올려 주세요. 이미지는 내 계정에 비공개로 보관돼요.</label>}
        {reference&&<p className="text-sm text-muted" data-testid="reference-method">원본과 대조한 참고 배치를 불러와요. AI 분석을 다시 요청하지 않으며, 실제 치수는 다음 단계에서 확인해 주세요.</p>}
        <button className="btn btn-primary w-full sm:w-auto" disabled={(!enabled&&!reference) || (!drawing&&!source) || busy || saving} data-testid="ai-analyze">{busy?"도면 읽는 중…":reference?"참고 배치 불러오고 치수 확인":"AI로 벽·문·창 읽기"}</button>
        {busy && <p role="status" className="text-xs text-muted">도면의 벽·문·창을 읽고 있어요. 복잡한 도면은 최대 4분 정도 걸릴 수 있어요.</p>}
      </form>
      {error && <p role="alert" className="text-sm text-danger" data-testid="ai-error">{error} <Link href={trace} className="underline">직접 따라 그리기</Link></p>}
    </section>
    {result && <section className="card space-y-4" data-testid="recognition-review">
      <h2 className="text-lg font-bold">2. 인식 결과와 실제 치수 확인</h2>
      <p className="text-sm text-muted">초록색은 바깥 벽, 파란색은 내부 벽, 주황색은 문·창이에요. {reference?"원본을 대조한 참고 배치예요.":"AI 인식 초안이에요."} 위치·폭·누락을 원본과 비교해 주세요. 가로를 확인하면 같은 축척으로 세로와 벽 위치를 계산해요.</p>
      <svg viewBox={`0 0 ${result.iw} ${result.ih}`} className="max-h-[420px] w-full rounded-xl border border-line" data-testid="recognition-overlay">
        <image href={result.image} width={result.iw} height={result.ih} />
        <polygon points={result.result.outline.map(p=>`${p[0]*result.iw},${p[1]*result.ih}`).join(" ")} fill="#00a98710" stroke="#00876d" strokeWidth="3" vectorEffect="non-scaling-stroke" />
        {result.result.walls.map((w,i)=><line key={i} x1={w.a[0]*result.iw} y1={w.a[1]*result.ih} x2={w.b[0]*result.iw} y2={w.b[1]*result.ih} stroke="#287cc4" strokeWidth="3" vectorEffect="non-scaling-stroke" />)}
        {result.result.openings.map((o,i)=><line key={i} x1={o.a[0]*result.iw} y1={o.a[1]*result.ih} x2={o.b[0]*result.iw} y2={o.b[1]*result.ih} stroke="#e58727" strokeWidth="5" vectorEffect="non-scaling-stroke" />)}
      </svg>
      {result.result.dimensionEvidence && <p className="text-xs text-muted">도면에서 읽은 치수 근거: {result.result.dimensionEvidence} · 실제 가로를 직접 확인해 주세요.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">바깥 벽 안쪽 전체 가로 (mm)<input className="input mt-1" inputMode="numeric" value={width} onChange={e=>setWidth(e.target.value)} data-testid="ai-width" placeholder="예: 10000" /></label>
        <label className="text-sm">천장 높이 (mm)<input className="input mt-1" inputMode="numeric" value={height} onChange={e=>setHeight(e.target.value)} data-testid="ai-height" /></label>
      </div>
      {preview?.error && <p role="alert" className="text-sm text-danger">{preview.error}</p>}
      {preview?.house && <HouseView house={preview.house} underlayUrl={result.image} compact />}
      <ul className="space-y-1 text-xs text-warn">{result.result.warnings.map((w,i)=><li key={i}>{w}</li>)}<li>벽 두께·문 열림 방향은 편집 시작값이에요. 도면과 다른 부분은 다음 편집기에서 고쳐 주세요. 구조·시공 가능 여부를 판정하지 않아요.</li></ul>
      <form action={dispatch} className="space-y-3">
        <input type="hidden" name="job" value={result.id} /><input type="hidden" name="widthMm" value={width} /><input type="hidden" name="heightMm" value={height} />{project && <input type="hidden" name="project" value={project} />}
        {!project && <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">공간 이름<input name="title" className="input mt-1" defaultValue="우리 집" maxLength={60} /></label><label className="text-sm">주거 유형<select name="homeType" className="input mt-1"><option value="apartment">아파트</option><option value="villa">빌라</option><option value="officetel">오피스텔</option><option value="oneroom">원룸</option></select></label></div>}
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirmed" required className="mt-1 accent-brand" data-testid="ai-confirm" />원본 도면과 실제 가로·세로를 확인했어요. 인식 오류는 편집기에서 고칠게요.</label>
        {saved.error && <p role="alert" className="text-sm text-danger">{saved.error}</p>}
        <button className="btn btn-primary w-full sm:w-auto" disabled={!preview?.house || saving || busy} data-testid="ai-import">{saving?"저장 중…":"내 공간에 저장하고 배치하기"}</button>
      </form>
    </section>}
    <p className="text-sm text-muted">사선·곡선 벽이나 여러 층은 자동 인식 지원 밖이에요. <Link href={trace} className="text-brand underline">도면을 직접 따라 그리기</Link> · <Link href="/spaces/templates" className="text-brand underline">등록된 아파트 도면 찾기</Link></p>
  </div>;
}
