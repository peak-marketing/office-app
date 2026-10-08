import PostReferences from "@/components/community/PostReferences";
import {projectPostRefs} from "@/lib/post-refs";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import LayoutStudio from "@/components/LayoutStudio";
import { QuoteForm } from "@/components/forms";
import { Advisories, BulletList, FileList, NeedsReview } from "@/components/project";
import { RefCases } from "@/components/cases";
import { Badge, Notice, Page } from "@/components/ui";
import { RevisionList } from "@/components/proposals";
import { acceptAssignment, confirmVisit, declineAssignment, discardQuoteDraft, keepQuoteForRevision, saveQuoteDraft, submitQuote } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { buildBrief, homeBrief } from "@/lib/brief";
import { INTAKE_MODES, MOODS, dateKo, isPast, kst, quoteCategories, won } from "@/lib/constants";
import HomeRoomsView from "@/components/home/HomeRoomsView";
import HouseView from "@/components/house/HouseView";
import { HOUSE_VENDOR_TEXT } from "@/lib/space/house";
import { BriefTable } from "@/components/project";
import { HOME_TYPES } from "@/lib/home";
import { ROOM_VENDOR_TEXT } from "@/lib/space/home-room";
import { getCustomerContact, getFiles, getFilesByIds, getProject, getProjectRefs, getQuoteByAssignment, getQuoteDraft, getRevisionHistory, getVendorByUser, getVersion, getVisits, type Assignment } from "@/lib/data";
import { get } from "@/lib/db";
import { compareQuotes } from "@/lib/quotes";
import { homeFacts, requestFacts } from "@/lib/request-facts";
import { getStyle } from "@/lib/styles";
import { getRequestRevisions, projectAsSent, refsAsSent } from "@/lib/request-snapshot";
import SpaceView from "@/components/space/SpaceView";
import { CheckList, FurnitureTable, SpaceFacts } from "@/components/space/SpaceParts";
import { spaceCoverage } from "@/lib/space/coverage";
import { checkOption, composeOption } from "@/lib/space/placement";
import { sourceLabel } from "@/lib/space/view";

