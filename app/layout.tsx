import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { BRAND, SiteHeader } from "@/components/ui";
import { paymentProvider } from "@/lib/external";
import "./globals.css";

// 운영사 정보(전자상거래법 표시 사항). 운영 전에 환경 변수로 채운다. 비어 있으면 ‘입력 전’으로 보인다.
const need = (v: string | undefined) => v?.trim() || "[입력 전]";
const operator = {
  name: need(process.env.OPERATOR_NAME),
  ceo: need(process.env.OPERATOR_CEO),
  bizNo: need(process.env.OPERATOR_BIZ_NO),
  mailOrder: need(process.env.OPERATOR_MAIL_ORDER_NO),
  address: need(process.env.OPERATOR_ADDRESS),
  cs: need(process.env.OPERATOR_CS),
};

export const metadata: Metadata = {
  title: { default: `${BRAND} — 공간 탐색·쇼핑·시공 견적`, template: `%s · ${BRAND}` },
  description: "다른 사람의 공간을 둘러보고, 내 공간을 3D로 만들어 가구를 놓아 보고, 상품 구매와 여러 시공사의 비공개 제안 비교까지 한곳에서.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        {children}
        <footer className="site-footer no-print border-t border-line bg-surface px-4 py-8 text-xs leading-relaxed text-muted">
          <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-6">
            <div className="max-w-xl space-y-2">
              <b className="text-sm text-ink">{BRAND}</b>
              <p>배치안과 3D는 고객이 입력한 자료로 그린 상담용 개념안이며 시공 확정 도면이 아닙니다. 공사 계약과 공사 대금은 고객과 시공사가 직접 진행하며, 플랫폼에는 결과만 기록합니다.</p>
              <p>쇼핑 상품의 판매자는 각 입점 판매자이며, {BRAND}는 통신판매중개자로서 거래 당사자가 아닙니다. 상품·배송·교환·환불 책임은 판매자에게 있습니다.{paymentProvider() === "test" && " 현재 결제는 테스트 결제로, 실제 돈이 오가지 않습니다."}</p>
              <p data-testid="operator-info">운영사 {operator.name} · 대표 {operator.ceo} · 사업자등록번호 {operator.bizNo} · 통신판매업 신고 {operator.mailOrder} · {operator.address} · 고객센터 {operator.cs}</p>
            </div>
            <nav className="flex gap-8" aria-label="바닥 메뉴">
              <ul className="space-y-1.5">
                <li className="font-semibold text-ink">둘러보기</li>
                <li><Link href="/community">커뮤니티</Link></li>
                <li><Link href="/shop">쇼핑</Link></li>
                <li><Link href="/cases">시공 사례</Link></li>
                <li><Link href="/vendors">시공사</Link></li>
              </ul>
              <ul className="space-y-1.5">
                <li className="font-semibold text-ink">고객</li>
                <li><Link href="/spaces/new">내 공간 만들기</Link></li>
                <li><Link href="/request">견적 요청</Link></li>
                <li><Link href="/guide">이용 방법</Link></li>
                <li><Link href="/privacy">개인정보 처리방침</Link></li>
              </ul>
              <ul className="space-y-1.5">
                <li className="font-semibold text-ink">파트너</li>
                <li><Link href="/partners">시공·판매 입점 신청</Link></li>
                <li><Link href="/login">파트너 로그인</Link></li>
              </ul>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
