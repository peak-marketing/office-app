import { headers } from "next/headers";
import { CopyButton } from "@/components/client";
import { Badge } from "@/components/ui";
import { createShareLink, revokeShareLink } from "@/lib/actions";
import { dateKo } from "@/lib/constants";
import { getEvents, getShareLinks } from "@/lib/data";
import { loadProject } from "@/lib/project-context";

export default async function ActivityTab({ params }: { params: Promise<{ id: string }> }) {
  const { project } = await loadProject((await params).id);
  const links = getShareLinks(project.id);
  const events = getEvents(project.id);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="card h-fit">
        <h2 className="h-section">공유 링크</h2>
        <p className="mb-3 text-xs leading-relaxed text-muted">링크를 가진 사람은 로그인 없이 현재 배치안과 요구사항을 볼 수 있습니다. 상세 주소, 연락처, 파일, 견적은 보이지 않습니다.</p>
        <form action={createShareLink.bind(null, project.id)} className="flex gap-2">
          <select name="days" className="input w-32" defaultValue="7" aria-label="유효 기간">
            <option value="1">1일</option>
            <option value="7">7일</option>
            <option value="30">30일</option>
          </select>
          <button className="btn">링크 만들기</button>
        </form>
        <ul className="mt-4 space-y-2 text-sm empty:hidden">
          {links.map((l) => {
            const expired = l.revoked || new Date(l.expires_at.replace(" ", "T") + "Z") < new Date();
            const url = `${origin}/share/${l.token}`;
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-2.5">
                <span className={`min-w-0 flex-1 truncate text-xs ${expired ? "text-muted line-through" : ""}`}>{url}</span>
                {expired ? (
                  <Badge>{l.revoked ? "해제됨" : "만료"}</Badge>
                ) : (
                  <>
                    <span className="text-xs text-muted">{dateKo(l.expires_at)}까지</span>
                    <CopyButton text={url} />
                    <form action={revokeShareLink.bind(null, l.id)}>
                      <button className="btn btn-sm btn-danger">해제</button>
                    </form>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      <section className="card">
        <h2 className="h-section">진행 기록</h2>
        <ul className="space-y-1.5 text-sm">
          {events.map((e) => (
            <li key={e.id} className="flex gap-3">
              <span className="shrink-0 text-xs leading-6 text-muted">{dateKo(e.created_at)}</span>
              <span>{e.body}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
