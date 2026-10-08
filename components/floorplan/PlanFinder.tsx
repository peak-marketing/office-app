"use client";
/* eslint-disable @next/next/no-img-element -- Original public reference image, not an owned optimized asset. */
import Link from "next/link";
import {useActionState,useState,useTransition} from "react";
import {lookupPlans,selectFloorplanSource} from "@/lib/floorplan-actions";
import type {PlanComplex,PlanSource} from "@/lib/floorplan/catalog";
import TemplateCards from "./TemplateCards";
import {referenceRecognition} from "@/lib/floorplan/reference";
type Results=Awaited<ReturnType<typeof lookupPlans>>;
export default function PlanFinder({loggedIn}:{loggedIn:boolean}){
  const [keyword,setKeyword]=useState(""),[results,setResults]=useState<Results|null>(null),[complex,setComplex]=useState<PlanComplex|null>(null),[source,setSource]=useState<PlanSource|null>(null);
  const [imageReady,setImageReady]=useState(""),[imageFailed,setImageFailed]=useState("");
  const [size,setSize]=useState("all"),[variant,setVariant]=useState("unknown"),[error,setError]=useState("");
  const [pending,start]=useTransition(),[selected,dispatch,selecting]=useActionState(selectFloorplanSource,{});
  if(!loggedIn)return <div className="card"><p>로그인하면 단지를 찾고 내 집 도면으로 3D를 만들 수 있어요.</p><Link href="/login?next=%2Fspaces%2Faddress" className="btn btn-primary mt-3">로그인하고 도면 찾기</Link></div>;
  return <div className="space-y-5" data-testid="plan-finder">
    <form role="search" className="home-search !mx-0 !max-w-none" onSubmit={e=>{e.preventDefault();setComplex(null);setSource(null);setError("");start(async()=>{try{const r=await lookupPlans(keyword);setResults(r);setError(r.error??"");}catch{setError("도면을 찾지 못했어요. 다시 찾거나 직접 올려 주세요.");}});}}>
      <input value={keyword} onChange={e=>setKeyword(e.target.value)} placeholder="아파트 이름·주소 (예: 갈매스타힐스)" aria-label="아파트 도면 검색" data-testid="plan-q"/>
      <button disabled={pending} data-testid="plan-search">{pending?"찾는 중…":"도면 찾기"}</button>
    </form>
    {error&&<p role="alert" className="text-sm text-danger">{error}</p>}
    {results&&!complex&&<div className="space-y-3" data-testid="plan-results">
      {results.complexes.length>0&&<h2 className="text-lg font-bold">이 아파트가 맞나요?</h2>}
      {results.complexes.map(c=><button key={c.address} type="button" className="card block w-full text-left hover:border-brand" data-testid="complex-pick" onClick={()=>{setComplex(c);setSize("all");setVariant("unknown");setSource(null);}}><b>{c.name}</b><span className="mt-1 block text-sm text-muted">{c.address}</span><span className="mt-2 block text-sm text-brand">공개 도면 {c.plans.length}타입 · 우리 단지 선택 →</span></button>)}
      {results.templates.length>0&&<><h2 className="text-lg font-bold">등록된 평면·3D</h2><TemplateCards templates={results.templates}/></>}
      {!results.complexes.length&&!results.templates.length&&<div className="card space-y-3" data-testid="plan-not-found"><b>등록된 도면이 아직 없어요.</b><p className="text-sm text-muted">사진·PDF 도면을 올려 주세요. 치수만 알아도 공간을 만들 수 있어요.</p><div className="flex flex-wrap gap-2"><Link href="/spaces/recognize" className="btn btn-primary">내 도면 직접 올리기</Link><Link href="/spaces/home" className="btn">치수로 공간 만들기</Link><Link href="/homes/new" className="btn">자료 없이 상담 신청</Link></div></div>}
      {!!results.web.items.length&&<section className="card space-y-2" data-testid="plan-web-results"><h2 className="font-bold">찾아본 공개 자료</h2><p className="text-xs text-muted">다른 단지 자료가 섞일 수 있어요. 원본에서 단지와 타입을 확인한 뒤 도면을 올려 주세요.</p>{results.web.items.map(r=><a key={r.url} href={r.url} target="_blank" rel="noreferrer" className="block text-sm text-brand underline">{r.title}</a>)}</section>}
      {results.web.error&&<p className="text-sm text-muted">{results.web.error}</p>}
    </div>}
    {complex&&<section className="card space-y-4" data-testid="plan-complex">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-bold">{complex.name}</h2><p className="text-sm text-muted">{complex.address}</p></div><button type="button" className="btn btn-sm" onClick={()=>{setComplex(null);setSource(null);}}>다른 단지 찾기</button></div>
      <form action={dispatch} className="space-y-4" data-testid="plan-selection">
        <p className="font-semibold">평형과 타입을 골라 주세요</p>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm">동 (선택)<input name="dong" className="input mt-1" placeholder="예: 406" maxLength={20} data-testid="plan-dong"/></label><label className="text-sm">호 (선택)<input name="ho" className="input mt-1" placeholder="예: 1203" maxLength={20} data-testid="plan-ho"/></label></div>
        <p className="text-xs text-muted">동·호만으로 타입을 확정하지 않아요. 동·호를 적으면 내 공간의 비공개 주소에 저장하며, 현장 방문을 요청한 업체에만 공개해요.</p>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">공급면적 기준 평형<select className="input mt-1" value={size} onChange={e=>{setSize(e.target.value);setSource(null);}} data-testid="plan-size"><option value="all">잘 모르겠어요 · 모두 보기</option><option value="30">약 30평 · 98~99㎡</option><option value="34">약 34평 · 112㎡</option></select></label><label className="text-sm">발코니 확장 여부<select className="input mt-1" name="variant" value={variant} onChange={e=>setVariant(e.target.value)} data-testid="plan-variant"><option value="unknown">잘 모르겠어요</option><option value="basic">기본형 · 비확장</option><option value="expanded">확장형</option></select></label></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{complex.plans.filter(p=>size==="all"||(size==="30"?p.supplyArea<110:p.supplyArea>=110)).map(p=><button key={p.id} type="button" aria-pressed={source?.id===p.id} className={`rounded-xl border p-3 text-left text-sm ${source?.id===p.id?"border-brand bg-brand-soft":"border-line"}`} onClick={()=>setSource(p)} data-testid={`source-${p.id}`}><b>{p.unitType}</b><span className="block text-xs text-muted">공급면적 타입 표기</span><span className="block text-xs text-brand">{referenceRecognition(p.id)?"원본 대조 참고 배치 있음":"도면 이미지 · 배치 검토 전"}</span>{p.exclusiveArea&&<span className="block text-xs">전용 {p.exclusiveArea}㎡</span>}</button>)}</div>
        {source&&<div key={source.id+variant} className="space-y-3" data-testid="source-preview"><input type="hidden" name="source" value={source.id}/><h3 className="font-bold">이 도면이 우리 집과 같나요?</h3><p className="text-sm text-muted">{source.unitType} · {source.variant}</p><img src={`/api/floorplans/source/${source.id}`} onLoad={()=>setImageReady(source.id)} onError={()=>setImageFailed(source.id)} alt={`${source.complex} ${source.unitType} 원본 평면도`} className="w-full rounded-xl border border-line"/><a href={source.pageUrl} target="_blank" rel="noreferrer" className="block text-xs text-brand underline">출처: KB부동산 · 원본 단지 페이지</a>
          {imageFailed===source.id&&imageReady!==source.id&&<p role="alert" className="text-sm text-danger">원본 그림을 불러오지 못했어요. <Link href="/spaces/recognize" className="underline">가지고 계신 도면을 직접 올려 주세요.</Link></p>}
          {variant==="expanded"?<div className="rounded-xl bg-sand p-3 text-sm" data-testid="source-expansion-missing">이 공개 자료는 기본형이에요. 확장형 도면은 아직 등록되지 않았어요. <Link href="/spaces/recognize" className="text-brand underline">실제 확장 도면을 직접 올려 주세요.</Link></div>:<><label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirmed" required disabled={imageReady!==source.id} className="mt-1 accent-brand" data-testid="source-confirm"/>단지·평형·타입과 방·문·창 위치를 확인했어요. 실제 치수는 다음 단계에서 확인할게요.</label><button disabled={selecting||imageReady!==source.id} className="btn btn-primary w-full" data-testid="source-start">{selecting?"가져오는 중…":"이 도면으로 내 공간 3D 만들기"}</button></>}
          {selected.error&&<p role="alert" className="text-sm text-danger">{selected.error}</p>}
        </div>}
        <Link href="/spaces/recognize" className="block text-sm text-brand underline">여기에 맞는 도면이 없어요 · 내 도면 직접 올리기</Link>
      </form>
    </section>}
  </div>;
}
