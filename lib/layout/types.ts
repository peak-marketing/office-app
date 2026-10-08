// 좌표 단위는 미터. x = 왼쪽→오른쪽, y = 입구(전면)→후면, z = 높이.
/** pillar: 사용자가 입력한 실내 기둥, utility: 사용자가 확인한 급배수 위치(실제 구조) */
export type Kind = "floor" | "outer" | "partition" | "glass" | "window" | "furniture" | "pillar" | "utility";

export interface Obj {
  name: string;
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
  color: string;
  kind: Kind;
  opacity: number;
  /** 평면도에 그릴지 여부 (다리·프레임 등은 3D에만 표시) */
  plan: boolean;
  /** 가구 묶음 id. 편집할 때 이 묶음 단위로 옮기고 돌린다. */
  g?: string;
  /** 실제 상품의 3D 모델(GLB) 주소와 놓은 방향(°). 3D에서 상자 대신 모델을 그린다. */
  model?: string;
  rot?: number;
}

/** 가구 묶음 하나(업무석 1, 회의 테이블 세트 등). 편집 단위이자 가구 목록 단위다. */
export interface GroupInfo {
  id: string;
  label: string;
  /** desk · meeting · ceo · cabinet · plant … 같은 종류끼리 복제·추가 규칙을 맞춘다. */
  type: string;
  /** 예전 데이터: 고정 설비 */
  locked?: boolean;
  /** 설비. 자동 배치가 놓은 위치는 제안(proposed)이며 급배수 확인 전이다. 고객이 실제 위치로 확인하면 confirmed */
  fixture?: "proposed" | "confirmed";
  /** 벽에 거는 물건. 칸막이와 겹침 검사에서 뺀다. */
  wall?: boolean;
  /** 업무석으로 센다. */
  seat?: boolean;
  /** 이 묶음에 든 가구 목록 */
  bom: FurnitureItem[];
}

export interface RoomInfo {
  key: "ceo" | "meeting" | "pantry" | "storage" | "work" | "spare";
  label: string;
  x: number;
  y: number;
  w: number;
  d: number;
}

export interface FurnitureItem {
  type: string;
  spec: string;
  qty: number;
  /** 내추럴 기준 색상. 스타일별 색상은 styles의 매핑으로 변환한다. */
  color: string;
}

export interface PlanMarks {
  /** 개구부. vertical이면 y 방향으로 w만큼 열린 세로 벽의 문이다. */
  doors: { x: number; y: number; w: number; vertical?: boolean }[];
  /** 창. wall이 없으면 안쪽(후면) 벽. 옆 벽(left·right)이면 x1·x2는 y 방향 구간이다. seg가 있으면(다각형) 그 구간을 쓴다. */
  windows: { x1: number; x2: number; wall?: "front" | "rear" | "left" | "right"; seg?: [number, number, number, number] }[];
  /** 출입문. 직사각형 앞벽이면 x1·x2, 다각형이면 seg와 안쪽 방향 inward */
  entrance: { x1: number; x2: number; seg?: [number, number, number, number]; inward?: [number, number] };
  /** 좌석 번호를 적을 자리(책상 중심) */
  seats: { n: number; x: number; y: number }[];
  /** 출입문 말고 막으면 안 되는 문 자리(집 방의 욕실·발코니 문 등). 벽 위 구간과 방 안쪽 방향 */
  spots?: { seg: [number, number, number, number]; inward: [number, number]; label: string }[];
}

/** 배치의 설계 목적. compact는 목적별 대안을 만들 수 없을 만큼 좁을 때의 단일안이다. */
export type Purpose = "visitor" | "collab" | "focus" | "compact";

export const PURPOSES: Record<Purpose, { title: string; short: string }> = {
  visitor: { title: "방문객 응대 중심", short: "응대 중심" },
  collab: { title: "직원 협업 중심", short: "협업 중심" },
  focus: { title: "집중 업무 중심", short: "집중 중심" },
  compact: { title: "공간 효율 중심", short: "효율 중심" },
};

