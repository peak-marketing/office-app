import { notFound } from "next/navigation";
import LayoutStudio from "@/components/LayoutStudio";
import SpaceView from "@/components/space/SpaceView";
import { versionOption } from "@/lib/space/view";
import { Advisories, BriefTable, BulletList, NeedsReview } from "@/components/project";
import { Notice, Page, PageTitle } from "@/components/ui";
import { buildBrief, homeBrief } from "@/lib/brief";
import HomeRoomsView from "@/components/home/HomeRoomsView";
import HouseView from "@/components/house/HouseView";
import { HOUSE_VENDOR_TEXT } from "@/lib/space/house";
import { HOME_TYPES } from "@/lib/home";
import { ROOM_VENDOR_TEXT } from "@/lib/space/home-room";
import { dateKo } from "@/lib/constants";
import { getProject, getVersion, type ShareLink } from "@/lib/data";
import { get } from "@/lib/db";

export const metadata = { robots: { index: false } };

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const link = get<ShareLink>(`SELECT * FROM share_links WHERE token = ? AND revoked = 0 AND expires_at > datetime('now')`, (await params).token);
  if (!link) notFound();
  const project = getProject(link.project_id)!;
  const version = getVersion(project.current_version_id)!;
  if (version.home) {
    const brief = homeBrief(project, version.home, version.rooms.length);
    return (
      <Page>
        <PageTitle title={`${project.region} · ${HOME_TYPES[version.home.homeType]} 집 요청`} sub={`공유 링크로 보는 화면입니다 · ${dateKo(link.expires_at)}까지 열람 가능`} />
        <div className="space-y-5" data-testid="share-home">
          <section className="card">
            <h2 className="h-section">요청 내용</h2>
            <BriefTable brief={brief} />
          </section>
          <section>
            <h2 className="h-section">방 배치 · {version.rooms.length}개</h2>
            <HomeRoomsView rooms={version.rooms} note={ROOM_VENDOR_TEXT} empty="방 배치가 없습니다(선택 항목)." />
          </section>
          {version.house && (
            <section>
              <h2 className="h-section">집 전체 평면</h2>
              <HouseView house={version.house} note={HOUSE_VENDOR_TEXT} />
            </section>
          )}
          <Notice>상세 주소, 연락처, 파일, 견적은 공유되지 않습니다.</Notice>
        </div>
      </Page>
    );
  }
  const brief = buildBrief(project, version.input, version.result, version.room);
  return (
    <Page>
      <PageTitle title={`${project.region} · ${version.input.areaPyeong}평 사무실 배치안`} sub={`공유 링크로 보는 화면입니다 · v${version.no} · ${dateKo(link.expires_at)}까지 열람 가능`} />
      <div className="space-y-5">
        {version.room && version.placement ? (
          <SpaceView option={versionOption(version)!} styleId={version.selected_style} label={`버전 ${version.no}`} />
        ) : version.layout_status === "ok" ? (
          <>
            <LayoutStudio options={version.result.options} savedOption={version.selected_option} savedStyle={version.selected_style} recommendedOption={version.result.recommended} skipped={version.result.skipped} savedLabel="선택됨" />
            <Advisories result={version.result} />
          </>
        ) : (
          <NeedsReview result={version.result} />
        )}
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="card">
            <h2 className="h-section">요구사항 정리</h2>
            <BriefTable brief={brief} />
          </section>
          <section className="card">
            <h2 className="h-section">이 배치안의 가정</h2>
            <BulletList items={version.result.assumptions} />
          </section>
        </div>
        <Notice>이 화면에서는 선택을 바꿔 볼 수 있지만 저장되지 않습니다. 상세 주소, 연락처, 파일, 견적은 공유되지 않습니다.</Notice>
      </div>
    </Page>
  );
}
