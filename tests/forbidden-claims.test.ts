import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { matchingLines, normalizeForScan } from "../scripts/lib/content-scan.mjs";
import { CLAIM_PHRASES, claimHits, VAT_PHRASES } from "../scripts/lib/forbidden-claims.mjs";

// A temporary project with one dummy seller and product; the planted texts are the claims under test.
const tmp = path.join(process.cwd(), ".test-tmp", "forbidden-claims");
fs.rmSync(tmp, { recursive: true, force: true });
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

let counter = 0;
/** A fresh project: seller.json and product.json with the given texts, plus docs and a UI strings file that say the same things. */
function project(texts: { product?: Record<string, unknown>; seller?: Record<string, unknown> }, docText = "") {
  const base = path.join(tmp, `case-${++counter}`);
  const put = (rel: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(base, rel)), { recursive: true });
    fs.writeFileSync(path.join(base, rel), text);
  };
  put("content/dummy-seller/seller.json", JSON.stringify({ displayName: "Dummy", ...texts.seller }, null, 2) + "\n");
  put("content/dummy-seller/dummy-product/product.json", JSON.stringify({ title: { en: "Dummy" }, ...texts.product }, null, 2) + "\n");
  put("docs/notes.md", docText);
  put("PROJECT.md", docText);
  put("src/lib/ui-strings.ts", docText);
  return { projectRoot: base, contentRoot: path.join(base, "content") };
}

describe("VAT and claim lists", () => {
  it("hold the listed phrases", () => {
    expect(VAT_PHRASES).toHaveLength(17);
    expect(CLAIM_PHRASES).toHaveLength(18);
    expect(VAT_PHRASES).toContain("inkl. MwSt");
    expect(CLAIM_PHRASES).toContain("Garantie");
  });
});

describe("the claims scan", () => {
  it("fails for a product with a VAT phrase, and the message has the path and line but not the phrase", () => {
    const p = project({ product: { tagline: { en: "Fair price", de: "Preis 50.000 EUR inkl. MwSt" } } });
    const hits = claimHits(p, VAT_PHRASES);
    expect(hits).toEqual(["content/dummy-seller/dummy-product/product.json:7"]);
    expect(JSON.stringify(hits).toLowerCase()).not.toContain("mwst");
  });

  it("fails for a product with a warranty phrase, and the message has the path and line but not the phrase", () => {
    const p = project({ product: { faq: [{ q: { en: "Q" }, a: { en: "Q", de: "Mit Garantie bis 2027" } }] } });
    const hits = claimHits(p, CLAIM_PHRASES);
    expect(hits.length).toBe(1);
    expect(hits[0]).toMatch(/^content\/dummy-seller\/dummy-product\/product\.json:\d+$/);
    expect(JSON.stringify(hits).toLowerCase()).not.toContain("garantie");
  });

  it("also reads seller.json (a legal note is a seller text)", () => {
    const p = project({ seller: { legalNote: { en: "All prices incl. VAT" } } });
    expect(claimHits(p, VAT_PHRASES)).toEqual(["content/dummy-seller/seller.json:4"]);
  });

  it("does not read docs, PROJECT.md or the UI strings: the same texts there do not fail", () => {
    const p = project({}, "inkl. MwSt, Garantie, unfallfrei, warranty, VAT included\n");
    expect(claimHits(p, VAT_PHRASES)).toEqual([]);
    expect(claimHits(p, CLAIM_PHRASES)).toEqual([]);
  });

  it("passes for a product with none of the phrases", () => {
    const p = project({ product: { tagline: { en: "A clean description", de: "Eine saubere Beschreibung" } } });
    expect(claimHits(p, VAT_PHRASES)).toEqual([]);
    expect(claimHits(p, CLAIM_PHRASES)).toEqual([]);
  });

  it("matches a phrase whatever its case", () => {
    const p = project({ product: { tagline: { en: "INKL. MWST", de: "x" } } });
    expect(claimHits(p, VAT_PHRASES).length).toBe(1);
  });

  it("matches across a no-break space, a narrow no-break space and a doubled space", () => {
    for (const gap of [" ", " ", " ", "  ", "\t"]) {
      const p = project({ product: { tagline: { en: `price inkl.${gap}MwSt`, de: "x" } } });
      expect(claimHits(p, VAT_PHRASES).length, JSON.stringify(gap)).toBe(1);
    }
  });

  it("covers every phrase of both lists (each one alone is found)", () => {
    for (const phrase of [...VAT_PHRASES, ...CLAIM_PHRASES]) {
      const p = project({ product: { tagline: { en: `text ${phrase.toUpperCase()} more`, de: "x" } } });
      const found = claimHits(p, [...VAT_PHRASES, ...CLAIM_PHRASES]).length;
      expect(found, "a listed phrase was not found").toBeGreaterThan(0);
    }
  });
});

describe("normalisation for all scans", () => {
  it("lower-cases, folds Unicode spaces, quotes and dashes", () => {
    expect(normalizeForScan("  Ohne MwSt  ")).toBe("ohne mwst");
    expect(normalizeForScan("A B C　D")).toBe("a b c d");
    expect(normalizeForScan("it’s “quoted” „quote“")).toBe("it's \"quoted\" \"quote\"");
    expect(normalizeForScan("VAT‑free – tax—free")).toBe("vat-free - tax-free");
    expect(normalizeForScan("Un­fall​frei")).toBe("unfallfrei");
  });

  it("matchingLines matches an entry typed with plain characters against a text with typographic ones", () => {
    const text = "line one\nvat‑free price\nline three";
    expect(matchingLines(text, ["VAT-free price"])).toEqual([2]);
    expect(matchingLines("it’s a deal", ["it's a deal"])).toEqual([1]);
    expect(matchingLines("x", [])).toEqual([]);
    expect(matchingLines("x", ["   "])).toEqual([]);
  });

  it("matchingLines returns line numbers only", () => {
    const hits = matchingLines("secret phrase here", ["secret phrase"]);
    expect(hits).toEqual([1]);
    expect(typeof hits[0]).toBe("number");
  });
});
