// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ContentError, loadProduct } from "@/lib/content";
import { completeLocalized, coverageLine, localizedFields, reportLocalized } from "@/lib/localized";
import { pick } from "@/lib/i18n";
import { languageReport } from "../scripts/lib/language-report.mjs";
import { fixtures } from "./helpers";

const tmp = path.join(process.cwd(), ".test-tmp", "localized");
fs.rmSync(tmp, { recursive: true, force: true });
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
let n = 0;
/** A content root (JSON only; media is not read with strictMedia false) from the fixture seller and product, edited by the test. */
function root(edit: (seller: Json, product: Json) => void) {
  const dir = path.join(tmp, `r${n++}`);
  const seller = fixtures.sellerJson();
  const product = fixtures.sampleJson("fixture-car");
  edit(seller, product);
  fs.mkdirSync(path.join(dir, fixtures.seller, "fixture-car"), { recursive: true });
  fs.writeFileSync(path.join(dir, fixtures.seller, "seller.json"), JSON.stringify(seller));
  fs.writeFileSync(path.join(dir, fixtures.seller, "fixture-car", "product.json"), JSON.stringify(product));
  return dir;
}
const load = (dir: string) => loadProduct(`${fixtures.seller}/fixture-car`, { contentDir: dir, strictMedia: false });

describe("the fallback rule", () => {
  it("every existing fixture product stays valid (its default language is complete)", () => {
    expect(() => fixtures.loadFor("fixture-car", { strictMedia: false })).not.toThrow();
  });

  it("finds localized fields by shape, with their paths", () => {
    const paths = localizedFields({ title: { en: "a" }, faq: [{ q: { en: "q", de: "f" }, a: { de: "x" } }], other: { note: "x" }, n: 1 }).map((f) => f.path);
    expect(paths).toEqual(["title", "faq.0.q", "faq.0.a"]);
  });

  it("a missing translation falls back to the default language, and is a warning, not an error", () => {
    const dir = root((s, p) => {
      delete p.title.de;
      delete p.faq[0].q.de;
    });
    const loaded = load(dir);
    expect(pick(loaded.product.title, "de")).toBe(loaded.product.title.en);
    expect(loaded.translationWarnings).toEqual(expect.arrayContaining([`${loaded.ref}/product.json: title: no "de" text, shows the "en" text`, `${loaded.ref}/product.json: faq.0.q: no "de" text, shows the "en" text`]));
    expect(loaded.translationWarnings.every((w) => w.includes('no "de" text'))).toBe(true);
  });

  it("only the default language is required: any other language may be missing everywhere", () => {
    const dir = root((s, p) => {
      s.languages = ["en", "de"];
      const strip = (v: any): any => (Array.isArray(v) ? v.map(strip) : v && typeof v === "object" ? (Object.keys(v).every((k) => k === "en" || k === "de") && "en" in v ? { en: v.en } : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, strip(x)]))) : v); // eslint-disable-line @typescript-eslint/no-explicit-any
      Object.assign(p, strip(p));
      s.consentText = { en: s.consentText.en };
      delete s.legalNote.de;
    });
    const loaded = load(dir);
    expect(loaded.coverage.find((c) => c.language === "en")!.percent).toBe(100);
    expect(loaded.coverage.find((c) => c.language === "de")!.percent).toBe(0);
    expect(pick(loaded.seller.consentText, "de")).toBe(loaded.seller.consentText.en);
  });

  it("a field without the default language is an error that names its path", () => {
    const dir = root((s, p) => {
      delete p.title.en;
      p.title.de = "nur deutsch";
    });
    expect(() => load(dir)).toThrow(ContentError);
    expect(() => load(dir)).toThrow(/title: no text in the default language "en"/);
  });

  it("the seller's default language decides what is required (de as default needs de everywhere)", () => {
    const dir = root((s, p) => {
      s.defaultLanguage = "de";
      delete p.faq[0].a.de; // the fixture has this answer in en only
    });
    expect(() => load(dir)).toThrow(/faq\.0\.a: no text in the default language "de"/);
  });

  it("a seller text without the default language is an error in seller.json", () => {
    const dir = root((s) => {
      delete s.consentText.en;
    });
    expect(() => load(dir)).toThrow(/consentText: no text in the default language "en"/);
  });

  it("counts translated localized fields per language with a percentage", () => {
    const r = reportLocalized({ a: { en: "1", de: "1" }, b: { en: "2" }, c: { en: "3", de: "3" }, d: { en: "4" } }, ["en", "de"], "en");
    expect(r.coverage).toEqual([
      { language: "en", translated: 4, total: 4, percent: 100 },
      { language: "de", translated: 2, total: 4, percent: 50 },
    ]);
    expect(r.missing).toEqual({ de: ["b", "d"] });
    expect(coverageLine(r.coverage)).toBe("en 100% (4/4), de 50% (2/4)");
    expect(completeLocalized({ b: { en: "2" } }, ["en", "de"], "en")).toEqual({ b: { en: "2", de: "2" } });
  });

  it("the report script prints a coverage line per product and the field paths", () => {
    const dir = root((s, p) => delete p.title.de);
    const { lines, warnings } = languageReport(dir);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/: de \d+% \(\d+\/\d+\), en 100% \(\d+\/\d+\)$/);
    expect(warnings).toContain(`${fixtures.seller}/fixture-car/product.json: title: no "de" text, shows the "en" text`);
  });
});
