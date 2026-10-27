// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";
import RootLayout, { generateMetadata, generateStaticParams } from "@/app/[lang]/layout";
import { proxy } from "@/proxy";
import { rootRedirectEnv, siteDefaultLanguage } from "@/lib/root-redirect";
import { FIXTURE_DIR, fixtures } from "./helpers";

// outside a request, headers() throws; the layout reads it in development (the theme switcher)
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const tmp = path.join(process.cwd(), ".test-tmp", "routes");
fs.rmSync(tmp, { recursive: true, force: true });
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
afterEach(() => vi.unstubAllEnvs());

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
let n = 0;
/** A content root with the fixture product and a seller edited by the test; returns CONTENT_DIR for it. */
function sellerRoot(edit: (s: Json) => void) {
  const dir = path.join(tmp, `r${n++}`);
  const seller = fixtures.sellerJson();
  edit(seller);
  fs.mkdirSync(path.join(dir, fixtures.seller), { recursive: true });
  fs.cpSync(fixtures.productDir("fixture-car"), path.join(dir, fixtures.seller, "fixture-car"), { recursive: true });
  fs.writeFileSync(path.join(dir, fixtures.seller, "seller.json"), JSON.stringify(seller));
  return dir;
}
const use = (dir: string) => {
  vi.stubEnv("CONTENT_DIR", dir);
  vi.stubEnv("CONTENT_PRODUCT", `${fixtures.seller}/fixture-car`);
};
const params = (lang: string) => ({ params: Promise.resolve({ lang }) });

describe("static params", () => {
  it("a two-language seller gets /de and /en", () => {
    use(FIXTURE_DIR);
    expect(generateStaticParams()).toEqual([{ lang: "en" }, { lang: "de" }]);
  });

  it("a one-language seller gets one route", () => {
    use(sellerRoot((s) => ((s.languages = ["en"]), delete s.legalNote.de)));
    expect(generateStaticParams()).toEqual([{ lang: "en" }]);
  });
});

describe("metadata and html lang follow the route", () => {
  it("title, description, canonical and hreflang for every language, x-default for the default one", async () => {
    use(FIXTURE_DIR);
    const de = await generateMetadata(params("de"));
    const en = await generateMetadata(params("en"));
    expect(de.title).toMatch(/Testdaten/);
    expect(en.title).not.toBe(de.title);
    expect(de.description).not.toBe(en.description);
    expect(de.alternates).toEqual({ canonical: "/de", languages: { en: "/en", de: "/de", "x-default": "/en" } });
    expect(en.alternates?.canonical).toBe("/en");
    expect(de.robots).toMatchObject({ index: false, follow: false });
  });

  it("the root layout sets <html lang> from the route", async () => {
    use(FIXTURE_DIR);
    for (const lang of ["de", "en"]) {
      const el = (await RootLayout({ children: null, ...params(lang) })) as { props: { lang: string } };
      expect(el.props.lang).toBe(lang);
    }
  });

  it("an unknown language, or one the seller does not offer, is a 404", async () => {
    use(sellerRoot((s) => ((s.languages = ["en"]), delete s.legalNote.de)));
    for (const lang of ["xx", "de", "EN", "robots.txt"]) {
      await expect(generateMetadata(params(lang)), lang).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    }
  });

  it("only the seller's languages are routes (dynamicParams is off)", () => {
    expect(fs.readFileSync("src/app/[lang]/layout.tsx", "utf8")).toContain("export const dynamicParams = false;");
  });
});

describe("/ redirects to the default language", () => {
  const req = (url: string, headers: Record<string, string> = {}) => proxy(new NextRequest(`http://localhost:3000${url}`, { headers }));

  it("307 to /<defaultLanguage>, keeping the query string, with noindex", () => {
    vi.stubEnv("SITE_DEFAULT_LANGUAGE", "de");
    const res = req("/?theme=dark-premium");
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname + new URL(res.headers.get("location")!).search).toBe("/de?theme=dark-premium");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("does not touch the language routes or other paths, and does not negotiate Accept-Language", () => {
    vi.stubEnv("SITE_DEFAULT_LANGUAGE", "de");
    expect(req("/en").status).toBe(200);
    expect(req("/en").headers.get("x-middleware-next")).toBe("1");
    const res = req("/", { "accept-language": "en-GB,en;q=0.9" });
    expect(new URL(res.headers.get("location")!).pathname).toBe("/de");
  });

  it("is protected by REVIEW_PASSWORD like every other path", () => {
    vi.stubEnv("SITE_DEFAULT_LANGUAGE", "de");
    vi.stubEnv("REVIEW_PASSWORD", "s3cret");
    expect(req("/").status).toBe(401);
    const ok = req("/", { authorization: "Basic " + Buffer.from("u:s3cret").toString("base64") });
    expect(ok.status).toBe(307);
    expect(ok.headers.get("cache-control")).toBe("private, no-store");
  });

  it("is not redirected when the default language is not known", () => {
    vi.stubEnv("SITE_DEFAULT_LANGUAGE", "");
    expect(req("/").status).toBe(200);
  });

  it("next.config hands the seller's default language to the proxy", () => {
    expect(nextConfig.env).toMatchObject(rootRedirectEnv()); // next to the lead API's LEAD_CONTEXT
    const dir = sellerRoot((s) => {
      s.languages = ["de", "en"];
      s.defaultLanguage = "de";
    });
    const env = { CONTENT_DIR: dir, CONTENT_PRODUCT: `${fixtures.seller}/fixture-car` };
    expect(siteDefaultLanguage(env)).toBe("de");
    expect(rootRedirectEnv(env)).toEqual({ SITE_DEFAULT_LANGUAGE: "de" });
    expect(rootRedirectEnv({ CONTENT_DIR: path.join(tmp, "missing") })).toEqual({});
    fs.writeFileSync(path.join(dir, fixtures.seller, "seller.json"), JSON.stringify({ defaultLanguage: "xx" }));
    expect(() => siteDefaultLanguage(env)).toThrow(/not a supported language \(de, en\)/);
  });
});
