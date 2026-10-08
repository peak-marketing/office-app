import { Notice, Page } from "@/components/ui";
import { BRAND_NAME } from "@/lib/mailer";

export const metadata = { title: "개인정보 처리방침" };

// 운영자 정보는 환경 변수로 받는다. 비어 있으면 화면에 미입력으로 표시해 출시 전에 채우게 한다.
const OPERATOR = process.env.OPERATOR_NAME || "";
const CONTACT = process.env.OPERATOR_CONTACT || "";

export default function Privacy() {
  const missing = !OPERATOR || !CONTACT;
  return (
    <Page narrow>
      <h1 className="text-2xl font-bold tracking-tight">개인정보 처리방침</h1>
      {missing && (
        <div className="mt-4">
          <Notice tone="warn">운영자 이름과 연락처가 아직 입력되지 않았습니다. 실제 고객을 받기 전에 운영 환경 변수 OPERATOR_NAME, OPERATOR_CONTACT를 채워야 합니다.</Notice>
        </div>
      )}
      <div className="mt-6 space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="h-section">운영자</h2>
          <p>
            {BRAND_NAME} · {OPERATOR || "[운영자 미입력]"} · 문의 {CONTACT || "[연락처 미입력]"}
          </p>
        </section>
        <section>
          <h2 className="h-section">수집하는 정보와 쓰는 곳</h2>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>회원 정보: 이름, 이메일, 연락처, 비밀번호(암호화해 저장). 로그인, 진행 알림 메일 발송, 상담 연결에 씁니다.</li>
            <li>요청 정보: 지역, 공간 조건, 예산·일정, 원하는 공사 내용, 시공지 상세 주소, 현장 사진·도면·손그림. 견적 요청 처리와 시공사 연결에 씁니다.</li>
            <li>시공사 정보: 업체명, 담당자, 연락처, 시공 사례 사진. 업체 소개와 요청 배정에 씁니다.</li>
            <li>판매자 정보: 상호, 대표자, 사업자등록번호, 사업장 주소, 통신판매업 신고번호, 고객센터 연락처, 사업자등록증 사본, 정산 계좌. 입점 심사, 상품 상세의 판매자 표시(계좌·서류 제외), 정산에 씁니다.</li>
            <li>주문 정보: 받는 분, 연락처, 배송지, 주문 상품, 결제·환불 기록. 주문 처리, 배송, 취소·반품·환불, 정산에 씁니다. 카드 번호 등 결제 수단 정보는 결제대행사(토스페이먼츠)가 처리하며 이 서비스에 저장하지 않습니다.</li>
            <li>커뮤니티: 별명(없으면 이름 첫 글자), 올린 공간 사진·글·댓글. 누구나 볼 수 있게 공개됩니다. 사진에 얼굴·주소·연락처가 보이지 않게 올려 주세요.</li>
            <li>주소로 찾기: 검색한 주소와 동·호를 공공 API(도로명주소·건축물대장) 조회에 씁니다. 선택한 동·호는 조회 기록에 남기지 않습니다. 고객이 ‘신청서에 불러오기’를 누르면 해당 상세 주소와 확인된 면적을 신청서에 채우며, 신청서를 저장·제출하면 요청 정보로 보관합니다. 상세 주소는 현장 방문을 요청한 업체에만 공개합니다.</li>
          </ul>
        </section>
        <section>
          <h2 className="h-section">시공사에 제공하는 정보</h2>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>운영자가 배정한 시공사에는 지역(시·구), 공간 조건, 배치안, 사진·도면, 참고 사례, 원하는 공사 내용을 제공합니다.</li>
            <li>상세 주소, 이름, 연락처, 이메일은 고객이 현장 방문을 요청한 시공사에만 제공합니다.</li>
            <li>배정이 취소된 시공사는 그 요청의 자료를 더 이상 볼 수 없습니다.</li>
            <li>‘업체 직접 참여’를 켠 요청은, 참여 전 승인된 시공사에 지역·공간 조건·배치·예산·일정 요약이 보입니다(이름·상세 주소·연락처·사진·도면 파일 제외). 참여한 시공사는 운영자가 배정한 시공사와 같은 범위를 봅니다.</li>
          </ul>
        </section>
        <section>
          <h2 className="h-section">판매자·결제대행사에 제공하는 정보</h2>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>주문한 상품의 판매자에게 받는 분, 연락처, 배송지, 배송 메모, 주문 상품을 제공합니다(배송과 교환·반품 처리 목적).</li>
            <li>결제대행사(토스페이먼츠)에 주문번호와 결제 금액을 보냅니다. 지금은 결제 연동 전이라 테스트 결제로만 동작합니다.</li>
          </ul>
        </section>
        <section>
          <h2 className="h-section">AI 도면 분석</h2>
          <p>고객이 AI 분석 전송에 동의하고 요청하면 선택한 도면 이미지를 OpenAI API에 보내 벽·문·창·방 정보를 추출합니다. API 응답 저장 옵션은 끄고, 고객 도면과 인식 기록은 서비스에 비공개로 보관합니다. 업로드 전에 이름·주소 등 개인정보를 지워 주세요. 인식 결과는 1일 동안 공간 만들기에 사용할 수 있고, 저장한 평면은 해당 공간과 요청 버전에 보관됩니다. 이 만료는 파일 삭제를 뜻하지 않으며 삭제 요청은 운영자 문의처로 접수합니다. 개인정보의 해외 처리 등 필요한 운영 고지는 출시 전에 확정합니다.</p>
        </section>
        <section>
          <h2 className="h-section">보관 기간과 삭제</h2>
          <p>회원 탈퇴나 삭제 요청 시 지체 없이 지웁니다. 다만 시공사에 이미 보낸 요청 내용은 견적 비교와 분쟁 확인을 위해 요청 종료 후 1년까지 보관한 뒤 지웁니다. 삭제를 원하시면 위 문의처로 연락해 주세요.</p>
        </section>
        <p className="text-xs text-muted">이 문서는 서비스의 실제 동작을 기준으로 쓴 초안입니다(2026-10-05 쇼핑·커뮤니티 반영). 출시 전에 운영자가 법률 검토를 거쳐 확정해야 하며, 쇼핑을 열려면 이용약관(통신판매중개 고지 포함)도 따로 갖춰야 합니다.</p>
      </div>
    </Page>
  );
}
