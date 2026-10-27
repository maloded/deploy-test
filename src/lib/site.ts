import { cache } from "react";
import { loadProduct } from "./content";
import { contentProduct, contentRoot } from "./content-root";
import { reviewSwitcherEnabled } from "./review";
import { listThemes, resolveTheme } from "./themes";

export const isDev = process.env.NODE_ENV !== "production";

/** The theme switcher (and the ?theme= override) exist in development, and in production only for a review. */
export const themeSwitcherEnabled = () => isDev || reviewSwitcherEnabled();

/** Product and theme for a request. `refOverride` ("<seller>/<product>") and `contentDir` are for tests; the app uses CONTENT_DIR (default ./content) and CONTENT_PRODUCT. */
export function buildSite(themeOverride: string | null, refOverride?: string, contentDir?: string) {
  const root = contentDir ?? contentRoot();
  const ref = refOverride ?? contentProduct(process.env, root);
  // In development a missing image shows a placeholder frame; in production it fails the build.
  const loaded = loadProduct(ref, { strictMedia: !isDev, contentDir: root });
  const available = listThemes();
  const requested = themeSwitcherEnabled() && themeOverride ? themeOverride : loaded.product.theme;
  // production: an unknown ?theme= never throws, it falls back to the default theme
  const known = available.includes(requested);
  const { theme, warning } = resolveTheme(known || isDev ? requested : loaded.product.theme, { available, isDev });
  if (warning) console.warn(warning);
  return { ...loaded, theme, availableThemes: available };
}

/** Cached per request, so the layout and the page share one load. */
export const getSite = cache((themeOverride: string | null) => buildSite(themeOverride));
