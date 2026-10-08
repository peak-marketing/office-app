import { all, get, run, transaction } from "../db";
import { houseErrors, type HouseModel } from "../space/house";

export interface RecognitionJob {
  id: number; owner_id: number; file_id: number | null; project_id: number | null;
  status: "processing" | "ready" | "failed" | "used"; result: string | null; error: string;
  iw: number; ih: number; accepted_project_id: number | null; expires_at: string; source_id: string; selection_id: string;
}
export interface PlanSelection {id:string;owner_id:number;source_id:string;dong:string;ho:string;variant:"basic"|"expanded"|"unknown"}
export const ownedSelection=(id:string,user:number)=>get<PlanSelection>("SELECT * FROM floorplan_selections WHERE id=? AND owner_id=? AND expires_at >= datetime('now')",id,user);
export interface PlanTemplate { id: number; complex: string; address: string; unit_type: string; area: number; source_note: string; house: string; active: number }

export function reserveRecognition(owner: number, project: number | null) {
  return transaction(() => {
    run("UPDATE floorplan_jobs SET status='failed',error='인식 연결이 중단됐어요. 다시 시도해 주세요.' WHERE status='processing' AND created_at < datetime('now','-5 minutes')");
    if (get("SELECT id FROM floorplan_jobs WHERE owner_id=? AND status='processing'", owner)) throw new Error("이미 읽고 있는 도면이 있어요. 완료될 때까지 기다려 주세요.");
    const n = get<{ n: number }>("SELECT count(*) n FROM floorplan_jobs WHERE owner_id=? AND created_at > datetime('now','-1 day')", owner)!.n;
    if (n >= 30) throw new Error("오늘의 도면 인식 횟수(30회)를 모두 사용했어요. 내일 다시 이용해 주세요.");
    return run("INSERT INTO floorplan_jobs(owner_id,project_id,status) VALUES (?,?,'processing')", owner, project);
  });
}
export const ownedJob = (id: number, user: number) => get<RecognitionJob>("SELECT * FROM floorplan_jobs WHERE id=? AND owner_id=?", id, user);
export const jobIsFresh = (job: RecognitionJob) => job.expires_at >= new Date().toISOString().slice(0, 19).replace("T", " ");

export function pngSize(bytes: Buffer) {
  if (bytes.length < 33 || bytes.length > 8 * 1024 * 1024 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.subarray(12,16).toString() !== "IHDR") throw new Error("올린 도면을 읽지 못했어요. JPG·PNG·WEBP·PDF를 다시 선택해 주세요.");
  const iw = bytes.readUInt32BE(16), ih = bytes.readUInt32BE(20);
  if (iw < 32 || ih < 32 || iw > 3000 || ih > 3000) throw new Error("도면 해상도를 확인해 주세요(각 변 32~3,000px).");
  return { iw, ih };
}
export function searchTemplates(keyword: string, includeHidden = false) {
  const q = keyword.trim().slice(0, 100).replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
  return all<PlanTemplate>(`SELECT * FROM floorplan_templates WHERE ${includeHidden ? "1=1" : "active=1"} AND (complex LIKE ? ESCAPE '\\' OR address LIKE ? ESCAPE '\\' OR unit_type LIKE ? ESCAPE '\\') ORDER BY id DESC LIMIT 40`, `%${q}%`, `%${q}%`, `%${q}%`);
}
export function templateHouse(t: PlanTemplate): HouseModel {
  const h = JSON.parse(t.house) as HouseModel;
  if (houseErrors(h).length) throw new Error("등록된 도면을 확인해야 해요. 운영자에게 문의해 주세요.");
  delete h.underlay; h.items = []; h.rev = 0; h.saved_at = "";
  h.provenance = { kind: "template", label: `등록 도면 · ${t.complex} ${t.unit_type}`, warnings: ["같은 단지·면적에도 구조나 확장 여부가 다를 수 있어요. 실제 집과 비교해 고쳐 주세요.", `도면 출처: ${t.source_note}`] };
  return h;
}
