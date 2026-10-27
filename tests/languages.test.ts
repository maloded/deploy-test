// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LANGUAGE_REGISTRY, LANGUAGES, localeOf, unsupportedLanguageMessage } from "@/lib/languages";
import { localizedSchema, languageSchema } from "@/lib/schema";
import { validateSeller } from "@/lib/seller";
import { productTypes } from "@/product-types";
import { offerTypes } from "@/offer-types";
import { UI_KEYS, uiEntry } from "@/lib/ui-strings";
import { REQUEST_TYPES } from "@/lib/request-types";
import { SELLER_FIELDS } from "@/lib/seller";
import type { FieldDescriptor, SpecField, SpecGroup } from "@/lib/fields";
import { sampleJson } from "./helpers";

type L = Record<string, string | undefined>;

describe("the language registry", () => {
  it("lists exactly de and en, with a native name, an Intl locale and font subsets", () => {
    expect(LANGUAGES).toEqual(["de", "en"]);
    expect(LANGUAGE_REGISTRY.map((l) => l.name)).toEqual(["Deutsch", "English"]);
    for (const l of LANGUAGE_REGISTRY) {
      expect(() => new Intl.NumberFormat(l.locale)).not.toThrow();
      expect(Intl.getCanonicalLocales(l.locale)).toHaveLength(1);
      expect(l.fontSubsets.length).toBeGreaterThan(0);
      expect(localeOf(l.code)).toBe(l.locale);
    }
  });

  it("has no leftover entries of removed languages in the UI strings or the descriptors", () => {
    const text = [path.join("src", "lib", "ui-strings.ts"), ...fs.readdirSync("src/product-types").map((d) => path.join("src/product-types", d, "fields.ts")), ...fs.readdirSync("src/offer-types").map((d) => path.join("src/offer-types", d, "index.ts"))]
      .filter((f) => fs.existsSync(f))
      .map((f) => fs.readFileSync(f, "utf8"))
      .join("\n");
    expect(text).not.toMatch(/\b(ru|uk):\s*"/);
  });
});

describe("every registry language is complete", () => {
  const labels = (what: string, l: L | undefined, out: [string, L | undefined][]) => out.push([what, l]);

  it("has UI strings for every key", () => {
    for (const lang of LANGUAGES) for (const key of UI_KEYS) expect((uiEntry(key) as L)[lang], `ui ${key}.${lang}`).toBeTruthy();
  });

  it("has descriptor labels for every product type, offer type and seller field", () => {
    const all: [string, L | undefined][] = [];
    const fieldList = (where: string, fs: readonly FieldDescriptor[]) => fs.forEach((f) => labels(`${where}.${f.key}`, f.label as L, all));
    for (const [id, t] of Object.entries(productTypes)) {
      labels(`productType ${id}`, t.label as L, all);
      (t.specGroups as readonly SpecGroup[]).forEach((g) => labels(`${id} group ${g.id}`, g.label as L, all));
      (t.specFields as readonly SpecField[]).forEach((f) => labels(`${id} spec ${f.key}`, f.label as L, all));
      fieldList(`${id} details`, t.detailsFields as readonly FieldDescriptor[]);
    }
    for (const [id, o] of Object.entries(offerTypes)) {
      labels(`offerType ${id}`, o.label as L, all);
      fieldList(`${id} details`, o.detailsFields as readonly FieldDescriptor[]);
    }
    SELLER_FIELDS.forEach((f) => labels(`seller ${f.key}`, f.label as L, all));
    for (const [id, r] of Object.entries(REQUEST_TYPES)) labels(`request type ${id}`, r.label as L, all);
    expect(all.length).toBeGreaterThan(20);
    for (const lang of LANGUAGES) for (const [what, l] of all) expect(l?.[lang], `${what}.${lang}`).toBeTruthy();
  });

  it("has font files for every subset it needs, in every theme", () => {
    const themes = fs.readdirSync("public/fonts");
    expect(themes.length).toBeGreaterThan(0);
    for (const theme of themes) {
      const files = fs.readdirSync(path.join("public/fonts", theme));
      for (const l of LANGUAGE_REGISTRY) for (const subset of l.fontSubsets) {
        expect(files.some((f) => f.includes(`-${subset}-`) && f.endsWith(".woff2")), `${theme}: ${subset} font for ${l.code}`).toBe(true);
      }
    }
  });
});

describe("a language outside the registry", () => {
  const supported = "Supported languages: de, en";

  it("fails in a localized text with the supported ones listed", () => {
    const r = localizedSchema.safeParse({ en: "x", ru: "y" });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain(supported);
    expect(unsupportedLanguageMessage("ru")).toContain('"ru"');
  });

  it("fails in a language code", () => {
    const r = languageSchema.safeParse("uk");
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toContain(supported);
  });

  it("fails in seller.json (languages and defaultLanguage) with the message", () => {
    const seller = { ...JSON.parse(JSON.stringify(sampleJsonSeller())), languages: ["en", "ru"], defaultLanguage: "ru" };
    const v = validateSeller(seller);
    expect(v.ok).toBe(false);
    const text = v.ok ? "" : v.issues.join("\n");
    expect(text).toMatch(/^languages\.1: unsupported language "ru"\. Supported languages: de, en/m);
    expect(text).toMatch(/^defaultLanguage: unsupported language "ru"/m);
  });

  it("fails in product.json through the loader's validation", () => {
    const product = { ...sampleJson("fixture-car"), title: { en: "T", uk: "T" } };
    expect(JSON.stringify(localizedSchema.safeParse(product.title).error?.issues)).toContain(supported);
  });
});

import { fixtures } from "./helpers";
function sampleJsonSeller() {
  return fixtures.sellerJson();
}
