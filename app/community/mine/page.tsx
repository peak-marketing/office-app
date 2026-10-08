import Link from "next/link";
import { Badge, Empty, Page, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { myPosts, POST_TYPE } from "@/lib/community";
import { dateKo } from "@/lib/constants";

export const metadata = { title: "내 글" };

export default async function MyPosts() {
  const user = await requireUser("customer");
  const posts = myPosts(user.id);
  return (
    <Page narrow>
      <PageTitle title="내 글" actions={<Link href="/community/new" className="btn btn-primary btn-sm">글쓰기</Link>} />
      {posts.length === 0 ? (
        <Empty>쓴 글이 없어요.</Empty>
      ) : (
        <ul className="space-y-2">
          {posts.map((p) => (
            <li key={p.id}>
              <Link href={`/community/${p.id}`} className="flex gap-3 rounded-2xl border border-line bg-white p-3 hover:border-brand">
                <span className="size-16 shrink-0 overflow-hidden rounded-xl bg-sand">{p.cover && <img src={`/files/${p.cover}`} alt="" className="size-full object-cover" />}</span>
                <span className="min-w-0">
                  <span className="flex flex-wrap gap-1.5"><Badge>{POST_TYPE[p.type]}</Badge>{p.status === "hidden" && <Badge tone="warn">운영자가 가림</Badge>}</span>
                  <span className="mt-1 block truncate font-semibold">{p.title}</span>
                  <span className="text-xs text-muted">{dateKo(p.created_at)} · 좋아요 {p.likes} · 댓글 {p.comments}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
