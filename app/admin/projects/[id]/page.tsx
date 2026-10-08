import PostReferences from "@/components/community/PostReferences";
import {projectPostRefs} from "@/lib/post-refs";
import Link from "next/link";
import { notFound } from "next/navigation";
import LayoutStudio from "@/components/LayoutStudio";
import SpaceView from "@/components/space/SpaceView";
import { versionOption } from "@/lib/space/view";
import { Field, StateForm } from "@/components/forms";
import { Advisories, BriefTable, BulletList, FileList, NeedsReview } from "@/components/project";
import { RefCases } from "@/components/cases";
import { Badge, Empty, Page, PageTitle, StatusBadge, Steps } from "@/components/ui";
import { adminSetStatus, assignVendors, closeInfoRequest, createInfoRequest, recordOutcome, remindAssignment, resolveChangeRequest, setProjectTest, withdrawAssignment } from "@/lib/actions";
import { getRequestRevisions, pendingChanges } from "@/lib/request-snapshot";
import { requireUser } from "@/lib/auth";
import { buildBrief, homeBrief } from "@/lib/brief";
import { FIELD_LABELS, HOME_INFO_ITEMS, INFO_ITEMS, INTAKE_MODES, PROJECT_STATUS, SPACE_KINDS, dateKo, isPast, kst, quoteTotals, won } from "@/lib/constants";
import HomeRoomsView from "@/components/home/HomeRoomsView";
import HouseView from "@/components/house/HouseView";
import { HOUSE_VENDOR_TEXT } from "@/lib/space/house";
import { HOME_TYPES, areaText } from "@/lib/home";
import { ROOM_VENDOR_TEXT } from "@/lib/space/home-room";
import { vendorFields, getAssignments, getChangeRequests, getCustomerContact, getEvents, getFavoriteVendorIds, getFiles, getInfoRequests, getProject, getProjectRefs, getQuoteRevisions, getQuotes, getVersions, getVisits, type Vendor } from "@/lib/data";
import { all } from "@/lib/db";

