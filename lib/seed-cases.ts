// 시연용 예시 사례. 사진은 seed-assets/ 의 3D 제안 예시 이미지(실제 시공 사진 아님)를 쓴다.
// 이미지는 아래 조건의 배치를 개발용 화면(/render)에서 눈높이 3D(e1, e2…)와 입체 배치도(iso)로 그려 저장한 것이다.
export interface SeedCase {
  /** 사진 파일 이름의 앞부분: seed-assets/{code}-e1.jpg … {code}-iso.jpg */
  code: string;
  vendor: 0 | 1 | 2;
  title: string;
  /** 공간 종류(업종) */
  category: string;
  summary: string;
  area: number;
  duration: string;
  style: "natural" | "chic" | "lovely";
  region: string;
  staff: number;
  rooms: ("ceo" | "meeting" | "pantry" | "storage")[];
  meetingSeats?: number;
  /** 예시 이미지를 그릴 때 쓴 배치 */
  layout: "visitor" | "collab" | "focus";
  entrance?: "left" | "right";
  /** 예전 이미지 장수(지금은 seed-assets의 {code}-e*.jpg, {code}-iso.jpg를 쓴다) */
  photos: number;
}

export const SEED_CASES: SeedCase[] = [
  { code: "s01", vendor: 0, title: "햇살 드는 창가 팀석과 스탠딩 협업 테이블을 둔 성수동 IT 스타트업 32평 사무실", category: "스타트업·IT", summary: "직원 12석을 팀 묶음으로 나누고 가운데에 스탠딩 협업 테이블을 두었습니다. 회의실과 탕비실은 안쪽 벽에 모았습니다.", area: 32, duration: "3주", style: "natural", region: "서울 성동구", staff: 12, rooms: ["meeting", "pantry"], meetingSeats: 6, layout: "collab", photos: 3 },
  { code: "s02", vendor: 0, title: "상담실과 대기 공간을 입구 옆에 모은 강남 세무법인 28평 사무실", category: "전문직 사무소", summary: "상담이 잦아 출입구 옆에 상담용 회의실과 대기 공간을 두고, 서류 창고를 따로 만들었습니다.", area: 28, duration: "4주", style: "natural", region: "서울 강남구", staff: 6, rooms: ["ceo", "meeting", "storage"], meetingSeats: 4, layout: "visitor", photos: 3 },
  { code: "s03", vendor: 0, title: "작은 면적에 집중석 여섯 자리를 넣은 망원동 디자인 스튜디오 22평 작업실", category: "디자인·브랜드", summary: "작은 면적에 4인 회의실과 6석을 넣었습니다. 자리는 모두 한 방향을 보게 해 작업에 집중하도록 했습니다.", area: 22, duration: "2주", style: "natural", region: "서울 마포구", staff: 6, rooms: ["meeting"], meetingSeats: 4, layout: "focus", entrance: "left", photos: 2 },
  { code: "s04", vendor: 0, title: "의뢰인 동선을 업무 공간과 나눈 서초동 법률사무소 36평, 차콜과 월넛 마감", category: "전문직 사무소", summary: "의뢰인이 업무 공간을 지나지 않도록 회의실과 대표실을 출입구 쪽에 두었습니다. 차콜과 월넛으로 차분하게 마감했습니다.", area: 36, duration: "5주", style: "chic", region: "서울 서초구", staff: 8, rooms: ["ceo", "meeting", "pantry", "storage"], meetingSeats: 8, layout: "visitor", photos: 3 },
  { code: "s05", vendor: 0, title: "상품 창고와 열네 자리 업무 공간을 나눈 수원 온라인 쇼핑몰 40평 사무실", category: "유통·물류", summary: "상품 보관 창고와 14석 업무 공간을 나누고, 팀끼리 바로 모일 수 있는 협업 테이블을 두었습니다.", area: 40, duration: "4주", style: "natural", region: "경기 수원시", staff: 14, rooms: ["meeting", "pantry", "storage"], meetingSeats: 6, layout: "collab", photos: 3 },
  { code: "s06", vendor: 1, title: "넓은 통로와 팀 묶음 좌석으로 스무 명이 일하는 성수동 디자인 에이전시 45평", category: "디자인·브랜드", summary: "차콜과 월넛으로 대비를 준 20석 규모 사무실입니다. 팀 묶음 사이 통로를 넓게 잡았습니다.", area: 45, duration: "5주", style: "chic", region: "서울 성동구", staff: 20, rooms: ["ceo", "meeting", "pantry"], meetingSeats: 8, layout: "collab", entrance: "left", photos: 3 },
  { code: "s07", vendor: 1, title: "통화가 많은 직원석을 조용히 분리한 하남 물류 스타트업 38평 사무실", category: "유통·물류", summary: "회의실, 탕비실, 창고를 출입구 쪽 벽에 모아 통화가 많은 직원석을 조용하게 분리했습니다.", area: 38, duration: "4주", style: "chic", region: "경기 하남시", staff: 16, rooms: ["meeting", "pantry", "storage"], meetingSeats: 6, layout: "focus", photos: 3 },
  { code: "s08", vendor: 1, title: "마감 기간에도 집중할 수 있게 칸막이 개인석을 둔 송파 회계법인 30평", category: "전문직 사무소", summary: "마감 기간에 집중할 수 있도록 자리마다 칸막이를 세우고, 통로와 좌석 사이에 수납장을 두었습니다.", area: 30, duration: "3주", style: "chic", region: "서울 송파구", staff: 8, rooms: ["ceo", "meeting", "pantry"], meetingSeats: 6, layout: "focus", photos: 3 },
  { code: "s09", vendor: 1, title: "스물두 명이 창가부터 앉는 판교 게임 개발사 48평 개발실", category: "스타트업·IT", summary: "22석을 한 방향 개인석으로 놓고 창가 쪽부터 채웠습니다. 회의실은 8인 규모입니다.", area: 48, duration: "6주", style: "natural", region: "경기 성남시", staff: 22, rooms: ["meeting", "pantry"], meetingSeats: 8, layout: "focus", photos: 3 },
  { code: "s10", vendor: 2, title: "크림 톤으로 밝게 마감한 합정동 마케팅 회사 24평, 회의실과 탕비실까지", category: "디자인·브랜드", summary: "좁은 면적에 회의실과 탕비실을 함께 넣고 크림 톤으로 밝게 마감했습니다.", area: 24, duration: "3주", style: "lovely", region: "서울 마포구", staff: 6, rooms: ["meeting", "pantry"], meetingSeats: 4, layout: "visitor", entrance: "left", photos: 2 },
  { code: "s11", vendor: 2, title: "출입구 옆 회의실에서 손님을 맞는 청담동 뷰티 브랜드 30평 사무실", category: "디자인·브랜드", summary: "방문객을 맞는 회의실과 대기 공간을 출입구 옆에 두고, 크림과 더스티 핑크로 브랜드 분위기를 살렸습니다.", area: 30, duration: "3주", style: "lovely", region: "서울 강남구", staff: 8, rooms: ["ceo", "meeting", "pantry"], meetingSeats: 6, layout: "visitor", photos: 3 },
  { code: "s12", vendor: 2, title: "원고를 보는 조용한 자리와 서고를 갖춘 종로 출판사 26평 편집실", category: "교육·출판", summary: "원고를 보는 자리는 칸막이로 나누고, 회의실과 서고를 출입구 쪽에 모았습니다.", area: 26, duration: "3주", style: "natural", region: "서울 종로구", staff: 8, rooms: ["meeting", "storage"], meetingSeats: 4, layout: "focus", photos: 2 },
  { code: "s13", vendor: 2, title: "수업 준비를 함께하는 협업 테이블을 둔 영등포 교육 스타트업 34평", category: "교육·출판", summary: "12석을 팀 묶음으로 나누고, 수업 준비를 함께 할 수 있는 협업 테이블을 출입구 가까이에 두었습니다.", area: 34, duration: "4주", style: "lovely", region: "서울 영등포구", staff: 12, rooms: ["meeting", "pantry"], meetingSeats: 6, layout: "collab", entrance: "left", photos: 3 },
  { code: "s14", vendor: 2, title: "도면을 펼치는 큰 회의실과 자료 창고가 있는 용산 건축사사무소 42평", category: "전문직 사무소", summary: "도면을 펼치는 넓은 회의실과 자료 창고를 두고, 차콜 톤으로 정돈했습니다.", area: 42, duration: "5주", style: "chic", region: "서울 용산구", staff: 14, rooms: ["ceo", "meeting", "storage"], meetingSeats: 8, layout: "collab", photos: 3 },
];
