import Link from "next/link";
import Icon from "@/components/Icon";
import { Page } from "@/components/ui";
import { currentUser, homeFor } from "@/lib/auth";

export const metadata = { title: "시공 견적 요청" };

const viaSignup = (href: string) => `/signup?next=${encodeURIComponent(href)}`;

/** 시공 견적 요청 시작: 공간 종류 고르기. 여러 시공사가 같은 요청 기준으로 비공개 제안을 보내고, 고객이 비교해 고른다. */
export default async function RequestStart({ searchParams }: {searchParams:Promise<{post?:string;postPhoto?:string}>}) {
  const q=await searchParams;
  const suffix=q.post ? `?${new URLSearchParams({post:q.post,...(q.postPhoto ? {postPhoto:q.postPhoto} : {})})}` : "";
  const user = await currentUser();
  const go = (href: string) => (!user ? viaSignup(href) : user.role === "customer" ? href : homeFor(user));
  const options = [
    { href: go(`/homes/new${suffix}`), title: "집", body: "원룸·오피스텔·빌라·아파트. 도면이나 치수가 없어도 상담을 신청할 수 있어요.", icon: "home" as const },
    { href: go(`/spaces/new${suffix}`), title: "사무실", body: "치수나 도면으로 공간을 만들고 배치를 정해 요청하거나, 자료 없이 상담을 접수해요.", icon: "briefcase" as const },
  ];
  return (
    <Page narrow>
      <p className="eyebrow">시공 견적 요청</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">어떤 공간을 고치나요?</h1>
      <ul className="mt-6 grid gap-3">
        {options.map((o) => (
          <li key={o.title}>
            <Link href={o.href} className="intake-option items-center">
              <span className="intake-icon"><Icon name={o.icon} /></span>
              <span className="min-w-0 flex-1">
                <b className="text-base">{o.title}</b>
                <span className="mt-1 block text-sm leading-relaxed text-muted">{o.body}</span>
              </span>
              <Icon name="chevron" className="size-5 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
      <section className="mt-8 rounded-2xl bg-sand p-5 text-sm leading-relaxed">
        <h2 className="font-bold">요청 뒤에는 이렇게 진행돼요</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
          <li>요청을 보내면 운영자가 자료를 확인해요. 요청할 때 ‘업체 직접 참여’를 켜 두면 승인된 시공사가 요청을 보고 직접 참여할 수도 있어요(정해 둔 업체 수까지).</li>
          <li>참여한 시공사가 같은 요청 내용을 기준으로 가격·설계·자재·기간을 제안해요. 업체끼리는 서로의 제안을 볼 수 없어요.</li>
          <li>제안을 나란히 비교하고 마음에 드는 곳에 상담·현장 방문을 요청해요. 가장 싼 곳이 자동으로 정해지지 않아요.</li>
          <li>상세 주소와 연락처는 방문을 요청한 업체에만 공개돼요.</li>
        </ol>
      </section>
    </Page>
  );
}
