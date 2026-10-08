/** Public source references, not unit-number mappings or approved measured templates. */
export interface PlanSource {
  id: string; complex: string; address: string; unitType: string; supplyArea: number;
  exclusiveArea: number | null; variant: string; imageUrl: string; pageUrl: string;
}
export interface PlanComplex { name: string; address: string; aliases: string[]; plans: PlanSource[] }
const base="https://file.kbland.kr/image/kbstar/land/img/alian/kms/complex/plane/basic/objctidnfr/KBM037191/";
const galmae={complex:"갈매스타힐스(갈매4단지)",address:"경기도 구리시 산마루로 46",variant:"기본형 (공개 자료 표기)",pageUrl:"https://www.kbland.kr/se/c/29883"};
export const PLAN_COMPLEXES:PlanComplex[]=[{name:galmae.complex,address:galmae.address,aliases:["갈매스타힐스","구리갈매스타힐스","갈매4단지","경기도 구리시 갈매동 651"],plans:[
  {id:"galmae-98B",...galmae,unitType:"98B",supplyArea:98,exclusiveArea:null,imageUrl:base+"37191_4_201711145204462.jpg"},
  {id:"galmae-98C",...galmae,unitType:"98C",supplyArea:98,exclusiveArea:null,imageUrl:base+"37191_5_201711145205127.jpg"},
  {id:"galmae-99A-1",...galmae,unitType:"99A-1",supplyArea:99,exclusiveArea:null,imageUrl:base+"37191_1_201711145202948.jpg"},
  {id:"galmae-99A-2",...galmae,unitType:"99A-2",supplyArea:99,exclusiveArea:null,imageUrl:base+"37191_3_201711145203651.jpg"},
  {id:"galmae-112A",...galmae,unitType:"112A",supplyArea:112,exclusiveArea:84.95,imageUrl:base+"37191_2_201711145205804.jpg"},
  {id:"galmae-112B",...galmae,unitType:"112B",supplyArea:112,exclusiveArea:null,imageUrl:base+"37191_6_201711145206409.jpg"},
  {id:"galmae-112C",...galmae,unitType:"112C",supplyArea:112,exclusiveArea:null,imageUrl:base+"37191_7_201711145206974.jpg"},
]}];
export const planSource=(id:string)=>PLAN_COMPLEXES.flatMap(c=>c.plans).find(p=>p.id===id);
const normalized=(s:string)=>s.replace(/[\s()（）·]/g,"").toLowerCase();
export function findComplexes(keyword:string){
  const q=normalized(keyword.trim().slice(0,100));
  return q.length<2?[]:PLAN_COMPLEXES.filter(c=>[c.name,c.address,...c.aliases].some(v=>normalized(v).includes(q)||q.includes(normalized(v))));
}
