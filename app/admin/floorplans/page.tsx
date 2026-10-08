import Link from "next/link";
import {Page,PageTitle} from "@/components/ui";
import TemplateAdmin from "@/components/floorplan/TemplateAdmin";
import {requireUser} from "@/lib/auth";
import {all} from "@/lib/db";
import {searchTemplates} from "@/lib/floorplan/jobs";
import {toggleFloorplanTemplate} from "@/lib/floorplan-actions";
export default async function FloorplansAdmin() {
  await requireUser("admin");
  const projects=all<{id:number;title:string}>("SELECT p.id,p.title FROM projects p JOIN versions v ON v.id=p.current_version_id WHERE p.kind='home' AND v.house IS NOT NULL ORDER BY p.id DESC");
  const templates=searchTemplates("",true);
  return <Page><PageTitle title="아파트 등록 도면 관리" sub="사용 권한과 실제 구조를 검토한 도면만 등록해 주세요. 같은 면적의 타입은 고객이 직접 구분해 선택해요."/><Link className="text-sm text-brand underline" href="/admin/integrations">AI·외부 연동 상태</Link><div className="mt-4"><TemplateAdmin projects={projects}/></div><ul className="mt-5 space-y-3">{templates.map(t=><li key={t.id} className="card flex flex-wrap items-center justify-between gap-3"><div><b>{t.complex} · {t.unit_type}</b><p className="text-xs text-muted">{t.address} · {t.area}㎡ · {t.active?"공개":"숨김"}</p></div><form action={toggleFloorplanTemplate.bind(null,t.id)}><button className="btn btn-sm">{t.active?"숨기기":"다시 공개"}</button></form></li>)}</ul></Page>;
}
