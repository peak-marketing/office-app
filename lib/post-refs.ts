import { all, get, run } from "./db";
export interface PostReference { postId:number; photoId:number; title:string; fileId:number; caption:string; kind:string }
/** 공개 게시물에서 고른 사진만 전달한다. 작성자의 프로젝트·주소·연락처는 담지 않는다. */
export function referencePost(postId:number,photoId?:number): PostReference | undefined {
  return get<PostReference>(`SELECT p.id AS postId,f.id AS photoId,p.title,f.file_id AS fileId,f.caption,p.space_kind AS kind FROM posts p JOIN post_photos f ON f.post_id=p.id WHERE p.id=? AND p.status='published' ${photoId ? "AND f.id=?" : ""} ORDER BY f.position,f.id LIMIT 1`,postId,...(photoId ? [photoId] : []));
}
export function attachPostReference(projectId:number,fd:FormData) {
  const ref=referencePost(Number(fd.get("referencePost")),Number(fd.get("referencePhoto")) || undefined);
  if (ref) run(`INSERT OR IGNORE INTO project_post_refs(project_id,post_id,photo_id,snapshot) VALUES (?,?,?,?)`,projectId,ref.postId,ref.photoId,JSON.stringify(ref));
}
export const projectPostRefs=(projectId:number) => all<{snapshot:string}>(`SELECT snapshot FROM project_post_refs WHERE project_id=? ORDER BY id`,projectId).map(r => JSON.parse(r.snapshot) as PostReference);
