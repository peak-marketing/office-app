import { notFound, redirect } from "next/navigation";
import { Page, PageTitle } from "@/components/ui";
import RecognizePlan, { type RecognitionResult } from "@/components/floorplan/RecognizePlan";
import { requireUser } from "@/lib/auth";
import { getOwnedProject, getVersion } from "@/lib/data";
import { floorplanEnabled } from "@/lib/floorplan/provider";
import { ownedJob, ownedSelection, jobIsFresh } from "@/lib/floorplan/jobs";
import {planSource} from "@/lib/floorplan/catalog";
import { parseRecognition } from "@/lib/floorplan/geometry";
export const metadata = { title: "AI로 도면에서 내 공간 만들기" };
export default async function RecognizePage({searchParams}:{searchParams:Promise<{project?:string;job?:string;selection?:string}>}) {
  const user=await requireUser("customer"), q=await searchParams;
  let project=Number(q.project)||undefined;
  let initial:RecognitionResult|undefined;
  const selection=q.selection?ownedSelection(q.selection,user.id):undefined;
  if(q.selection&&!selection)notFound();
  let source=selection?planSource(selection.source_id):undefined;
  if(q.job){
    const job=ownedJob(Number(q.job),user.id);if(!job)notFound();
    if(job.status==="used" && job.accepted_project_id)redirect(`/projects/${job.accepted_project_id}/house/edit`);
    if(job.project_id){if(project && project!==job.project_id)notFound();project=job.project_id;}
    if(job.source_id)source=planSource(job.source_id);
    if(job.status==="ready" && job.result && jobIsFresh(job)) initial={id:job.id,result:parseRecognition(JSON.parse(job.result)),iw:job.iw,ih:job.ih,image:`/files/${job.file_id}`,sourceId:job.source_id};
  }
  if(project){const p=getOwnedProject(project,user);if(!p || p.kind!=="home")notFound();if(["contracted","closed"].includes(p.status) || getVersion(p.current_version_id)?.house)redirect(`/projects/${project}/house`);}
  return <Page narrow><PageTitle title="도면을 읽어 내 공간 초안을 만들어요" sub="불러온 벽·문·창을 원본과 비교하고 실제 치수를 확인해요. 위치나 누락은 편집기에서 고친 뒤 공사 요청을 따로 보내요." /><RecognizePlan enabled={floorplanEnabled()} project={project} initial={initial} source={source} selection={selection?.id}/></Page>;
}
