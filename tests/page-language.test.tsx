// @vitest-environment node
import fs from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Faq } from "@/components/Faq";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Specs } from "@/components/Specs";
import { Hero } from "@/components/Hero";
import { formatFieldValue, formatPrice } from "@/lib/i18n";
import { localeOf } from "@/lib/languages";
import { buildSite } from "@/lib/site";
import { ui } from "@/lib/ui-strings";
import { loadLayout } from "@/product-types/layouts";
import { FIXTURE_DIR, fixtures } from "./helpers";

const ref = `${fixtures.seller}/fixture-car`;
const site = (lang?: "de" | "en") => buildSite(null, ref, FIXTURE_DIR, lang);
const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("the page language comes from the route (site.lang)", () => {
  it("defaults to the seller's default language and rejects one the seller does not offer", () => {
    expect(site().lang).toBe(site().product.defaultLanguage);
    expect(site("de").lang).toBe("de");
    expect(() => buildSite(null, ref, FIXTURE_DIR, "fr" as never)).toThrow(/does not offer "fr"/);
  });

  it("the same product renders in the route's language, not in the default language", () => {
    const [de, en] = [site("de"), site("en")];
    expect(html(<Header site={de} />)).toContain(ui("header.cta", "de"));
    expect(html(<Header site={en} />)).toContain(ui("header.cta", "en"));
    expect(html(<Footer site={de} />)).toContain(ui("footer.contact", "de"));
    expect(html(<Footer site={de} />)).toContain(de.seller.legalNote!.de);
    expect(html(<Hero site={de} />)).toContain(de.product.title.de!.split(" (")[0]);
    expect(html(<Specs site={de} />)).toContain(de.product.specs[0].label.de!);
    expect(html(<Faq site={de} />)).toContain(de.product.faq[0].q.de!);
    expect(html(<Faq site={en} />)).toContain(en.product.faq[0].q.en!);
  });

  it("the page root carries data-lang, and the layout stays one document per language", async () => {
    for (const lang of ["de", "en"] as const) {
      const s = site(lang);
      const Layout = await loadLayout(s.product.productType);
      const out = html(<Layout site={s} />);
      expect(out).toContain(`data-lang="${lang}"`);
      expect(out).toContain(`id="specs"`);
    }
  });

  it("a text with no translation shows the default language's text (the loader completed it)", () => {
    const s = site("de");
    expect(s.product.faq[0].a.de).toBe(s.product.faq[0].a.en); // the fixture answer exists in English only
    expect(html(<Faq site={s} />)).toContain(s.product.faq[0].a.en!);
  });
});

describe("numbers, prices and dates use Intl with the registry locale", () => {
  it("formats a price per language", () => {
    expect(formatPrice(53900, "EUR", undefined, "de")).toBe(new Intl.NumberFormat(localeOf("de"), { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(53900));
    expect(formatPrice(53900, "EUR", undefined, "de")).toMatch(/^53\.900\s€$/);
    expect(formatPrice(53900, "EUR", undefined, "en")).toBe("€53,900");
    expect(formatPrice(589, "EUR", "month", "de")).toMatch(/^589\s€ \/ Monat$/);
  });

  it("formats numbers with units, booleans and dates per language", () => {
    const num = { key: "k", type: "number", unit: "km", required: false, label: { en: "x", de: "x" } } as const;
    expect(formatFieldValue(num, 12345.5, "de", "EUR")).toBe("12.345,5 km");
    expect(formatFieldValue(num, 12345.5, "en", "EUR")).toBe("12,345.5 km");
    const months = { ...num, unit: "months" } as const;
    expect(formatFieldValue(months, 24, "de", "EUR")).toBe("24 Monate");
    expect(formatFieldValue(months, 24, "en", "EUR")).toBe("24 months");
    const date = { key: "d", type: "date", required: false, label: { en: "x", de: "x" } } as const;
    expect(formatFieldValue(date, "2026-03-09", "de", "EUR")).toBe(new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "UTC" }).format(new Date("2026-03-09T00:00:00Z")));
    expect(formatFieldValue(date, "2026-03-09", "de", "EUR")).not.toBe(formatFieldValue(date, "2026-03-09", "en", "EUR"));
    const yes = { key: "b", type: "boolean", required: false, label: { en: "x", de: "x" } } as const;
    expect([formatFieldValue(yes, true, "de", "EUR"), formatFieldValue(yes, false, "en", "EUR")]).toEqual(["Ja", "No"]);
  });

  it("no component calls Intl with a bare language code", () => {
    const files = ["src/lib/i18n.ts", ...fs.readdirSync("src/components").filter((f) => /\.tsx?$/.test(f)).map((f) => `src/components/${f}`)];
    for (const f of files) expect(fs.readFileSync(f, "utf8"), f).not.toMatch(/Intl\.\w+\(\s*lang\b/);
  });
});

describe("anchors and deep links do not depend on the path", () => {
  it("the gallery deep link reads only the hash, so /<lang>#gallery-3 works", () => {
    const src = fs.readFileSync("src/components/Gallery.tsx", "utf8");
    expect(src).toContain("window.location.hash");
    expect(src).not.toMatch(/location\.pathname|router\./);
  });

  it("buttons and anchors are bare #fragments (they stay on the current /<lang> page); only the switcher links to /<lang>", () => {
    const out = html(<Header site={site("de")} />) + html(<Hero site={site("de")} />);
    const hrefs = [...out.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const h of hrefs) expect(h.startsWith("#") || /^\/(de|en)$/.test(h), h).toBe(true);
    expect(hrefs.filter((h) => !h.startsWith("#")).sort()).toEqual(["/de", "/en"]);
  });
});
