// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import ProductLayout from "@/components/ProductLayout";
import {
  blockOrder,
  decodeEntities,
  canonicalHref,
  contactRow,
  footerText,
  hasMetaNoindex,
  hasNoindex,
  hasPrototypeNote,
  hasThemeSwitcher,
  hreflangLinks,
  htmlLang,
  imageRefs,
  JSON_LD_TYPES,
  jpegSize,
  jsonLdScripts,
  metaTags,
  pageText,
  robotsAllowsAll,
  robotsDisallowsAll,
  sectionIds,
  squash,
  verifyDeploy,
} from "../scripts/lib/verify-deploy.mjs";
import { fixtures } from "./helpers";

const PAGE = `<!DOCTYPE html><html lang="de" data-theme="x"><head><title>T</title></head><body>
<div class="pt" data-block-order="hero gallery specs offer"><main>
<section class="hero" id="hero"><h1>Caf&eacute; &amp; Bar &#8211; &#x41;&nbsp;B</h1>
<img alt="a" src="/_next/image?url=%2Fmedia%2Fa.png&amp;w=3840&amp;q=75" srcSet="/_next/image?url=%2Fmedia%2Fa.png&amp;w=640&amp;q=75 640w, /_next/image?url=%2Fmedia%2Fa.png&amp;w=750&amp;q=75 750w"/>
<img src='/plain.jpg'></section>
<section id="gallery"></section><section class="specs" id="specs"></section><section id="offer"></section></main>
<footer class="site-footer"><p class="site-footer__name">Zorbo &amp; Co</p><div class="site-footer__contact" id="contact" data-block="contact"><p>Mail:&nbsp;<a href="mailto:a@b.co">a@b.co</a></p><dialog class="contact-dialog"></dialog></div></footer></div></body></html>`;

