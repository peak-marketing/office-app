import Feed from "@/components/community/Feed";
import type { PostQuery } from "@/lib/community";

export const metadata = { title: "시공 후기" };

export default async function Reviews({ searchParams }: { searchParams: Promise<PostQuery> }) {
  return (
    <main className="discovery-wrap pb-16">
      <Feed base="/community/reviews" fixedType="review" query={await searchParams} intro="이 플랫폼에서 계약 결과가 기록된 고객만 쓸 수 있는 시공 후기예요. 후기마다 계약한 시공사가 연결되어 있어요." />
    </main>
  );
}