/** 배치안끼리 비교하는 수치. 모두 배치 좌표에서 계산한다. */
export interface LayoutMetrics {
  /** 좌석 구성 방식 */
  seating: string;
  /** 이 배치에 놓을 수 있는 최대 좌석 */
  capacity: number;
  /** 요청한 좌석을 놓고 남는 자리 */
  spare: number;
  /** 다른 좌석과 마주 보는 좌석 수 */
  facing: number;
  /** 창에서 3.2m 안쪽에 있는 좌석 수. 창 위치를 모르면 null */
  windowSeats: number | null;
  /** 출입구에서 회의실(없으면 대표실) 문까지의 거리(m). 맞을 방이 없으면 null */
  visitorDistance: number | null;
  /** 방문객 동선에서 1.5m 안에 있는 직원 좌석 수 */
  visitorPassBy: number | null;
  /** 주 통로 폭(m) */
  aisle: number;
  collabTable: boolean;
  /** 창이 있는 벽에 붙은 방 */
  windowRooms: string[];
}

export interface LayoutOption {
  /** 출입문 표기. 집 방은 ‘방문’. 없으면 출입구 */
  entranceLabel?: string;
  /** 집 요청의 방 한 칸 배치(사무실 표기·범례를 쓰지 않는다) */
  roomOnly?: boolean;
  /** 저장할 때 쓰는 값. 새 배치는 purpose와 같고, 예전 데이터는 "A"·"B"다. */
  id: string;
  purpose?: Purpose;
  title: string;
  summary: string;
  /** 입력 조건이 이 배치에 어떻게 반영됐는지 */
  reasons?: string[];
  pros?: string[];
  cons?: string[];
  /** 이 배치에만 해당하는 주의 사항(촘촘하게 배치했다는 등) */
  notes?: string[];
  metrics?: LayoutMetrics;
  W: number;
  D: number;
  seats: number;
  deskWidth: number;
  objects: Obj[];
  rooms: RoomInfo[];
  /** 방이 아닌 구역 이름(대기 공간, 협업 테이블 등) */
  zones?: { label: string; x: number; y: number }[];
  /** 출입구에서 회의실(또는 대표실)까지의 방문객 동선 */
  visitorPath?: [number, number][] | null;
  furniture: FurnitureItem[];
  marks: PlanMarks;
  /** 가구 묶음. 편집 기능 이전에 만든 배치에는 없다. */
  groups?: GroupInfo[];
  /** 도면에서 따라 그린 다각형 외곽(직사각형이면 없음) */
  outline?: [number, number][];
}

/**
 * 요청할 때 가진 자료. 치수를 아는 경우(drawing에 치수 입력, dims)에만 배치안을 만든다.
 * 비어 있으면(배치 체험·예전 데이터) 평수로 치수를 가정해 만든다.
 */
export type IntakeMode = "drawing" | "dims" | "photos" | "none";

export interface LayoutInput {
  intake?: IntakeMode;
  areaPyeong: number;
  /** 실측 가로·세로(m). 없으면 평수로 가정한다. */
  widthM?: number | null;
  depthM?: number | null;
  staff: number;
  ceo: boolean;
  meeting: boolean;
  meetingSeats: number;
  pantry: boolean;
  storage: boolean;
  entrance: "right" | "left" | "other";
  /** 출입구 쪽 모서리에서 출입문 가장자리까지 거리(m). 없으면 0.8m로 가정한다. */
  entranceOffset?: number;
  /** 출입문 폭(m). 없으면 1.2m로 가정한다. */
  entranceWidth?: number;
  shape: "rect" | "other";
  pillars: number;
  furnitureIncluded: boolean;
  /** 창이 있는 벽. rear = 출입구 맞은편(안쪽) 벽. 자동 배치는 rear만 반영한다. */
  windowWall?: "rear" | "other" | "unknown";
  /** 가장 중요하게 보는 것. 어느 배치를 먼저 권할지 정하는 데만 쓴다. */
  priority?: "visitor" | "collab" | "focus" | "unknown";
  /** 자유 기재: 출입문·창문·기둥 위치, 재사용 가구 등 */
  siteNotes?: string;
  reuseFurniture?: string;
  mood?: "warm" | "pro" | "soft" | "unknown";
}

export interface LayoutResult {
  status: "ok" | "needs_review";
  /** 자동 생성하지 못한 이유 */
  reasons: string[];
  /** 결과에 깔린 가정 */
  assumptions: string[];
  /** 생성은 됐지만 조정을 권하는 사항 */
  advisories: string[];
  options: LayoutOption[];
  /** 이 조건에서는 만들지 않은 목적별 대안과 그 이유 */
  skipped?: { purpose: Purpose; title: string; reason: string }[];
  /** 고객이 고른 우선순위에 맞는 배치. 없으면 null */
  recommended?: string | null;
  W: number | null;
  D: number | null;
  assumedDims: boolean;
}

export const PYEONG = 3.305785;
