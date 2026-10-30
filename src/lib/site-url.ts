// Self-contained like indexing.ts (next.config.ts imports it): the site's public origin, SITE_URL (for example https://www.example.com).
// It becomes `metadataBase`, so canonical, hreflang, Open Graph and the sitemap carry absolute URLs. Optional while the site is noindex;
// required (and checked at build time by next.config.ts) once SITE_INDEXABLE=1 allows indexing.
import { indexingAllowed } from "./indexing.ts";

type Env = Record<string, string | undefined>;

/** A configuration mistake in SITE_URL; the message says what to do. */
export class SiteUrlError extends Error {}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The origin SITE_URL names, or null when it is not set. Throws SiteUrlError for a value that is not a bare origin. */
export function siteUrl(env: Env = process.env): URL | null {
  const raw = env.SITE_URL?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SiteUrlError(`SITE_URL "${raw}" is not a URL. Set it to the site's full origin, for example https://www.example.com`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new SiteUrlError(`SITE_URL "${raw}" must start with https:// (or http:// for a local test).`);
  if (url.username || url.password || (url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) {
    throw new SiteUrlError(`SITE_URL "${raw}" must be an origin only (scheme and host, no path, query or credentials), for example https://www.example.com`);
  }
  if (url.protocol === "http:" && indexingAllowed(env) && !LOCAL_HOSTS.has(url.hostname)) {
    throw new SiteUrlError(`SITE_URL "${raw}" must be https:// when SITE_INDEXABLE=1 (http is only accepted for localhost).`);
  }
  return new URL(url.origin);
}

/** Throws SiteUrlError when the site may be indexed and SITE_URL is missing or wrong; with SITE_INDEXABLE unset a missing SITE_URL is fine. */
export function assertSiteUrl(env: Env = process.env): void {
  const url = siteUrl(env);
  if (indexingAllowed(env) && !url) {
    throw new SiteUrlError("SITE_INDEXABLE=1 needs SITE_URL: set SITE_URL to the site's full origin (for example https://www.example.com) for the build. Canonical links, the sitemap and the structured data must be absolute.");
  }
}
