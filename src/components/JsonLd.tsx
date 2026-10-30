import { indexingAllowed } from "@/lib/indexing";
import { productJsonLd, serializeJsonLd } from "@/lib/json-ld";
import { ogImagePath } from "@/lib/og-image";
import { siteUrl } from "@/lib/site-url";
import type { Site } from "./blocks";

/**
 * The page's structured data, only while indexing is allowed (SITE_INDEXABLE=1): a noindex site publishes none. Built from the product's own data
 * (src/lib/json-ld.ts); a product type without a schemaType gets none either.
 */
export function JsonLd({ site }: { site: Site }) {
  if (!indexingAllowed()) return null;
  const { product, seller, lang, typeFields, ref } = site;
  const data = productJsonLd({
    type: typeFields,
    lang,
    title: product.title,
    tagline: product.tagline,
    price: product.price,
    sellerName: seller.displayName,
    origin: siteUrl()?.origin ?? null,
    imagePath: ogImagePath(ref),
  });
  if (!data) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
