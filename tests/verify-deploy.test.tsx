// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ProductLayout from "@/components/ProductLayout";
import {
  blockOrder,
  decodeEntities,
  footerText,
  hasNoindex,
  htmlLang,
  imageRefs,
  pageText,
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
<footer class="site-footer" id="contact"><p class="site-footer__name">Zorbo &amp; Co</p><p>Mail:&nbsp;<a href="mailto:a@b.co">a@b.co</a></p></footer></div></body></html>`;

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
    for (const id of order) expect(sectionIds(html), id).toContain(id);
    expect(footerText(html)).toContain(site.seller.displayName);
    expect(imageRefs(html).length).toBeGreaterThan(0);
  });
});

// ---- the checks, against a fake fetch -----------------------------------------------------------------------------

type Route = { status?: number; type?: string; body?: string; headers?: Record<string, string> };
const fakeFetch = (routes: Record<string, Route>, seen: { auth: (string | null)[] } = { auth: [] }) =>
  (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    seen.auth.push(new Headers(init?.headers).get("authorization"));
    const route = routes[url.pathname + url.search] ?? routes[url.pathname];
    if (!route) return new Response("nope", { status: 404, headers: { "content-type": "text/plain" } });
    return new Response(route.body ?? "", { status: route.status ?? 200, headers: { "content-type": route.type ?? "text/html", ...route.headers } });
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
    expect(r).toHaveLength(8);
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

  it("sends basic auth to the site only, never to another host", async () => {
    const seen = { auth: [] as (string | null)[] };
    const other = { ...GOOD, "/": { body: PAGE.replace("/plain.jpg", "https://cdn.example/x.jpg"), headers: { "x-robots-tag": "noindex" } } };
    const calls: [string, string | null][] = [];
    const f = fakeFetch(other as Record<string, Route>, seen);
    const spy = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push([new URL(String(input)).host, new Headers(init?.headers).get("authorization")]);
      return f(input, init);
    }) as typeof fetch;
    await verifyDeploy({ url: "https://site.example/", expected, auth: "user:pw", fetchImpl: spy });
    const own = calls.filter(([h]) => h === "site.example");
    expect(own.length).toBeGreaterThan(3);
    expect(own.every(([, a]) => a === `Basic ${Buffer.from("user:pw").toString("base64")}`)).toBe(true);
    expect(calls.filter(([h]) => h === "cdn.example").every(([, a]) => a === null)).toBe(true);
    expect(calls.some(([h]) => h === "cdn.example")).toBe(true);
  });
});
