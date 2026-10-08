"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { KindBadge } from "./explore/KindBadge";
import Icon from "./Icon";
import { FavoriteButton, SaveCaseButton } from "./vendor-client";

interface Props {
  caseId: number;
  title: string;
  category?: string;
  /** 눈높이 3D(예시) 또는 실제 시공 사진 */
  photos: number[];
  example: boolean;
  facts: { label: string; value: string }[];
  saved: boolean;
  favorite: boolean;
  vendorId: number;
  /** 고객·비로그인에게만 저장·요청 버튼을 보여 준다 */
  canAct: boolean;
  loggedIn: boolean;
  /** 배치 체험으로 넘길 조건 */
  tryQuery: string;
  /** 집 예시면 집 상담 신청으로 잇고, 사무실 배치 체험은 보여 주지 않는다. */
  home?: boolean;
}

/** 공간 상세 첫 화면: 눈높이 이미지와 이름·핵심 정보·요청 버튼. 보고 있는 사진을 요청서의 ‘고른 사진’으로 넘긴다. */
export default function CaseDetail({ caseId, title, category, photos, example, facts, saved, favorite, vendorId, canAct, loggedIn, tryQuery, home = false }: Props) {
  const [index, setIndex] = useState(0);
  const strip = useRef<HTMLUListElement>(null);
  // 버튼으로 넘길 때는 부드럽게 미끄러지는 동안의 스크롤 위치로 번호를 되돌리지 않는다.
  const jumping = useRef(0);
  const photo = photos[index];
  const request = home ? `/homes/new?case=${caseId}` : `/spaces/new?case=${caseId}${photo ? `&photo=${photo}` : ""}`;
  const requestHref = loggedIn ? request : `/signup?next=${encodeURIComponent(request)}`;
  const go = (i: number) => {
    const n = (i + photos.length) % photos.length;
    setIndex(n);
    jumping.current = Date.now();
    strip.current?.children[n]?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  };

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10">
        <div className="min-w-0">
          <div className="relative">
            <ul
              ref={strip}
              className="space-gallery"
              aria-label={example ? "눈높이 3D 이미지" : "시공 사진"}
              onScroll={(e) => {
                if (Date.now() - jumping.current < 800) return;
                const el = e.currentTarget;
                const i = Math.round(el.scrollLeft / el.clientWidth);
                if (i !== index) setIndex(i);
              }}
            >
              {photos.length === 0 && (
                <li>
                  <span className="grid aspect-[4/3] place-items-center text-sm text-muted">사진 준비 중</span>
                </li>
              )}
              {photos.map((id, i) => (
                <li key={id}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- 업로드 파일 */}
                  <img src={`/files/${id}`} alt={`${title} ${example ? "눈높이 3D" : "사진"} ${i + 1}`} loading={i === 0 ? "eager" : "lazy"} />
                </li>
              ))}
            </ul>
            <span className="absolute left-3 top-3">
              <KindBadge example={example} size="md" />
            </span>
            {photos.length > 1 && (
              <>
                <span className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold tabular-nums text-white">
                  {index + 1} / {photos.length}
                </span>
                <div className="pointer-events-none absolute inset-x-3 top-1/2 hidden -translate-y-1/2 justify-between md:flex">
                  <button type="button" aria-label="이전 사진" onClick={() => go(index - 1)} className="pointer-events-auto grid size-11 cursor-pointer place-items-center rounded-full bg-white/90 shadow-sm">
                    <Icon name="back" className="size-5" />
                  </button>
                  <button type="button" aria-label="다음 사진" onClick={() => go(index + 1)} className="pointer-events-auto grid size-11 cursor-pointer place-items-center rounded-full bg-white/90 shadow-sm">
                    <Icon name="chevron" className="size-5" />
                  </button>
                </div>
              </>
            )}
          </div>
          {photos.length > 1 && (
            <ul className="mt-2.5 hidden gap-2 md:flex" aria-label="사진 고르기">
              {photos.map((id, i) => (
                <li key={id}>
                  <button type="button" onClick={() => go(i)} aria-pressed={i === index} aria-label={`사진 ${i + 1}`} className={`block cursor-pointer overflow-hidden rounded-xl border-2 ${i === index ? "border-brand" : "border-transparent opacity-70 hover:opacity-100"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- 업로드 파일 */}
                    <img src={`/files/${id}`} alt="" className="h-16 w-24 object-cover" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted" data-testid="kind-note">
            <Icon name={example ? "cube" : "camera"} className="mt-0.5 size-4 shrink-0" />
            {example ? "실제 시공 사진이 아니라 이 공간 조건으로 그린 3D 제안 예시예요. 아래 입체 배치도·치수 평면도와 같은 공간입니다." : "시공사가 올린 실제 시공 사진이에요."}
          </p>
        </div>

        <aside className="detail-panel">
          {category && <p className="text-sm font-semibold text-brand">{category}</p>}
          <h1 className="detail-title mt-1">{title}</h1>
          <dl className="fact-row mt-5">
            {facts.map((f) => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
          {canAct && (
            <div className="mt-5 hidden space-y-2.5 lg:block">
              <Link href={requestHref} className="btn btn-primary w-full !min-h-14 text-base" data-testid="request-like-this">
                {home ? "집 상담 신청하기" : "이 분위기로 제안받기"}
              </Link>
              {!home && (
                <Link href={`/try?${tryQuery}`} className="btn w-full !min-h-12">
                  <Icon name="layout" className="size-4" />
                  우리 공간에 적용해보기
                </Link>
              )}
              <div className="grid grid-cols-2 gap-2">
                <SaveCaseButton caseId={caseId} initial={saved} variant="full" />
                <FavoriteButton vendorId={vendorId} initial={favorite} variant="full" />
              </div>
              <p className="pt-1 text-xs leading-relaxed text-muted">
                제안받기를 누르면 이 공간과 {photos.length > 1 ? "지금 보고 있는 이미지가" : "이미지가"} 요청서에 참고 자료로 붙어요. 시공사는 운영자가 배정합니다.
              </p>
            </div>
          )}
        </aside>
      </div>

      {/* 휴대폰: 하단 고정 버튼. 이 화면에서는 하단 메뉴를 숨겨 서로 겹치지 않는다. */}
      {canAct && (
        <div className="detail-cta-bar no-print lg:hidden" data-testid="detail-cta">
          <SaveCaseButton caseId={caseId} initial={saved} variant="square" />
          {!home && (
            <Link href={`/try?${tryQuery}`} className="btn shrink-0 !min-h-12 !px-3" aria-label="우리 공간에 적용해보기">
              <Icon name="layout" className="size-5" />
            </Link>
          )}
          <Link href={requestHref} className="btn btn-primary !min-h-12 flex-1 text-[15px]" data-testid="request-like-this-mobile">
            {home ? "집 상담 신청하기" : "이 분위기로 제안받기"}
          </Link>
        </div>
      )}
    </>
  );
}