describe("parsing", () => {
  it("decodes named, decimal and hexadecimal entities and leaves unknown ones", () => {
    expect(decodeEntities("a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39; &#x41;&#66; &nbsp;|&madeup;")).toBe('a & b <c> "d" \'e\' AB  |&madeup;');
    expect(decodeEntities("&#0; &#99999999; &constructor;")).toBe("&#0; &#99999999; &constructor;");
  });

  it("squashes every kind of space", () => {
    expect(squash("  a  b c\n\td ")).toBe("a b c d");
  });

  it("reads the html lang attribute", () => {
    expect(htmlLang(PAGE)).toBe("de");
    expect(htmlLang("<html><body></body></html>")).toBeNull();
    expect(htmlLang("<HTML LANG='uk'>")).toBe("uk");
    expect(htmlLang("<p lang=\"en\">no html tag</p>")).toBeNull();
  });

  it("reads data-block-order and the section ids", () => {
    expect(blockOrder(PAGE)).toEqual(["hero", "gallery", "specs", "offer"]);
    expect(blockOrder("<div>none</div>")).toEqual([]);
    expect(sectionIds(PAGE)).toEqual(["hero", "gallery", "specs", "offer"]);
    expect(sectionIds('<section class="a"></section><section id="x">')).toEqual(["x"]);
  });

  it("reads src and the first srcset URL of every image, decoded", () => {
    expect(imageRefs(PAGE)).toEqual([
      { src: "/_next/image?url=%2Fmedia%2Fa.png&w=3840&q=75", srcsetFirst: "/_next/image?url=%2Fmedia%2Fa.png&w=640&q=75" },
      { src: "/plain.jpg", srcsetFirst: null },
    ]);
    expect(imageRefs("<p>no images</p>")).toEqual([]);
  });

  it("reads the hreflang alternates and the canonical link (React writes hrefLang)", () => {
    const head = '<link rel="canonical" href="/de"/><link rel="alternate" hrefLang="en" href="/en"/><link rel="alternate" hreflang="x-default" href="/de"/><link rel="stylesheet" href="/a.css"/><link rel="alternate" href="/feed">';
    expect(hreflangLinks(head)).toEqual([{ hreflang: "en", href: "/en" }, { hreflang: "x-default", href: "/de" }]);
    expect(canonicalHref(head)).toBe("/de");
    expect(canonicalHref("<p></p>")).toBeNull();
    expect(hreflangLinks("<p></p>")).toEqual([]);
  });

  it("reads the footer text with entities decoded and spaces squashed", () => {
    expect(footerText(PAGE)).toBe("Zorbo & Co Mail: a@b.co");
    expect(footerText("<main></main>")).toBeNull();
  });

  it("finds a title after entity decoding, across no-break spaces", () => {
    expect(pageText(PAGE)).toContain(squash("Café & Bar – A B"));
  });

  it("reads robots.txt", () => {
    expect(robotsDisallowsAll("User-Agent: *\nDisallow: /\n")).toBe(true);
    expect(robotsDisallowsAll("# c\nuser-agent: *\ndisallow: /   # all\n")).toBe(true);
    expect(robotsDisallowsAll("User-agent: *\nDisallow:\n")).toBe(false);
    expect(robotsDisallowsAll("User-agent: *\nDisallow: /private\n")).toBe(false);
    expect(robotsDisallowsAll("User-agent: Googlebot\nDisallow: /\n")).toBe(false);
    expect(robotsDisallowsAll("User-agent: Googlebot\nUser-agent: *\nDisallow: /\n")).toBe(true);
    expect(robotsDisallowsAll("")).toBe(false);
  });

  it("recognises noindex in the header value", () => {
    expect(hasNoindex("noindex, nofollow")).toBe(true);
    expect(hasNoindex("NOINDEX")).toBe(true);
    expect(hasNoindex("all")).toBe(false);
    expect(hasNoindex(null)).toBe(false);
  });

  it("parses the real markup of a rendered fixture page", () => {
    const site = fixtures.siteFor("fixture-car");
    const html = renderToStaticMarkup(<ProductLayout site={site} />);
    const order = blockOrder(html);
    expect(order.length).toBeGreaterThan(2);
    for (const id of order.filter((i) => i !== "contact")) expect(sectionIds(html), id).toContain(id);
    expect(order).toContain("contact"); // listed, but it is the footer's row, not a section
    expect(contactRow(html)).toBe(true);
    expect(footerText(html)).toContain(site.seller.displayName);
    expect(imageRefs(html).length).toBeGreaterThan(0);
  });
});

// ---- the checks, against a fake fetch -----------------------------------------------------------------------------

type Route = { status?: number; type?: string; body?: string | Uint8Array; headers?: Record<string, string> };
const fakeFetch = (routes: Record<string, Route>) =>
  (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const route = routes[url.pathname + url.search] ?? routes[url.pathname];
    if (!route) return new Response("nope", { status: 404, headers: { "content-type": "text/plain" } });
    return new Response((route.body ?? "") as BodyInit, { status: route.status ?? 200, headers: { "content-type": route.type ?? "text/html", ...route.headers } });
  }) as typeof fetch;

const GOOD: Record<string, Route> = {
  "/": { body: PAGE, headers: { "x-robots-tag": "noindex, nofollow" } },
  "/_next/image?url=%2Fmedia%2Fa.png&w=3840&q=75": { type: "image/png" },
  "/_next/image?url=%2Fmedia%2Fa.png&w=640&q=75": { type: "image/webp" },
  "/plain.jpg": { type: "image/jpeg" },
  "/robots.txt": { type: "text/plain", body: "User-Agent: *\nDisallow: /\n" },
};
const expected = { title: "Café & Bar – A B", displayName: "Zorbo & Co" };
const run = async (routes: Record<string, Route>, extra: object = {}) => (await verifyDeploy({ url: "https://site.example/", expected, fetchImpl: fakeFetch(routes), ...extra }));
const failing = (r: { name: string; ok: boolean }[]) => r.filter((x) => !x.ok).map((x) => x.name);

