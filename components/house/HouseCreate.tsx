"use client";

import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import type { FormState } from "@/lib/actions";
import type { Pt } from "@/lib/space/geometry";
import { HEIGHT_DEFAULT, HOUSE_INDEPENDENT_TEXT, HOUSE_LABEL, HOUSE_RANGE_TEXT, HOUSE_SCOPE_TEXT, areaText, houseErrors, mmText, newHouse, rectOutline, type HouseModel } from "@/lib/space/house";
import { detectRooms } from "@/lib/space/house-rooms";
import { draftFromPixels, nextTracePoint, outlineArea, scaleFrom, type TraceDraft } from "@/lib/space/trace";
import HousePlan from "./HousePlan";

type Action = (state: FormState, fd: FormData) => Promise<FormState>;

interface Img {
  url: string;
  iw: number;
  ih: number;
  blob: Blob;
  name: string;
}

const MAX_SIDE = 3000;
const toM = (v: string) => (v.trim() === "" ? NaN : Number(v.replaceAll(",", "")) / 1000);

function loadElement(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("이미지를 열 수 없어요. 다른 파일로 해 주세요."));
    el.src = url;
  });
}

/** 도면 이미지를 밑그림으로. 아주 큰 이미지는 줄인다(JPG·PNG·WEBP). */
async function loadDrawing(file: File): Promise<Img> {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (file.size > 10 * 1024 * 1024) throw new Error("파일 하나는 10MB 이하여야 해요.");
  if (!["jpg", "jpeg", "png", "webp"].includes(ext)) throw new Error("JPG·PNG·WEBP 이미지만 밑그림으로 쓸 수 있어요. PDF·DWG는 이미지로 바꿔 올려 주세요.");
  const url = URL.createObjectURL(file);
  const el = await loadElement(url);
  const side = Math.max(el.naturalWidth, el.naturalHeight);
  if (side <= MAX_SIDE) return { url, iw: el.naturalWidth, ih: el.naturalHeight, blob: file, name: file.name };
  const k = MAX_SIDE / side;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(el.naturalWidth * k);
  canvas.height = Math.round(el.naturalHeight * k);
  canvas.getContext("2d")!.drawImage(el, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("이미지를 만들지 못했어요."))), "image/jpeg", 0.9));
  return { url: URL.createObjectURL(blob), iw: canvas.width, ih: canvas.height, blob, name: file.name };
}

/**
 * 집 전체 평면 만들기. (a) 바깥 가로·세로 치수로 직사각형, (b) 도면 이미지 위에 축척을 맞추고 바깥 벽 모서리를 따라 찍기.
 * 도면을 자동으로 읽지 않는다. 내부 벽·문·창·방 이름은 다음 화면(편집)에서 넣는다.
 */
