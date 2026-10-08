import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/forms";
import { Notice, Page } from "@/components/ui";
import { login } from "@/lib/actions";
import { currentUser, homeFor } from "@/lib/auth";

export default async function AuthPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await currentUser();
  if (user) redirect(homeFor(user));
  const { next } = await searchParams;
  const suffix = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <Page narrow>
      <div className="mx-auto max-w-md space-y-4">
        {(next?.startsWith("/projects/new") || next?.startsWith("/spaces/new")) && <Notice>가입하면 고른 조건을 이어서 내 공간을 만들어요.</Notice>}
        <div className="card">
          <h1 className="mb-5 text-xl font-bold">로그인</h1>
          <AuthForm mode="login" action={login} next={next} />
          <p className="mt-5 text-sm text-muted">
            처음이신가요? <Link href={`/signup${suffix}`} className="text-brand underline">회원가입</Link>
            <span className="mx-2 text-line">|</span>
            <Link href="/forgot" className="underline">
              비밀번호를 잊으셨나요?
            </Link>
          </p>
        </div>
      </div>
    </Page>
  );
}
