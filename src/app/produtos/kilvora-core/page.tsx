import { ProductPage, productMetadata } from "../_components/product-page";

export const metadata = productMetadata("kilvora-core");

export default function Page() {
  return <ProductPage slug="kilvora-core" />;
}
