import Link from "next/link";
import PlanSvg from "@/components/PlanSvg";
import { Badge } from "@/components/ui";
import { deleteRoom } from "@/lib/actions";
import type { Project, Version } from "@/lib/data";
import { lastSentRevision } from "@/lib/request-snapshot";
import { AUTO_LATER_TEXT, MAX_ROOMS, ROOM_BADGE, ROOM_LIST_TEXT, composeRoom, describeHomeRoom, runRoomChecks } from "@/lib/space/home-room";

/** 집 요청의 ‘방 배치’ 탭. 방마다 따로 관리하는 참고 배치 목록과, 업체에 보낸 기준과의 차이를 보여 준다. */
export default function HomeRoomsTab({ project, current, finished }: { project: Project; current: Version; finished: boolean }) {
  const base = `/projects/${project.id}`;
  const sent = project.requested_version_id ? lastSentRevision(project.id) : undefined;
  const sentRooms = sent?.snapshot.rooms ?? [];
  const removed = sentRooms.filter((s) => !current.rooms.some((r) => r.id === s.id));
  const status = (id: string, rev: number, name: string) => {
    if (!sent) return null;
    const s = sentRooms.find((x) => x.id === id);
    if (!s) return <Badge tone="warn">새 방 · 업체에 아직 안 보냄</Badge>;
    if (s.rev === rev && s.name === name) return <Badge tone="brand">업체에 보낸 배치 {rev}</Badge>;
    return <Badge tone="warn">고침 · 업체는 배치 {s.rev} 기준</Badge>;
  };
  return (
    <div className="space-y-5" data-testid="rooms-tab">
      <div className="rounded-2xl border border-warn/30 bg-warn-soft px-5 py-4 text-sm leading-relaxed text-warn" data-testid="rooms-scope">
        <p className="font-semibold">{ROOM_BADGE}</p>
        <p className="mt-1 text-xs">
          {ROOM_LIST_TEXT} {AUTO_LATER_TEXT}
        </p>
      </div>
      <p className="text-xs text-muted" data-testid="rooms-house-link">
        집 전체(내부 벽·방문·방 구분)는{" "}
        <Link href={`${base}/house`} className="text-brand underline">
          집 전체 평면
        </Link>
        에서 따로 그려요. 방 한 칸 배치와는 따로 관리돼요.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          방 배치 {current.rooms.length}개 / 최대 {MAX_ROOMS}개 · 선택 항목이에요(없어도 상담 요청을 보낼 수 있어요).
        </p>
        {!finished && current.rooms.length < MAX_ROOMS && (
          <Link href={`${base}/rooms/new`} className="btn btn-primary btn-sm" data-testid="add-room">
            ＋ 방 한 칸 만들기
          </Link>
        )}
      </div>
      {sent && (
        <p className="text-xs text-muted" data-testid="rooms-sent-note">
          업체가 보고 있는 기준은 요청 r{sent.no}의 방 배치 {sentRooms.length}개예요. 방을 추가·삭제·수정해도 위의 ‘변경 내용 보내기’를 눌러야 업체 기준에 반영돼요.
        </p>
      )}
      {current.rooms.length === 0 ? (
        <p className="rounded-2xl bg-sand px-5 py-8 text-center text-sm text-muted" data-testid="rooms-empty">
          아직 방 배치가 없어요. 치수를 아는 방이 있으면 방 한 칸씩 만들어 가구를 놓아 보세요.
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {current.rooms.map((r) => {
            const d = describeHomeRoom(r.room);
            const report = runRoomChecks(r.room, r.items);
            return (
              <li key={r.id} className="overflow-hidden rounded-2xl border border-line bg-surface" data-testid={`room-card-${r.id}`}>
                <Link href={`${base}/rooms/${r.id}`} className="block border-b border-line bg-white">
                  <PlanSvg option={composeRoom(r)} styleId="natural" space thumb />
                </Link>
                <div className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <b>{r.name}</b>
                    <span className="text-xs text-muted">배치 {r.rev}</span>
                    {status(r.id, r.rev, r.name)}
                  </div>
                  <p className="text-xs text-muted">
                    {d.size} · {d.area} · 가구 {r.items.length}점
                  </p>
                  <p className="text-xs" data-testid={`room-checks-${r.id}`}>
                    {report.issues.length ? <span className="text-warn">확인할 것 {report.issues.length}</span> : <span className="text-muted">검사 항목에서 걸린 곳 없음</span>}
                    <span className="text-muted"> · 통로 간격 알림 {report.notices.length}곳(편집 참고)</span>
                  </p>
                  <p className="text-[11px] text-warn">{ROOM_BADGE}</p>
                  {!finished && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Link href={`${base}/rooms/${r.id}`} className="btn btn-sm btn-primary" data-testid={`room-open-${r.id}`}>
                        가구 배치
                      </Link>
                      <Link href={`${base}/rooms/${r.id}/edit`} className="btn btn-sm" data-testid={`room-edit-${r.id}`}>
                        방 정보
                      </Link>
                      <details className="group">
                        <summary className="btn btn-sm btn-danger list-none group-open:hidden" data-testid={`room-del-${r.id}`}>
                          삭제
                        </summary>
                        <form action={deleteRoom.bind(null, project.id, r.id)} className="flex items-center gap-1.5">
                          <span className="text-xs text-danger">{r.name}을(를) 지울까요?</span>
                          <button className="btn btn-sm btn-danger" data-testid={`room-del-confirm-${r.id}`}>
                            지우기
                          </button>
                        </form>
                      </details>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {removed.length > 0 && (
        <div className="rounded-xl border border-line bg-white px-4 py-3 text-xs text-muted" data-testid="rooms-removed">
          지운 방 {removed.map((r) => `${r.name}(배치 ${r.rev})`).join(", ")}: ‘변경 내용 보내기’를 누르기 전까지 업체는 이 방을 그대로 봐요.
        </div>
      )}
    </div>
  );
}
