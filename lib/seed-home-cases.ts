import type { HomeType } from "./home";
import type { RoomEdit } from "./space/home-room";
import type { Rot, RoomModel } from "./space/types";

// 공간 탐색의 집(주거) 3D 예시. 방 한 칸만 그린 예시이며 실제 시공 사진이 아니다(‘3D 예시’로 표시).
// 이미지(seed-assets/h0N-*.jpg)는 이 데이터로 /render 화면에서 그린 것이고, 상세 화면의 입체·평면도도 같은 데이터로 다시 그린다.

type Item = [type: string, x: number, y: number, rot?: Rot, w?: number, d?: number];

export interface HomeSeedCase {
  code: string;
  /** seed.ts의 업체 순서(주거 분야가 있는 예시 업체) */
  vendor: number;
  title: string;
  summary: string;
  area: number;
  homeType: HomeType;
  region: string;
  name: string;
  room: RoomModel;
  items: Item[];
}

const rect = (w: number, d: number, o: Partial<RoomModel> = {}): RoomModel => ({ shape: "rect", width: w, depth: d, height: 2.4, entrance: { at: 0.2, width: 0.9 }, windows: [], pillars: [], doors: [], utilities: [], source: "dims", ...o });

export const HOME_SEED_CASES: HomeSeedCase[] = [
  {
    code: "h01",
    vendor: 1,
    title: "침대와 책상을 한쪽에 모아 바닥을 넓힌 관악구 6평 원룸 방",
    summary: "슈퍼싱글 침대와 옷장을 왼쪽 벽에, 책상은 창 아래에 두어 가운데 바닥을 비웠습니다. 방 한 칸만 그린 3D 예시이며 욕실과 다른 공간은 들어 있지 않습니다.",
    area: 6,
    homeType: "oneroom",
    region: "서울 관악구",
    name: "원룸 방",
    room: rect(3.3, 4.5, {
      windows: [{ wall: "rear", at: 0.6, width: 2.1 }],
      doors: [{ wall: "left", at: 0.3, width: 0.7, label: "욕실 문" }],
      pillars: [{ x: 2.7, y: 0.2, w: 0.6, d: 1.8, label: "싱크대 자리", h: 0.85 }],
    }),
    items: [
      ["h-bed-ss", 0.55, 3.5],
      ["h-wardrobe", 0.3, 1.85, 90],
      ["h-desk", 2.7, 4.2],
      ["h-chair", 2.7, 3.6, 180],
      ["h-fridge", 2.925, 2.35, 270],
    ],
  },
  {
    code: "h02",
    vendor: 2,
    title: "수납장으로 잠자리와 작업 자리를 나눈 마포구 9평 오피스텔",
    summary: "퀸 침대 발치에 수납장을 세워 잠자리와 작업 자리를 나누고, 소파는 오른쪽 벽에 붙였습니다. 방 한 칸만 그린 3D 예시이며 욕실은 들어 있지 않습니다.",
    area: 9,
    homeType: "officetel",
    region: "서울 마포구",
    name: "오피스텔 방",
    room: rect(4, 5.5, {
      entrance: { at: 0.3, width: 0.9 },
      windows: [{ wall: "rear", at: 0.5, width: 3 }],
      doors: [{ wall: "left", at: 0.2, width: 0.7, label: "욕실 문" }],
      pillars: [{ x: 3.4, y: 0.3, w: 0.6, d: 2, label: "싱크대 자리", h: 0.85 }],
    }),
    items: [
      ["h-bed-queen", 0.75, 4.5],
      ["h-nightstand", 1.725, 5.3],
      ["h-cabinet", 0.6, 3.275],
      ["h-desk", 3.4, 5.2],
      ["h-chair", 3.4, 4.6, 180],
      ["h-sofa2", 3.575, 3.1, 270],
    ],
  },
  {
    code: "h03",
    vendor: 1,
    title: "작은 방을 옷장과 행거로 채운 은평구 14평 빌라 드레스룸",
    summary: "투룸 빌라의 작은 방에 옷장 두 개와 행거, 화장대를 두어 드레스룸으로 썼습니다. 방 한 칸만 그린 3D 예시이며 집 전체 구조는 들어 있지 않습니다.",
    area: 14,
    homeType: "villa",
    region: "서울 은평구",
    name: "작은 방",
    room: rect(2.7, 3, {
      entrance: { at: 1.6, width: 0.9 },
      windows: [{ wall: "rear", at: 0.6, width: 1.5 }],
    }),
    items: [
      ["h-wardrobe", 0.3, 0.6, 90],
      ["h-wardrobe", 0.3, 1.8, 90],
      ["h-hanger", 1.5, 2.75],
      ["h-vanity", 2.5, 1.6, 270],
    ],
  },
  {
    code: "h04",
    vendor: 2,
    title: "소파와 거실장을 마주 보게 둔 노원구 24평 아파트 거실",
    summary: "3인 소파를 왼쪽 벽에, 거실장을 맞은편 벽에 두고 수납장은 앞벽에 붙였습니다. 발코니 문 앞은 비워 두었습니다. 방 한 칸만 그린 3D 예시이며 주방과 다른 방은 들어 있지 않습니다.",
    area: 24,
    homeType: "apartment",
    region: "서울 노원구",
    name: "거실",
    room: rect(4.5, 3.9, {
      entrance: { at: 3.4, width: 1 },
      doors: [{ wall: "rear", at: 0.5, width: 2.4, label: "발코니 문" }],
    }),
    items: [
      ["h-sofa3", 0.45, 1.85, 90],
      ["h-tvstand", 4.3, 1.85, 270],
      ["h-cabinet", 1.6, 0.225],
    ],
  },
  {
    code: "h05",
    vendor: 2,
    title: "킹 침대 양옆에 협탁을 둔 송파구 32평 아파트 안방",
    summary: "킹 침대를 안쪽 벽 가운데에 두고 양옆에 협탁, 왼쪽 벽에 화장대를 두었습니다. 방 한 칸만 그린 3D 예시이며 욕실과 드레스룸은 들어 있지 않습니다.",
    area: 32,
    homeType: "apartment",
    region: "서울 송파구",
    name: "안방",
    room: rect(3.9, 4.2, {
      windows: [{ wall: "right", at: 1.8, width: 1.5 }],
      doors: [{ wall: "right", at: 0.3, width: 0.8, label: "욕실 문" }],
    }),
    items: [
      ["h-bed-king", 1.95, 3.2],
      ["h-nightstand", 0.875, 4],
      ["h-nightstand", 3.025, 4],
      ["h-vanity", 0.2, 1.7, 90],
    ],
  },
];

/** 예시의 가구 편집 목록(서버가 개념 가구에서 다시 채운다) */
export const seedEdits = (c: Pick<HomeSeedCase, "items">): RoomEdit[] =>
  c.items.map(([type, x, y, rot, w, d], i) => ({ id: `n${i + 1}`, src: `catalog:${type}`, label: "", x, y, rot: rot ?? 0, ...(w ? { w } : {}), ...(d ? { d } : {}) }));
