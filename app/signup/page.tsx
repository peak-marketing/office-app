import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/forms";
import { Notice, Page } from "@/components/ui";
import { signup } from "@/lib/actions";
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
          <h1 className="mb-5 text-xl font-bold">회원가입</h1>
          <AuthForm mode="signup" action={signup} next={next} />
          <p className="mt-5 text-sm text-muted">
            이미 계정이 있나요? <Link href={`/login${suffix}`} className="text-brand underline">로그인</Link>
          </p>
        </div>
      </div>
    </Page>
  );
}
