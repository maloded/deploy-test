import type { NextConfig } from "next";
import { robotsHeader } from "./src/lib/indexing.ts";
import { assertSiteUrl } from "./src/lib/site-url.ts";
import { leadContextEnv } from "./src/lib/lead-context.ts";
import { rootRedirectEnv, siteStatusEnv } from "./src/lib/root-redirect.ts";
import { versionEnv } from "./src/lib/version.ts";

// SITE_INDEXABLE=1 without a valid SITE_URL stops the build here, with a message that says what to set
assertSiteUrl();

const nextConfig: NextConfig = {
  // 75 is the default; 85 is used by the hero image (see Hero.tsx)
  images: { qualities: [75, 85] },
  // the 404 page for every unmatched URL: the root layout is in [lang], so there is none to compose it from (src/app/global-not-found.tsx)
  experimental: { globalNotFound: true },
  // the seller's default language, inlined for the proxy, which sends "/" to "/<defaultLanguage>" (no Accept-Language negotiation)
  env: { ...rootRedirectEnv(), ...siteStatusEnv(), ...leadContextEnv(), ...versionEnv() }, // and the lead API's context (product, languages, consent text hashes), and the snapshot's version.json
  // belt and braces: noindex on every response, also for files the proxy does not handle (none with SITE_INDEXABLE=1, set at build time)
  async headers() {
    const robots = robotsHeader();
    return robots ? [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: robots }] }] : [];
  },
};

export default nextConfig;
