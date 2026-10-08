import {recognitionToHouse, type PlanRecognition} from "./geometry";
import {planSource} from "./catalog";
import type {Pt} from "../space/geometry";

/** Source-reviewed trace, NOT an AI result or a measured construction drawing.
 * KB's 923×676 basic-type illustration was compared visually on 2026-10-05.
 * Pixel geometry is retained so customers can compare the overlay with the original.
 * No physical scale is assumed: the printed dimension chain uses unspecified wall faces.
 */
export function referenceRecognition(id:string):PlanRecognition|null {
  if(id!=="galmae-112A")return null;
  const point=([x,y]:Pt):Pt=>[x/923,y/676];
  const wall=(a:Pt,b:Pt)=>({a:point(a),b:point(b)});
  const opening=(kind:PlanRecognition["openings"][number]["kind"],a:Pt,b:Pt)=>({kind,...wall(a,b)});
  const label=(name:string,kind:PlanRecognition["labels"][number]["kind"],p:Pt)=>({name,kind,point:point(p)});
  return {isFloorplan:true,supported:true,
    outline:([[216,596],[216,182],[366,182],[366,85],[550,85],[550,230],[654,230],[654,250],[729,250],[729,531],[591,531],[591,596]] as Pt[]).map(point),
    walls:[
      wall([294,182],[294,381]),wall([216,289],[294,289]),wall([294,204],[413,204]),wall([413,176],[413,326]),wall([294,326],[413,326]),
      wall([324,326],[324,381]),wall([216,381],[387,381]),wall([387,381],[387,596]),wall([216,541],[591,541]),wall([280,541],[280,596]),
      wall([454,85],[454,176]),wall([366,176],[550,176]),wall([550,230],[550,326]),wall([550,326],[654,326]),wall([654,250],[654,381]),
      wall([654,279],[729,279]),wall([591,381],[729,381]),wall([591,381],[591,531]),wall([591,496],[729,496]),
      wall([249,182],[249,226]),wall([216,226],[249,226]),
    ],
    openings:[
      opening("window",[385,85],[430,85]),opening("window",[464,85],[506,85]),opening("window",[300,182],[343,182]),
      opening("sliding",[300,204],[344,204]),opening("door",[370,326],[404,326]),opening("bath",[259,289],[289,289]),
      opening("passage",[294,381],[321,381]),opening("door",[349,381],[380,381]),opening("entry",[587,230],[622,230]),
      opening("bath",[654,339],[654,371]),opening("door",[598,381],[629,381]),opening("sliding",[615,496],[695,496]),
      opening("window",[615,531],[695,531]),opening("sliding",[409,541],[562,541]),opening("sliding",[300,541],[374,541]),
      opening("window",[409,596],[562,596]),opening("window",[300,596],[374,596]),opening("window",[231,596],[266,596]),
      opening("balcony",[280,549],[280,583]),opening("sliding",[464,176],[506,176]),
    ],
    labels:[label("침실 1","bed",[303,459]),label("침실 2","bed",[350,264]),label("침실 3","bed",[662,444]),
      label("욕실 1","bath",[269,241]),label("욕실 2","bath",[691,343]),label("드레스룸","dress",[273,348]),
      label("거실·주방/식당","living",[475,467]),label("현관","entry",[606,275]),
      label("발코니 1","balcony",[490,119]),label("발코니 2","balcony",[349,188]),label("발코니 3","balcony",[330,573]),
      label("발코니 4","balcony",[487,573]),label("발코니 5","balcony",[663,515]),
      label("대피공간 1","utility",[403,125]),label("대피공간 2","utility",[240,566])],
    widthMm:null,dimensionEvidence:"아래쪽 치수선 4,090 + 4,620 + 3,190 = 11,900mm. 벽 안쪽 기준인지는 확인되지 않아 자동으로 적용하지 않아요.",
    warnings:["공개 기본형 도면을 원본과 대조해 따라 그린 참고 배치예요. AI 자동 인식 성공 결과가 아니에요.",
      "공개 그림의 축척과 벽 기준은 실측과 다를 수 있어요. 가구 구매·시공 전에 전체 폭과 각 방 치수를 확인하고 벽 위치를 수정해 주세요.",
      "발코니 확장·이전 공사로 바뀐 구조는 반영되지 않았어요. 싱크대·욕조·변기 등 설비의 실제 위치와 규격은 따로 입력해 주세요."]};
}

export function sourceHouse(raw:unknown,iw:number,ih:number,widthMm:number,heightMm=2400,fileId=0,sourceId="") {
  const h=recognitionToHouse(raw,iw,ih,widthMm,heightMm,fileId),source=planSource(sourceId);
  if(source){
    const reference=Boolean(referenceRecognition(sourceId));
    h.provenance={kind:reference?"template":"ai",label:`${reference?"공개 도면 참고 배치 · 원본 대조":"AI 도면 인식 초안"} · ${source.complex} ${source.unitType}`,
      warnings:[...(!reference?h.provenance!.warnings:[...((raw as PlanRecognition).warnings),"벽 두께·천장 높이·문 열림 방향은 시작값이며 업체 확인 전이에요."]),`원본 출처: KB부동산 ${source.pageUrl}`]};
  }
  return h;
}
