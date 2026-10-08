import { ResetForm } from "@/components/forms";
import { Page } from "@/components/ui";
import { resetPassword } from "@/lib/actions";

export const metadata = { title: "새 비밀번호", robots: { index: false } };

export default async function Reset({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <Page narrow>
      <div className="card mx-auto max-w-md">
        <h1 className="mb-5 text-xl font-bold">새 비밀번호 정하기</h1>
        <ResetForm action={resetPassword.bind(null, token)} />
      </div>
    </Page>
  );
}
