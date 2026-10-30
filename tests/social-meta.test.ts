/* eslint-disable @typescript-eslint/no-explicit-any -- the metadata object is read loosely */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { generateMetadata } from "@/app/[lang]/layout";
import { ogLocale, socialMeta } from "@/lib/social-meta";
import { FIXTURE_DIR, fixtures } from "./helpers";

afterEach(() => vi.unstubAllEnvs());

describe("socialMeta", () => {
  const base = { lang: "de" as const, languages: ["de", "en"] as const, title: "T", description: "D", siteName: "S" };

  it("turns the registry's locale into an Open Graph locale", () => {
    expect(ogLocale("de")).toBe("de_DE");
    expect(ogLocale("en")).toBe("en_GB");
  });

  it("carries the page's own title, description, site name and language, and the other languages as alternates", () => {
    const m = socialMeta({ ...base, withUrl: true });
    expect(m.openGraph).toEqual({ type: "website", siteName: "S", title: "T", description: "D", locale: "de_DE", alternateLocale: ["en_GB"], url: "/de" });
  });

  it("has no alternateLocale for one language, and no url without a known origin", () => {
    const m = socialMeta({ ...base, languages: ["de"], withUrl: false });
    expect(m.openGraph).not.toHaveProperty("alternateLocale");
    expect(m.openGraph).not.toHaveProperty("url");
  });

  it("is a summary card without an image (a large card without one is not valid) and summary_large_image with one", () => {
    expect(socialMeta({ ...base, withUrl: false }).twitter).toEqual({ card: "summary", title: "T", description: "D" });
    const image = { url: "/media/x/og.jpg", width: 1200, height: 630, alt: "A" };
    const m = socialMeta({ ...base, withUrl: true, image });
    expect(m.twitter).toEqual({ card: "summary_large_image", title: "T", description: "D", images: [{ url: "/media/x/og.jpg", alt: "A" }] });
    expect(m.openGraph.images).toEqual([image]);
  });
});

describe("the page metadata", () => {
  beforeAll(() => {
    vi.stubEnv("CONTENT_DIR", FIXTURE_DIR);
    vi.stubEnv("CONTENT_PRODUCT", fixtures.ref("fixture-car"));
  });
  afterAll(() => vi.unstubAllEnvs());
  const meta = (lang: "de" | "en") => generateMetadata({ params: Promise.resolve({ lang }) }) as Promise<any>;

  it("has Open Graph and Twitter for each language, matching the page's title and description, next to canonical and hreflang", async () => {
    vi.stubEnv("SITE_URL", "https://www.example.com");
    const site = fixtures.siteFor("fixture-car");
    for (const lang of ["de", "en"] as const) {
      const m = await meta(lang);
      expect(m.openGraph.title).toBe(m.title);
      expect(m.openGraph.description).toBe(m.description);
      expect(m.openGraph.siteName).toBe(site.seller.displayName);
      expect(m.openGraph.locale).toBe(lang === "de" ? "de_DE" : "en_GB");
      expect(m.openGraph.url).toBe(`/${lang}`);
      expect(m.twitter.title).toBe(m.title);
      expect(m.alternates.canonical).toBe(`/${lang}`);
      expect(Object.keys(m.alternates.languages).sort()).toEqual(["de", "en", "x-default"]);
    }
  });

  it("without SITE_URL: the text tags, no og:url", async () => {
    vi.stubEnv("SITE_URL", "");
    const m = await meta("en");
    expect(m.openGraph.title).toBe(m.title);
    expect(m.openGraph).not.toHaveProperty("url");
    expect(m.twitter.card).toBe("summary");
  });
});
