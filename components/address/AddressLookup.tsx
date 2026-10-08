"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import type { AddressHit, AddressUnit, BuildingInfo, DetailStatus, Provider } from "@/lib/address";
import { lookupAddress, lookupAddressDetails, lookupBuilding } from "@/lib/address-actions";

const m2ToPyeong = (m2: number) => Math.round((m2 / 3.3058) * 10) / 10;

export interface AddressSelection {
  hit: AddressHit;
  dong: string;
  ho: string;
  info: BuildingInfo | null;
}

/** 주소 → 건축물대장 정보 → 도면 받는 방법과 공간 만들기 */
export default function AddressLookup({ loggedIn, onApply }: { loggedIn: boolean; onApply?: (selection: AddressSelection) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<AddressHit[] | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<AddressHit | null>(null);
  const [dong, setDong] = useState("");
  const [ho, setHo] = useState("");
  const [dongs, setDongs] = useState<string[]>([]);
  const [units, setUnits] = useState<AddressUnit[]>([]);
  const [floor, setFloor] = useState<string | null>(null);
  const [detailStatus, setDetailStatus] = useState<DetailStatus | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [info, setInfo] = useState<BuildingInfo | null>(null);
  const [bProvider, setBProvider] = useState<Provider | null>(null);
  const [pending, start] = useTransition();
  const requestId = useRef(0);
  const resetDetails = () => {
    setDong(""); setHo(""); setDongs([]); setUnits([]); setFloor(null);
    setDetailStatus(null); setDetailError(null); setManual(false); setInfo(null); setBProvider(null);
  };
  const chooseAddress = (hit: AddressHit) => {
    const id = ++requestId.current;
    resetDetails(); setPick(hit); setError(null);
    start(async () => {
      const r = await lookupAddressDetails(hit, "dong");
      if (id !== requestId.current) return;
      setDongs(r.dongs); setDetailStatus(r.status); setDetailError(r.error ?? null);
      setManual(r.status !== "ready");
    });
  };
  const chooseDong = (value: string) => {
    const id = ++requestId.current;
    const selected = value === "__none" ? "" : value;
    setDong(selected); setHo(""); setFloor(null); setUnits([]); setInfo(null); setError(null); setDetailError(null);
    if (!pick || !value) return;
    start(async () => {
      const r = await lookupAddressDetails(pick, "floorho", selected);
      if (id !== requestId.current) return;
      setUnits(r.units); setDetailStatus(r.status); setDetailError(r.error ?? null);
      if (r.status !== "ready") setManual(true);
      const floors = [...new Set(r.units.map((unit) => unit.floorNm))];
      if (floors.length === 1) setFloor(floors[0]);
    });
  };
  const search = () => {
    if (pending) return;
    const id = ++requestId.current;
    setPick(null); resetDetails(); setError(null);
    start(async () => {
      const r = await lookupAddress(q);
      if (id !== requestId.current) return;
      setHits(r.hits); setProvider(r.provider); setError(r.error ?? null);
    });
  };
  if (!loggedIn)
    return (
      <p className="rounded-2xl bg-sand p-5 text-sm">
        주소 찾기는 로그인한 뒤 쓸 수 있어요. <Link href={`/login?next=${encodeURIComponent("/spaces/address")}`} className="text-brand underline">로그인</Link>
      </p>
    );
  const region = pick ? pick.roadAddr.split(" ").slice(0, 2).join(" ").replace("특별시", "").replace("광역시", "") : "";
  const homeHref = (() => {
    const sp = new URLSearchParams();
    if (pick?.apt) sp.set("type", "apartment");
    if (region) sp.set("region", region);
    if (info?.unitArea && !info.example) sp.set("area", String(info.unitArea));
    // Preserve the existing demo journey, but never use a demo area for a real address.
    if (pick?.example && info?.unitArea) sp.set("area", String(info.unitArea));
    return `/homes/new?${sp}`;
  })();
  return (
    <div className="space-y-5">
      <div
        className="home-search !mx-0 !max-w-none"
        role="search"
      >
        <input value={q} disabled={pending} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }} placeholder="도로명·지번·건물 이름 (예: 테헤란로 152)" aria-label="주소 검색" data-testid="addr-q" />
        <button type="button" disabled={pending} data-testid="addr-search" onClick={search}>{pending ? "찾는 중…" : "주소 찾기"}</button>
      </div>
      {provider === "example" && <p className="rounded-xl bg-warn-soft px-4 py-2.5 text-xs leading-relaxed text-warn" data-testid="addr-example">주소 검색 실제 연동 전이에요(도로명주소 API 키 없음). 아래는 예시 주소이며 실제 주소가 아니에요.</p>}
      {error && <p role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-danger">{error}</p>}
      {hits && !pick && (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-white" data-testid="addr-hits">
          {hits.length === 0 && <li className="p-4 text-sm text-muted">찾은 주소가 없어요.</li>}
          {hits.map((h, i) => (
            <li key={i}>
              <button type="button" disabled={pending} className="w-full p-4 text-left text-sm hover:bg-sand" onClick={() => chooseAddress(h)}>
                <b>{h.roadAddr}</b>
                <span className="mt-0.5 block text-xs text-muted">지번 {h.jibunAddr} · 우편번호 {h.zipNo}{h.apt ? " · 공동주택" : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {pick && (
        <section className="card space-y-3" data-testid="addr-pick">
          <p className="text-sm"><b>{pick.roadAddr}</b> <button type="button" disabled={pending} className="ml-2 text-xs text-muted underline" onClick={() => { ++requestId.current; setPick(null); resetDetails(); setError(null); }}>다른 주소</button></p>
          {pending && <p role="status" className="text-sm text-muted">등록된 주소 정보를 확인하고 있어요.</p>}
          {detailStatus === "ready" && !manual && (
            <div className="space-y-3" data-testid="addr-detail-select">
              <p className="text-sm text-muted">조회된 목록에서 내 동·층·호를 선택해 주세요.</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1 text-sm"><span>동</span>
                  <select className="input w-full" aria-label="동" data-testid="addr-dong" disabled={pending} value={dong || (units.length ? "__none" : "")} onChange={(e) => chooseDong(e.target.value)}>
                    <option value="">동 선택</option>
                    {dongs.map((d) => <option key={d || "__none"} value={d || "__none"}>{d || "동 구분 없음"}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-sm"><span>층</span>
                  <select className="input w-full" aria-label="층" data-testid="addr-floor" disabled={pending || !units.length} value={floor === null ? "" : floor || "__none"} onChange={(e) => { setFloor(e.target.value === "__none" ? "" : e.target.value || null); setHo(""); setInfo(null); }}>
                    <option value="">층 선택</option>
                    {[...new Set(units.map((u) => u.floorNm))].map((f) => <option key={f || "__none"} value={f || "__none"}>{f || "층 구분 없음"}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-sm"><span>호</span>
                  <select className="input w-full" aria-label="호" data-testid="addr-ho" disabled={pending || floor === null} value={ho} onChange={(e) => { setHo(e.target.value); setInfo(null); }}>
                    <option value="">호 선택</option>
                    {units.filter((u) => u.floorNm === floor).map((u) => <option key={u.hoNm} value={u.hoNm}>{u.hoNm}</option>)}
                  </select>
                </label>
              </div>
              <button type="button" disabled={pending} className="text-xs text-brand underline" data-testid="addr-manual" onClick={() => { setManual(true); setInfo(null); setError(null); }}>목록에 내 동·호가 없어요 · 직접 입력</button>
              <p className="text-xs text-muted">등록된 주소 목록이에요. 해당 호의 평면도나 현재 내부 구조를 확인한 것은 아니에요.</p>
            </div>
          )}
          {!pending && detailStatus && detailStatus !== "ready" && <p role="status" className="rounded-xl bg-sand p-3 text-sm" data-testid="addr-detail-fallback">{detailError || (detailStatus === "missing-key" ? "동·층·호 조회가 연결되지 않았어요. 동·호를 직접 입력해 주세요." : "등록된 동·호 정보를 찾지 못했어요. 직접 입력해 주세요.")}</p>}
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            {manual && <>
              <label className="space-y-1 text-sm"><span>동 직접 입력</span><input className="input w-full" value={dong} maxLength={40} disabled={pending} onChange={(e) => { setDong(e.target.value); setInfo(null); }} placeholder="동(있으면, 예: 101)" aria-label="동" data-testid="addr-dong-manual" /></label>
              <label className="space-y-1 text-sm"><span>호 직접 입력</span><input className="input w-full" value={ho} maxLength={40} disabled={pending} onChange={(e) => { setHo(e.target.value); setInfo(null); }} placeholder="호(예: 1203)" aria-label="호" data-testid="addr-ho" /></label>
            </>}
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending}
              data-testid="addr-building"
              onClick={() =>
                start(async () => {
                  const id = ++requestId.current;
                  const r = await lookupBuilding(pick, dong, ho);
                  if (id !== requestId.current) return;
                  setInfo(r.info);
                  setBProvider(r.provider);
                  setError(r.error ?? null);
                })
              }
            >
              건물 정보 보기
            </button>
          </div>
          <Link href={`/spaces/templates?q=${encodeURIComponent(pick.roadAddr)}`} className="btn btn-sm" data-testid="addr-templates">이 주소의 등록 도면 찾기</Link>
          <p className="text-xs text-muted">{onApply ? "선택한 동·호는 조회 기록에 남기지 않아요. 신청서에 불러온 상세 주소는 현장 방문을 요청한 업체에만 공개돼요." : "선택한 동·층·호는 조회에만 사용하며 조회 기록에 저장하지 않아요."}</p>
          {onApply ? !info && <button type="button" className="btn btn-primary" data-testid="addr-apply" disabled={pending} onClick={() => onApply({ hit: pick, dong, ho, info: null })}>이 주소를 신청서에 불러오기</button> : <div className="flex flex-wrap gap-2">
            <Link href={homeHref} className="btn btn-sm">이 주소로 집 상담 신청</Link>
            <Link href="/spaces/new" className="btn btn-sm">도면·치수 직접 입력</Link>
          </div>}
        </section>
      )}
      {info && (
        <section className="card space-y-3" data-testid="addr-info">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="h-section !mb-0">건축물대장 정보</h2>
            {bProvider === "example" ? <span className="badge bg-warn-soft text-warn border-warn/30">실제 연동 전 · 예시 값</span> : <span className="badge bg-brand-soft text-brand border-brand/30">공공데이터포털 건축물대장</span>}
          </div>
          <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-y-1.5 text-sm">
            <dt className="text-muted">건물</dt><dd>{info.name || "—"}{info.buildingDong ? ` · ${info.buildingDong}` : ""} · {info.purpose || "—"}</dd>
            <dt className="text-muted">규모</dt><dd>{info.floors}{info.households ? ` · ${info.households}세대` : ""}</dd>
            <dt className="text-muted">연면적</dt><dd>{info.totalArea ? `${info.totalArea.toLocaleString()}㎡` : "—"}</dd>
            <dt className="text-muted">사용승인일</dt><dd>{info.approvedAt || "—"}</dd>
            <dt className="text-muted">구조</dt><dd>{info.structure || "—"}</dd>
            {ho && <><dt className="text-muted">이 집 전용면적</dt><dd data-testid="addr-unit">{info.unitArea ? `${info.unitArea}㎡ (약 ${m2ToPyeong(info.unitArea)}평)` : info.unitNote}</dd></>}
          </dl>
          {info.unitArea !== null && info.unitNote && <p className="text-xs text-muted">{info.unitNote}</p>}
          {info.buildingDong && <p className="text-xs text-muted">규모·세대수·연면적은 선택한 {info.buildingDong}의 건축물대장 기준이며, 단지 전체 수치가 아니에요.</p>}
          <p className="rounded-xl bg-sand p-3 text-xs leading-relaxed">건축물대장에는 <b>방 배치·벽 위치가 담긴 평면도가 없어요.</b> 조회된 면적과 건물 정보를 참고하고, 공간 모양은 도면이나 실측 치수로 만들어요.</p>
          {onApply && pick ? <button type="button" className="btn btn-primary" data-testid="addr-apply" disabled={pending} onClick={() => onApply({ hit: pick, dong, ho, info })}>이 정보를 신청서에 불러오기</button> : <div className="flex flex-wrap gap-2">
            <Link href={homeHref} className="btn btn-primary" data-testid="addr-to-home">이 정보로 집 상담 신청</Link>
            <Link href="/spaces/new" className="btn">도면·치수로 공간 만들기</Link>
          </div>}
        </section>
      )}
    </div>
  );
}