export default function HouseCreate({ action, initial }: { action: Action; initial: "dims" | "trace" }) {
  const [state, dispatch, pending] = useActionState(action, {});
  const [method, setMethod] = useState<"dims" | "trace">(initial);
  const [w, setW] = useState("");
  const [d, setD] = useState("");
  const [h, setH] = useState(String(Math.round(HEIGHT_DEFAULT * 1000)));
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  // 따라 그리기
  const [img, setImg] = useState<Img | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [cal, setCal] = useState<{ p1: Pt | null; p2: Pt | null; mm: string }>({ p1: null, p2: null, mm: "" });
  const [scale, setScale] = useState<number | null>(null);
  const [pts, setPts] = useState<Pt[]>([]);
  const [draft, setDraft] = useState<TraceDraft | null>(null);
  const [zoom, setZoom] = useState(1);
  const [unit, setUnit] = useState(1);
  const svg = useRef<SVGSVGElement>(null);

  const heightM = h.trim() ? toM(h) : HEIGHT_DEFAULT;
  const house: HouseModel | null = useMemo(() => {
    if (method === "dims") {
      const W = toM(w), D = toM(d);
      return Number.isFinite(W) && Number.isFinite(D) ? newHouse(rectOutline(W, D), "dims", heightM, null) : null;
    }
    return draft && img ? newHouse(draft.outline, "trace", heightM, { fileId: 0, iw: draft.iw, ih: draft.ih, m: draft.m }) : null;
  }, [method, w, d, heightM, draft, img]);
  const errors = house ? houseErrors(house) : [method === "dims" ? "바깥 가로·세로를 mm로 넣어 주세요." : "도면 위에 바깥 벽을 따라 그려 주세요."];
  const det = useMemo(() => (house && !errors.length ? detectRooms(house) : null), [house, errors.length]);

  useEffect(() => {
    const el = svg.current;
    if (!el || !img) return;
    const pad = Math.round(Math.max(img.iw, img.ih) * 0.04);
    const update = () => setUnit((img.iw + pad * 2) / Math.max(1, el.getBoundingClientRect().width));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [img, zoom, step]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setMsg(null);
    try {
      const next = await loadDrawing(file);
      setImg(next);
      setStep(1);
      setCal({ p1: null, p2: null, mm: "" });
      setScale(null);
      setPts([]);
      setDraft(null);
      setMsg({ ok: "도면을 띄웠어요. 길이를 아는 곳(예: 바깥 벽 한 변)의 양 끝을 차례로 누르고 실제 길이를 넣어 주세요." });
    } catch (e) {
      setMsg({ error: (e as Error).message });
    }
  };

  const toPx = (cx: number, cy: number): Pt | null => {
    const m = svg.current?.getScreenCTM();
    if (!m) return null;
    const q = new DOMPoint(cx, cy).matrixTransform(m.inverse());
    return [q.x, q.y];
  };
  const tolPx = 10 * unit;
  const applyScale = () => {
    if (!cal.p1 || !cal.p2) return setMsg({ error: "도면에서 길이를 아는 곳의 양 끝 두 점을 눌러 주세요." });
    const s = scaleFrom(cal.p1, cal.p2, Number(cal.mm.replaceAll(",", "")));
    if (!s) return setMsg({ error: "두 점을 더 멀리 찍고, 실제 길이를 300mm 이상으로 넣어 주세요." });
    setScale(s);
    setStep(2);
    setPts([]);
    setDraft(null);
    setMsg({ ok: `축척을 맞췄어요(도면 1px = 실제 ${(s * 1000).toFixed(1)}mm). 이제 바깥 벽 모서리를 차례로 누르세요. 첫 점을 다시 누르거나 ‘닫기’를 누르면 닫혀요.` });
  };
  const close = () => {
    if (!scale || !img) return;
    const r = draftFromPixels(pts, scale, img.iw, img.ih);
    if ("error" in r) return setMsg({ error: r.error });
    setDraft(r);
    setStep(3);
    const W = Math.max(...r.outline.map((q) => q[0])), D = Math.max(...r.outline.map((q) => q[1]));
    setMsg({ ok: `바깥 벽 ${r.outline.length}개로 닫았어요: ${mmText(W)} × ${mmText(D)} mm. 천장 높이를 확인하고 만들어 주세요.` });
  };
  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const q = toPx(e.clientX, e.clientY);
    if (!q || !img) return;
    if (step === 1) {
      setCal((c) => (!c.p1 || c.p2 ? { ...c, p1: q, p2: null } : { ...c, p2: q }));
      return;
    }
    if (step === 2) {
      if (pts.length >= 3 && Math.hypot(q[0] - pts[0][0], q[1] - pts[0][1]) < 14 * unit) return close();
      setPts([...pts, nextTracePoint(pts, q, tolPx)]);
      setMsg(null);
    }
  };

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!house || errors.length) return setMsg({ error: errors[0] });
    const fd = new FormData();
    if (method === "dims") fd.set("house", JSON.stringify({ source: "dims", width: toM(w), depth: toM(d), height: heightM }));
    else {
      fd.set("house", JSON.stringify({ source: "trace", outline: draft!.outline, height: heightM, underlay: { iw: draft!.iw, ih: draft!.ih, m: draft!.m } }));
      const b = img!.blob;
      fd.set("underlay", new File([b], b.type === "image/png" ? "underlay.png" : b.type === "image/webp" ? "underlay.webp" : "underlay.jpg", { type: b.type || "image/jpeg" }));
    }
    startTransition(() => dispatch(fd));
  };

  const pad = img ? Math.round(Math.max(img.iw, img.ih) * 0.04) : 0;
  const stroke = 2.5 * unit;
  const preview = step === 3 && draft && img;

  return (
    <form className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]" onSubmit={submit} data-testid="house-create">
      <div className="min-w-0 space-y-4">
        <p className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-xs leading-relaxed text-warn" data-testid="house-scope">
          <b>{HOUSE_LABEL}</b> · {HOUSE_SCOPE_TEXT}
        </p>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="만드는 방법">
          {(
            [
              ["dims", "치수로 만들기", "집 바깥 벽 안쪽의 가로·세로를 알면 직사각형으로 시작해요."],
              ["trace", "도면 이미지로 따라 그리기", "도면 사진·이미지에서 축척을 맞추고 바깥 벽 모서리를 찍어요. 꺾인 집도 그릴 수 있어요."],
            ] as const
          ).map(([k, t, sub]) => (
            <label key={k} className="intake-option !p-4">
              <input type="radio" name="method" className="sr-only" checked={method === k} onChange={() => setMethod(k)} data-testid={`method-${k}`} />
              <span className="min-w-0">
                <b className="block text-sm">{t}</b>
                <span className="mt-1 block text-xs leading-relaxed text-muted">{sub}</span>
              </span>
            </label>
          ))}
        </div>

        {method === "dims" ? (
          <section className="card space-y-3">
            <h2 className="h-section !mb-0">바깥 벽 안쪽 치수</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-muted">
                가로 (mm)
                <input className="input text-right tabular-nums" inputMode="numeric" value={w} onChange={(e) => setW(e.target.value)} placeholder="예: 9600" data-testid="house-w" />
              </label>
              <label className="block text-xs text-muted">
                세로 (mm)
                <input className="input text-right tabular-nums" inputMode="numeric" value={d} onChange={(e) => setD(e.target.value)} placeholder="예: 7200" data-testid="house-d" />
              </label>
            </div>
            <p className="text-[11px] text-muted">{HOUSE_RANGE_TEXT}. 꺾인 집은 ‘도면 이미지로 따라 그리기’를 써 주세요. 직사각형으로 바꾸지 않아요.</p>
          </section>
        ) : (
          <section className="card space-y-3" data-testid="trace-box">
            <h2 className="h-section !mb-0">도면 이미지</h2>
            <input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" className="block w-full text-sm" onChange={(e) => pick(e.target.files?.[0])} data-testid="trace-file" />
            <p className="text-[11px] text-muted">도면을 자동으로 읽지 않아요. 축척과 모서리는 직접 찍어요. 밑그림 이미지는 평면을 고칠 때 겹쳐 보는 데만 써요.</p>
            {img && (
              <>
                <ol className="flex flex-wrap gap-3 text-xs">
                  {["축척 맞추기", "바깥 벽 따라 그리기", "확인"].map((t, i) => (
                    <li key={t} className={`space-step ${step === i + 1 ? "is-on" : step > i + 1 ? "is-done" : ""}`}>
                      <b>{i + 1}</b>
                      {t}
                    </li>
                  ))}
                </ol>
                <div className="relative overflow-hidden rounded-xl border border-line bg-[#f6f5f2]">
                  <div className="absolute right-2 top-2 z-10 flex gap-1">
                    {[1, 2, 3].map((z) => (
                      <button key={z} type="button" className={`btn btn-sm !min-h-8 !px-2 ${zoom === z ? "btn-primary" : ""}`} onClick={() => setZoom(z)} data-testid={`trace-zoom-${z}`}>
                        {z === 1 ? "전체" : `${z}배`}
                      </button>
                    ))}
                  </div>
                  <div className="max-h-[65vh] overflow-auto">
                    <svg ref={svg} viewBox={`${-pad} ${-pad} ${img.iw + pad * 2} ${img.ih + pad * 2}`} style={{ width: `${zoom * 100}%`, touchAction: "manipulation" }} className="block h-auto select-none" onClick={onClick} data-testid="trace-svg" data-image-size={`${img.iw}x${img.ih}`}>
                      <image href={img.url} width={img.iw} height={img.ih} preserveAspectRatio="none" opacity={step === 3 ? 0.4 : 0.9} />
                      {step === 1 &&
                        [cal.p1, cal.p2].map((q, i) => q && <circle key={i} cx={q[0]} cy={q[1]} r={6 * unit} fill="#147dba" />)}
                      {step === 1 && cal.p1 && cal.p2 && <line x1={cal.p1[0]} y1={cal.p1[1]} x2={cal.p2[0]} y2={cal.p2[1]} stroke="#147dba" strokeWidth={stroke} />}
                      {step === 2 && pts.length > 0 && <polyline points={pts.map((q) => q.join(",")).join(" ")} fill="none" stroke="#c2410c" strokeWidth={stroke} />}
                      {step === 2 && pts.map((q, i) => <circle key={i} cx={q[0]} cy={q[1]} r={(i === 0 ? 8 : 5) * unit} fill={i === 0 ? "#fff" : "#c2410c"} stroke="#c2410c" strokeWidth={stroke} />)}
                      {step === 3 && draft && <polygon points={draft.outline.map(([x, y]) => `${(x - draft.m[4]) / draft.m[0]},${(y - draft.m[5]) / draft.m[3]}`).join(" ")} fill="#147dba" fillOpacity={0.12} stroke="#147dba" strokeWidth={stroke} />}
                    </svg>
                  </div>
                </div>
                {step === 1 && (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="block text-xs text-muted">
                      두 점 사이 실제 길이 (mm)
                      <input className="input !min-h-10 w-40 text-right tabular-nums" inputMode="numeric" value={cal.mm} onChange={(e) => setCal({ ...cal, mm: e.target.value })} data-testid="trace-mm" />
                    </label>
                    <button type="button" className="btn btn-sm" onClick={applyScale} data-testid="trace-scale">
                      축척 적용
                    </button>
                    <span className="text-[11px] text-muted">{cal.p1 ? (cal.p2 ? "두 점을 찍었어요." : "두 번째 점을 누르세요.") : "첫 번째 점을 누르세요."}</span>
                  </div>
                )}
                {step === 2 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted">모서리 {pts.length}개 · 가로·세로로만 이어져요</span>
                    <button type="button" className="btn btn-sm" disabled={!pts.length} onClick={() => setPts(pts.slice(0, -1))} data-testid="trace-undo">
                      마지막 점 지우기
                    </button>
                    <button type="button" className="btn btn-sm btn-primary" disabled={pts.length < 3} onClick={close} data-testid="trace-close">
                      닫기
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => setStep(1)}>
                      축척 다시 맞추기
                    </button>
                  </div>
                )}
                {step === 3 && draft && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span data-testid="trace-result">
                      바깥 벽 {draft.outline.length}개 · {mmText(Math.max(...draft.outline.map((q) => q[0])))} × {mmText(Math.max(...draft.outline.map((q) => q[1])))} mm · 약 {areaText(outlineArea(draft.outline))}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => {
                        setDraft(null);
                        setStep(2);
                      }}
                    >
                      다시 그리기
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        <section className="card space-y-2">
          <h2 className="h-section !mb-0">천장 높이</h2>
          <label className="block max-w-[14rem] text-xs text-muted">
            천장 높이 (mm)
            <input className="input text-right tabular-nums" inputMode="numeric" value={h} onChange={(e) => setH(e.target.value)} data-testid="house-h" />
          </label>
          <p className="text-[11px] text-muted">모르면 기본값 2,400mm 그대로 두세요. 나중에 편집 화면에서 고칠 수 있어요.</p>
        </section>
        {(msg || state.error) && (
          <p role={msg?.error || state.error ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-sm ${msg?.error || state.error ? "bg-warn-soft text-danger" : "bg-brand-soft text-brand"}`} data-testid="create-msg">
            {state.error ?? msg?.error ?? msg?.ok}
          </p>
        )}
      </div>

      <aside className="space-y-4">
        <section className="card space-y-3">
          <h2 className="h-section !mb-0">미리보기</h2>
          {house && det && (method === "dims" || preview) ? (
            <HousePlan house={house} det={det} underlayUrl={method === "trace" ? img?.url : null} testid="create-preview" />
          ) : (
            <p className="rounded-xl bg-sand px-4 py-8 text-center text-xs text-muted">{errors[0]}</p>
          )}
          {house && !errors.length && (
            <p className="text-xs text-muted">
              바깥 {mmText(house.width)} × {mmText(house.depth)} mm · 천장 {mmText(house.height)} mm
            </p>
          )}
          {house && errors.length > 0 && (
            <p className="text-xs text-danger" data-testid="create-errors">
              {errors[0]}
            </p>
          )}
          <p className="text-[11px] leading-relaxed text-muted">{HOUSE_INDEPENDENT_TEXT}</p>
          <button className="btn btn-primary w-full" disabled={pending || !house || errors.length > 0} data-testid="house-submit">
            {pending ? "만드는 중…" : "평면 만들고 벽 그리기"}
          </button>
        </section>
      </aside>
    </form>
  );
}
