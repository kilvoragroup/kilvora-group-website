import { ProductPage, productMetadata } from "../_components/product-page";

export const metadata = productMetadata("kilvora-hcm");

export default function Page() {
  return <ProductPage slug="kilvora-hcm" />;
}
