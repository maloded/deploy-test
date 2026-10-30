import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";
import { GET } from "@/app/sitemap.xml/route";
import { sitemapXml } from "@/lib/sitemap";
import { FIXTURE_DIR, fixtures } from "./helpers";

afterEach(() => vi.unstubAllEnvs());

describe("sitemapXml", () => {
  it("lists every language page with the alternates of all languages and x-default", () => {
    const xml = sitemapXml({ origin: "https://www.example.com", languages: ["de", "en"], defaultLanguage: "de" });
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9" xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml">/);
    expect([...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1])).toEqual(["https://www.example.com/de", "https://www.example.com/en"]);
    for (const url of xml.split("</url>").slice(0, 2)) {
      expect([...url.matchAll(/hreflang="([^"]*)" href="([^"]*)"/g)].map((m) => `${m[1]}=${m[2]}`)).toEqual(["de=https://www.example.com/de", "en=https://www.example.com/en", "x-default=https://www.example.com/de"]);
    }
  });

  it("has no alternates for one language, and invents no lastmod, changefreq or priority", () => {
    const xml = sitemapXml({ origin: "https://www.example.com", languages: ["de"], defaultLanguage: "de" });
    expect(xml).not.toContain("xhtml:link");
    expect(xml).not.toMatch(/lastmod|changefreq|priority/);
  });

  it("escapes what it writes", () => {
    const xml = sitemapXml({ origin: 'https://www.example.com/?a=1&b="2"<', languages: ["de"], defaultLanguage: "de" });
    const loc = /<loc>([^<]*)<\/loc>/.exec(xml)![1];
    expect(loc).toBe("https://www.example.com/?a=1&amp;b=&quot;2&quot;&lt;/de");
  });
});

describe("/sitemap.xml and robots.txt", () => {
  beforeEach(() => {
    vi.stubEnv("CONTENT_DIR", FIXTURE_DIR);
    vi.stubEnv("CONTENT_PRODUCT", fixtures.ref("fixture-car"));
  });

  it("does not exist (404) unless SITE_INDEXABLE=1 and the origin is known", async () => {
    expect(GET().status).toBe(404); // the default
    vi.stubEnv("SITE_URL", "https://www.example.com");
    expect(GET().status).toBe(404); // an origin alone does not make a sitemap
    vi.stubEnv("SITE_INDEXABLE", "1");
    vi.stubEnv("SITE_URL", "");
    expect(GET().status).toBe(404); // nor indexing without an origin (the build stops before that, see next.config.ts)
  });

  it("with both set: XML with the fixture's languages and alternates", async () => {
    vi.stubEnv("SITE_INDEXABLE", "1");
    vi.stubEnv("SITE_URL", "https://www.example.com");
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^application\/xml/);
    const xml = await res.text();
    const site = fixtures.siteFor("fixture-car");
    expect([...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1])).toEqual(site.product.languages.map((l) => `https://www.example.com/${l}`));
    expect(xml).toContain('hreflang="x-default"');
  });

  it("robots.txt names the sitemap only then (indexing allowed and an origin), and is disallow-all otherwise", () => {
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    vi.stubEnv("SITE_URL", "https://www.example.com");
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } }); // an origin alone: still disallow-all, no Sitemap line
    vi.stubEnv("SITE_INDEXABLE", "1");
    expect(robots()).toEqual({ rules: { userAgent: "*", allow: "/" }, sitemap: "https://www.example.com/sitemap.xml" });
    vi.stubEnv("SITE_URL", "");
    expect(robots()).toEqual({ rules: { userAgent: "*", allow: "/" } }); // no origin: no Sitemap line
  });

  it("is a static route, built with the site", () => {
    expect(fs.readFileSync(path.join(process.cwd(), "src", "app", "sitemap.xml", "route.ts"), "utf8")).toContain('export const dynamic = "force-static"');
  });
});
