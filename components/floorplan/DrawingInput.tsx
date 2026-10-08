"use client";
import { useEffect, useRef, useState } from "react";

export interface Drawing { blob: Blob; url: string; iw: number; ih: number; name: string }
export default function DrawingInput({ onChange }: { onChange: (drawing: Drawing | null) => void }) {
  const [file, setFile] = useState<File | null>(null), [page, setPage] = useState(1), [pages, setPages] = useState(1), [error, setError] = useState("");
  const version = useRef(0);
  const url = useRef<string | null>(null);
  useEffect(() => () => { if(url.current) URL.revokeObjectURL(url.current); }, []);
  const load = async (f: File, n = 1) => {
    const token = ++version.current;
    onChange(null); setError("");
    try {
      if (f.size > 10 * 1024 * 1024) throw new Error("도면 파일은 10MB 이하여야 해요.");
      if (!/\.(png|jpe?g|webp|pdf)$/i.test(f.name)) throw new Error("JPG·PNG·WEBP·PDF 도면을 선택해 주세요.");
      const canvas = document.createElement("canvas");
      if (/\.pdf$/i.test(f.name)) {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const task = pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) });
        const doc = await task.promise;
        try {
          if(n > doc.numPages) throw new Error("PDF 페이지 번호를 확인해 주세요.");
          setPages(doc.numPages);
          const p = await doc.getPage(n), v = p.getViewport({scale:1});
          const scale = Math.min(3, 3000 / Math.max(v.width,v.height));
          const vp = p.getViewport({scale}); canvas.width=Math.round(vp.width);canvas.height=Math.round(vp.height);
          await p.render({canvas,canvasContext:canvas.getContext("2d")!,viewport:vp}).promise;
        } finally { await task.destroy(); }
      } else {
        setPages(1);
        const image = await createImageBitmap(f);
        const k = Math.min(1,3000/Math.max(image.width,image.height));
        canvas.width=Math.round(image.width*k);canvas.height=Math.round(image.height*k);
        const ctx=canvas.getContext("2d")!; ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);image.close();
      }
      const blob = await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("도면 이미지를 만들지 못했어요.")),"image/png"));
      if (blob.size > 8*1024*1024) throw new Error("변환한 도면이 커요. 해상도를 줄여 다시 올려 주세요(8MB 이하).");
      if (token !== version.current) return;
      if(url.current) URL.revokeObjectURL(url.current);
      url.current=URL.createObjectURL(blob);
      onChange({blob,url:url.current,iw:canvas.width,ih:canvas.height,name:f.name});
    } catch(e) { if(token === version.current)setError(e instanceof Error?e.message:"도면을 열지 못했어요."); }
  };
  return <div className="space-y-3">
    <label className="block text-sm font-semibold">도면 이미지 또는 PDF<input type="file" className="input mt-2" accept=".jpg,.jpeg,.png,.webp,.pdf" data-testid="recognize-file" onChange={e=>{ const f=e.target.files?.[0];setFile(f??null);setPage(1);if(f)void load(f);else {version.current++;onChange(null);} }} /></label>
    {pages>1 && file && <label className="block text-sm">분석할 PDF 페이지 (총 {pages}쪽)<select className="input mt-1" value={page} data-testid="pdf-page" onChange={e=>{const n=Number(e.target.value);setPage(n);void load(file,n);}}>{Array.from({length:pages},(_,i)=><option key={i} value={i+1}>{i+1}쪽</option>)}</select></label>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
  </div>;
}
