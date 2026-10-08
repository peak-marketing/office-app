import { MOODS, PRIORITIES, WINDOW_WALLS, budgetText, mm } from "./constants";
import type { LayoutInput, LayoutResult } from "./layout/types";
import { describeRoom } from "./space/room";
import type { RoomModel } from "./space/types";
import type { StyleId } from "./styles";
import { homeRows, homeVendorChecks, type HomeBriefProject, type HomeInput } from "./home";

// 요구사항 정리와 스타일 추천. 배치 계산(lib/layout)과 분리되어 있다.
// 지금은 규칙 기반이며, 이 모듈의 함수만 LLM 호출로 바꾸면 화면은 그대로 쓸 수 있다.

export interface BriefProject {
  title: string;
  region: string;
  budget_min: number | null;
  budget_max: number | null;
  desired_start: string;
  desired_movein: string;
  notes: string;
}

export interface Brief {
  rows: [string, string][];
  vendorChecks: string[];
  style: { id: StyleId; reason: string };
}

export function recommendStyle(input: LayoutInput): Brief["style"] {
  switch (input.mood) {
    case "pro":
      return { id: "chic", reason: `'${MOODS.pro}'를 원하셔서 차콜과 월넛 대비가 분명한 시크를 추천합니다.` };
    case "soft":
      return { id: "lovely", reason: `'${MOODS.soft}'를 원하셔서 크림과 더스티 핑크의 러블리를 추천합니다.` };
    case "warm":
      return { id: "natural", reason: `'${MOODS.warm}'를 원하셔서 오크와 세이지 그린의 내추럴을 추천합니다.` };
    default:
      return { id: "natural", reason: "선호 분위기를 정하지 않으셔서 가장 무난한 내추럴을 기본으로 보여드립니다. 세 가지를 전환하며 비교해 보세요." };
  }
}

/**
 * 내 공간의 창 설명: 고객이 실제로 입력한 것만 말한다(잘 모름 / 창 없음 / 위치 입력함).
 * 배치 계산용 값(input.windowWall)은 ‘창을 가정하지 않음’을 뜻하는 계산값이라 설명에 쓰지 않는다.
 */
export function windowsText(room: RoomModel) {
  if (room.windows == null) return "잘 모르겠음 (입력하지 않음 · 창을 그리지 않음)";
  if (room.windows.length === 0) return "창 없음";
  return `위치 입력함 · ${describeRoom(room).windows}`;
}

/** room이 있으면(내 공간) 치수와 창은 입력한 실제 구조로 설명한다. */
export function buildBrief(project: BriefProject, input: LayoutInput, result: LayoutResult, room?: RoomModel | null): Brief {
  const roomList = [
    input.ceo && "대표실",
    input.meeting && `회의실(${input.meetingSeats}인)`,
    input.pantry && "탕비실",
    input.storage && "창고",
  ].filter(Boolean);
  const rows: [string, string][] = [
    ["지역", project.region],
    ["전용면적", `${input.areaPyeong}평`],
    [
      "실내 치수",
      room
        ? `${describeRoom(room).size} (${room.source === "trace" ? "도면에서 따라 그림" : "입력값"})`
        : result.W && result.D
          ? `${mm(result.W)} × ${mm(result.D)} mm${result.assumedDims ? " (평수로 가정)" : " (입력값)"}`
          : "미확인",
    ],
    ["인원", `직원 ${input.staff}석${input.ceo ? " + 대표 1" : ""}`],
    ["필요 공간", roomList.length ? roomList.join(", ") : "개별실 없음(개방형)"],
    ["중요하게 보는 것", PRIORITIES[input.priority ?? "unknown"]],
    ["창 위치", room ? windowsText(room) : WINDOW_WALLS[input.windowWall ?? "unknown"]],
    ["예산", `${budgetText(project.budget_min, project.budget_max)} · 가구 ${input.furnitureIncluded ? "포함" : "별도"}`],
    ["희망 일정", `착공 ${project.desired_start || "미정"} / 입주 ${project.desired_movein || "미정"}`],
  ];
  if (input.reuseFurniture?.trim()) rows.push(["재사용 가구", input.reuseFurniture.trim()]);
  if (input.siteNotes?.trim()) rows.push(["현장 메모", input.siteNotes.trim()]);
  if (project.notes.trim()) rows.push(["기타 요청", project.notes.trim()]);

  const vendorChecks = [
    "외곽 실측치와 기둥, 기존 출입문·창문·화장실·분전반 위치를 확인한 뒤 배치를 조정해 주세요.",
    "전기·통신·조명·냉난방·환기·소방·피난과 건물 관리 기준은 별도로 검토해 상세도에 반영해 주세요.",
  ];
  if (input.pantry) vendorChecks.push("탕비실 급배수 접속 가능 위치와 배관 경로를 확인해 주세요. 현재 위치는 검증되지 않은 가정입니다.");
  if (input.ceo || input.meeting) vendorChecks.push("대표실·회의실의 차음, 유리 사양, 도어 방식과 유효 통로 폭을 협의해 주세요.");
  if (result.assumedDims) vendorChecks.push("치수는 평수로 가정한 값입니다. 실측 후 수량과 금액이 달라질 수 있습니다.");
  vendorChecks.push("이 자료로 수량·공사비를 확정하거나 먹매김하지 말고, 실측 후 승인된 시공 도면을 사용해 주세요.");

  const style = recommendStyle(input);
  return { rows, vendorChecks, style };
}

/** 집 요청 요약. 자동 배치·스타일 추천이 없으므로 style은 자리만 채운다. */
export function homeBrief(project: HomeBriefProject, home: HomeInput, roomCount = 0): Brief {
  return { rows: homeRows(project, home, roomCount), vendorChecks: homeVendorChecks(home, roomCount), style: { id: "natural", reason: "" } };
}