describe("verifyDeploy", () => {
  it("passes all eight checks for a good page", async () => {
    const r = await run(GOOD);
    expect(r).toHaveLength(9);
    expect(failing(r)).toEqual([]);
  });

  it.each([
    ["a non-200 page", { ...GOOD, "/": { status: 500, body: PAGE, headers: { "x-robots-tag": "noindex" } } }, "GET / is 200 and HTML"],
    ["a page that is not HTML", { ...GOOD, "/": { type: "application/json", body: PAGE, headers: { "x-robots-tag": "noindex" } } }, "GET / is 200 and HTML"],
    ["a missing noindex header", { ...GOOD, "/": { body: PAGE } }, "X-Robots-Tag contains noindex"],
    ["a missing lang", { ...GOOD, "/": { body: PAGE.replace(' lang="de"', ""), headers: { "x-robots-tag": "noindex" } } }, "html lang attribute present"],
    ["a section missing for a listed block", { ...GOOD, "/": { body: PAGE.replace('<section id="gallery">', "<section>"), headers: { "x-robots-tag": "noindex" } } }, "every block in data-block-order has a <section>"],
    ["an image that is 404", { ...GOOD, "/plain.jpg": { status: 404 } }, "every <img> src and srcset URL is 200 with an image type (3 URLs)"],
    ["an image URL that answers HTML", { ...GOOD, "/plain.jpg": { type: "text/html" } }, "every <img> src and srcset URL is 200 with an image type (3 URLs)"],
    ["a robots.txt that allows crawling", { ...GOOD, "/robots.txt": { type: "text/plain", body: "User-agent: *\nAllow: /\n" } }, "/robots.txt is 200 and disallows all"],
    ["a missing robots.txt", { ...GOOD, "/robots.txt": { status: 404 } }, "/robots.txt is 200 and disallows all"],
  ])("fails for %s", async (_label, routes, check) => {
    const r = await run(routes as Record<string, Route>);
    expect(failing(r)).toEqual([check]);
    expect(r.find((x) => !x.ok)!.reason).not.toBe("");
  });

  it("fails when the title or the seller name is not on the page", async () => {
    expect(failing(await run(GOOD, { expected: { ...expected, title: "Another title" } }))).toEqual(["product title (page language) is in the HTML"]);
    expect(failing(await run(GOOD, { expected: { ...expected, displayName: "Other Seller" } }))).toEqual(["footer shows the seller's displayName"]);
  });

  it("fails both local checks, with the reason, when there is no local product", async () => {
    const r = await run(GOOD, { expected: null, expectedProblem: "cannot read the local product: nothing there" });
    expect(failing(r)).toEqual(["product title (page language) is in the HTML", "footer shows the seller's displayName"]);
    expect(r.filter((x) => !x.ok).every((x) => x.reason.includes("nothing there"))).toBe(true);
  });

  it("fails on a page without images", async () => {
    const r = await run({ ...GOOD, "/": { body: PAGE.replace(/<img[^>]*>/g, ""), headers: { "x-robots-tag": "noindex" } } });
    expect(failing(r)).toEqual(["every <img> src and srcset URL is 200 with an image type (0 URLs)"]);
  });

  it("reports an unreachable server as one FAIL", async () => {
    const down = (async () => {
      throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
    }) as typeof fetch;
    const r = await verifyDeploy({ url: "http://localhost:1/", expected, fetchImpl: down });
    expect(r).toEqual([{ name: "GET / is 200 and HTML", ok: false, reason: "request failed: ECONNREFUSED" }]);
  });
});

// ---- --release: indexing allowed, nothing of the review left -------------------------------------------------------------

const jpeg = async (width: number, height: number) => new Uint8Array(await sharp({ create: { width, height, channels: 3, background: "#336699" } }).jpeg().toBuffer());
const OG = await jpeg(1200, 630);
const SMALL = await jpeg(800, 400);

