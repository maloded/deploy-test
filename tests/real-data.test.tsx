// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- tests edit arbitrary parts of a JSON object */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { Offer } from "@/components/offer/Offer";
import { Specs } from "@/components/Specs";
import { formatPrice } from "@/lib/i18n";
import { loadProduct } from "@/lib/content";
import { validateProduct } from "@/lib/validate";
import { productTypes } from "@/product-types";
import { CONTENT_DIR, content, examples, hasRealContent } from "./helpers";

const html = (n: React.ReactElement) => renderToStaticMarkup(n);
const sample = () => content.sampleJson("vw-multivan");
const issues = (p: unknown) => {
  const r = validateProduct(p);
  return r.ok ? [] : r.issues;
};

describe.skipIf(!hasRealContent)("the vw-multivan sample is a sale in German and English", () => {
  it("validates, with German first", () => {
    const p = sample();
    expect(issues(p)).toEqual([]);
    expect(p.offerType).toBe("sale");
    const s = content.sellerJson();
    expect(s.languages).toEqual(["de", "en"]);
    expect(s.defaultLanguage).toBe("de");
    expect(typeof s.displayName).toBe("string"); // the seller's name; the test does not pin which one
    expect(p.brand).toBeUndefined();
  });

  it("has no lease or rent object and no price.per", () => {
    const p = sample();
    expect(p.lease).toBeUndefined();
    expect(p.rent).toBeUndefined();
    expect(p.price.per).toBeUndefined();
    expect(p.price.note).toBeUndefined(); // stays empty until the accountant confirms the VAT statement
    expect(p.price).toEqual({ amount: 53900, currency: "EUR" });
  });

  it("has German and English for every text field", () => {
    const missing: string[] = [];
    const walk = (v: unknown, where: string) => {
      if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}.${i}`));
      else if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        if ("en" in o && typeof o.en === "string") {
          if (typeof o.de !== "string" || !o.de) missing.push(`${where}.de`);
        } else for (const [k, x] of Object.entries(o)) walk(x, `${where}.${k}`);
      }
    };
    walk(sample(), "product");
    expect(missing).toEqual([]);
  });

  it("renders in German: language, price and offer type", () => {
    const site = content.siteFor("vw-multivan");
    expect(formatPrice(53900, "EUR", undefined, "de")).toMatch(/^53\.900\s€$/);
    const hero = html(<Hero site={site} />);
    expect(hero).toMatch(/53\.900\s€/);
    expect(hero).toContain("Wien · Verkauf");
    expect(hero).toContain(">VW Multivan 2.0 TDI</h1>");
    expect(html(<Offer site={site} variant="price" />)).toContain("Verkauf");
    expect(site.product.defaultLanguage).toBe("de");
  });

  it("makes no claim about warranty, VAT, a bank, the absence of damage or a new car, and discloses the 2025 damage event", () => {
    const text = JSON.stringify(sample()).toLowerCase();
    const stems = ["garantie", "warranty", "steuer", "neuwagen", "new car", "unfall", "accident"]; // also match longer words
    const words = ["mwst", "ust", "vat", "bank"]; // short: whole words only ("ust" is inside "Ausstattung")
    for (const bad of stems) expect(text, bad).not.toContain(bad);
    for (const bad of words) expect(new RegExp(`\\b${bad}\\b`).test(text), bad).toBe(false);
    expect(text).toContain("23.06.2025");
    expect(text).toContain("schiebetür ersetzt");
    expect(text).toContain("sliding door replaced");
  });

  it("states that financing, leasing and trade-in are not offered, without a bank name", () => {
    const faq = sample().faq.map((f: any) => f.a.en).join(" ");
    expect(faq).toMatch(/do not offer financing, leasing or the trade-in/);
    expect(faq).toMatch(/free of encumbrance/);
  });

  it("uses the contact placeholder and a draft consent text that mentions #privacy", () => {
    const s = content.sellerJson();
    expect(s.contact.email).toBe("contact@example.invalid");
    for (const lang of ["de", "en"]) expect(s.consentText[lang]).toContain(`${s.displayName} `); // names the seller
    for (const lang of ["de", "en"]) expect(s.consentText[lang]).toContain("#privacy");
  });

  it("shows only the brand in the footer", () => {
    const footer = html(<Footer site={content.siteFor("vw-multivan")} />);
    expect(footer).toContain(`<p class="site-footer__name">${content.sellerJson().displayName}</p>`);
    expect(footer).not.toMatch(/GmbH|UID|ATU|FN \d/);
  });
});

describe.skipIf(!hasRealContent)("mileage lives in one place and matches the odometer photo (37115 km)", () => {
  it("is a spec, shown as ca. 37.100 km, and nowhere else in the data", () => {
    const p = sample();
    const spec = p.specs.find((s: any) => s.key === "mileage");
    expect(spec.value).toEqual({ de: "ca. 37.100 km", en: "approx. 37,100 km" });
    const rest = JSON.stringify({ ...p, specs: p.specs.filter((s: any) => s.key !== "mileage") });
    expect(rest).not.toMatch(/37[.,]?500/); // the owners' figure contradicts the photo and is not published
    expect(rest).not.toMatch(/37[.,]?100/);
  });

  it("reaches the hero through the key", () => {
    const hero = html(<Hero site={content.siteFor("vw-multivan")} />);
    expect(hero).toContain('<span class="hero__fact-value">ca. 37.100 km</span><span class="hero__fact-label">Kilometerstand</span>');
  });
});

describe.skipIf(!hasRealContent)("hero highlights are spec keys", () => {
  it("take value and label from the spec, in the page language", () => {
    const hero = html(<Hero site={content.siteFor("vw-multivan")} />);
    const facts = [...hero.matchAll(/hero__fact-value">([^<]*)<\/span><span class="hero__fact-label">([^<]*)</g)].map((m) => [m[1], m[2]]);
    expect(facts).toEqual([["07/2023", "Erstzulassung"], ["ca. 37.100 km", "Kilometerstand"], ["150 PS", "Leistung"], ["7-Gang-DSG", "Getriebe"]]);
  });

  it("never repeat a value: a changed spec changes the hero", () => {
    const site = content.siteFor("vw-multivan");
    const changed = { ...site, product: structuredClone(site.product) as any };
    changed.product.specs.find((s: any) => s.key === "power").value = { de: "170 PS (125 kW)", en: "170 PS (125 kW)" };
    expect(html(<Hero site={changed} />)).toContain("170 PS");
    expect(html(<Hero site={changed} />)).not.toContain("150 PS");
  });

  it("make a missing key a validation error naming the spec keys", () => {
    const p = sample();
    p.hero.highlights = ["year", "horsepower"];
    expect(issues(p).join("\n")).toMatch(/hero\.highlights\.1: no spec with key "horsepower"\. Spec keys: power, fuel/);
  });
});

describe.skipIf(!hasRealContent)("gallery tags", () => {
  it("come from the car type's closed list, defined in its descriptor only", () => {
    expect(productTypes.car.galleryTags).toEqual(["exterior", "interior", "seats", "dashboard", "controls", "mileage", "trunk", "wheels", "door", "details", "defects"]);
    for (const t of ["house", "watch", "bag", "other"] as const) expect(productTypes[t].galleryTags, t).toEqual([]);
  });

  it("are filled for every photo of the sample and all valid", () => {
    const p = sample();
    expect(p.media.gallery).toHaveLength(12);
    for (const g of p.media.gallery) expect(g.tags?.length, g.file).toBeGreaterThan(0);
    expect(p.media.gallery.find((g: any) => g.file === "mileage.jpg").tags).toEqual(["dashboard", "mileage"]);
  });

  it("are rejected when unknown, with the allowed list", () => {
    const p = sample();
    p.media.gallery[0].tags = ["exterior", "engine bay"];
    expect(issues(p).join("\n")).toMatch(/media\.gallery\.0\.tags: unknown tag "engine bay" for product type "car"\. Allowed tags: exterior, interior, seats/);
  });

  it("are rejected for a product type that has no tag list yet", () => {
    const p = examples.sampleJson("example-watch");
    p.media.gallery = [{ file: "hero.png", alt: { en: "x" }, tags: ["exterior"] }];
    expect(issues(p).join("\n")).toMatch(/media\.gallery\.0\.tags: tags are not defined for product type "watch" yet/);
  });

  it("are optional, and an empty list is not allowed", () => {
    const p = sample();
    delete p.media.gallery[0].tags;
    expect(issues(p)).toEqual([]);
    p.media.gallery[1].tags = [];
    expect(issues(p).join("\n")).toMatch(/media\.gallery\.1\.tags/);
  });
});

describe.skipIf(!hasRealContent)("the car's condition group", () => {
  it("lists the damage event and the mileage under Zustand und Historie", () => {
    const out = html(<Specs site={content.siteFor("vw-multivan")} />);
    expect(out).toContain("Zustand und Historie");
    expect(out).toContain("Schadensereignis");
    expect(out).toContain("23.06.2025: Schiebetür ersetzt");
  });

  it("is a spec group of the car type, after the equipment", () => {
    expect(productTypes.car.specGroups.map((g) => g.id)).toEqual(["engine", "body", "interior", "equipment", "condition"]);
  });
});

describe.skipIf(!hasRealContent)("loading the real sample", () => {
  it("needs only product.json to validate (the photos are checked by the loader)", () => {
    expect(() => loadProduct(content.ref("vw-multivan"), { contentDir: CONTENT_DIR, strictMedia: false })).not.toThrow();
  });
});
