// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { buildSite } from "@/lib/site";
import { pick } from "@/lib/i18n";
import { examples } from "./helpers";

const SLUGS = ["example-house", "example-watch", "example-bag"];
const site = (slug: string, lang: "de" | "en") => buildSite(null, examples.ref(slug), examples.root, lang);
const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("the example seller is a two-language site", () => {
  it("offers en (default) and de", () => {
    expect(examples.sellerJson()).toMatchObject({ languages: ["en", "de"], defaultLanguage: "en" });
  });

  it.each(SLUGS)("%s: both languages are complete, and the header shows the switcher", (slug) => {
    const en = site(slug, "en");
    expect(en.coverage.map((c) => [c.language, c.percent])).toEqual([["de", 100], ["en", 100]]);
    expect(en.translationWarnings).toEqual([]);
    expect(html(<Header site={en} />)).toContain("lang-switch");
    expect(pick(en.product.title, "de")).not.toBe(pick(en.product.title, "en"));
    expect(html(<Hero site={site(slug, "de")} />)).toContain(pick(en.product.tagline, "de"));
    expect(html(<Hero site={en} />)).toContain(pick(en.product.tagline, "en"));
  });

  it("marks the German texts as AI drafts in every EXAMPLE.md", () => {
    for (const slug of SLUGS) expect(fs.readFileSync(path.join(examples.productDir(slug), "EXAMPLE.md"), "utf8"), slug).toMatch(/AI-written drafts/);
  });
});
