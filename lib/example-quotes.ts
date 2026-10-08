import { QUOTE_CATEGORIES, type ItemStatus, type QuoteItem } from "./constants";

// 예시 견적 두 건. 시연 데이터와 메인 화면의 '견적 비교 예시'가 함께 쓴다.
// 실제 업체의 견적이 아니며, 공사 범위가 서로 다른 경우를 보여 주도록 구성했다.
export interface ExampleQuote {
  amounts: Record<string, [ItemStatus, number | null, string]>;
  vat: number;
  days: number;
  start: string;
  extra: string;
  note: string;
}

export const EXAMPLE_QUOTES: ExampleQuote[] = [
  {
    amounts: {
      demolition: ["included", 2_800_000, "기존 칸막이·바닥재 철거"],
      partition: ["included", 9_600_000, "10T 강화유리 + 알루미늄 프레임"],
      floor: ["included", 5_400_000, "데코타일 3T"],
      ceiling: ["included", 4_200_000, "기존 텍스 보수 + 부분 교체"],
      electric: ["included", 6_800_000, "LED 평판등, 콘센트 증설"],
      network: ["separate", 1_500_000, "랜 포설 16포트"],
      hvac: ["site_check", null, "기존 천장형 이설 범위 확인 후 산정"],
      fire: ["site_check", null, "스프링클러 헤드 이설 여부 확인"],
      finish: ["included", 3_100_000, "친환경 수성 도장"],
      plumbing: ["included", 2_400_000, "싱크 설치, 배관 3m 이내"],
      door: ["included", 2_700_000, "슬라이딩 도어 3개소"],
      furniture: ["included", 11_500_000, "책상 9, 의자 19, 회의 테이블, 수납"],
      etc: ["included", 1_200_000, "폐기물 처리, 보양"],
    },
    vat: 0,
    days: 25,
    start: "2026-11-04",
    extra: "야간·주말 작업이 필요하면 인건비 30% 할증. 배관 3m 초과 시 m당 8만원.",
    note: "가구까지 한 번에 납품합니다. 회의실은 10T 강화유리에 도어 하부 실링을 더해 통화 소리가 새지 않게 하겠습니다.",
  },
  {
    amounts: {
      demolition: ["included", 3_300_000, "철거 및 가설 보양"],
      partition: ["included", 11_000_000, "12T 접합유리(차음) + 스틸 프레임"],
      floor: ["included", 6_050_000, "카펫타일"],
      ceiling: ["included", 5_500_000, "전체 재시공"],
      electric: ["included", 7_700_000, "조명 교체, 분전반 회로 증설"],
      network: ["included", 1_650_000, "랜 포설 및 랙 설치"],
      hvac: ["separate", 4_400_000, "천장형 2대 이설"],
      fire: ["site_check", null, "현장 확인 후 산정"],
      finish: ["included", 3_850_000, "도장 + 부분 필름"],
      plumbing: ["included", 2_750_000, "싱크·정수기 배관"],
      door: ["included", 3_300_000, "슬라이딩 도어 3개소 + 사인"],
      furniture: ["na", null, "가구는 고객 직접 구매 권장"],
      etc: ["included", 1_100_000, "폐기물 처리"],
    },
    vat: 1,
    days: 30,
    start: "2026-11-10",
    extra: "건물 관리 규정상 공사 가능 시간이 제한되면 공기가 늘어날 수 있음.",
    note: "차음이 중요하다고 하셔서 회의실과 대표실을 접합유리로 제안합니다. 천장은 전체 재시공해 조명 배치를 새로 잡겠습니다.",
  },
];

export const exampleItems = (q: ExampleQuote): QuoteItem[] =>
  QUOTE_CATEGORIES.map((c) => {
    const [status, amount, spec] = q.amounts[c.key];
    return { key: c.key, status, amount, spec };
  });
