import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";
import robots from "@/app/robots";
import { indexingAllowed, metadataRobots, NOINDEX, robotsHeader, robotsTxt } from "@/lib/indexing";
import { proxy } from "@/proxy";

afterEach(() => vi.unstubAllEnvs());
const src = (...p: string[]) => fs.readFileSync(path.join(process.cwd(), ...p), "utf8");
const get = (url: string) => proxy(new NextRequest(`http://localhost:3000${url}`));

describe("the indexing switch (SITE_INDEXABLE)", () => {
  it("allows indexing only for exactly 1; unset, empty and anything else keep the site noindex", () => {
    expect(indexingAllowed({ SITE_INDEXABLE: "1" })).toBe(true);
    for (const v of [undefined, "", "0", "true", "yes", " 1"]) expect(indexingAllowed({ SITE_INDEXABLE: v }), String(v)).toBe(false);
    expect(indexingAllowed({})).toBe(false);
  });

  it("hands every place the same values: header, meta robots and robots.txt", () => {
    expect(robotsHeader({})).toBe(NOINDEX);
    expect(robotsHeader({ SITE_INDEXABLE: "1" })).toBeNull();
    expect(metadataRobots({})).toEqual({ index: false, follow: false, nocache: true, noarchive: true, nosnippet: true });
    expect(metadataRobots({ SITE_INDEXABLE: "1" })).toBeUndefined();
    expect(robotsTxt({})).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    expect(robotsTxt({ SITE_INDEXABLE: "1" })).toEqual({ rules: { userAgent: "*", allow: "/" } });
  });

  it("lists a Sitemap line only when a sitemap URL exists (there is none yet)", () => {
    expect(robotsTxt({ SITE_INDEXABLE: "1" }, "https://x.example/sitemap.xml").sitemap).toBe("https://x.example/sitemap.xml");
    expect(robotsTxt({ SITE_INDEXABLE: "1" })).not.toHaveProperty("sitemap");
    expect(robotsTxt({}, "https://x.example/sitemap.xml")).not.toHaveProperty("sitemap"); // never with disallow-all
  });

  it("is self-contained, because next.config.ts imports it", () => {
    expect(src("src", "lib", "indexing.ts")).not.toMatch(/^import /m);
  });
});

describe("each of the four places follows it", () => {
  it("robots.txt: disallow all by default, allow all with SITE_INDEXABLE=1, no Sitemap line", () => {
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    vi.stubEnv("SITE_INDEXABLE", "1");
    expect(robots()).toEqual({ rules: { userAgent: "*", allow: "/" } });
  });

  it("the proxy: X-Robots-Tag on every response by default (redirect included), none with SITE_INDEXABLE=1", () => {
    vi.stubEnv("SITE_DEFAULT_LANGUAGE", "de");
    for (const url of ["/", "/de", "/media/a.jpg", "/api/x"]) expect(get(url).headers.get("x-robots-tag"), url).toBe(NOINDEX);
    vi.stubEnv("SITE_INDEXABLE", "1");
    for (const url of ["/", "/de", "/media/a.jpg", "/api/x"]) {
      const res = get(url);
      expect(res.headers.get("x-robots-tag"), url).toBeNull();
      expect(res.status, url).toBe(url === "/" ? 307 : 200); // the redirect itself stays
    }
  });

  it("next.config: the catch-all noindex header by default, no header rule with SITE_INDEXABLE=1", async () => {
    expect(await nextConfig.headers!()).toEqual([{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: NOINDEX }] }]);
    vi.stubEnv("SITE_INDEXABLE", "1");
    expect(await nextConfig.headers!()).toEqual([]);
  });

  it("the page metadata takes its robots from the helper, so there is no hand-written noindex left in the layout", () => {
    const layout = src("src", "app", "[lang]", "layout.tsx");
    expect(layout).toContain("robots: metadataRobots()");
    expect(layout).not.toMatch(/index:\s*false/);
  });

  it("no other source file spells out a noindex of its own (the helper is the only one)", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name) && /noindex|index:\s*false/.test(fs.readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")) && !p.endsWith(path.join("lib", "indexing.ts"))) hits.push(path.relative(process.cwd(), p));
      }
    };
    walk(path.join(process.cwd(), "src"));
    expect(hits.filter((h) => !/not-found|error|StatusPage/.test(h)), hits.join(", ")).toEqual([]); // the 404 and error pages set theirs (item 4)
  });
});

describe("DEPLOY.md's production checklist", () => {
  const deploy = src("DEPLOY.md");
  const checklist = deploy.slice(deploy.indexOf("## Production checklist"), deploy.indexOf("## Voice assistant widget"));

  it("says SITE_INDEXABLE=1 is a build-time variable, for the Production environment only (not Preview)", () => {
    expect(checklist).toMatch(/`SITE_INDEXABLE=1`: a build-time variable/);
    expect(checklist).toMatch(/for the Production environment only/);
    expect(checklist).toMatch(/Set it for Production only, not for Preview/);
  });

  it("lists what to leave unset, the lead store, privacy and imprint URLs, real contact data, the Hanc domain list and the release check", () => {
    for (const needle of ["`REVIEW_THEME_SWITCHER`", "`NEXT_PUBLIC_PROTOTYPE_NOTE`", "`LEADS_STORE`", "`privacyUrl`", "`imprintUrl`", "Real contact data", "domain whitelist", "verify:deploy -- <release url> --release"]) {
      expect(checklist, needle).toContain(needle);
    }
  });

  it("has no secret, e-mail address or phone number in it", () => {
    expect(checklist).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+|\+\d[\d\s]{7,}|token=|[0-9a-f]{24}/i);
  });
});
