/* eslint-disable @typescript-eslint/no-explicit-any -- tests edit arbitrary parts of a JSON object */
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it } from "vitest";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ContentError, loadProduct } from "@/lib/content";
import { sellerShape, SELLER_FIELDS, sellerSchema, validateSeller } from "@/lib/seller";
import { ui, UI_KEYS } from "@/lib/ui-strings";
import { validateProduct } from "@/lib/validate";
import { examples, fixtures } from "./helpers";

const tmp = path.join(process.cwd(), ".test-tmp", "seller");
fs.rmSync(tmp, { recursive: true, force: true });
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const seller = (): Record<string, any> => fixtures.sellerJson();
const issues = (raw: unknown) => {
  const r = validateSeller(raw);
  return r.ok ? [] : r.issues;
};
const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("seller.json", () => {
  it("the fixture and the example sellers are valid", () => {
    expect(issues(fixtures.sellerJson())).toEqual([]);
    expect(issues(examples.sellerJson())).toEqual([]);
  });

  it("requires schemaVersion, displayName, contact, languages, defaultLanguage, theme and consentText", () => {
    for (const key of ["schemaVersion", "displayName", "contact", "languages", "defaultLanguage", "theme", "consentText"]) {
      const s = seller();
      delete s[key];
      expect(issues(s).join("\n"), key).toMatch(new RegExp(`^${key}:`, "m"));
    }
  });

  it("legalName, legalNote, privacyUrl, imprintUrl, phone and website are optional", () => {
    const s = seller();
    for (const key of ["legalName", "legalNote", "privacyUrl", "imprintUrl"]) delete s[key];
    delete s.contact.phone;
    delete s.contact.website;
    expect(issues(s)).toEqual([]);
    expect(issues({ ...s, legalName: { en: "X GmbH", de: "X GmbH" }, legalNote: { en: "Note" }, privacyUrl: "/privacy", imprintUrl: "https://example.invalid/imprint", contact: { ...s.contact, phone: "+43 1 000", website: "https://example.invalid" } })).toEqual([]);
  });

  it("the default language is not implied: it must be given, and it must be one of the languages", () => {
    const s = seller();
    s.languages = ["en", "de"];
    s.defaultLanguage = "de";
    expect(issues(s)).toEqual([]);
    s.defaultLanguage = "xx";
    expect(issues(s).join("\n")).toMatch(/^defaultLanguage: unsupported language "xx"/m);
    s.languages = ["en"];
    s.defaultLanguage = "de"; // a supported language, but not one the seller offers
    expect(issues(s).join("\n")).toMatch(/^defaultLanguage: must be one of languages \(en\)/m);
  });

  it("rejects an empty or repeated language list, a bad email, an unknown field and a bad link", () => {
    expect(issues({ ...seller(), languages: [] }).join("\n")).toMatch(/^languages:/m);
    expect(issues({ ...seller(), languages: ["en", "en"], defaultLanguage: "en" }).join("\n")).toMatch(/each language may appear only once/);
    expect(issues({ ...seller(), contact: { email: "not-an-email" } }).join("\n")).toMatch(/^contact\.email:/m);
    expect(issues({ ...seller(), brand: "x" }).join("\n")).toMatch(/brand/);
    expect(issues({ ...seller(), privacyUrl: "javascript:alert(1)" }).join("\n")).toMatch(/^privacyUrl:/m);
    expect(issues({ ...seller(), displayName: "x".repeat(41) }).join("\n")).toMatch(/^displayName:/m);
  });

  it("the consent text is per language; the default language is checked by the loader, not here", () => {
    expect(issues({ ...seller(), consentText: {} }).join("\n")).toMatch(/^consentText: needs a text/m);
    expect(issues({ ...seller(), consentText: { de: "nur deutsch" } })).toEqual([]);
  });

  it("has a descriptor for every field of the schema, and only those", () => {
    expect(SELLER_FIELDS.map((f) => f.key).sort()).toEqual(Object.keys(sellerShape).sort());
    for (const f of SELLER_FIELDS) expect(sellerShape[f.key].isOptional(), f.key).toBe(!f.required);
    expect(sellerSchema.shape).toBeDefined();
  });
});

