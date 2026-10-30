/* eslint-disable @typescript-eslint/no-explicit-any -- the JSON-LD object is read loosely */
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonLd } from "@/components/JsonLd";
import { productJsonLd, serializeJsonLd } from "@/lib/json-ld";
import { fields as bag } from "@/product-types/bag/fields";
import { fields as base } from "@/product-types/_base/fields";
import { fields as car } from "@/product-types/car/fields";
import { fields as house } from "@/product-types/house/fields";
import { fields as watch } from "@/product-types/watch/fields";
import { examples, fixtures } from "./helpers";

afterEach(() => vi.unstubAllEnvs());

const input = (over: object = {}) => ({
  type: car,
  lang: "en" as const,
  title: { en: "A car", de: "Ein Auto" },
  tagline: { en: "Well kept", de: "Gepflegt" },
  price: { amount: 12900, currency: "EUR" },
  sellerName: "Zorbo",
  origin: "https://www.example.com",
  imagePath: "/media/s/p/og-1200x630.jpg",
  ...over,
});

describe("productJsonLd", () => {
  it("is built only from the product's own data", () => {
    expect(productJsonLd(input())).toEqual({
      "@context": "https://schema.org",
      "@type": "Car",
      name: "A car",
      description: "Well kept",
      inLanguage: "en",
      url: "https://www.example.com/en",
      image: "https://www.example.com/media/s/p/og-1200x630.jpg",
      offers: { "@type": "Offer", price: 12900, priceCurrency: "EUR", url: "https://www.example.com/en", seller: { "@type": "Organization", name: "Zorbo" } },
    });
    expect(productJsonLd(input({ lang: "de" }))).toMatchObject({ name: "Ein Auto", description: "Gepflegt", inLanguage: "de", url: "https://www.example.com/de" });
  });

  it("claims nothing the data does not hold: no brand, model, mileage, availability, VIN, rating, warranty, VAT or logo", () => {
    const text = JSON.stringify(productJsonLd(input()));
    for (const key of ["brand", "model", "mileage", "availability", "vehicleIdentificationNumber", "vin", "aggregateRating", "review", "warranty", "tax", "vat", "logo", "itemCondition", "sku", "gtin"]) {
      expect(text.toLowerCase(), key).not.toContain(`"${key.toLowerCase()}`);
    }
  });

  it("leaves out url and image without the site's origin, and the image without a file", () => {
    const m: any = productJsonLd(input({ origin: null }));
    expect(m).not.toHaveProperty("url");
    expect(m).not.toHaveProperty("image");
    expect(m.offers).not.toHaveProperty("url");
    expect(productJsonLd(input({ imagePath: null }))).not.toHaveProperty("image");
  });

  it("describes a price per period as a unit price (the period is data, never invented)", () => {
    const m: any = productJsonLd(input({ price: { amount: 589, currency: "EUR", per: "month" } }));
    expect(m.offers).not.toHaveProperty("price");
    expect(m.offers.priceSpecification).toEqual({ "@type": "UnitPriceSpecification", price: 589, priceCurrency: "EUR", unitCode: "MON" });
  });

  it("emits nothing for a type that names no schemaType (no guessed type)", () => {
    expect(productJsonLd(input({ type: {} }))).toBeNull();
    expect(productJsonLd(input({ type: { schemaType: undefined } }))).toBeNull();
    expect(productJsonLd(input({ type: { schemaType: "" } }))).toBeNull();
    expect(base).not.toHaveProperty("schemaType"); // "other" products: none
  });

  it("the shipped types name theirs explicitly", () => {
    expect([car.schemaType, house.schemaType, watch.schemaType, bag.schemaType]).toEqual(["Car", "Product", "Product", "Product"]);
  });
});

describe("serializeJsonLd", () => {
  it("cannot close the script tag or start markup, and parses back to the same data", () => {
    const evil = { name: "</script><script>alert(1)</script> & <!-- x --> \u2028 \u2029 > end" };
    const out = serializeJsonLd(evil);
    expect(out).not.toMatch(/<|>|&|\u2028|\u2029/);
    expect(out.toLowerCase()).not.toContain("</script");
    expect(JSON.parse(out)).toEqual(evil);
  });
});

describe("the page's script", () => {
  const site = () => fixtures.siteFor("fixture-car");
  const html = () => renderToStaticMarkup(<JsonLd site={site()} />);
  const scriptJson = (out: string) => JSON.parse(/<script type="application\/ld\+json">([\s\S]*)<\/script>/.exec(out)![1]);

  it("is emitted only when indexing is allowed", () => {
    expect(html()).toBe(""); // the default: noindex, no structured data
    vi.stubEnv("SITE_INDEXABLE", "0");
    expect(html()).toBe("");
    vi.stubEnv("SITE_INDEXABLE", "1");
    vi.stubEnv("SITE_URL", "https://www.example.com");
    const out = html();
    expect(out.match(/<script type="application\/ld\+json">/g)).toHaveLength(1);
    const data = scriptJson(out);
    expect(data["@type"]).toBe("Car");
    expect(data.name).toBeTruthy();
    expect((data.offers.priceSpecification ?? data.offers).price).toBe(site().product.price.amount); // the fixture's price is per month: a unit price
    expect(data.offers.seller.name).toBe(site().seller.displayName);
    expect(data.url).toBe(`https://www.example.com/${site().lang}`);
  });

  it("is not a second script for a product whose type names no schemaType: nothing at all", () => {
    vi.stubEnv("SITE_INDEXABLE", "1");
    vi.stubEnv("SITE_URL", "https://www.example.com");
    const s = site();
    const out = renderToStaticMarkup(<JsonLd site={{ ...s, typeFields: { ...s.typeFields, schemaType: undefined } as any }} />);
    expect(out).toBe("");
  });

  it("escapes hostile product text inside the script", () => {
    vi.stubEnv("SITE_INDEXABLE", "1");
    vi.stubEnv("SITE_URL", "https://www.example.com");
    const s = site();
    const hostile = { ...s, product: { ...s.product, title: { ...s.product.title, en: "</script><img src=x onerror=alert(1)>" }, tagline: { ...s.product.tagline, en: "a & b <b>" } }, lang: "en" as const };
    const out = renderToStaticMarkup(<JsonLd site={hostile as any} />);
    const inner = /<script type="application\/ld\+json">([\s\S]*)<\/script>/.exec(out)![1];
    expect(inner.toLowerCase()).not.toContain("</script");
    expect(inner).not.toMatch(/<|>/);
    expect(JSON.parse(inner).name).toBe("</script><img src=x onerror=alert(1)>");
  });

  it("works for every shipped product type that names one (the examples)", () => {
    vi.stubEnv("SITE_INDEXABLE", "1");
    vi.stubEnv("SITE_URL", "https://www.example.com");
    for (const slug of ["example-house", "example-watch"]) {
      const out = renderToStaticMarkup(<JsonLd site={examples.siteFor(slug)} />);
      expect(scriptJson(out)["@type"], slug).toBe("Product");
    }
  });

  it("the page renders it from [lang]/page.tsx and nowhere else", () => {
    const page = fs.readFileSync(path.join(process.cwd(), "src", "app", "[lang]", "page.tsx"), "utf8");
    expect(page).toContain("<JsonLd site={site} />");
    expect(fs.readFileSync(path.join(process.cwd(), "src", "components", "JsonLd.tsx"), "utf8")).toContain("if (!indexingAllowed()) return null;");
  });
});
