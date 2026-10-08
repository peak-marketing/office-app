import {findComplexes} from "./catalog";
import {searchTemplates,templateHouse} from "./jobs";
export interface PlanWebResult {title:string;url:string;description:string}
const plain=(s:unknown)=>typeof s==="string"?s.replace(/<[^>]*>/g,"").replaceAll("&amp;","&").replaceAll("&quot;",'"').slice(0,300):"";
const publicLink=(s:unknown)=>{try{const u=new URL(String(s));return u.protocol==="https:"&&!u.username&&!u.password&&!/^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(u.hostname)?u.href:null;}catch{return null;}};
/** Only official Naver web search. These links are not automatically accepted as this unit's plan. */
export async function searchPlanWeb(keyword:string,fetcher:typeof fetch=fetch):Promise<{items:PlanWebResult[];connected:boolean;error?:string}>{
  const id=process.env.NAVER_SEARCH_CLIENT_ID,secret=process.env.NAVER_SEARCH_CLIENT_SECRET;
  if(!id||!secret)return {items:[],connected:false};
  try{
    const q=keyword.trim().slice(0,80).replace(/\d+\s*[동호]/g,"").trim();
    const r=await fetcher(`https://openapi.naver.com/v1/search/webkr.json?query=${encodeURIComponent(q+" 아파트 평면도")}&display=5`,{headers:{"X-Naver-Client-Id":id,"X-Naver-Client-Secret":secret},signal:AbortSignal.timeout(10000),cache:"no-store"});
    if(!r.ok)throw new Error("search failed");
    const body=await r.json();
    const items:PlanWebResult[]=Array.isArray(body.items)?body.items.flatMap((v:{link?:unknown;title?:unknown;description?:unknown})=>{const url=publicLink(v.link);return url?[{url,title:plain(v.title),description:plain(v.description)}]:[];}):[];
    return {items,connected:true};
  }catch{return {items:[],connected:true,error:"자료 검색에 연결하지 못했어요. 등록 도면을 고르거나 직접 올려 주세요."};}
}
export async function findPlans(keyword:string){
  const q=keyword.trim().slice(0,100);
  if(q.length<2)return {complexes:[],templates:[],web:{items:[] as PlanWebResult[],connected:false,error:undefined as string|undefined},error:"단지명이나 주소를 두 글자 이상 입력해 주세요."};
  return {complexes:findComplexes(q),templates:searchTemplates(q).map(t=>({...t,house:templateHouse(t)})),web:await searchPlanWeb(q)};
}
