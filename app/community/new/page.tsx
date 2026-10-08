import PostEditor from "@/components/community/PostEditor";
import { Page, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { reviewableProjects } from "@/lib/community";
import { savePost } from "@/lib/community-actions";
import { all } from "@/lib/db";

export const metadata = { title: "글쓰기" };

export default async function NewPost({ searchParams }: { searchParams: Promise<{ type?: string; project?:string }> }) {
  const user = await requireUser("customer");
  const reviewable = reviewableProjects(user.id);
  const q=await searchParams;
  const projects=all<{id:number;title:string;kind:string}>(`SELECT id,title,kind FROM projects WHERE customer_id=? ORDER BY id DESC`,user.id);
  const selected=projects.find(p => p.id===Number(q.project));
  const wantReview = q.type === "review" && reviewable.length > 0;
  const vendors = all<{ id: number; company: string }>(`SELECT id, company FROM vendors WHERE status = 'approved' ORDER BY company`);
  return (
    <Page narrow>
      <PageTitle title="글쓰기" sub="내 공간을 소개하거나, 계약한 시공사의 공사 후기를 남겨요." />
      <PostEditor
        action={savePost.bind(null, null)}
        projects={projects}
        isNew
        vendors={vendors}
        reviewable={reviewable.map((p) => ({ id: p.id, title: p.title, company: p.company }))}
        post={{ type: wantReview ? "review" : "space", project_id: selected?.id ?? null, title: "", body: "", space_kind: selected?.kind ?? "home", home_type: "", area_pyeong: null, style: "", region: "", vendor_id: null, rating: null }}
      />
    </Page>
  );
}
