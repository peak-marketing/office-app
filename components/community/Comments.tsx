"use client";

import { useState } from "react";
import type { CommentRow } from "@/lib/community";
import { addComment, deleteComment } from "@/lib/community-actions";
import { StateForm } from "../forms";
import ReportButton from "./ReportButton";

/** 댓글과 답글(한 단계). 로그인한 사람만 쓴다. 업체 계정 댓글은 ‘업체’로 표시한다. */
export default function Comments({ postId, comments, me, canWrite }: { postId: number; comments: CommentRow[]; me: number | null; canWrite: boolean }) {
  const [reply, setReply] = useState<number | null>(null);
  const roots = comments.filter((c) => !c.parent_id);
  const item = (c: CommentRow, child = false) => (
    <li key={c.id} className={`${child ? "ml-8 mt-3" : ""}`} data-comment={c.id}>
      <p className="text-xs text-muted">
        <b className="text-ink">{c.role === "vendor" && c.company ? c.company : c.author}</b>
        {c.role === "vendor" && <span className="ml-1 rounded bg-brand-soft px-1 text-[10px] text-brand">업체</span>}
        <span className="ml-2">{c.created_at.slice(0, 16).replace("T", " ")}</span>
      </p>
      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{c.status === "hidden" ? <span className="text-muted">운영자가 가린 댓글이에요.</span> : c.body}</p>
      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
        {canWrite && !child && c.status === "published" && <button type="button" className="text-muted underline-offset-2 hover:underline" onClick={() => setReply(reply === c.id ? null : c.id)}>답글</button>}
        {me === c.user_id && <button type="button" className="text-muted underline-offset-2 hover:underline" onClick={() => deleteComment(c.id)}>지우기</button>}
        {me && me !== c.user_id && c.status === "published" && <ReportButton target="comment" id={c.id} small />}
      </div>
      {reply === c.id && (
        <StateForm action={addComment.bind(null, postId)} submit="답글 남기기" resetOnOk className="mt-2">
          <input type="hidden" name="parent" value={c.id} />
          <textarea className="input" name="body" rows={2} maxLength={1000} required aria-label="답글" />
        </StateForm>
      )}
      {!child && comments.filter((x) => x.parent_id === c.id).length > 0 && <ul>{comments.filter((x) => x.parent_id === c.id).map((x) => item(x, true))}</ul>}
    </li>
  );
  return (
    <section id="comments" className="space-y-4">
      <h2 className="text-lg font-bold">댓글 {comments.filter((c) => c.status === "published").length}</h2>
      {canWrite ? (
        <StateForm action={addComment.bind(null, postId)} submit="댓글 남기기" resetOnOk>
          <textarea className="input" name="body" rows={2} maxLength={1000} required placeholder="칭찬과 질문을 남겨 주세요." aria-label="댓글" data-testid="comment-body" />
        </StateForm>
      ) : (
        <p className="rounded-xl bg-sand p-3 text-sm text-muted">로그인하면 댓글을 남길 수 있어요.</p>
      )}
      <ul className="space-y-5" data-testid="comment-list">{roots.map((c) => item(c))}</ul>
    </section>
  );
}
