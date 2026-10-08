"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import type { FormState } from "@/lib/actions";
import { CATEGORIES } from "@/lib/shop-constants";
import { Field } from "../forms";

type Action = (state: FormState, fd: FormData) => Promise<FormState>;

export interface EditorProduct {
  title: string;
  category: string;
  brand: string;
  description: string;
  price: number | null;
  list_price: number | null;
  option1_name: string;
  option2_name: string;
  width_mm: number | null;
  depth_mm: number | null;
  height_mm: number | null;
  color: string;
  model_file_id: number | null;
  status: string;
}
export interface EditorSku {
  opt1: string;
  opt2: string;
  add_price: number;
  stock: number;
  active: boolean;
  width_mm: number | null;
  depth_mm: number | null;
  height_mm: number | null;
}

const split = (t: string) => [...new Set(t.split(",").map((x) => x.trim()).filter(Boolean))].slice(0, 20);

/** 상품 등록·수정: 기본 정보, 사진, 옵션 조합별 가격·재고, 규격·3D 모델 */
export default function ProductEditor({ action, product, skus, images, approved }: { action: Action; product: EditorProduct; skus: EditorSku[]; images: number[]; approved: boolean }) {
  const [state, dispatch, pending] = useActionState(action, {});
  const [o1, setO1] = useState(product.option1_name);
  const [o2, setO2] = useState(product.option2_name);
  // 옵션 값은 판매 중인 조합에서 읽는다(판매 중지한 조합도 같은 값이면 표에 다시 보인다).
  const live = skus.some((s) => s.active) ? skus.filter((s) => s.active) : skus;
  const [v1, setV1] = useState([...new Set(live.map((s) => s.opt1).filter(Boolean))].join(", "));
  const [v2, setV2] = useState([...new Set(live.map((s) => s.opt2).filter(Boolean))].join(", "));
  const [rows, setRows] = useState<EditorSku[]>(skus.length ? skus : [{ opt1: "", opt2: "", add_price: 0, stock: 0, active: true, width_mm: null, depth_mm: null, height_mm: null }]);
  const [removed, setRemoved] = useState<number[]>([]);
  // 옵션 이름·값이 바뀌면 조합 표를 다시 만든다. 이미 있던 조합의 값은 그대로 둔다.
  const combos = useMemo(() => {
    const a = o1 ? split(v1) : [""];
    const b = o1 && o2 ? split(v2) : [""];
    return a.flatMap((x) => b.map((y) => [x, y] as const));
  }, [o1, o2, v1, v2]);
  const table = combos.map(([x, y]) => rows.find((r) => r.opt1 === x && r.opt2 === y) ?? { opt1: x, opt2: y, add_price: 0, stock: 0, active: true, width_mm: null, depth_mm: null, height_mm: null });
  const patch = (x: string, y: string, p: Partial<EditorSku>) =>
    setRows((rs) => {
      const hit = rs.find((r) => r.opt1 === x && r.opt2 === y);
      return hit ? rs.map((r) => (r === hit ? { ...r, ...p } : r)) : [...rs, { opt1: x, opt2: y, add_price: 0, stock: 0, active: true, width_mm: null, depth_mm: null, height_mm: null, ...p }];
    });
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  return (
    <form
      className="space-y-6"
      data-testid="product-editor"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        fd.set("skus", JSON.stringify(table));
        startTransition(() => dispatch(fd));
      }}
    >
      <section className="card space-y-3">
        <h2 className="h-section">기본 정보</h2>
        <Field label="상품명"><input className="input" name="title" defaultValue={product.title} maxLength={80} required /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="카테고리">
            <select className="input" name="category" defaultValue={product.category} required>
              <option value="" disabled>골라 주세요</option>
              {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="판매가(원)"><input className="input" name="price" inputMode="numeric" defaultValue={product.price ?? ""} required /></Field>
          <Field label="정가(원, 할인 표시용)" hint="비우면 할인 표시 없음"><input className="input" name="list_price" inputMode="numeric" defaultValue={product.list_price ?? ""} /></Field>
        </div>
        <Field label="브랜드"><input className="input" name="brand" defaultValue={product.brand} maxLength={40} /></Field>
        <Field label="상품 설명"><textarea className="input min-h-32" name="description" defaultValue={product.description} maxLength={4000} /></Field>
      </section>

      <section className="card space-y-3">
        <h2 className="h-section">사진</h2>
        {images.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {images.map((id) => (
              <li key={id} className={`relative ${removed.includes(id) ? "opacity-30" : ""}`}>
                <img src={`/files/${id}`} alt="" className="size-20 rounded-lg object-cover" />
                <label className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 rounded-b-lg bg-white/90 py-0.5 text-[11px]">
                  <input type="checkbox" name="removeImage" value={id} onChange={(e) => setRemoved((r) => (e.target.checked ? [...r, id] : r.filter((x) => x !== id)))} /> 빼기
                </label>
              </li>
            ))}
          </ul>
        )}
        <input className="input" type="file" name="images" accept=".jpg,.jpeg,.png,.webp" multiple data-testid="product-images" />
        <p className="text-xs text-muted">jpg·png·webp, 한 장 10MB 이하, 모두 10장까지. 첫 사진이 대표 사진이에요.</p>
      </section>

      <section className="card space-y-3">
        <h2 className="h-section">옵션·가격·재고</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="옵션 1 이름" hint="예: 색상, 크기. 옵션이 없으면 비워 두세요."><input className="input" name="option1_name" value={o1} onChange={(e) => setO1(e.target.value)} maxLength={20} data-testid="opt1-name" /></Field>
          {o1 && <Field label={`${o1} 값(쉼표로 구분)`}><input className="input" value={v1} onChange={(e) => setV1(e.target.value)} placeholder="예: 화이트, 오크" data-testid="opt1-values" /></Field>}
          {o1 && <Field label="옵션 2 이름(선택)"><input className="input" name="option2_name" value={o2} onChange={(e) => setO2(e.target.value)} maxLength={20} /></Field>}
          {o1 && o2 && <Field label={`${o2} 값(쉼표로 구분)`}><input className="input" value={v2} onChange={(e) => setV2(e.target.value)} /></Field>}
        </div>
        <div className="overflow-x-auto">
          <table className="table-base min-w-[640px]" data-testid="sku-table">
            <thead>
              <tr><th>{o1 ? "옵션" : "상품"}</th><th>추가 금액(원)</th><th>재고</th><th>규격 따로(가로×깊이×높이 mm, 선택)</th><th>판매</th></tr>
            </thead>
            <tbody>
              {table.map((r) => (
                <tr key={`${r.opt1}|${r.opt2}`}>
                  <td className="whitespace-nowrap">{[r.opt1, r.opt2].filter(Boolean).join(" / ") || "단일 상품"}</td>
                  <td><input className="input !min-h-9 w-28" inputMode="numeric" value={r.add_price} onChange={(e) => patch(r.opt1, r.opt2, { add_price: Number(e.target.value.replace(/[^\d-]/g, "")) || 0 })} aria-label="추가 금액" /></td>
                  <td><input className="input !min-h-9 w-20" inputMode="numeric" value={r.stock} onChange={(e) => patch(r.opt1, r.opt2, { stock: Number(e.target.value.replace(/\D/g, "")) || 0 })} aria-label="재고" data-testid="sku-stock" /></td>
                  <td>
                    <span className="flex gap-1">
                      {(["width_mm", "depth_mm", "height_mm"] as const).map((k) => (
                        <input key={k} className="input !min-h-9 w-20" inputMode="numeric" value={r[k] ?? ""} onChange={(e) => patch(r.opt1, r.opt2, { [k]: num(e.target.value) })} aria-label={k} />
                      ))}
                    </span>
                  </td>
                  <td><input type="checkbox" className="size-4 accent-brand" checked={r.active} onChange={(e) => patch(r.opt1, r.opt2, { active: e.target.checked })} aria-label="판매" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">가격 = 판매가 + 추가 금액. 재고가 0이면 품절로 보여요. 빠진 조합은 판매 중지로 남겨 지난 주문 기록을 지켜요.</p>
      </section>

      <section className="card space-y-3">
        <h2 className="h-section">규격과 3D(내 공간에 놓기)</h2>
        <p className="text-xs leading-relaxed text-muted">가로·깊이·높이를 모두 넣으면 고객이 내 공간에 실제 크기로 놓아 볼 수 있어요. 3D 모델(GLB)을 올리면 그 모양으로, 없으면 같은 크기의 상자로 보여요. 모델이 없어도 사진으로 판매할 수 있어요.</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="가로(mm)"><input className="input" name="width_mm" inputMode="numeric" defaultValue={product.width_mm ?? ""} data-testid="dim-w" /></Field>
          <Field label="깊이(mm)"><input className="input" name="depth_mm" inputMode="numeric" defaultValue={product.depth_mm ?? ""} data-testid="dim-d" /></Field>
          <Field label="높이(mm)"><input className="input" name="height_mm" inputMode="numeric" defaultValue={product.height_mm ?? ""} data-testid="dim-h" /></Field>
          <Field label="상자 색"><input className="input !p-1" type="color" name="color" defaultValue={product.color || "#c8b8a2"} /></Field>
        </div>
        <Field label="3D 모델(GLB, 15MB 이하)" hint={product.model_file_id ? "올린 모델이 있어요. 새로 올리면 바뀌어요." : "모델은 상품 규격 크기에 맞춰 늘이거나 줄여 보여요."}>
          <input className="input" type="file" name="model" accept=".glb" />
        </Field>
        {product.model_file_id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="removeModel" className="size-4" /> 3D 모델 빼기</label>}
      </section>

      {state.error && <p role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state.ok && <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand" data-testid="product-ok">{state.ok}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" name="intent" value="publish" disabled={pending || !approved} data-testid="product-publish">{product.status === "on_sale" ? "저장(판매 중)" : "판매 시작"}</button>
        <button className="btn" name="intent" value="save" disabled={pending} data-testid="product-save">{product.status === "on_sale" ? "판매 상태 그대로 저장" : "임시 저장"}</button>
        {product.status === "on_sale" && <button className="btn" name="intent" value="pause" disabled={pending}>판매 중지</button>}
        {!approved && <span className="text-xs text-warn">판매자 승인 뒤 판매를 시작할 수 있어요. 지금은 임시 저장만 돼요.</span>}
      </div>
    </form>
  );
}
