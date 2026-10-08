import { emailProvider } from "./mailer";

// 외부 연동 상태를 한곳에서 정한다. 키가 없으면 테스트 모드로 동작하고 화면에 ‘실제 연동 전’으로 표시한다.
// verified: 실제 키로 상대 서비스와 주고받기를 확인했는지. 키를 받아 확인하기 전까지 false로 둔다.

export interface Integration {
  key: string;
  name: string;
  /** 필요한 환경 변수 */
  env: string[];
  /** 키가 모두 있음 */
  on: boolean;
  /** 실제 키로 확인을 마쳤는지 */
  verified: boolean;
  /** 키가 없을 때 동작 */
  fallback: string;
  /** 받을 곳·준비물 */
  how: string;
}

const has = (...names: string[]) => names.every((n) => !!process.env[n]?.trim());

export function integrations(): Integration[] {
  return [
    {key:"floorplan",name:"AI 도면 인식 (OpenAI)",env:["OPENAI_API_KEY","OPENAI_FLOORPLAN_MODEL (선택)"],on:has("OPENAI_API_KEY"),verified:false,fallback:"AI 결과를 생성하지 않고 도면 따라 그리기로 안내",how:"OpenAI API 키를 서버 환경 변수에 설정. 기본 모델 gpt-5.4-2026-03-05. API 연결 검증과 실제 도면의 위치·치수 정확도 검증은 별개이며 고객의 원본 비교·편집이 필요."},
    {
      key: "payment",
      name: "결제·취소·환불 (토스페이먼츠)",
      env: ["TOSS_CLIENT_KEY", "TOSS_SECRET_KEY"],
      on: paymentProvider() === "toss",
      verified: false,
      fallback: "테스트 결제: 결제 화면에서 ‘결제 완료’를 누르면 결제된 것으로 처리. 실제 돈이 오가지 않음",
      how: "토스페이먼츠 가맹 계약(사업자등록·통신판매업 신고 필요) → 개발자센터 API 키(클라이언트 키·시크릿 키). 오픈마켓 형태면 지급대행(정산) 계약도 필요",
    },
    {
      key: "mail",
      name: "이메일 발송 (Resend)",
      env: ["RESEND_API_KEY", "MAIL_FROM"],
      on: emailProvider() === "resend" && has("MAIL_FROM"),
      verified: false,
      fallback: "메일을 보내지 않고 운영자 화면 ‘메일 발송 기록’에만 남김",
      how: "Resend 계정 → API 키, 보내는 주소 도메인 인증(DNS 설정)",
    },
    {
      key: "juso",
      name: "주소 검색 (행정안전부 도로명주소 API)",
      env: ["JUSO_API_KEY"],
      on: has("JUSO_API_KEY"),
      verified: false,
      fallback: "예시 주소 몇 개로만 검색(실제 주소 아님, 화면에 표시)",
      how: "business.juso.go.kr 에서 ‘도로명주소 검색 API’ 승인키 신청",
    },
    {
      key: "juso-detail",
      name: "동·층·호 조회 (행정안전부 상세주소 API)",
      env: ["JUSO_DETAIL_API_KEY"],
      on: has("JUSO_DETAIL_API_KEY"),
      verified: false,
      fallback: "동·호를 직접 입력. 예시 호수 목록을 만들지 않음",
      how: "business.juso.go.kr 에서 ‘상세주소 검색 API’ 별도 승인키 신청. 등록된 상세주소만 조회되며 도면·호별 타입은 제공하지 않음",
    },
    {
      key: "building",
      name: "건축물대장 (국토교통부 건축HUB, 공공데이터포털)",
      env: ["DATA_GO_KR_KEY"],
      on: has("DATA_GO_KR_KEY"),
      verified: false,
      fallback: "예시 값으로만 보여 줌(실제 건물 정보 아님, 화면에 표시)",
      how: "data.go.kr 회원가입 → ‘국토교통부_건축HUB_건축물대장정보 서비스’ 활용 신청 → 일반 인증키",
    },
    {
      key: "nts",
      name: "사업자 상태 조회 (국세청, 공공데이터포털)",
      env: ["DATA_GO_KR_KEY"],
      on: has("DATA_GO_KR_KEY"),
      verified: false,
      fallback: "운영자가 사업자등록증 사본으로 확인",
      how: "data.go.kr ‘국세청_사업자등록정보 진위확인 및 상태조회 서비스’ 활용 신청(같은 인증키)",
    },
    {
      key: "payout",
      name: "판매자 정산 지급",
      env: [],
      on: false,
      verified: false,
      fallback: "운영자가 정산 금액을 계좌로 직접 이체하고 ‘지급 완료’로 기록",
      how: "PG 지급대행(토스페이먼츠 지급대행 등) 계약 또는 수동 이체 유지",
    },
  ];
}

export const paymentProvider = (): "toss" | "test" => (has("TOSS_CLIENT_KEY", "TOSS_SECRET_KEY") ? "toss" : "test");

export function bizStatusLookup() {
  return has("DATA_GO_KR_KEY")
    ? { on: true, label: "국세청 상태 조회 키가 있어요(실제 연동 확인 전). 서류도 함께 확인해 주세요." }
    : { on: false, label: "국세청 상태 조회는 실제 연동 전이에요(공공데이터포털 키 없음). 사업자등록증 사본으로 확인해 주세요." };
}
