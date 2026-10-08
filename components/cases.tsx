import Link from "next/link";
import type { ReactNode } from "react";
import { ROOM_LABEL, caseRegion, type CaseCard, type ProjectRef } from "@/lib/data";
import { getStyle } from "@/lib/styles";
import { EXAMPLE_LABEL } from "./proposals";
import { SaveCaseButton } from "./vendor-client";
import Icon from "./Icon";

export const styleName = (id: string) => (id ? getStyle(id).name : "");

/** 사례를 한 줄로 요약한 정보: 평수 · 스타일 · 지역 */
export function caseMeta(c: Pick<CaseCard, "area_pyeong" | "style" | "region" | "vendor_regions">) {
  return [c.area_pyeong != null && `${c.area_pyeong}평`, styleName(c.style), caseRegion(c)].filter(Boolean).join(" · ");
}

export function caseTags(c: CaseCard) {
  return [c.spec.staff && `직원 ${c.spec.staff}석`, ...(c.spec.rooms ?? []).map((k) => (k === "meeting" && c.spec.meetingSeats ? `회의실 ${c.spec.meetingSeats}인` : ROOM_LABEL[k])), c.duration && `공사 ${c.duration}`].filter(Boolean) as string[];
}

/** 예시 이미지는 실제 사진이 아님을 사진 위에 적는다. */
export function ExampleMark({ show }: { show: boolean | number }) {
  if (!show) return null;
  return <span className="case-example">{EXAMPLE_LABEL}</span>;
}

/** 탐색 화면의 사례 카드. 사진이 먼저 보이고, 저장 버튼은 사진 위 오른쪽에 둔다. */
export function CaseTile({ c, saved = false, canSave = true, children }: { c: CaseCard; saved?: boolean; canSave?: boolean; children?: ReactNode }) {
  return (
    <li className="case-tile group relative" data-case={c.id}>
      <Link href={`/cases/${c.id}`} className="block">
        <span className="case-image">
          {c.photos[0] ? (
            // eslint-disable-next-line @next/next/no-img-element -- 업로드 파일
            <img src={`/files/${c.photos[0]}`} alt={c.title} loading="lazy" className="w-full object-cover" />
          ) : (
            <span className="grid aspect-[4/3] place-items-center text-xs text-muted">사진 없음</span>
          )}
          <ExampleMark show={c.is_example} />
          {c.photos.length > 1 && <span className="absolute left-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">사진 {c.photos.length}</span>}
        </span>
        <span className="case-info">
          <b className="case-title">{c.title}</b>
          <span className="case-meta">{caseMeta(c)}</span>
          <span className="case-vendor"><Icon name="user" className="size-3 shrink-0" /><span className="truncate">{c.company}</span></span>
        </span>
      </Link>
      {canSave && (
        <span className="absolute right-2 top-2">
          <SaveCaseButton key={`${c.id}-${saved}`} caseId={c.id} initial={saved} />
        </span>
      )}
      {children}
    </li>
  );
}

/**
 * 요청서에 연결된 참고 사례. 고객·운영자·시공사 화면이 함께 쓴다.
 * ownVendorId: 보는 시공사 자신의 사례이면 표시한다.
 */
export function RefCases({ refs, remove, ownVendorId, emptyText }: { refs: ProjectRef[]; remove?: (id: number) => ReactNode; ownVendorId?: number; emptyText?: string }) {
  if (!refs.length) return <p className="text-sm text-muted">{emptyText ?? "연결한 참고 사례가 없습니다."}</p>;
  return (
    <ul className="space-y-3" data-testid="ref-cases">
      {refs.map(({ id, c, file_id, note }) => {
        // 고객이 고른 사진을 맨 앞에 둔다.
        const photos = file_id && c.photos.includes(file_id) ? [file_id, ...c.photos.filter((p) => p !== file_id)] : c.photos;
        return (
          <li key={id} className="rounded-xl border border-line bg-white p-3">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <Link href={`/cases/${c.id}`} className="text-sm font-semibold hover:underline">
                  {c.title}
                </Link>
                <p className="mt-0.5 text-xs text-muted">
                  {caseMeta(c)} · {c.company}
                  {ownVendorId === c.vendor_id && <span className="ml-1.5 badge border-brand/30 bg-brand-soft text-brand">우리 업체 사례</span>}
                </p>
                {caseTags(c).length > 0 && <p className="mt-1 text-xs text-muted">{caseTags(c).join(" · ")}</p>}
              </div>
              {remove?.(id)}
            </div>
            <ul className="mt-2.5 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {photos.slice(0, 4).map((p, i) => (
                <li key={p} className="relative overflow-hidden rounded-lg bg-sand">
                  <a href={`/files/${p}`} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- 업로드 파일 */}
                    <img src={`/files/${p}`} alt={`${c.title} ${i + 1}`} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                  </a>
                  {file_id === p && <span className="absolute left-1 top-1 rounded bg-clay px-1.5 py-0.5 text-[10px] font-semibold text-white">고객이 고른 사진</span>}
                </li>
              ))}
            </ul>
            {!!c.is_example && <p className="mt-1.5 text-[11px] text-muted">{EXAMPLE_LABEL}</p>}
            {note && (
              <p className="mt-2 rounded-lg bg-sand px-2.5 py-1.5 text-xs leading-relaxed">
                <span className="text-muted">마음에 든 점 · </span>
                {note}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
