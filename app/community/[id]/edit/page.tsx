import { notFound } from "next/navigation";
import PostEditor from "@/components/community/PostEditor";
import { Page, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getPostCard, postPhotos } from "@/lib/community";
import { savePost } from "@/lib/community-actions";
import { all } from "@/lib/db";

export const metadata = { title: "글 고치기" };

export default async function EditPost({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("customer");
  const post = getPostCard(Number((await params).id));
  if (!post || post.user_id !== user.id) notFound();
  const photos = postPhotos(post.id);
  const vendors = all<{ id: number; company: string }>(`SELECT id, company FROM vendors WHERE status = 'approved' ORDER BY company`);
  return (
    <Page narrow>
      <PageTitle title="글 고치기" />
      <PostEditor
        action={savePost.bind(null, post.id)}
        projects={all<{id:number;title:string}>(`SELECT id,title FROM projects WHERE customer_id=? ORDER BY id DESC`,user.id)}
        isNew={false}
        vendors={vendors}
        reviewable={[]}
        post={post}
        photos={photos.map((p) => ({ id: p.id, file_id: p.file_id, caption: p.caption }))}
        initialTags={photos.flatMap((p) => p.tags.map((t) => ({ photo: `id:${p.id}`, x: t.x, y: t.y, product: t.product_id, title: t.title })))}
      />
    </Page>
  );
}
