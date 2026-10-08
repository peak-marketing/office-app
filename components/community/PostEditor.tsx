"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import type { FormState } from "@/lib/actions";
import { HOME_TYPE_LABEL, STYLE_LABEL } from "@/lib/community-constants";
import { searchTagProducts } from "@/lib/community-actions";
import { Field } from "../forms";

type Action = (state: FormState, fd: FormData) => Promise<FormState>;
interface Tag {
  photo: string;
  x: number;
  y: number;
  product: number;
  title: string;
}
export interface EditorPost {
  type: "space" | "review";
  title: string;
  body: string;
  space_kind: string;
  home_type: string;
  area_pyeong: number | null;
  style: string;
  region: string;
  vendor_id: number | null;
  rating: number | null;
  project_id?: number | null;
}
export interface EditorPhoto {
  id: number;
  file_id: number;
  caption: string;
}

/** 공간 소개·시공 후기 쓰기: 사진(1~10장)과 설명, 사진 위를 눌러 상품 태그, 시공사 연결 */
export default function PostEditor({
  action,
  post,
  photos = [],
  initialTags = [],
  vendors,
  reviewable,
  isNew,
  projects = [],
}: {
  action: Action;
  post: EditorPost;
  photos?: EditorPhoto[];
  initialTags?: Tag[];
  vendors: { id: number; company: string }[];
  reviewable: { id: number; title: string; company: string }[];
  isNew: boolean;
  projects?: {id:number;title:string}[];
}) {
  const [state, dispatch, pending] = useActionState(action, {});
  const [type, setType] = useState(post.type);
  const [kind, setKind] = useState(post.space_kind || "home");
  const [previews, setPreviews] = useState<string[]>([]);
  const [removed, setRemoved] = useState<number[]>([]);
  const [tags, setTags] = useState<Tag[]>(initialTags);
  const [picking, setPicking] = useState<{ photo: string; x: number; y: number } | null>(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: number; title: string; price: number; cover: number | null }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  useEffect(() => {
    if (!picking || !q.trim()) return;
    const t = setTimeout(() => searchTagProducts(q).then(setFound), 250);
    return () => clearTimeout(t);
  }, [q, picking]);
  const place = (photo: string) => (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPicking({ photo, x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) });
    setQ("");
    setFound([]);
  };
  const photoBox = (key: string, src: string, caption: React.ReactNode, extra?: React.ReactNode) => (
    <li key={key} className="space-y-2 rounded-2xl border border-line p-3">
      <div className="relative cursor-crosshair overflow-hidden rounded-xl bg-sand" onClick={place(key)} data-testid={`photo-${key}`}>
        <img src={src} alt="" className="block w-full select-none" draggable={false} />
        {tags.filter((t) => t.photo === key).map((t, i) => (
          <button
            key={i}
            type="button"
            className="tag-dot absolute"
            style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%` }}
            title={`${t.title} · 눌러서 빼기`}
            onClick={(e) => (e.stopPropagation(), setTags((ts) => ts.filter((x) => x !== t)))}
          >
            ×
          </button>
        ))}
        {picking?.photo === key && <span className="tag-dot absolute !bg-ink" style={{ left: `${picking.x * 100}%`, top: `${picking.y * 100}%` }}>?</span>}
      </div>
      {picking?.photo === key && (
        <div className="space-y-2 rounded-xl bg-sand p-2" data-testid="tag-picker">
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="이 자리에 있는 상품 이름" autoFocus aria-label="상품 찾기" />
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {found.map((p) => (
              <li key={p.id}>
                <button type="button" className="flex w-full items-center gap-2 rounded-lg bg-white p-1.5 text-left text-xs" onClick={() => (setTags((ts) => [...ts, { ...picking, product: p.id, title: p.title }]), setPicking(null))}>
                  {p.cover && <img src={`/files/${p.cover}`} alt="" className="size-9 rounded object-cover" />}
                  <span className="min-w-0 flex-1 truncate">{p.title}</span>
                  <span className="tabular-nums text-muted">{p.price.toLocaleString()}원</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-sm" onClick={() => setPicking(null)}>취소</button>
        </div>
      )}
      {caption}
      {extra}
    </li>
  );
  return (
    <form
      className="space-y-5"
      data-testid="post-editor"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("tags", JSON.stringify(tags.filter((t) => !(t.photo.startsWith("id:") && removed.includes(Number(t.photo.slice(3)))))));
        startTransition(() => dispatch(fd));
      }}
    >
      {isNew && (
        <fieldset className="card space-y-3">
          <legend className="sr-only">글 종류</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="intake-option">
              <input type="radio" name="type" value="space" checked={type === "space"} onChange={() => setType("space")} className="sr-only" />
              <span><b>공간 소개</b><span className="mt-1 block text-xs text-muted">내 집·사무실을 사진으로 소개해요.</span></span>
            </label>
            <label className={`intake-option ${reviewable.length ? "" : "pointer-events-none opacity-50"}`}>
              <input type="radio" name="type" value="review" checked={type === "review"} onChange={() => setType("review")} disabled={!reviewable.length} className="sr-only" data-testid="type-review" />
              <span><b>시공 후기</b><span className="mt-1 block text-xs text-muted">{reviewable.length ? "계약한 시공사의 공사 후기를 남겨요. ‘계약 확인’ 표시가 붙어요." : "계약 결과가 기록된 요청이 있어야 쓸 수 있어요."}</span></span>
            </label>
          </div>
          {type === "review" && (
            <Field label="후기를 쓸 계약">
              <select className="input" name="project" required defaultValue="" data-testid="review-project">
                <option value="" disabled>골라 주세요</option>
                {reviewable.map((p) => <option key={p.id} value={p.id}>{p.title} · {p.company}</option>)}
              </select>
            </Field>
          )}
        </fieldset>
      )}
      <section className="card space-y-3">
        {type === "space" && <Field label="내 공간 연결(선택)"><select className="input" name="project" defaultValue={post.project_id ?? ""} data-testid="post-project"><option value="">연결하지 않음</option>{projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select><p className="mt-1 text-xs text-muted">내 공간에서 이 게시물을 다시 볼 수 있어요. 도면·주소·연락처는 게시물에 공개되지 않아요.</p></Field>}
        <Field label="제목"><input className="input" name="title" defaultValue={post.title} maxLength={60} required data-testid="post-title" /></Field>
        <Field label="이야기"><textarea className="input min-h-32" name="body" defaultValue={post.body} maxLength={5000} placeholder="공간을 꾸민 이야기, 고른 이유, 아쉬운 점을 적어 주세요." /></Field>
        {type === "review" && (
          <fieldset>
            <legend className="label">별점</legend>
            <div className="flex gap-3">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="flex items-center gap-1 text-sm"><input type="radio" name="rating" value={n} defaultChecked={post.rating === n} required className="size-4 accent-brand" />{n}</label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="공간">
            <select className="input" name="space_kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="home">집</option>
              <option value="office">사무실</option>
            </select>
          </Field>
          {kind === "home" && (
            <Field label="주거 형태">
              <select className="input" name="home_type" defaultValue={post.home_type}>
                <option value="">선택 안 함</option>
                {Object.entries(HOME_TYPE_LABEL).filter(([k]) => k !== "office").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          )}
          <Field label="평수(선택)"><input className="input" name="area_pyeong" inputMode="decimal" defaultValue={post.area_pyeong ?? ""} /></Field>
          <Field label="스타일(선택)">
            <select className="input" name="style" defaultValue={post.style}>
              <option value="">선택 안 함</option>
              {Object.entries(STYLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="지역(선택, 시·구까지만)"><input className="input" name="region" defaultValue={post.region} maxLength={40} placeholder="예: 서울 마포구" /></Field>
          {type === "space" && (
            <Field label="시공한 업체(선택)" hint="고른 업체는 ‘작성자가 연결한 업체’로 보여요. 계약 확인 표시는 시공 후기에만 붙어요.">
              <select className="input" name="vendor" defaultValue={post.vendor_id ?? ""}>
                <option value="">연결 안 함</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.company}</option>)}
              </select>
            </Field>
          )}
        </div>
      </section>
      <section className="card space-y-3">
        <h2 className="h-section">사진 <span className="text-xs font-normal text-muted">1~10장 · 사진 위를 누르면 그 자리에 상품을 붙일 수 있어요(사진당 5개)</span></h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {photos.map((p) =>
            photoBox(
              `id:${p.id}`,
              `/files/${p.file_id}`,
              <input className="input" name={`caption-${p.id}`} defaultValue={p.caption} placeholder="사진 설명(선택)" aria-label="사진 설명" />,
              <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="removePhoto" value={p.id} onChange={(e) => setRemoved((r) => (e.target.checked ? [...r, p.id] : r.filter((x) => x !== p.id)))} /> 이 사진 빼기</label>,
            ),
          )}
          {previews.map((src, i) => photoBox(`new:${i}`, src, <input className="input" name={`caption-new-${i}`} placeholder="사진 설명(선택)" aria-label="사진 설명" />))}
        </ul>
        <input
          ref={fileRef}
          className="input"
          type="file"
          name="photos"
          accept=".jpg,.jpeg,.png,.webp"
          multiple
          data-testid="post-photos"
          onChange={(e) => {
            setTags((ts) => ts.filter((t) => !t.photo.startsWith("new:")));
            setPreviews([...(e.target.files ?? [])].map((f) => URL.createObjectURL(f)));
          }}
        />
        <p className="text-xs text-muted">사람 얼굴·집 주소·연락처가 보이지 않게 올려 주세요. jpg·png·webp, 한 장 10MB 이하.</p>
      </section>
      {state.error && <p role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
      <button className="btn btn-primary" disabled={pending} data-testid="post-submit">{pending ? "올리는 중…" : isNew ? "올리기" : "저장"}</button>
    </form>
  );
}
