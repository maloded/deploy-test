// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cacheHeaders, PAGE_CACHE_CONTROL, PAGE_CACHE_SOURCES } from "@/lib/cache-control";

afterEach(() => vi.unstubAllEnvs());

/** A Next.js route source ("/:lang([a-z]{2})", "/robots.txt") as a regular expression: enough for the shapes used here. */
const matches = (source: string, pathname: string) => new RegExp(`^${source.replace(/:[a-z]+(\([^)]*\))/g, "$1").replace(/\./g, "\\.")}$`).test(pathname);
const sourcesFor = (pathname: string) => PAGE_CACHE_SOURCES.filter((s) => matches(s, pathname));

describe("what a CDN and a browser may keep of the pages", () => {
  it("is short: a browser asks again, a shared cache keeps a page for a minute and may serve it stale for one more; never the year Next.js sets", () => {
    expect(PAGE_CACHE_CONTROL).toBe("public, max-age=0, s-maxage=60, stale-while-revalidate=60");
    const age = (name: string) => Number(new RegExp(`${name}=(\\d+)`).exec(PAGE_CACHE_CONTROL)?.[1]);
    expect(age("max-age")).toBe(0);
    expect(age("s-maxage")).toBeLessThanOrEqual(300);
    expect(age("stale-while-revalidate")).toBeLessThanOrEqual(300);
    expect(PAGE_CACHE_CONTROL).not.toMatch(/31536000|immutable|private|no-store/);
  });

  it("covers the language pages (with and without the slash) and the files generated at build time", () => {
    for (const p of ["/de", "/en", "/tr", "/bg", "/de/", "/robots.txt", "/sitemap.xml", "/version.json"]) expect(sourcesFor(p), p).toHaveLength(1);
  });

  it("leaves the hashed assets, the photos, the themes, the API and the 404s alone", () => {
    for (const p of ["/_next/static/chunks/abc.js", "/_next/static/chunks/abc.css", "/_next/image", "/media/seller/product/icon.svg", "/themes/light-editorial.css", "/fonts/a.woff2", "/api/lead", "/", "/de/x", "/nonexistent"]) {
      expect(sourcesFor(p), p).toEqual([]);
    }
  });

  it("is what next.config.ts sends: the page entries first, and X-Robots-Tag alongside them while the site is noindex", async () => {
    vi.stubEnv("SITE_INDEXABLE", "");
    const config = (await import("../next.config")).default;
    const headers = (await config.headers?.()) ?? [];
    const cache = headers.filter((h) => h.headers.some((x) => x.key === "Cache-Control"));
    expect(cache).toEqual(cacheHeaders());
    for (const h of cache) expect(h.headers).toEqual([{ key: "Cache-Control", value: PAGE_CACHE_CONTROL }]);
    const robots = headers.filter((h) => h.headers.some((x) => x.key === "X-Robots-Tag"));
    expect(robots).toEqual([{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: expect.stringContaining("noindex") }] }]);
    // nothing sets a Cache-Control for the assets: Next.js keeps its own year for the hashed files
    expect(JSON.stringify(headers)).not.toContain("31536000");
  });

  it("the source file has no other Cache-Control or year-long value", () => {
    const text = fs.readFileSync(path.join(process.cwd(), "src", "lib", "cache-control.ts"), "utf8").replace(/\/\/.*$/gm, "");
    expect(text).not.toMatch(/31536000|immutable/);
  });
});
