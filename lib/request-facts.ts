import { budgetText } from "./constants";
import type { Project, Version } from "./data";
import { HOME_TYPES, areaText, scopeText, type HomeInput } from "./home";

/** 시공사가 요청을 빠르게 파악하는 데 쓰는 요약. 상세 주소와 연락처, 프로젝트 이름은 넣지 않는다. */
export function requestFacts(project: Project, version: Version) {
  const i = version.input;
  const rooms = [i.ceo && "대표실", i.meeting && `회의실 ${i.meetingSeats}인`, i.pantry && "탕비실", i.storage && "창고"].filter(Boolean) as string[];
  return {
    title: `${project.region} · ${i.areaPyeong}평 사무실`,
    region: project.region,
    area: `${i.areaPyeong}평 · 직원 ${i.staff}석`,
    use: "사무실",
    budget: budgetText(project.budget_min, project.budget_max),
    furniture: i.furnitureIncluded ? "가구 포함" : "가구 별도",
    schedule: `착공 ${project.desired_start || "미정"}`,
    movein: `입주 ${project.desired_movein || "미정"}`,
    scope: rooms.length ? rooms.join(", ") : "개별실 없음(개방형)",
  };
}

/** 집 요청 요약. 보고 있는 요청 기록의 집 정보로 만든다. 입력하지 않은 값은 ‘입력하지 않음’. */
export function homeFacts(project: Project, home: HomeInput, roomCount: number) {
  return {
    title: `${project.region} · ${HOME_TYPES[home.homeType]}`,
    region: project.region,
    type: HOME_TYPES[home.homeType],
    area: areaText(home),
    counts: home.rooms == null && home.baths == null ? "입력하지 않음" : `방 ${home.rooms ?? "—"} · 욕실 ${home.baths ?? "—"}`,
    budget: budgetText(project.budget_min, project.budget_max),
    schedule: `착공 ${project.desired_start || "미정"}`,
    movein: `입주 ${project.desired_movein || "미정"}`,
    scope: scopeText(home),
    rooms: roomCount ? `방 배치 ${roomCount}개(참고)` : "방 배치 없음",
  };
}
