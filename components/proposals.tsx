import Link from "next/link";
import type { ReactNode } from "react";
import { ITEM_STATUS, categoriesOf, dateKo, won, type QuoteItem } from "@/lib/constants";
import type { RevisionHistory } from "@/lib/data";
import { STATUS_MEANING, categoryLabel, type QuoteColumn, type QuoteComparison } from "@/lib/quotes";
import { Badge } from "./ui";

export const EXAMPLE_LABEL = "3D 제안 예시 · 실제 시공 사진 아님";

/** 업체의 설계 제안: 고객 배치대로 시공 / 수정 제안(설명·첨부) */
export interface DesignProposal {
  mode: string;
  note: string;
  files: { id: number; name: string }[];
}

export function DesignBlock({ design }: { design: DesignProposal }) {
  if (!design.mode) return <p className="text-xs text-muted">설계 제안 없음 (이전 방식 제안)</p>;
  return (
    <div className="space-y-1 text-sm" data-testid="design-block">
      <p>
        <Badge tone={design.mode === "proposal" ? "warn" : "plain"}>{design.mode === "proposal" ? "수정 제안" : "고객 배치대로 시공"}</Badge>
      </p>
      {design.note && <p className="whitespace-pre-line text-xs leading-relaxed">{design.note}</p>}
      {design.files.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {design.files.map((f) => (
            <li key={f.id}>
              <a href={`/files/${f.id}`} target="_blank" className="badge bg-white text-ink underline-offset-2 hover:underline">
                📎 {f.name}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface ProposalVendor {
  id: number;
  company: string;
  years: number;
  caseCount: number;
  photos: { id: number; example: boolean }[];
}

interface ProposalQuote {
  id: number;
  items: QuoteItem[];
  vat_included: number;
  duration_days: number;
  start_available: string;
  extra_conditions: string;
  note: string;
}

/** 시공사 한 곳의 제안 요약. 금액과 함께 범위·별도·미확정·기간·사례를 한 카드에서 본다. */
export function ProposalCard<Q extends ProposalQuote>({
  col,
  cmp,
  vendor,
  children,
  linkVendor = true,
  hideVendorMeta = false,
  history,
  design,
}: {
  col: QuoteColumn<Q>;
  cmp: QuoteComparison<Q>;
  vendor: ProposalVendor;
  children?: ReactNode;
  linkVendor?: boolean;
  /** 제출 이력. 수정된 적이 있으면 카드에서 펼쳐 볼 수 있다. */
  history?: RevisionHistory;
  /** 화면 설명용 예시처럼 업체 정보가 없는 경우 */
  hideVendorMeta?: boolean;
  /** 설계 제안. 고객 배치가 있는 요청에서만 */
  design?: DesignProposal;
}) {
  const { q } = col;
  const total = categoriesOf(col.q.items).length;
  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
      {vendor.photos.length > 0 && (
        <div className="relative grid grid-cols-3 gap-0.5 bg-line">
          {vendor.photos.slice(0, 3).map((p) => (
            // eslint-disable-next-line @next/next/no-img-element -- 업로드 파일
            <img key={p.id} src={`/files/${p.id}`} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
          ))}
          {vendor.photos.some((p) => p.example) && <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{EXAMPLE_LABEL}</span>}
        </div>
      )}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            {linkVendor ? (
              <Link href={`/vendors/${vendor.id}`} className="font-semibold underline decoration-line underline-offset-4">
                {vendor.company}
              </Link>
            ) : (
              <b>{vendor.company}</b>
            )}
            {!hideVendorMeta && (
              <p className="mt-0.5 text-xs text-muted">
                경력 {vendor.years}년 · 시공 사례 {vendor.caseCount}건
              </p>
            )}
          </div>
          {cmp.lowestId === q.id && <Badge tone="brand">최저</Badge>}
        </div>

        <p className="mt-4 text-xs text-muted">현재 산정 금액 · 부가세 포함</p>
        <p className="text-2xl font-bold tabular-nums tracking-tight">{won(col.payableWithVat)}</p>
        <dl className="mt-2 space-y-1 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">견적 합계 (포함 항목)</dt>
            <dd className="tabular-nums">{won(col.includedWithVat)}</dd>
          </div>
          {col.separateItems.length > 0 && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted">
                별도 비용 · {col.separateItems.map((it) => categoryLabel(it.key)).join(", ")}
              </dt>
              <dd className="shrink-0 tabular-nums">+ {won(col.separateWithVat)}</dd>
            </div>
          )}
        </dl>

        <div className="mt-3 space-y-1.5 text-xs leading-relaxed">
          {col.unresolvedKeys.length > 0 && (
            <p className="rounded-lg bg-warn-soft px-2.5 py-1.5 text-warn">
              <b>금액 미정 {col.unresolvedKeys.length}항목</b> · {col.unresolvedKeys.map(categoryLabel).join(", ")} — 현장 확인 뒤 더해집니다
            </p>
          )}
          {col.excludedKeys.length > 0 && (
            <p className="rounded-lg bg-paper px-2.5 py-1.5 text-muted">
              <b className="text-ink">공사 범위에 없음 {col.excludedKeys.length}항목</b> · {col.excludedKeys.map(categoryLabel).join(", ")}
            </p>
          )}
          {col.unresolvedKeys.length === 0 && col.excludedKeys.length === 0 && <p className="text-muted">{total}개 항목 모두 금액이 확정되었습니다.</p>}
        </div>

        {!cmp.sameScope && col.commonWithVat != null && (
          <p className="mt-3 rounded-lg bg-sand px-3 py-2 text-sm">
            <span className="text-xs text-muted">공통 {cmp.commonKeys.length}개 항목 합계</span>
            <span className="flex flex-wrap items-center gap-2 font-semibold tabular-nums">
              {won(col.commonWithVat)}
              {cmp.commonLowestId === q.id && <Badge tone="brand">공통 항목 기준 최저</Badge>}
            </span>
          </p>
        )}

        {design && (
          <div className="mt-4 rounded-lg border border-line bg-white p-3">
            <p className="mb-1.5 text-xs font-semibold text-muted">설계 제안</p>
            <DesignBlock design={design} />
          </div>
        )}
        {q.note && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-muted">제안 요약</p>
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{q.note}</p>
          </div>
        )}
        <dl className="mt-4 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-sm">
          <dt className="text-muted">공사 기간</dt>
          <dd>
            약 {q.duration_days}일 · 착공 가능 {dateKo(q.start_available)}
          </dd>
          <dt className="text-muted">추가비용</dt>
          <dd className="whitespace-pre-line text-xs leading-relaxed">{q.extra_conditions}</dd>
        </dl>
        {history && history.length > 1 && (
          <details className="mt-4 rounded-lg bg-paper px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold">
              수정 {history.length - 1}회 · 최근 {dateKo(history[history.length - 1].created_at)} — 이력 보기
            </summary>
            <div className="mt-2">
              <RevisionList history={history} />
            </div>
          </details>
        )}
        {children && <div className="mt-auto pt-4">{children}</div>}
      </div>
    </li>
  );
}

/** 제출 이력. 새 제출본이 위에 온다. 이전 제출본은 지워지지 않는다. */
export function RevisionList({ history }: { history: RevisionHistory }) {
  return (
    <ol className="space-y-3 text-sm">
      {[...history].reverse().map((r) => (
        <li key={r.no} className="rounded-lg border border-line bg-white p-3">
          <p className="flex flex-wrap items-baseline justify-between gap-2">
            <b>
              {r.no}차 제출{r.no === history.length && " · 현재"}
            </b>
            <span className="text-xs text-muted">{dateKo(r.created_at)}</span>
          </p>
          <p className="mt-0.5 tabular-nums">
            {won(r.amount)} <span className="text-xs text-muted">현재 산정 금액 · 부가세 포함</span>
          </p>
          {r.changes.length > 0 ? (
            <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs leading-relaxed text-muted">
              {r.changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : (
            r.no === 1 && <p className="mt-1 text-xs text-muted">최초 제출</p>
          )}
        </li>
      ))}
    </ol>
  );
}

/** 항목 구분의 뜻. 같은 '합계에 없음'이라도 의미가 다르다. */
export function StatusLegend() {
  return (
    <dl className="grid gap-2 text-xs leading-relaxed sm:grid-cols-3">
      {(["separate", "site_check", "na"] as const).map((key) => (
        <div key={key} className="rounded-lg border border-line bg-white p-3">
          <dt className="mb-1">
            <Badge tone={key === "site_check" ? "warn" : "plain"}>{ITEM_STATUS[key]}</Badge>
          </dt>
          <dd className="text-muted">{STATUS_MEANING[key]}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ItemCell({ it }: { it: QuoteItem }) {
  return (
    <>
      {it.status === "included" ? (
        <span className="font-medium tabular-nums">{won(it.amount)}</span>
      ) : it.status === "separate" ? (
        <span className="tabular-nums">
          <Badge>별도</Badge> {won(it.amount)}
        </span>
      ) : (
        <Badge tone={it.status === "site_check" ? "warn" : "plain"}>{ITEM_STATUS[it.status]}</Badge>
      )}
      {it.spec && <span className="mt-1 block text-xs leading-relaxed text-muted">{it.spec}</span>}
    </>
  );
}
