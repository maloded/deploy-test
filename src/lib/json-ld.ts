import { pick } from "./i18n";
import type { Language } from "./languages";
import type { ProductTypeFields } from "./fields";

type Price = { amount: number; currency: string; per?: string };

/** schema.org unit codes of the price periods a product can have (UN/CEFACT common codes). */
const PER_UNIT: Record<string, string> = { month: "MON", week: "WEE", year: "ANN" };

/**
 * The structured data (JSON-LD) of one product page, only from what the content holds: name, description (the tagline), price and currency, the
 * seller's name, and the page and photo URLs when the site's origin is known. Nothing else is claimed: no brand or model (the data has none), no
 * mileage, availability, VIN, rating, warranty or VAT. null when the product type names no schemaType (no guessed type).
 */
export function productJsonLd({
  type,
  lang,
  title,
  tagline,
  price,
  sellerName,
  origin,
  imagePath,
}: {
  type: Pick<ProductTypeFields, "schemaType">;
  lang: Language;
  title: Parameters<typeof pick>[0];
  tagline: Parameters<typeof pick>[0];
  price: Price;
  sellerName: string;
  origin: string | null;
  imagePath: string | null;
}): Record<string, unknown> | null {
  if (!type.schemaType) return null;
  const url = origin ? `${origin}/${lang}` : null;
  const seller = { "@type": "Organization", name: sellerName };
  const unit = price.per ? PER_UNIT[price.per] : undefined;
  const offer = {
    "@type": "Offer",
    ...(unit
      ? { priceSpecification: { "@type": "UnitPriceSpecification", price: price.amount, priceCurrency: price.currency, unitCode: unit } }
      : { price: price.amount, priceCurrency: price.currency }),
    ...(url ? { url } : {}),
    seller,
  };
  return {
    "@context": "https://schema.org",
    "@type": type.schemaType,
    name: pick(title, lang),
    description: pick(tagline, lang),
    inLanguage: lang,
    ...(url ? { url } : {}),
    ...(origin && imagePath ? { image: `${origin}${imagePath}` } : {}),
    offers: offer,
  };
}

/** JSON for inside a <script type="application/ld+json">: nothing in it can close the tag or start markup (< > & and the line separators are escaped). */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
