import type { MetadataRoute } from "next";

/** The whole site is for review: disallow all crawlers. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
