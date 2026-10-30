import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { generateMetadata } from "@/app/[lang]/layout";
import { assertSiteUrl, SiteUrlError, siteUrl } from "@/lib/site-url";
import { FIXTURE_DIR, fixtures } from "./helpers";

afterEach(() => vi.unstubAllEnvs());

describe("SITE_URL", () => {
  it("is the origin: https://host, with or without a trailing slash; unset or empty is null", () => {
    expect(siteUrl({})).toBeNull();
    expect(siteUrl({ SITE_URL: "" })).toBeNull();
    expect(siteUrl({ SITE_URL: "  " })).toBeNull();
    expect(siteUrl({ SITE_URL: "https://www.example.com" })!.href).toBe("https://www.example.com/");
    expect(siteUrl({ SITE_URL: "https://www.example.com/" })!.origin).toBe("https://www.example.com");
    expect(siteUrl({ SITE_URL: "https://shop.example.com:8443" })!.origin).toBe("https://shop.example.com:8443");
  });

  it("refuses a path, a query, a hash, credentials, another scheme and text that is not a URL, each with a message that says what to set", () => {
    for (const bad of ["https://www.example.com/shop", "https://www.example.com/?a=1", "https://www.example.com/#x", "https://u:p@www.example.com", "ftp://www.example.com", "www.example.com", "not a url"]) {
      expect(() => siteUrl({ SITE_URL: bad }), bad).toThrow(SiteUrlError);
      expect(() => siteUrl({ SITE_URL: bad }), bad).toThrow(/SITE_URL/);
    }
    expect(() => siteUrl({ SITE_URL: "https://www.example.com/shop" })).toThrow(/origin only/);
  });

  it("with SITE_INDEXABLE=1 must be set and https (http only for localhost)", () => {
    expect(() => assertSiteUrl({ SITE_INDEXABLE: "1" })).toThrow(/SITE_INDEXABLE=1 needs SITE_URL: set SITE_URL to the site's full origin/);
    expect(() => assertSiteUrl({ SITE_INDEXABLE: "1", SITE_URL: "" })).toThrow(SiteUrlError);
    expect(() => assertSiteUrl({ SITE_INDEXABLE: "1", SITE_URL: "http://www.example.com" })).toThrow(/must be https/);
    expect(() => assertSiteUrl({ SITE_INDEXABLE: "1", SITE_URL: "http://127.0.0.1:3000" })).not.toThrow();
    expect(() => assertSiteUrl({ SITE_INDEXABLE: "1", SITE_URL: "https://www.example.com" })).not.toThrow();
  });

  it("is optional while the site is noindex (unset, or SITE_INDEXABLE not 1), but a wrong value is still reported", () => {
    expect(() => assertSiteUrl({})).not.toThrow();
    expect(() => assertSiteUrl({ SITE_INDEXABLE: "0" })).not.toThrow();
    expect(() => assertSiteUrl({ SITE_URL: "https://www.example.com" })).not.toThrow();
    expect(() => assertSiteUrl({ SITE_URL: "https://www.example.com/x" })).toThrow(SiteUrlError);
  });

  it("is self-contained apart from indexing.ts, because next.config.ts imports it", () => {
    const imports = [...fs.readFileSync(path.join(process.cwd(), "src", "lib", "site-url.ts"), "utf8").matchAll(/^import .* from "(.*)";/gm)].map((m) => m[1]);
    expect(imports).toEqual(["./indexing.ts"]);
  });
});

describe("the build stops (next.config.ts)", () => {
  const load = async () => {
    vi.resetModules();
    return (await import("../next.config")).default;
  };

  it("with SITE_INDEXABLE=1 and no SITE_URL, with the message", async () => {
    vi.stubEnv("SITE_INDEXABLE", "1");
    vi.stubEnv("SITE_URL", "");
    await expect(load()).rejects.toThrow(/SITE_INDEXABLE=1 needs SITE_URL/);
  });

  it("loads fine without SITE_INDEXABLE (SITE_URL optional) and with both set", async () => {
    vi.stubEnv("SITE_INDEXABLE", "");
    vi.stubEnv("SITE_URL", "");
    expect((await load()).images?.qualities).toEqual([75, 85]);
    vi.stubEnv("SITE_INDEXABLE", "1");
    vi.stubEnv("SITE_URL", "https://www.example.com");
    expect((await load()).images?.qualities).toEqual([75, 85]);
  });
});

describe("metadataBase", () => {
  beforeAll(() => {
    vi.stubEnv("CONTENT_DIR", FIXTURE_DIR);
    vi.stubEnv("CONTENT_PRODUCT", fixtures.ref("fixture-car"));
  });
  afterAll(() => vi.unstubAllEnvs());
  const meta = () => generateMetadata({ params: Promise.resolve({ lang: "en" }) });

  it("is the origin when SITE_URL is set, and absent when it is not", async () => {
    vi.stubEnv("SITE_URL", "https://www.example.com");
    expect(String((await meta()).metadataBase)).toBe("https://www.example.com/");
    vi.stubEnv("SITE_URL", "");
    expect(await meta()).not.toHaveProperty("metadataBase");
  });
});