export default async function AdminProject({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("admin");
  const project = getProject(Number((await params).id));
  if (!project) notFound();
  const versions = getVersions(project.id);
  const version = versions.find((v) => v.id === (project.requested_version_id ?? project.current_version_id)) ?? versions[0];
  const home = version.home;
  const brief = home ? homeBrief(project, home, version.rooms.length) : buildBrief(project, version.input, version.result, version.room);
  const contact = getCustomerContact(project);
  // 실제 업체를 먼저, 시연용 예시 업체(시드 계정)는 따로 묶는다. 예시 업체는 실제로 응답하지 않는다.
  const vendors = all<Vendor & { demo: number }>(`SELECT v.*, u.is_demo AS demo FROM vendors v JOIN users u ON u.id = v.user_id WHERE v.status = 'approved' ORDER BY u.is_demo, v.id`);
  // 집 요청이면 주거 분야 업체를 먼저 보여 준다(분야가 없는 업체도 배정할 수는 있다).
  const fits = (v: Vendor) => vendorFields(v).includes(project.kind);
  const byField = (list: typeof vendors) => (home ? [...list.filter(fits), ...list.filter((v) => !fits(v))] : list);
  const vendorGroups = [
    { key: "real", label: "실제 업체", list: byField(vendors.filter((v) => !v.demo)) },
    { key: "demo", label: "예시 업체 · 시연용 계정이라 실제로 응답하지 않아요", list: byField(vendors.filter((v) => v.demo)) },
  ].filter((g) => g.list.length);
  const assignments = getAssignments(project.id, project.requested_version_id ?? -1);
  const quotes = getQuotes(project.id).filter((q) => q.version_id === project.requested_version_id);
  const visits = getVisits(project.id);
  const changes = getChangeRequests(project.id);
  const ok = version.layout_status === "ok";
  const wished = new Set(getFavoriteVendorIds(project.customer_id));
  const refs = getProjectRefs(project.id);
  const refVendors = new Set(refs.map((x) => x.c.vendor_id));
  const infos = getInfoRequests(project.id);
  const revisions = getRequestRevisions(project.id);
  const unsent = pendingChanges(project);
  const files = getFiles(project.id);
  const live = assignments.filter((a) => !a.withdrawn_at);
  const vendorName = (id: number) => all<Vendor>(`SELECT * FROM vendors WHERE id = ?`, id)[0]?.company ?? "—";

  return (
    <Page>
      <PageTitle
        title={project.title}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={project.status} />
            {project.is_test ? <Badge tone="warn">테스트 요청</Badge> : null}
            <Badge tone={home ? "brand" : "plain"}>{SPACE_KINDS[project.kind]}</Badge>
            {project.region} · {home ? `${HOME_TYPES[home.homeType]} · 방 배치 ${version.rooms.length}개` : `검토 기준 v${version.no}`}
            {!home && version.input.intake && <Badge>{INTAKE_MODES[version.input.intake].label}</Badge>}
            {!home && versions[0].id !== version.id && <Badge tone="warn">고객의 최신 버전은 v{versions[0].no}</Badge>}
          </span>
        }
        actions={
          <>
            <Link href="/admin" className="btn">
              목록
            </Link>
            <Link href={`/projects/${project.id}`} className="btn">
              고객 화면으로 보기
            </Link>
            {!home && (
              <Link href={`/projects/${project.id}/edit`} className="btn">
                조건 조정·재생성
              </Link>
            )}
            <form action={setProjectTest.bind(null, project.id)}>
              <input type="hidden" name="test" value={project.is_test ? "0" : "1"} />
              <button className="btn">{project.is_test ? "실제 요청으로 표시" : "테스트 요청으로 표시"}</button>
            </form>
          </>
        }
      />
      <div className="space-y-5">
        <div className="card">
          <Steps status={project.status} />
        </div>

        <section className="card" data-testid="admin-intake">
          <h2 className="h-section">자료 확인</h2>
          {home ? (
            <p className="text-sm">
              집 · <b>{HOME_TYPES[home.homeType]}</b> · 면적 {areaText(home)} · 파일 {files.length}개 · 방 배치 {version.rooms.length}개
            </p>
          ) : (
          <p className="text-sm">
            가진 자료: <b>{version.input.intake ? INTAKE_MODES[version.input.intake].label : "기록 없음"}</b> · 실내 치수 {version.input.widthM ? `${version.input.widthM} × ${version.input.depthM} m` : "미입력"} · 파일 {files.length}개
            {files.some((f) => f.category === "sketch") && " (손그림 포함)"} · 배치안 {ok ? "있음" : "없음"}
          </p>
          )}
          {!ok && !home && <p className="mt-1 text-xs text-muted">배치안이 없는 요청입니다. 자료가 부족하면 아래에서 고객에게 요청하세요. 치수를 받으면 ‘조건 조정·재생성’에서 입력해 배치안을 만들 수 있습니다.</p>}
          {infos.length > 0 && (
            <ul className="mt-3 space-y-2 text-sm">
              {infos.map((r) => (
                <li key={r.id} className="rounded-lg border border-line bg-white p-3">
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <Badge tone={r.status === "open" ? "warn" : r.status === "answered" ? "brand" : "plain"}>{r.status === "open" ? "고객 답변 대기" : r.status === "answered" ? "고객 답변함" : "확인 완료"}</Badge>
                    {dateKo(r.created_at)}
                  </p>
                  <p className="mt-1">{[r.items.join(", "), r.message].filter(Boolean).join(" — ")}</p>
                  {r.reply && <p className="mt-1 text-muted">고객: {r.reply}</p>}
                  {r.status === "answered" && (
                    <form action={closeInfoRequest.bind(null, r.id)} className="mt-2">
                      <button className="btn btn-sm">확인 완료</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
          <StateForm action={createInfoRequest.bind(null, project.id)} submit="고객에게 자료 요청" resetOnOk className="mt-4 border-t border-line pt-4">
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {(home ? HOME_INFO_ITEMS : INFO_ITEMS).map((item) => (
                <label key={item} className="flex items-center gap-1.5">
                  <input type="checkbox" name="item" value={item} className="size-4 accent-brand" /> {item}
                </label>
              ))}
            </div>
            <textarea className="input mt-3" name="message" rows={2} placeholder="예: 출입구 쪽 벽과 창이 보이게 사진을 두 장 더 부탁드립니다." aria-label="자료 요청 내용" />
          </StateForm>
        </section>

        <section className="card" data-testid="admin-revisions">
          <h2 className="h-section">업체에 보낸 요청 내용 · {revisions.length}회</h2>
          {revisions.length === 0 ? (
            <p className="text-sm text-muted">아직 요청을 보내지 않았습니다.</p>
          ) : (
            <ol className="space-y-2 text-sm">
              {[...revisions].reverse().map((r) => (
                <li key={r.id} className="rounded-lg border border-line bg-white p-3">
                  <b>r{r.no}</b> <span className="text-xs text-muted">{dateKo(r.created_at)} · {r.snapshot.home ? `방 배치 ${r.snapshot.rooms?.length ?? 0}개` : `도면 v${r.snapshot.version.no}`} · 참고 사례 {r.snapshot.refs.length} · 파일 {r.snapshot.files.length}</span>
                  {r.changes.length > 0 && (
                    <ul className="mt-1 list-disc pl-4 text-xs leading-relaxed text-muted">
                      {r.changes.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
          {unsent.length > 0 && <p className="mt-3 rounded-lg bg-warn-soft p-2.5 text-xs leading-relaxed text-warn">고객이 바꿨지만 아직 업체에 보내지 않은 내용 {unsent.length}건: {unsent.slice(0, 3).join(" / ")}</p>}
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="card">
            <h2 className="h-section">고객과 요구사항</h2>
            <BriefTable
              brief={brief}
              extra={[
                ["고객", `${contact?.name} · ${contact?.phone || "연락처 없음"} · ${contact?.email}`],
                ["상세 주소", project.address || "미입력"],
              ]}
            />
          </section>
          <section className="card">
            <h2 className="h-section">업체 배정</h2>
            <p className="mb-3 text-xs text-muted" data-testid="admin-bid-mode">받는 방식: {project.bid_mode === "open" ? `운영자 배정 + 업체 직접 참여(최대 ${project.bid_cap}곳, 배정 업체 포함)` : "운영자 배정만"} · <Link href={`/projects/${project.id}/info#bid-mode`} className="underline">바꾸기</Link></p>
            {!project.requested_version_id ? (
              <p className="text-sm text-muted">고객이 아직 견적을 요청하지 않았습니다.</p>
            ) : vendors.length === 0 ? (
              <p className="text-sm text-muted">승인된 업체가 없습니다.</p>
            ) : (
              <>
              {live.length > 0 && (
                <ul className="mb-4 space-y-2 text-sm" data-testid="admin-assignments">
                  {live.map((a) => {
                    const deadline = a.status === "invited" ? (a.accepted_at ? a.quote_by : a.respond_by) : null;
                    const late = isPast(deadline);
                    return (
                      <li key={a.id} className={`rounded-lg border p-3 ${late ? "border-danger/40 bg-warn-soft" : "border-line bg-white"}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <b>{vendorName(a.vendor_id)}</b>
                          {a.source === "self" && <Badge>직접 참여</Badge>}
                          <Badge tone={a.status === "quoted" ? "brand" : a.status === "declined" ? "plain" : "warn"}>{a.status === "quoted" ? "제안 제출" : a.status === "declined" ? "참여 안 함" : a.accepted_at ? "작성 중" : "참여 검토 중"}</Badge>
                          {deadline && (
                            <span className={`text-xs ${late ? "font-semibold text-danger" : "text-muted"}`}>
                              {a.accepted_at ? "제안" : "답변"} 기한 {kst(deadline)}
                              {late && " · 지남"}
                            </span>
                          )}
                          {a.reminded_at && <span className="text-xs text-muted">재알림 {kst(a.reminded_at)}</span>}
                        </div>
                        {a.status === "invited" && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <form action={remindAssignment.bind(null, a.id)}>
                              <button className="btn btn-sm">다시 알리기</button>
                            </form>
                            <form action={withdrawAssignment.bind(null, a.id)} className="flex gap-1">
                              <input className="input !py-1 text-xs" name="reason" placeholder="취소 사유 (업체에 전달)" aria-label="배정 취소 사유" />
                              <button className="btn btn-sm btn-danger shrink-0">배정 취소</button>
                            </form>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {home && <p className="mb-3 rounded-lg bg-brand-soft px-3 py-2 text-xs leading-relaxed text-brand" data-testid="home-assign-hint">집 요청입니다. 시공 분야에 ‘주거’가 있는 업체를 먼저 보여 줍니다. 분야가 없는 업체도 배정할 수는 있습니다.</p>}
              <StateForm action={assignVendors.bind(null, project.id)} submit="선택한 업체 배정">
                {vendorGroups.map((g) => (
                  <fieldset key={g.key} className="space-y-2" data-testid={`vendor-group-${g.key}`}>
                    <legend className={`mb-1 text-xs font-semibold ${g.key === "demo" ? "text-warn" : "text-muted"}`}>{g.label}</legend>
                    <ul className="space-y-2">
                      {g.list.map((v) => {
                        const a = assignments.find((x) => x.vendor_id === v.id);
                        return (
                          <li key={v.id}>
                            <label className="flex items-start gap-2 text-sm">
                              <input type="checkbox" name="vendor" value={v.id} disabled={!!a && !a.withdrawn_at} defaultChecked={!!a && !a.withdrawn_at} className="mt-1 size-4 accent-brand" />
                              <span>
                                <b>{v.company}</b> {v.demo ? <Badge tone="warn">예시</Badge> : <Badge tone="brand">실제</Badge>}{" "}
                                <span className="text-xs text-muted" data-testid={`vendor-fields-${v.id}`}>분야 {vendorFields(v).map((f) => FIELD_LABELS[f]).join("·")}</span>
                                {home && !fits(v) && <Badge>주거 분야 없음</Badge>} {wished.has(v.id) && <Badge tone="brand">♥ 고객 관심 업체</Badge>} {refVendors.has(v.id) && <Badge tone="warn">참고 사례의 시공사</Badge>}{" "}
                                {a && <Badge tone={a.withdrawn_at ? "plain" : a.status === "quoted" ? "brand" : a.status === "declined" ? "plain" : "warn"}>{a.withdrawn_at ? "배정 취소됨" : a.status === "quoted" ? "제안 제출" : a.status === "declined" ? "참여 안 함" : a.accepted_at ? "작성 중" : "참여 검토 중"}</Badge>}
                                <span className="block text-xs text-muted">
                                  {v.regions || "지역 미입력"} · {v.specialties}
                                </span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </fieldset>
                ))}
              </StateForm>
              </>
            )}
          </section>
        </div>

        {home ? (
          <>
            <section>
              <h2 className="h-section">방 배치 · {version.rooms.length}개</h2>
              <HomeRoomsView rooms={version.rooms} note={ROOM_VENDOR_TEXT} empty="고객이 방 배치를 만들지 않았습니다(선택 항목)." />
            </section>
            <section data-testid="admin-house">
              <h2 className="h-section">집 전체 평면</h2>
              {version.house ? (
                <HouseView house={version.house} note={HOUSE_VENDOR_TEXT} underlayUrl={version.house.underlay?.fileId ? `/files/${version.house.underlay.fileId}` : null} />
              ) : (
                <p className="text-sm text-muted">고객이 집 전체 평면을 만들지 않았습니다(선택 항목).</p>
              )}
            </section>
          </>
        ) : version.room && version.placement ? (
          <SpaceView option={versionOption(version)!} styleId={version.selected_style} label={`버전 ${version.no} · 고객 ${version.source === "edited" ? "직접 수정" : "저장"} 배치`} />
        ) : ok ? (
          <>
            <LayoutStudio options={version.result.options} savedOption={version.selected_option} savedStyle={version.selected_style} recommendedOption={version.result.recommended} skipped={version.result.skipped} savedLabel="고객 선택" />
            <Advisories result={version.result} />
          </>
        ) : (
          <NeedsReview result={version.result}>사진과 도면을 확인한 뒤 ‘조건 조정·재생성’으로 가능한 조건을 찾아 주거나, 배치안 없이 업체를 배정해 상담으로 진행하세요.</NeedsReview>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="card">
            <h2 className="h-section">수정 요청</h2>
            {changes.length === 0 ? (
              <p className="text-sm text-muted">수정 요청이 없습니다.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {changes.map((c) => (
                  <li key={c.id} className="rounded-lg border border-line bg-white p-3">
                    <div className="mb-1 flex items-center gap-2 text-xs text-muted">
                      <Badge tone={c.status === "open" ? "warn" : "brand"}>{c.status === "open" ? "확인 대기" : "답변 완료"}</Badge>
                      {dateKo(c.created_at)} · v{versions.find((v) => v.id === c.version_id)?.no}
                    </div>
                    {c.body}
                    {c.status === "open" ? (
                      <form action={resolveChangeRequest.bind(null, c.id)} className="mt-2 flex gap-2">
                        <input className="input" name="reply" placeholder="반영 내용이나 안내를 적어 주세요" required aria-label="답변" />
                        <button className="btn btn-sm shrink-0">답변</button>
                      </form>
                    ) : (
                      <p className="mt-2 border-t border-line pt-2 text-muted">운영자: {c.reply}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card">
            <h2 className="h-section">배치안의 가정 · 업체 확인 사항</h2>
            {ok && <BulletList items={version.result.assumptions} />}
            <div className="mt-3 border-t border-line pt-3">
              <BulletList items={brief.vendorChecks} />
            </div>
          </section>
        </div>

        <section className="card">
          <h2 className="h-section">고객이 연결한 참고 사례 · {refs.length}건</h2>
          <RefCases refs={refs} />
        </section>

        <section className="card">
          <h2 className="h-section">사진과 도면</h2>
          <FileList files={getFiles(project.id)} />
        </section>

        <section className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="h-section !mb-0">도착한 견적 · {quotes.length}건</h2>
            {quotes.length > 0 && (
              <Link href={`/projects/${project.id}/quotes`} className="btn btn-sm">
                비교 화면 보기
              </Link>
            )}
          </div>
          {quotes.length === 0 ? (
            <Empty>도착한 견적이 없습니다.</Empty>
          ) : (
            <table className="table-base">
              <thead>
                <tr>
                  <th>업체</th>
                  <th>포함 합계</th>
                  <th>부가세</th>
                  <th>미확정</th>
                  <th>기간</th>
                  <th>현장 방문</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => {
                  const t = quoteTotals(q.items);
                  const visit = visits.find((v) => v.quote_id === q.id);
                  return (
                    <tr key={q.id}>
                      <td className="font-medium">{vendorName(q.vendor_id)}</td>
                      <td className="tabular-nums">{won(t.included)}</td>
                      <td>{q.vat_included ? "포함" : "별도"}</td>
                      <td>{t.unresolved ? <Badge tone="warn">{t.unresolved}항목</Badge> : "없음"}</td>
                      <td>
                        {q.duration_days}일
                        {getQuoteRevisions(q.id).length > 1 && <span className="block text-xs text-muted">수정 {getQuoteRevisions(q.id).length - 1}회</span>}
                      </td>
                      <td>{visit ? <Badge tone="brand">{visit.status === "requested" ? `요청됨 ${visit.preferred}` : "업체 확인"}</Badge> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="card">
            <h2 className="h-section">진행 상태 변경</h2>
            <form action={adminSetStatus.bind(null, project.id)} className="space-y-3">
              <select name="status" className="input" defaultValue={project.status} aria-label="진행 상태">
                {Object.entries(PROJECT_STATUS).map(([key, s]) => (
                  <option key={key} value={key}>
                    {s.label}
                  </option>
                ))}
              </select>
              <input className="input" name="memo" placeholder="변경 사유 (진행 기록에 남습니다)" aria-label="변경 사유" />
              <button className="btn">상태 변경</button>
            </form>
          </section>
          <section className="card">
            <h2 className="h-section">계약 결과 기록</h2>
            <p className="mb-3 text-xs text-muted">계약은 업체의 기존 절차로 진행하고, 여기에는 결과만 기록합니다.</p>
            <StateForm action={recordOutcome.bind(null, project.id)} submit="결과 기록" className="grid gap-3 sm:grid-cols-2">
              <Field label="결과">
                <select name="result" className="input" defaultValue="contracted">
                  <option value="contracted">계약 완료</option>
                  <option value="closed">계약 없이 종료</option>
                </select>
              </Field>
              <Field label="계약 업체">
                <select name="vendorId" className="input" defaultValue="">
                  <option value="">선택</option>
                  {assignments.map((a) => (
                    <option key={a.id} value={a.vendor_id}>
                      {vendorName(a.vendor_id)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="계약 금액 (만원)">
                <input className="input" name="amount" type="number" min="0" />
              </Field>
              <Field label="계약일">
                <input className="input" name="date" type="date" />
              </Field>
              <Field label="메모" className="sm:col-span-2">
                <input className="input" name="memo" />
              </Field>
            </StateForm>
          </section>
        </div>

        <section className="card">
          <h2 className="h-section">진행 기록</h2>
          <ul className="space-y-1.5 text-sm">
            {getEvents(project.id).map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className="shrink-0 text-xs leading-6 text-muted">{dateKo(e.created_at)}</span>
                <span>
                  {e.body}
                  {e.actor && <span className="text-xs text-muted"> · {e.actor}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <PostReferences refs={projectPostRefs(project.id)}/>
    </Page>
  );
}
