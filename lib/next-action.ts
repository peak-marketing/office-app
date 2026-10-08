import type { Assignment, Project, Quote, Version } from "./data";
import { lastSentRevision } from "./request-snapshot";
import { josa } from "./space/check";

// 고객이 지금 할 일. 요청 목록과 요청 상세가 같은 규칙을 쓴다.
export interface NextAction {
  kind: "request" | "intake" | "compare" | "wait" | "done";
  title: string;
  body: string;
  /** 버튼 문구. 기다리는 단계에서는 없다. */
  cta?: string;
  /** 버튼이 가는 화면. 없으면 상담 접수(요청) 버튼이다. */
  href?: string;
}

export interface ProjectCounts {
  /** 현재 견적 기준 버전에 배정된 업체(사양한 곳 제외) */
  assigned: number;
  /** 그중 참여를 확정했거나 제안을 낸 업체 */
  accepted: number;
  /** 참여를 확정하고 제안을 쓰고 있는 업체 */
  writing: number;
  /** 요청을 받았지만 아직 참여 여부를 정하지 않은 업체 */
  undecided: number;
  /** 가장 최근에 보낸 요청(r번호) 기준으로 도착한 제안 */
  quotes: number;
  /** 최신 요청을 보낸 뒤 업체가 아직 바뀐 내용을 확인하지 않아 이전 요청 기준에 남은 제안 */
  reconfirming: number;
  /** 가장 최근에 보낸 요청 번호 */
  latestRev: number | null;
}

export function countsFor(project: Project, quotes: Quote[], assignments: Assignment[]): ProjectCounts {
  const mine = assignments.filter((a) => a.version_id === project.requested_version_id && a.status !== "declined" && !a.withdrawn_at);
  // 제안 수는 비교 화면의 기본(가장 최근 요청 기록)과 같은 기준으로 센다.
  const latest = project.requested_version_id ? lastSentRevision(project.id) : undefined;
  const inRequest = quotes.filter((q) => q.version_id === project.requested_version_id);
  const onLatest = (q: Quote) => !latest || q.request_rev_id === latest.id || (q.request_rev_id == null && latest.no === 1);
  return {
    assigned: mine.length,
    accepted: mine.filter((a) => a.accepted_at || a.status === "quoted").length,
    writing: mine.filter((a) => a.status === "invited" && a.accepted_at).length,
    undecided: mine.filter((a) => a.status === "invited" && !a.accepted_at).length,
    quotes: inRequest.filter(onLatest).length,
    reconfirming: inRequest.filter((q) => !onLatest(q)).length,
    latestRev: latest?.no ?? null,
  };
}

/** 아직 제안을 내지 않은 시공사를 상태별로 말한다. 참여를 정하지 않은 곳을 '작성 중'으로 세지 않는다. */
export function pendingText(counts: Pick<ProjectCounts, "writing" | "undecided">) {
  return [counts.writing ? `${counts.writing}곳 작성 중` : "", counts.undecided ? `${counts.undecided}곳 참여 검토 중` : ""].filter(Boolean).join(" · ");
}

