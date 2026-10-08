"use client";

import { useState } from "react";
import AddressLookup, { type AddressSelection } from "./AddressLookup";

export interface AddressImport {
  region: string;
  address: string;
  areaM2: number | null;
  year: number | null;
  example: boolean;
}

/** Shared intake entry. Applying is explicit; searching never submits the enclosing form. */
export default function AddressIntake({ onApply }: { onApply: (value: AddressImport) => void }) {
  const [applied, setApplied] = useState<AddressImport | null>(null);
  const apply = ({ hit, dong, ho, info }: AddressSelection) => {
    const suffix = (value: string, unit: string) => value.trim() ? `${value.trim().replace(new RegExp(`${unit}$`), "")}${unit}` : "";
    const year = info?.approvedAt?.match(/^(\d{4})\./)?.[1];
    const value: AddressImport = {
      region: hit.roadAddr.split(" ").slice(0, 2).join(" ").replace("특별시", "").replace("광역시", ""),
      address: [hit.roadAddr, suffix(dong, "동"), suffix(ho, "호")].filter(Boolean).join(" "),
      areaM2: info?.unitArea ?? null,
      year: year ? Number(year) : null,
      example: !!hit.example || !!info?.example,
    };
    onApply(value); setApplied(value);
  };
  return (
    <section className="rounded-2xl border border-brand/25 bg-brand-soft/30 p-4 sm:p-5" data-testid="address-intake">
      <h3 className="font-bold">주소로 공간 정보 불러오기</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted">주소·건물 이름을 찾고 내 동·호를 선택해 주세요. 확인된 지역·주소·전용면적을 신청서에 넣고, 없는 정보는 직접 입력할 수 있어요. 도면·실내 치수는 별도로 확인해야 해요.</p>
      <div className="mt-4"><AddressLookup loggedIn onApply={apply} /></div>
      {applied && <p role="status" className="mt-4 rounded-xl bg-brand-soft p-3 text-sm leading-relaxed" data-testid="address-applied">
        <b>{applied.example ? "예시 정보를 불러왔어요." : "신청서에 불러왔어요."}</b><span className="mt-1 block">{applied.address}</span>
        <span className="mt-1 block text-xs">{applied.areaM2 === null ? "전용면적은 확인되지 않아 자동 입력하지 않았어요. 아는 면적이 있으면 직접 넣어 주세요." : `전용면적 ${applied.areaM2}㎡. 불러온 값은 신청서에서 수정할 수 있어요.`}</span>
      </p>}
    </section>
  );
}
