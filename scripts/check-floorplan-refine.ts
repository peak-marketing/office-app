import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {createRequire} from "node:module";
import {refineRecognition} from "../lib/floorplan/refine";
import {readFloorplan} from "../lib/floorplan/provider";
import {recognitionToHouse,type PlanRecognition} from "../lib/floorplan/geometry";
import {detectRooms} from "../lib/space/house-rooms";
import type {Pt} from "../lib/space/geometry";
const {measureRecognition}=createRequire(import.meta.url)("../tests/live/floorplan-metrics.cjs");
interface Truth {name:string;iw:number;ih:number;widthMm:number;outline:Pt[];walls:{a:Pt;b:Pt}[];openings:{kind:PlanRecognition["openings"][number]["kind"];a:Pt;b:Pt}[];labels:{point:Pt;name:string;kind:PlanRecognition["labels"][number]["kind"]}[];rooms:number}
const fixtures="tests/e2e/fixtures";
const load=(name:string):Truth=>JSON.parse(fs.readFileSync(path.join(fixtures,name+".json"),"utf8"));
const approximate=(t:Truth):PlanRecognition=>{
  const f=([x,y]:Pt):Pt=>[x/t.iw,y/t.ih];
  return {isFloorplan:true,supported:true,outline:t.outline.map(q=>f([q[0]+5,q[1]+7])),
    walls:t.walls.map(w=>({a:f([w.a[0]+4,w.a[1]+6]),b:f([w.b[0]+4,w.b[1]+6])})),
    openings:t.openings.map(o=>({...o,a:f(o.a),b:f(o.b)})),
    labels:t.labels.map(l=>({...l,point:f(l.point)})),widthMm:t.widthMm,dimensionEvidence:"검사용 가상 치수",warnings:[]};
};
async function main(){
  let n=0;const pass=(s:string)=>{console.log("PASS "+s);n++;};
  for(const name of ["ai-three-room","ai-L-room"]){
    const t=load(name),raw=JSON.parse(fs.readFileSync(path.join(fixtures,name+"-misread.json"),"utf8"));
    const p=await refineRecognition(fs.readFileSync(path.join(fixtures,name+".png")),raw);
    const m=measureRecognition(p,t),h=recognitionToHouse(p,t.iw,t.ih,t.widthMm);
    assert(m.maxErrorMm<.01);assert.equal(detectRooms(h).regions.filter(r=>!r.sliver).length,t.rooms);
    pass(`${name}: 저장된 실제 오독 좌표를 자동 보정, 방 ${t.rooms}개·위치 오차 없음`);
  }
  for(const name of ["ai-three-room","ai-L-room","ai-offset-plan","ai-gray-plan","ai-studio","ai-four-room"]){
    const t=load(name),raw=approximate(t),image=fs.readFileSync(path.join(fixtures,name+".png"));
    const p=await refineRecognition(image,raw),m=measureRecognition(p,t);
    assert(m.withinSampleThreshold,JSON.stringify(m));assert.equal(detectRooms(recognitionToHouse(p,t.iw,t.ih,t.widthMm)).regions.filter(r=>!r.sliver).length,t.rooms);
    pass(`${name}: 좌표를 흔들어도 실제 선에서 구조 복원`);
    for(const scale of [.65,1.35]){
      const iw=Math.round(t.iw*scale),ih=Math.round(t.ih*scale);
      const resized=await sharp(image).resize(iw,ih,{fit:"fill"}).png().toBuffer();
      const scaled={...t,iw,ih,outline:t.outline.map(([x,y])=>[x*iw/t.iw,y*ih/t.ih]),walls:t.walls.map(w=>({a:[w.a[0]*iw/t.iw,w.a[1]*ih/t.ih],b:[w.b[0]*iw/t.iw,w.b[1]*ih/t.ih]})),openings:t.openings.map(o=>({...o,a:[o.a[0]*iw/t.iw,o.a[1]*ih/t.ih],b:[o.b[0]*iw/t.iw,o.b[1]*ih/t.ih]}))};
      const result=await refineRecognition(resized,raw),metric=measureRecognition(result,scaled);
      assert(metric.withinSampleThreshold,`${name}/${scale}: ${JSON.stringify(metric)}`);
      assert.equal(detectRooms(recognitionToHouse(result,iw,ih,t.widthMm)).regions.filter(r=>!r.sliver).length,t.rooms);
      pass(`${name}: ${scale}배 이미지 크기에서도 같은 방과 위치`);
    }
    const jpeg=await sharp(image).jpeg({quality:78}).png().toBuffer();
    const jp=await refineRecognition(jpeg,raw);assert(measureRecognition(jp,t).withinSampleThreshold);
    pass(`${name}: JPEG 손실 압축 뒤 원본 선 검증`);
  }
  const t=load("ai-three-room"),raw=approximate(t),image=fs.readFileSync(path.join(fixtures,t.name+".png"));
  const split=structuredClone(raw),bar=split.walls.pop()!,mid:Pt=[(bar.a[0]+bar.b[0])/2,bar.a[1]];split.walls.push({a:bar.a,b:mid},{a:mid,b:bar.b});
  assert(measureRecognition(await refineRecognition(image,split),t).withinSampleThreshold);pass("모델이 T자 이음에서 나눈 같은 벽을 원본 선으로 합침");
  const closed=structuredClone(raw);closed.outline.push(closed.outline[0]);assert(measureRecognition(await refineRecognition(image,closed),t).withinSampleThreshold);pass("중복한 외곽 시작점은 같은 도형을 유지하며 정리");
  const free=structuredClone(raw);free.walls.push({a:[200/t.iw,700/t.ih],b:[470/t.iw,700/t.ih]});
  const withFree=await sharp(image).composite([{input:Buffer.from(`<svg width="${t.iw}" height="${t.ih}"><path d="M200 700H470" fill="none" stroke="#151515" stroke-width="12"/></svg>`)}]).png().toBuffer();
  const fp=await refineRecognition(withFree,free),stub=fp.walls.find(w=>Math.abs(w.a[1]*t.ih-700)<1)!;
  assert.equal(stub.b[0]*t.iw,470);pass("실제로 30px 떨어져 끝난 벽을 가까운 다른 벽에 억지 연결하지 않음");
  const missing=structuredClone(raw);missing.openings.pop();await assert.rejects(()=>refineRecognition(image,missing),/틈이 더/);pass("누락된 창은 개수 검사에서 거부해 성공 결과로 내놓지 않음");
  const invented=structuredClone(raw);invented.openings.push({kind:"window",a:[.42,.7],b:[.42,.78]});await assert.rejects(()=>refineRecognition(image,invented),/틈을 원본/);pass("실제로 틈이 없는 벽의 가짜 창 거부");
  const blank=await sharp({create:{width:t.iw,height:t.ih,channels:3,background:"white"}}).png().toBuffer();
  await assert.rejects(()=>refineRecognition(blank,raw),/원본의 선/);pass("선이 없는 이미지에 그럴듯한 AI 좌표가 있어도 보정하지 않음");
  const diagonal=structuredClone(raw);diagonal.walls[0].b[0]+=.05;await assert.rejects(()=>refineRecognition(image,diagonal),/직각/);pass("큰 사선 오류를 수평·수직으로 억지 변환하지 않음");
  const previousKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY="synthetic-transport-only";
  try{const p=await readFloorplan(image,async()=>Response.json({status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(raw)}]}]}));assert(measureRecognition(p,t).withinSampleThreshold);pass("서비스용 readFloorplan 경로에 원본 좌표 보정이 연결됨 (모의 API)");}
  finally{if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey;}
  console.log(`${n} passed, 0 failed (영상 처리·저장된 오독 재생·모의 API 검사)`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
