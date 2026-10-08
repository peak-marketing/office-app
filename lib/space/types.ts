import type { FurnitureItem } from "../layout/types";

// 내 공간: 사용자가 입력한 실제 구조(벽·출입문·창·기둥)와, 그 위에 놓은 가구.
// 좌표 단위는 미터. x = 왼쪽 벽 → 오른쪽, y = 출입문이 있는 벽(앞벽) → 안쪽 벽.

export type WallSide = "front" | "rear" | "left" | "right";

export const WALL_LABEL: Record<WallSide, string> = { front: "앞벽(출입문 벽)", rear: "안쪽 벽", left: "왼쪽 벽", right: "오른쪽 벽" };

/**
 * 벽 위의 위치. 직사각형은 wall(at: 앞·안쪽 벽은 왼쪽 벽에서, 옆 벽은 앞벽에서),
 * 도면에서 따라 그린 다각형은 edge(변 번호, at: 그 변의 시작 꼭짓점에서)로 가리킨다.
 */
export interface WallRef {
  wall?: WallSide;
  edge?: number;
  at: number;
}

/** 창 */
export interface WindowSpec extends WallRef {
  width: number;
}

/** 실제로 확인한 설비 위치. 지금은 급배수(물)만 받는다. */
export interface UtilitySpec extends WallRef {
  kind: "water";
}

/**
 * 도면 밑그림. 이미지 픽셀 (u, v)를 공간 좌표 (x, y)로 옮기는 행렬 [a, b, c, d, e, f]:
 * x = a·u + c·v + e, y = b·u + d·v + f
 */
export interface Underlay {
  fileId: number;
  iw: number;
  ih: number;
  m: [number, number, number, number, number, number];
}

/** 실내 기둥. x는 왼쪽 벽에서, y는 앞벽에서 기둥 모서리까지 거리 */
export interface PillarSpec {
  x: number;
  y: number;
  w: number;
  d: number;
  /** 집 방의 고정 구조물 이름(붙박이장·싱크대 자리 등). 없으면 기둥 */
  label?: string;
  /** 고정 구조물 높이(m). 없으면 천장까지(기둥) */
  h?: number;
}

/** 출입문 말고 막으면 안 되는 문 자리(집 방의 욕실·발코니·현관 문 등). 직사각형 방에서만 쓴다. */
export interface DoorSpot {
  wall: WallSide;
  /** 앞·안쪽 벽은 왼쪽 벽에서, 옆 벽은 앞벽에서 문 가장자리까지 */
  at: number;
  width: number;
  label: string;
}

export interface RoomModel {
  /** rect: 치수로 만든 직사각형. polygon: 도면에서 따라 그린 직각 다각형(자동 배치 없음). 다른 모양을 직사각형으로 바꾸지 않는다. */
  shape: "rect" | "polygon";
  /** 직사각형은 앞벽(출입문이 있는 벽) 길이, 다각형은 바깥 사각형 가로 */
  width: number;
  /** 직사각형은 앞벽에서 안쪽 벽까지, 다각형은 바깥 사각형 세로 */
  depth: number;
  /** 다각형 꼭짓점(반시계, 미터). 직사각형이면 없음 */
  outline?: [number, number][];
  /** 천장 높이. 모르면 null(2.7m로 가정) */
  height: number | null;
  /** 출입문. 직사각형은 앞벽(at: 왼쪽 벽에서 문 가장자리까지), 다각형은 edge 변 위 */
  entrance: { at: number; width: number; edge?: number };
  /** 창. null이면 위치를 모름 */
  windows: WindowSpec[] | null;
  pillars: PillarSpec[];
  /** 출입문 말고 막으면 안 되는 문 자리(집 방). 사무실 공간은 없음 */
  doors?: DoorSpot[];
  /** 실제로 확인한 급배수 위치. 모르면 비워 두고, 탕비 설비 위치는 자동 제안으로 남는다. */
  utilities?: UtilitySpec[];
  /** dims: 치수 입력, trace: 도면 따라 그리기 */
  source: "dims" | "trace";
  /** 사용자가 알고 있는 전용면적(평). 치수와 대조하는 데만 쓴다. */
  areaHint?: number | null;
  /** 도면 따라 그리기에 쓴 밑그림. 편집 화면에서 겹쳐 볼 수 있다. */
  underlay?: Underlay | null;
}

/** 가구 부품. 묶음 중심 기준 상대 좌표(회전 전) */
export interface Part {
  n: string;
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
  c: string;
  /** 평면도에 그리는 부품 */
  p: 0 | 1;
  /** 실제 상품의 3D 모델(GLB) 주소. 있으면 3D에서 이 부품(상자)을 모델로 바꿔 그린다. */
  m?: string;
}

/** 내 공간에 놓은 실제 상품. 크기는 판매자가 입력한 규격(고객이 바꾸지 않는다). */
export interface ProductRef {
  id: number;
  /** 옵션(SKU). 옵션별 규격이 다르면 그 옵션의 규격을 쓴다. */
  skuId: number | null;
  title: string;
  /** 옵션 이름(예: 색상: 베이지) */
  option: string;
  /** 높이(m) */
  h: number;
  /** 3D 모델 주소. 없으면 같은 크기의 상자 */
  model: string | null;
  price: number;
  cover: number | null;
}

export type Rot = 0 | 90 | 180 | 270;

/** 놓인 가구 하나(묶음 단위) */
export interface PlacedItem {
  id: string;
  type: string;
  label: string;
  /** 중심 위치 */
  x: number;
  y: number;
  rot: Rot;
  /** 회전 전 바닥면 크기 */
  w: number;
  d: number;
  parts: Part[];
  bom: FurnitureItem[];
  /** 예전 데이터의 고정 설비 표시. 지금은 fixture를 쓴다. */
  locked?: boolean;
  /** 설비(탕비 등). proposed: 자동 배치가 제안한 위치(급배수 확인 전), confirmed: 고객이 실제 위치로 확인함(옮기지 않음) */
  fixture?: "proposed" | "confirmed";
  wall?: boolean;
  seat?: boolean;
  /** auto: 자동 배치에서 온 것, added: 고객이 추가·복제한 것 */
  origin: "auto" | "added";
  /** 추가·복제한 가구의 원본(자동 배치 묶음 id 또는 catalog:종류). 자동 배치 그대로면 없음 */
  src?: string;
  /** 실제 상품(쇼핑)이면 상품 정보. 없으면 치수 검토용 개념 가구 */
  product?: ProductRef;
}

export interface Placement {
  items: PlacedItem[];
}

/** 화면에서 보내는 편집 결과. 부품은 서버가 원본(자동 배치 묶음·카탈로그)에서 다시 채운다. */
export interface PlacementEdit {
  id: string;
  /** 원본: 자동 배치 묶음 id, 또는 catalog:종류 */
  src: string;
  label: string;
  x: number;
  y: number;
  rot: Rot;
  fixture?: "proposed" | "confirmed";
}

/** 가구 추가 목록의 항목 */
export interface CatalogTemplate {
  type: string;
  label: string;
  desc: string;
  w: number;
  d: number;
  parts: Part[];
  bom: FurnitureItem[];
  seat?: boolean;
  /** 실제 상품 템플릿(type이 product:상품:옵션) */
  product?: ProductRef;
}