describe("product.json no longer holds seller data", () => {
  it.each(["brand", "contact", "languages"])("rejects %s and points to the seller's seller.json", (field) => {
    const p = fixtures.sampleJson("fixture-car");
    p[field] = field === "languages" ? ["en"] : field === "contact" ? { email: "a@b.co" } : "Name";
    const r = validateProduct(p);
    expect(!r.ok && r.issues.join("\n")).toMatch(new RegExp(`^${field}: moved to the seller's seller\\.json \\(run scripts/migrate-content\\.mjs\\)`, "m"));
  });

  it("keeps theme as an optional override", () => {
    const p = fixtures.sampleJson("fixture-car");
    delete p.theme;
    expect(validateProduct(p).ok).toBe(true);
    p.theme = "dark-premium";
    expect(validateProduct(p).ok).toBe(true);
  });
});

describe("the merged product", () => {
  it("takes languages, defaultLanguage and contact from the seller, and the theme from the seller unless the product has one", () => {
    const { product, seller: s } = fixtures.loadFor("fixture-car");
    expect(product.languages).toEqual(s.languages);
    expect(product.defaultLanguage).toBe(s.defaultLanguage);
    expect(product.contact).toEqual(s.contact);
    expect(product.theme).toBe(s.theme);
    const watch = examples.loadFor("example-watch");
    expect(watch.product.theme).toBe("dark-premium"); // its own override
    expect(watch.seller.theme).toBe("light-editorial");
    expect(examples.loadFor("example-house").product.theme).toBe("light-editorial");
  });

  it("addresses media by <seller>/<product>", () => {
    const { ref, images } = fixtures.loadFor("fixture-car");
    expect(ref).toBe(fixtures.ref("fixture-car"));
    expect(images["hero.jpg"].src).toBe(`/media/${ref}/hero.jpg`);
  });

  it("names the seller.json when it is missing or invalid", () => {
    const dir = path.join(tmp, "broken");
    fs.mkdirSync(path.join(dir, "s", "p"), { recursive: true });
    fs.copyFileSync(path.join(fixtures.productDir("fixture-car"), "product.json"), path.join(dir, "s", "p", "product.json"));
    expect(() => loadProduct("s/p", { contentDir: dir })).toThrow(/Cannot load s\/seller\.json[\s\S]*file not found/);
    fs.writeFileSync(path.join(dir, "s", "seller.json"), JSON.stringify({ schemaVersion: 1 }));
    try {
      loadProduct("s/p", { contentDir: dir });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ContentError);
      expect((e as ContentError).message).toMatch(/s\/seller\.json/);
      expect((e as ContentError).issues.join("\n")).toMatch(/displayName/);
    }
  });
});

describe("header and footer read the seller", () => {
  const site = fixtures.siteFor("fixture-car");

  it("shows seller.displayName in the header and the footer", () => {
    expect(html(<Header site={site} />)).toContain(`>${site.seller.displayName}<`);
    expect(html(<Footer site={site} />)).toContain(`<p class="site-footer__name">${site.seller.displayName}</p>`);
  });

  it("shows seller.legalNote in the page language, and no legal line without it", () => {
    expect(html(<Footer site={site} />)).toContain(`<p class="site-footer__legal">${site.seller.legalNote!.en}</p>`);
    const de = { ...site, lang: "de" as const };
    expect(html(<Footer site={de} />)).toContain(`<p class="site-footer__legal">${site.seller.legalNote!.de ?? site.seller.legalNote!.en}</p>`);
    const none = { ...site, seller: { ...site.seller, legalNote: undefined } };
    expect(html(<Footer site={none} />)).not.toContain("site-footer__legal");
  });

  it("links the privacy page only when the seller has set one (no placeholder anchor)", () => {
    expect(html(<Footer site={site} />)).not.toContain("#privacy");
    const own = { ...site, seller: { ...site.seller, privacyUrl: "/datenschutz" } };
    expect(html(<Footer site={own} />)).toContain('href="/datenschutz"');
  });

  it("shows the seller's e-mail address", () => {
    expect(html(<Footer site={site} />)).toContain(`href="mailto:${site.seller.contact.email}"`);
  });

  it("keeps no seller text in the UI strings", () => {
    expect(UI_KEYS).not.toContain("footer.legal");
    expect(() => ui("footer.contact", "en")).not.toThrow(); // the labels around the seller's data stay UI strings
  });
});
