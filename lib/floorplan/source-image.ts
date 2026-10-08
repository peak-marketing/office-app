import sharp from "sharp";
import {createHash} from "node:crypto";
import {planSource} from "./catalog";
/** Refuse to apply a reviewed trace if the publisher replaces its source illustration. */
export async function verifyReferenceImage(id:string,bytes:Buffer){
  if(id!=="galmae-112A")return;
  const {data,info}=await sharp(bytes).removeAlpha().raw().toBuffer({resolveWithObject:true});
  if(info.width!==923||info.height!==676||info.channels!==3||createHash("sha256").update(data).digest("hex")!=="15d387467e0b30ee6ba754d62bdf4eec4ee71eff1445a456f0b37c4853737b2d")throw new Error("원본 도면이 바뀌어 참고 배치를 다시 대조해야 해요. 내 도면 직접 올리기를 이용해 주세요.");
}
/** Fetch only a known catalog id; never accept a caller's remote URL. */
export async function sourceImage(id:string,fetcher:typeof fetch=fetch){
  const source=planSource(id);if(!source)throw new Error("선택한 공개 도면을 찾지 못했어요.");
  const r=await fetcher(source.imageUrl,{signal:AbortSignal.timeout(15000),redirect:"error",cache:"no-store"});
  if(!r.ok||!r.headers.get("content-type")?.startsWith("image/"))throw new Error("원본 도면을 가져오지 못했어요. 가지고 계신 도면을 직접 올려 주세요.");
  if(Number(r.headers.get("content-length"))>8*1024*1024)throw new Error("도면 파일이 너무 커요.");
  const reader=r.body?.getReader();if(!reader)throw new Error("도면 파일을 읽지 못했어요.");
  const chunks:Uint8Array[]=[];let length=0;
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>8*1024*1024){await reader.cancel();throw new Error("도면 파일이 너무 커요.");}chunks.push(value);}
  return sharp(Buffer.concat(chunks),{limitInputPixels:9_000_000}).rotate().resize({width:3000,height:3000,fit:"inside",withoutEnlargement:true}).png().toBuffer();
}
