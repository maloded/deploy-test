import { NextResponse, type NextRequest } from "next/server";
import { basicAuthOk, reviewPassword, reviewSwitcherEnabled } from "@/lib/review";

const ROBOTS = "noindex, nofollow, noarchive, nosnippet";

/**
 * Runs before every request (pages, images, static files, API):
 * - REVIEW_PASSWORD set: HTTP Basic auth with any user name; otherwise 401. Nothing is logged.
 *   /robots.txt is the one exception, so crawlers read "disallow all" instead of an error.
 * - X-Robots-Tag: noindex on every response.
 * - Development (and REVIEW_THEME_SWITCHER=1): forwards ?theme=<name> to the root layout, which cannot read
 *   search params.
 */
export function proxy(request: NextRequest) {
  const password = reviewPassword();
  if (password && request.nextUrl.pathname !== "/robots.txt" && !basicAuthOk(request.headers.get("authorization"), password)) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Review", charset="UTF-8"',
        "X-Robots-Tag": ROBOTS,
        "Cache-Control": "private, no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  const switcher = process.env.NODE_ENV !== "production" || reviewSwitcherEnabled();
  const theme = switcher ? request.nextUrl.searchParams.get("theme") : null;
  const headers = new Headers(request.headers);
  if (theme) headers.set("x-theme-override", theme);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("X-Robots-Tag", ROBOTS);
  if (password) response.headers.set("Cache-Control", "private, no-store");
  return response;
}

// no matcher: it runs for every request, including _next/static, _next/image and the files in public/
