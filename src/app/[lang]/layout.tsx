import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { StatusProvider } from "@/components/StatusContext";
import { metadataRobots } from "@/lib/indexing";
import { isLanguage } from "@/lib/languages";
import { pick } from "@/lib/i18n";
import { OG_HEIGHT, OG_WIDTH, ogImagePath } from "@/lib/og-image";
import { sellerIconHref } from "@/lib/seller-icon";
import { socialMeta } from "@/lib/social-meta";
import { themeColor } from "@/lib/theme-color";
import { siteUrl } from "@/lib/site-url";
import { getSite, themeSwitcherEnabled } from "@/lib/site";
import { ui } from "@/lib/ui-strings";
import "../globals.css";

/** Only the seller's languages exist as routes; any other /<lang> is a 404. */
export const dynamicParams = false;

export function generateStaticParams() {
  return getSite(null, null).product.languages.map((lang) => ({ lang }));
}

type Params = { params: Promise<{ lang: string }> };

/** The site for the route's language, or a 404 for a language the seller does not offer. */
async function siteFor(params: Params["params"], themeOverride: string | null = null) {
  const { lang } = await params;
  // Safety net, unreachable while `dynamicParams = false` (above): a language the seller does not offer is answered with the branded 404
  // (src/app/global-not-found.tsx) before this layout runs. If that flag is ever changed, this path returns Next's DEFAULT 404 body (English,
  // no seller name), not the branded page: a notFound() thrown from the root layout is not caught by global-not-found (verified with a build).
  if (!isLanguage(lang) || !getSite(null, null).product.languages.includes(lang)) notFound();
  return getSite(lang, themeOverride);
}

/** theme-color: the theme's own page background (its --bg token), so the phone's address bar matches the page; none when the theme has no plain colour. */
export async function generateViewport({ params }: Params): Promise<Viewport> {
  const { theme } = await siteFor(params);
  const color = themeColor(theme);
  return color ? { themeColor: color } : {};
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { product, lang, seller, ref } = await siteFor(params);
  const icon = sellerIconHref(); // the seller's own icon file, when it has one: no icon, no <link rel="icon"> (the browser asks /favicon.ico and gets a 404, which is harmless)
  // the OG image: gallery photo 1 cut to 1200x630 by `npm run images`, with the photo's own alt text; only with an origin (a relative og:image is useless) and only when the file exists
  const ogPath = ogImagePath(ref);
  const first = product.media.gallery?.[0];
  const image = siteUrl() && ogPath && first ? { url: ogPath, width: OG_WIDTH, height: OG_HEIGHT, alt: pick(first.alt, lang) } : null;
  const base = siteUrl(); // SITE_URL: absolute canonical and hreflang links; unset while the site is noindex
  return {
    ...(base ? { metadataBase: base } : {}),
    title: pick(product.title, lang),
    description: pick(product.tagline, lang),
    ...socialMeta({ lang, languages: product.languages, title: pick(product.title, lang), description: pick(product.tagline, lang), siteName: seller.displayName, withUrl: base !== null, image }),
    // canonical plus hreflang for every language, x-default for the default one
    alternates: {
      canonical: `/${lang}`,
      languages: { ...Object.fromEntries(product.languages.map((l) => [l, `/${l}`])), "x-default": `/${product.defaultLanguage}` },
    },
    robots: metadataRobots(), // noindex unless SITE_INDEXABLE=1 (src/lib/indexing.ts)
    ...(icon ? { icons: { icon: [{ url: icon.href, type: icon.type }] } } : {}),
  };
}

export default async function RootLayout({ children, params }: { children: React.ReactNode } & Params) {
  // Reading headers makes the page dynamic, so it is done only when the theme switcher exists
  // (development, or REVIEW_THEME_SWITCHER=1 for a review).
  const override = themeSwitcherEnabled() ? ((await headers()).get("x-theme-override") ?? null) : null;
  const { theme, lang, seller } = await siteFor(params, override);

  return (
    <html lang={lang} data-theme={theme}>
      <head>
        <link rel="stylesheet" href={`/themes/${theme}.css`} />
      </head>
      <body>
        {/* the error boundary (error.tsx) is a client component: it gets only the few strings of the error page, not the UI string bundle */}
        <StatusProvider value={{ lang, brand: seller.displayName, homeHref: `/${lang}`, title: ui("error.title", lang), text: ui("error.text", lang), retry: ui("error.retry", lang), back: ui("page.back", lang) }}>
          {children}
        </StatusProvider>
      </body>
    </html>
  );
}
