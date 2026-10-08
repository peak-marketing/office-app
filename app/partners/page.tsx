import Link from "next/link";
import { redirect } from "next/navigation";
import { PartnerForm } from "@/components/forms";
import { Page } from "@/components/ui";
import { signup } from "@/lib/actions";
import { currentUser, homeFor } from "@/lib/auth";

export const metadata = { title: "시공 파트너 입점" };

const POINTS: [string, string][] = [
  ["정리된 요청서", "지역, 평수, 인원, 예산, 일정, 요청 범위와 배치 도면·3D, 현장 사진이 한 화면에 정리되어 도착합니다."],
  ["운영자가 검토한 요청만", "운영자가 자료를 확인한 뒤 지역과 조건에 맞는 시공사에 배정합니다. 참여 여부는 요청마다 직접 정합니다."],
  ["비공개 제안, 고객이 선택", "운영자가 선정한 여러 업체가 같은 요청을 기준으로 비공개로 가격·설계·자재·기간을 제안하고, 고객이 비교해 선택합니다. 다른 업체의 금액과 제안은 볼 수 없고, 최저가 자동 낙찰은 하지 않습니다."],
  ["계약은 기존 절차대로", "상세 주소와 연락처는 고객이 현장 방문을 요청하면 공개됩니다. 계약과 대금은 귀사의 절차로 진행합니다."],
];
const FLOW = ["입점 신청", "운영자 확인·승인", "업체 소개·시공 사례 등록", "요청 배정", "참여 확정·제안 제출", "고객 상담·현장 방문"];

export default async function Partners() {
  const user = await currentUser();
  if (user?.role === "vendor") redirect(homeFor(user));
  return (
    <Page>
      <div className="grid gap-10 py-4 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-14 lg:py-10">
        <div>
          <p className="eyebrow">시공 파트너</p>
          <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            조건이 정리된 사무실 공사 요청을
            <br />
            받아 보세요
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
            20~50평 소형 사무실 인테리어 요청을 설계·시공사에 연결합니다. 고객이 등록한 조건과 배치 도면을 기준으로 제안을 작성하면, 고객이 여러 제안을 비교한 뒤 상담과 현장 방문을 요청합니다.
          </p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {POINTS.map(([title, body]) => (
              <li key={title} className="card">
                <h2 className="text-sm font-semibold">{title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
              </li>
            ))}
          </ul>
          <h2 className="mt-10 text-lg font-bold">입점부터 제안까지</h2>
          <ol className="mt-3 flex flex-wrap gap-2 text-sm">
            {FLOW.map((step, i) => (
              <li key={step} className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5">
                <span className="grid size-5 place-items-center rounded-full bg-ink text-[10px] font-semibold text-white">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </div>
        <div id="apply" className="h-fit rounded-2xl border border-line bg-surface p-6 lg:sticky lg:top-6">
          <h2 className="text-lg font-bold">파트너 입점 신청</h2>
          <p className="mb-5 mt-1 text-xs leading-relaxed text-muted">신청하면 계정이 만들어지고, 운영자 승인 뒤 업체 목록에 공개되며 요청을 배정받습니다. 승인을 기다리는 동안 업체 소개와 시공 사례를 등록할 수 있습니다.</p>
          {user ? (
            <p className="rounded-lg bg-sand p-3 text-sm">현재 {user.role === "admin" ? "운영자" : "고객"} 계정으로 로그인되어 있습니다. 입점 신청은 로그아웃한 뒤 새 계정으로 진행해 주세요.</p>
          ) : (
            <>
              <PartnerForm action={signup} />
              <p className="mt-5 text-sm text-muted">
                이미 파트너 계정이 있나요?{" "}
                <Link href="/login" className="text-brand underline">
                  로그인
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </Page>
  );
}