describe("verifyDeploy --release", () => {
  // a release page: absolute canonical and hreflang on the site's own origin, Open Graph and Twitter tags, structured data
  const LD = JSON.stringify({ "@context": "https://schema.org", "@type": "Car", name: "Café", offers: { "@type": "Offer", price: 12900, priceCurrency: "EUR" } });
  const HEAD =
    '<link rel="canonical" href="https://site.example/de"/><link rel="alternate" hrefLang="de" href="https://site.example/de"/><link rel="alternate" hrefLang="en" href="https://site.example/en"/><link rel="alternate" hrefLang="x-default" href="https://site.example/de"/>' +
    '<meta property="og:title" content="T"/><meta property="og:locale" content="de_DE"/><meta property="og:image" content="https://site.example/media/s/p/og-1200x630.jpg"/><meta property="og:image:alt" content="A"/><meta name="twitter:card" content="summary_large_image"/>';
  const RPAGE = PAGE.replace("</head>", `${HEAD}</head>`).replace("</main>", `<script type="application/ld+json">${LD}</script></main>`);
  const SITEMAP = '<?xml version="1.0"?><urlset><url><loc>https://site.example/de</loc><xhtml:link rel="alternate" hreflang="de" href="https://site.example/de"/><xhtml:link rel="alternate" hreflang="x-default" href="https://site.example/de"/></url><url><loc>https://site.example/en</loc></url></urlset>';
  const routes = (over: Record<string, Route> = {}): Record<string, Route> => ({
    ...GOOD,
    "/": { body: RPAGE },
    "/robots.txt": { type: "text/plain", body: "User-agent: *\nAllow: /\n\nSitemap: https://site.example/sitemap.xml\n" },
    "/sitemap.xml": { type: "application/xml", body: SITEMAP },
    "/media/s/p/og-1200x630.jpg": { type: "image/jpeg", body: OG },
    ...over,
  });
  const seo = { productType: "car", price: { amount: 12900, currency: "EUR" }, hasGallery: true, languages: ["de", "en"] };
  const release = async (r: Record<string, Route>, extra: object = {}) =>
    (await verifyDeploy({ url: "https://site.example/", expected: { ...expected, ...seo, ...extra }, release: true, fetchImpl: fakeFetch(r) })) as { name: string; ok: boolean; reason: string }[];
  const RELEASE = routes();

  it("passes for a page with indexing allowed, no prototype note, no theme switcher, no /version.json, and everything a release publishes", async () => {
    const r = await release(RELEASE);
    expect(failing(r)).toEqual([]);
    const names = r.map((x) => x.name);
    for (const n of [
      "indexing allowed: no noindex in X-Robots-Tag", "indexing allowed: no noindex meta tag", "no prototype note in the page", "no review theme switcher in the page", "/robots.txt is 200 and allows crawling", "no /version.json (404)",
      "canonical link is absolute and on this site", "hreflang links are absolute and on this site", "Open Graph title and locale present", "og:image is a 1200x630 JPEG that answers 200", "twitter:card is summary_large_image",
      "/sitemap.xml lists every language page with its alternates, and robots.txt names it", "structured data (JSON-LD) is valid, carries the content's price and cannot close its script",
    ]) expect(names, n).toContain(n);
    expect(names).not.toContain("X-Robots-Tag contains noindex"); // the default mode's check is replaced, not added
  });

  it.each([
    ["a noindex header", { ...RELEASE, "/": { body: RPAGE, headers: { "x-robots-tag": "noindex, nofollow" } } }, "indexing allowed: no noindex in X-Robots-Tag"],
    ["a noindex meta tag", { ...RELEASE, "/": { body: RPAGE.replace("</head>", '<meta name="robots" content="noindex, nofollow"/></head>') } }, "indexing allowed: no noindex meta tag"],
    ["the prototype note", { ...RELEASE, "/": { body: RPAGE.replace("</main>", '</main><p class="site-footer__prototype">Prototype</p>') } }, "no prototype note in the page"],
    ["the version line", { ...RELEASE, "/": { body: RPAGE.replace("</main>", '</main><p class="site-footer__version">dev</p>') } }, "no prototype note in the page"],
    ["the theme switcher", { ...RELEASE, "/": { body: RPAGE.replace("</main>", '</main><aside class="theme-switcher"></aside>') } }, "no review theme switcher in the page"],
    ["a disallow-all robots.txt", { ...RELEASE, "/robots.txt": { type: "text/plain", body: "User-agent: *\nDisallow: /\n\nSitemap: https://site.example/sitemap.xml\n" } }, "/robots.txt is 200 and allows crawling"],
    ["a /version.json", { ...RELEASE, "/version.json": { type: "application/json", body: '{"version":"0.6.0"}' } }, "no /version.json (404)"],
    // what a release publishes for search and sharing, one check at a time
    ["a relative canonical link (SITE_URL missing at the build)", { ...RELEASE, "/": { body: RPAGE.replace('rel="canonical" href="https://site.example/de"', 'rel="canonical" href="/de"') } }, "canonical link is absolute and on this site"],
    ["a canonical link on another origin", { ...RELEASE, "/": { body: RPAGE.replace('rel="canonical" href="https://site.example/de"', 'rel="canonical" href="https://other.example/de"') } }, "canonical link is absolute and on this site"],
    ["a relative hreflang link", { ...RELEASE, "/": { body: RPAGE.replace('hrefLang="en" href="https://site.example/en"', 'hrefLang="en" href="/en"') } }, "hreflang links are absolute and on this site"],
    ["no og:title", { ...RELEASE, "/": { body: RPAGE.replace('<meta property="og:title" content="T"/>', "") } }, "Open Graph title and locale present"],
    ["a product with a gallery photo but no og:image", { ...RELEASE, "/": { body: RPAGE.replace(/<meta property="og:image" [^>]*\/>/, "").replace(/<meta property="og:image:alt"[^>]*\/>/, "").replace('content="summary_large_image"', 'content="summary"') } }, "og:image is a 1200x630 JPEG that answers 200"],
    ["an og:image that is 404", { ...RELEASE, "/media/s/p/og-1200x630.jpg": { status: 404 } }, "og:image is a 1200x630 JPEG that answers 200"],
    ["an og:image of the wrong size", { ...RELEASE, "/media/s/p/og-1200x630.jpg": { type: "image/jpeg", body: SMALL } }, "og:image is a 1200x630 JPEG that answers 200"],
    ["a relative og:image", { ...RELEASE, "/": { body: RPAGE.replace("https://site.example/media/s/p/og-1200x630.jpg", "/media/s/p/og-1200x630.jpg") } }, "og:image is a 1200x630 JPEG that answers 200"],
    ["a twitter card that is not large", { ...RELEASE, "/": { body: RPAGE.replace('content="summary_large_image"', 'content="summary"') } }, "twitter:card is summary_large_image"],
    ["no og:image alt text", { ...RELEASE, "/": { body: RPAGE.replace('<meta property="og:image:alt" content="A"/>', "") } }, "og:image has an alt text"],
    ["a missing sitemap", { ...RELEASE, "/sitemap.xml": { status: 404 } }, "/sitemap.xml lists every language page with its alternates, and robots.txt names it"],
    ["a sitemap without a language", { ...RELEASE, "/sitemap.xml": { type: "application/xml", body: SITEMAP.replace("https://site.example/en", "https://site.example/fr") } }, "/sitemap.xml lists every language page with its alternates, and robots.txt names it"],
    ["a robots.txt without the Sitemap line", { ...RELEASE, "/robots.txt": { type: "text/plain", body: "User-agent: *\nAllow: /\n" } }, "/sitemap.xml lists every language page with its alternates, and robots.txt names it"],
    ["no JSON-LD for a car", { ...RELEASE, "/": { body: RPAGE.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, "") } }, "structured data (JSON-LD) is valid, carries the content's price and cannot close its script"],
    ["a JSON-LD with another price", { ...RELEASE, "/": { body: RPAGE.replace('"price":12900', '"price":99') } }, "structured data (JSON-LD) is valid, carries the content's price and cannot close its script"],
    ["a JSON-LD with a raw < inside", { ...RELEASE, "/": { body: RPAGE.replace('"name":"Café"', '"name":"a <b> c"') } }, "structured data (JSON-LD) is valid, carries the content's price and cannot close its script"],
    ["a JSON-LD that is not JSON", { ...RELEASE, "/": { body: RPAGE.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '<script type="application/ld+json">{nope</script>') } }, "structured data (JSON-LD) is valid, carries the content's price and cannot close its script"],
  ])("fails for %s", async (_label, routes, check) => {
    expect(failing(await release(routes as Record<string, Route>))).toEqual([check]);
  });

  it("does not ask for structured data or an og:image where none is expected (a type without a schemaType, a product without a gallery photo)", async () => {
    const bare = RPAGE.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, "").replace(/<meta property="og:image[^>]*\/>/g, "").replace('content="summary_large_image"', 'content="summary"');
    const r = await release({ ...RELEASE, "/": { body: bare } }, { productType: "gadget", hasGallery: false });
    expect(failing(r)).toEqual([]);
  });

  it("the default mode needs none of it: no SITE_URL-dependent check runs, and a page without any of it passes", async () => {
    const r = await run(GOOD);
    expect(failing(r)).toEqual([]);
    expect(r.map((x) => x.name).filter((n) => /canonical link is absolute|hreflang links are absolute|og:|twitter:|sitemap\.xml|JSON-LD/.test(n))).toEqual([]);
  });

  it("the list of types that must carry JSON-LD is the list of shipped descriptors that name a schemaType", async () => {
    const { fields: car } = await import("@/product-types/car/fields");
    const { fields: house } = await import("@/product-types/house/fields");
    const { fields: watch } = await import("@/product-types/watch/fields");
    const { fields: bag } = await import("@/product-types/bag/fields");
    const { fields: other } = await import("@/product-types/_base/fields");
    const named = [car, house, watch, bag, other].filter((f) => (f as { schemaType?: string }).schemaType).map((f) => f.id);
    expect([...JSON_LD_TYPES].sort()).toEqual(named.sort());
  });

  it("reads the helpers: meta tags, JSON-LD scripts and a JPEG's size", () => {
    expect(metaTags('<meta property="og:title" content="A &amp; B"/><meta name="twitter:card" content="summary"/><meta name="x"/>')).toEqual({ "og:title": "A & B", "twitter:card": "summary" });
    expect(jsonLdScripts('<script>a</script><script type="application/ld+json">{"a":1}</script>')).toEqual(['{"a":1}']);
    expect(jpegSize(OG)).toEqual({ width: 1200, height: 630 });
    expect(jpegSize(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });

  it("the default mode still expects noindex and does not look at the release checks", async () => {
    const r = await run(GOOD);
    expect(r.map((x) => x.name)).toContain("X-Robots-Tag contains noindex");
    expect(r.map((x) => x.name).filter((n) => /indexing allowed|prototype note|theme switcher/.test(n))).toEqual([]);
    expect(failing(await run(RELEASE))).toContain("X-Robots-Tag contains noindex"); // a release page fails the demo check
  });

  it("reads the helpers", () => {
    expect(robotsAllowsAll("User-agent: *\nAllow: /\n")).toBe(true);
    expect(robotsAllowsAll("User-agent: *\nDisallow: /\n")).toBe(false);
    expect(hasMetaNoindex('<meta name="robots" content="index, follow"/>')).toBe(false);
    expect(hasMetaNoindex('<meta content="noindex" name="robots"/>')).toBe(true);
    expect(hasMetaNoindex('<meta name="description" content="noindex"/>')).toBe(false);
    expect(hasPrototypeNote("<p>nothing</p>")).toBe(false);
    expect(hasThemeSwitcher('<aside class="theme-switcher theme-switcher--x">')).toBe(true);
  });
});

