import type { ReactNode } from "react";
import type { Brief } from "@/lib/brief";
import type { FileRow } from "@/lib/data";
import type { LayoutResult } from "@/lib/layout/types";
import { Notice } from "./ui";

export function BriefTable({ brief, extra }: { brief: Brief; extra?: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
      {[...brief.rows, ...(extra ?? [])].map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="whitespace-pre-line">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-4 text-sm leading-relaxed marker:text-line">
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

export function NeedsReview({ result, children }: { result: LayoutResult; children?: ReactNode }) {
  return (
    <Notice tone="warn" title="검토 필요 — 이 조건으로는 배치안을 자동으로 만들지 않았습니다">
      <BulletList items={result.reasons} />
      {children && <div className="mt-3 text-ink">{children}</div>}
    </Notice>
  );
}

export function Advisories({ result }: { result: LayoutResult }) {
  if (!result.advisories.length) return null;
  return (
    <Notice tone="warn" title="조정을 권하는 사항">
      <BulletList items={result.advisories} />
    </Notice>
  );
}

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

export function FileList({ files, remove }: { files: FileRow[]; remove?: (id: number) => ReactNode }) {
  if (!files.length) return <p className="text-sm text-muted">올린 파일이 없습니다.</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {files.map((f) => {
        const image = f.mime.startsWith("image/") && !f.original_name.toLowerCase().endsWith(".heic");
        return (
          <li key={f.id} className="overflow-hidden rounded-lg border border-line bg-white text-xs">
            <a href={`/files/${f.id}`} target="_blank" rel="noreferrer" className="block">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element -- 권한 확인을 거치는 업로드 파일이라 next/image 최적화를 쓰지 않는다
                <img src={`/files/${f.id}`} alt={f.original_name} className="h-28 w-full object-cover" />
              ) : (
                <span className="grid h-28 place-items-center bg-paper text-muted">{f.original_name.split(".").pop()?.toUpperCase()}</span>
              )}
            </a>
            <div className="flex items-start justify-between gap-2 p-2">
              <span className="min-w-0">
                <span className="block truncate">{f.original_name}</span>
                <span className="text-muted">
                  {f.category === "sketch" ? "손그림" : f.kind === "photo" ? "사진" : "도면"} · {kb(f.size)}
                </span>
              </span>
              {remove?.(f.id)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export { CoverageTable } from "./CoverageTable";
