"use client";

import ReferenceInput from "@/components/community/ReferenceInput";
import type {PostReference} from "@/lib/post-refs";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { FormState } from "@/lib/actions";
import { josa } from "@/lib/space/check";
import { edgesOf, pointInPolygon, type Pt } from "@/lib/space/geometry";
import { composeOption } from "@/lib/space/placement";
import { ENTRANCE_RANGE_TEXT, POLYGON_RANGE_TEXT, SPACE_LATER_TEXT, SPACE_SCOPE_TEXT, entranceSupport, validateRoom } from "@/lib/space/room";
import { applyMat, draftFromPixels, draftToRoom, invertMat, orientDraft, outlineArea, nextTracePoint, pickEdge, scaleFrom, setEdgeLength, type EdgeRef, type TraceDraft } from "@/lib/space/trace";
import type { RoomModel } from "@/lib/space/types";
import PlanSvg from "../PlanSvg";
import AreaCompare from "./AreaCompare";
import { NeedsFields, type SpaceNeeds } from "./SpaceWizard";

// 도면 따라 그리기(F). 도면 이미지·PDF를 밑그림으로 띄우고, 축척을 맞춘 뒤 벽 모서리를 차례로 찍는다.
// 도면을 자동으로 읽지 않는다. 직각으로 만나는 벽만 그린다. PC 기준 화면이다.

type Action = (state: FormState, fd: FormData) => Promise<FormState>;
type Tool = "door" | "window" | "pillar" | "water";

interface Img {
  url: string;
  iw: number;
  ih: number;
  /** 새로 올린 밑그림(이미지로 바꾼 것). 이미 저장된 밑그림이면 null */
  blob: Blob | null;
  /** 고객이 올린 원본 파일(도면 자료로 따로 보관) */
  original: File | null;
  name: string;
  pdf?: { pages: number; page: number };
}

const MAX_SIDE = 3000;
const STEPS = ["도면 올리기", "축척 맞추기", "벽 따라 그리기", "문·창·기둥·급배수", "확인·만들기"] as const;
const TOOLS: { key: Tool; label: string; hint: string }[] = [
  { key: "door", label: "출입문", hint: "출입문이 있는 벽 선을 누르세요. 폭 900mm로 놓이고 아래에서 숫자로 고칠 수 있어요." },
  { key: "window", label: "창", hint: "창이 있는 벽 선을 누르세요. 폭 1,200mm로 놓여요." },
  { key: "pillar", label: "기둥", hint: "기둥 자리(공간 안)를 누르세요. 500 × 500mm로 놓여요." },
  { key: "water", label: "급배수", hint: "고객이 현장에서 직접 확인한 물 공급·배수 위치만 벽 선 위에서 누르세요. ‘고객 확인’ 위치로 표시되고 업체가 다시 확인해요. 모르면 넣지 마세요." },
];

const mmText = (m: number) => Math.round(m * 1000).toLocaleString("ko-KR");
const padOf = (img: { iw: number; ih: number }) => Math.round(Math.max(img.iw, img.ih) * 0.07);
const lensOf = (d: TraceDraft) => edgesOf({ shape: "polygon", outline: d.outline, width: 0, depth: 0 }).map((e) => e.len);

/** 벽 길이 변경: 바꾼 벽, 밀린 벽(길이 그대로), 길이가 함께 바뀐 벽 */
interface EdgeChange {
  edge: number;
  moved: number;
  rows: { k: number; kind: "edited" | "moved" | "changed"; before: number; after: number }[];
}
const toM = (v: string) => (v.trim() === "" ? NaN : Number(v.replaceAll(",", "")) / 1000);
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function loadElement(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("이미지를 열 수 없어요. 다른 파일로 해 주세요."));
    el.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("이미지를 만들지 못했어요."))), type, 0.9));
}

async function renderPdf(file: File, page: number): Promise<Img> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const p = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
  const base = p.getViewport({ scale: 1 });
  const viewport = p.getViewport({ scale: Math.min(4, 2400 / Math.max(base.width, base.height)) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await p.render({ canvas, canvasContext: ctx, viewport }).promise;
  const blob = await canvasBlob(canvas, "image/png");
  return { url: URL.createObjectURL(blob), iw: canvas.width, ih: canvas.height, blob, original: file, name: file.name, pdf: { pages: doc.numPages, page: Math.min(Math.max(1, page), doc.numPages) } };
}

async function loadDrawing(file: File, page = 1): Promise<Img> {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (file.size > 10 * 1024 * 1024) throw new Error("파일 하나는 10MB 이하여야 해요.");
  if (ext === "pdf") return renderPdf(file, page);
  if (!["jpg", "jpeg", "png", "webp"].includes(ext)) throw new Error("JPG·PNG·WEBP 이미지나 PDF만 밑그림으로 쓸 수 있어요. DWG·DXF는 PDF나 이미지로 내보내 올려 주세요.");
  const url = URL.createObjectURL(file);
  const el = await loadElement(url);
  const side = Math.max(el.naturalWidth, el.naturalHeight);
  if (side <= MAX_SIDE) return { url, iw: el.naturalWidth, ih: el.naturalHeight, blob: file, original: file, name: file.name };
  // 아주 큰 이미지는 줄여서 밑그림으로 쓴다(원본은 그대로 보관).
  const k = MAX_SIDE / side;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(el.naturalWidth * k);
  canvas.height = Math.round(el.naturalHeight * k);
  canvas.getContext("2d")!.drawImage(el, 0, 0, canvas.width, canvas.height);
  const blob = await canvasBlob(canvas, "image/jpeg");
  return { url: URL.createObjectURL(blob), iw: canvas.width, ih: canvas.height, blob, original: file, name: file.name };
}

function MmInput({ label, value, onCommit, testid, className = "", inputClass = "", onFocus, onBlur }: { label: string; value: number; onCommit: (m: number) => void; testid?: string; className?: string; inputClass?: string; onFocus?: () => void; onBlur?: () => void }) {
  const commit = (raw: string) => {
    const m = toM(raw);
    if (Number.isFinite(m)) onCommit(r3(m));
  };
  return (
    <label className={`block text-[11px] text-muted ${className}`}>
      {label}
      <input
        key={`${value}`}
        className={`input !min-h-9 !py-1.5 text-right tabular-nums ${inputClass}`}
        inputMode="numeric"
        defaultValue={Math.round(value * 1000)}
        data-testid={testid}
        onFocus={onFocus}
        onBlur={(e) => {
          commit(e.target.value);
          onBlur?.();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit((e.target as HTMLInputElement).value);
          }
        }}
      />
    </label>
  );
}

