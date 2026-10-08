import { ForgotForm } from "@/components/forms";
import { Page } from "@/components/ui";
import { requestPasswordReset } from "@/lib/actions";

export const metadata = { title: "비밀번호 재설정" };

export default function Forgot() {
  return (
    <Page narrow>
      <div className="card mx-auto max-w-md">
        <h1 className="text-xl font-bold">비밀번호 재설정</h1>
        <p className="mb-5 mt-1.5 text-sm text-muted">가입한 이메일로 재설정 링크를 보내 드립니다. 링크는 1시간 동안 쓸 수 있습니다.</p>
        <ForgotForm action={requestPasswordReset} />
      </div>
    </Page>
  );
}