// ---- the language routes ------------------------------------------------------------------------------------------

const alt = (langs: string[], def: string) => langs.map((l) => `<link rel="alternate" hrefLang="${l}" href="/${l}"/>`).join("") + `<link rel="alternate" hrefLang="x-default" href="/${def}"/>`;
const langPage = (lang: string, over: { lang?: string; links?: string; canonical?: string; title?: string; noContact?: boolean } = {}) =>
  (over.noContact ? PAGE.replace('id="contact"', 'id="elsewhere"') : PAGE).replace('<html lang="de"', `<html lang="${over.lang ?? lang}"`).replace("<title>T</title>", `<title>${over.title ?? "T"}</title>${over.links ?? alt(["de", "en"], "de")}<link rel="canonical" href="${over.canonical ?? `/${lang}`}"/>`);
const NOINDEX = { "x-robots-tag": "noindex" };
const TWO: Record<string, Route> = {
  ...GOOD,
  "/de": { body: langPage("de"), headers: NOINDEX },
  "/en": { body: langPage("en"), headers: NOINDEX },
};
const multi: typeof expected & { languages: string[]; defaultLanguage: string; titles?: Record<string, string> } = { ...expected, languages: ["de", "en"], defaultLanguage: "de" };
const redirectingFetch = (routes: Record<string, Route>, location: string | null = "/de", status = 307) => {
  const base = fakeFetch(routes);
  return (async (input: string | URL | Request, init?: RequestInit) => {
    if (new URL(String(input)).pathname === "/" && init?.redirect === "manual") return new Response(null, { status, headers: location ? { location } : {} });
    return base(input, init);
  }) as typeof fetch;
};
const runLang = async (routes: Record<string, Route>, f = redirectingFetch(routes), exp = multi) => verifyDeploy({ url: "https://site.example/", expected: exp, fetchImpl: f });