export function nextAction(project: Project, current: Version, requested: Version | undefined, counts: ProjectCounts): NextAction {
  const ok = current.layout_status === "ok";
  if (project.status === "contracted" || project.status === "closed") {
    const o = project.outcome ? (JSON.parse(project.outcome) as { result: string; company: string | null; amount: number | null; date: string; memo: string }) : null;
    return {
      kind: "done",
      title: o?.result === "contracted" ? `${o.company}와 계약했습니다` : "종료된 요청입니다",
      body: [o?.date, o?.amount != null ? `${o.amount.toLocaleString("ko-KR")}만원` : null, o?.memo].filter(Boolean).join(" · ") || "계약과 대금은 시공사와 직접 진행합니다.",
    };
  }
  // 요청 뒤에 바꾼 내용(배치 포함)은 화면 위 ‘변경 내용 보내기’ 안내에서 같은 업체에 보낸다.
  if (!requested && current.home)
    return {
      kind: "request",
      title: "요청 내용을 확인하고 상담 요청을 보내세요",
      body: "도면·치수·사진이 없어도 보낼 수 있어요. 치수를 아는 방이 있으면 ‘방 배치’에서 방 한 칸씩 가구 배치를 그려 함께 보낼 수 있어요. 업체끼리는 서로의 금액과 제안을 볼 수 없어요.",
      cta: "상담 요청 보내기",
      href: `/projects/${project.id}/request`,
    };
  if (!requested && current.room)
    return {
      kind: "request",
      title: "배치를 저장했어요. 원할 때 시공 제안을 요청하세요",
      body: "요청하지 않아도 내 공간은 그대로 남아요. 요청하면 고른 배치가 하나의 기준으로 고정돼 모든 업체에 똑같이 전달되고, 업체끼리는 서로의 금액과 제안을 볼 수 없어요.",
      cta: "시공 제안 요청",
      href: `/projects/${project.id}/request`,
    };
  if (!requested)
    return ok
      ? {
          kind: "request",
          title: "배치와 스타일을 확인하고 견적·제안을 요청하세요",
          body: "시공사에는 지역, 공간 조건, 배치안, 사진·도면만 공유됩니다. 상세 주소와 연락처는 현장 방문을 요청한 시공사에만 공개됩니다.",
          cta: "견적·제안 요청하기",
        }
      : current.input.intake === "photos"
        ? { kind: "intake", title: "사진으로 상담을 접수하세요", body: "사진만으로는 치수를 알 수 없어 배치안을 만들지 않았습니다. 접수하면 운영자가 사진을 보고 필요한 자료를 알려 드립니다.", cta: "사진으로 상담 접수" }
        : current.input.intake === "none"
          ? { kind: "intake", title: "자료를 추가하거나 이대로 상담을 접수하세요", body: "요청 내용·자료 탭에서 도면이나 사진을 올리고, 치수를 알면 조건 변경에서 입력하면 배치안을 만듭니다. 자료 없이 접수하면 운영자가 필요한 것을 알려 드립니다.", cta: "이대로 상담 접수" }
          : current.input.intake === "drawing" && !current.input.widthM
            ? { kind: "intake", title: "도면으로 상담을 접수하세요", body: "도면에서 치수를 읽어 배치안을 만들지는 않습니다. 접수하면 운영자가 도면을 확인합니다. 도면에 적힌 가로·세로를 조건 변경에서 입력하면 바로 배치안을 만들 수 있습니다.", cta: "도면으로 상담 접수" }
            : {
                kind: "intake",
                title: "자동 배치가 어려운 조건입니다",
                body: "조건을 바꿔 다시 생성하거나, 이대로 접수하면 운영자가 사진과 도면을 보고 검토합니다.",
                cta: "이대로 상담 접수",
              };
  if (counts.quotes > 0)
    return project.status === "visit"
      ? { kind: "compare", title: "현장 방문을 진행하고 있습니다", body: "방문을 요청한 시공사에 상세 주소와 연락처가 공개되었습니다. 다른 제안도 계속 비교할 수 있습니다.", cta: "제안 비교하기" }
      : {
          kind: "compare",
          title: counts.latestRev && counts.latestRev > 1 ? `최신 요청 r${counts.latestRev} 기준 제안 ${counts.quotes}건이 도착했습니다` : `제안 ${counts.quotes}건이 도착했습니다`,
          body: [
            pendingText(counts) ? `${pendingText(counts)}. 도착한 제안부터 비교해 보세요.` : "금액, 공사 범위, 자재 사양, 기간을 비교하고 현장 방문을 요청하세요.",
            counts.reconfirming ? `이전 요청 기준 제안 ${counts.reconfirming}건은 업체가 변경 내용을 확인 중입니다.` : "",
          ]
            .filter(Boolean)
            .join(" "),
          cta: "제안 비교하기",
        };
  if (counts.reconfirming > 0)
    return {
      kind: "compare",
      title: "업체가 변경 내용을 확인 중입니다",
      body: `${josa(`요청 r${counts.latestRev}`, "을", "를")} 보냈고 아직 이 기준으로 확인한 제안은 없습니다. 이전 요청 기준 제안 ${counts.reconfirming}건은 제안 비교에서 따로 볼 수 있습니다.`,
      cta: "제안 비교 보기",
    };
  if (counts.assigned > 0)
    return { kind: "wait", title: `시공사 ${counts.assigned}곳이 요청을 받았습니다`, body: `${counts.accepted}곳이 참여를 확정했습니다. 제안이 도착하면 여기에서 비교할 수 있습니다.` };
  return { kind: "wait", title: "운영자가 요청을 검토하고 있습니다", body: current.home ? "자료를 확인한 뒤 주거 시공이 가능한 업체를 배정합니다." : "자료를 확인한 뒤 조건에 맞는 시공사를 배정합니다." };
}
