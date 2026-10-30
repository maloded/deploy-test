import { indexingAllowed } from "@/lib/indexing";
import { siteUrl } from "@/lib/site-url";
import { getSite } from "@/lib/site";
import { sitemapXml } from "@/lib/sitemap";

// Static (built with the site): a sitemap exists only while indexing is allowed (SITE_INDEXABLE=1, build time) and the origin is known; otherwise 404.
export const dynamic = "force-static";

export function GET() {
  const origin = siteUrl()?.origin;
  if (!indexingAllowed() || !origin) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const { product } = getSite(null, null);
  return new Response(sitemapXml({ origin, languages: product.languages, defaultLanguage: product.defaultLanguage }), { headers: { "content-type": "application/xml; charset=utf-8" } });
}
