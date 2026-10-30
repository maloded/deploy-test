"use client";

import { StatusPage } from "@/components/StatusPage";
import { statusText } from "@/lib/status-texts";
import type { Language } from "@/lib/languages";
import "./globals.css";

// An error in the root layout itself: this page replaces the whole document, so it brings its own <html> and the theme. It has no site to
// read at run time; the brand, the default language and the theme are inlined by next.config.ts (siteStatusEnv). It never shows the error.
const LANG = (process.env.SITE_DEFAULT_LANGUAGE || "en") as Language;
const BRAND = process.env.SITE_BRAND || "";
const THEME = process.env.SITE_THEME || "";

export default function GlobalError({ reset }: { error: unknown; reset: () => void }) {
  return (
    <html lang={LANG} data-theme={THEME || undefined}>
      <head>
        {THEME && <link rel="stylesheet" href={`/themes/${THEME}.css`} />}
        <title>{statusText("error.title", LANG)}</title>
      </head>
      <body>
        <StatusPage noindex brand={BRAND} title={statusText("error.title", LANG)} text={statusText("error.text", LANG)} homeHref={`/${LANG}`} homeLabel={statusText("page.back", LANG)}>
          <button type="button" className="button button--outline" onClick={() => reset()}>
            {statusText("error.retry", LANG)}
          </button>
        </StatusPage>
      </body>
    </html>
  );
}
