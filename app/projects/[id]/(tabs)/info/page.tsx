import PostReferences from "@/components/community/PostReferences";
import {projectPostRefs} from "@/lib/post-refs";
import {removePostReference} from "@/lib/community-actions";
import Link from "next/link";
import BidModeCard from "@/components/bid/BidModeCard";
import { StateForm } from "@/components/forms";
import { BriefTable, BulletList, FileList } from "@/components/project";
import { RefCases, caseMeta } from "@/components/cases";
import { addFiles, addProjectRef, answerInfoRequest, removeFile, removeProjectRef } from "@/lib/actions";
import { dateKo } from "@/lib/constants";
import { getRequestRevisions } from "@/lib/request-snapshot";
import { buildBrief, homeBrief } from "@/lib/brief";
import { getFiles, getInfoRequests, getProjectRefs, getSavedCases } from "@/lib/data";
import { loadProject } from "@/lib/project-context";

export default async function InfoTab({ params }: { params: Promise<{ id: string }> }) {
  const { user, project, current, finished } = await loadProject((await params).id);
  const refs = getProjectRefs(project.id);
  const addable = getSavedCases(project.customer_id).filter((c) => !refs.some((x) => x.case_id === c.id));
  const infos = getInfoRequests(project.id);
  const revisions = getRequestRevisions(project.id);
  const brief = current.home ? homeBrief(project, current.home, current.rooms.length) : buildBrief(project, current.input, current.result, current.room);
  const files = getFiles(project.id);
  return (
    <div className="space-y-5">
      {infos.length > 0 && (
        <section className="card scroll-mt-6" id="info-requests">
          <h2 className="h-section">운영자의 자료 요청</h2>
          <ul className="space-y-3 text-sm">
            {infos.map((r) => (
              <li key={r.id} className={`rounded-lg border p-3 ${r.status === "open" ? "border-warn/40 bg-warn-soft" : "border-line bg-white"}`}>
                <p className="text-xs text-muted">
                  {dateKo(r.created_at)} · {r.status === "open" ? "답변 필요" : r.status === "answered" ? "답변함 · 운영자 확인 중" : "확인 완료"}
                </p>
                {r.items.length > 0 && <p className="mt-1 font-semibold">{r.items.join(", ")}</p>}
                {r.message && <p className="mt-1 whitespace-pre-line leading-relaxed">{r.message}</p>}
                {r.reply && <p className="mt-2 border-t border-line pt-2 text-muted">내 답변: {r.reply}</p>}
                {r.status === "open" && !finished && (
                  <form action={answerInfoRequest.bind(null, r.id)} className="mt-3 space-y-2">
                    <textarea className="input" name="reply" rows={2} placeholder="아래에서 파일을 올린 뒤 남길 말을 적어 주세요. 예: 도면 올렸습니다. 가로 11.2m, 세로 8.9m입니다." aria-label="자료 요청 답변" />
                    <button className="btn btn-sm btn-primary">자료를 보냈다고 알리기</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-muted">{current.home ? "치수를 아는 방이 있으면 ‘방 배치’ 탭에서 방 한 칸씩 가구 배치를 그릴 수 있어요." : null}</p>
          <p className={current.home ? "hidden" : "mt-3 text-xs leading-relaxed text-muted"}>치수를 알게 되면 ‘공간·배치’ 탭에서 ‘치수로 내 공간 만들기’를 누르세요. 실제 공간을 3D로 만들고 가구를 직접 놓을 수 있어요.</p>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="h-section !mb-0">{current.home ? "요청 내용" : <>입력한 조건 · {current.room ? "버전 " : "v"}{current.no}</>}</h2>
            {!finished &&
              (current.home ? (
                <Link href={`/projects/${project.id}/request`} className="btn btn-sm" data-testid="info-edit-home">
                  {project.requested_version_id ? "요청 내용 고치기" : "요청서 쓰기"}
                </Link>
              ) : current.room ? (
                <span className="flex flex-wrap gap-1.5">
                  <Link href={`/projects/${project.id}/request`} className="btn btn-sm">
                    {project.requested_version_id ? "요청 내용 고치기" : "요청서 쓰기"}
                  </Link>
                  <Link href={`/projects/${project.id}/space`} className="btn btn-sm">
                    공간 정보
                  </Link>
                </span>
              ) : (
                <Link href={`/projects/${project.id}/edit`} className="btn btn-sm">
                  조건 변경
                </Link>
              ))}
          </div>
          <BriefTable brief={brief} extra={[["상세 주소", project.address || "미입력 (방문 요청 전까지 입력해 주세요)"]]} />
          <p className="mt-3 text-xs leading-relaxed text-muted">상세 주소와 연락처는 현장 방문을 요청한 업체에만 공개됩니다.</p>
        </section>
        <section className="card">
          {!current.home && (
            <>
              <h2 className="h-section">이 배치안의 가정</h2>
              {current.layout_status === "ok" ? <BulletList items={current.result.assumptions} /> : <p className="text-sm text-muted">자동 배치가 생성되지 않았습니다.</p>}
            </>
          )}
          <h2 className={`h-section ${current.home ? "" : "mt-5"}`}>업체에 함께 전달되는 확인 사항</h2>
          <BulletList items={brief.vendorChecks} />
        </section>
      </div>

      {project.requested_version_id && <BidModeCard project={project} />}
      <section className="card" id="refs">
        <h2 className="h-section">참고 사례 · {refs.length}건</h2>
        <p className="mb-3 text-xs leading-relaxed text-muted">원하는 분위기를 알리는 자료입니다. 운영자와 배정된 시공사가 요청서와 함께 봅니다. 배치 계산에는 쓰지 않습니다.</p>
        <RefCases
          refs={refs}
          emptyText="연결한 참고 사례가 없습니다. 사례를 저장해 두면 여기에서 연결할 수 있습니다."
          remove={
            finished
              ? undefined
              : (id) => (
                  <form action={removeProjectRef.bind(null, id)}>
                    <button className="btn btn-sm btn-danger" aria-label="참고 사례 연결 해제">
                      연결 해제
                    </button>
                  </form>
                )
          }
        />
        {!finished &&
          (addable.length > 0 ? (
            <form action={addProjectRef.bind(null, project.id)} className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
              <label className="block min-w-0 flex-1">
                <span className="label">저장한 사례에서 연결</span>
                <select className="input" name="caseId" defaultValue={addable[0].id}>
                  {addable.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} · {caseMeta(c)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block min-w-0 flex-1">
                <span className="label">마음에 든 점 (선택)</span>
                <input className="input" name="note" maxLength={300} placeholder="예: 회의실 유리 칸막이와 조명 톤" />
              </label>
              <button className="btn shrink-0">연결하기</button>
            </form>
          ) : (
            user.role === "customer" && (
              <p className="mt-4 border-t border-line pt-4 text-xs text-muted">
                더 연결하려면{" "}
                <Link href="/cases" className="text-brand underline">
                  사례를 둘러보고 저장
                </Link>
                해 주세요.
              </p>
            )
          ))}
      </section>

      <section className="card">
        <h2 className="h-section">사진과 도면 · {files.length}개</h2>
        <FileList
          files={files}
          remove={(id) => (
            <form action={removeFile.bind(null, id)}>
              <button className="btn btn-sm btn-danger" aria-label="파일 삭제">
                삭제
              </button>
            </form>
          )}
        />
        <StateForm action={addFiles.bind(null, project.id)} submit="파일 올리기" resetOnOk className="mt-4 border-t border-line pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">현재 공간 사진</span>
              <input className="input" name="photos" type="file" accept="image/*" multiple />
            </label>
            <label className="block">
              <span className="label">기존 도면 (이미지, PDF, DWG, DXF)</span>
              <input className="input" name="drawings" type="file" accept="image/*,.pdf,.dwg,.dxf" multiple />
            </label>
            <label className="block">
              <span className="label">손그림 평면 (사진, PDF)</span>
              <input className="input" name="sketches" type="file" accept="image/*,.pdf" multiple />
            </label>
          </div>
        </StateForm>
      </section>
      {revisions.length > 0 && (
        <section className="card" data-testid="sent-revisions">
          <h2 className="h-section">업체에 보낸 요청 내용 · {revisions.length}회</h2>
          <p className="mb-3 text-xs leading-relaxed text-muted">요청을 보낸 뒤 조건, 참고 사례, 자료를 바꾸면 위에 ‘바뀐 내용 업체에 보내기’가 나옵니다. 보낼 때마다 그때의 내용이 남고, 업체는 처음 받은 내용과 바뀐 점을 모두 볼 수 있습니다.</p>
          <ol className="space-y-2 text-sm">
            {[...revisions].reverse().map((r) => (
              <li key={r.id} className="rounded-lg border border-line bg-white p-3">
                <p className="flex flex-wrap justify-between gap-2">
                  <b>
                    요청 내용 r{r.no}
                    {r.no === revisions.length && " · 지금 업체가 보는 내용"}
                  </b>
                  <span className="text-xs text-muted">
                    {dateKo(r.created_at)} · {r.snapshot.home ? `방 배치 ${r.snapshot.rooms?.length ?? 0}개` : `도면 v${r.snapshot.version.no}`}
                  </span>
                </p>
                {r.changes.length > 0 ? (
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs leading-relaxed text-muted">
                    {r.changes.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-muted">처음 보낸 요청</p>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
      <PostReferences refs={projectPostRefs(project.id)} remove={user.role === "customer" && !finished ? (postId,photoId) => <form action={removePostReference.bind(null,project.id,postId,photoId)}><button className="btn btn-sm mt-2" aria-label="참고 게시물 연결 해제">연결 해제</button></form> : undefined}/>
    </div>
  );
}
