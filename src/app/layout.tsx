import type { Metadata } from "next";
import { headers } from "next/headers";
import { getSite, themeSwitcherEnabled } from "@/lib/site";
import { pick } from "@/lib/i18n";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { product } = getSite(null);
  const lang = product.defaultLanguage;
  return {
    title: pick(product.title, lang),
    description: pick(product.tagline, lang),
    robots: { index: false, follow: false, nocache: true, noarchive: true, nosnippet: true },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading headers makes the page dynamic, so it is done only when the theme switcher exists
  // (development, or REVIEW_THEME_SWITCHER=1 for a review).
  const override = themeSwitcherEnabled() ? ((await headers()).get("x-theme-override") ?? null) : null;
  const { product, theme } = getSite(override);

  return (
    <html lang={product.defaultLanguage} data-theme={theme}>
      <head>
        <link rel="stylesheet" href={`/themes/${theme}.css`} />
      </head>
      <body>{children}</body>
    </html>
  );
}
