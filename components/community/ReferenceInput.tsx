import type {PostReference} from "@/lib/post-refs";
export default function ReferenceInput({reference}: {reference?:PostReference}) {
  if (!reference) return null;
  return <div className="ref-hero mb-4" data-testid="reference-post">
    <input type="hidden" name="referencePost" value={reference.postId}/><input type="hidden" name="referencePhoto" value={reference.photoId}/>
    <img src={`/files/${reference.fileId}`} alt={reference.title}/>
    <div><p className="text-xs text-brand">참고하는 커뮤니티 공간</p><b>{reference.title}</b><p className="text-xs text-muted">선택한 사진을 내 공간에 저장하고, 시공 제안을 요청하면 업체에 함께 보내요.</p></div>
  </div>;
}
