import Feed from "@/components/community/Feed";
import type { PostQuery } from "@/lib/community";

export const metadata = { title: "공간 소개" };

export default async function Spaces({ searchParams }: { searchParams: Promise<PostQuery> }) {
  return (
    <main className="discovery-wrap pb-16">
      <Feed base="/community/spaces" fixedType="space" query={await searchParams} intro="고객이 직접 꾸민 공간을 사진으로 소개해요. 사진 속 상품을 눌러 바로 볼 수 있어요." />
    </main>
  );
}
