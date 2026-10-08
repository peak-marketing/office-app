import Link from "next/link";
import { DesignBlock, ItemCell, ProposalCard, StatusLegend, type DesignProposal } from "@/components/proposals";
import { Badge, Empty, Notice } from "@/components/ui";
import { requestVisit } from "@/lib/actions";
import { ITEM_STATUS, budgetText, quoteCategories, won } from "@/lib/constants";
import { getFilesByIds, getProposalVendor, getRevisionHistory, getVisits, getProjectRefs } from "@/lib/data";
import { pendingText } from "@/lib/next-action";
import { loadProject } from "@/lib/project-context";
import { compareQuotes } from "@/lib/quotes";
import { getStyle } from "@/lib/styles";
import { getRequestRevisions } from "@/lib/request-snapshot";
import { josa } from "@/lib/space/check";

export default async function QuotesTab({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string; r?: string }> }) {
  const { project, versions, quotes: allQuotes, assignments, finished } = await loadProject((await params).id);
  // 제안은 같은 도면 버전끼리만 비교한다.
  const versionIds = [...new Set([project.requested_version_id, ...assignments.map((a) => a.version_id)].filter(Boolean))] as number[];
  const query = await searchParams;
  const wanted = Number(query.v);
  const versionId = versionIds.includes(wanted) ? wanted : project.requested_version_id;
  const version = versions.find((v) => v.id === versionId);
  const pending = assignments.filter((a) => a.version_id === versionId && a.status === "invited" && !a.withdrawn_at);
  const waiting = pendingText({ writing: pending.filter((a) => a.accepted_at).length, undecided: pending.filter((a) => !a.accepted_at).length });
  const visits = getVisits(project.id);
  // 같은 요청 내용(r번호 = 같은 배치·치수·조건)을 기준으로 낸 제안끼리만 비교한다.
  // 배치를 고쳐 보낸 뒤에도 이전 기준으로 낸 제안은 그 기준(r번호)으로 남아 따로 보인다.
  const inVersion = allQuotes.filter((q) => q.version_id === versionId);
  // 지금 업체에 보낸 기준을 볼 때는 이 프로젝트의 요청 기록 전체(r1, r2…)를, 예전 도면 버전을 볼 때는 그 버전에 해당하는 기록만
  const allRevs = getRequestRevisions(project.id);
  const revs = versionId === project.requested_version_id ? allRevs : allRevs.filter((r) => r.version_id === versionId || inVersion.some((q) => q.request_rev_id === r.id));
  const latestRev = revs.at(-1);
  // 기본은 언제나 가장 최근에 보낸 요청(r번호). 이전 요청 기준 제안은 ‘이전 요청 기준 제안 보기’로 따로 연다.
  const shownRev = revs.find((r) => r.no === Number(query.r)) ?? latestRev;
  const ofRev = (r: (typeof revs)[number]) => inVersion.filter((q) => q.request_rev_id === r.id || (q.request_rev_id == null && r === revs[0]));
  const cmp = compareQuotes(shownRev ? ofRev(shownRev) : inVersion);
  const onLatest = !shownRev || shownRev.id === latestRev?.id;
  // 최신 요청을 보낸 뒤 업체가 아직 바뀐 내용을 확인하지 않아 이전 기준에 남은 제안
  // 이전 요청 기록은 제안이 모두 최신으로 옮겨진 뒤에도 따로 열 수 있게 링크를 남긴다.
  const olderRevs = latestRev ? revs.filter((r) => r.id !== latestRev.id).reverse() : [];
  const reconfirming = olderRevs.reduce((n, r) => n + ofRev(r).length, 0);
  // 기준 배치와 도면 링크도 고른 요청 기록을 따른다(요청 기록마다 보낸 배치 버전이 다를 수 있음).
  const basis = (shownRev && versions.find((v) => v.id === shownRev.version_id)) || version;
  const vendors = new Map(cmp.cols.map(({ q }) => [q.id, getProposalVendor(q.vendor_id)]));
  const name = (id: number) => vendors.get(id)!.company;
  const isOld = versionId !== project.requested_version_id;
  const spaceRequest = !!shownRev?.snapshot.layout;
  const designOf = (q: (typeof cmp.cols)[number]["q"]): DesignProposal | undefined =>
    spaceRequest ? { mode: q.design_mode, note: q.design_note, files: getFilesByIds(q.design_files).map((f) => ({ id: f.id, name: f.original_name })) } : undefined;
  const refCount = getProjectRefs(project.id).length;
  const diffKeys = new Set(cmp.diffs.map((d) => d.key));
  const cats = quoteCategories(project.kind);
  const total = cats.length;
  // 집 요청: 고객이 고른 공사(부분 공사)는 ‘요청 범위’로 표시한다. 보여 주는 요청 기록의 값을 쓴다.
  const homeSent = shownRev?.snapshot.home ?? basis?.home ?? null;
  const requestedWorks = new Set<string>(homeSent?.scope === "partial" ? homeSent.works : []);

  if (!versionId)
    return <Empty>아직 시공 제안을 요청하지 않았어요. 저장한 배치로 ‘시공 제안 요청’을 하면 여러 업체의 비공개 견적·설계 제안을 여기에서 같은 기준으로 비교해요.</Empty>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">{basis?.home ? "기준 요청" : basis?.room ? "기준 배치" : "기준 도면"}</span>
        {/* 예전 방식(재배정)으로 도면 버전이 여러 개면 버전을 고른다. 지금 방식은 요청 기록(r번호)이 기준 배치를 정한다. */}
        {versionIds.length > 1 &&
          versions
            .filter((v) => versionIds.includes(v.id))
            .map((v) => (
              <Link key={v.id} href={`/projects/${project.id}/quotes?v=${v.id}`} className={`badge ${v.id === versionId ? "border-ink bg-white text-ink" : "bg-white text-muted"}`}>
                {v.room ? "배치 버전 " : "v"}
                {v.no}
                {v.id === project.requested_version_id ? " · 업체에 보낸 기준" : " · 이전"}
              </Link>
            ))}
        {basis && !basis.home && (
          <span className="badge border-ink bg-ink text-white" data-testid="basis-version">
            {basis.room ? "배치 버전 " : "v"}
            {basis.no}
            {shownRev ? ` · 요청 r${shownRev.no} 기준` : " · 업체에 보낸 기준"}
          </span>
        )}
        {basis?.home && (
          <Link href={`/projects/${project.id}/info`} className="text-xs text-muted underline" data-testid="basis-plan-link">
            요청 내용 보기{homeSent ? ` · 방 배치 ${shownRev?.snapshot.rooms?.length ?? 0}개` : ""}
          </Link>
        )}
        {basis && !basis.home && (
          <Link href={`/projects/${project.id}/plan?v=${basis.id}`} className="text-xs text-muted underline" data-testid="basis-plan-link">
            {basis.room ? `배치 버전 ${basis.no} · ${getStyle(basis.selected_style).name} 도면 보기` : basis.layout_status === "ok" ? `${basis.result.options.find((o) => o.id === basis.selected_option)?.title ?? "배치안"} · ${getStyle(basis.selected_style).name} 도면 보기` : "요청 내용 보기"}
          </Link>
        )}
        {refCount > 0 && (
          <Link href={`/projects/${project.id}/info#refs`} className="text-xs text-muted underline">
            참고 사례 {refCount}건
          </Link>
        )}
        <span className="text-xs text-muted">
          · 내 예산 {budgetText(project.budget_min, project.budget_max)}
          {version && !version.home && ` (가구 ${version.input.furnitureIncluded ? "포함" : "별도"})`}
        </span>
      </div>

      {shownRev && (
        <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="rev-chips">
          <span className="text-muted">기준 요청</span>
          <span className="badge border-ink bg-ink text-white" data-testid="shown-rev">
            요청 r{shownRev.no}
            {onLatest ? " · 최신" : " · 이전 요청"} · 제안 {cmp.cols.length}건
          </span>
          {onLatest
            ? olderRevs.map((r) => (
                <Link key={r.id} href={`/projects/${project.id}/quotes?v=${versionId}&r=${r.no}`} className="badge bg-white text-muted underline-offset-2 hover:underline" data-testid={`prev-rev-${r.no}`}>
                  이전 요청 기준 제안 보기 · r{r.no} · {ofRev(r).length}건
                </Link>
              ))
            : latestRev && (
                <Link href={`/projects/${project.id}/quotes?v=${versionId}`} className="badge bg-white text-brand" data-testid="back-latest">
                  ← 최신 요청 r{latestRev.no}로 돌아가기
                </Link>
              )}
        </div>
      )}
      {isOld && <Notice tone="warn">이전 도면 버전으로 받은 제안입니다. 현재 기준 버전의 제안과 금액을 직접 비교하지 마세요.</Notice>}
      {shownRev && cmp.cols.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-sand px-4 py-3 text-sm" data-testid="same-basis">
          <b className="text-brand">✓ 아래 제안 {cmp.cols.length}건 모두 요청 r{shownRev.no}{spaceRequest ? ` · 배치 버전 ${shownRev.snapshot.version.no}` : ""} 기준</b>
          <span className="text-xs text-muted">{homeSent ? "같은 집 정보·공사 범위·자료를 받은 업체가" : "같은 배치·치수·조건을 받은 업체가"} 서로의 금액과 제안을 보지 못한 채 낸 비공개 제안입니다.</span>
        </p>
      )}
      {shownRev && latestRev && shownRev.id !== latestRev.id && cmp.cols.length > 0 && (
        <Notice tone="warn">
          요청 내용 r{shownRev.no} 기준으로 받은 제안입니다. 지금 요청 내용은 r{latestRev.no}입니다({latestRev.changes.slice(0, 2).join(", ")}
          {latestRev.changes.length > 2 ? " 외" : ""}). 업체가 바뀐 내용을 확인하면 r{latestRev.no} 기준으로 옮겨집니다.
        </Notice>
      )}
      {onLatest && reconfirming > 0 && cmp.cols.length > 0 && (
        <p className="text-xs text-muted" data-testid="reconfirming-note">
          이전 요청 기준 제안 {reconfirming}건은 업체가 바뀐 내용을 확인하는 중이라 이 비교에서 뺐습니다. 업체가 확인하면 r{latestRev?.no} 기준으로 여기에 들어옵니다.
        </p>
      )}

      {cmp.cols.length === 0 ? (
        // 빈 상태 세 가지: 이전 요청에 남은 제안 없음 / 변경 뒤 업체 재확인 대기 / 최초 요청의 제안 대기
        !onLatest && latestRev ? (
          <div className="rounded-2xl border border-line bg-surface px-5 py-6 text-sm leading-relaxed" data-testid="old-rev-empty">
            <p className="text-base font-semibold">
              이 요청 기준으로 남아 있는 제안이 없습니다. 최신 요청 r{latestRev.no}에서 확인해 주세요.
            </p>
            <p className="mt-1 text-muted">
              이전 요청 기준 제안은 업체가 바뀐 내용을 확인하면 최신 요청 기준으로 옮겨집니다. 이 화면에서는 요청 r{shownRev?.no}의 기준 배치와 기록을 볼 수 있습니다.
            </p>
            <Link href={`/projects/${project.id}/quotes?v=${versionId}`} className="btn btn-sm btn-primary mt-3" data-testid="old-rev-go-latest">
              최신 요청 r{latestRev.no}에서 제안 보기
            </Link>
          </div>
        ) : onLatest && reconfirming > 0 ? (
          <div className="rounded-2xl border border-line bg-surface px-5 py-6 text-sm leading-relaxed" data-testid="reconfirming-empty">
            <p className="text-base font-semibold">업체가 변경 내용을 확인 중입니다</p>
            <p className="mt-1 text-muted">
              {latestRev?.snapshot.home ? (
                <>{josa(`요청 r${latestRev.no}`, "을", "를")} 보냈습니다.</>
              ) : (
                <>
                  요청 r{latestRev?.no}(배치 버전 {latestRev?.snapshot.version.no}){josa(String(latestRev?.snapshot.version.no ?? ""), "을", "를").slice(String(latestRev?.snapshot.version.no ?? "").length)} 보냈습니다.
                </>
              )} 아직 이 기준으로 확인한 제안이 없습니다. 업체가 바뀐 내용을 확인하고 제안을 유지하거나 고치면 여기에 하나씩 들어옵니다.
            </p>
            <p className="mt-2 text-xs text-muted">이전 요청 기준으로 받은 제안 {reconfirming}건은 위의 ‘이전 요청 기준 제안 보기’에서 따로 볼 수 있습니다. 서로 다른 요청 기준의 금액은 한 표에서 비교하지 않습니다.</p>
          </div>
        ) : (
          <Empty>
            아직 도착한 제안이 없습니다.
            {waiting ? ` 요청을 받은 시공사: ${waiting}.` : " 운영자가 자료를 검토하고 시공사를 배정하는 중입니다."}
          </Empty>
        )
      ) : (
        <>
          {!cmp.sameScope && (
            <Notice tone="warn" title="시공사마다 공사 범위가 다릅니다">
              그래서 금액이 가장 낮은 제안에 ‘최저’를 붙이지 않았습니다. 아래 항목이 서로 다르게 처리되어 있습니다.
              <ul className="mt-2 space-y-1.5 text-ink">
                {cmp.diffs.map((d) => (
                  <li key={d.key}>
                    <b>{d.label}</b>
                    <span className="mt-0.5 block text-xs leading-relaxed">
                      {d.cells.map((c, i) => (
                        <span key={i} className="mr-3 inline-block">
                          {name(cmp.cols[i].q.id)}:{" "}
                          <b className={c.cls === "unresolved" ? "text-warn" : ""}>
                            {ITEM_STATUS[c.status]}
                            {c.cls === "priced" && ` ${won(c.amount)}`}
                          </b>
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </Notice>
          )}

          {cmp.lowestHiddenForUnresolved && (
            <Notice>금액이 정해지지 않은 항목이 있어 ‘최저’를 표시하지 않았습니다. 현장 확인 뒤 금액이 더해지면 순서가 바뀔 수 있습니다.</Notice>
          )}

          {/* 제안 카드: 모바일에서는 이것만으로 비교할 수 있게 한다 */}
          <ul className={`grid gap-4 ${cmp.cols.length > 2 ? "lg:grid-cols-3" : "md:grid-cols-2"}`}>
            {cmp.cols.map((col) => {
              const visit = visits.find((v) => v.quote_id === col.q.id);
              return (
                <ProposalCard key={col.q.id} col={col} cmp={cmp} vendor={vendors.get(col.q.id)!} history={getRevisionHistory(col.q.id)} design={designOf(col.q)}>
                  {isOld ? null : visit ? (
                    <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand">
                      {visit.status === "requested" ? "상담·현장 방문을 요청했습니다" : "시공사가 방문 요청을 확인했습니다"}
                      {visit.preferred && <span className="block text-xs">희망 일정: {visit.preferred}</span>}
                    </p>
                  ) : finished ? null : (
                    <details className="group">
                      <summary className="btn btn-primary w-full list-none group-open:hidden">상담·현장 방문 요청</summary>
                      <form action={requestVisit.bind(null, col.q.id)} className="space-y-2">
                        <input className="input" name="preferred" placeholder="희망 일정 (예: 10/12 오후)" aria-label="희망 방문 일정" />
                        <input className="input" name="message" placeholder="전달할 말 (선택)" aria-label="시공사에 전달할 말" />
                        <button className="btn btn-primary w-full">요청 보내기</button>
                        <p className="text-[11px] leading-relaxed text-muted">요청하면 이 시공사에 상세 주소와 연락처가 공개됩니다.</p>
                      </form>
                    </details>
                  )}
                </ProposalCard>
              );
            })}
          </ul>

          <section>
            <h2 className="h-section">항목 구분 읽는 법</h2>
            <StatusLegend />
          </section>

          {!cmp.sameScope && cmp.commonKeys.length > 0 && (
            <Notice title="공통 항목 합계를 볼 때">
              공통 항목 합계는 모든 시공사가 금액을 확정한 {cmp.commonKeys.length}개 항목만 더한 값입니다. 항목 이름이 같다고 해서 <b>자재, 수량, 공사 범위가 같다는 뜻은 아닙니다.</b> 아래 표의 자재·사양을 함께 확인하고, 다른 부분은 상담 때 같은 기준으로 맞춰 달라고 요청하세요.
            </Notice>
          )}

          {/* 항목별 상세: 넓은 화면은 표 */}
          <section className="hidden md:block">
            <h2 className="h-section">공사 범위와 자재 사양</h2>
            <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="table-base">
                <thead>
                  <tr>
                    <th className="w-40">공사 항목</th>
                    {cmp.cols.map(({ q }) => (
                      <th key={q.id} className="min-w-52 !text-sm !font-semibold !text-ink">
                        {name(q.id)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cats.map((c) => (
                    <tr key={c.key} className={diffKeys.has(c.key) ? "bg-warn-soft/50" : undefined}>
                      <td className="font-medium">
                        {c.label}
                        {requestedWorks.has(c.key) && <span className="mt-1 block text-[11px] font-normal text-brand">요청 범위</span>}
                        {diffKeys.has(c.key) && <span className="mt-1 block text-[11px] font-normal text-warn">범위 다름</span>}
                      </td>
                      {cmp.cols.map(({ q }) => (
                        <td key={q.id}>
                          <ItemCell it={q.items.find((x) => x.key === c.key)!} />
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="bg-sand/60">
                    <td className="font-semibold">
                      견적 합계
                      <span className="block text-xs font-normal text-muted">포함 항목, 제출 금액</span>
                    </td>
                    {cmp.cols.map(({ q, totals }) => (
                      <td key={q.id} className="tabular-nums">
                        {won(totals.included)}
                        <span className="block text-xs text-muted">부가세 {q.vat_included ? "포함" : "별도"}</span>
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-sand/60">
                    <td className="font-semibold">별도 비용</td>
                    {cmp.cols.map(({ q, separateWithVat, separateItems }) => (
                      <td key={q.id} className="tabular-nums">
                        {separateItems.length ? `+ ${won(separateWithVat)}` : <span className="text-muted">없음</span>}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-sand/60">
                    <td className="font-semibold">
                      현재 산정 금액
                      <span className="block text-xs font-normal text-muted">견적 합계 + 별도, 부가세 포함</span>
                    </td>
                    {cmp.cols.map(({ q, payableWithVat }) => (
                      <td key={q.id} className="text-base font-bold tabular-nums">
                        {won(payableWithVat)} {cmp.lowestId === q.id && <Badge tone="brand">최저</Badge>}
                      </td>
                    ))}
                  </tr>
                  {!cmp.sameScope && cmp.commonKeys.length > 0 && (
                    <tr className="bg-sand/60">
                      <td className="font-semibold">
                        공통 항목 합계
                        <span className="block text-xs font-normal text-muted">모두 확정한 {cmp.commonKeys.length}개 항목</span>
                      </td>
                      {cmp.cols.map(({ q, commonWithVat }) => (
                        <td key={q.id} className="font-semibold tabular-nums">
                          {won(commonWithVat)} {cmp.commonLowestId === q.id && <Badge tone="brand">공통 항목 기준 최저</Badge>}
                        </td>
                      ))}
                    </tr>
                  )}
                  {spaceRequest && (
                    <tr data-testid="design-row">
                      <td className="font-medium">
                        설계 제안
                        <span className="block text-xs font-normal text-muted">고객 배치 기준</span>
                      </td>
                      {cmp.cols.map(({ q }) => (
                        <td key={q.id}>
                          <DesignBlock design={designOf(q)!} />
                        </td>
                      ))}
                    </tr>
                  )}
                  <tr>
                    <td className="font-medium">금액 미정</td>
                    {cmp.cols.map(({ q, unresolvedKeys }) => (
                      <td key={q.id}>{unresolvedKeys.length ? <Badge tone="warn">{unresolvedKeys.length}항목 · 현장 확인 뒤 추가</Badge> : <span className="text-muted">없음</span>}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="font-medium">공사 범위에 없음</td>
                    {cmp.cols.map(({ q, excludedKeys }) => (
                      <td key={q.id}>{excludedKeys.length ? <Badge>{excludedKeys.length}항목</Badge> : <span className="text-muted">없음</span>}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 항목별 상세: 좁은 화면은 항목마다 시공사를 세로로 쌓는다 */}
          <details className="card md:hidden">
            <summary className="cursor-pointer text-sm font-semibold">항목별 금액·자재 사양 보기 · {total}개 항목</summary>
            <ul className="mt-3 divide-y divide-line">
              {cats.map((c) => (
                <li key={c.key} className="py-3">
                  <p className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
                    {c.label}
                    {requestedWorks.has(c.key) && <Badge tone="brand">요청 범위</Badge>}
                    {diffKeys.has(c.key) && <Badge tone="warn">범위 다름</Badge>}
                  </p>
                  <ul className="space-y-1.5">
                    {cmp.cols.map(({ q }) => (
                      <li key={q.id} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 text-sm">
                        <span className="truncate text-xs leading-6 text-muted">{name(q.id)}</span>
                        <span>
                          <ItemCell it={q.items.find((x) => x.key === c.key)!} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </details>

          {waiting && <p className="text-sm text-muted">아직 제안을 내지 않은 시공사: {waiting}</p>}
        </>
      )}
    </div>
  );
}