export default async function VendorRequest({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ rev?: string }> }) {
  const user = await requireUser("vendor");
  const wantedRev = Number((await searchParams).rev);
  const vendor = getVendorByUser(user.id);
  if (!vendor) redirect("/partner");
  const assignment = get<Assignment>(`SELECT * FROM assignments WHERE id = ? AND vendor_id = ?`, Number((await params).id), vendor.id);
  if (!assignment) notFound();
  const live = getProject(assignment.project_id)!;
  const version = getVersion(assignment.version_id)!;
  if (assignment.withdrawn_at)
    return (
      <Page narrow>
        <Link href="/vendor" className="text-sm text-muted hover:text-ink">
          ← 요청·제안
        </Link>
        <h1 className="mb-4 mt-2 text-2xl font-bold tracking-tight">
          {live.region} · {version.home ? HOME_TYPES[version.home.homeType] : `${version.input.areaPyeong}평 사무실`}
        </h1>
        <Notice tone="warn">운영자가 이 요청의 배정을 취소했습니다({dateKo(assignment.withdrawn_at)}). 요청 자료는 더 이상 볼 수 없습니다. 궁금한 점은 운영자에게 문의해 주세요.</Notice>
      </Page>
    );
  // 시공사는 살아 있는 프로젝트가 아니라 고객이 보낸 요청 내용(r번호)을 본다. 이전 요청 내용도 지우지 않는다.
  // 배치를 고쳐 보낸 요청도 이전 기록(r번호)을 함께 본다.
  const revs = getRequestRevisions(live.id);
  const latestRev = revs.at(-1);
  const viewing = revs.find((r) => r.no === wantedRev) ?? latestRev;
  const project = viewing ? projectAsSent(live, viewing.snapshot) : live;
  const input = version.input;
  // 집 요청: 보고 있는 요청 기록(r번호)에 고정된 집 정보와 방 배치(방별 버전 포함)를 본다.
  const sentHome = viewing?.snapshot.home ?? version.home;
  const sentRooms = viewing?.snapshot.rooms ?? version.rooms;
  // 집 전체 평면도 보고 있는 요청 기록에 들어 있는 것만 본다(고객이 고친 뒤 보내지 않은 평면은 보이지 않는다).
  const sentHouse = viewing ? (viewing.snapshot.house ?? null) : version.house;
  const facts = requestFacts(project, version);
  const hf = sentHome ? homeFacts(project, sentHome, sentRooms.length) : null;
  // 업체는 보고 있는 요청 기록(r번호)에 고정된 실제 구조로 설명을 본다.
  const brief = sentHome ? homeBrief(project, sentHome, sentRooms.length) : buildBrief(project, input, version.result, viewing?.snapshot.layout?.room ?? version.room);
  const quote = getQuoteByAssignment(assignment.id);
  const draft = getQuoteDraft(assignment.id);
  const history = quote ? getRevisionHistory(quote.id) : [];
  const files = viewing ? getFilesByIds(viewing.snapshot.files.map((f) => f.id)) : getFiles(project.id);
  const refs = viewing ? refsAsSent(project.id, viewing.snapshot) : getProjectRefs(project.id);
  const staleQuote = !!quote && !!latestRev && quote.request_rev_id !== latestRev.id;
  const chosen = version.result.options.find((o) => o.id === version.selected_option);
  // 고객이 보낸 배치(실제 구조 + 가구 위치) 그대로. 요청 기록에 복사된 값으로 그린다.
  const sentLayout = viewing?.snapshot.layout;
  const sentVersion = viewing ? (getVersion(viewing.snapshot.version.id) ?? version) : version;
  const sentBase = sentLayout ? (sentVersion.result.options.find((o) => o.id === sentLayout.start) ?? null) : null;
  const sentOption = sentLayout ? composeOption(sentLayout.room, sentBase, sentLayout.items) : null;
  const sentReport = sentOption && sentLayout ? checkOption(sentOption, sentLayout.staff) : null;
  // 상세 주소와 연락처는 고객이 이 시공사에 현장 방문을 요청했을 때만 보여 준다.
  const visit = getVisits(project.id).find((v) => v.vendor_id === vendor.id);
  const contact = visit ? getCustomerContact(project) : undefined;
  const finished = ["contracted", "closed"].includes(project.status);
  const outdated = project.requested_version_id !== assignment.version_id;
  const open = !finished && !outdated && assignment.status !== "declined" && vendor.status === "approved" && (!viewing || viewing.id === latestRev?.id);
  const accepted = !!assignment.accepted_at || assignment.status === "quoted";
  const ok = version.layout_status === "ok";
  const step = assignment.status === "declined" ? 0 : visit ? 4 : quote ? 3 : accepted ? 2 : 1;
  const tiles: [string, string, string?][] = hf
    ? [
        ["지역", hf.region, "상세 주소는 방문 요청 후 공개"],
        ["주거 유형·면적", hf.type, hf.area],
        ["방·욕실", hf.counts],
        ["예산", hf.budget],
        ["희망 일정", hf.schedule, hf.movein],
        ["공사 범위", hf.scope, hf.rooms],
      ]
    : [
    ["지역", facts.region, "상세 주소는 방문 요청 후 공개"],
    ["면적·인원", facts.area],
    ["공간 용도", facts.use],
    ["예산", facts.budget, facts.furniture],
    ["희망 일정", facts.schedule, facts.movein],
    ["요청 범위", facts.scope],
  ];
  const requests: [string, string][] = ((
    hf
      ? [
          ["원하는 공사 내용", project.work_scope ?? ""],
          ["기타 요청", project.notes],
        ]
      : [
      ["가진 자료", input.intake ? INTAKE_MODES[input.intake].label : ""],
      ["원하는 공사 내용", project.work_scope ?? ""],
      ["선호 분위기", MOODS[input.mood ?? "unknown"]],
      ["기타 요청", project.notes],
      ["현장 메모", input.siteNotes ?? ""],
      ["재사용 가구", input.reuseFurniture ?? ""],
    ]) as [string, string][]
  ).filter(([, v]) => v.trim());

  const actions = open && !accepted && (
    <div className="flex gap-2">
      <form action={acceptAssignment.bind(null, assignment.id)} className="flex-1">
        <button className="btn btn-primary w-full">참여하기</button>
      </form>
      <form action={declineAssignment.bind(null, assignment.id)}>
        <button className="btn">참여 안 함</button>
      </form>
    </div>
  );

  return (
    <Page>
      <Link href="/vendor" className="text-sm text-muted hover:text-ink">
        ← 요청·제안
      </Link>
      <div className="mb-5 mt-2">
        <h1 className="text-2xl font-bold tracking-tight">{hf?.title ?? facts.title}</h1>
        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
          {draft && open && <Badge tone="warn">{quote ? "수정 내용 임시 저장됨" : "임시 저장됨"}</Badge>}
          {assignment.status === "declined" ? <Badge>참여 안 함</Badge> : quote ? <Badge tone="brand">제안 제출함</Badge> : accepted ? <Badge tone="warn">제안 작성 중</Badge> : <Badge tone="brand">참여 여부 결정 필요</Badge>}
          {viewing && `요청 내용 r${viewing.no} · `}
          {hf ? `집 · ${hf.rooms}` : sentLayout ? `배치 버전 ${viewing!.snapshot.version.no}${viewing!.snapshot.version.source === "edited" ? " (고객이 직접 수정)" : sourceLabel(viewing!.snapshot.version.source ?? "") ? ` (${sourceLabel(viewing!.snapshot.version.source ?? "")})` : ""} · ${getStyle(viewing!.snapshot.version.selected_style).name}` : `요청 기준 도면 v${version.no}`}
          {!hf && !sentLayout && ok && ` · ${chosen?.title ?? "배치안"} · ${getStyle(version.selected_style).name}`} · 배정 {dateKo(assignment.created_at)}
        </p>
      </div>

      <div className="space-y-5 pb-20 lg:pb-0">
        {outdated && <Notice tone="warn">고객이 도면을 변경해 이 버전의 제안은 마감되었습니다. 새 버전으로 다시 배정되면 목록에 표시됩니다.</Notice>}
        {viewing && latestRev && viewing.id !== latestRev.id && (
          <Notice tone="warn">
            이전 요청 내용 r{viewing.no}({dateKo(viewing.created_at)})을 보고 있습니다.{" "}
            <Link href={`/vendor/requests/${assignment.id}`} className="underline">
              최신 요청 내용 r{latestRev.no} 보기
            </Link>
          </Notice>
        )}
        {revs.length > 1 && viewing?.id === latestRev?.id && latestRev && (
          <section className="rounded-2xl border border-brand/30 bg-brand-soft/60 p-5 text-sm" data-testid="rev-changes">
            <p className="font-semibold">
              고객이 요청 내용을 바꿨습니다 · r{latestRev.no} ({dateKo(latestRev.created_at)})
            </p>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs leading-relaxed">
              {latestRev.changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <p className="mt-3 flex flex-wrap gap-2 text-xs">
              이전 요청 내용:
              {revs.slice(0, -1).map((r) => (
                <Link key={r.id} href={`/vendor/requests/${assignment.id}?rev=${r.no}`} className="underline">
                  r{r.no} ({dateKo(r.created_at)})
                </Link>
              ))}
            </p>
          </section>
        )}
        {open && staleQuote && latestRev && (
          <Notice tone="warn" title={`제출한 제안은 이전 요청 내용 기준입니다`}>
            바뀐 내용을 확인하고 제안을 수정하거나, 금액과 범위에 영향이 없으면 그대로 유지한다고 알려 주세요. 고객은 같은 요청 내용(r{latestRev.no}) 기준 제안끼리 비교합니다.
            <div className="mt-3 flex flex-wrap gap-2">
              <form action={keepQuoteForRevision.bind(null, assignment.id)}>
                <button className="btn btn-sm btn-primary">확인했고 제안은 그대로 유지</button>
              </form>
              <a href="#proposal" className="btn btn-sm">
                제안 수정하기
              </a>
            </div>
          </Notice>
        )}
        {finished && <Notice>종료된 요청입니다.</Notice>}

        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {tiles.map(([label, value, sub]) => (
            <div key={label} className="rounded-xl border border-line bg-surface p-3.5">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="mt-1 text-sm font-semibold leading-snug">{value}</dd>
              {sub && <dd className="mt-0.5 text-[11px] text-muted">{sub}</dd>}
            </div>
          ))}
        </dl>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-5">
            <section>
              <h2 className="h-section">{hf ? "요청 내용" : sentLayout ? "고객이 보낸 배치" : "기준 도면"}</h2>
              {sentHome ? (
                <div className="space-y-4" data-testid="home-request">
                  <div className="card">
                    <BriefTable brief={brief} />
                  </div>
                  <h3 className="font-semibold">방 배치 · {sentRooms.length}개</h3>
                  <HomeRoomsView rooms={sentRooms} note={ROOM_VENDOR_TEXT} empty="고객이 방 배치를 보내지 않았습니다. 요청 내용과 사진·도면, 현장 확인을 기준으로 제안해 주세요." />
                  <h3 className="font-semibold">집 전체 평면</h3>
                  {sentHouse ? (
                    <HouseView house={sentHouse} note={HOUSE_VENDOR_TEXT} underlayUrl={sentHouse.underlay?.fileId ? `/files/${sentHouse.underlay.fileId}` : null} />
                  ) : (
                    <p className="text-sm text-muted" data-testid="house-none">
                      고객이 집 전체 평면을 보내지 않았습니다(선택 항목).
                    </p>
                  )}
                </div>
              ) : sentLayout && sentOption ? (
                <div className="space-y-4" data-testid="sent-layout" data-placement={JSON.stringify(sentLayout.items.map((it) => [it.id, it.x, it.y, it.rot]))}>
                  <p className="text-xs leading-relaxed text-muted">{sentLayout.room.source === "trace" ? "고객이 도면 위에 따라 그려 만든 공간" : "고객이 실제 치수로 만든 공간"}과 직접 정한 가구 위치입니다. 모든 참여 업체가 같은 배치를 받습니다. 진한 선은 고객이 입력한 실제 벽·출입문, 회색은 자동 배치가 제안한 칸막이입니다.</p>
                  <SpaceView option={sentOption} styleId={viewing!.snapshot.version.selected_style} label={`${sentLayout.start_title}에서 시작 · 업무석 ${sentOption.seats}석`} />
                  {sentReport && <CheckList report={sentReport} staff={sentLayout.staff} title="이 배치의 자동 검사 (고객 화면과 같음)" />}
                  <details className="card">
                    <summary className="cursor-pointer text-sm font-semibold">실제 공간과 가정·제안 구분</summary>
                    <div className="mt-3">
                      <SpaceFacts rows={spaceCoverage(sentLayout.room, sentVersion.input, sentBase, sentLayout.items)} />
                    </div>
                  </details>
                  <details className="card">
                    <summary className="cursor-pointer text-sm font-semibold">가구 목록 · {sentOption.furniture.reduce((n, f) => n + f.qty, 0)}점</summary>
                    <div className="mt-3">
                      <FurnitureTable furniture={sentOption.furniture} styleId={viewing!.snapshot.version.selected_style} />
                    </div>
                  </details>
                </div>
              ) : ok ? (
                <>
                  <LayoutStudio options={version.result.options} savedOption={version.selected_option} savedStyle={version.selected_style} savedLabel="고객 선택" compact />
                  <div className="mt-4">
                    <Advisories result={version.result} />
                  </div>
                </>
              ) : (
                <NeedsReview result={version.result}>자동 배치안이 없는 상담 건입니다. 아래 조건과 사진·도면을 기준으로 제안해 주세요.</NeedsReview>
              )}
            </section>

            <section className="card" id="refs">
              <h2 className="h-section">고객이 참고한 사례 · {refs.length}건</h2>
              <p className="mb-3 text-xs leading-relaxed text-muted">고객이 원하는 분위기를 알리려고 고른 공개 사례입니다. 같은 사양이나 금액을 요구하는 것은 아닙니다.</p>
              <RefCases refs={refs} ownVendorId={vendor.id} emptyText="고객이 연결한 참고 사례가 없습니다." />
            </section>

            <section className="card">
              <h2 className="h-section">현장 사진·기존 도면 · {files.length}개</h2>
              <FileList files={files} />
            </section>

            <div className="grid gap-5 md:grid-cols-2">
              <section className="card">
                <h2 className="h-section">고객 요청사항</h2>
                {requests.length ? (
                  <dl className="space-y-3 text-sm">
                    {requests.map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-xs text-muted">{label}</dt>
                        <dd className="mt-0.5 whitespace-pre-line leading-relaxed">{value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-sm text-muted">따로 남긴 요청사항이 없습니다.</p>
                )}
              </section>
              <section className="card">
                <h2 className="h-section">확인해 주실 사항</h2>
                <BulletList items={brief.vendorChecks} />
              </section>
            </div>

            {ok && !sentLayout && (
              <details className="card">
                <summary className="cursor-pointer text-sm font-semibold">배치안에 깔린 가정 보기</summary>
                <div className="mt-3">
                  <BulletList items={version.result.assumptions} />
                </div>
              </details>
            )}

            <section id="proposal" className="card scroll-mt-6">
              <h2 className="text-lg font-bold">{quote ? "제출한 제안" : "제안 작성"}</h2>
              {!open ? (
                <p className="mt-2 text-sm text-muted">
                  {vendor.status !== "approved" ? "운영자 승인 후 제안을 제출할 수 있습니다." : assignment.status === "declined" ? "참여하지 않기로 한 요청입니다." : quote ? "제출한 제안은 더 이상 수정할 수 없습니다." : "제안을 제출할 수 없는 상태입니다."}
                </p>
              ) : !accepted ? (
                <div className="mt-2">
                  <p className="mb-4 text-sm leading-relaxed text-muted">먼저 참여 여부를 알려 주세요. 참여를 확정하면 고객 화면에 ‘작성 중’으로 표시되고 제안서를 쓸 수 있습니다.</p>
                  {actions}
                </div>
              ) : (
                <>
                  <p className="mb-4 mt-2 text-sm leading-relaxed text-muted">
                    운영자가 선정한 여러 업체가 같은 요청 내용과 같은 항목으로 비공개로 가격·{sentLayout ? "설계·" : ""}자재·기간을 제안하고, 고객이 비교해 선택합니다. 다른 업체의 금액과 제안은 볼 수 없고, 최저가 자동 낙찰은 하지 않습니다.
                  </p>
                  <QuoteForm
                    action={submitQuote.bind(null, assignment.id)}
                    saveDraft={saveQuoteDraft.bind(null, assignment.id)}
                    discardDraft={discardQuoteDraft.bind(null, assignment.id)}
                    quote={quote}
                    draft={draft?.data}
                    customerFurniture={sentHome ? undefined : (sentLayout?.furniture_included ?? input.furnitureIncluded)}
                    categories={quoteCategories(live.kind)}
                    requestedWorks={sentHome?.scope === "partial" ? sentHome.works : []}
                    design={sentLayout ? { mode: quote?.design_mode ?? "", note: quote?.design_note ?? "", files: getFilesByIds(quote?.design_files ?? []).map((f) => ({ id: f.id, name: f.original_name })) } : undefined}
                  />
                </>
              )}
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-4 lg:h-fit">
            {visit && contact && (
              <section className="rounded-2xl border border-brand bg-surface p-5">
                <h2 className="h-section">
                  고객의 방문 요청 {visit.status === "confirmed" && <Badge tone="brand">확인함</Badge>}
                </h2>
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted">상세 주소</dt>
                    <dd>{project.address || "고객이 아직 입력하지 않았습니다"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">고객</dt>
                    <dd>
                      {contact.name} · {contact.phone || "연락처 미입력"}
                      <span className="block text-xs text-muted">{contact.email}</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">희망 일정</dt>
                    <dd>{visit.preferred || "미정"}</dd>
                  </div>
                  {visit.message && (
                    <div>
                      <dt className="text-xs text-muted">전달 사항</dt>
                      <dd>{visit.message}</dd>
                    </div>
                  )}
                </dl>
                {visit.status === "requested" && (
                  <form action={confirmVisit.bind(null, visit.id)} className="mt-4">
                    <button className="btn btn-primary w-full">방문 요청 확인</button>
                  </form>
                )}
              </section>
            )}

            <section className="card">
              <h2 className="h-section">참여 상태</h2>
              {open && !accepted && assignment.respond_by && (
                <p className={`mb-3 rounded-lg px-3 py-2 text-xs ${isPast(assignment.respond_by) ? "bg-warn-soft text-danger" : "bg-sand"}`} data-testid="deadline">
                  참여 여부 답변 기한 <b>{kst(assignment.respond_by)}</b>
                  {isPast(assignment.respond_by) && " · 기한 지남. 답이 없으면 다른 업체로 바뀔 수 있습니다."}
                </p>
              )}
              {open && accepted && !quote && assignment.quote_by && (
                <p className={`mb-3 rounded-lg px-3 py-2 text-xs ${isPast(assignment.quote_by) ? "bg-warn-soft text-danger" : "bg-sand"}`} data-testid="deadline">
                  제안 제출 기한 <b>{kst(assignment.quote_by)}</b>
                </p>
              )}
              <ol className="space-y-2.5 text-sm">
                {["요청 확인", "참여 확정", "제안 제출", "고객 상담·현장 방문"].map((label, i) => (
                  <li key={label} className="flex items-center gap-2.5">
                    <span className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${i < step ? "bg-brand text-white" : i === step ? "bg-ink text-white" : "border border-line bg-white text-muted"}`}>
                      {i < step ? "✓" : i + 1}
                    </span>
                    <span className={i === step ? "font-semibold" : i < step ? "" : "text-muted"}>{label}</span>
                  </li>
                ))}
              </ol>
              {quote && (
                <p className="mt-4 rounded-lg bg-sand px-3 py-2 text-sm">
                  <span className="text-xs text-muted">제출한 현재 산정 금액 · 부가세 포함</span>
                  <b className="block tabular-nums">{won(compareQuotes([quote]).cols[0].payableWithVat)}</b>
                </p>
              )}
              <div className="mt-4 hidden lg:block">
                {actions}
                {open && accepted && (
                  <a href="#proposal" className="btn btn-primary w-full">
                    {quote ? "제안 수정하기" : "제안 작성하기"}
                  </a>
                )}
              </div>
              {history.length > 0 && (
                <details className="mt-4" open={history.length > 1}>
                  <summary className="cursor-pointer text-xs font-semibold">제출 이력 · {history.length}회</summary>
                  <div className="mt-2">
                    <RevisionList history={history} />
                  </div>
                </details>
              )}
              {!visit && <p className="mt-4 text-xs leading-relaxed text-muted">상세 주소와 고객 연락처는 고객이 상담·현장 방문을 요청하면 이 자리에 공개됩니다.</p>}
            </section>
          </aside>
        </div>
      </div>

      <PostReferences refs={viewing ? (viewing.snapshot.postRefs ?? []) : projectPostRefs(project.id)}/>
      {/* 모바일: 주요 동작을 화면 아래에 고정한다 */}
      {open && (
        <div className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 p-3 backdrop-blur lg:hidden">
          {accepted ? (
            <a href="#proposal" className="btn btn-primary w-full">
              {quote ? "제안 수정하기" : "제안 작성하기"}
            </a>
          ) : (
            actions
          )}
        </div>
      )}
    </Page>
  );
}
