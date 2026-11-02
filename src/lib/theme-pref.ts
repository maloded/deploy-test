// The visitor's light/dark choice. The two bundled themes are the two modes: light-editorial is "light", dark-premium is
// "dark". Pure data and functions with no Node imports: the layout, the toggle and the inline head script all use them.
//
// Which theme a page starts in: the visitor's stored choice (an explicit click on the toggle); else the product's own theme.
// The system preference (prefers-color-scheme) is deliberately NOT read: the seller chose the product's theme. The stored value
// is the MODE ("light" or "dark"), not a theme name, so it still means something when the product's theme is changed.

export const THEME_PAIR = { light: "light-editorial", dark: "dark-premium" } as const;
export type ThemeMode = keyof typeof THEME_PAIR;
export type ThemePair = Record<ThemeMode, string>;

/** localStorage key of the visitor's choice. Only "light" or "dark" is ever stored. */
export const THEME_STORAGE_KEY = "theme-mode";
export const THEMES_URL = "/themes/";

/** The pair, when the product's theme is one of the two and both stylesheets exist; null otherwise (then there is nothing to toggle). */
export function themePair(theme: string, available: readonly string[]): ThemePair | null {
  if (theme !== THEME_PAIR.light && theme !== THEME_PAIR.dark) return null;
  return available.includes(THEME_PAIR.light) && available.includes(THEME_PAIR.dark) ? { ...THEME_PAIR } : null;
}

export function modeOf(theme: string, pair: ThemePair): ThemeMode | null {
  return theme === pair.light ? "light" : theme === pair.dark ? "dark" : null;
}

export function parseMode(value: unknown): ThemeMode | null {
  return value === "light" || value === "dark" ? value : null;
}

/** The theme to start in: the stored choice, else the product's theme (never the system preference). */
export function chooseTheme({ stored, product, pair }: { stored: ThemeMode | null; product: string; pair: ThemePair }): string {
  return stored ? pair[stored] : product;
}

type Store = Pick<Storage, "getItem" | "setItem">;

/** Reads the stored choice; a blocked or missing storage is "no choice". */
export function readStoredMode(storage: Store | undefined): ThemeMode | null {
  try {
    return parseMode(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Stores the choice; a blocked storage is ignored (the choice then lasts for this page view only). */
export function writeStoredMode(storage: Store | undefined, mode: ThemeMode): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // private window, blocked site data
  }
}

/**
 * The inline script for the document head. It runs before the first paint: when the visitor's STORED choice differs from the
 * theme the server rendered, it sets data-theme on <html> and writes the other theme's stylesheet link in place, so the
 * page never shows the wrong theme. When nothing differs it does nothing and loads nothing extra. The stylesheet of the
 * theme that was not needed is never requested by the toggle until the first click.
 *
 * Skipped when the address has ?theme= (the development and review override). Any failure leaves the server's theme.
 * Written as a string built from the constants above so the script and the toggle cannot drift apart; tests run it.
 */
export function themeBootScript(product: string, pair: ThemePair): string {
  const k = JSON.stringify(THEME_STORAGE_KEY);
  const p = JSON.stringify(pair);
  return (
    `(function(){try{` +
    `if(/[?&]theme=/.test(location.search))return;` +
    `var P=${p},m=null;` +
    `try{var s=localStorage.getItem(${k});if(s==="light"||s==="dark")m=s}catch(e){}` +
    `var t=m?P[m]:${JSON.stringify(product)};` +
    `if(t===${JSON.stringify(product)})return;` +
    `document.documentElement.setAttribute("data-theme",t);` +
    `document.write('<link rel="stylesheet" href="${THEMES_URL}'+t+'.css" data-theme-css="'+t+'">')` +
    `}catch(e){}})()`
  );
}
