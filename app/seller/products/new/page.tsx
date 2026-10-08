import ProductEditor from "@/components/seller/ProductEditor";
import SellerTabs from "@/components/seller/SellerTabs";
import { Page, PageTitle } from "@/components/ui";
import { sellerPage } from "@/lib/seller-page";
import { saveProduct } from "@/lib/shop-actions";

export const metadata = { title: "상품 등록" };

export default async function NewProduct() {
  const { seller } = await sellerPage();
  return (
    <Page>
      <PageTitle title="상품 등록" />
      <SellerTabs />
      <ProductEditor
        action={saveProduct.bind(null, null)}
        approved={seller.status === "approved"}
        images={[]}
        skus={[]}
        product={{ title: "", category: "", brand: "", description: "", price: null, list_price: null, option1_name: "", option2_name: "", width_mm: null, depth_mm: null, height_mm: null, color: "", model_file_id: null, status: "draft" }}
      />
    </Page>
  );
}
