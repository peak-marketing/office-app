import Link from "next/link";
import type { CaseCard } from "@/lib/data";
import { styleName } from "../cases";
import { SaveCaseButton } from "../vendor-client";
import { KindBadge } from "./KindBadge";
import { HOME_TYPES } from "@/lib/home";

export { KindBadge };

/** 사진이 주인공인 공간 카드. 이름·평수·인원·스타일과 저장 버튼. */
export default function SpaceCard({ c, saved = false, canSave = true, priority = false }: { c: CaseCard; saved?: boolean; canSave?: boolean; priority?: boolean }) {
  const home = c.spec.kind === "home";
  const facts = (home ? [c.area_pyeong != null && `${c.area_pyeong}평`, "방 한 칸 3D"] : [c.area_pyeong != null && `${c.area_pyeong}평`, c.spec.staff && `${c.spec.staff}명`, styleName(c.style)]).filter(Boolean) as string[];
  const category = home ? `집 · ${c.spec.homeType ? HOME_TYPES[c.spec.homeType] : "주거"}` : c.spec.category;
  return (
    <li className="space-card" data-case={c.id}>
      <Link href={`/cases/${c.id}`} className="block">
        <span className="space-card-media">
          {c.photos[0] ? (
            // eslint-disable-next-line @next/next/no-img-element -- 업로드 파일
            <img src={`/files/${c.photos[0]}`} alt={c.title} loading={priority ? "eager" : "lazy"} />
          ) : (
            <span className="grid aspect-[4/3] place-items-center text-sm text-muted">사진 준비 중</span>
          )}
          <span className="absolute left-3 top-3">
            <KindBadge example={c.is_example} />
          </span>
        </span>
        <span className="space-card-body">
          {category && <span className="space-card-cat">{category}</span>}
          <b className="space-card-title">{c.title}</b>
          <span className="space-card-facts">
            {facts.map((f, i) => (
              <span key={f}>
                {i > 0 && <i aria-hidden>·</i>}
                {f}
              </span>
            ))}
          </span>
        </span>
      </Link>
      {canSave && (
        <span className="absolute right-3 top-3">
          <SaveCaseButton key={`${c.id}-${saved}`} caseId={c.id} initial={saved} />
        </span>
      )}
    </li>
  );
}
