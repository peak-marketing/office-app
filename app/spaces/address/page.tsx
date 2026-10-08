import Link from "next/link";
import AddressLookup from "@/components/address/AddressLookup";
import PlanFinder from "@/components/floorplan/PlanFinder";
import { Page } from "@/components/ui";
import { PLAN_SOURCES } from "@/lib/address";
import { currentUser } from "@/lib/auth";

export const metadata = { title: "주소로 도면 찾기" };

/** 주소로 받을 수 있는 정보(건축물대장 면적·준공)와, 평면도를 받는 방법 안내 */
export default async function AddressPage() {
  const user = await currentUser();
  return (
    <Page narrow>
      <p className="eyebrow">주소로 도면 찾기</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">우리 아파트 도면으로 공간을 만들어요</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">단지·주소를 찾고 평형과 타입을 골라요. 도면이 우리 집과 같은지 확인하면 3D로 이어지고, 없으면 가지고 계신 도면을 올릴 수 있어요.</p>
      <div className="mt-6"><PlanFinder loggedIn={!!user}/></div>
      <details className="mt-6 rounded-xl border border-line p-4" data-testid="address-details"><summary className="cursor-pointer text-sm font-semibold">주소·동·호로 건물 정보와 전용면적 알아보기 (선택)</summary><div className="mt-4"><AddressLookup loggedIn={!!user}/></div></details>
      <section className="mt-10">
        <h2 className="text-lg font-bold">평면도는 이렇게 받을 수 있어요</h2>
        <p className="mt-2 text-sm text-muted">건축물대장 조회에는 평면도가 포함되지 않아요. 공개 도면이나 직접 받은 도면을 사용해 주세요.</p>
        <ul className="mt-3 grid gap-3" data-testid="plan-sources">
          {PLAN_SOURCES.map((s) => (
            <li key={s.title} className="card text-sm">
              <b>{s.title}</b>
              <p className="mt-1 leading-relaxed text-muted">{s.body}</p>
              {"link" in s && <a href={s.link} target="_blank" rel="noreferrer" className="mt-2 inline-block text-brand underline">정부24 열기</a>}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted">받은 도면은 사진이나 PDF로 올려 <Link href="/spaces/recognize" className="text-brand underline">AI 도면 인식</Link>이나 <Link href="/spaces/home?from=trace" className="text-brand underline">따라 그리기</Link>로 공간을 만들 수 있어요. 도면 없이 상담만 신청해도 돼요.</p>
      </section>
    </Page>
  );
}
