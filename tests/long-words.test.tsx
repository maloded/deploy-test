// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { loadLayout } from "@/product-types/layouts";
import { content, hasRealContent } from "./helpers";

/**
 * Static check of the German sample (no browser): the longest word that cannot break, per kind of element, against
 * the narrowest column of that element at 360 px. A word that is longer than its column is only allowed when the
 * element has the CSS safety net (hyphens: auto + overflow-wrap: anywhere). Widths are estimates: a character is
 * about 0.55 em wide (0.5 em for the numerals of the fact values), the base size is 18 px.
 */
const BASE = 18;
const PAGE = 360 - 2 * 24; // content width at 360 px: the container's side padding is --space-4 (24 px)
const GAP = 16;

type Kind = { name: string; selector: RegExp; classes: string[]; widthPx: number; fontRem: number };
const KINDS: Kind[] = [
  { name: "spec value", selector: /class="details__value"/, classes: [".details__value"], widthPx: (PAGE - GAP) / 2, fontRem: 1 },
  { name: "spec label", selector: /class="details__label"/, classes: [".details__label"], widthPx: (PAGE - GAP) / 2, fontRem: 1 },
  { name: "hero description", selector: /class="hero__description"/, classes: [".hero__description"], widthPx: PAGE, fontRem: 1 },
  { name: "faq question", selector: /class="faq__question"[^>]*><span>/, classes: [".faq__question"], widthPx: PAGE - 24, fontRem: 1.25 },
  { name: "faq answer", selector: /class="faq__answer"/, classes: [".faq__answer"], widthPx: PAGE, fontRem: 1 },
  { name: "offer note", selector: /class="offer__disclaimer"/, classes: [".offer__disclaimer"], widthPx: PAGE, fontRem: 0.85 },
  { name: "footer text", selector: /class="site-footer__legal"/, classes: [".site-footer"], widthPx: PAGE, fontRem: 0.85 },
  { name: "button", selector: /class="button[^"]*"/, classes: [".button"], widthPx: PAGE - 2 * 18, fontRem: 0.8 },
];

const css = fs.readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const netSelectors = (() => {
  const m = /([^{}]+)\{[^{}]*hyphens:\s*auto[^{}]*overflow-wrap:\s*anywhere[^{}]*\}/.exec(css);
  return m ? m[1].split(",").map((x) => x.trim()) : [];
})();

const decode = (t: string) => t.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/<[^>]+>/g, " ");

/** Text of every element of a kind: the content after its opening tag up to the matching closing tag of its name. */
function textsOf(html: string, kind: Kind): string[] {
  const out: string[] = [];
  const open = new RegExp(`<(a|dd|dt|p|summary|span)\\b[^>]*${kind.selector.source}[^>]*>([\\s\\S]*?)</\\1>`, "g");
  for (const m of html.matchAll(open)) out.push(decode(m[2]));
  return out;
}

/** Longest run of characters without a break opportunity (a space, a hyphen, a dash or a soft hyphen). */
const longestWord = (text: string) => Math.max(0, ...text.split(/[\s\-–—­]+/).map((w) => w.replace(/[(),.;:„“"']/g, "").length));

async function germanPage() {
  const site = content.siteFor("vw-multivan");
  const Layout = await loadLayout(site.product.productType);
  return renderToStaticMarkup(<Layout site={site} />);
}

describe.skipIf(!hasRealContent)("long words in the German sample", () => {
  it("renders German", async () => {
    expect(content.siteFor("vw-multivan").product.defaultLanguage).toBe("de");
    expect(await germanPage()).toContain("Geschwindigkeitsregelung");
  });

  it("every element whose longest word is wider than its column at 360 px has the safety net", async () => {
    const html = await germanPage();
    const report: string[] = [];
    for (const kind of KINDS) {
      const texts = textsOf(html, kind);
      expect(texts.length, `no ${kind.name} found in the page`).toBeGreaterThan(0);
      const longest = Math.max(...texts.map(longestWord));
      const wordPx = longest * 0.55 * kind.fontRem * BASE;
      const wider = wordPx > kind.widthPx;
      if (wider) {
        for (const cls of kind.classes) expect(netSelectors, `${kind.name} (${cls}): a ${longest}-letter word does not fit ${Math.round(kind.widthPx)} px, so it needs hyphens: auto and overflow-wrap: anywhere`).toContain(cls);
      }
      report.push(`${kind.name}: longest word ${longest} letters (~${Math.round(wordPx)} px) in ${Math.round(kind.widthPx)} px${wider ? " -> safety net required" : ""}`);
    }
    // the compound that broke the page at 390 px is in the data and is wider than its 148 px column
    expect(report.find((r) => r.startsWith("spec value"))).toMatch(/longest word 24 letters .*safety net required/);
  });

  it("headings use the safety net too (the long word in a heading must never widen the page)", () => {
    for (const sel of ["h1", "h2", "h3"]) expect(netSelectors).toContain(sel);
  });

  it("the fact values (which never wrap) fit their cell at 360 px in both themes' base sizes", async () => {
    const html = await germanPage();
    const values = [...html.matchAll(/class="hero__fact-value">([^<]*)</g)].map((m) => decode(m[1]));
    expect(values).toHaveLength(4);
    const cell = (PAGE - 0) / 2 - 8; // two columns, minus the cell's own spacing
    for (const base of [17, 18]) {
      const fontPx = 1.25 * base; // the size used on mobile (a fixed 1.25rem)
      for (const v of values) expect(v.length * 0.5 * fontPx, `"${v}" at ${base}px`).toBeLessThanOrEqual(cell);
    }
  });

  it("the page language reaches <html lang> (hyphens: auto needs it)", () => {
    const layout = fs.readFileSync(path.join(process.cwd(), "src", "app", "[lang]", "layout.tsx"), "utf8");
    expect(layout).toMatch(/<html lang=\{lang\}/); // the route's language (see tests/routes.test.tsx)
  });
});
