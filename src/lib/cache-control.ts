// Self-contained like indexing.ts (next.config.ts imports it): what a browser and a CDN may keep of the pages.
//
// Next.js sends a prerendered page with `s-maxage=31536000` (one year). That is right for a platform that purges its cache on every deploy, and wrong for a site
// behind a CDN that does not: the CDN would go on serving the OLD page (which names chunk files the new build no longer has) for up to a year. The pages (and the few
// files generated at build time that change with a deployment) therefore say how long they may be kept:
//   max-age=0                      a browser asks again every time (the server answers 304 when nothing changed, which costs almost nothing for a static page);
//   s-maxage=60                    a shared cache (a CDN) may serve it for a minute without asking;
//   stale-while-revalidate=60      and for one more minute while it fetches the fresh copy in the background; after that it must ask.
// So a deployment is visible everywhere within about two minutes. The pages are the same for every visitor (no cookie, no per-person content), which is why `public`
// is right. Files with a hash in their name (/_next/static/..., the optimizer's /_next/image answers) keep Next.js's own `public, max-age=31536000, immutable`:
// this module does not touch them.

/** The Cache-Control of an HTML page and of the files generated at build time. */
export const PAGE_CACHE_CONTROL = "public, max-age=0, s-maxage=60, stale-while-revalidate=60";

/** The routes with that header: the language pages ("/de", "/de/") and the generated files. Everything else (the hashed assets, /media, /api) is left alone. */
export const PAGE_CACHE_SOURCES = ["/:lang([a-z]{2})", "/:lang([a-z]{2})/", "/robots.txt", "/sitemap.xml", "/version.json"] as const;

/** The entries for `headers()` in next.config.ts. */
export const cacheHeaders = () => PAGE_CACHE_SOURCES.map((source) => ({ source, headers: [{ key: "Cache-Control", value: PAGE_CACHE_CONTROL }] }));
