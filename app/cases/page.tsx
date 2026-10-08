import Link from "next/link";
import FilterBar from "@/components/explore/FilterBar";
import SpaceCard from "@/components/explore/SpaceCard";
import Icon from "@/components/Icon";
import { currentUser } from "@/lib/auth";
import { filterCases, filterGroups, type CaseQuery } from "@/lib/case-filter";
import { getCases, getSavedCaseIds } from "@/lib/data";

export const metadata = { title: "공간 탐색" };

export default async function Cases({ searchParams }: { searchParams: Promise<CaseQuery> }) {
  const raw = await searchParams;
  const user = await currentUser();
  const canSave = !user || user.role === "customer";
  const saved = new Set(user?.role === "customer" ? getSavedCaseIds(user.id) : []);
  const current = { q: raw.q?.trim() ?? "", space: raw.space ?? "", type: raw.type ?? "", size: raw.size ?? "", style: raw.style ?? "", region: raw.region ?? "", saved: raw.saved === "1" && saved.size ? "1" : "" };
  const all = getCases();
  const cases = filterCases(all, current, saved);
  const examples = cases.filter((c) => c.is_example).length;

  return (
    <main className="min-w-0 flex-1">
      <div className="discovery-wrap">
        <form action="/cases" className="home-search" role="search">
          <Icon name="search" className="size-5 shrink-0 text-muted" />
          {(["space", "type", "size", "style", "region"] as const).map((k) => current[k] && <input key={k} type="hidden" name={k} value={current[k]} />)}
          <input name="q" defaultValue={current.q} placeholder="지역, 업종, 업체명으로 찾기" aria-label="공간 검색" />
          <button type="submit">검색</button>
        </form>
        <FilterBar basePath="/cases" groups={filterGroups(all, true)} current={current} />
        <div className="explore-head flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1>공간 탐색</h1>
            <p>
              공간 {cases.length}곳{current.q && ` · ‘${current.q}’ 검색 결과`}
              {examples > 0 && ` · 이 중 ${examples}곳은 실제 시공 사진이 아닌 3D 제안 예시예요`}
            </p>
          </div>
          {saved.size > 0 && (
            <Link href={current.saved ? "/cases" : "/cases?saved=1"} className={`filter-chip ${current.saved ? "active" : ""}`}>
              <Icon name="bookmark" className="size-4" />
              저장한 공간 {saved.size}
            </Link>
          )}
        </div>
        {cases.length === 0 ? (
          <div className="mt-4 rounded-2xl bg-sand p-10 text-center text-sm text-muted">
            조건에 맞는 공간이 없어요.{" "}
            <Link href="/cases" className="text-brand underline">
              전체 공간 보기
            </Link>
          </div>
        ) : (
          <ul className="space-feed mb-12 mt-4">
            {cases.map((c, i) => (
              <SpaceCard key={c.id} c={c} saved={saved.has(c.id)} canSave={canSave} priority={i < 2} />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
