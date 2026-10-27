import { cache } from "react";
import { loadProduct } from "./content";
import type { Language } from "./languages";
import { coverageLine } from "./localized";
import { contentProduct, contentRoot } from "./content-root";
import { reviewSwitcherEnabled } from "./review";
import { listThemes, resolveTheme } from "./themes";

/** Products whose translation coverage the production build has already logged (each build worker logs a product once). */
const reported = new Set<string>();

export const isDev = process.env.NODE_ENV !== "production";

/** The theme switcher (and the ?theme= override) exist in development, and in production only for a review. */
export const themeSwitcherEnabled = () => isDev || reviewSwitcherEnabled();

/**
 * Product, theme and page language for a request. `lang` is the route's language (default: the seller's default language);
 * it must be one of the seller's languages. `refOverride` ("<seller>/<product>") and `contentDir` are for tests; the app
 * uses CONTENT_DIR (default ./content) and CONTENT_PRODUCT.
 */
export function buildSite(themeOverride: string | null, refOverride?: string, contentDir?: string, lang?: Language) {
  const root = contentDir ?? contentRoot();
  const ref = refOverride ?? contentProduct(process.env, root);
  // In development a missing image shows a placeholder frame; in production it fails the build.
  const loaded = loadProduct(ref, { strictMedia: !isDev, contentDir: root });
  if (!isDev && !reported.has(ref)) {
    reported.add(ref);
    console.log(`translation coverage ${ref}: ${coverageLine(loaded.coverage)}`);
    for (const w of loaded.translationWarnings) console.warn(`translation: ${w}`);
  }
  const available = listThemes();
  const requested = themeSwitcherEnabled() && themeOverride ? themeOverride : loaded.product.theme;
  // production: an unknown ?theme= never throws, it falls back to the default theme
  const known = available.includes(requested);
  const { theme, warning } = resolveTheme(known || isDev ? requested : loaded.product.theme, { available, isDev });
  if (warning) console.warn(warning);
  const pageLang = lang ?? loaded.product.defaultLanguage;
  if (!loaded.product.languages.includes(pageLang)) throw new Error(`The seller does not offer "${pageLang}". Offered: ${loaded.product.languages.join(", ")}.`);
  return { ...loaded, theme, availableThemes: available, lang: pageLang };
}

/** Cached per request, so the layout and the page share one load. */
export const getSite = cache((lang: Language | null, themeOverride: string | null) => buildSite(themeOverride, undefined, undefined, lang ?? undefined));
