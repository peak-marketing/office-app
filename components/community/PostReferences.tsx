import Link from "next/link";
import type {PostReference} from "@/lib/post-refs";
export default function PostReferences({refs,remove}: {refs:PostReference[];remove?:(postId:number,photoId:number)=>React.ReactNode}) {
  if (!refs.length) return null;
  return <section className="card mt-4" data-testid="post-references"><h2 className="h-section">참고 커뮤니티 공간 · {refs.length}건</h2>
    <ul className="grid gap-3 sm:grid-cols-2">{refs.map(r => <li key={`${r.postId}-${r.photoId}`} className="flex min-w-0 gap-3"><img src={`/files/${r.fileId}`} alt={r.title} className="size-20 rounded-xl object-cover"/><div className="min-w-0 text-sm"><b>{r.title}</b>{r.caption && <p className="text-xs text-muted">{r.caption}</p>}<Link href={`/community/${r.postId}`} className="block text-xs text-brand underline">원래 게시물 보기</Link><p className="text-xs text-muted">연결 당시 저장한 사진과 제목</p>{remove?.(r.postId,r.photoId)}</div></li>)}</ul>
  </section>;
}
