"use client";

import type { FormState } from "@/lib/actions";
import type { Seller } from "@/lib/partner";
import { Field, StateForm } from "../forms";

type Action = (state: FormState, fd: FormData) => Promise<FormState>;

/** 판매자 정보(사업자·고객센터·정산 계좌)와 배송 정책 */
export default function SellerInfoForm({ seller, action, admin = false }: { seller: Seller; action: Action; admin?: boolean }) {
  return (
    <StateForm action={action} submit="판매자 정보 저장" className="space-y-6">
      <section className="space-y-3">
        <h2 className="h-section">사업자 정보</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="상호(쇼핑에 보이는 이름)">
            <input className="input" name="name" defaultValue={seller.name} required maxLength={60} />
          </Field>
          <Field label="대표자">
            <input className="input" name="ceo" defaultValue={seller.ceo} maxLength={40} />
          </Field>
          <Field label="사업자등록번호" hint="숫자 10자리. 형식만 확인하고, 실제 등록 여부는 운영자가 서류로 확인해요.">
            <input className="input" name="biz_no" defaultValue={seller.biz_no} inputMode="numeric" placeholder="000-00-00000" />
          </Field>
          <Field label="통신판매업 신고번호">
            <input className="input" name="mail_order_no" defaultValue={seller.mail_order_no} placeholder="예: 2026-서울강남-0000" />
          </Field>
          <Field label="사업장 주소" className="sm:col-span-2">
            <input className="input" name="biz_address" defaultValue={seller.biz_address} />
          </Field>
          <Field label="사업자등록증 사본" hint={seller.doc_file_id ? "올린 서류가 있어요. 새로 올리면 바뀌어요. (jpg·png·pdf, 10MB 이하, 운영자만 봐요)" : "jpg·png·pdf, 10MB 이하. 운영자와 본인만 볼 수 있어요."} className="sm:col-span-2">
            <input className="input" type="file" name="doc" accept=".jpg,.jpeg,.png,.pdf" />
          </Field>
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="h-section">고객센터·소개</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="고객센터 전화">
            <input className="input" name="cs_phone" type="tel" defaultValue={seller.cs_phone} />
          </Field>
          <Field label="고객센터 이메일">
            <input className="input" name="cs_email" type="email" defaultValue={seller.cs_email} />
          </Field>
          <Field label="판매자 소개" className="sm:col-span-2">
            <textarea className="input min-h-20" name="intro" defaultValue={seller.intro} maxLength={500} />
          </Field>
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="h-section">배송·반품</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="기본 배송비(원)" hint="한 주문에서 이 판매자 상품을 묶어 한 번만 받아요.">
            <input className="input" name="ship_fee" inputMode="numeric" defaultValue={seller.ship_fee} required />
          </Field>
          <Field label="무료 배송 기준(원)" hint="이 금액 이상이면 배송비 무료. 비우면 항상 배송비를 받아요.">
            <input className="input" name="free_ship_over" inputMode="numeric" defaultValue={seller.free_ship_over ?? ""} />
          </Field>
          <Field label="반품 배송비(편도, 원)" hint="단순 변심 반품 때 환불금에서 빼요. 무료 배송이었다면 왕복으로 빼요.">
            <input className="input" name="return_fee" inputMode="numeric" defaultValue={seller.return_fee} required />
          </Field>
          <Field label="주로 쓰는 택배사">
            <input className="input" name="courier" defaultValue={seller.courier} placeholder="예: CJ대한통운" />
          </Field>
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="h-section">정산 계좌</h2>
        <p className="text-xs leading-relaxed text-muted">구매 확정된 주문을 모아 수수료를 뺀 금액을 이 계좌로 보내요. {admin ? "" : "계좌 정보는 운영자와 본인만 봐요."}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="은행">
            <input className="input" name="bank_name" defaultValue={seller.bank_name} />
          </Field>
          <Field label="계좌번호">
            <input className="input" name="bank_account" defaultValue={seller.bank_account} inputMode="numeric" />
          </Field>
          <Field label="예금주">
            <input className="input" name="bank_holder" defaultValue={seller.bank_holder} />
          </Field>
        </div>
      </section>
    </StateForm>
  );
}
