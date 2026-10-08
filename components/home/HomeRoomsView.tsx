import SpaceView from "@/components/space/SpaceView";
import { mm } from "@/lib/constants";
import { CONCEPT_FURNITURE_TEXT, ROOM_BADGE, composeRoom, describeHomeRoom, type HomeRoom } from "@/lib/space/home-room";

/** 방 한 칸 배치들. 방마다 따로 그린 참고 배치로 보여 주고, 집 전체 도면처럼 잇지 않는다. */
export default function HomeRoomsView({ rooms, note, empty = "방 배치가 없습니다." }: { rooms: HomeRoom[]; note?: string; empty?: string }) {
  if (!rooms.length) return <p className="text-sm text-muted" data-testid="rooms-empty">{empty}</p>;
  return (
    <div className="space-y-4" data-testid="rooms-view">
      {note && <p className="text-xs leading-relaxed text-muted" data-testid="rooms-note">{note}</p>}
      {rooms.map((r) => {
        const d = describeHomeRoom(r.room);
        return (
          <section key={r.id} className="card space-y-3" data-testid={`room-${r.id}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">
                {r.name} <span className="text-xs font-normal text-muted">· 배치 {r.rev}</span>
              </h3>
              <span className="badge border-warn/40 bg-warn-soft text-warn" data-testid="room-badge">
                {ROOM_BADGE}
              </span>
            </div>
            <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted">방 치수</dt>
              <dd>
                {d.size} · {d.area}
              </dd>
              <dt className="text-muted">방문</dt>
              <dd>{d.entrance}</dd>
              <dt className="text-muted">다른 문 자리</dt>
              <dd>{d.doors}</dd>
              <dt className="text-muted">창</dt>
              <dd>{d.windows}</dd>
              <dt className="text-muted">고정 구조물</dt>
              <dd>{d.fixed}</dd>
              <dt className="text-muted">가구</dt>
              <dd>
                {r.items.length ? `${r.items.map((it) => `${it.label} ${mm(it.w)}×${mm(it.d)}`).join(", ")}` : "없음"}
                <span className="block text-xs text-muted">{CONCEPT_FURNITURE_TEXT}</span>
              </dd>
            </dl>
            {/* 방이 여러 개라 평면도를 먼저 보여 주고, 3D는 눌러서 연다(3D 화면을 한꺼번에 여러 개 띄우지 않는다). */}
            <SpaceView option={composeRoom(r)} styleId="natural" height="min-h-[320px] lg:min-h-[400px]" label={ROOM_BADGE} start="plan" />
          </section>
        );
      })}
    </div>
  );
}
