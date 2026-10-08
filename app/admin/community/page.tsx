import Link from "next/link";
import { Badge, Empty, Page, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { REPORT_REASONS } from "@/lib/community-constants";
import { moderate } from "@/lib/community-actions";
import { kst } from "@/lib/constants";
import { all, get } from "@/lib/db";

export const metadata = { title: "커뮤니티 관리" };

type Target = "post" | "comment" | "product";

/** 운영자: 신고 처리(가리기·삭제·기각)와 최근 글·댓글 관리 */
export default async function AdminCommunity({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireUser("admin");
  const view = (await searchParams).view ?? "reports";
  const reported = all<{ target: Target; target_id: number; n: number; reasons: string; last: string }>(
    `SELECT target, target_id, count(*) AS n, group_concat(reason) AS reasons, max(created_at) AS last FROM reports WHERE status = 'open' GROUP BY target, target_id ORDER BY n DESC, last DESC`,
  );
  const describe = (t: Target, id: number) => {
    if (t === "post") return get<{ title: string; status: string; author: string }>(`SELECT p.title, p.status, u.name AS author FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?`, id);
    if (t === "comment") return get<{ title: string; status: string; author: string; post_id: number }>(`SELECT c.body AS title, c.status, u.name AS author, c.post_id FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?`, id);
    return get<{ title: string; status: string; author: string }>(`SELECT p.title, p.status, s.name AS author FROM products p JOIN sellers s ON s.id = p.seller_id WHERE p.id = ?`, id);
  };
  const href = (t: Target, id: number, postId?: number) => (t === "post" ? `/community/${id}` : t === "comment" ? `/community/${postId}#comments` : `/shop/products/${id}`);
  const recent = all<{ id: number; title: string; status: string; type: string; author: string; created_at: string; reports: number }>(
    `SELECT p.id, p.title, p.status, p.type, u.name AS author, p.created_at, (SELECT count(*) FROM reports r WHERE r.target = 'post' AND r.target_id = p.id) AS reports
     FROM posts p JOIN users u ON u.id = p.user_id WHERE p.status != 'deleted' ORDER BY p.id DESC LIMIT 100`,
  );
  const label = { post: "게시물", comment: "댓글", product: "상품" };
  const actions = (t: Target, id: number, status: string) => (
    <div className="mt-2 flex flex-wrap gap-2">
      {status !== "hidden" && status !== "blocked" ? (
        <form action={moderate.bind(null, t, id)} className="flex flex-wrap gap-1">
          <input type="hidden" name="do" value="hide" />
          <input className="input !min-h-9 max-w-[220px] text-xs" name="reason" placeholder="가리는 이유(작성자에게 보여요)" aria-label="가리는 이유" />
          <button className="btn btn-sm btn-danger">가리기</button>
        </form>
      ) : (
        <form action={moderate.bind(null, t, id)}><input type="hidden" name="do" value="unhide" /><button className="btn btn-sm">다시 보이기</button></form>
      )}
      {t !== "product" && <form action={moderate.bind(null, t, id)}><input type="hidden" name="do" value="delete" /><input type="hidden" name="reason" value="운영 정책 위반으로 삭제" /><button className="btn btn-sm btn-danger">삭제</button></form>}
      <form action={moderate.bind(null, t, id)}><input type="hidden" name="do" value="dismiss" /><button className="btn btn-sm">신고 기각</button></form>
    </div>
  );
  return (
    <Page>
      <PageTitle title="커뮤니티 관리" sub={`신고가 5건 쌓이면 운영자 확인 전까지 자동으로 가려요. 가리거나 지우면 작성자에게 이유가 전달돼요.`} />
      <nav className="filter-scroll mb-4">
        <Link href="/admin/community" className={`filter-chip ${view === "reports" ? "active" : ""}`}>신고 {reported.length}</Link>
        <Link href="/admin/community?view=posts" className={`filter-chip ${view === "posts" ? "active" : ""}`}>최근 글</Link>
      </nav>
      {view === "reports" ? (
        reported.length === 0 ? (
          <Empty>처리할 신고가 없어요.</Empty>
        ) : (
          <ul className="space-y-2" data-testid="admin-reports">
            {reported.map((r) => {
              const d = describe(r.target, r.target_id);
              if (!d) return null;
              return (
                <li key={`${r.target}-${r.target_id}`} className="card !p-3 text-sm" data-report={`${r.target}-${r.target_id}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{label[r.target]}</Badge>
                    <Badge tone="warn">신고 {r.n}</Badge>
                    {(d.status === "hidden" || d.status === "blocked") && <Badge>가려짐</Badge>}
                    <Link href={href(r.target, r.target_id, (d as { post_id?: number }).post_id)} className="max-w-md truncate font-semibold underline">{d.title}</Link>
                    <span className="text-xs text-muted">{d.author} · 최근 {kst(r.last)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">사유: {[...new Set(r.reasons.split(","))].map((x) => REPORT_REASONS[x] ?? x).join(", ")}</p>
                  {actions(r.target, r.target_id, d.status)}
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <ul className="space-y-2" data-testid="admin-posts">
          {recent.map((p) => (
            <li key={p.id} className="card !p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{p.type === "review" ? "시공 후기" : "공간 소개"}</Badge>
                {p.status === "hidden" && <Badge tone="warn">가려짐</Badge>}
                {p.reports > 0 && <Badge tone="warn">신고 {p.reports}</Badge>}
                <Link href={`/community/${p.id}`} className="font-semibold underline">{p.title}</Link>
                <span className="text-xs text-muted">{p.author} · {kst(p.created_at)}</span>
              </div>
              {actions("post", p.id, p.status)}
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
