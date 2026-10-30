import type { Metadata } from "next";
import { StatusPage } from "@/components/StatusPage";
import { languageEntry } from "@/lib/languages";
import { sellerIconHref } from "@/lib/seller-icon";
import { getSite } from "@/lib/site";
import { ui } from "@/lib/ui-strings";
import "./globals.css";

/**
 * The 404 page for every URL that no route answers (/nonexistent, /de/nonexistent, a language the seller does not offer): the root layout lives in
 * [lang], so there is no layout to compose a 404 from and Next's experimental global-not-found is used (next.config.ts, experimental.globalNotFound).
 * It cannot know the visitor's language, so it speaks the seller's default language and links every language of the product and the product page.
 * noindex whatever SITE_INDEXABLE says: the status is 404 and the page says so too.
 */
export function generateMetadata(): Metadata {
  const site = getSite(null, null);
  const icon = sellerIconHref();
  return { title: `${ui("notfound.title", site.lang)} · ${site.seller.displayName}`, robots: { index: false, follow: false }, ...(icon ? { icons: { icon: [{ url: icon.href, type: icon.type }] } } : {}) };
}

export default function GlobalNotFound() {
  const site = getSite(null, null);
  const { lang, theme } = site;
  return (
    <html lang={lang} data-theme={theme}>
      <head>
        <link rel="stylesheet" href={`/themes/${theme}.css`} />
      </head>
      <body>
        <StatusPage
          brand={site.seller.displayName}
          title={ui("notfound.title", lang)}
          text={ui("notfound.text", lang)}
          homeHref={`/${lang}`}
          homeLabel={ui("page.back", lang)}
          languages={site.product.languages.map((code) => ({ code, name: languageEntry(code).name, href: `/${code}` }))}
          languageLabel={ui("lang.switch", lang)}
        />
      </body>
    </html>
  );
}
