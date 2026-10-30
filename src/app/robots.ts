import type { MetadataRoute } from "next";
import { indexingAllowed, robotsTxt } from "@/lib/indexing";
import { siteUrl } from "@/lib/site-url";

/** Disallow all crawlers, unless SITE_INDEXABLE=1 (build time); then it allows crawling and names the sitemap (which exists only then, see sitemap.xml/route.ts). */
export default function robots(): MetadataRoute.Robots {
  const origin = siteUrl()?.origin;
  return robotsTxt(process.env, indexingAllowed() && origin ? `${origin}/sitemap.xml` : null);
}
