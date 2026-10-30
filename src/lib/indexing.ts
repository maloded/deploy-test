// Self-contained like version.ts (next.config.ts imports it): the ONE switch for search-engine indexing.
// SITE_INDEXABLE=1 allows indexing; anything else (the default) keeps the whole site noindex. robots.txt, the layout's meta robots and
// the next.config headers are fixed when the site is BUILT, so the variable must be set for the build; the proxy reads it on every request.
// The 404 and error pages are noindex whatever this says (they set their own robots meta).

type Env = Record<string, string | undefined>;

/** The value of the noindex header and meta tag. */
export const NOINDEX = "noindex, nofollow, noarchive, nosnippet";

/** Whether the site may be indexed: SITE_INDEXABLE=1. */
export const indexingAllowed = (env: Env = process.env): boolean => env.SITE_INDEXABLE === "1";

/** The X-Robots-Tag value, or null when indexing is allowed (then no header at all). */
export const robotsHeader = (env: Env = process.env): string | null => (indexingAllowed(env) ? null : NOINDEX);

/** The `robots` of the page metadata, or undefined when indexing is allowed (then no meta robots at all). */
export const metadataRobots = (env: Env = process.env) => (indexingAllowed(env) ? undefined : { index: false, follow: false, nocache: true, noarchive: true, nosnippet: true });

/** The robots.txt rules: disallow all by default; allow all when indexing is allowed, with a Sitemap line only when a sitemap URL is given (the sitemap exists only then, src/app/sitemap.xml/route.ts). */
export function robotsTxt(env: Env = process.env, sitemapUrl: string | null = null): { rules: { userAgent: string; allow?: string; disallow?: string }; sitemap?: string } {
  if (!indexingAllowed(env)) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/" }, ...(sitemapUrl ? { sitemap: sitemapUrl } : {}) };
}
