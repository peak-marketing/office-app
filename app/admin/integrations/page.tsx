import Link from "next/link";
import { Badge, Page, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { integrations } from "@/lib/external";

export const metadata = { title: "외부 연동 상태" };

/** 결제·메일·주소·공공데이터 연동이 실제로 켜졌는지 한눈에 본다. 키가 없으면 테스트 모드로 동작한다. */
export default async function Integrations() {
  await requireUser("admin");
  const rows = integrations();
  return (
    <Page>
      <PageTitle title="외부 연동 상태" sub="키가 없거나 실제 키로 확인하기 전인 연동은 ‘실제 연동 전’이에요. 이때는 아래 대체 방식으로 동작해요." />
      <Link href="/admin/floorplans" className="btn btn-sm mb-4">아파트 등록 도면 관리</Link>
      <ul className="grid gap-3" data-testid="integrations">
        {rows.map((r) => (
          <li key={r.key} className="card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{r.name}</h2>
              {r.on && r.verified ? <Badge tone="brand">연동됨</Badge> : r.on ? <Badge tone="warn">키 있음 · 실제 연동 확인 전</Badge> : <Badge tone="warn">실제 연동 전</Badge>}
            </div>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[120px_minmax(0,1fr)]">
              <dt className="text-muted">지금 동작</dt>
              <dd>{r.on ? "키가 있어 실제 서비스로 요청해요." : r.fallback}</dd>
              <dt className="text-muted">필요한 것</dt>
              <dd>{r.how}</dd>
              {r.env.length > 0 && (
                <>
                  <dt className="text-muted">설정 이름</dt>
                  <dd className="font-mono text-xs">{r.env.join(", ")}</dd>
                </>
              )}
            </dl>
          </li>
        ))}
      </ul>
    </Page>
  );
}
