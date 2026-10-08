"use client";

import { useState, useTransition } from "react";
import { saveSelection } from "@/lib/actions";
import { STYLES } from "@/lib/styles";

/** 분위기(스타일) 고르기. 색상과 마감 방향만 바꾸고 배치는 그대로다. */
export default function StylePicker({ projectId, versionId, option, styleId, locked, readOnly }: { projectId: number; versionId: number; option: string; styleId: string; locked: boolean; readOnly: boolean }) {
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  return (
    <section className="card" data-testid="style-picker">
      <h2 className="h-section">분위기(스타일)</h2>
      <p className="mb-3 text-xs leading-relaxed text-muted">색상과 마감 방향만 바꿉니다. 가구 배치는 그대로예요. 화면 색상은 분위기 참고용이며 자재 지정이 아닙니다.{locked && " 업체에 보낸 버전이라 바꾸면 같은 배치로 새 버전이 만들어져요."}</p>
      <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="스타일">
        {STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={readOnly || pending}
            aria-pressed={s.id === styleId}
            data-style={s.id}
            onClick={() => start(async () => setMsg(await saveSelection(projectId, versionId, option, s.id)))}
            className={`overflow-hidden rounded-xl border bg-white text-left transition ${s.id === styleId ? "border-ink shadow-[0_0_0_1px_var(--color-ink)]" : "border-line hover:border-muted"}`}
          >
            <span className="flex h-7">
              {s.palette.map(([name, color]) => (
                <span key={name} className="flex-1" style={{ background: color }} />
              ))}
            </span>
            <span className="block p-2.5 text-sm">
              <b>{s.name}</b>
              {s.id === styleId && <span className="badge ml-1.5 border-brand/30 bg-brand-soft text-brand">선택됨</span>}
              <span className="mt-0.5 block text-xs text-muted">{s.tagline}</span>
            </span>
          </button>
        ))}
      </div>
      {(msg.ok || msg.error) && <p className={`mt-2 text-xs ${msg.error ? "text-danger" : "text-brand"}`}>{msg.error ?? msg.ok}</p>}
    </section>
  );
}
