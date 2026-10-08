import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Empty, Notice, Page } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { getVersion } from "@/lib/data";
import { getVisibleProduct, productDims } from "@/lib/shop";
import { placeableTemplates } from "@/lib/shop-place";

export const metadata = { title: "내 공간에 놓아 보기" };

/** 상품을 놓을 내 공간 고르기: 사무실 공간·집 전체 평면·방 한 칸. 고르면 그 편집 화면에서 빈자리에 놓인다. */
export default async function PlaceProduct({ params, searchParams }: { params: Promise<{ productId: string }>; searchParams: Promise<{ project?: string; sku?: string }> }) {
  const pid = Number((await params).productId);
  const q = await searchParams;
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/place/${pid}`)}`);
  if (user.role !== "customer") redirect(`/shop/products/${pid}`);
  const product = getVisibleProduct(pid);
  if (!product || !productDims(product)) notFound();
  const templates = placeableTemplates(500).filter((t) => t.product?.id === pid);
  const pick = templates.find((t) => t.product?.skuId === Number(q.sku)) ?? templates[0];
  if (!pick) notFound();
  const add = encodeURIComponent(pick.type);
  const projects = all<{ id: number; title: string; kind: string; current_version_id: number | null; status: string }>(
    `SELECT id, title, kind, current_version_id, status FROM projects WHERE customer_id = ? AND status NOT IN ('contracted','closed') ORDER BY (id = ?) DESC, updated_at DESC`,
    user.id,
    Number(q.project) || 0,
  );
  const targets = projects.flatMap((p) => {
    const v = getVersion(p.current_version_id);
    if (!v) return [];
    const out: { href: string; title: string; sub: string }[] = [];
    if (v.room && v.placement) out.push({ href: `/projects/${p.id}/editor?add=${add}`, title: p.title, sub: "사무실 공간 배치" });
    if (v.house) out.push({ href: `/projects/${p.id}/house/edit?add=${add}`, title: p.title, sub: "집 전체 평면" });
    for (const r of v.rooms) out.push({ href: `/projects/${p.id}/rooms/${r.id}?add=${add}`, title: `${p.title} · ${r.name}`, sub: "방 한 칸 배치" });
    return out;
  });
  return (
    <Page narrow>
      <Link href={`/shop/products/${pid}`} className="text-sm text-muted">← 상품으로</Link>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">내 공간에 놓아 보기</h1>
      <div className="mt-4 flex gap-3 rounded-2xl border border-line bg-white p-3">
        {product.cover && <img src={`/files/${product.cover}`} alt="" className="size-16 shrink-0 rounded-xl object-cover" />}
        <div className="min-w-0 text-sm">
          <b className="block truncate">{product.title}</b>
          <span className="text-xs text-muted">가로×깊이×높이 {pick.desc}</span>
          <span className="mt-0.5 block text-xs text-brand">{product.model_file_id ? "판매자 3D 모델로 보여요" : "3D 모델이 없어 같은 크기의 상자로 보여요"}</span>
        </div>
      </div>
      {templates.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          {templates.map((t) => (
            <Link key={t.type} href={`/place/${pid}?sku=${t.product?.skuId}${q.project ? `&project=${q.project}` : ""}`} className={`filter-chip !min-h-8 ${t.type === pick.type ? "active" : ""}`}>{t.product?.option || "기본"} · {t.desc.split(" · ")[0]}</Link>
          ))}
        </div>
      )}
      <h2 className="mt-6 text-lg font-bold">어디에 놓을까요?</h2>
      {targets.length === 0 ? (
        <Empty>
          아직 가구를 놓을 수 있는 내 공간이 없어요.
          <span className="mt-3 flex flex-wrap justify-center gap-2">
            <Link href="/homes/new" className="btn btn-sm btn-primary">집 만들기</Link>
            <Link href="/spaces/new" className="btn btn-sm">사무실 공간 만들기</Link>
          </span>
        </Empty>
      ) : (
        <ul className="mt-3 space-y-2" data-testid="place-targets">
          {targets.map((t) => (
            <li key={t.href}>
              <Link href={t.href} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4 text-sm hover:border-brand">
                <span className="min-w-0"><b className="block truncate">{t.title}</b><span className="text-xs text-muted">{t.sub}</span></span>
                <span className="btn btn-sm shrink-0">여기에 놓기</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6"><Notice>놓은 상품은 저장해야 배치에 남아요. 판매자가 입력한 규격으로 놓이며, 실제 들여놓기 전 현장 치수와 문 폭을 꼭 확인해 주세요.</Notice></div>
    </Page>
  );
}