describe("verifyDeploy: the language routes", () => {
  it("adds a redirect check, one check per language and one contact check when the seller has languages", async () => {
    const r = await runLang(TWO);
    expect(r.map((x) => x.name).slice(8)).toEqual(['"/" redirects to "/de"', 'GET /de is 200, html lang is "de", hreflang links present', 'GET /en is 200, html lang is "en", hreflang links present', "the contact row (#contact) exists on every language route, holds no form and has the e-mail link", "deployed version (/version.json)"]);
    expect(failing(r)).toEqual([]);
  });

  it("adds nothing when the local product has no language information", async () => {
    expect(await run(GOOD)).toHaveLength(9);
  });

  it("fails when / does not redirect, redirects elsewhere, or has no location", async () => {
    expect(failing(await runLang(TWO, redirectingFetch(TWO, "/en")))).toEqual(['"/" redirects to "/de"']);
    expect(failing(await runLang(TWO, redirectingFetch(TWO, null)))).toEqual(['"/" redirects to "/de"']);
    expect(failing(await runLang(TWO, redirectingFetch(TWO, "/de", 200)))).toEqual(['"/" redirects to "/de"']);
    expect((await runLang(TWO, redirectingFetch(TWO, "/de", 200))).find((x) => !x.ok)!.reason).toContain("status 200");
  });

  it("accepts an absolute Location on the site's own host", async () => {
    expect(failing(await runLang(TWO, redirectingFetch(TWO, "https://site.example/de")))).toEqual([]);
  });

  it("fails a language route that is 404, has the wrong html lang, lacks hreflang links or a canonical", async () => {
    const name = (l: string) => `GET /${l} is 200, html lang is "${l}", hreflang links present`;
    expect(failing(await runLang({ ...TWO, "/en": { status: 404 } }))).toEqual([name("en")]);
    expect(failing(await runLang({ ...TWO, "/en": { body: langPage("en", { lang: "de" }), headers: NOINDEX } }))).toEqual([name("en")]);
    expect(failing(await runLang({ ...TWO, "/de": { body: langPage("de", { links: alt(["de"], "de") }), headers: NOINDEX } }))).toEqual([name("de")]);
    expect(failing(await runLang({ ...TWO, "/de": { body: langPage("de", { links: alt(["de", "en"], "de").replace(/<link rel="alternate" hrefLang="x-default"[^>]*>/, "") }), headers: NOINDEX } }))).toEqual([name("de")]);
    expect(failing(await runLang({ ...TWO, "/de": { body: langPage("de", { canonical: "/en" }), headers: NOINDEX } }))).toEqual([name("de")]);
    const reasons = (await runLang({ ...TWO, "/en": { body: langPage("en", { lang: "de", links: "" }), headers: NOINDEX } })).find((x) => !x.ok)!.reason;
    expect(reasons).toContain('html lang is "de"');
    expect(reasons).toContain("no hreflang link for: de, en, x-default");
  });

  const CONTACT = "the contact row (#contact) exists on every language route, holds no form and has the e-mail link";

  it("fails the contact check when the contact element holds a form (the form belongs in the dialog)", async () => {
    const withForm = langPage("en").replace('data-block="contact">', 'data-block="contact"><form><input name="name"></form>');
    expect(failing(await runLang({ ...TWO, "/en": { body: withForm, headers: NOINDEX } }))).toEqual([CONTACT]);
  });

  it("fails the contact check when the footer row has no e-mail link", async () => {
    const noMail = langPage("en").replace('<a href="mailto:a@b.co">a@b.co</a>', "a@b.co");
    const r = await runLang({ ...TWO, "/en": { body: noMail, headers: NOINDEX } });
    expect(failing(r)).toEqual([CONTACT]);
  });

  it("finds the e-mail link and the form only inside the contact element (nested tags of the same kind are matched)", () => {
    expect(contactRow('<div id="contact"><div><a href="MAILTO:a@b.co">a</a></div><div></div></div><form></form>')).toBe(true); // the form is outside
    expect(contactRow('<div id="contact"><div><a href="mailto:a@b.co">a</a></div><div><input></div></div>')).toBe(false);
    expect(contactRow('<footer><a href="mailto:a@b.co">a</a></footer><div id="contact"></div>')).toBe(false); // the link is outside
    expect(contactRow("<p>nothing</p>")).toBe(false);
  });

  it("fails the contact check, naming the routes, when a language route has no #contact element", async () => {
    const r = await runLang({ ...TWO, "/en": { body: langPage("en", { noContact: true }), headers: NOINDEX } });
    expect(failing(r)).toEqual([CONTACT]);
    expect(r.find((x) => !x.ok)!.reason).toBe("no form-free #contact with the e-mail link on: /en");
    expect(failing(await runLang({ ...TWO, "/de": { status: 404 }, "/en": { body: langPage("en", { noContact: true }), headers: NOINDEX } }))).toContain(CONTACT);
  });

  it("checks the title in each language when the command passes it", async () => {
    const titles = { de: "Titel DE", en: "Title EN" };
    const routes = { ...TWO, "/de": { body: langPage("de", { title: "x" }).replace("<h1>", "<h1>Titel DE "), headers: NOINDEX }, "/en": { body: langPage("en"), headers: NOINDEX } };
    expect(failing(await runLang(routes, undefined, { ...multi, titles }))).toEqual(['GET /en is 200, html lang is "en", hreflang links present']);
  });
});
