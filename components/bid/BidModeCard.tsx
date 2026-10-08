import { StateForm } from "../forms";
import BidModeField from "../BidModeField";
import { Badge } from "../ui";
import { setBidMode } from "@/lib/actions";
import { participants } from "@/lib/bidding";
import type { Project } from "@/lib/data";

/** 요청을 보낸 뒤 참여 방식 바꾸기. 상담·계약 단계에서는 보기만 한다. */
export default function BidModeCard({ project }: { project: Project }) {
  const locked = ["visit", "contracted", "closed"].includes(project.status);
  const n = project.requested_version_id ? participants(project.id, project.requested_version_id) : 0;
  return (
    <section className="card" id="bid-mode" data-testid="bid-mode-card">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="h-section !mb-0">업체 받는 방식</h2>
        <Badge tone={project.bid_mode === "open" ? "brand" : "plain"}>{project.bid_mode === "open" ? `직접 참여 받는 중 · ${n}/${project.bid_cap}곳` : "운영자 배정"}</Badge>
      </div>
      {locked ? (
        <p className="text-sm text-muted">상담·계약 단계라 바꿀 수 없어요.</p>
      ) : (
        <StateForm action={setBidMode.bind(null, project.id)} submit="저장">
          <BidModeField mode={project.bid_mode} cap={project.bid_cap} />
        </StateForm>
      )}
    </section>
  );
}
