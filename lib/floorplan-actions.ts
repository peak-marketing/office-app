"use server";
import { revalidatePath } from "next/cache";
import {redirect} from "next/navigation";
import {randomUUID} from "node:crypto";
import { currentUser, requireUser } from "./auth";
import { getOwnedProject, getVersion } from "./data";
import { get, run } from "./db";
import { saveUploads } from "./uploads";
import { floorplanEnabled, readFloorplan } from "./floorplan/provider";
import { ownedJob, ownedSelection, pngSize, reserveRecognition, type PlanTemplate } from "./floorplan/jobs";
import { houseErrors } from "./space/house";
import {findPlans} from "./floorplan/search";
import {sourceImage,verifyReferenceImage} from "./floorplan/source-image";
import {planSource} from "./floorplan/catalog";
import {referenceRecognition} from "./floorplan/reference";

export async function lookupPlans(keyword:string){await requireUser("customer");return findPlans(keyword);}

export async function selectFloorplanSource(_: {error?:string},fd:FormData):Promise<{error?:string}>{
  const user=await requireUser("customer"),source=planSource(String(fd.get("source")??""));
  const dong=String(fd.get("dong")??"").trim(),ho=String(fd.get("ho")??"").trim(),variant=String(fd.get("variant")??"unknown");
  if(!source||fd.get("confirmed")!=="on")return {error:"단지·타입과 도면이 내 집에 맞는지 확인해 주세요."};
  if(!["basic","expanded","unknown"].includes(variant)||[dong,ho].some(v=>v.length>20||!/^[\p{L}\p{N}\s-]*$/u.test(v)))return {error:"동·호와 확장 여부를 확인해 주세요."};
  if(variant==="expanded"&&source.variant.startsWith("기본형"))return {error:"확장형 도면은 아직 등록되지 않았어요. 실제 확장 도면을 직접 올려 주세요."};
  const id=randomUUID();
  run("INSERT INTO floorplan_selections(id,owner_id,source_id,dong,ho,variant) VALUES(?,?,?,?,?,?)",id,user.id,source.id,dong,ho,variant);
  redirect(`/spaces/recognize?selection=${id}`);
}

export async function analyzeFloorplan(fd: FormData) {
  const user = await currentUser();
  if (!user || user.role !== "customer") return { error: "고객 계정으로 로그인해 주세요." };
  const projectId = Number(fd.get("project")) || null;
  if (projectId) {
    const p = getOwnedProject(projectId, user);
    if (!p || p.kind !== "home" || ["contracted", "closed"].includes(p.status) || getVersion(p.current_version_id)?.house) return { error: "새 평면을 만들 수 있는 내 주거 공간을 선택해 주세요." };
  }
  const selectionId=String(fd.get("selection")??""),selection=selectionId?ownedSelection(selectionId,user.id):undefined;
  if(selectionId&&!selection)return {error:"내 도면 선택 기록을 찾지 못했거나 만료됐어요. 다시 골라 주세요."};
  const file = fd.get("image"),sourceId=selection?.source_id||String(fd.get("source")??""),source=planSource(sourceId);
  if(source&&file instanceof File)return {error:"선택한 공개 도면과 업로드한 도면 중 하나만 골라 주세요."};
  if(sourceId&&(!source||fd.get("sourceConfirmed")!=="yes"))return {error:"단지와 타입, 원본 도면이 내 집과 같은지 먼저 확인해 주세요."};
  const reference=source?referenceRecognition(source.id):null;
  if(!reference && fd.get("consent")!=="yes")return {error:"도면의 AI 분석 전송에 동의해 주세요."};
  if(!reference && !floorplanEnabled())return {error:"AI 도면 인식은 아직 연결 전이에요. 도면 따라 그리기를 이용하거나 운영자에게 API 연결을 요청해 주세요."};
  if (!source && (!(file instanceof File) || file.size > 8 * 1024 * 1024)) return { error: "분석할 도면을 선택해 주세요(변환 후 8MB 이하)." };
  let id: number | undefined;
  try {
    const bytes = source ? await sourceImage(source.id) : Buffer.from(await (file as File).arrayBuffer());
    if(reference)await verifyReferenceImage(source!.id,bytes);
    const size = pngSize(bytes);
    id = reserveRecognition(user.id, projectId);
    const [fileId] = await saveUploads([new File([bytes], "floorplan.png", { type: "image/png" })], "image", user.id, "ai-floorplan", "private");
    run("UPDATE floorplan_jobs SET file_id=?,iw=?,ih=?,source_id=?,selection_id=? WHERE id=?", fileId, size.iw, size.ih, source?.id??"",selection?.id??"", id);
    const result = reference ?? await readFloorplan(bytes);
    run("UPDATE floorplan_jobs SET result=?,status='ready' WHERE id=? AND status='processing'", JSON.stringify(result), id);
    const job = ownedJob(id, user.id);
    if (job?.status !== "ready") return { error: "도면 인식이 만료됐어요. 다시 시도해 주세요." };
    return { id, result, iw: size.iw, ih: size.ih, image: `/files/${fileId}`,sourceId:source?.id??"" };
  } catch (e) {
    const error = e instanceof Error ? e.message : "도면 인식에 실패했어요.";
    if (id) run("UPDATE floorplan_jobs SET status='failed',error=? WHERE id=?", error.slice(0, 500), id);
    return { error };
  }
}

export async function registerFloorplanTemplate(_: { error?: string; ok?: string }, fd: FormData): Promise<{error?: string; ok?: string}> {
  const user = await requireUser("admin");
  const project = getOwnedProject(Number(fd.get("project")), user);
  const house = project ? getVersion(project.current_version_id)?.house : undefined;
  const str = (k: string) => String(fd.get(k) ?? "").trim();
  const complex = str("complex"), address = str("address"), unit = str("unit"), source = str("source"), area = Number(fd.get("area"));
  if (!house || houseErrors(house).length) return { error: "집 전체 평면이 있는 주거 프로젝트를 선택해 주세요." };
  if (!complex || complex.length > 80 || !address || address.length > 150 || !unit || unit.length > 40 || !source || source.length > 200 || !(area >= 5 && area <= 1000)) return { error: "단지명·주소·타입·전용면적·출처를 확인해 주세요." };
  if (fd.get("rights") !== "on") return { error: "도면 사용 권한과 개인정보 제외 여부를 확인해 주세요." };
  const copy = { ...house, items: [], rev: 0, saved_at: "" };
  delete copy.underlay; delete copy.provenance;
  run("INSERT INTO floorplan_templates(complex,address,unit_type,area,source_note,house,created_by) VALUES(?,?,?,?,?,?,?)", complex, address, unit, area, source, JSON.stringify(copy), user.id);
  revalidatePath("/", "layout");
  return { ok: "도면을 등록했어요. 고객이 타입과 실제 구조를 확인한 뒤 복사해서 사용해요." };
}
export async function toggleFloorplanTemplate(id: number) {
  await requireUser("admin");
  if (get<PlanTemplate>("SELECT * FROM floorplan_templates WHERE id=?", id)) run("UPDATE floorplan_templates SET active=1-active WHERE id=?", id);
  revalidatePath("/", "layout");
}
