// 화면(클라이언트)에서도 쓰는 커뮤니티 상수. DB를 부르지 않는다.

export const REPORT_REASONS: Record<string, string> = {
  spam: "광고·홍보",
  abuse: "욕설·비방",
  privacy: "개인정보 노출",
  copyright: "사진 도용·저작권",
  fake: "허위 정보·거짓 후기",
  etc: "기타",
};
/** 신고가 이만큼 쌓이면 운영자 확인 전까지 자동으로 가린다. */
export const AUTO_HIDE_REPORTS = 5;

export const POST_TYPE = { space: "공간 소개", review: "시공 후기" } as const;
export const HOME_TYPE_LABEL: Record<string, string> = { oneroom: "원룸", officetel: "오피스텔", villa: "빌라", apartment: "아파트", house: "단독주택", office: "사무실", etc: "기타" };
export const STYLE_LABEL: Record<string, string> = { natural: "내추럴", modern: "모던", minimal: "미니멀", vintage: "빈티지", nordic: "북유럽", classic: "클래식", industrial: "인더스트리얼", etc: "기타" };

