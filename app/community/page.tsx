import Feed from "@/components/community/Feed";
import type { PostQuery } from "@/lib/community";

export const metadata = { title: "커뮤니티" };

export default async function Community({ searchParams }: { searchParams: Promise<PostQuery> }) {
  return (
    <main className="discovery-wrap pb-16">
      <Feed base="/community" query={await searchParams} intro="고객이 직접 올린 공간 소개와, 계약이 확인된 시공 후기를 모았어요. 업체가 올린 사례는 ‘시공 사례’에 따로 있어요." />
    </main>
  );
}
