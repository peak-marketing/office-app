import Link from "next/link";
import { redirect } from "next/navigation";
import HouseView from "@/components/house/HouseView";
import { Badge } from "@/components/ui";
import { deleteHouse } from "@/lib/actions";
import { dateKo } from "@/lib/constants";
import { loadProject } from "@/lib/project-context";
import { lastSentRevision } from "@/lib/request-snapshot";
import { AUTO_LATER_TEXT } from "@/lib/space/home-room";
import { HOUSE_INDEPENDENT_TEXT, HOUSE_LABEL, HOUSE_SCOPE_TEXT } from "@/lib/space/house";

/** 집 요청의 ‘집 전체 평면’ 탭. 고객이 입력한 평면(실측 도면 아님)을 보고, 업체에 보낸 평면과의 차이를 알려 준다. */
export default async function HouseTab({ params }: { params: Promise<{ id: string }> }) {
  const { project, current, finished } = await loadProject((await params).id);
  if (!current.home) redirect(`/projects/${project.id}/plan`);
  const base = `/projects/${project.id}`;
  const house = current.house;
  const sent = project.requested_version_id ? lastSentRevision(project.id) : undefined;
  const sentHouse = sent?.snapshot.house ?? null;
  const status = !sent ? null : !house ? null : !sentHouse ? <Badge tone="warn">새 평면 · 업체에 아직 안 보냄</Badge> : sentHouse.rev === house.rev ? <Badge tone="brand">업체에 보낸 평면 {house.rev}</Badge> : <Badge tone="warn">고침 · 업체는 평면 {sentHouse.rev} 기준</Badge>;
  return (
    <div className="space-y-5" data-testid="house-tab">
      <div className="rounded-2xl border border-warn/30 bg-warn-soft px-5 py-4 text-sm leading-relaxed text-warn" data-testid="house-tab-scope">
        <p className="font-semibold">{HOUSE_LABEL}</p>
        <p className="mt-1 text-xs">
          {HOUSE_SCOPE_TEXT} {AUTO_LATER_TEXT}
        </p>
      </div>
      {house ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <span>
                평면 {house.rev} · {dateKo(house.saved_at)} 저장
              </span>
              {status}
            </p>
            {!finished && (
              <div className="flex flex-wrap gap-2">
                <Link href={`${base}/house/edit`} className="btn btn-sm btn-primary" data-testid="house-edit">
                  평면 고치기
                </Link>
                <details className="group">
                  <summary className="btn btn-sm btn-danger list-none group-open:hidden" data-testid="house-del">
                    지우기
                  </summary>
                  <form action={deleteHouse.bind(null, project.id)} className="flex items-center gap-1.5">
                    <span className="text-xs text-danger">집 전체 평면을 지울까요?</span>
                    <button className="btn btn-sm btn-danger" data-testid="house-del-confirm">
                      지우기
                    </button>
                  </form>
                </details>
              </div>
            )}
          </div>
          {sent && (
            <p className="text-xs text-muted" data-testid="house-sent-note">
              {sentHouse ? `업체가 보고 있는 기준은 요청 r${sent.no}의 평면 ${sentHouse.rev}이에요.` : `요청 r${sent.no}에는 집 전체 평면이 들어 있지 않아요.`} 평면을 고쳐도 위의 ‘변경 내용 보내기’를 눌러야 업체 기준에 반영돼요.
            </p>
          )}
          <HouseView house={house} underlayUrl={house.underlay?.fileId ? `/files/${house.underlay.fileId}` : null} />
        </>
      ) : (
        <>
          {sentHouse && (
            <div className="rounded-xl border border-line bg-white px-4 py-3 text-xs text-muted" data-testid="house-removed">
              지운 평면(평면 {sentHouse.rev}): ‘변경 내용 보내기’를 누르기 전까지 업체는 이 평면을 그대로 봐요.
            </div>
          )}
          <div className="rounded-2xl bg-sand px-5 py-8 text-center" data-testid="house-empty">
            <p className="text-sm font-semibold">아직 집 전체 평면이 없어요</p>
            <p className="mx-auto mt-1 max-w-xl text-xs leading-relaxed text-muted">
              도면이나 실측 치수로 바깥 벽을 만들고, 내부 벽·방문·창을 넣어 방을 나눈 뒤 개념 가구를 놓아 평면과 3D로 볼 수 있어요. 선택 항목이에요. {HOUSE_INDEPENDENT_TEXT}
            </p>
            {!finished && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Link href={`${base}/house/new?from=dims`} className="btn btn-primary btn-sm" data-testid="house-new-dims">
                  치수로 만들기
                </Link>
                <Link href={`/spaces/recognize?project=${project.id}`} className="btn btn-sm" data-testid="house-new-ai">AI로 도면 읽기</Link>
                <Link href={`/spaces/templates?project=${project.id}`} className="btn btn-sm">등록 도면 찾기</Link>
                <Link href={`${base}/house/new?from=trace`} className="btn btn-sm" data-testid="house-new-trace">
                  도면 이미지로 따라 그리기
                </Link>
              </div>
            )}
          </div>
        </>
      )}
      <p className="text-xs text-muted">‘방 배치’ 탭의 방 한 칸 배치는 이 평면과 따로 관리돼요. 둘 다 있으면 업체는 둘 다 받아요.</p>
    </div>
  );
}
