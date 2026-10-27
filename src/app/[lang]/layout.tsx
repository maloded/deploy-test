import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isLanguage } from "@/lib/languages";
import { pick } from "@/lib/i18n";
import { getSite, themeSwitcherEnabled } from "@/lib/site";
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
  if (!isLanguage(lang) || !getSite(null, null).product.languages.includes(lang)) notFound();
  return getSite(lang, themeOverride);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { product, lang } = await siteFor(params);
  return {
    title: pick(product.title, lang),
    description: pick(product.tagline, lang),
    // canonical plus hreflang for every language, x-default for the default one
    alternates: {
      canonical: `/${lang}`,
      languages: { ...Object.fromEntries(product.languages.map((l) => [l, `/${l}`])), "x-default": `/${product.defaultLanguage}` },
    },
    robots: { index: false, follow: false, nocache: true, noarchive: true, nosnippet: true },
  };
}

export default async function RootLayout({ children, params }: { children: React.ReactNode } & Params) {
  // Reading headers makes the page dynamic, so it is done only when the theme switcher exists
  // (development, or REVIEW_THEME_SWITCHER=1 for a review).
  const override = themeSwitcherEnabled() ? ((await headers()).get("x-theme-override") ?? null) : null;
  const { theme, lang } = await siteFor(params, override);

  return (
    <html lang={lang} data-theme={theme}>
      <head>
        <link rel="stylesheet" href={`/themes/${theme}.css`} />
      </head>
      <body>{children}</body>
    </html>
  );
}
