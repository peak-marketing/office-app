import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Page, PageTitle } from "@/components/ui";
import TemplateCards from "@/components/floorplan/TemplateCards";
import { requireUser } from "@/lib/auth";
import { getOwnedProject, getVersion } from "@/lib/data";
import { searchTemplates, templateHouse } from "@/lib/floorplan/jobs";
export const metadata={title:"등록된 아파트 도면 찾기"};
export default async function Templates({searchParams}:{searchParams:Promise<{q?:string;project?:string}>}) {
  const user=await requireUser("customer"),q=await searchParams,project=Number(q.project)||undefined;
  if(project){const p=getOwnedProject(project,user);if(!p || p.kind!=="home")notFound();if(getVersion(p.current_version_id)?.house || ["contracted","closed"].includes(p.status))redirect(`/projects/${project}/house`);}
  const templates=searchTemplates(q.q??"").map(t=>({...t,house:templateHouse(t)}));
  return <Page narrow><PageTitle title="등록된 아파트 도면 찾기" sub="주소·단지명으로 찾고, 평형과 타입을 직접 확인한 뒤 내 공간에 가져와요. 등록된 도면만 검색하며 주소나 면적으로 평면을 추측하지 않아요."/>
    <form className="home-search !mx-0 !max-w-none mb-5"><input name="q" defaultValue={q.q??""} placeholder="주소·단지명·타입" aria-label="등록 도면 검색" data-testid="template-search"/>{project && <input type="hidden" name="project" value={project}/>}<button>찾기</button></form>
    {!templates.length && <div className="card space-y-3" data-testid="templates-empty"><p className="font-semibold">일치하는 등록 도면이 아직 없어요.</p><p className="text-sm text-muted">관리사무소·분양 자료·직접 측정한 도면을 올리면 내 공간을 만들 수 있어요.</p><Link className="btn btn-primary" href={`/spaces/recognize${project?`?project=${project}`:""}`}>내 도면 올려 만들기</Link></div>}
    <TemplateCards templates={templates} project={project}/>
  </Page>;
}
