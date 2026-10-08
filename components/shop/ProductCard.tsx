import Link from "next/link";
import { discountRate, type ProductCard as Card } from "@/lib/shop";

/** 상품 카드: 사진 중심. 규격이 있으면 ‘내 공간에 놓기’, 3D 모델이 있으면 ‘3D 모델’ 표시 */
export default function ProductCard({ p, compact = false }: { p: Card; compact?: boolean }) {
  const rate = discountRate(p);
  const placeable = !!(p.width_mm && p.depth_mm && p.height_mm);
  return (
    <li className="product-card min-w-0" data-product={p.id}>
      <Link href={`/shop/products/${p.id}`} className="block">
        <span className="product-media">
          {p.cover ? <img src={`/files/${p.cover}`} alt={p.title} loading="lazy" /> : <span className="grid h-full place-items-center text-xs text-muted">사진 없음</span>}
          {p.is_example ? <span className="product-flag">예시 상품 · 실제 판매 아님</span> : null}
          {placeable && <span className="product-3d">{p.model_file_id ? "3D 모델" : "실제 크기로 놓기"}</span>}
        </span>
        <span className="mt-2.5 block truncate text-xs text-muted">{p.brand || p.seller_name}</span>
        <span className={`product-title ${compact ? "!text-[13px]" : ""}`}>{p.title}</span>
        <span className="mt-1 flex items-baseline gap-1.5">
          {rate > 0 && <b className="text-[15px] text-brand">{rate}%</b>}
          <b className="text-[15px] tabular-nums">{p.min_price.toLocaleString()}원</b>
        </span>
        <span className="mt-1 block text-[11px] text-muted">
          {p.stock <= 0 ? "품절" : p.scraps ? `스크랩 ${p.scraps}` : " "}
        </span>
      </Link>
    </li>
  );
}
