import { NextResponse, type NextRequest } from "next/server";
import { robotsHeader } from "@/lib/indexing";
import { reviewSwitcherEnabled } from "@/lib/review";

/**
 * Runs before every request (pages, images, static files, API):
 * - "/" is redirected (307) to "/<defaultLanguage>", keeping the query string. This is done here and not with a redirect
 *   rule of next.config, because those answer before the proxy and would carry no X-Robots-Tag.
 *   The language is SITE_DEFAULT_LANGUAGE, inlined by next.config.ts at build time; the pages stay static.
 * - X-Robots-Tag: noindex on every response, unless SITE_INDEXABLE=1 (src/lib/indexing.ts).
 * - Development (and REVIEW_THEME_SWITCHER=1): forwards ?theme=<name> to the root layout, which cannot read
 *   search params.
 */
export function proxy(request: NextRequest) {
  const defaultLanguage = process.env.SITE_DEFAULT_LANGUAGE;
  if (defaultLanguage && request.nextUrl.pathname === "/") {
    const target = request.nextUrl.clone();
    target.pathname = `/${defaultLanguage}`;
    const redirect = NextResponse.redirect(target, 307);
    const robots = robotsHeader();
    if (robots) redirect.headers.set("X-Robots-Tag", robots);
    return redirect;
  }

  const switcher = process.env.NODE_ENV !== "production" || reviewSwitcherEnabled();
  const theme = switcher ? request.nextUrl.searchParams.get("theme") : null;
  const headers = new Headers(request.headers);
  if (theme) headers.set("x-theme-override", theme);
  const response = NextResponse.next({ request: { headers } });
  const robots = robotsHeader();
  if (robots) response.headers.set("X-Robots-Tag", robots);
  return response;
}

// no matcher: it runs for every request, including _next/static, _next/image and the files in public/
