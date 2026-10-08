import HouseCreate from "@/components/house/HouseCreate";
import {Page,PageTitle} from "@/components/ui";
import {createHouseSpace} from "@/lib/actions";
import {requireUser} from "@/lib/auth";
export default async function HomeSpace({searchParams}:{searchParams:Promise<{from?:string}>}){
  await requireUser("customer");
  const q=await searchParams;
  return <Page><PageTitle title="내 집 평면 직접 만들기" sub="실측 치수나 도면으로 외곽을 만들고, 다음 편집기에서 내부 벽·문·창·가구를 넣어요. 공사 요청 없이 저장할 수 있어요."/><HouseCreate action={createHouseSpace} initial={q.from==="trace"?"trace":"dims"}/></Page>;
}