export default function TraceTool({
  action,
  mode,
  initialDraft,
  initialRoom,
  initialNeeds,
  title = "우리 사무실",
  underlayUrl,
  refCase,
  refPhoto,
  reference,
  cancel,
}: {
  action: Action;
  reference?: PostReference;
  mode: "new" | "edit";
  initialDraft?: TraceDraft | null;
  initialRoom?: RoomModel;
  initialNeeds?: SpaceNeeds;
  title?: string;
  underlayUrl?: string | null;
  refCase?: number;
  refPhoto?: number;
  cancel?: ReactNode;
}) {
  const [img, setImg] = useState<Img | null>(initialDraft && underlayUrl ? { url: underlayUrl, iw: initialDraft.iw, ih: initialDraft.ih, blob: null, original: null, name: "저장된 도면" } : null);
  const [step, setStep] = useState(initialDraft ? 3 : 0);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  // 축척: 이미지 픽셀 두 점과 그 사이 실제 길이
  const s0 = initialDraft ? Math.hypot(initialDraft.m[0], initialDraft.m[1]) : null;
  const [cal, setCal] = useState<{ p1: Pt | null; p2: Pt | null; mm: string }>({ p1: null, p2: null, mm: "" });
  const [scale, setScale] = useState<number | null>(s0);
  const [checkLine, setCheckLine] = useState<{ on: boolean; p1: Pt | null; p2: Pt | null }>({ on: false, p1: null, p2: null });
  const [pts, setPts] = useState<Pt[]>([]);
  const [hover, setHover] = useState<Pt | null>(null);
  const [draft, setDraft] = useState<TraceDraft | null>(initialDraft ?? null);
  const [tool, setTool] = useState<Tool>("door");
  // 고친 순서대로 이전 초안을 쌓아 되돌린다.
  const [hist, setHist] = useState<TraceDraft[]>([]);
  // 벽 길이를 바꿀 때 함께 바뀌는 벽: 입력 중에는 미리 보여 주고, 바꾼 뒤에는 전후 값을 남긴다.
  const [focusEdge, setFocusEdge] = useState<number | null>(null);
  const [edgeChange, setEdgeChange] = useState<EdgeChange | null>(null);
  const [edgesOpen, setEdgesOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [unit, setUnit] = useState(1);
  const [height, setHeight] = useState(initialRoom?.height != null ? String(Math.round(initialRoom.height * 1000)) : "");
  const [areaHint, setAreaHint] = useState(initialRoom?.areaHint != null ? String(initialRoom.areaHint) : "");
  const [state, dispatch, pending] = useActionState(action, {});
  const svg = useRef<SVGSVGElement>(null);
  const done = useRef(false);

  // 화면 1px이 이미지 몇 px인지(선 굵기·글자 크기를 화면 기준으로 맞춘다)
  useEffect(() => {
    const el = svg.current;
    if (!el || !img) return;
    const update = () => setUnit((img.iw + padOf(img) * 2) / Math.max(1, el.getBoundingClientRect().width));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [img, zoom, step]);

  useEffect(() => {
    const dirty = !!img && !done.current;
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [img]);

  const inv = useMemo(() => (draft ? invertMat(draft.m) : null), [draft]);
  const P = (p: Pt): Pt => (inv ? applyMat(inv, p) : p);
  const heightM = height.trim() ? toM(height) : null;
  const hint = areaHint.trim() ? Number(areaHint) : null;
  const room = useMemo(() => (draft ? draftToRoom(draft, { height: heightM, areaHint: hint, fileId: initialDraft && !img?.blob ? (initialRoom?.underlay?.fileId ?? 0) : 0 }) : null), [draft, heightM, hint, img, initialDraft, initialRoom]);
  const roomOk = room && !("error" in room) ? room : null;
  const errors = room ? ("error" in room ? [room.error] : validateRoom(room)) : ["벽을 따라 그려 주세요."];
  const preview = useMemo(() => (roomOk && errors.length === 0 ? composeOption(roomOk, null, []) : null), [roomOk, errors.length]);
  const edges = draft ? edgesOf({ shape: "polygon", outline: draft.outline, width: 0, depth: 0 }) : [];
  const area = draft ? outlineArea(draft.outline) : 0;

  // 입력 중이면 미리보기, 바꾼 뒤에는 그 변경으로 함께 바뀐 벽을 표시한다.
  const edgeRole = (k: number): "edited" | "affected" | null => {
    const n = edges.length;
    if (!n) return null;
    const base = focusEdge ?? edgeChange?.edge ?? null;
    if (base == null) return null;
    if (k === base) return "edited";
    return k === (base + 1) % n || k === (base + 2) % n ? "affected" : null;
  };

  const toPx = (clientX: number, clientY: number): Pt | null => {
    const m = svg.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  };
  const tolPx = 10 * unit;
  // 첫 점부터 같은 정밀도·직각 맞춤 규칙(lib/space/trace.ts)으로 꼭짓점을 만든다.
  const snapped = (p: Pt): Pt => nextTracePoint(pts, p, tolPx);

  const pickFile = async (file: File | undefined, page = 1) => {
    if (!file) return;
    setLoading(true);
    setMsg(null);
    try {
      const next = await loadDrawing(file, page);
      setImg(next);
      setCal({ p1: null, p2: null, mm: "" });
      setScale(null);
      setPts([]);
      setDraft(null);
      setZoom(1);
      setStep(1);
      setMsg({ ok: next.pdf ? `PDF ${next.pdf.page}쪽을 밑그림으로 띄웠어요. 길이를 아는 곳의 양 끝을 눌러 축척을 맞춰 주세요.` : "도면을 띄웠어요. 길이를 아는 곳의 양 끝을 눌러 축척을 맞춰 주세요." });
    } catch (e) {
      setMsg({ error: (e as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const applyScale = () => {
    if (!cal.p1 || !cal.p2) return setMsg({ error: "도면에서 길이를 아는 곳의 양 끝 두 점을 눌러 주세요." });
    const s = scaleFrom(cal.p1, cal.p2, Number(cal.mm.replaceAll(",", "")));
    if (!s) return setMsg({ error: "두 점을 더 멀리 찍고, 실제 길이를 300mm 이상으로 넣어 주세요." });
    setScale(s);
    if (draft && Math.abs(s - (scale ?? s)) > 1e-12) {
      setDraft(null);
      setPts([]);
    }
    setMsg({ ok: `축척을 맞췄어요. 도면 1px = 실제 ${(s * 1000).toFixed(1)}mm. 다른 치수 하나를 ‘확인용으로 재기’로 재 보면 축척이 맞는지 알 수 있어요.` });
  };

  const close = () => {
    if (!scale) return setMsg({ error: "먼저 축척을 맞춰 주세요." });
    const d = draftFromPixels(pts, scale, img!.iw, img!.ih);
    if ("error" in d) return setMsg({ error: d.error });
    setDraft(d);
    setHist([]);
    setEdgeChange(null);
    setHover(null);
    setStep(3);
    setTool("door");
    setMsg({ ok: `벽 ${d.outline.length}개로 닫았어요. 이제 출입문이 있는 벽 선을 눌러 주세요.` });
  };

  const commitDraft = (d: TraceDraft, ok?: string, change: EdgeChange | null = null) => {
    if (draft && JSON.stringify(d) === JSON.stringify(draft)) return;
    if (draft) setHist((h) => [...h.slice(-49), draft]);
    setDraft(d);
    setEdgeChange(change);
    setMsg(ok ? { ok } : null);
  };
  const undoDraft = () => {
    const prev = hist.at(-1);
    if (!prev) return;
    setHist((h) => h.slice(0, -1));
    setDraft(prev);
    setEdgeChange(null);
    setFocusEdge(null);
    setMsg({ ok: "바로 전 변경을 되돌렸어요." });
  };
  const changeEdgeLength = (i: number, m: number) => {
    if (!draft) return;
    const before = lensOf(draft);
    if (Math.abs(m - before[i]) < 0.0005) return;
    const r = setEdgeLength(draft, i, m);
    if ("error" in r) return setMsg({ error: r.error });
    const after = lensOf(r);
    const n = before.length;
    const [j1, j2] = [(i + 1) % n, (i + 2) % n];
    setFocusEdge(null);
    commitDraft(r, `${josa(`벽 ${i + 1}`, "을", "를")} ${mmText(m)}mm로 맞췄어요. 함께 바뀐 벽을 주황색으로 표시했어요.`, {
      edge: i,
      moved: m - before[i],
      rows: [
        { k: i, kind: "edited", before: before[i], after: after[i] },
        { k: j1, kind: "moved", before: before[j1], after: after[j1] },
        { k: j2, kind: "changed", before: before[j2], after: after[j2] },
      ],
    });
  };

  const clickTool = (px: Pt) => {
    if (!draft) return;
    const q = applyMat(draft.m, px);
    const s = scale ?? 0.01;
    const tolM = 14 * unit * s;
    if (tool === "pillar") {
      if (!pointInPolygon(q[0], q[1], draft.outline)) return setMsg({ error: "기둥은 공간 안을 눌러 놓아 주세요." });
      return commitDraft({ ...draft, pillars: [...draft.pillars, { x: r3(q[0] - 0.25), y: r3(q[1] - 0.25), w: 0.5, d: 0.5 }] }, `${josa(`기둥 ${draft.pillars.length + 1}`, "을", "를")} 놓았어요. 아래에서 크기와 위치를 숫자로 고칠 수 있어요.`);
    }
    const hit = pickEdge(draft.outline, q, tolM);
    if (!hit) return setMsg({ error: "벽 선 위를 눌러 주세요. 확대하면 더 정확하게 누를 수 있어요." });
    const len = edges[hit.edge].len;
    const span = (w: number) => {
      const width = Math.min(w, len);
      return { edge: hit.edge, at: r3(Math.min(len - width, Math.max(0, hit.at - width / 2))), width: r3(width) };
    };
    if (tool === "door") {
      const next = orientDraft({ ...draft, entrance: span(0.9) });
      commitDraft(next, "출입문을 놓았어요. 출입문이 있는 벽을 앞벽으로 삼아 공간 방향을 맞췄어요(벽 번호가 바뀔 수 있어요).");
    } else if (tool === "window") commitDraft({ ...draft, windows: [...(draft.windows ?? []), span(1.2)] }, `${josa(`창 ${(draft.windows?.length ?? 0) + 1}`, "을", "를")} 놓았어요.`);
    else commitDraft({ ...draft, utilities: [...draft.utilities, { edge: hit.edge, at: r3(hit.at) }] }, `${josa(`급배수 ${draft.utilities.length + 1}`, "을", "를")} 놓았어요.`);
  };

  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!img) return;
    const p = toPx(e.clientX, e.clientY);
    if (!p) return;
    if (step === 1) {
      if (checkLine.on) {
        setCheckLine((c) => (!c.p1 || c.p2 ? { on: true, p1: p, p2: null } : { ...c, p2: p }));
        return;
      }
      setCal((c) => (!c.p1 || c.p2 ? { ...c, p1: p, p2: null } : { ...c, p2: p }));
      return;
    }
    if (step === 2 && !draft) {
      if (!scale) return setMsg({ error: "먼저 축척을 맞춰 주세요." });
      if (pts.length >= 3 && Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) < 14 * unit) return close();
      setPts([...pts, snapped(p)]);
      setMsg(null);
      return;
    }
    if (step === 3) clickTool(p);
  };

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (step !== 2 || draft || !pts.length || e.pointerType !== "mouse") return;
    const p = toPx(e.clientX, e.clientY);
    if (p) setHover(snapped(p));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      if (step === 2 && !draft) {
        if (e.key === "Backspace") {
          e.preventDefault();
          setPts((list) => list.slice(0, -1));
        } else if (e.key === "Enter" && pts.length >= 3) {
          e.preventDefault();
          close();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const next = () => {
    setMsg(null);
    if (step === 0 && !img) return setMsg({ error: "도면 파일을 먼저 올려 주세요." });
    if (step === 1 && !scale) return setMsg({ error: "두 점을 찍고 실제 길이를 넣은 뒤 ‘축척 적용’을 눌러 주세요." });
    if (step === 2 && !draft) return setMsg({ error: pts.length >= 3 ? "‘닫기’를 눌러 벽을 닫아 주세요." : "벽 모서리를 차례로 찍어 주세요." });
    if (step === 3 && errors.length) return setMsg({ error: errors[0] });
    setStep((x) => Math.min(4, x + 1));
    window.scrollTo({ top: 0 });
  };

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!roomOk || errors.length) return setMsg({ error: errors[0] });
    const fd = new FormData(e.currentTarget);
    fd.set("room", JSON.stringify(roomOk));
    fd.set("shape", "trace");
    fd.set("intake", "drawing");
    if (img?.blob) fd.set("underlay", new File([img.blob], img.blob.type === "image/jpeg" ? "underlay.jpg" : img.blob.type === "image/webp" ? "underlay.webp" : "underlay.png", { type: img.blob.type || "image/png" }));
    if (img?.original) fd.set("drawings", img.original);
    done.current = true;
    startTransition(() => dispatch(fd));
  };

  // ── 그리기(이미지 픽셀 좌표)
  const stroke = 2 * unit;
  const font = 13 * unit;
  // 벽 이름은 벽 바깥쪽에 둔다. 세로 벽은 바깥 방향으로 글자를 늘여 안쪽 표시(급배수 등)와 겹치지 않게 한다.
  const edgeLabel = (i: number) => {
    const e = edges[i];
    const mid = P([(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2]);
    const out = P([(e.a[0] + e.b[0]) / 2 - e.inward[0], (e.a[1] + e.b[1]) / 2 - e.inward[1]]);
    const len = Math.hypot(out[0] - mid[0], out[1] - mid[1]) || 1;
    const ox = (out[0] - mid[0]) / len, oy = (out[1] - mid[1]) / len;
    return { x: mid[0] + ox * 12 * unit, y: mid[1] + oy * 20 * unit, anchor: (ox > 0.5 ? "start" : ox < -0.5 ? "end" : "middle") as "start" | "end" | "middle" };
  };
  const segPx = (ref: EdgeRef, width: number): [Pt, Pt] | null => {
    const e = edges[ref.edge];
    if (!e) return null;
    const a: Pt = [e.a[0] + e.dir[0] * ref.at, e.a[1] + e.dir[1] * ref.at];
    return [P(a), P([a[0] + e.dir[0] * width, a[1] + e.dir[1] * width])];
  };
  const preview2 = step === 2 && !draft && hover && pts.length ? hover : null;

  // 도면 가장자리 벽의 이름이 잘리지 않게 이미지 둘레에 여백을 둔다.
  const pad = img ? padOf(img) : 0;
  const canvas = img && (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-[#f6f5f2]">
      <div className="max-h-[70vh] overflow-auto" data-testid="trace-scroll">
        <svg
          ref={svg}
          viewBox={`${-pad} ${-pad} ${img.iw + pad * 2} ${img.ih + pad * 2}`}
          data-image-size={`${img.iw}x${img.ih}`}
          style={{ width: `${zoom * 100}%`, cursor: step >= 1 && step <= 3 ? "crosshair" : "default" }}
          className="block h-auto select-none"
          data-testid="trace-canvas"
          onClick={onClick}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label="도면 밑그림"
        >
          <image href={img.url} width={img.iw} height={img.ih} opacity={step >= 3 ? 0.55 : 0.9} />
          {/* 축척 선 */}
          {step === 1 && cal.p1 && (
            <g data-testid="cal-line">
              {cal.p2 && <line x1={cal.p1[0]} y1={cal.p1[1]} x2={cal.p2[0]} y2={cal.p2[1]} stroke="#b4643c" strokeWidth={stroke * 1.5} />}
              {[cal.p1, cal.p2].filter(Boolean).map((p, i) => (
                <circle key={i} cx={p![0]} cy={p![1]} r={5 * unit} fill="#b4643c" stroke="#fff" strokeWidth={unit * 1.5} />
              ))}
            </g>
          )}
          {step === 1 && checkLine.p1 && (
            <g>
              {checkLine.p2 && <line x1={checkLine.p1[0]} y1={checkLine.p1[1]} x2={checkLine.p2[0]} y2={checkLine.p2[1]} stroke="#147dba" strokeWidth={stroke * 1.5} strokeDasharray={`${6 * unit} ${4 * unit}`} />}
              {[checkLine.p1, checkLine.p2].filter(Boolean).map((p, i) => (
                <circle key={i} cx={p![0]} cy={p![1]} r={5 * unit} fill="#147dba" stroke="#fff" strokeWidth={unit * 1.5} />
              ))}
            </g>
          )}
          {/* 그리는 중 */}
          {!draft && pts.length > 0 && step >= 2 && (
            <g data-testid="trace-points">
              <polyline points={[...pts, ...(preview2 ? [preview2] : [])].map((p) => p.join(",")).join(" ")} fill="none" stroke="#147dba" strokeWidth={stroke * 1.4} />
              {pts.map((p, i) => (
                <circle key={i} cx={p[0]} cy={p[1]} r={(i === 0 ? 7 : 4.5) * unit} fill={i === 0 ? "#ffffff" : "#147dba"} stroke="#147dba" strokeWidth={unit * 2} />
              ))}
              {preview2 && scale && (
                <text x={preview2[0] + 10 * unit} y={preview2[1] - 10 * unit} fontSize={font} fill="#147dba" stroke="#fff" strokeWidth={unit * 3} paintOrder="stroke">
                  {mmText(Math.hypot(preview2[0] - pts[pts.length - 1][0], preview2[1] - pts[pts.length - 1][1]) * scale)}
                </text>
              )}
            </g>
          )}
          {/* 닫힌 공간 */}
          {draft && (
            <g data-testid="trace-outline">
              <polygon points={draft.outline.map((p) => P(p).join(",")).join(" ")} fill="#147dba" fillOpacity={0.08} stroke="#1d3c58" strokeWidth={stroke * 1.6} strokeLinejoin="miter" />
              {edges.map((e) => {
                const l = edgeLabel(e.i);
                return (
                  <text key={e.i} x={l.x} y={l.y + font / 3} textAnchor={l.anchor} fontSize={font} fontWeight={700} fill="#1d3c58" stroke="#fff" strokeWidth={unit * 3.5} paintOrder="stroke" pointerEvents="none">
                    벽 {e.i + 1} · {mmText(e.len)}
                  </text>
                );
              })}
              {edges.map((e) => {
                const role = edgeRole(e.i);
                if (!role) return null;
                const a = P(e.a), b = P(e.b);
                return <line key={`hl${e.i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={role === "edited" ? "#147dba" : "#e07b00"} strokeWidth={stroke * 4} strokeOpacity={0.85} strokeLinecap="round" data-testid={`edge-hl-${e.i}`} data-kind={role} />;
              })}
              {draft.pillars.map((pl, i) => {
                const c = [P([pl.x, pl.y]), P([pl.x + pl.w, pl.y]), P([pl.x + pl.w, pl.y + pl.d]), P([pl.x, pl.y + pl.d])];
                return <polygon key={`pl${i}`} points={c.map((p) => p.join(",")).join(" ")} fill="#857f72" fillOpacity={0.55} stroke="#3d3a35" strokeWidth={stroke} />;
              })}
              {(draft.windows ?? []).map((w, i) => {
                const sg = segPx(w, w.width);
                return sg && <line key={`w${i}`} x1={sg[0][0]} y1={sg[0][1]} x2={sg[1][0]} y2={sg[1][1]} stroke="#4aa3c2" strokeWidth={stroke * 4} />;
              })}
              {draft.entrance &&
                (() => {
                  const sg = segPx(draft.entrance, draft.entrance.width);
                  return (
                    sg && (
                      <g data-testid="trace-door">
                        <line x1={sg[0][0]} y1={sg[0][1]} x2={sg[1][0]} y2={sg[1][1]} stroke="#ffffff" strokeWidth={stroke * 5} />
                        <line x1={sg[0][0]} y1={sg[0][1]} x2={sg[1][0]} y2={sg[1][1]} stroke="#b4643c" strokeWidth={stroke * 2} strokeDasharray={`${6 * unit} ${4 * unit}`} />
                        <text x={(sg[0][0] + sg[1][0]) / 2} y={(sg[0][1] + sg[1][1]) / 2 - 10 * unit} textAnchor="middle" fontSize={font} fontWeight={700} fill="#b4643c" stroke="#fff" strokeWidth={unit * 3.5} paintOrder="stroke">
                          출입문
                        </text>
                      </g>
                    )
                  );
                })()}
              {draft.utilities.map((u, i) => {
                const sg = segPx(u, 0);
                return (
                  sg && (
                    <g key={`u${i}`}>
                      <circle cx={sg[0][0]} cy={sg[0][1]} r={7 * unit} fill="#3b82c4" stroke="#fff" strokeWidth={unit * 2} />
                      <text x={sg[0][0]} y={sg[0][1] - 11 * unit} textAnchor="middle" fontSize={font * 0.9} fontWeight={700} fill="#3b82c4" stroke="#fff" strokeWidth={unit * 3} paintOrder="stroke">
                        급배수 {i + 1}
                      </text>
                    </g>
                  )
                );
              })}
            </g>
          )}
        </svg>
      </div>
      <div className="absolute right-2 top-2 flex gap-1">
        {[1, 2, 3, 4].map((z) => (
          <button key={z} type="button" className={`btn btn-sm !min-h-8 !px-2 ${zoom === z ? "btn-primary" : ""}`} aria-pressed={zoom === z} data-testid={`trace-zoom-${z}`} onClick={() => setZoom(z)}>
            {z === 1 ? "전체" : `${z}배`}
          </button>
        ))}
      </div>
    </div>
  );

  const scaleCheck = checkLine.p1 && checkLine.p2 && scale ? Math.hypot(checkLine.p2[0] - checkLine.p1[0], checkLine.p2[1] - checkLine.p1[1]) * scale : null;

  const refRow = (label: string, ref: EdgeRef & { width?: number }, onChange: (r: EdgeRef & { width?: number }) => void, onRemove: (() => void) | null, testid: string) => (
    <div key={testid} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-1.5" data-testid={testid}>
      <label className="block text-[11px] text-muted">
        {label} · 벽
        <select className="input !min-h-9 !py-1" value={ref.edge} onChange={(e) => onChange({ ...ref, edge: Number(e.target.value), at: 0 })}>
          {edges.map((e) => (
            <option key={e.i} value={e.i}>
              벽 {e.i + 1} ({mmText(e.len)})
            </option>
          ))}
        </select>
      </label>
      <MmInput label="벽 시작점에서" value={ref.at} onCommit={(m) => onChange({ ...ref, at: m })} testid={`${testid}-at`} />
      {ref.width != null ? <MmInput label="폭" value={ref.width} onCommit={(m) => onChange({ ...ref, width: m })} testid={`${testid}-width`} /> : <span />}
      {onRemove ? (
        <button type="button" className="btn btn-sm mb-0.5 !min-h-9" aria-label={`${label} 지우기`} onClick={onRemove}>
          ✕
        </button>
      ) : (
        <span />
      )}
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-5" data-testid="trace-tool">
      <ReferenceInput reference={reference}/>
      {refCase && <input type="hidden" name="refCase" value={refCase} />}
      {refCase && refPhoto && <input type="hidden" name="refPhoto" value={refPhoto} />}
      <ol className="flex flex-wrap gap-4" aria-label="단계">
        {STEPS.map((label, i) => (
          <li key={label} className={`space-step ${i === step ? "is-on" : i < step ? "is-done" : ""}`}>
            <b>{i < step ? "✓" : i + 1}</b>
            {label}
          </li>
        ))}
      </ol>
      <p className="rounded-xl bg-warn-soft px-4 py-3 text-xs leading-relaxed text-warn lg:hidden" data-testid="trace-pc">
        도면 따라 그리기는 PC 화면에 맞춰 만들었어요. 휴대폰에서는 정확히 찍기 어려우니 PC에서 해 주세요. 휴대폰에서는{" "}
        <Link href="/spaces/new" className="underline">
          치수 입력으로 내 공간 만들기
        </Link>
        를 쓸 수 있어요.
      </p>

      {/* 1. 도면 올리기 */}
      {step === 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">도면을 밑그림으로 올려 주세요</h2>
          <p className="text-sm text-muted">이미지(JPG·PNG·WEBP)나 PDF를 올리면 화면에 띄워요. 도면에서 치수를 자동으로 읽지 않고, 그 위에 직접 벽을 따라 그려요. 원본 파일은 도면 자료로 함께 보관해요.</p>
          <input className="input" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" data-testid="trace-file" onChange={(e) => pickFile(e.target.files?.[0])} disabled={loading} />
          {loading && <p className="text-sm text-muted">도면을 여는 중…</p>}
          <div className="grid gap-3 rounded-xl border border-line bg-white p-4 text-xs leading-relaxed sm:grid-cols-2" data-testid="trace-scope">
            <div>
              <p className="font-semibold">{SPACE_SCOPE_TEXT}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
                <li>실내 외곽 형태: 직각으로 만나는 바깥 벽(ㄱ자 등 꺾인 모양 포함)</li>
                <li>출입문·창(외곽 벽 위), 기둥</li>
                <li>급배수 위치: 고객이 직접 확인한 경우만(‘고객 확인’으로 표시)</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold">아직 그리지 않는 것</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
                <li>{SPACE_LATER_TEXT}: 도면에 방이 나뉘어 있어도 외곽만 그려요</li>
                <li>기울어진 벽·곡선 벽, 도면 자동 인식</li>
              </ul>
            </div>
          </div>
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted">
            <li>파일 하나에 10MB까지. PDF는 한 쪽을 골라 써요. DWG·DXF는 PDF나 이미지로 내보내 올려 주세요.</li>
            <li>도면이 기울어져 스캔됐다면 반듯하게 다시 스캔한 이미지가 정확해요.</li>
          </ul>
        </section>
      )}
      {step > 0 && img && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-2">
            {step <= 3 ? canvas : preview ? <div className="overflow-hidden rounded-2xl border border-line bg-white p-2" data-testid="trace-preview"><PlanSvg option={preview} styleId="natural" space /></div> : null}
            {msg && (
              <p role={msg.error ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-sm ${msg.error ? "bg-warn-soft text-danger" : "bg-brand-soft text-brand"}`} data-testid="trace-msg">
                {msg.error ?? msg.ok}
              </p>
            )}
          </div>
          <aside className="space-y-4">
            <p className="truncate text-xs text-muted">
              밑그림: <b className="text-ink">{img.name}</b>
              {img.pdf && ` · ${img.pdf.page}/${img.pdf.pages}쪽`}
            </p>
            {img.pdf && img.pdf.pages > 1 && img.original && step === 1 && (
              <label className="block text-xs text-muted">
                PDF 쪽 고르기
                <select className="input !min-h-9" value={img.pdf.page} onChange={(e) => pickFile(img.original!, Number(e.target.value))}>
                  {Array.from({ length: img.pdf.pages }, (_, i) => (
                    <option key={i} value={i + 1}>
                      {i + 1}쪽
                    </option>
                  ))}
                </select>
              </label>
            )}

            {step === 1 && (
              <section className="card !p-4 space-y-3" data-testid="trace-scale">
                <h2 className="text-sm font-bold">축척 맞추기</h2>
                <p className="text-xs leading-relaxed text-muted">도면에 숫자로 적힌 길이(예: 벽 전체 길이)의 양 끝을 차례로 누르고, 그 길이를 mm로 넣어 주세요. 길수록 정확해요.</p>
                <p className="text-xs">
                  찍은 점: <b data-testid="cal-count">{[cal.p1, cal.p2].filter(Boolean).length}</b> / 2
                </p>
                <label className="block text-[11px] text-muted">
                  두 점 사이 실제 길이 (mm)
                  <input className="input text-right tabular-nums" inputMode="numeric" value={cal.mm} onChange={(e) => setCal({ ...cal, mm: e.target.value.replace(/[^\d]/g, "") })} placeholder="예: 12000" data-testid="cal-mm" />
                </label>
                <button type="button" className="btn btn-sm btn-primary w-full" data-testid="cal-apply" onClick={applyScale}>
                  축척 적용
                </button>
                {scale && (
                  <p className="rounded-lg bg-brand-soft px-3 py-2 text-xs text-brand" data-testid="cal-result">
                    도면 1px = 실제 {(scale * 1000).toFixed(1)}mm
                  </p>
                )}
                {scale && (
                  <div className="space-y-1.5 border-t border-line pt-3">
                    <button type="button" className={`btn btn-sm w-full ${checkLine.on ? "btn-primary" : ""}`} aria-pressed={checkLine.on} data-testid="scale-check" onClick={() => setCheckLine({ on: !checkLine.on, p1: null, p2: null })}>
                      {checkLine.on ? "확인용 재기 끝내기" : "확인용으로 다른 곳 재기"}
                    </button>
                    {checkLine.on && <p className="text-[11px] text-muted">도면에 적힌 다른 치수의 양 끝을 누르면 지금 축척으로 잰 길이를 보여 드려요. 도면 숫자와 비교해 보세요.</p>}
                    {scaleCheck != null && (
                      <p className="text-xs" data-testid="scale-check-result">
                        지금 축척으로 잰 길이: <b>{mmText(scaleCheck)}mm</b>
                      </p>
                    )}
                  </div>
                )}
              </section>
            )}

            {step === 2 && (
              <section className="card !p-4 space-y-3" data-testid="trace-walls">
                <h2 className="text-sm font-bold">벽 따라 그리기</h2>
                <p className="text-xs leading-relaxed text-muted">실내 <b>외곽</b> 벽 안쪽 모서리를 한 바퀴 차례로 누르세요(공간 안의 벽·방문은 그리지 않아요). 선은 가로·세로로만 그려지고, 다른 모서리와 줄이 맞으면 자동으로 맞춰요. 처음 점을 다시 누르거나 ‘닫기’를 누르면 닫혀요.</p>
                <p className="text-xs">
                  찍은 모서리: <b data-testid="trace-count">{draft ? draft.outline.length : pts.length}</b>개 {draft && "· 닫힘"}
                </p>
                {!draft ? (
                  <div className="grid grid-cols-3 gap-1.5">
                    <button type="button" className="btn btn-sm" data-testid="trace-undo" disabled={!pts.length} onClick={() => setPts(pts.slice(0, -1))}>
                      한 점 지우기
                    </button>
                    <button type="button" className="btn btn-sm btn-primary" data-testid="trace-close" disabled={pts.length < 3} onClick={close}>
                      닫기
                    </button>
                    <button type="button" className="btn btn-sm" data-testid="trace-reset" disabled={!pts.length} onClick={() => setPts([])}>
                      처음부터
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-sm w-full"
                    data-testid="trace-redraw"
                    onClick={() => {
                      setDraft(null);
                      setHist([]);
                      setEdgeChange(null);
                      setPts([]);
                      setMsg({ ok: "다시 그려 주세요. 출입문·창·기둥·급배수도 다시 놓아야 해요." });
                    }}
                  >
                    벽 다시 그리기
                  </button>
                )}
                <p className="text-[11px] text-muted">키보드: 지우기(Backspace) · 닫기(Enter)</p>
              </section>
            )}

            {step === 3 && draft && (
              <section className="card !p-4 space-y-3" data-testid="trace-details">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-bold">문·창·기둥·급배수 놓기</h2>
                  <button type="button" className="btn btn-sm !min-h-8" data-testid="trace-undo-edit" disabled={!hist.length} onClick={undoDraft}>
                    ↶ 되돌리기
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-1" role="group" aria-label="놓을 것">
                  {TOOLS.map((t) => (
                    <button key={t.key} type="button" className={`btn btn-sm !px-1 ${tool === t.key ? "btn-primary" : ""}`} aria-pressed={tool === t.key} data-testid={`tool-${t.key}`} onClick={() => setTool(t.key)}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] leading-relaxed text-muted">{TOOLS.find((t) => t.key === tool)!.hint}</p>

                <div className="space-y-2 border-t border-line pt-3">
                  <p className="text-xs font-semibold">출입문 {!draft.entrance && <span className="text-warn">· 꼭 정해 주세요</span>}</p>
                  {draft.entrance && refRow("출입문", draft.entrance, (r) => commitDraft(orientDraft({ ...draft, entrance: { edge: r.edge, at: r.at, width: r.width ?? 0.9 } })), null, "trace-ent")}
                </div>
                <div className="space-y-2 border-t border-line pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold">창</p>
                    <div className="flex gap-1">
                      <button type="button" className={`filter-chip !min-h-7 !px-2 !py-0.5 !text-[11px] ${draft.windows === null ? "active" : ""}`} data-testid="trace-win-unknown" onClick={() => commitDraft({ ...draft, windows: null })}>
                        잘 모름
                      </button>
                      <button type="button" className={`filter-chip !min-h-7 !px-2 !py-0.5 !text-[11px] ${draft.windows?.length === 0 ? "active" : ""}`} data-testid="trace-win-none" onClick={() => commitDraft({ ...draft, windows: [] })}>
                        창 없음
                      </button>
                    </div>
                  </div>
                  {(draft.windows ?? []).map((w, i) =>
                    refRow(
                      `창 ${i + 1}`,
                      w,
                      (r) => commitDraft({ ...draft, windows: draft.windows!.map((x, k) => (k === i ? { edge: r.edge, at: r.at, width: r.width ?? x.width } : x)) }),
                      () => commitDraft({ ...draft, windows: draft.windows!.filter((_, k) => k !== i) }),
                      `trace-win-${i}`,
                    ),
                  )}
                  {draft.windows === null && <p className="text-[11px] text-muted">창을 그리지 않고, 창이 있다고 가정하지도 않아요.</p>}
                </div>
                <div className="space-y-2 border-t border-line pt-3">
                  <p className="text-xs font-semibold">기둥 {draft.pillars.length ? `· ${draft.pillars.length}개` : ""}</p>
                  {draft.pillars.map((pl, i) => (
                    <div key={i} className="grid grid-cols-[repeat(4,minmax(0,1fr))_auto] items-end gap-1.5" data-testid={`trace-pillar-${i}`}>
                      <MmInput label="왼쪽 끝에서" value={pl.x} onCommit={(m) => commitDraft({ ...draft, pillars: draft.pillars.map((x, k) => (k === i ? { ...x, x: m } : x)) })} />
                      <MmInput label="아래 끝에서" value={pl.y} onCommit={(m) => commitDraft({ ...draft, pillars: draft.pillars.map((x, k) => (k === i ? { ...x, y: m } : x)) })} />
                      <MmInput label="가로" value={pl.w} onCommit={(m) => commitDraft({ ...draft, pillars: draft.pillars.map((x, k) => (k === i ? { ...x, w: m } : x)) })} />
                      <MmInput label="세로" value={pl.d} onCommit={(m) => commitDraft({ ...draft, pillars: draft.pillars.map((x, k) => (k === i ? { ...x, d: m } : x)) })} />
                      <button type="button" className="btn btn-sm mb-0.5 !min-h-9" aria-label={`기둥 ${i + 1} 지우기`} onClick={() => commitDraft({ ...draft, pillars: draft.pillars.filter((_, k) => k !== i) })}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <div className="space-y-2 border-t border-line pt-3">
                  <p className="text-xs font-semibold">급배수 위치(고객 확인) {draft.utilities.length ? `· ${draft.utilities.length}곳` : "· 직접 확인한 경우만"}</p>
                  {draft.utilities.map((u, i) =>
                    refRow(
                      `급배수 ${i + 1}`,
                      u,
                      (r) => commitDraft({ ...draft, utilities: draft.utilities.map((x, k) => (k === i ? { edge: r.edge, at: r.at } : x)) }),
                      () => commitDraft({ ...draft, utilities: draft.utilities.filter((_, k) => k !== i) }),
                      `trace-water-${i}`,
                    ),
                  )}
                </div>
                <details className="border-t border-line pt-3" data-testid="trace-edges" open={edgesOpen} onToggle={(e) => setEdgesOpen(e.currentTarget.open)}>
                  <summary className="cursor-pointer text-xs font-semibold">벽 길이를 도면 숫자로 맞추기</summary>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">찍은 위치에 따라 생긴 차이를 도면에 적힌 숫자로 고칠 수 있어요. 한 벽의 길이를 바꾸면 <b>바로 다음 벽이 밀리고</b>(길이 그대로), <b>그다음 벽의 길이가 함께 바뀌어요</b>. 칸을 누르면 함께 바뀌는 벽을 도면에 주황색으로 미리 보여 드려요.</p>
                  {focusEdge != null && edges.length > 0 && (
                    <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-[11px] leading-relaxed text-warn" data-testid="edge-preview">
                      {josa(`벽 ${focusEdge + 1}`, "을", "를")} 바꾸면 {josa(`벽 ${((focusEdge + 1) % edges.length) + 1}`, "이", "가")} 밀리고, 벽 {((focusEdge + 2) % edges.length) + 1}의 길이({mmText(edges[(focusEdge + 2) % edges.length].len)}mm)가 함께 바뀌어요.
                    </p>
                  )}
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {edges.map((e) => {
                      const role = edgeRole(e.i);
                      return (
                        <MmInput
                          key={e.i}
                          label={`벽 ${e.i + 1}${role === "edited" ? " · 바꾼 벽" : role ? " · 함께 바뀜" : ""}`}
                          value={e.len}
                          testid={`edge-len-${e.i}`}
                          inputClass={role === "edited" ? "!border-brand ring-2 ring-brand/30" : role ? "!border-warn ring-2 ring-warn/30" : ""}
                          onFocus={() => setFocusEdge(e.i)}
                          onBlur={() => setFocusEdge((f) => (f === e.i ? null : f))}
                          onCommit={(m) => changeEdgeLength(e.i, m)}
                        />
                      );
                    })}
                  </div>
                  {edgeChange && (
                    <div className="mt-2 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-[11px] leading-relaxed" data-testid="edge-change">
                      <p className="font-semibold text-warn">벽 {edgeChange.edge + 1} 길이를 바꿔 함께 바뀐 벽</p>
                      <ul className="mt-1 space-y-0.5 tabular-nums">
                        {edgeChange.rows.map((r) => (
                          <li key={r.k} data-testid={`edge-change-${r.k}`}>
                            <b>벽 {r.k + 1}</b>{" "}
                            {r.kind === "moved"
                              ? `길이 그대로 ${mmText(r.after)}mm · ${mmText(Math.abs(edgeChange.moved))}mm 밀림`
                              : `${mmText(r.before)} → ${mmText(r.after)}mm (${r.after >= r.before ? "+" : "−"}${mmText(Math.abs(r.after - r.before))})`}
                          </li>
                        ))}
                      </ul>
                      <button type="button" className="btn btn-sm mt-2 !min-h-8 bg-white" data-testid="edge-change-undo" onClick={undoDraft}>
                        이 변경 되돌리기
                      </button>
                    </div>
                  )}
                </details>
              </section>
            )}

            {step >= 3 && draft && (
              <section className="card !p-4 space-y-2 text-xs" data-testid="trace-summary">
                <p className="text-muted">따라 그린 벽 {draft.outline.length}개</p>
                <AreaCompare area={area} hint={hint} testid="trace-area" />
                <label className="block text-[11px] text-muted">
                  알고 있는 전용면적 (평) · 선택
                  <input className="input !min-h-9 text-right" inputMode="decimal" value={areaHint} onChange={(e) => setAreaHint(e.target.value.replace(/[^\d.]/g, ""))} placeholder="예: 30" data-testid="trace-area-hint" />
                </label>
                <label className="block text-[11px] text-muted">
                  천장 높이 (mm) · 선택
                  <input className="input !min-h-9 text-right tabular-nums" inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value.replace(/[^\d]/g, ""))} placeholder="모르면 비워 두세요" />
                </label>
                <p className="rounded-lg bg-sand px-3 py-2 leading-relaxed" data-testid="trace-shape">
                  {draft.outline.length === 4 ? (
                    <>
                      <b>직사각형</b>으로 만들어요. 출입문 벽이 앞벽이 돼요.{" "}
                      {roomOk && roomOk.shape === "rect" && !entranceSupport(roomOk).supported ? `출입문 위치가 ${ENTRANCE_RANGE_TEXT}를 벗어나 자동 배치 없이 빈 공간에서 시작해요.` : "자동 배치에서 시작할 수 있어요."}
                    </>
                  ) : (
                    <>
                      <b>꺾인 공간(벽 {draft.outline.length}개)</b>으로 만들어요. 직사각형으로 바꾸지 않아요. {POLYGON_RANGE_TEXT}이라 자동 배치 없이 빈 공간에서 가구를 직접 놓아요.
                    </>
                  )}
                </p>
                {errors.length > 0 && (
                  <ul className="space-y-0.5 rounded-lg bg-warn-soft px-3 py-2 text-warn" data-testid="trace-errors">
                    {errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </aside>
        </div>
      )}

      {step === 4 && (
        <section className="space-y-4 border-t border-line pt-5">
          <NeedsFields mode={mode} initialNeeds={initialNeeds} title={title} note={draft && draft.outline.length !== 4 ? "꺾인 공간은 자동 배치 없이 빈 공간에서 시작해요. 좌석 수는 검사(업무석 수)에 써요." : undefined} />
          {mode === "edit" && <p className="rounded-xl bg-warn-soft px-4 py-3 text-xs leading-relaxed text-warn">공간 모양이나 조건을 바꾸면 배치를 새 조건에서 다시 시작해요. 지금까지 저장한 버전은 그대로 남아요.</p>}
        </section>
      )}

      {state.error && (
        <p role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-danger" data-testid="trace-error">
          {state.error}
        </p>
      )}
      {step === 0 && msg?.error && (
        <p role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-danger" data-testid="trace-msg">
          {msg.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {step > 0 && (
          <button type="button" className="btn" onClick={() => setStep((s) => s - 1)}>
            이전
          </button>
        )}
        {step < 4 ? (
          <button key="next" type="button" className="btn btn-primary" data-testid="trace-next" onClick={next} disabled={step === 0 && !img}>
            다음
          </button>
        ) : (
          <button key="submit" type="submit" className="btn btn-primary" disabled={pending} data-testid="trace-submit">
            {pending ? "만드는 중…" : mode === "new" ? "내 공간 만들기" : "새 버전으로 만들기"}
          </button>
        )}
        {cancel}
      </div>
    </form>
  );
}
