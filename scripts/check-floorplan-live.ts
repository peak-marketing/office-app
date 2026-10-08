// Paid, opt-in model evaluation; ordinary unit/E2E tests never call the live API.
// node --env-file=.env.local --import tsx scripts/check-floorplan-live.ts --live <image.png> <truth.json> <output-dir>
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {readFloorplan} from "../lib/floorplan/provider";
import {recognitionToHouse} from "../lib/floorplan/geometry";
import {detectRooms,regionAt} from "../lib/space/house-rooms";
import {pngSize} from "../lib/floorplan/jobs";
const {measureRecognition}=createRequire(import.meta.url)("../tests/live/floorplan-metrics.cjs");
async function main(){
  const [flag,imagePath,truthPath,outputDir]=process.argv.slice(2);
  if(flag!=="--live"||!imagePath||!truthPath||!outputDir)throw new Error("실제 API 비용이 발생합니다. --live <image.png> <truth.json> <output-dir>로 실행하세요.");
  if(!process.env.OPENAI_API_KEY)throw new Error("서버 API 키가 필요합니다. 키를 출력하지 마세요.");
  const image=fs.readFileSync(imagePath),size=pngSize(image),truth=JSON.parse(fs.readFileSync(truthPath,"utf8"));
  if(size.iw!==truth.iw||size.ih!==truth.ih)throw new Error("검증 도면과 정답 좌표의 이미지 크기가 다릅니다.");
  fs.mkdirSync(outputDir,{recursive:true});
  const start=Date.now();let metadata:Record<string,unknown>={};
  try{
    const plan=await readFloorplan(image,async(url,options)=>{
      const response=await fetch(url,options),body=await response.clone().json();
      metadata={httpStatus:response.status,requestId:response.headers.get("x-request-id"),model:body.model,usage:body.usage,errorCode:body.error?.code};
      // Customer samples are private. Keep this output outside Git. Request headers/key are never written.
      fs.writeFileSync(path.join(outputDir,"response.json"),JSON.stringify(body,null,2));return response;
    });
    let h,geometryError;
    try{h=recognitionToHouse(plan,size.iw,size.ih,truth.widthMm);}catch(e){geometryError=e instanceof Error?e.message:String(e);}
    const metrics=measureRecognition(plan,truth),detection=h?detectRooms(h):null,roomCount=detection?detection.regions.filter(r=>!r.sliver).length:null;
    const minX=Math.min(...truth.outline.map((q:number[])=>q[0])),maxX=Math.max(...truth.outline.map((q:number[])=>q[0])),maxY=Math.max(...truth.outline.map((q:number[])=>q[1]));
    const scale=truth.widthMm/1000/(maxX-minX);
    const roomLabelsCorrect=Boolean(detection)&&!detection!.dupLabels.length&&!detection!.lostLabels.length&&truth.labels.every((l:{point:number[];name:string;kind:string})=>{
      const idx=regionAt(detection!.raster,(l.point[0]-minX)*scale,(maxY-l.point[1])*scale),region=detection!.regions.find(r=>r.idx===idx);
      return region?.name===l.name&&region?.kind===l.kind;
    });
    const result={...metadata,elapsedSeconds:(Date.now()-start)/1000,plan,metrics,roomCount,expectedRoomCount:truth.rooms,roomLabelsCorrect,geometryError,
      samplePassed:Boolean(h)&&metrics.withinSampleThreshold&&roomCount===truth.rooms&&roomLabelsCorrect};
    fs.writeFileSync(path.join(outputDir,"result.json"),JSON.stringify(result,null,2));
    console.log(JSON.stringify({...metadata,elapsedSeconds:result.elapsedSeconds,metrics,roomCount,geometryError,samplePassed:result.samplePassed}));
    if(!result.samplePassed)process.exitCode=1;
  }catch(e){
    const result={...metadata,elapsedSeconds:(Date.now()-start)/1000,error:e instanceof Error?e.message:String(e)};
    fs.writeFileSync(path.join(outputDir,"result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));process.exitCode=1;
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
